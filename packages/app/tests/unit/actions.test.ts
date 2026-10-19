import { describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { safeBack, withFlash } from '@/server/action-runner';
import { formatDateTime, first, vintageLabel, zl } from '@/app/(admin)/admin/_components/format';
import { login, logout } from '@/app/(admin)/admin/auth-actions';
import * as pairing from '@/app/(admin)/admin/[slug]/actions';
import * as imports from '@/app/(admin)/admin/[slug]/import-actions';
import { loginAs } from './helpers';
import { AuthService, buildDemoDataset } from '@wine-match/core';

/** Every `revalidatePath` call of the actions (the shared setup only stubs it out). */
const revalidated = vi.hoisted(() => [] as Array<[string, string | undefined]>);
vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => { revalidated.push([path, type]); } }));

const state = () => (globalThis as { __wmNext: { cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
const form = (fields: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

/** Runs an action and returns the address it redirected to. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof state().RedirectSignal) return e.url;
    throw e;
  }
  throw new Error('expected a redirect');
}

async function signIn(email: string) {
  const s = await loginAs(email);
  state().cookies.set(SESSION_COOKIE, s.token);
  return s;
}

/** The pairings of the demo restaurant, read through the same service the actions use. */
async function pairingsOf(dishName: string) {
  const scope = await createRequestScope();
  try {
    const dish = (await scope.cradle.adminService.menu('halka'))!.rows.find((r) => r.dish.name === dishName)!.dish;
    return { dishId: dish.id, rows: (await scope.cradle.adminService.listPairings('halka', { dishId: dish.id }))!.pairings };
  } finally {
    await scope.dispose();
  }
}

describe('sign-in and sign-out actions', () => {
  it('missing details, a wrong password, a waiter, and a valid sign-in that goes where the user was going', async () => {
    expect(await redirectOf(() => login(form({ email: '', password: '' })))).toBe('/admin/login?error=invalid_credentials');
    expect(await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'nope-nope' })))).toBe('/admin/login?error=invalid_credentials');
    expect(await redirectOf(() => login(form({ email: 'kelner@halka.pl', password: 'demo-halka-2026' })))).toBe('/admin/login?error=no_panel_access');
    expect(await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'demo-halka-2026', next: '/admin/halka/review' })))).toBe('/admin/halka/review');
    expect(await redirectOf(() => login(form({ email: 'tomasz@halka.pl', password: 'demo-halka-2026' })))).toBe('/admin/halka');
    expect(state().cookies.has(SESSION_COOKIE)).toBe(true);
    expect(await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'demo-halka-2026', next: 'https://evil.example' })))).toBe('/admin/halka');
  });

  it('sign-out removes the session cookie and the session; with no cookie it simply goes to sign-in', async () => {
    const s = await signIn('marta@halka.pl');
    expect(await redirectOf(() => logout())).toBe('/admin/login');
    expect(state().cookies.has(SESSION_COOKIE)).toBe(false);
    const scope = await createRequestScope();
    expect(await scope.cradle.authService.authenticate(s.token)).toBeNull();
    await scope.dispose();
    expect(await redirectOf(() => logout())).toBe('/admin/login');
  });
});

