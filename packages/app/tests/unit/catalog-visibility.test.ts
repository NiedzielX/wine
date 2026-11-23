import { MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import * as catalog from '@/app/(admin)/admin/[slug]/catalog-actions';
import DishPage from '@/app/(admin)/admin/[slug]/menu/[dishId]/page';
import { GET as visibilityGet, POST as visibilityPost } from '@/app/api/v1/dishes/[dishId]/visibility/route';
import { GET as publicMenu } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec 2026-11-16-catalog-field-editing, C2: hiding and showing a dish (R7, R9, R10, R12; AC14, AC15) through the route, the
 * button's action and A3 as the server sends it, without JavaScript. The Wine Director edits; an owner of another restaurant is
 * refused and nothing changes; a draft dish has no switch.
 */
const URL0 = 'http://localhost:3000';
const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;
type Session = { cookie: string; token: string; csrf: string };

let marta: Session; let outsider: Session;
let dishId = ''; let draftId = ''; let RID = '';
const ctxDish = (id = dishId) => ({ params: Promise.resolve({ dishId: id }) });
const write = (s: Session, extra: Record<string, string> = {}) => ({ cookie: s.cookie, 'x-csrf-token': s.csrf, ...extra });
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };

async function outsiderSession(): Promise<Session> {
  const scope = await createRequestScope();
  try {
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;
    const id = '00000000-0000-4000-8000-0000000000a4';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'olga@example.com', name: 'Olga Owner' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b4', restaurantSlug: 'other-place', restaurantName: 'Other Place', role: 'owner',
        membershipId: '00000000-0000-4000-8000-0000000000c4', status: 'active', version: 1, createdAt: '2026-10-20T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('olga@example.com');
}

/** The dish as the panel reads it: status and the fingerprint the button would send. */
async function read(id = dishId) {
  const scope = await createRequestScope();
  try {
    const d = (await scope.cradle.adminService.dishDetail('halka', id))!;
    return { status: d.source.status, version: d.visibilityVersion, pairings: d.pairings };
  } finally {
    await scope.dispose();
  }
}
const edits = async () => { const scope = await createRequestScope(); try { return await scope.cradle.catalogEditRepository.list(RID, { subjectId: dishId }); } finally { await scope.dispose(); } };
const guestDishes = async (): Promise<string[]> => {
  const res = await publicMenu(req(`${URL0}/x`), { params: Promise.resolve({ slug: 'halka' }) });
  expect(res.status).toBe(200);
  return JSON.stringify(await res.json()).includes(`"${dishId}"`) ? [dishId] : [];
};

beforeAll(async () => {
  [marta, outsider] = [await loginAs('marta@halka.pl'), await outsiderSession()];
  const scope = await createRequestScope();
  RID = (await scope.cradle.restaurantRepository.findBySlug('halka'))!.id;
  const menu = (await scope.cradle.adminService.menu('halka'))!.rows.map((r) => r.dish);
  const duck = menu.find((d) => d.name === 'Duck breast')!;
  dishId = duck.id;
  draftId = menu.find((d) => d.status === 'draft')!.id;
  await scope.dispose();
});

const post = (s: Session, body: unknown, headers: Record<string, string> = {}, id = dishId, slug = 'halka') => visibilityPost(jsonReq(`${URL0}/x?restaurant=${slug}`, body, 'POST', write(s, headers)), ctxDish(id));
const ifMatch = async () => ({ 'if-match': `"${(await read()).version}"` });
const fieldsOf = async (res: Response) => ((await res.json()) as { error: { fields?: Record<string, string> } }).error.fields;

describe('GET and POST /dishes/{dishId}/visibility (R7, R12, AC14, AC15)', () => {
  it('GET returns the status with the fingerprint as ETag; POST needs it: 428 without, 400 malformed, 422 for a wrong body, 404 for a non-UUID', async () => {
    const got = await visibilityGet(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), ctxDish());
    expect(got.status).toBe(200);
    expect(got.headers.get('etag')).toBe(`"${(await read()).version}"`);
    expect(await got.json()).toEqual({ id: dishId, status: 'published' });
    expect((await post(marta, { hidden: true })).status).toBe(428);
    expect((await post(marta, { hidden: true }, { 'if-match': 'garbage' })).status).toBe(400);
    const v = await ifMatch();
    for (const body of [{}, { hidden: 'yes' }, { hidden: true, status: 'draft' }, { hidden: 1 }, [], 'x']) expect((await post(marta, body, v)).status, JSON.stringify(body)).toBe(422);
    expect((await post(marta, { hidden: true }, v, 'nie-uuid')).status).toBe(404);
    expect((await post(marta, { hidden: true }, v, '00000000-0000-4000-8000-00000000dead')).status).toBe(404);
    expect((await read()).status).toBe('published');
    expect(await edits()).toEqual([]);
  });

  it('hides the dish from guests at once and shows it again, each with one audit row, the new ETag and no publish', async () => {
    expect(await guestDishes()).toEqual([dishId]);
    const hide = await post(marta, { hidden: true }, await ifMatch());
    expect(hide.status).toBe(200);
    expect(await hide.json()).toEqual({ id: dishId, status: 'hidden', suggestions: 0 });
    expect(hide.headers.get('etag')).toBe(`"${(await read()).version}"`);
    expect(await guestDishes()).toEqual([]);
    const show = await post(marta, { hidden: false }, { 'if-match': hide.headers.get('etag')! });
    expect(show.status).toBe(200);
    expect(await guestDishes()).toEqual([dishId]);
    expect((await edits()).map((e) => [e.action, e.actor, e.before, e.after])).toEqual([
      ['shown', 'Marta Wierzbicka', { status: 'hidden' }, { status: 'published' }],
      ['hidden', 'Marta Wierzbicka', { status: 'published' }, { status: 'hidden' }]
    ]);
  });

  it('is 409 with a stale fingerprint (also after a change of the fields) and 422 status: transition for a draft and for the state it is already in', async () => {
    const stale = await ifMatch();
    const scope = await createRequestScope();
    try { await scope.cradle.catalogEditService.updateDish('halka', dishId, { price: 132 }, { id: '00000000-0000-4000-8000-0000000000aa', name: 'Test' }); } finally { await scope.dispose(); }
    expect((await post(marta, { hidden: true }, stale)).status).toBe(409);
    expect((await read()).status).toBe('published');
    const v = { 'if-match': `"${(await read(draftId)).version}"` };
    for (const hidden of [true, false]) {
      const res = await post(marta, { hidden }, v, draftId);
      expect(res.status).toBe(422);
      expect(await fieldsOf(res)).toEqual({ status: 'transition' });
    }
    const again = await post(marta, { hidden: false }, await ifMatch());
    expect(again.status).toBe(422);
    expect(await fieldsOf(again)).toEqual({ status: 'transition' });
  });

  it('an owner of another restaurant is 403 on read and write; no session is 401; a missing token is 403; nothing changes', async () => {
    const before = JSON.stringify([await read(), await edits(), await guestDishes()]);
    const v = await ifMatch();
    expect((await post(outsider, { hidden: true }, v)).status).toBe(403);
    expect((await visibilityGet(req(`${URL0}/x?restaurant=halka`, { cookie: outsider.cookie }), ctxDish())).status).toBe(403);
    expect((await visibilityPost(jsonReq(`${URL0}/x?restaurant=halka`, { hidden: true }, 'POST', v), ctxDish())).status).toBe(401);
    expect((await visibilityPost(jsonReq(`${URL0}/x?restaurant=halka`, { hidden: true }, 'POST', { cookie: marta.cookie, ...v }), ctxDish())).status).toBe(403);
    expect(JSON.stringify([await read(), await edits(), await guestDishes()])).toBe(before);
  });
});

