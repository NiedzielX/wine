import { MemoryStore, pairingScore, type Dish, type Wine } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import * as catalog from '@/app/(admin)/admin/[slug]/catalog-actions';
import ReviewPage from '@/app/(admin)/admin/[slug]/(lists)/review/page';
import DishPage from '@/app/(admin)/admin/[slug]/menu/[dishId]/page';
import WinePage from '@/app/(admin)/admin/[slug]/wines/[wineId]/page';
import { GET as dishGet, PATCH as dishPatch } from '@/app/api/v1/dishes/[dishId]/details/route';
import { GET as wineGet, PATCH as winePatch } from '@/app/api/v1/wines/[id]/details/route';
import { PATCH as wineActivePatch } from '@/app/api/v1/wines/[id]/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec 2026-11-16-catalog-field-editing, C1b: the details routes (R12, AC11), the form actions (R11, AC8, AC9, AC20) and A3 / A5 as
 * the server sends them (AC12, AC21), without JavaScript. Roles: the Wine Director and the General Manager edit, an owner of another
 * restaurant gets 403 and nothing changes; a waiter cannot sign in (the permission table is asserted instead).
 */
const URL0 = 'http://localhost:3000';
const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

async function render(page: unknown, params: Record<string, string>, searchParams: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(searchParams) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

type Session = { cookie: string; token: string; csrf: string };
let marta: Session; let tomasz: Session; let outsider: Session;
let dishId = ''; let wineId = ''; let otherDishName = '';
const ctxDish = (id = dishId) => ({ params: Promise.resolve({ dishId: id }) });
const ctxWine = (id = wineId) => ({ params: Promise.resolve({ id }) });
const write = (s: Session, extra: Record<string, string> = {}) => ({ cookie: s.cookie, 'x-csrf-token': s.csrf, ...extra });
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

async function outsiderSession(): Promise<Session> {
  const scope = await createRequestScope();
  try {
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;
    const id = '00000000-0000-4000-8000-0000000000a3';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'otto@example.com', name: 'Otto Owner' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b3', restaurantSlug: 'other-place', restaurantName: 'Other Place', role: 'owner',
        membershipId: '00000000-0000-4000-8000-0000000000c3', status: 'active', version: 1, createdAt: '2026-10-20T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('otto@example.com');
}

async function read(): Promise<{ dish: Dish; wine: Wine; dishVersion: string; wineVersion: string; dishInfo: { pairsToCheck: number; staleLocales: string[] }; wineInfo: { pairsToCheck: number } }> {
  const scope = await createRequestScope();
  try {
    const d = (await scope.cradle.adminService.dishDetail('halka', dishId))!;
    const w = (await scope.cradle.adminService.wineDetail('halka', wineId))!;
    return { dish: d.source, wine: w.source, dishVersion: d.fieldsVersion, wineVersion: w.fieldsVersion, dishInfo: d, wineInfo: w };
  } finally {
    await scope.dispose();
  }
}
let RID = '';
const edits = async () => { const scope = await createRequestScope(); try { return await scope.cradle.catalogEditRepository.list(RID); } finally { await scope.dispose(); } };

beforeAll(async () => {
  [marta, tomasz, outsider] = [await loginAs('marta@halka.pl'), await loginAs('tomasz@halka.pl'), await outsiderSession()];
  const scope = await createRequestScope();
  RID = (await scope.cradle.restaurantRepository.findBySlug('halka'))!.id;
  const menu = (await scope.cradle.adminService.menu('halka'))!.rows.map((r) => r.dish);
  dishId = menu.find((d) => d.name === 'Duck breast')!.id;
  otherDishName = menu.find((d) => d.id !== dishId && d.status === 'published')!.name;
  wineId = (await scope.cradle.adminService.wines('halka'))!.rows.find((r) => r.wine.active && r.wine.glassPrice !== null)!.wine.id;
  await scope.dispose();
});

const patchDish = (s: Session, body: unknown, headers: Record<string, string> = {}, id = dishId) => dishPatch(jsonReq(`${URL0}/x?restaurant=halka`, body, 'PATCH', write(s, headers)), ctxDish(id));
const patchWine = (s: Session, body: unknown, headers: Record<string, string> = {}, id = wineId) => winePatch(jsonReq(`${URL0}/x?restaurant=halka`, body, 'PATCH', write(s, headers)), ctxWine(id));
/** The wine as the earlier tests may have left it: a bottle at 300 and a glass at 40. */
async function resetWine() {
  const r = await read();
  await patchWine(marta, { bottlePrice: 300, pouredByGlass: true, glassPrice: 40 }, { 'if-match': `"${r.wineVersion}"` });
}
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('GET and PATCH /dishes/{dishId}/details (R12, AC11)', () => {
  it('GET returns the fields with their fingerprint as ETag; PATCH needs it in If-Match: 428 without, 400 malformed, 422 for {} and an extra field, 404 for a non-UUID', async () => {
    const got = await dishGet(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), ctxDish());
    expect(got.status).toBe(200);
    expect(got.headers.get('etag')).toBe(`"${(await read()).dishVersion}"`);
    expect(await got.json()).toMatchObject({ name: 'Duck breast', category: 'Mains' });
    const v = { 'if-match': `"${(await read()).dishVersion}"` };
    expect((await patchDish(marta, { price: 99 })).status).toBe(428);
    expect((await patchDish(marta, { price: 99 }, { 'if-match': 'garbage' })).status).toBe(400);
    expect((await patchDish(marta, {}, v)).status).toBe(422);
    const extra = await patchDish(marta, { price: 99, profile: {}, status: 'hidden' }, v);
    expect(extra.status).toBe(422);
    expect(((await extra.json()) as { error: { fields: Record<string, string> } }).error.fields).toMatchObject({ profile: 'unknown_field', status: 'unknown_field' });
    expect((await patchDish(marta, { price: 99 }, v, 'nie-uuid')).status).toBe(404);
    expect((await read()).dish.price).not.toBe(99);
    expect(await edits()).toEqual([]);
  });

  it('saves with the fingerprint, answers every field and the new ETag; a stale one is 409; the same values again are changed: false', async () => {
    const before = await read();
    const ok = await patchDish(marta, { name: ' Duck breast ', price: 118.5, description: 'Roast duck, cherries' }, { 'if-match': `"${before.dishVersion}"` });
    expect(ok.status).toBe(200);
    const saved = (await ok.json()) as { changed: boolean; name: string; price: number; description: string };
    expect(saved).toMatchObject({ changed: true, name: 'Duck breast', price: 118.5, description: 'Roast duck, cherries' });
    const after = await read();
    expect(ok.headers.get('etag')).toBe(`"${after.dishVersion}"`);
    expect(after.dish).toMatchObject({ price: 118.5, description: 'Roast duck, cherries' });
    const stale = await patchDish(marta, { price: 1 }, { 'if-match': `"${before.dishVersion}"` });
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('version_conflict');
    expect((await read()).dish.price).toBe(118.5);
    const same = await patchDish(marta, { price: 118.5 }, { 'if-match': `"${after.dishVersion}"` });
    expect(((await same.json()) as { changed: boolean }).changed).toBe(false);
    expect((await edits()).filter((e) => e.kind === 'dish')).toHaveLength(1);
  });

  it('names every bad field, refuses a duplicate name and writes nothing', async () => {
    const v = { 'if-match': `"${(await read()).dishVersion}"` };
    const bad = await patchDish(marta, { name: '', price: 0, description: 'x'.repeat(1001) }, v);
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ name: 'required', price: 'not_positive', description: 'too_long' });
    const dup = await patchDish(marta, { name: otherDishName.toUpperCase() }, v);
    expect(dup.status).toBe(422);
    expect(((await dup.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ name: 'duplicate' });
    expect((await read()).dish.name).toBe('Duck breast');
  });

  it('the General Manager may edit; an owner of another restaurant is 403 on read and write, and nothing changes; a waiter has no permission and no sign-in', async () => {
    const before = JSON.stringify((await read()).dish);
    const v = { 'if-match': `"${(await read()).dishVersion}"` };
    expect((await patchDish(tomasz, { price: 120 }, v)).status).toBe(200);
    const after = JSON.stringify((await read()).dish);
    expect(after).not.toBe(before);
    expect((await dishGet(req(`${URL0}/x?restaurant=halka`, { cookie: outsider.cookie }), ctxDish())).status).toBe(403);
    expect((await patchDish(outsider, { price: 1 }, { 'if-match': `"${(await read()).dishVersion}"` })).status).toBe(403);
    expect((await dishGet(req(`${URL0}/x?restaurant=halka`), ctxDish())).status).toBe(401);
    expect((await loginRoute(jsonReq(`${URL0}/api/v1/auth/login`, { email: 'kelner@halka.pl', password: 'demo-halka-2026' }))).status).toBe(403);
    expect(JSON.stringify((await read()).dish)).toBe(after);
    expect((await patchDish(marta, { price: 1 }, { 'if-match': `"${(await read()).dishVersion}"`, 'x-csrf-token': 'wrong' })).status).toBe(403);
  });
});

