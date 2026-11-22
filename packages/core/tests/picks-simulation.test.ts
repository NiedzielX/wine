import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DomainError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { PICKS_MAX, PICK_MIN_SCORE } from '../src/ranking/restaurant-picks';
import { PicksService } from '../src/services/picks/picks-service';
import { PicksSimulationService, type DishSimulation, type SimulatedItem } from '../src/services/picks/picks-simulation-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { PublishService } from '../src/services/publishing/publish-service';

/** Spec 2026-11-18-restaurant-picks, PR1b: the "before / after" simulator (R13, R15; AC9). */

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
  return {
    store, repos,
    picks: new PicksService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    sim: new PicksSimulationService(repos),
    guest: new RecommendationService(repos)
  };
}

/** The guest's list as the simulator reports it (default preferences, English, the engine's default length). */
async function guestList(guest: RecommendationService, dishId: string): Promise<SimulatedItem[]> {
  const r = await guest.forDish('halka', dishId, {}, undefined, 'en');
  return r!.result.items.map((i) => ({
    wineId: i.wine.id, producer: i.wine.producer, name: i.wine.name, matchScore: i.matchScore, tier: i.tier,
    sommelierPair: i.tier < 2, restaurantPick: i.restaurantPick === true
  }));
}

const code = async (p: Promise<unknown>) => {
  try { await p; return 'ok'; } catch (e) { return e instanceof DomainError ? e.code : 'other'; }
};

describe('the lists (R13, R15, AC9)', () => {
  it('"before" is the guest list now and "after" is the guest list after the publish, for every dish, when the picks are the only change', async () => {
    const { sim, picks, publish, guest } = setup();
    // a published version first, so that "now" is a real version
    await publish.publish('halka', ACTOR);
    const wantedSet = active.slice(0, PICKS_MAX);
    const now = await sim.simulate('halka', { picks: wantedSet });
    expect(now.published).toBe(true);
    for (const d of now.dishes) expect(d.before).toEqual(await guestList(guest, d.dishId));
    for (const id of wantedSet) await picks.set('halka', id, true, ACTOR);
    expect((await sim.simulate('halka')).dishes).toEqual(now.dishes);
    await publish.publish('halka', ACTOR);
    for (const d of now.dishes) expect(d.after).toEqual(await guestList(guest, d.dishId));
    const done = await sim.simulate('halka');
    for (const d of done.dishes) expect(d.before).toEqual(d.after);
    expect(done.summary.dishesReordered).toBe(0);
  });

  it('never changes a Match Score and describes every move; with five picks at least one dish changes order', async () => {
    const { sim } = setup();
    const s = await sim.simulate('halka', { picks: active.slice(0, PICKS_MAX) });
    expect(s.summary.dishes).toBe(ds.dishes.filter((d) => d.status === 'published').length);
    const scoreOf = (d: DishSimulation, id: string) => [...d.before, ...d.after].filter((i) => i.wineId === id).map((i) => i.matchScore);
    for (const d of s.dishes) {
      for (const m of d.moves) {
        const scores = new Set(scoreOf(d, m.wineId));
        expect(scores.size, `${d.dishName} ${m.wineId}`).toBe(1);
        expect(m.from === m.to).toBe(false);
      }
      expect(d.reordered).toBe(d.moves.length > 0);
      // the sommelier's pairs keep their company and their place, seal and no pick mark
      expect(d.after.filter((i) => i.tier < 2)).toEqual(d.before.filter((i) => i.tier < 2));
      for (const i of d.after) if (i.sommelierPair) expect(i.restaurantPick).toBe(false);
    }
    expect(s.summary.dishesReordered).toBeGreaterThan(0);
    expect(s.summary.dishesReordered).toBe(s.dishes.filter((d) => d.reordered).length);
  });

  it('is a read: the store is the same before and after, and a dish can be asked for alone', async () => {
    const { sim, store } = setup();
    const before = JSON.stringify([store.picks, store.pickEdits, [...store.wines.entries()], [...store.dishes.entries()]]);
    const all = await sim.simulate('halka', { picks: active.slice(0, 3) });
    const one = await sim.simulate('halka', { picks: active.slice(0, 3), dishId: all.dishes[1].dishId });
    expect(one.dishes).toEqual([all.dishes[1]]);
    expect(JSON.stringify([store.picks, store.pickEdits, [...store.wines.entries()], [...store.dishes.entries()]])).toBe(before);
    expect(await code(sim.simulate('halka', { dishId: '00000000-0000-4000-8000-ffffffffffff' }))).toBe('not_found');
    expect(await code(sim.simulate('halka', { dishId: 'not-a-uuid' }))).toBe('not_found');
    expect(await code(sim.simulate('nowhere'))).toBe('not_found');
    expect(await code(sim.simulate('halka', { picks: active.slice(0, PICKS_MAX + 1) }))).toBe('validation_failed');
  });
});