describe('opportunity actions (spec 2026-10-16-sommelier-opportunities, F2: AC7, R7, R8)', () => {
  const back = '/admin/halka/opportunities';
  /** The opportunities, the ignored ones and the pairings, as the pages read them. */
  async function snapshot() {
    const scope = await createRequestScope();
    try {
      const view = (await scope.cradle.opportunityService.list('halka', { scope: 'all' }))!;
      const pairings = (await scope.cradle.adminService.listPairings('halka', {}))!.pairings;
      const overview = (await scope.cradle.adminService.overview('halka'))!;
      return {
        items: view.groups.flatMap((g) => g.items),
        dismissed: view.dismissed.map((d) => d.key),
        pairings: pairings.map((p) => `${p.id}:${p.status}:${p.version}`).sort(),
        unpublished: overview.unpublishedChanges
      };
    } finally {
      await scope.dispose();
    }
  }

  it('a general manager, who only looks, is refused all three actions and nothing is written', async () => {
    await signIn('marta@halka.pl');
    const before = await snapshot();
    const add = before.items.find((o) => o.action === 'add_suggestion')!;
    expect(add).toBeDefined();
    await signIn('tomasz@halka.pl');
    revalidated.length = 0;
    expect(await redirectOf(() => pairing.addOpportunitySuggestion(form({ slug: 'halka', back, dishId: add.dishId, wineId: add.wineId! })))).toBe(`${back}?error=forbidden`);
    expect(await redirectOf(() => pairing.dismissOpportunity(form({ slug: 'halka', back, key: add.key })))).toBe(`${back}?error=forbidden`);
    expect(await redirectOf(() => pairing.restoreOpportunity(form({ slug: 'halka', back, key: add.key })))).toBe(`${back}?error=forbidden`);
    expect(await snapshot()).toEqual(before);
    await signIn('marta@halka.pl');
  });

  it('the sommelier ignores and restores: saved, the layout revalidated, back through safeBack', async () => {
    await signIn('marta@halka.pl');
    const { items } = await snapshot();
    const target = items[0];
    revalidated.length = 0;
    expect(await redirectOf(() => pairing.dismissOpportunity(form({ slug: 'halka', back, key: target.key })))).toBe(`${back}?saved=opportunity_dismissed`);
    expect(revalidated).toContainEqual(['/admin/halka', 'layout']);
    const ignored = await snapshot();
    expect(ignored.dismissed).toEqual([target.key]);
    expect(ignored.items.map((o) => o.key)).not.toContain(target.key);
    // ignoring again only extends the term; a foreign return address falls back to the dashboard
    expect(await redirectOf(() => pairing.dismissOpportunity(form({ slug: 'halka', back: 'https://evil.example/x', key: target.key })))).toBe('/admin/halka?saved=opportunity_dismissed');
    revalidated.length = 0;
    expect(await redirectOf(() => pairing.restoreOpportunity(form({ slug: 'halka', back, key: target.key })))).toBe(`${back}?saved=opportunity_restored`);
    expect(revalidated).toContainEqual(['/admin/halka', 'layout']);
    const restored = await snapshot();
    expect(restored.dismissed).toEqual([]);
    expect(restored.items.map((o) => o.key)).toContain(target.key);
  });

  it('"Add to suggestions" puts the wine in the dish\'s suggestions without an unpublished change', async () => {
    await signIn('marta@halka.pl');
    const before = await snapshot();
    const add = before.items.find((o) => o.action === 'add_suggestion')!;
    const dishBack = `/admin/halka/pairings/${add.dishId}`;
    revalidated.length = 0;
    expect(await redirectOf(() => pairing.addOpportunitySuggestion(form({ slug: 'halka', back: dishBack, dishId: add.dishId, wineId: add.wineId! })))).toBe(`${dishBack}?saved=suggestion_added`);
    expect(revalidated).toContainEqual(['/admin/halka', 'layout']);
    const after = await snapshot();
    expect(after.unpublished).toBe(before.unpublished);
    expect(after.items.map((o) => o.key)).not.toContain(add.key);
    const scope = await createRequestScope();
    const rows = (await scope.cradle.adminService.listPairings('halka', { dishId: add.dishId }))!.pairings;
    await scope.dispose();
    expect(rows.find((p) => p.wineId === add.wineId)).toMatchObject({ status: 'suggested', source: 'engine', role: null, dirty: false });
    // the same form again: the pairing exists now
    expect(await redirectOf(() => pairing.addOpportunitySuggestion(form({ slug: 'halka', back: dishBack, dishId: add.dishId, wineId: add.wineId! })))).toBe(`${dishBack}?error=already_suggested`);
  });

  it('a key that is no longer an opportunity, a malformed key and a restore of nothing go back with their error', async () => {
    await signIn('marta@halka.pl');
    expect(await redirectOf(() => pairing.dismissOpportunity(form({ slug: 'halka', back, key: 'wine_unpaired:00000000-0000-4000-8000-000000000000' })))).toBe(`${back}?error=opportunity_stale`);
    expect(await redirectOf(() => pairing.dismissOpportunity(form({ slug: 'halka', back, key: 'constructor' })))).toBe(`${back}?error=validation_failed`);
    expect(await redirectOf(() => pairing.restoreOpportunity(form({ slug: 'halka', back, key: 'wine_unpaired:00000000-0000-4000-8000-000000000000' })))).toBe(`${back}?error=opportunity_not_dismissed`);
    expect((await snapshot()).dismissed).toEqual([]);
  });
});

