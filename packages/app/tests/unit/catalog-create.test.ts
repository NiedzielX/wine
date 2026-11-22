import { MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import * as catalog from '@/app/(admin)/admin/[slug]/catalog-actions';
import MenuPage from '@/app/(admin)/admin/[slug]/(lists)/menu/page';
import WinesPage from '@/app/(admin)/admin/[slug]/(lists)/wines/page';
import NewDishPage from '@/app/(admin)/admin/[slug]/menu/new/page';
import NewWinePage from '@/app/(admin)/admin/[slug]/wines/new/page';
import { POST as dishesPost } from '@/app/api/v1/dishes/route';
import { POST as winesPost } from '@/app/api/v1/wines/route';
import { GET as publicMenu } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec 2026-11-16-catalog-field-editing, C3: adding a dish or a wine by hand (R8, R9, R12; AC16 to AC19) through the routes, the A32
 * form actions and the pages as the server sends them, without JavaScript. The Wine Director adds; an owner of another restaurant is
 * refused and nothing changes. A new dish is a draft and a new wine has no profile in the published version, so guests see neither
 * until a publish.
 */
const URL0 = 'http://localhost:3000';
const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
type Session = { cookie: string; token: string; csrf: string };

let marta: Session; let outsider: Session; let RID = '';
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
    const id = '00000000-0000-4000-8000-0000000000a5';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'ola@example.com', name: 'Ola Owner' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b5', restaurantSlug: 'other-place', restaurantName: 'Other Place', role: 'owner',
        membershipId: '00000000-0000-4000-8000-0000000000c5', status: 'active', version: 1, createdAt: '2026-10-20T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('ola@example.com');
}

const counts = async () => {
  const scope = await createRequestScope();
  try {
    return {
      dishes: (await scope.cradle.dishRepository.listByRestaurant(RID)).length, wines: (await scope.cradle.wineRepository.listByRestaurant(RID)).length,
      pairings: (await scope.cradle.pairingRepository.listByRestaurant(RID)).length, edits: (await scope.cradle.catalogEditRepository.list(RID)).length
    };
  } finally {
    await scope.dispose();
  }
};
const dishNamed = async (name: string) => { const scope = await createRequestScope(); try { return (await scope.cradle.dishRepository.listByRestaurant(RID)).find((d) => d.name === name); } finally { await scope.dispose(); } };
const wineOf = async (id: string) => { const scope = await createRequestScope(); try { return await scope.cradle.wineRepository.findById(RID, id); } finally { await scope.dispose(); } };
const guestMenu = async () => JSON.stringify(await (await publicMenu(req(`${URL0}/x`), { params: Promise.resolve({ slug: 'halka' }) })).json());

beforeAll(async () => {
  [marta, outsider] = [await loginAs('marta@halka.pl'), await outsiderSession()];
  const scope = await createRequestScope();
  RID = (await scope.cradle.restaurantRepository.findBySlug('halka'))!.id;
  await scope.dispose();
});

const postDish = (s: Session, body: unknown, headers: Record<string, string> = {}, slug = 'halka') => dishesPost(jsonReq(`${URL0}/x?restaurant=${slug}`, body, 'POST', write(s, headers)));
const postWine = (s: Session, body: unknown, headers: Record<string, string> = {}, slug = 'halka') => winesPost(jsonReq(`${URL0}/x?restaurant=${slug}`, body, 'POST', write(s, headers)));
const fieldsOf = async (res: Response) => ((await res.json()) as { error: { fields?: Record<string, string> } }).error.fields;