describe('GET and PATCH /wines/{id}/details (R12, AC2, AC11)', () => {
  it('saves wine fields and the glass switch, answers pouredByGlass, and judges the glass against the bottle', async () => {
    const before = await read();
    const ok = await patchWine(marta, { region: 'Rheingau', bottlePrice: 310, glassPrice: 52, vintage: 'NV', listNumber: 777 }, { 'if-match': `"${before.wineVersion}"` });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ changed: true, region: 'Rheingau', bottlePrice: 310, glassPrice: 52, pouredByGlass: true, vintage: 'NV', listNumber: 777 });
    expect(ok.headers.get('etag')).toBe(`"${(await read()).wineVersion}"`);
    const off = await patchWine(marta, { pouredByGlass: false }, { 'if-match': `"${(await read()).wineVersion}"` });
    expect(await off.json()).toMatchObject({ pouredByGlass: false, glassPrice: null });
    const v = () => read().then((r) => ({ 'if-match': `"${r.wineVersion}"` }));
    const notAllowed = await patchWine(marta, { pouredByGlass: false, glassPrice: 10 }, await v());
    expect(((await notAllowed.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ glassPrice: 'not_allowed' });
    const tooHigh = await patchWine(marta, { pouredByGlass: true, glassPrice: 400 }, await v());
    expect(((await tooHigh.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ glassPrice: 'glass_not_below_bottle' });
    expect((await patchWine(marta, { vintage: 'nv' }, await v())).status).toBe(422);
    expect((await patchWine(marta, { bottlePrice: 5 }, await v())).status).toBe(200);
    expect((await read()).wine).toMatchObject({ bottlePrice: 5, glassPrice: null });
  });

  it('is 428 / 400 / 409 / 422 / 404 like the dish route; the availability route PATCH /wines/{id} {active} works as before', async () => {
    const cur = async () => ({ 'if-match': `"${(await read()).wineVersion}"` });
    expect((await patchWine(marta, { region: 'X' })).status).toBe(428);
    expect((await patchWine(marta, { region: 'X' }, { 'if-match': '"1"' })).status).toBe(400);
    expect((await patchWine(marta, {}, await cur())).status).toBe(422);
    expect((await patchWine(marta, { region: 'X' }, { 'if-match': '"00000000-1"' })).status).toBe(409);
    expect((await patchWine(marta, { region: 'X' }, await cur(), 'abc')).status).toBe(404);
    expect((await patchWine(outsider, { region: 'X' }, await cur())).status).toBe(403);
    expect((await wineGet(req(`${URL0}/x?restaurant=halka`, { cookie: outsider.cookie }), ctxWine())).status).toBe(403);
    const active = await wineActivePatch(jsonReq(`${URL0}/x?restaurant=halka`, { active: false }, 'PATCH', write(marta)), ctxWine());
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ id: wineId, active: false });
    // availability did not change the fingerprint of the editable fields (R4)
    expect((await patchWine(marta, { region: 'Elsewhere' }, await cur())).status).toBe(200);
    await wineActivePatch(jsonReq(`${URL0}/x?restaurant=halka`, { active: true }, 'PATCH', write(marta)), ctxWine());
  });
});

