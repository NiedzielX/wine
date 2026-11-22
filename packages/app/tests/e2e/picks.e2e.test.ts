import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HALKA, db, errorCode, get, halkaManager, halkaSommelier, send, snapshotDatabase, type Session } from './boundaries';

/**
 * Spec 2026-11-18-restaurant-picks, PR1b: the picks API on PostgreSQL over plain HTTP (R2, R4, R13, R15, R16; AC5, AC9, AC10).
 * The database is recorded first and put back at the end (the files share one database in sequence).
 */
let restoreDatabase: (() => Promise<void>) | undefined;
let tomasz: Session; let marta: Session;
let wines: Array<{ id: string; name: string }> = [];

type Picks = { version: string; max: number; picks: Array<{ wineId: string; published: boolean; active: boolean; setBy: string }> };
type Item = { wineId: string; matchScore: number; tier: number; restaurantPick: boolean };
type Simulation = {
  published: boolean; tried: string[];
  dishes: Array<{ dishId: string; before: Item[]; after: Item[]; moves: unknown[]; reordered: boolean }>;
  picks: Array<{ wineId: string; effect: string; reason: string | null }>;
  summary: { dishes: number; dishesReordered: number; picksWithoutEffect: number };
};

const state = async (s: Session) => { const r = await get(s, `/api/v1/restaurants/${HALKA}/picks`); return { body: (await r.json()) as Picks, etag: r.headers.get('etag') }; };
const put = async (s: Session, wineId: string, body: unknown, headers?: Record<string, string>) =>
  send(s, 'PUT', `/api/v1/wines/${wineId}/pick?restaurant=${HALKA}`, body, headers ?? { 'if-match': `"${(await state(s)).body.version}"` });
const simulate = async (s: Session, q = '') => (await (await get(s, `/api/v1/restaurants/${HALKA}/picks/simulation${q}`)).json()) as Simulation;

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [tomasz, marta] = [await halkaManager(), await halkaSommelier()];
  wines = await queryDatabase<{ id: string; name: string }>(db(), `select w.id, w.name from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.active and w.deleted_at is null order by w.id`, [HALKA]);
}, 120_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('the picks API (R16)', () => {
  it('the General Manager marks wines with the version of the set; a missing version is 428, a stale one 409, the sixth pick 422, and the Wine Director reads but is refused', async () => {
    const empty = await state(tomasz);
    expect(empty.body).toMatchObject({ picks: [], max: 5 });
    expect(empty.etag).toBe(`"${empty.body.version}"`);
    expect((await put(tomasz, wines[0].id, { on: true }, {})).status).toBe(428);
    expect((await put(tomasz, wines[0].id, { on: true }, { 'if-match': 'garbage' })).status).toBe(400);
    const first = await put(tomasz, wines[0].id, { on: true }, { 'if-match': empty.etag! });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ changed: true, count: 1 });
    // the same stale version again: 409, and the set is what the first save made it
    expect(await errorCode(await put(tomasz, wines[1].id, { on: true }, { 'if-match': empty.etag! }))).toBe('version_conflict');
    expect((await state(tomasz)).body.picks.map((p) => p.wineId)).toEqual([wines[0].id]);
    // idempotent: marking a marked wine changes nothing and writes no history row
    expect(await (await put(tomasz, wines[0].id, { on: true })).json()).toMatchObject({ changed: false, count: 1 });
    expect((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from pick_edit', []))[0].n).toBe('1');
    for (const w of wines.slice(1, 5)) expect((await put(tomasz, w.id, { on: true })).status).toBe(200);
    const sixth = await put(tomasz, wines[5].id, { on: true });
    expect(sixth.status).toBe(422);
    expect(await errorCode(sixth)).toBe('too_many_picks');
    expect((await state(tomasz)).body.picks).toHaveLength(5);
    // the Wine Director sees the set and the simulation, and may not change it
    const seen = await state(marta);
    expect(seen.body.picks).toHaveLength(5);
    expect(seen.body.picks.every((p) => p.setBy === 'Tomasz Lis' && p.active && !p.published)).toBe(true);
    expect((await put(marta, wines[0].id, { on: false })).status).toBe(403);
    expect((await simulate(marta)).tried).toHaveLength(5);
    // the history: one row per change, with the actor and the set before and after
    const edits = await queryDatabase<{ actor: string; enabled: boolean; before: string[]; after: string[] }>(db(), 'select actor, enabled, before, after from pick_edit order by at, id', []);
    expect(edits).toHaveLength(5);
    expect(edits.every((e) => e.actor === 'Tomasz Lis' && e.enabled)).toBe(true);
    // unmark all again: the set is empty, a wine that is not a pick stays a no-op
    for (const w of wines.slice(0, 5)) expect((await put(tomasz, w.id, { on: false })).status).toBe(200);
    expect((await state(tomasz)).body.picks).toEqual([]);
  });

  it('the simulation shows what a publish would change and is no more than that: after the publish the lists are the same and nothing was written', async () => {
    // the simulation promises equality with the guest only when the picks are the one unpublished change: other test files share this
    // database and may leave a decision unpublished, so start from a published baseline
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    for (const w of wines.slice(0, 5)) expect((await put(tomasz, w.id, { on: true })).status).toBe(200);
    const tables = async () => queryDatabase<{ t: string; d: string }>(db(), `select 'picks' as t, coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') as d from restaurant_pick x union all select 'edits', coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from pick_edit x union all select 'versions', coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from published_version x`, []);
    const before = await tables();
    const now = await simulate(marta);
    expect(now.summary.dishes).toBeGreaterThan(0);
    expect(now.tried).toHaveLength(5);
    // five picks on the Halka menu reorder at least one dish; no Match Score differs between the two lists of a dish
    expect(now.summary.dishesReordered).toBeGreaterThan(0);
    for (const d of now.dishes) {
      const score = new Map([...d.before, ...d.after].map((i) => [i.wineId, i.matchScore]));
      for (const i of [...d.before, ...d.after]) expect(i.matchScore).toBe(score.get(i.wineId));
      expect(d.before.every((i) => !i.restaurantPick)).toBe(true);
      expect(d.after.filter((i) => i.tier < 2)).toEqual(d.before.filter((i) => i.tier < 2));
    }
    expect(now.picks.every((p) => (p.effect === 'none') === (p.reason !== null))).toBe(true);
    // a set from the URL replaces the working set; an empty one is "no picks": nothing to show
    expect((await simulate(marta, '?picks=')).summary.dishesReordered).toBe(0);
    expect((await simulate(marta, `?picks=${wines[0].id}`)).tried).toEqual([wines[0].id]);
    expect((await get(marta, `/api/v1/restaurants/${HALKA}/picks/simulation?picks=${wines.slice(0, 6).map((w) => w.id).join(',')}`)).status).toBe(422);
    expect((await get(marta, `/api/v1/restaurants/${HALKA}/picks/simulation?dish=${wines[0].id}`)).status).toBe(404);
    expect(await tables()).toEqual(before);

    // publish: the Wine Director publishes the General Manager's picks; the simulation then has nothing left to change
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    const done = await simulate(marta);
    expect(done.published).toBe(true);
    for (const d of done.dishes) expect(d.before).toEqual(d.after);
    expect(done.summary.dishesReordered).toBe(0);
    const afterPublish = await state(marta);
    expect(afterPublish.body.picks.every((p) => p.published)).toBe(true);
    // the "after" of the earlier simulation is the "before" of the published set (the picks were the only change)
    for (const d of now.dishes) expect(done.dishes.find((x) => x.dishId === d.dishId)!.before).toEqual(d.after);
  });
});