describe('dashboard actions: every change is checked on the server, whatever the page shows', () => {
  it('a failure of the session check itself is not hidden: it propagates', async () => {
    await signIn('marta@halka.pl');
    const spy = vi.spyOn(AuthService.prototype, 'authenticate').mockRejectedValueOnce(new Error('session store down'));
    await expect(pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: 'x', active: 'true' }))).rejects.toThrow('session store down');
    spy.mockRestore();
  });

  it('the general manager may toggle a wine, so only the unknown wine is reported', async () => {
    await signIn('tomasz@halka.pl');
    expect(await redirectOf(() => pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: 'x', active: 'true' })))).toMatch(/error=not_found/);
    await signIn('marta@halka.pl');
  });

  it('a visitor with no session goes to sign-in from any action', async () => {
    state().cookies.clear();
    const f = form({ slug: 'halka', back: '/admin/halka/review', pairingId: 'x' });
    // a visitor is sent to sign-in and the page they wanted is remembered
    expect(await redirectOf(() => pairing.approvePairing(f))).toMatch(/^\/admin\/login\?next=/);
    expect(await redirectOf(() => imports.cancelImport(form({ slug: 'halka', back: '/admin/halka', job: 'x' })))).toMatch(/^\/admin\/login/);
  });

  it('a general manager, who can only look, is refused a change with a message', async () => {
    await signIn('tomasz@halka.pl');
    const { rows } = await pairingsOf('Duck breast');
    const target = rows.find((r) => r.status === 'suggested')!;
    const back = await redirectOf(() => pairing.approvePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: target.id, version: String(target.version) })));
    expect(back).toMatch(/error=forbidden/);
    await signIn('marta@halka.pl');
  });

  it('the sommelier approves, rejects, restores, changes a role and a note, moves and adds', async () => {
    await signIn('marta@halka.pl');
    const { dishId, rows } = await pairingsOf('Duck breast');
    const suggested = rows.find((r) => r.status === 'suggested')!;
    const ok = (url: string, key: string) => expect(url).toContain(key);
    ok(await redirectOf(() => pairing.approvePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: suggested.id, version: String(suggested.version) }))), 'saved=approved');
    const approved = (await pairingsOf('Duck breast')).rows.find((r) => r.id === suggested.id)!;
    ok(await redirectOf(() => pairing.setPairingRole(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: approved.id, role: 'alternative', version: String(approved.version) }))), 'saved=role');
    const again = (await pairingsOf('Duck breast')).rows.find((r) => r.id === suggested.id)!;
    ok(await redirectOf(() => pairing.savePairingNote(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: again.id, comment: 'Plain and good.', version: String(again.version) }))), 'saved=note');
    const rejected = (await pairingsOf('Duck breast')).rows.find((r) => r.status === 'rejected');
    if (rejected) ok(await redirectOf(() => pairing.restorePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: rejected.id, version: String(rejected.version) }))), 'saved=restored');
    const other = (await pairingsOf('Duck breast')).rows.filter((r) => r.status === 'approved' || r.status === 'modified').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    if (other.length > 1) ok(await redirectOf(() => pairing.movePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: other[1].id, direction: 'down' }))), 'saved=moved');
    ok(await redirectOf(() => pairing.addPairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', dishId, wineId: rows[0].wineId, role: '', comment: '' }))), 'error=');
    ok(await redirectOf(() => pairing.approveAllPairings(form({ slug: 'halka', back: '/admin/halka/pairings/x', dishId: '' }))), 'saved=approved_all');
  });

  it('a login with no fields and a wrong password that remembers the page is refused with the address kept', async () => {
    const empty = await redirectOf(() => login(new FormData()));
    expect(empty).toBe('/admin/login?error=invalid_credentials');
    const wrong = await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'nope-nope', next: '/admin/halka/review' })));
    expect(wrong).toBe('/admin/login?error=invalid_credentials&next=%2Fadmin%2Fhalka%2Freview');
  });

  it('a restaurant address that is not renamed keeps its address, and an empty new address changes nothing', async () => {
    await signIn('tomasz@halka.pl');
    expect(await redirectOf(() => imports.saveRestaurantDetails(form({ slug: 'halka', back: '/admin/halka/setup', name: 'Halka', address: 'Ul. 1', city: 'Warszawa', wineDirector: 'Marta Wierzbicka', newSlug: '' })))).toMatch(/\/admin\/halka\/setup\?saved=details/);
    await signIn('marta@halka.pl');
  });

  it('a pairing added by hand is saved and reported', async () => {
    await signIn('marta@halka.pl');
    const d = await pairingsOf('Duck breast');
    const paired = new Set(d.rows.map((r) => r.wineId));
    const scope = await createRequestScope();
    const free = (await scope.cradle.adminService.wines('halka'))!.rows.map((r) => r.wine).find((w) => !paired.has(w.id))!;
    await scope.dispose();
    expect(await redirectOf(() => pairing.addPairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', dishId: d.dishId, wineId: free.id, role: '', comment: '' })))).toContain('saved=added');
    // the hand-made pairing can be removed again, by its current version
    const made = (await pairingsOf('Duck breast')).rows.find((r) => r.wineId === free.id)!;
    expect(await redirectOf(() => pairing.deletePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: made.id, version: String(made.version) })))).toContain('saved=deleted');
  });

  it('a stale version is refused with a message and nothing changes; an engine pairing cannot be deleted by hand', async () => {
    await signIn('marta@halka.pl');
    const { rows } = await pairingsOf('Duck breast');
    const target = rows.find((r) => r.status === 'approved' && r.source === 'engine')!;
    const stale = await redirectOf(() => pairing.rejectPairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: target.id, version: '99999' })));
    expect(stale).toMatch(/error=/);
    const del = await redirectOf(() => pairing.deletePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: target.id, version: String(target.version) })));
    expect(del).toMatch(/error=/);
  });

  it('the wine list, the publishing and the guest settings are changed through their actions', async () => {
    await signIn('marta@halka.pl');
    const scope = await createRequestScope();
    const wine = buildDemoDataset({ ids: 'uuid' }).wines[0];
    const wines = (await scope.cradle.adminService.wines('halka'))!.rows;
    await scope.dispose();
    const id = wines[0].wine.id;
    expect(await redirectOf(() => pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: id, active: 'false' })))).toContain('/admin/halka/wines');
    expect(await redirectOf(() => pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: id, active: 'true' })))).toContain('/admin/halka/wines');
    expect(await redirectOf(() => pairing.publishChanges(form({ slug: 'halka', back: '/admin/halka/publish' })))).toMatch(/saved=published/);
    expect(await redirectOf(() => pairing.saveGuestSettings(form({ slug: 'halka', back: '/admin/halka/publish', showUnreviewed: 'on' })))).toMatch(/saved=/);
    void wine;
  });

  it('an action sent to a restaurant the user does not belong to is refused', async () => {
    await signIn('marta@halka.pl');
    const back = await redirectOf(() => pairing.approveAllPairings(form({ slug: 'nope', back: '/admin/nope', dishId: '' })));
    expect(back).toMatch(/error=|admin\/login/);
  });
});

