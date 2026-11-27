import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS } from '../src/domain/types';
import { recommendForDish } from '../src/engine/recommend';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { rankForGuest } from '../src/ranking/rank-for-guest';
import { PICKS_MAX } from '../src/ranking/restaurant-picks';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { usageItem, usagePick } from '../src/services/guest/usage-events';
import { PicksService } from '../src/services/picks/picks-service';
import { PublishService } from '../src/services/publishing/publish-service';
import { loadPublishedView } from '../src/services/publishing/published-view';

/**
 * Spec 2026-11-18-restaurant-picks, PR2: the guest service ranks the published version with the version's picks through
 * the one shared function (R11), the mark reaches the item (R9), and the events carry the flag (U7). AC1, AC7, AC14.
 */

const ds = buildDemoDataset({ ids: 'uuid' });
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Nowak' };
const active = ds.wines.filter((w) => w.active).map((w) => w.id).sort();
const published = ds.dishes.filter((d) => d.status === 'published');
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function setup() {
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  const clock = { now: () => new Date('2026-11-22T10:00:00.000Z') };
  const idGenerator = { uuid };
  return {
    store, repos,
    picks: new PicksService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    guest: new RecommendationService(repos)
  };
}

/** Publishes, marks the first `n` active wines and publishes again; returns the services. */
async function withPublishedPicks(n = PICKS_MAX) {
  const s = setup();
  await s.publish.publish('halka', ACTOR);
  for (const id of active.slice(0, n)) await s.picks.set('halka', id, true, ACTOR);
  await s.publish.publish('halka', ACTOR);
  return s;
}

const lists = async (guest: RecommendationService, prefs = {}) =>
  Promise.all(published.map(async (d) => ({ dish: d, result: (await guest.forDish('halka', d.id, prefs, undefined, 'en'))!.result })));

describe('without published picks the list is the engine list as it always was (AC1)', () => {
  it('equals `recommendForDish` item for item, with no mark anywhere, also when picks are set but not published (AC7)', async () => {
    const { guest, publish, picks, repos } = setup();
    await publish.publish('halka', ACTOR);
    const view = await loadPublishedView(repos, ds.restaurant);
    for (const id of active.slice(0, PICKS_MAX)) await picks.set('halka', id, true, ACTOR);
    for (const { dish, result } of await lists(guest)) {
      const engine = recommendForDish(view.dish(dish.id)!, view.wines, view.pairings.filter((p) => p.dishId === dish.id), DEFAULT_PREFS, 4, 'en');
      expect(result).toEqual(engine);
      expect(result.items.some((i) => 'restaurantPick' in i)).toBe(false);
    }
  });
});

describe('with published picks (R11, R9, U1, U2)', () => {
  it('serves exactly what `rankForGuest` gives on the published view: no second copy of the path', async () => {
    const { guest, repos } = await withPublishedPicks();
    const view = await loadPublishedView(repos, ds.restaurant);
    expect(view.picks.size).toBe(PICKS_MAX);
    for (const { dish, result } of await lists(guest)) {
      const direct = rankForGuest({
        dish: view.dish(dish.id)!, wines: view.wines, pairings: view.pairings.filter((p) => p.dishId === dish.id), prefs: DEFAULT_PREFS,
        locale: 'en', picks: view.picks, showUnreviewed: (view.restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS).showUnreviewed
      });
      expect(result).toEqual(direct);
    }
  });

  it('changes no score or reason, leaves the sommelier\'s pairs as they were, and marks only engine items', async () => {
    const plain = setup();
    await plain.publish.publish('halka', ACTOR);
    const without = await lists(plain.guest);
    const { guest } = await withPublishedPicks();
    const withPicks = await lists(guest);
    let marked = 0;
    let reordered = 0;
    withPicks.forEach(({ dish, result }, k) => {
      const base = without[k].result;
      expect(base.items.filter((i) => i.tier < 2)).toEqual(result.items.filter((i) => i.tier < 2));
      for (const i of result.items) {
        const same = base.items.find((b) => b.wine.id === i.wine.id);
        if (same) {
          expect(i.matchScore, `${dish.name} ${i.wine.id}`).toBe(same.matchScore);
          expect(i.why).toBe(same.why);
        }
        if (i.restaurantPick) { marked += 1; expect(i.tier).toBe(2); expect(i.sommelier).toBeNull(); }
      }
      if (result.items.map((i) => i.wine.id).join() !== base.items.map((i) => i.wine.id).join()) reordered += 1;
      expect(result.items.filter((i) => i.bestValue).length).toBeLessThanOrEqual(1);
    });
    expect(marked).toBeGreaterThan(0);
    expect(reordered).toBeGreaterThan(0);
  });

  it('shows the same mark on the wine page as on the list for the same dish and default preferences (G3 = G7)', async () => {
    const { guest } = await withPublishedPicks();
    let checked = 0;
    for (const { dish, result } of await lists(guest)) {
      for (const i of result.items) {
        const d = await guest.wineDetails('halka', i.wine.id, dish.id, 'en');
        expect(d?.match?.restaurantPick === true, `${dish.name} ${i.wine.id}`).toBe(i.restaurantPick === true);
        expect(d?.match?.matchScore).toBe(i.matchScore);
        if (i.restaurantPick) checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('hides a pick with the other unreviewed wines when the restaurant shows only reviewed ones', async () => {
    const { guest, store } = await withPublishedPicks();
    const k = store.restaurants.findIndex((r) => r.id === ds.restaurant.id);
    const r = store.restaurants[k];
    store.restaurants[k] = { ...r, settings: { ...(r.settings ?? DEFAULT_RESTAURANT_SETTINGS), showUnreviewed: false } };
    for (const { result } of await lists(guest)) {
      expect(result.items.every((i) => i.tier < 2)).toBe(true);
      expect(result.items.some((i) => i.restaurantPick)).toBe(false);
    }
  });
});

describe('usage events carry the flag only on a labelled item (U7, AC14)', () => {
  it('writes `pick: true` for a labelled item and nothing at all otherwise', async () => {
    const { guest } = await withPublishedPicks();
    const items = (await lists(guest)).flatMap((l) => l.result.items);
    const labelled = items.find((i) => i.restaurantPick)!;
    const plain = items.find((i) => !i.restaurantPick)!;
    expect(usageItem(labelled)).toEqual({ wineId: labelled.wine.id, tier: 'engine', pick: true });
    expect('pick' in usageItem(plain)).toBe(false);
    expect(usagePick(labelled)).toEqual({ pick: true });
    expect(usagePick(plain)).toEqual({});
    expect(usagePick(null)).toEqual({});
  });
});
