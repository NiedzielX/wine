import { describe, expect, it } from 'vitest';
import { can } from '../src/auth/permissions';
import type { Role } from '../src/auth/types';
import { buildDemoDataset } from '../src/demo/dataset';
import { DomainError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { PICKS_MAX } from '../src/ranking/restaurant-picks';
import { PicksService } from '../src/services/picks/picks-service';
import { picksVersion } from '../src/services/picks/picks-rules';
import { PublishService } from '../src/services/publishing/publish-service';
import { pickSetSchema } from '../src/validators/picks/pick.schema';
import { simulationQueryFromSearch, simulationQuerySchema } from '../src/validators/picks/simulation.schema';

/** Spec 2026-11-18-restaurant-picks, PR1b: the picks service, the permission and the schemas (R2, R4, R16; AC5, AC10). */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Nowak' };
const active = ds.wines.filter((w) => w.active).map((w) => w.id).sort();
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function setup() {
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  const clock = { now: () => new Date('2026-11-19T10:00:00.000Z') };
  const idGenerator = { uuid };
  return { store, repos, picks: new PicksService({ ...repos, clock, idGenerator }), publish: new PublishService({ ...repos, clock, idGenerator }) };
}

const code = async (p: Promise<unknown>) => {
  try { await p; return 'ok'; } catch (e) { return e instanceof DomainError ? e.code : 'other'; }
};

describe('picks.edit (R4, AC10)', () => {
  it('belongs to the owner and the general manager; the Wine Director sees the screen (panel.view) but does not change the set', () => {
    const roles: Role[] = ['owner', 'manager', 'sommelier', 'waiter'];
    expect(roles.filter((r) => can(r, 'picks.edit'))).toEqual(['owner', 'manager']);
    expect(can('sommelier', 'panel.view')).toBe(true);
    expect(can('waiter', 'panel.view')).toBe(false);
  });
});

describe('PicksService.set (R2, AC5)', () => {
  it('marks a wine, answers with the new fingerprint, writes one history row with the actor and is idempotent', async () => {
    const { picks, repos } = setup();
    const empty = await picks.list('halka');
    expect(empty).toMatchObject({ picks: [], max: PICKS_MAX, version: picksVersion([]) });
    const r = await picks.set('halka', active[0], true, ACTOR, { expectedVersion: empty.version });
    expect(r).toEqual({ changed: true, version: picksVersion([active[0]]) });
    const again = await picks.set('halka', active[0], true, ACTOR);
    expect(again).toEqual({ changed: false, version: r.version });
    const edits = await repos.picksRepository.listEdits(RID);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ wineId: active[0], enabled: true, actor: 'Tomasz Nowak', actorId: ACTOR.id, before: [], after: [active[0]] });
    expect((await picks.set('halka', active[0], false, ACTOR)).changed).toBe(true);
    expect((await picks.set('halka', active[0], false, ACTOR)).changed).toBe(false);
    expect(await repos.picksRepository.listEdits(RID)).toHaveLength(2);
  });

  it('the sixth pick is too_many_picks, a stale fingerprint is version_conflict, an inactive wine cannot be marked', async () => {
    const { picks, store } = setup();
    for (const id of active.slice(0, PICKS_MAX)) await picks.set('halka', id, true, ACTOR);
    expect(await code(picks.set('halka', active[PICKS_MAX], true, ACTOR))).toBe('too_many_picks');
    expect((await picks.list('halka')).picks).toHaveLength(PICKS_MAX);
    expect(await code(picks.set('halka', active[0], false, ACTOR, { expectedVersion: picksVersion([]) }))).toBe('version_conflict');
    expect((await picks.list('halka')).picks).toHaveLength(PICKS_MAX);
    const spare = store.wines.get(RID)!.find((x) => !active.slice(0, PICKS_MAX).includes(x.id))!;
    spare.active = false;
    expect(await code(picks.set('halka', spare.id, true, ACTOR))).toBe('wine_inactive');
  });

  it('an unknown wine, a wine that is not a UUID and an unknown restaurant are not found', async () => {
    const { picks, repos } = setup();
    for (const id of ['00000000-0000-4000-8000-ffffffffffff', 'not-a-uuid', '../1']) expect(await code(picks.set('halka', id, true, ACTOR))).toBe('not_found');
    expect(await code(picks.set('nowhere', active[0], true, ACTOR))).toBe('not_found');
    expect(await code(picks.list('nowhere'))).toBe('not_found');
    expect(await repos.picksRepository.listEdits(RID)).toEqual([]);
  });

  it('list says which picks guests already see and keeps an inactive pick in the set', async () => {
    const { picks, publish, store } = setup();
    await picks.set('halka', active[0], true, ACTOR);
    await picks.set('halka', active[1], true, ACTOR);
    expect((await picks.list('halka')).picks.map((p) => p.published)).toEqual([false, false]);
    await publish.publish('halka', ACTOR);
    await picks.set('halka', active[2], true, ACTOR);
    const state = await picks.list('halka');
    expect(state.picks.map((p) => [p.wineId, p.published])).toEqual([[active[0], true], [active[1], true], [active[2], false]]);
    expect(state.picks[0]).toMatchObject({ name: ds.wines.find((w) => w.id === active[0])!.name, active: true });
    store.wines.get(RID)!.find((w) => w.id === active[0])!.active = false;
    const after = await picks.list('halka');
    expect(after.picks).toHaveLength(3);
    expect(after.picks.find((p) => p.wineId === active[0])).toMatchObject({ active: false, published: false });
    expect(after.version).toBe(state.version);
  });
});