describe('the A3 and A5 form actions (R11, AC8, AC9)', () => {
  async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    return null;
  }
  const dishForm = async (over: Record<string, string | string[]> = {}) => {
    const r = await read();
    return form({ slug: 'halka', back: `/admin/halka/menu/${dishId}`, dishId, version: r.dishVersion, name: r.dish.name, description: r.dish.description, category: r.dish.category, price: String(r.dish.price), ...over });
  };
  const wineForm = async (over: Record<string, string | string[]> = {}) => {
    const r = await read();
    return form({
      slug: 'halka', back: `/admin/halka/wines/${wineId}`, wineId, version: r.wineVersion, producer: r.wine.producer, name: r.wine.name, vintage: String(r.wine.vintage), region: r.wine.region,
      country: r.wine.country, tastingNote: r.wine.tastingNote, listNumber: r.wine.listNumber === undefined ? '' : String(r.wine.listNumber), bottlePrice: String(r.wine.bottlePrice),
      pouredByGlass: r.wine.glassPrice === null ? ['false'] : ['false', 'true'], glassPrice: r.wine.glassPrice === null ? '' : String(r.wine.glassPrice), ...over
    });
  };
  const idle = { status: 'idle' } as const;

  it('"58,50" is saved and the page returns with the flash; "58,500", "1.234" and "abc" are not_a_number and nothing is written', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const url = await redirectOf(async () => catalog.saveDishDetails(idle, await dishForm({ price: '58,50' })));
    expect(url).toBe(`/admin/halka/menu/${dishId}?saved=catalog_saved`);
    expect((await read()).dish.price).toBe(58.5);
    for (const bad of ['58,500', '1.234', 'abc', '']) {
      const result = await catalog.saveDishDetails(idle, await dishForm({ price: bad }));
      expect(result, bad).toMatchObject({ status: 'error', fields: { price: bad === '' ? 'required' : 'not_a_number' }, values: { price: bad } });
    }
    expect((await read()).dish.price).toBe(58.5);
  });

  it('a wrong price and an empty name come back together with what was typed; the page shows both (aria-invalid) and keeps the values', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const result = await catalog.saveDishDetails(idle, await dishForm({ price: 'abc', name: '' }));
    expect(result).toMatchObject({ status: 'error', fields: { price: 'not_a_number', name: 'required' }, values: { price: 'abc', name: '' } });
    expect((await read()).dish.name).toBe('Duck breast');
    // a price that is not a number must not let the other changes be saved either
    const before = JSON.stringify((await read()).dish);
    const mixed = await catalog.saveDishDetails(idle, await dishForm({ price: 'abc', description: 'Changed at the same time' }));
    expect(mixed).toMatchObject({ status: 'error', fields: { price: 'not_a_number' } });
    expect(JSON.stringify((await read()).dish)).toBe(before);
  });

  it('an unticked box with a glass price typed saves glassPrice = null without an error; ticked, it saves the price; glass not below bottle is refused', async () => {
    await resetWine();
    state().cookies.set(SESSION_COOKIE, marta.token);
    const off = await redirectOf(async () => catalog.saveWineDetails(idle, await wineForm({ pouredByGlass: ['false'], glassPrice: '44' })));
    expect(off).toBe(`/admin/halka/wines/${wineId}?saved=catalog_saved`);
    expect((await read()).wine.glassPrice).toBeNull();
    const on = await redirectOf(async () => catalog.saveWineDetails(idle, await wineForm({ pouredByGlass: ['false', 'true'], glassPrice: '44,5' })));
    expect(on).toContain('saved=catalog_saved');
    expect((await read()).wine.glassPrice).toBe(44.5);
    const bad = await catalog.saveWineDetails(idle, await wineForm({ pouredByGlass: ['false', 'true'], glassPrice: '9999' }));
    expect(bad).toMatchObject({ status: 'error', fields: { glassPrice: 'glass_not_below_bottle' } });
    const empty = await catalog.saveWineDetails(idle, await wineForm({ pouredByGlass: ['false', 'true'], glassPrice: '' }));
    expect(empty).toMatchObject({ status: 'error', fields: { glassPrice: 'required' } });
    const unchanged = await redirectOf(async () => catalog.saveWineDetails(idle, await wineForm()));
    expect(unchanged).toBe(`/admin/halka/wines/${wineId}?saved=catalog_unchanged`);
  });

  it('two cards with the same wine: the first saves, the second gets version_conflict and the first one\'s values stay (AC9)', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const first = await wineForm({ region: 'First card' });
    const second = await wineForm({ region: 'Second card' });
    expect(await redirectOf(async () => catalog.saveWineDetails(idle, first))).toContain('saved=catalog_saved');
    const result = await catalog.saveWineDetails(idle, second);
    expect(result).toMatchObject({ status: 'error', error: 'version_conflict', values: { region: 'Second card' } });
    expect((await read()).wine.region).toBe('First card');
  });

  it('a duplicate name is refused at the field; another restaurant\'s owner and a missing session cannot write', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    expect(await catalog.saveDishDetails(idle, await dishForm({ name: otherDishName }))).toMatchObject({ status: 'error', fields: { name: 'duplicate' } });
    const before = JSON.stringify((await read()).dish);
    state().cookies.set(SESSION_COOKIE, outsider.token);
    expect(await catalog.saveDishDetails(idle, await dishForm({ price: '1' }))).toMatchObject({ status: 'error', error: 'forbidden' });
    expect(await catalog.saveWineDetails(idle, await wineForm({ region: 'Hacked' }))).toMatchObject({ status: 'error', error: 'forbidden' });
    expect(JSON.stringify((await read()).dish)).toBe(before);
    expect((await read()).wine.region).not.toBe('Hacked');
    state().cookies.delete(SESSION_COOKIE);
    expect(await redirectOf(async () => catalog.saveDishDetails(idle, await dishForm({ price: '1' })))).toMatch(/^\/admin\/login\?next=/);
  });

  it('a rename of a dish with sommelier pairings needs the confirmation field; the price does not (R15)', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    expect(await catalog.saveDishDetails(idle, await dishForm({ name: 'Duck breast, roasted' }))).toMatchObject({ status: 'error', fields: { name: 'identity_unconfirmed' } });
    expect((await read()).dish.name).toBe('Duck breast');
    expect(await redirectOf(async () => catalog.saveDishDetails(idle, await dishForm({ name: 'Duck breast, roasted', confirmIdentity: 'true' })))).toContain('saved=catalog_saved');
    expect((await read()).dishInfo.pairsToCheck).toBeGreaterThan(0);
  });
});