describe('why a pick changes nothing (R13)', () => {
  it('names a reason for every dish where a pick has no effect, and none where it has', async () => {
    const { sim } = setup();
    const s = await sim.simulate('halka', { picks: active.slice(0, PICKS_MAX) });
    for (const d of s.dishes) {
      for (const p of d.picks) {
        expect(p.effect === 'none', `${d.dishName} ${p.wineId}`).toBe(p.reason !== null);
        const shown = d.after.find((i) => i.wineId === p.wineId);
        if (p.effect !== 'none') expect(shown?.restaurantPick).toBe(true);
        else expect(shown?.restaurantPick ?? false).toBe(false);
        if (p.reason === 'below_min_score') expect(shown?.matchScore ?? 0).toBeLessThan(PICK_MIN_SCORE);
        if (p.reason === 'sommelier_pair') expect(shown?.sommelierPair ?? true).toBe(true);
      }
    }
    for (const p of s.picks) {
      expect(p.dishesMoved + p.dishesLabelled > 0).toBe(p.effect !== 'none');
      expect(p.reasons.every((r) => r.dishes > 0)).toBe(true);
    }
    expect(s.summary.picksWithoutEffect).toBe(s.picks.filter((p) => p.effect === 'none').length);
    const reasons = new Set(s.dishes.flatMap((d) => d.picks.map((p) => p.reason)));
    expect(reasons.size).toBeGreaterThan(1);
  });

  it('an inactive wine is "inactive", a pair of the sommelier is "sommelier_pair", with the unreviewed filter on a tier-2 pick is hidden', async () => {
    const { sim, store, repos } = setup();
    const off = active[0];
    store.wines.get(RID)!.find((w) => w.id === off)!.active = false;
    const s = await sim.simulate('halka', { picks: [off] });
    expect(s.picks).toEqual([expect.objectContaining({ wineId: off, effect: 'none', reason: 'inactive', dishesMoved: 0 })]);
    // a wine that is the primary pair of a dish
    const pair = ds.pairings.find((p) => p.status === 'approved' && p.role === 'primary' && p.wineId !== off)!;
    const asPair = await sim.simulate('halka', { picks: [pair.wineId], dishId: pair.dishId });
    expect(asPair.dishes[0].picks).toEqual([{ wineId: pair.wineId, effect: 'none', reason: 'sommelier_pair' }]);
    expect(asPair.dishes[0].before[0].wineId).toBe(pair.wineId);
    expect(asPair.dishes[0].after[0]).toMatchObject({ wineId: pair.wineId, sommelierPair: true, restaurantPick: false });
    // the unreviewed filter hides tier 2, picks included
    const r = await repos.restaurantRepository.findBySlug('halka');
    store.restaurants.find((x) => x.id === r!.id)!.settings = { ...(r!.settings ?? { showScores: true }), showUnreviewed: false, showScores: true };
    const hidden = await sim.simulate('halka', { picks: active.slice(1, PICKS_MAX + 1) });
    for (const d of hidden.dishes) {
      expect(d.after.every((i) => i.tier < 2)).toBe(true);
      for (const p of d.picks) expect(['unreviewed_hidden', 'sommelier_pair', 'not_in_list']).toContain(p.reason);
    }
  });

  it('an id that is not a wine of the restaurant gets one answer, whatever it is: unknown, not a UUID or another restaurant\'s', async () => {
    const { sim } = setup();
    const answers = await Promise.all(['00000000-0000-4000-8000-ffffffffffff', 'not-a-uuid'].map((id) => sim.simulate('halka', { picks: [id] })));
    const strip = (x: Awaited<ReturnType<typeof sim.simulate>>, id: string) => JSON.parse(JSON.stringify(x).split(id).join('ID'));
    expect(strip(answers[0], '00000000-0000-4000-8000-ffffffffffff')).toEqual(strip(answers[1], 'not-a-uuid'));
    expect(answers[0].picks).toEqual([expect.objectContaining({ name: null, inPublishedSet: false, effect: 'none', reason: 'not_in_list' })]);
    expect(answers[0].dishes.every((d) => d.reordered === false)).toBe(true);
  });
});
