import { MemoryStore } from '@wine-match/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as picksGet } from '@/app/api/v1/restaurants/[slug]/picks/route';
import { GET as simulationGet } from '@/app/api/v1/restaurants/[slug]/picks/simulation/route';
import { PUT as pickPut } from '@/app/api/v1/wines/[id]/pick/route';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec 2026-11-18-restaurant-picks, PR1b: the three picks routes (R4, R16; AC5, AC10, AC15) on the in-memory data source.
 * Owner and general manager change the set; the Wine Director reads it and the simulation but is refused the write; an
 * owner of another restaurant is refused everything; a stale or missing version is 409 or 428.
 */
const URL0 = 'http://localhost:3000';
type Session = { cookie: string; token: string; csrf: string };
let marta: Session; let tomasz: Session; let outsider: Session;
let wines: string[] = [];
const write = (s: Session, extra: Record<string, string> = {}) => ({ cookie: s.cookie, 'x-csrf-token': s.csrf, ...extra });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = { params: Promise.resolve({ slug: 'halka' }) };
/** a parsed body whose fields the test reads one by one (`JSON.parse` is typed loosely on purpose) */
const json = async (r: Response): Promise<ReturnType<typeof JSON.parse>> => r.json();
const put = (s: Session, id: string, body: unknown, headers: Record<string, string> = {}, query = '?restaurant=halka') =>
  pickPut(jsonReq(`${URL0}/x${query}`, body, 'PUT', write(s, headers)), ctx(id));
const list = async (s: Session) => json(await picksGet(req(`${URL0}/x`, { cookie: s.cookie }), slugCtx));