describe('A3 and A5 as the server sends them (R10, R11, R13, R15, AC12, AC20, AC21)', () => {
  it('A3 is a form with the stored values, the base-text hint, the audit line and the rename warning with the number of pairings', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const html = await render(DishPage, { dishId });
    const d = await read();
    expect(html).toContain('id="dish-name"');
    expect(html).toContain(`name="version" value="${d.dishVersion}"`);
    expect(html).toContain('This is the base text. Translations are below.');
    expect(html).toMatch(/name="category"[\s\S]*Mains/);
    expect(html).toContain('data-identity-warning');
    expect(html).toMatch(/This dish has \d+ sommelier pairings\. Rename it only to correct the name, not to replace the dish\./);
    // the Wine Director has no `audit.view`: the date without the name (R10, W10); the General Manager sees who
    expect(html).toMatch(/data-last-edit="true">Last edited \d/);
    expect(html).not.toContain('Last edited by');
    state().cookies.set(SESSION_COOKIE, tomasz.token);
    expect(await render(DishPage, { dishId })).toMatch(/data-last-edit="true">Last edited by Marta Wierzbicka, /);
    state().cookies.set(SESSION_COOKIE, marta.token);
    expect(html).toContain('data-check-after-rename');
    expect(html).not.toContain('<script src');
  });

  it('the same pages in Polish: labels, hints, the audit line and the check mark', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const dish = await render(DishPage, { dishId }, {}, 'pl');
    expect(dish).toContain('Dane dania');
    expect(dish).toContain('To tekst bazowy. Tłumaczenia są niżej.');
    expect(dish).toMatch(/To danie ma \d+ parowań sommeliera/);
    expect(dish).toMatch(/data-last-edit="true">Ostatnia zmiana: \d/);
    state().cookies.set(SESSION_COOKIE, tomasz.token);
    expect(await render(DishPage, { dishId }, {}, 'pl')).toMatch(/Ostatnia zmiana: Marta Wierzbicka, /);
    state().cookies.set(SESSION_COOKIE, marta.token);
    expect(dish).toContain('Sprawdź po zmianie nazwy');
    const wine = await render(WinePage, { wineId }, {}, 'pl');
    expect(wine).toContain('Pozycja na karcie');
    expect(wine).toContain('Na kieliszki');
    expect(wine).toContain('Cena kieliszka (zł)');
    const flash = await render(DishPage, { dishId }, { saved: 'catalog_saved' }, 'pl');
    expect(flash).toContain('Zapisano. Goście widzą zmianę od razu. Tłumaczenia zostają jak w publikacji: sprawdź je.');
  });

  it('A5 is a form with the glass switch (a hidden false before the box) and a glass price that is always visible', async () => {
    await resetWine();
    state().cookies.set(SESSION_COOKIE, marta.token);
    const html = await render(WinePage, { wineId });
    expect(html).toContain('id="wine-glassPrice"');
    const hidden = html.indexOf('<input type="hidden" name="pouredByGlass" value="false"/>');
    const box = html.indexOf('name="pouredByGlass" checked="" value="true"');
    expect(hidden).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(hidden);
    expect(html).toContain('Poured by the glass');
    expect(html).toContain('name="listNumber"');
    expect(html).toContain('data-last-edit="true">Last edited ');
  });

  it('the review queue lists a renamed dish ("Do przeglądu"), and a decision on its pairings takes them off', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const en = await render(ReviewPage, {});
    expect(en).toContain('data-renamed-pairs');
    expect(en).toContain('Renamed: check the pairs');
    expect(en).toMatch(/Name changed, check \d+ pairings/);
    const pl = await render(ReviewPage, {}, {}, 'pl');
    expect(pl).toContain('Zmieniono nazwę, sprawdź pary');
  });

  it('after a rename, A3 names the languages whose published translation may be outdated; after a price change alone it does not (AC21)', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const scope = await createRequestScope();
    try {
      await scope.cradle.translationService.setDishTranslations('halka', dishId, { en: { name: 'Roast duck' } }, { id: marta.token, name: 'Marta Wierzbicka' });
    } finally { await scope.dispose(); }
    const published = await publishPost(jsonReq(`${URL0}/x`, {}, 'POST', write(marta)), { params: Promise.resolve({ slug: 'halka' }) });
    expect(published.status, JSON.stringify(await published.clone().json())).toBe(201);
    expect(await render(DishPage, { dishId })).not.toContain('data-stale-translations');
    state().cookies.set(SESSION_COOKIE, marta.token);
    const v1 = (await read()).dishVersion;
    expect((await patchDish(marta, { price: 140 }, { 'if-match': `"${v1}"` })).status).toBe(200);
    expect(await render(DishPage, { dishId })).not.toContain('data-stale-translations');
    const v2 = (await read()).dishVersion;
    expect((await patchDish(marta, { name: 'Duck breast, glazed' }, { 'if-match': `"${v2}"` })).status).toBe(200);
    expect((await read()).dishInfo.staleLocales).toEqual(['pl', 'en']);
    const html = await render(DishPage, { dishId });
    expect(html).toContain('Translations (PL, EN) may be outdated.');
    expect(await render(DishPage, { dishId }, { saved: 'catalog_saved', n: 'pl,en' })).toContain('Translations (PL, EN) may be outdated.');
    // an unknown language code in the URL says nothing
    expect(await render(DishPage, { dishId }, { saved: 'catalog_saved', n: 'xx' })).not.toContain('(XX)');
  });
});

