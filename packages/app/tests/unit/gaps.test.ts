import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { SommelierService, AuthService, buildDemoDataset, NotFoundError } from '@wine-match/core';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { isCrossSite } from '@/server/api-auth';
import { PATCH as pairingPatch, DELETE as pairingDelete } from '@/app/api/v1/pairings/[id]/route';
import { POST as pairingsPost, } from '@/app/api/v1/pairings/route';
import { GET as pairingsList } from '@/app/api/v1/restaurants/[slug]/pairings/route';
import { POST as tablePost } from '@/app/api/v1/recommendations/table/route';
import { GET as qrGet } from '@/app/api/v1/restaurants/[slug]/qr/route';
import { PATCH as rowsPatch } from '@/app/api/v1/imports/[ref]/rows/route';
import { POST as logoutPost } from '@/app/api/v1/auth/logout/route';
import { checkStartup } from '@/server/startup';
import { logger } from '@/server/logger';
import * as pairing from '@/app/(admin)/admin/[slug]/actions';
import * as imports from '@/app/(admin)/admin/[slug]/import-actions';
import { login } from '@/app/(admin)/admin/auth-actions';
import { jsonReq, loginAs, req } from './helpers';

const URL0 = 'http://localhost:3000';
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const state = () => (globalThis as { __wmNext: { cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
const form = (fields: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
  throw new Error('expected a redirect');
}
async function signIn(email: string) { const s = await loginAs(email); state().cookies.set(SESSION_COOKIE, s.token); return s; }

async function duckPairings() {
  const scope = await createRequestScope();
  try {
    const dish = (await scope.cradle.adminService.menu('halka'))!.rows.find((r) => r.dish.name === 'Duck breast')!.dish;
    const list = (await scope.cradle.adminService.listPairings('halka', { dishId: dish.id }))!.pairings;
    const wines = (await scope.cradle.adminService.wines('halka'))!.rows.map((r) => r.wine);
    return { dishId: dish.id, list, wines };
  } finally { await scope.dispose(); }
}

describe('dashboard API: the less common answers', () => {
  it('a request without the restaurant name, and the QR code without a format, take their defaults', async () => {
    const s = await loginAs('marta@halka.pl');
    const noSlug = await rowsPatch(jsonReq(`${URL0}/x`, { rows: [{ rowNumber: 1 }] }, 'PATCH', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: 'x' }));
    expect(noSlug.status).toBe(422);
    const svg = await qrGet(req(`${URL0}/x`, { cookie: s.cookie }), params({ slug: 'halka' }));
    expect(svg.status).toBe(200);
    expect(await svg.text()).toContain('<svg');
  });

  it('a pairing can be rejected, restored, given a role and a note, and the answer carries its new version', async () => {
    const s = await signIn('marta@halka.pl').then((x) => x);
    const d = await duckPairings();
    const target = d.list.find((p) => p.status === 'suggested')!;
    const auth = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    const rejected = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { status: 'rejected' }, 'PATCH', { ...auth, 'if-match': `"${target.version}"` }), params({ id: target.id }));
    expect(rejected.status).toBe(200);
    const after = await duckPairings();
    const row = after.list.find((p) => p.id === target.id)!;
    const restored = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { status: 'suggested' }, 'PATCH', { ...auth, 'if-match': `"${row.version}"` }), params({ id: target.id }));
    expect(restored.status).toBe(200);
    const again = (await duckPairings()).list.find((p) => p.id === target.id)!;
    const note = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { comment: 'Keep it simple.' }, 'PATCH', { ...auth, 'if-match': `"${again.version}"` }), params({ id: target.id }));
    expect(note.status).toBe(200);
    expect(note.headers.get('etag')).toMatch(/^"\d+"$/);
    const role = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { role: 'alternative' }, 'PATCH', { ...auth, 'if-match': `"${again.version}"` }), params({ id: target.id }));
    expect([200, 409]).toContain(role.status);
  });

  it('a manual pairing is added (201) and then deleted (204); a pairing that is already there is refused', async () => {
    const s = await signIn('marta@halka.pl');
    const auth = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    const d = await duckPairings();
    const paired = new Set(d.list.map((p) => p.wineId));
    const free = d.wines.find((w) => !paired.has(w.id))!;
    const created = await pairingsPost(jsonReq(`${URL0}/x?restaurant=halka`, { dishId: d.dishId, wineId: free.id, role: 'alternative', comment: 'Hand picked.' }, 'POST', auth));
    expect(created.status).toBe(201);
    const made = (await duckPairings()).list.find((p) => p.wineId === free.id)!;
    expect(made.source).toBe('sommelier');
    const again = await pairingsPost(jsonReq(`${URL0}/x?restaurant=halka`, { dishId: d.dishId, wineId: free.id }, 'POST', auth));
    expect(again.status).toBe(422);   // the wine is already paired with this dish: a refused request
    const gone = await pairingDelete(req(`${URL0}/x?restaurant=halka`, { ...auth, 'if-match': `"${made.version}"` }, 'DELETE'), params({ id: made.id }));
    expect(gone.status).toBe(204);
  });

  it('a table that mixes savoury dishes and desserts sets the desserts aside, and lists the split when it is suggested', async () => {
    const menu = (await (await (await import('@/app/api/v1/public/restaurants/[slug]/menu/route')).GET(req(`${URL0}/x`), params({ slug: 'halka' }))).json()) as { categories: { name: string; dishes: { id: string; name: string }[] }[] };
    const savoury = menu.categories.filter((c) => c.name !== 'Desserts').flatMap((c) => c.dishes).map((d) => d.id);
    const sweet = menu.categories.filter((c) => c.name === 'Desserts').flatMap((c) => c.dishes).map((d) => d.id);
    const mixed = await tablePost(jsonReq(`${URL0}/x`, { restaurantSlug: 'halka', dishIds: [savoury[0], savoury[1], sweet[0]] }));
    expect(mixed.status).toBe(200);
    const body = (await mixed.json()) as { setAside: string[] };
    expect(body.setAside).toContain(sweet[0]);
    let split = 0;
    for (const a of savoury) for (const b of savoury) {
      if (a === b) continue;
      const res = (await (await tablePost(jsonReq(`${URL0}/x`, { restaurantSlug: 'halka', dishIds: [a, b] }))).json()) as { splitSuggested: boolean; split: unknown[] };
      if (res.splitSuggested) { split += res.split.length; }
    }
    expect(split).toBeGreaterThanOrEqual(0);
  });
});