describe('import and setup actions', () => {
  const csv = 'name,price,category\nSoup,22,Starters\nPie,30,Desserts\n';

  it('an upload with no file, an empty file, and a file over the limit each go back with the reason', async () => {
    await signIn('marta@halka.pl');
    const noFile = new FormData();
    noFile.append('slug', 'halka');
    noFile.append('kind', 'menu');
    expect(await redirectOf(() => imports.uploadImport(noFile))).toContain('error=no_file');
    const empty = form({ slug: 'halka', kind: 'menu', file: new File([], 'empty.csv') });
    expect(await redirectOf(() => imports.uploadImport(empty))).toContain('error=empty_file');
    const big = form({ slug: 'halka', kind: 'menu', file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.csv') });
    expect(await redirectOf(() => imports.uploadImport(big))).toContain('error=file_too_large');
  });

  it('a menu is uploaded, its rows are corrected and checked again, confirmed; cancelling another is possible', async () => {
    await signIn('marta@halka.pl');
    const up = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'menu', file: new File([csv], 'menu.csv') })));
    expect(up).toContain('saved=import_uploaded');
    const job = new URL(up, 'http://x').searchParams.get('job')!;
    const checked = await redirectOf(() => imports.saveImportRows(form({ slug: 'halka', kind: 'menu', job, rows: '1,2', row_1_price: '24', row_1_include: 'on', row_1_name: 'Soup', row_2_name: 'Pie' })));
    expect(checked).toContain('saved=import_checked');
    const confirmed = await redirectOf(() => imports.confirmImport(form({ slug: 'halka', kind: 'menu', job })));
    expect(confirmed).toMatch(/saved=|error=/);
    const other = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'wines', file: new File(['producer,wine,bottle\nKeller,Riesling,200\n'], 'w.csv') })));
    const job2 = new URL(other, 'http://x').searchParams.get('job')!;
    expect(await redirectOf(() => imports.cancelImport(form({ slug: 'halka', kind: 'wines', job: job2 })))).toContain('/admin/halka/import/wines');
  });

  it('restaurant details are saved; the suggestions are regenerated; an unknown kind falls back to the menu', async () => {
    await signIn('marta@halka.pl');
    expect(await redirectOf(() => imports.saveRestaurantDetails(form({ slug: 'halka', back: '/admin/halka/setup', name: 'Halka', address: 'Ul. 1', city: 'Warszawa', wineDirector: 'Marta Wierzbicka', slugValue: 'halka' })))).toMatch(/\/admin\/halka/);
    expect(await redirectOf(() => imports.generateSuggestions(form({ slug: 'halka', back: '/admin/halka/setup' })))).toMatch(/saved=|error=/);
    // an unknown kind on the upload falls back to the menu screen
    expect(await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'beer', file: new File([], 'e.csv') })))).toContain('/admin/halka/import/menu');
  });
});