describe('POST /dishes and POST /wines (R8, R12, AC16, AC17, AC19)', () => {
  it('POST /dishes answers 201 with Location and the ETag of the fields; the dish is a draft that guests do not see, with engine suggestions', async () => {
    const before = await counts();
    const res = await postDish(marta, { name: 'Smoked beetroot tartare', description: 'Beetroot, horseradish, rye', category: 'Starters', price: 39.5 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; suggestions: number };
    expect(res.headers.get('location')).toBe(`/api/v1/dishes/${body.id}/details?restaurant=halka`);
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{8}-\d+"$/);
    expect(body).toMatchObject({ status: 'draft' });
    expect(body.suggestions).toBeGreaterThan(0);
    const dish = await dishNamed('Smoked beetroot tartare');
    expect(dish).toMatchObject({ id: body.id, status: 'draft', price: 39.5, category: 'Starters' });
    expect(dish!.profile.source).toBe('draft');
    expect(await guestMenu()).not.toContain('Smoked beetroot tartare');
    const after = await counts();
    expect(after).toMatchObject({ dishes: before.dishes + 1, wines: before.wines, edits: before.edits + 1, pairings: before.pairings + body.suggestions });
  });

  it('POST /dishes names every wrong field, refuses a duplicate name and fields outside the schema, and creates nothing', async () => {
    const before = await counts();
    expect(await fieldsOf(await postDish(marta, {}))).toEqual({ name: 'required', category: 'required', price: 'required' });
    expect(await fieldsOf(await postDish(marta, { name: 'smoked beetroot TARTARE!', category: 'Mains', price: 10 }))).toEqual({ name: 'duplicate' });
    const bad = await postDish(marta, { name: 'X', category: 'Mains', price: 10, status: 'published', profile: {} });
    expect(bad.status).toBe(422);
    expect(await fieldsOf(bad)).toMatchObject({ status: 'unknown_field', profile: 'unknown_field' });
    expect(await fieldsOf(await postDish(marta, { name: 'Y', category: 'Mains', price: 1.234 }))).toEqual({ price: 'too_many_decimals' });
    expect((await dishesPost(jsonReq(`${URL0}/x`, { name: 'Z', category: 'Mains', price: 1 }, 'POST', write(marta)))).status).toBe(422);
    expect(await counts()).toEqual(before);
  });

  it('POST /wines answers 201 with the next free list number; the wine has a draft profile and suggestions and guests do not see it until a publish', async () => {
    const before = await counts();
    const res = await postWine(marta, { producer: 'Weingut Fuzz', name: 'Riesling trocken', vintage: 2022, region: 'Pfalz', bottlePrice: 240, style: 'white', grape: 'Riesling', pouredByGlass: true, glassPrice: 52 });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; listNumber: number; suggestions: number };
    expect(res.headers.get('location')).toBe(`/api/v1/wines/${body.id}/details?restaurant=halka`);
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{8}-\d+"$/);
    const wine = (await wineOf(body.id))!;
    expect(wine).toMatchObject({ producer: 'Weingut Fuzz', active: true, listNumber: body.listNumber, glassPrice: 52, bottlePrice: 240, grapes: ['Riesling'] });
    expect(body.listNumber).toBeGreaterThan(100);
    expect(body.suggestions).toBeGreaterThan(0);
    expect(await guestMenu()).not.toContain('Weingut Fuzz');
    expect(await counts()).toMatchObject({ wines: before.wines + 1, dishes: before.dishes, edits: before.edits + 1 });
    // the same producer, name and vintage again is a duplicate; so is the number
    expect(await fieldsOf(await postWine(marta, { producer: 'weingut fuzz', name: 'RIESLING trocken!', vintage: 2022, bottlePrice: 100, style: 'white' }))).toEqual({ name: 'duplicate' });
    expect(await fieldsOf(await postWine(marta, { producer: 'Another', name: 'Number taken', vintage: 'NV', bottlePrice: 100, style: 'red', listNumber: body.listNumber }))).toEqual({ listNumber: 'duplicate' });
  });

  it('POST /wines judges the glass, the vintage, the style and the missing fields, all together', async () => {
    const before = await counts();
    expect(await fieldsOf(await postWine(marta, {}))).toEqual({ producer: 'required', name: 'required', vintage: 'required', bottlePrice: 'required', style: 'required' });
    expect(await fieldsOf(await postWine(marta, { producer: 'P', name: 'N', vintage: 2099, bottlePrice: 50, style: 'red', pouredByGlass: true, glassPrice: 60 }))).toEqual({ vintage: 'out_of_range', glassPrice: 'glass_not_below_bottle' });
    expect(await fieldsOf(await postWine(marta, { producer: 'P', name: 'N', vintage: 2020, bottlePrice: 50, style: 'fizzy', active: false }))).toMatchObject({ style: 'invalid', active: 'unknown_field' });
    expect(await counts()).toEqual(before);
  });

  it('an owner of another restaurant is 403 for both, no session is 401, a missing token is 403, and nothing changes', async () => {
    const before = await counts();
    const dish = { name: 'Planted dish', category: 'Mains', price: 1 };
    const wine = { producer: 'Planted', name: 'Wine', vintage: 2020, bottlePrice: 1, style: 'red' };
    expect((await postDish(outsider, dish)).status).toBe(403);
    expect((await postWine(outsider, wine)).status).toBe(403);
    expect((await dishesPost(jsonReq(`${URL0}/x?restaurant=halka`, dish, 'POST', {}))).status).toBe(401);
    expect((await winesPost(jsonReq(`${URL0}/x?restaurant=halka`, wine, 'POST', { cookie: marta.cookie }))).status).toBe(403);
    expect(await counts()).toEqual(before);
    expect(await dishNamed('Planted dish')).toBeUndefined();
  });
});