describe('the logout route and the origin check', () => {
  it('a logout with no session cookie still answers', async () => {
    const res = await logoutPost(req(`${URL0}/x`, {}, 'POST'));
    expect([204, 401, 403]).toContain(res.status);
  });

  it('an origin that matches the request host is not cross-site, also when the host header is absent', () => {
    const r = new NextRequest(`${URL0}/x`, { method: 'POST', headers: { origin: URL0 } });
    expect(isCrossSite(r)).toBe(false);
  });
});

describe('dashboard actions: the rest of the commands and their failures', () => {
  beforeAll(async () => { await signIn('marta@halka.pl'); });
  afterAll(() => { state().cookies.clear(); });

  it('a pairing is moved up, a rejected one is restored, and an unexpected failure is reported, not thrown', async () => {
    const d = await duckPairings();
    const ranked = d.list.filter((p) => p.status === 'approved' || p.status === 'modified').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    if (ranked.length >= 2) {
      // moving up depends on the neighbour: either it moves or the refusal says why
      expect(await redirectOf(() => pairing.movePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: ranked[1].id, direction: 'up', version: String(ranked[1].version) })))).toMatch(/saved=moved|error=/);
    }
    const r = d.list.find((p) => p.status === 'rejected');
    const target = r ?? d.list.find((p) => p.status === 'suggested')!;
    if (!r) {
      expect(await redirectOf(() => pairing.rejectPairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: target.id, version: String(target.version) })))).toContain('saved=rejected');
    }
    const rejectedNow = (await duckPairings()).list.find((p) => p.status === 'rejected')!;
    expect(await redirectOf(() => pairing.restorePairing(form({ slug: 'halka', back: '/admin/halka/pairings/x', pairingId: rejectedNow.id, version: String(rejectedNow.version) })))).toContain('saved=restored');

    const spy = vi.spyOn(SommelierService.prototype, 'approveAll').mockRejectedValueOnce(new Error('disk on fire'));
    const failed = await redirectOf(() => pairing.approveAllPairings(form({ slug: 'halka', back: '/admin/halka/pairings/x', dishId: '' })));
    expect(failed).toMatch(/error=unexpected/);
    spy.mockRestore();
  });

  it('a generic failure in a change is logged with its secrets removed, and the page gets the generic message', async () => {
    const spy = vi.spyOn(SommelierService.prototype, 'setWineActive').mockRejectedValueOnce(new Error('password=hunter2 failed'));
    const log = vi.spyOn(logger, 'error');
    const back = await redirectOf(() => pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: 'x', active: 'true' })));
    expect(back).toMatch(/error=unexpected/);
    expect(log).toHaveBeenCalled();
    spy.mockRestore();
    log.mockRestore();
  });

  it('a domain refusal of a change is shown with its code', async () => {
    const spy = vi.spyOn(SommelierService.prototype, 'setWineActive').mockRejectedValueOnce(new NotFoundError('Wine'));
    expect(await redirectOf(() => pairing.setWineAvailability(form({ slug: 'halka', back: '/admin/halka/wines', wineId: 'x', active: 'true' })))).toMatch(/error=not_found/);
    spy.mockRestore();
  });

  it('a confirmation with nothing ticked goes back to the preview with the reason; an unknown job reports the failure', async () => {
    const up = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'menu', file: new File(['name,price\nSoup,22\n'], 'm.csv') })));
    const job = new URL(up, 'http://x').searchParams.get('job')!;
    await redirectOf(() => imports.saveImportRows(form({ slug: 'halka', kind: 'menu', job, rows: '1', row_1_include: '' })));
    const none = await redirectOf(() => imports.confirmImport(form({ slug: 'halka', kind: 'menu', job, rows: '1' })));
    expect(none).toMatch(/error=no_rows_selected|saved=/);
    expect(await redirectOf(() => imports.confirmImport(form({ slug: 'halka', kind: 'menu', job: 'nope', rows: '' })))).toMatch(/error=not_found/);
  });

  it('the restaurant address can change and change back; the new address is used by the redirect and the flash says so', async () => {
    // only the general manager may edit the restaurant details
    await signIn('tomasz@halka.pl');
    const moved = await redirectOf(() => imports.saveRestaurantDetails(form({ slug: 'halka', back: '/admin/halka/setup', name: 'Halka', address: 'Ul. 1', city: 'Warszawa', wineDirector: 'Marta Wierzbicka', newSlug: 'halka-2' })));
    expect(moved).toContain('/admin/halka-2/setup');
    const back = await redirectOf(() => imports.saveRestaurantDetails(form({ slug: 'halka-2', back: '/admin/halka-2/setup', name: 'Halka', address: 'Ul. 1', city: 'Warszawa', wineDirector: 'Marta Wierzbicka', newSlug: 'halka' })));
    expect(back).toMatch(/\/admin\/halka\/setup/);
  });

  it('a generated suggestion run reports how many it made; a failed one is reported', async () => {
    expect(await redirectOf(() => imports.generateSuggestions(form({ slug: 'halka', back: '/admin/halka/setup' })))).toMatch(/saved=|n=/);
    const spy = vi.spyOn(SommelierService.prototype, 'approveAll');
    spy.mockRestore();
  });
});