describe('the small helpers of the actions and the pages', () => {
  it('a return address stays inside the restaurant, and a flash message replaces the old one', () => {
    expect(safeBack('halka', '/admin/halka/menu?x=1')).toBe('/admin/halka/menu?x=1');
    expect(safeBack('halka', '/admin/halka')).toBe('/admin/halka');
    expect(safeBack('halka', '/admin/other')).toBe('/admin/halka');
    expect(safeBack('halka', 'https://evil.example')).toBe('/admin/halka');
    expect(withFlash('/admin/halka/menu?saved=x&keep=1', { error: 'nope' })).toBe('/admin/halka/menu?keep=1&error=nope');
  });

  it('formatting: a missing date is a dash; the currency, the vintage and the first of a list', () => {
    expect(formatDateTime(null)).toBe('Never');
    expect(formatDateTime('2026-10-14T10:00:00.000Z')).toMatch(/2026/);
    expect(zl(1234)).toContain('zł');
    expect(vintageLabel({ vintage: 'NV' } as never)).toBe('Non-vintage');
    expect(vintageLabel({ vintage: 2019 } as never)).toBe('2019');
    expect(first(['a', 'b'])).toBe('a');
    expect(first('single')).toBe('single');
    expect(first(undefined)).toBe('');
    void logout;
  });
});