describe('PicksService.list: removed (PR3, A27)', () => {
  it('names the wines guests still see as picks that are no longer marked, and drops them once published', async () => {
    const { picks, publish } = setup();
    await picks.set('halka', active[0], true, ACTOR);
    await picks.set('halka', active[1], true, ACTOR);
    expect((await picks.list('halka')).removed).toEqual([]);
    await publish.publish('halka', ACTOR);
    await picks.set('halka', active[0], false, ACTOR);
    const state = await picks.list('halka');
    expect(state.removed.map((r) => r.wineId)).toEqual([active[0]]);
    expect(state.picks.map((p) => p.wineId)).toEqual([active[1]]);
    const p = await publish.preview('halka');
    expect([p.pendingPicksAdded, p.pendingPicksRemoved, p.pendingPicks]).toEqual([0, 1, 1]);
    await picks.set('halka', active[2], true, ACTOR);
    const q = await publish.preview('halka');
    expect([q.pendingPicksAdded, q.pendingPicksRemoved, q.pendingPicks]).toEqual([1, 1, 2]);
    await publish.publish('halka', ACTOR);
    expect((await picks.list('halka')).removed).toEqual([]);
  });
});

describe('schemas (R16)', () => {
  it('the pick body is {on, expectedVersion?} and nothing else', () => {
    expect(pickSetSchema.safeParse({ on: true }).success).toBe(true);
    expect(pickSetSchema.safeParse({ on: false, expectedVersion: picksVersion([]) }).success).toBe(true);
    for (const bad of [{}, { on: 'yes' }, { on: true, extra: 1 }, { on: true, restaurantId: 'x' }, { on: true, expectedVersion: 'v1' }, { on: true, expectedVersion: 3 }]) {
      expect(pickSetSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('the simulation query reads only picks and dish, counts a repeated id once and allows at most PICKS_MAX', () => {
    const q = (s: string) => {
      const pairs = s.split('&').filter((x) => x !== '').map((x) => x.split('=') as [string, string]);
      return simulationQueryFromSearch((k) => pairs.filter(([name]) => name === k).map(([, v]) => v));
    };
    expect(q('')).toEqual({});
    expect(q('picks=')).toEqual({ picks: [] });
    expect(q('picks=a,b&picks=b,c&dish=d&__proto__=x&constructor=y')).toEqual({ picks: ['a', 'b', 'c'], dish: 'd' });
    expect(simulationQuerySchema.safeParse(q('picks=a,b,c,d,e')).success).toBe(true);
    expect(simulationQuerySchema.safeParse(q('picks=a,b,c,d,e,f')).success).toBe(false);
    expect(simulationQuerySchema.safeParse({ picks: ['a'], extra: 1 }).success).toBe(false);
    expect(simulationQuerySchema.safeParse({ picks: [''] }).success).toBe(false);
  });
});