async function outsiderSession(): Promise<Session> {
  const scope = await createRequestScope();
  try {
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;
    const id = '00000000-0000-4000-8000-0000000000a3';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'olga3@example.com', name: 'Olga Owner' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b3', restaurantSlug: 'other-place', restaurantName: 'Other Place', role: 'owner',
        membershipId: '00000000-0000-4000-8000-0000000000c3', status: 'active', version: 1, createdAt: '2026-10-20T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('olga3@example.com');
}

beforeAll(async () => {
  [marta, tomasz, outsider] = [await loginAs('marta@halka.pl'), await loginAs('tomasz@halka.pl'), await outsiderSession()];
  const scope = await createRequestScope();
  wines = (await scope.cradle.adminService.wines('halka'))!.rows.filter((r) => r.wine.active).map((r) => r.wine.id).sort();
  await scope.dispose();
});

describe('PUT /wines/{id}/pick', () => {
  it('needs the version of the set: 428 without it, 400 malformed, 409 stale; If-Match or the body field both work', async () => {
    const state = await list(tomasz);
    expect(state).toMatchObject({ picks: [], max: 5 });
    expect((await put(tomasz, wines[0], { on: true })).status).toBe(428);
    expect((await put(tomasz, wines[0], { on: true }, { 'if-match': 'garbage' })).status).toBe(400);
    expect((await put(tomasz, wines[0], { on: true }, { 'if-match': '"00000000-1"' })).status).toBe(409);
    expect((await list(tomasz)).picks).toEqual([]);
    const ok = await put(tomasz, wines[0], { on: true }, { 'if-match': `"${state.version}"` });
    expect(ok.status).toBe(200);
    const body = await json(ok);
    expect(body).toMatchObject({ changed: true, count: 1, max: 5 });
    expect(ok.headers.get('etag')).toBe(`"${body.version}"`);
    // the body field is accepted in place of the header; the same request again changes nothing
    const again = await json(await put(tomasz, wines[0], { on: true, expectedVersion: body.version }));
    expect(again).toMatchObject({ changed: false, version: body.version });
    expect((await put(tomasz, wines[0], { on: false, expectedVersion: body.version })).status).toBe(200);
    expect((await list(tomasz)).picks).toEqual([]);
  });

  it('refuses a body outside the schema, a missing restaurant, and the sixth pick (422), and writes nothing', async () => {
    let version = (await list(tomasz)).version;
    for (const body of [{}, { on: 'yes' }, { on: true, restaurantId: 'x' }, { on: true, extra: 1 }, { on: true, expectedVersion: 'v1' }]) {
      expect((await put(tomasz, wines[0], body, { 'if-match': `"${version}"` })).status, JSON.stringify(body)).toBe(422);
    }
    expect((await put(tomasz, wines[0], { on: true }, { 'if-match': `"${version}"` }, '')).status).toBe(422);
    for (const id of wines.slice(0, 5)) version = (await json(await put(tomasz, id, { on: true }, { 'if-match': `"${version}"` }))).version;
    const sixth = await put(tomasz, wines[5], { on: true }, { 'if-match': `"${version}"` });
    expect(sixth.status).toBe(422);
    expect((await json(sixth)).error.code).toBe('too_many_picks');
    expect((await list(tomasz)).picks).toHaveLength(5);
    for (const id of wines.slice(0, 5)) version = (await json(await put(tomasz, id, { on: false }, { 'if-match': `"${version}"` }))).version;
  });

  it('an unknown wine and an id that is not a UUID are the same 404; the Wine Director is refused with 403, so is an owner of another restaurant', async () => {
    const version = (await list(tomasz)).version;
    const a = await put(tomasz, '00000000-0000-4000-8000-ffffffffffff', { on: true }, { 'if-match': `"${version}"` });
    const b = await put(tomasz, 'not-a-uuid', { on: true }, { 'if-match': `"${version}"` });
    expect([a.status, b.status]).toEqual([404, 404]);
    expect(await json(a)).toEqual(await json(b));
    expect((await put(marta, wines[0], { on: true }, { 'if-match': `"${version}"` })).status).toBe(403);
    expect((await put(outsider, wines[0], { on: true }, { 'if-match': `"${version}"` })).status).toBe(403);
    expect((await put(tomasz, wines[0], { on: true }, { 'if-match': `"${version}"` }, '?restaurant=other-place')).status).toBe(403);
    expect((await pickPut(jsonReq(`${URL0}/x?restaurant=halka`, { on: true }, 'PUT', { cookie: tomasz.cookie, 'if-match': `"${version}"` }), ctx(wines[0]))).status).toBe(403);
    expect((await pickPut(jsonReq(`${URL0}/x?restaurant=halka`, { on: true }, 'PUT', { 'if-match': `"${version}"` }), ctx(wines[0]))).status).toBe(401);
    expect((await list(tomasz)).picks).toEqual([]);
  });
});

describe('GET …/picks and …/picks/simulation', () => {
  it('the Wine Director reads the set and the simulation; an owner of another restaurant and a visitor without a session do not', async () => {
    const version = (await list(tomasz)).version;
    await put(tomasz, wines[1], { on: true }, { 'if-match': `"${version}"` });
    const seen = await list(marta);
    expect(seen.picks).toEqual([expect.objectContaining({ wineId: wines[1], active: true, published: false, setBy: 'Tomasz Lis' })]);
    expect(Object.keys(seen.picks[0]).sort()).toEqual(['active', 'name', 'producer', 'published', 'setAt', 'setBy', 'vintage', 'wineId']);
    const sim = await simulationGet(req(`${URL0}/x`, { cookie: marta.cookie }), slugCtx);
    expect(sim.status).toBe(200);
    const s = await json(sim);
    expect(s.tried).toEqual([wines[1]]);
    expect(s.summary.dishes).toBe(s.dishes.length);
    expect(s.picks[0]).toMatchObject({ wineId: wines[1], inPublishedSet: false });
    for (const r of [outsider]) {
      expect((await picksGet(req(`${URL0}/x`, { cookie: r.cookie }), slugCtx)).status).toBe(403);
      expect((await simulationGet(req(`${URL0}/x`, { cookie: r.cookie }), slugCtx)).status).toBe(403);
    }
    expect((await picksGet(req(`${URL0}/x`), slugCtx)).status).toBe(401);
    expect((await simulationGet(req(`${URL0}/x`), slugCtx)).status).toBe(401);
    await put(tomasz, wines[1], { on: false }, { 'if-match': `"${(await list(tomasz)).version}"` });
  });

  it('the simulation takes a set from the URL, validates it with the schema and answers a foreign id like a missing one', async () => {
    const run = (q: string, s = marta) => simulationGet(req(`${URL0}/x${q}`, { cookie: s.cookie }), slugCtx);
    const own = await json(await run(`?picks=${wines.slice(0, 3).join(',')}`));
    expect(own.tried).toEqual(wines.slice(0, 3));
    expect((await json(await run('?picks='))).tried).toEqual([]);
    expect((await run(`?picks=${wines.slice(0, 6).join(',')}`)).status).toBe(422);
    expect((await run('?dish=00000000-0000-4000-8000-ffffffffffff')).status).toBe(404);
    const a = await json(await run('?picks=00000000-0000-4000-8000-ffffffffffff'));
    const b = await json(await run('?picks=not-a-uuid'));
    expect(a.picks[0]).toMatchObject({ name: null, reason: 'not_in_list' });
    expect(JSON.stringify(a).split('00000000-0000-4000-8000-ffffffffffff').join('X')).toBe(JSON.stringify(b).split('not-a-uuid').join('X'));
    expect((await json(await run('?picks=a&picks=a'))).tried).toEqual(['a']);
  });
});