describe('the Hide / Show button on A3 (R7, R9, AC14)', () => {
  async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    return null;
  }
  async function render(id: string, lang: 'en' | 'pl' = 'en'): Promise<string> {
    state().headers.clear();
    state().headers.set('x-wine-lang', lang);
    const { prelude } = await prerender(createElement(DishPage as Page, { params: Promise.resolve({ slug: 'halka', dishId: id }), searchParams: Promise.resolve({}) }));
    return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
  }
  const buttonForm = async (hidden: string, over: Record<string, string> = {}) => form({ slug: 'halka', back: `/admin/halka/menu/${dishId}`, dishId, hidden, version: (await read()).version, ...over });

  it('the page offers "Hide from guests" for a published dish, "Show to guests" for a hidden one, and none for a draft', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const published = await render(dishId);
    expect(published).toContain('Hide from guests');
    expect(published).toContain('name="hidden" value="true"');
    expect(published).toContain(`name="version" value="${(await read()).version}"`);
    expect(await render(draftId)).not.toMatch(/Hide from guests|Show to guests/);
    expect(await render(dishId, 'pl')).toContain('Ukryj przed gośćmi');
    expect(published).not.toContain('<script src');
  });

  it('the action hides with a flash, shows with a flash, and a stale form is version_conflict, a draft dish_transition', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const stale = await buttonForm('true');
    expect(await redirectOf(async () => catalog.setDishHidden(await buttonForm('true')))).toBe(`/admin/halka/menu/${dishId}?saved=dish_hidden`);
    expect((await read()).status).toBe('hidden');
    expect(await render(dishId)).toContain('Show to guests');
    expect(await redirectOf(async () => catalog.setDishHidden(stale))).toBe(`/admin/halka/menu/${dishId}?error=version_conflict`);
    expect(await redirectOf(async () => catalog.setDishHidden(await buttonForm('false')))).toBe(`/admin/halka/menu/${dishId}?saved=dish_shown`);
    expect((await read()).status).toBe('published');
    expect(await redirectOf(async () => catalog.setDishHidden(await buttonForm('true', { dishId: draftId, version: (await read(draftId)).version })))).toBe(`/admin/halka/menu/${dishId}?error=dish_transition`);
  });

  it('another restaurant\'s owner and a missing session cannot use the action; nothing changes', async () => {
    const before = JSON.stringify([await read(), await edits()]);
    state().cookies.set(SESSION_COOKIE, outsider.token);
    expect(await redirectOf(async () => catalog.setDishHidden(await buttonForm('true')))).toContain('error=forbidden');
    state().cookies.delete(SESSION_COOKIE);
    expect(await redirectOf(async () => catalog.setDishHidden(await buttonForm('true')))).toMatch(/^\/admin\/login\?next=/);
    expect(JSON.stringify([await read(), await edits()])).toBe(before);
  });
});