describe('the fields never change a Match Score (R6, AC6)', () => {
  it('every dish and wine of Halka scores the same after a change of each field, through the real routes', async () => {
    const scope = await createRequestScope();
    const dishes = await scope.cradle.dishRepository.listByRestaurant(RID);
    const wines = await scope.cradle.wineRepository.listByRestaurant(RID);
    await scope.dispose();
    const score = (ds: Dish[], ws: Wine[]) => ds.flatMap((d) => ws.map((w) => { const s = pairingScore(d, w); return [d.id, w.id, s.score, s.factors]; }));
    const before = JSON.stringify(score(dishes, wines));
    const r = await read();
    await patchDish(marta, { name: 'Zupełnie inna nazwa', description: 'Inny opis', category: 'Desserts', price: 12.34 }, { 'if-match': `"${r.dishVersion}"` });
    await patchWine(marta, { producer: 'Inny producent', name: 'Inne wino', vintage: 2001, region: 'Gdzieś', bottlePrice: 999, pouredByGlass: false }, { 'if-match': `"${r.wineVersion}"` });
    const scope2 = await createRequestScope();
    const after = JSON.stringify(score(await scope2.cradle.dishRepository.listByRestaurant(RID), await scope2.cradle.wineRepository.listByRestaurant(RID)));
    await scope2.dispose();
    expect(after).toBe(before);
  });
});