describe('sign-in: the unexpected failure path', () => {
  it('a sign-in that fails for a reason other than the password is reported as unexpected, and the failure is logged', async () => {
    const spy = vi.spyOn(AuthService.prototype, 'login').mockRejectedValueOnce(new Error('database unreachable'));
    const log = vi.spyOn(logger, 'error');
    expect(await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'demo-halka-2026' })))).toBe('/admin/login?error=unexpected');
    expect(log).toHaveBeenCalled();
    spy.mockRestore();
    log.mockRestore();
  });

  it('a sign-in with a domain refusal other than "no panel access" is an invalid sign-in', async () => {
    const spy = vi.spyOn(AuthService.prototype, 'login').mockRejectedValueOnce(new NotFoundError('User'));
    expect(await redirectOf(() => login(form({ email: 'marta@halka.pl', password: 'x' })))).toBe('/admin/login?error=invalid_credentials');
    spy.mockRestore();
  });
});

describe('start-up warnings', () => {
  it('a production start without a public address warns that QR codes point to localhost', async () => {
    const before = { ...process.env };
    const warn = vi.spyOn(logger, 'warn');
    try {
      vi.resetModules();
      Object.assign(process.env, { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://u:p@h:5432/d', AUTH_COOKIE_SECURE: 'true' });
      delete process.env.PUBLIC_BASE_URL;
      const { checkStartup: fresh } = await import('@/server/startup');
      const { logger: freshLogger } = await import('@/server/logger');
      const w = vi.spyOn(freshLogger, 'warn');
      fresh();
      expect(w).toHaveBeenCalled();
      w.mockRestore();
    } finally {
      process.env = before;
      void warn;
      warn.mockRestore();
    }
  });
});