describe('the A32 form actions and pages (R8, R11, AC18)', () => {
  async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    return null;
  }
  async function render(page: unknown, params: Record<string, string> = {}, lang: 'en' | 'pl' = 'en', searchParams: Record<string, string> = {}): Promise<string> {
    state().headers.clear();
    state().headers.set('x-wine-lang', lang);
    const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(searchParams) }));
    return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
  }
  const dishForm = (over: Record<string, string> = {}) => form({ slug: 'halka', back: '/admin/halka/menu/new', name: 'Plum soufflé', description: 'Baked plum', category: 'Desserts', price: '42,50', ...over });
  const wineForm = (over: Record<string, string | string[]> = {}) => form({
    slug: 'halka', back: '/admin/halka/wines/new', producer: 'Form Estate', name: 'Gamay', vintage: '2023', region: 'Beaujolais', country: 'France', tastingNote: '', listNumber: '',
    bottlePrice: '210', pouredByGlass: ['false'], glassPrice: '', style: 'red', grape: 'Gamay', ...over
  });
  const idle = { status: 'idle' } as const;

  it('"Add dish" creates the draft and goes to its page with the flash; the price is read like in the edit form', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const url = await redirectOf(async () => catalog.createDish(idle, dishForm()));
    const dish = (await dishNamed('Plum soufflé'))!;
    expect(url).toBe(`/admin/halka/menu/${dish.id}?saved=catalog_created`);
    expect(dish).toMatchObject({ status: 'draft', price: 42.5, category: 'Desserts' });
  });

  it('a wrong price, an empty name and a duplicate come back with what was typed and a message at each field; nothing is created', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const before = await counts();
    expect(await catalog.createDish(idle, dishForm({ name: '', price: '58,500' }))).toMatchObject({ status: 'error', fields: { name: 'required', price: 'not_a_number' }, values: { name: '', price: '58,500', category: 'Desserts' } });
    expect(await catalog.createDish(idle, dishForm({ price: '' }))).toMatchObject({ status: 'error', fields: { price: 'required' } });
    expect(await catalog.createDish(idle, dishForm({ name: 'PLUM soufflé' }))).toMatchObject({ status: 'error', fields: { name: 'duplicate' }, values: { name: 'PLUM soufflé' } });
    expect(await catalog.createWine(idle, wineForm({ bottlePrice: 'abc', vintage: '20x', style: '' }))).toMatchObject({ status: 'error', fields: { bottlePrice: 'not_a_number', vintage: 'not_a_number', style: 'invalid' }, values: { bottlePrice: 'abc', vintage: '20x' } });
    expect(await catalog.createWine(idle, wineForm({ pouredByGlass: ['false', 'true'], glassPrice: '300' }))).toMatchObject({ status: 'error', fields: { glassPrice: 'glass_not_below_bottle' } });
    expect(await counts()).toEqual(before);
  });

  it('"Add wine" creates the wine (an unticked box saves no glass price, an empty number takes the next one) and goes to its page', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const url = await redirectOf(async () => catalog.createWine(idle, wineForm({ glassPrice: '44' })));
    const id = /\/admin\/halka\/wines\/([0-9a-f-]{36})\?saved=catalog_created$/.exec(url ?? '')?.[1];
    expect(id).toBeDefined();
    const wine = (await wineOf(id!))!;
    expect(wine).toMatchObject({ producer: 'Form Estate', glassPrice: null, bottlePrice: 210, active: true });
    expect(wine.listNumber).toBeGreaterThan(100);
    const glass = await redirectOf(async () => catalog.createWine(idle, wineForm({ name: 'Gamay glass', pouredByGlass: ['false', 'true'], glassPrice: '44,50' })));
    const id2 = /\/wines\/([0-9a-f-]{36})\?/.exec(glass ?? '')?.[1];
    expect((await wineOf(id2!))!.glassPrice).toBe(44.5);
  });

  it('another restaurant\'s owner and a missing session cannot use the actions; nothing changes', async () => {
    const before = await counts();
    state().cookies.set(SESSION_COOKIE, outsider.token);
    expect(await catalog.createDish(idle, dishForm({ name: 'Planted by form' }))).toMatchObject({ status: 'error', error: 'forbidden' });
    expect(await catalog.createWine(idle, wineForm({ producer: 'Planted by form' }))).toMatchObject({ status: 'error', error: 'forbidden' });
    state().cookies.delete(SESSION_COOKIE);
    expect(await redirectOf(async () => catalog.createDish(idle, dishForm({ name: 'Planted by form' })))).toMatch(/^\/admin\/login\?next=/);
    expect(await counts()).toEqual(before);
  });

  it('A32 is a form without a script, in English and Polish; A2 and A4 offer the buttons to a role that may add', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const dish = await render(NewDishPage);
    expect(dish).toContain('New dish');
    expect(dish).toContain('id="dish-name"');
    expect(dish).toContain('id="dish-price"');
    expect(dish).toContain('Add dish');
    expect(dish).not.toContain('<script src');
    const wine = await render(NewWinePage);
    expect(wine).toContain('id="wine-producer"');
    expect(wine).toContain('id="wine-style"');
    expect(wine).toContain('id="wine-grape"');
    expect(wine).toContain('name="pouredByGlass" value="false"');
    expect(wine).toContain('Leave empty to take the next free number.');
    expect(await render(NewDishPage, {}, 'pl')).toContain('Nowe danie');
    expect(await render(NewWinePage, {}, 'pl')).toContain('Dodaj wino');
    expect(await render(MenuPage)).toContain('href="/admin/halka/menu/new"');
    expect(await render(WinesPage)).toContain('href="/admin/halka/wines/new"');
  });
});