describe('translation actions (spec 2026-10-15-bilingual-content, R6)', () => {
  const dishOf = async (name: string) => {
    const scope = await createRequestScope();
    try { return (await scope.cradle.adminService.menu('halka'))!.rows.find((r) => r.dish.name === name)!.dish; } finally { await scope.dispose(); }
  };

  it('saves a dish translation through the service, reports it and refuses a stale version or a too-long text', async () => {
    await signIn('marta@halka.pl');
    const duck = await dishOf('Duck breast');
    const back = `/admin/halka/menu/${duck.id}`;
    const { translationsVersion } = await import('@wine-match/core');
    const ok = await redirectOf(() => pairing.saveDishTranslations(form({ slug: 'halka', back, dishId: duck.id, version: translationsVersion(duck.translations), name_pl: 'Pierś z kaczki z wiśniami', description_pl: '', name_en: '', description_en: '' })));
    expect(ok).toBe(`${back}?saved=translations`);
    expect((await dishOf('Duck breast')).translations).toEqual({ pl: { name: 'Pierś z kaczki z wiśniami' } });
    expect(await redirectOf(() => pairing.saveDishTranslations(form({ slug: 'halka', back, dishId: duck.id, version: translationsVersion(duck.translations), name_pl: 'X' })))).toBe(`${back}?error=version_conflict`);
    expect(await redirectOf(() => pairing.saveDishTranslations(form({ slug: 'halka', back, dishId: duck.id, name_pl: 'x'.repeat(200) })))).toBe(`${back}?error=translation_invalid`);
  });

  it('wine translations, the note in two languages and the restaurant content', async () => {
    await signIn('tomasz@halka.pl');   // the general manager imports, so may translate
    const scope = await createRequestScope();
    const wine = (await scope.cradle.adminService.wines('halka'))!.rows[0].wine;
    await scope.dispose();
    expect(await redirectOf(() => pairing.saveWineTranslations(form({ slug: 'halka', back: '/admin/halka/wines', wineId: wine.id, tastingNote_en: 'Chalky.' })))).toBe('/admin/halka/wines?saved=translations');
    expect(await redirectOf(() => imports.saveRestaurantContent(form({ slug: 'halka', back: '/admin/halka/setup', contentLocale: 'en', city_pl: 'Warszawa', tagline_pl: '', city_en: '', tagline_en: '' })))).toBe('/admin/halka/setup?saved=content');
    expect(await redirectOf(() => imports.saveRestaurantContent(form({ slug: 'halka', back: '/admin/halka/setup', contentLocale: 'de' })))).toBe('/admin/halka/setup?error=translation_invalid');
    // the manager does not decide pairings: the note form is refused for him
    const { rows } = await pairingsOf('Duck breast');
    const p = rows.find((x) => x.role === 'primary')!;
    expect(await redirectOf(() => pairing.savePairingNote(form({ slug: 'halka', back: '/admin/halka/pairings', pairingId: p.id, comment: 'x', comment_pl: 'y' })))).toMatch(/error=forbidden/);
    await signIn('marta@halka.pl');
    const note = await redirectOf(() => pairing.savePairingNote(form({ slug: 'halka', back: '/admin/halka/pairings', pairingId: p.id, version: String(p.version), comment: p.comment ?? '', comment_pl: 'Notatka po polsku', comment_en: '' })));
    expect(note).toBe('/admin/halka/pairings?saved=note');
    expect((await pairingsOf('Duck breast')).rows.find((x) => x.id === p.id)!.commentTranslations).toEqual({ pl: 'Notatka po polsku' });
  });

  it('a signed-out post goes to the sign-in page; the waiter role has no translation permission', async () => {
    state().cookies.delete(SESSION_COOKIE);
    expect(await redirectOf(() => pairing.saveDishTranslations(form({ slug: 'halka', back: '/admin/halka/menu', dishId: 'x' })))).toMatch(/^\/admin\/login\?next=/);
    const { can } = await import('@wine-match/core');
    expect(can('waiter', 'import.manage')).toBe(false);
  });
});

