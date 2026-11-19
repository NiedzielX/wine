import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEFAULT_PREFS } from '../src/domain/types';
import { BEST_VALUE_WINDOW, MIN_MODEL_SCORE, markBestValue, recommendForDish, type RecommendationItem, type RecommendationResult } from '../src/engine/recommend';
import { ENGINE_VERSION } from '../src/engine/scoring';
import { rankForGuest } from '../src/ranking/rank-for-guest';
import {
  PICK_MIN_SCORE, PICK_WINDOW, PICKS_MAX, PICKS_PROMOTED_MAX, RANKING_LAYER_VERSION, applyRestaurantPicks, type RankedItem
} from '../src/ranking/restaurant-picks';

/**
 * Spec 2026-11-18-restaurant-picks, PR0: the picks layer after the engine (R8–R11, U1, U2; AC1–AC4 as far as the
 * layer goes). The service, the snapshot writer and the screens come in later steps.
 */

const ds = buildDemoDataset({ ids: 'uuid' });
const template = ds.wines[0];

/** A hand-made item: the layer reads the tier, the scores, the price and the wine id. */
function item(id: string, matchScore: number, over: Partial<RecommendationItem> = {}): RecommendationItem {
  return {
    wine: { ...template, id, name: id, bottlePrice: 200 },
    matchScore, rankScore: matchScore, tier: 2, sommelier: null, bestValue: false, why: `why ${id}`,
    servings: ['bottle'], displayPrice: 200, displayServing: 'bottle', ...over
  };
}
const pair = (id: string, matchScore: number, role: 'primary' | 'alternative'): RecommendationItem =>
  item(id, matchScore, { tier: role === 'primary' ? 0 : 1, rankScore: matchScore + 6, sommelier: { role, comment: null, status: 'approved' } });
const result = (items: RecommendationItem[], notice: string | null = null): RecommendationResult => ({ items, notice, filteredOut: 0 });
const ids = (items: RankedItem[]) => items.map((i) => i.wine.id);
const marked = (items: RankedItem[]) => items.filter((i) => i.restaurantPick).map((i) => i.wine.id);
const strip = (items: RankedItem[]) => items.map(({ restaurantPick: _p, ...rest }) => rest);
const set = (...x: string[]) => new Set(x);

describe('constants (R8)', () => {
  it('are stated once, as relations where the engine has the base', () => {
    expect(PICKS_MAX).toBe(5);
    expect(PICKS_PROMOTED_MAX).toBe(2);
    expect(PICK_MIN_SCORE).toBe(MIN_MODEL_SCORE + 13);
    expect(PICK_MIN_SCORE).toBe(75);
    expect(PICK_WINDOW).toBe(10);
    expect(RANKING_LAYER_VERSION).toMatch(/^wm-picks-\d+\.\d+\.\d+$/);
    // the layer is not the engine: its version is separate and the engine's is untouched by this step
    expect(RANKING_LAYER_VERSION).not.toBe(ENGINE_VERSION);
    expect(ENGINE_VERSION).toBe('wm-rules-1.2.0');
  });
});

describe('an empty set changes nothing (AC1)', () => {
  it('applyRestaurantPicks gives the engine list bit for bit, for every Halka dish', () => {
    for (const dish of ds.dishes) {
      const engine = recommendForDish(dish, ds.wines, ds.pairings, DEFAULT_PREFS, 4, 'en');
      const full = recommendForDish(dish, ds.wines, ds.pairings, DEFAULT_PREFS, ds.wines.length, 'en');
      expect(applyRestaurantPicks(full, new Set(), 4)).toEqual(engine);
    }
  });

  it('rankForGuest without picks is the engine call as it always was, with or without the unreviewed filter', () => {
    for (const dish of ds.dishes) {
      for (const showUnreviewed of [true, false]) {
        const engine = recommendForDish(dish, ds.wines, ds.pairings, DEFAULT_PREFS, 4, 'pl');
        if (!showUnreviewed) engine.items = engine.items.filter((i) => i.tier < 2);
        expect(rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'pl', showUnreviewed })).toEqual(engine);
        expect(rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'pl', showUnreviewed, picks: new Set() })).toEqual(engine);
      }
    }
  });

  it('a non-empty set with no qualifying pick is the engine list bit for bit (no field added)', () => {
    for (const dish of ds.dishes) {
      const engine = recommendForDish(dish, ds.wines, ds.pairings, DEFAULT_PREFS, 4, 'en');
      // wines that the engine does not list for the dish never qualify
      const listed = new Set(recommendForDish(dish, ds.wines, ds.pairings, DEFAULT_PREFS, ds.wines.length, 'en').items.map((i) => i.wine.id));
      const outside = new Set(ds.wines.filter((w) => !listed.has(w.id)).map((w) => w.id));
      const got = rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'en', showUnreviewed: true, picks: outside });
      expect(got).toEqual(engine);
      expect(got.items.some((i) => 'restaurantPick' in i)).toBe(false);
    }
  });
});

describe('pick.min_score and pick.window (AC3, O12)', () => {
  it('74 does not qualify and has no mark, 75 does', () => {
    const list = result([item('a', 80), item('b', 79), item('c', 74)]);
    const low = applyRestaurantPicks(list, set('c'), 4);
    expect(ids(low.items)).toEqual(['a', 'b', 'c']);
    expect(marked(low.items)).toEqual([]);
    const edge = applyRestaurantPicks(result([item('a', 80), item('b', 79), item('c', 75)]), set('c'), 4);
    expect(ids(edge.items)).toEqual(['c', 'a', 'b']);
    expect(marked(edge.items)).toEqual(['c']);
  });

  it('a pick more than PICK_WINDOW below the best of tier 2 stays in place and unmarked; exactly on the edge qualifies', () => {
    const outside = applyRestaurantPicks(result([item('a', 95), item('b', 90), item('c', 84)]), set('c'), 4);
    expect(ids(outside.items)).toEqual(['a', 'b', 'c']);
    expect(marked(outside.items)).toEqual([]);
    const edge = applyRestaurantPicks(result([item('a', 95), item('b', 90), item('c', 85)]), set('c'), 4);
    expect(ids(edge.items)).toEqual(['c', 'a', 'b']);
    expect(marked(edge.items)).toEqual(['c']);
  });

  it('the window counts from tier 2, not from the sommelier pair above it', () => {
    const got = applyRestaurantPicks(result([pair('p', 99, 'primary'), item('a', 80), item('c', 75)]), set('c'), 4);
    expect(ids(got.items)).toEqual(['p', 'c', 'a']);
  });
});

describe('pick.promote_cap (AC3)', () => {
  it('only PICKS_PROMOTED_MAX qualifying picks go first, in the engine order; the third keeps its place with the mark', () => {
    const list = result([item('a', 90), item('b', 88), item('c', 87), item('d', 86), item('e', 85)]);
    const got = applyRestaurantPicks(list, set('c', 'd', 'e'), 5);
    expect(ids(got.items)).toEqual(['c', 'd', 'a', 'b', 'e']);
    expect(marked(got.items)).toEqual(['c', 'd', 'e']);
  });

  it('a pick that is already first is only marked', () => {
    const got = applyRestaurantPicks(result([item('a', 90), item('b', 88)]), set('a'), 4);
    expect(ids(got.items)).toEqual(['a', 'b']);
    expect(marked(got.items)).toEqual(['a']);
  });
});

describe('pick.tier2_only and pick.no_seal (AC2, AC4, U2)', () => {
  it('the sommelier pairs keep their places and a picked pair is not marked', () => {
    const list = result([pair('p', 80, 'primary'), pair('q', 78, 'alternative'), item('a', 90), item('b', 88), item('c', 85)]);
    const got = applyRestaurantPicks(list, set('q', 'c'), 5);
    expect(ids(got.items)).toEqual(['p', 'q', 'c', 'a', 'b']);
    expect(marked(got.items)).toEqual(['c']);
    for (const i of got.items.filter((x) => x.tier < 2)) expect(i.sommelier).not.toBeNull();
    for (const i of got.items.filter((x) => x.restaurantPick)) expect(i.sommelier).toBeNull();
  });

  it('a pick never stands above tier 0 or 1, with any set, on the Halka menu (seeded property)', () => {
    let s = 20261118;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (const dish of ds.dishes) {
      const full = (picks?: Set<string>) => rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, limit: ds.wines.length, locale: 'en', showUnreviewed: true, picks });
      const base = full();
      const sommelierOf = (items: RankedItem[]) => items.filter((i) => i.tier < 2).map((i) => i.wine.id);
      for (let n = 0; n < 40; n++) {
        const picks = new Set(ds.wines.filter(() => rnd() < 0.4).slice(0, PICKS_MAX).map((w) => w.id));
        const got = full(picks);
        expect(sommelierOf(got.items)).toEqual(sommelierOf(base.items));
        expect(ids(got.items).slice(0, sommelierOf(base.items).length)).toEqual(sommelierOf(base.items));
        expect(got.items.some((i) => i.tier < 2 && i.restaurantPick)).toBe(false);
        // the same wines in the list, only the order of tier 2 differs
        expect([...ids(got.items)].sort()).toEqual([...ids(base.items)].sort());
        // U1: no score, reason or tier of any wine changes
        const byId = new Map(base.items.map((i) => [i.wine.id, i]));
        for (const i of got.items) {
          const b = byId.get(i.wine.id)!;
          expect([i.matchScore, i.rankScore, i.why, i.tier, i.sommelier]).toEqual([b.matchScore, b.rankScore, b.why, b.tier, b.sommelier]);
        }
      }
    }
  });
});

describe('scores and texts stay as the engine made them (U1, U4)', () => {
  it('matchScore, rankScore, why and every other field are equal by wine id, and the order differs only when a pick moves', () => {
    const items = [item('a', 90), item('b', 88), item('c', 80)];
    const got = applyRestaurantPicks(result(items), set('c'), 4);
    expect(ids(got.items)).toEqual(['c', 'a', 'b']);
    const byId = new Map(items.map((i) => [i.wine.id, i]));
    for (const i of strip(got.items)) expect(i).toEqual({ ...byId.get(i.wine.id)!, bestValue: expect.any(Boolean) });
  });

  it('does not change its input', () => {
    const list = result([item('a', 90), item('b', 80)]);
    const copy = structuredClone(list);
    applyRestaurantPicks(list, set('b'), 4);
    expect(list).toEqual(copy);
  });
});

describe('pick not in the list', () => {
  it('an unknown wine id or a wine the engine did not list changes nothing', () => {
    const list = result([item('a', 90), item('b', 80)]);
    const got = applyRestaurantPicks(list, set('zzz', 'not-listed'), 4);
    expect(ids(got.items)).toEqual(['a', 'b']);
    expect(marked(got.items)).toEqual([]);
  });
});

describe('pick.deterministic', () => {
  it('ties go by the engine key (price, then wine id), whatever the order of the input', () => {
    const base = [item('d', 80), item('c', 80), item('b', 80), item('a', 80, { displayPrice: 100 }), item('e', 70)];
    const picks = set('b', 'c', 'd');
    const want = ids(applyRestaurantPicks(result(base), picks, 5).items);
    expect(want).toEqual(['b', 'c', 'a', 'd', 'e']);
    const rotate = (a: RecommendationItem[], k: number) => [...a.slice(k), ...a.slice(0, k)];
    for (let k = 0; k < base.length; k++) {
      expect(ids(applyRestaurantPicks(result(rotate(base, k)), picks, 5).items)).toEqual(want);
      expect(ids(applyRestaurantPicks(result(rotate([...base].reverse(), k)), picks, 5).items)).toEqual(want);
    }
  });

  it('is the same on a second call', () => {
    const list = result([item('a', 90), item('b', 85), item('c', 80)]);
    expect(applyRestaurantPicks(list, set('c', 'b'), 3)).toEqual(applyRestaurantPicks(list, set('c', 'b'), 3));
  });
});

describe('budget relaxation (R10, B2)', () => {
  it('moves and marks nothing, but still cuts to the limit and counts best value again', () => {
    const list = result([item('a', 90), item('b', 88), item('c', 85)], 'Nothing matches under 50 zł.');
    const got = applyRestaurantPicks(list, set('c', 'b'), 2);
    expect(ids(got.items)).toEqual(['a', 'b']);
    expect(marked(got.items)).toEqual([]);
    expect(got.notice).toBe(list.notice);
  });
});

describe('limit and best value (B2)', () => {
  it('cuts to the limit and leaves exactly the flag markBestValue would set on the final list', () => {
    // the engine, asked for everything, flags a cheap wine at the end of the full list; after the cut it must not stay flagged
    const cheap = item('z', 70, { wine: { ...template, id: 'z', bottlePrice: 10 }, displayPrice: 10 });
    const full = result([item('a', 90), item('b', 89), item('c', 88), item('d', 87), item('e', 86), cheap]);
    full.items[5].bestValue = true; // as a full-limit engine run could leave it
    const got = applyRestaurantPicks(full, set('e'), 4);
    expect(got.items).toHaveLength(4);
    expect(ids(got.items)).toEqual(['e', 'a', 'b', 'c']);
    const expected = got.items.map((i) => ({ ...i, bestValue: false }));
    markBestValue(expected);
    expect(got.items.map((i) => i.bestValue)).toEqual(expected.map((i) => i.bestValue));
    expect(got.items.filter((i) => i.bestValue).length).toBeLessThanOrEqual(1);
  });

  it('a flag the engine set on the old order does not survive the reorder', () => {
    const dear = item('a', 90, { wine: { ...template, id: 'a', bottlePrice: 300 } });
    const stale = item('b', 88, { wine: { ...template, id: 'b', bottlePrice: 90 }, bestValue: true });
    const picked = item('c', 85, { wine: { ...template, id: 'c', bottlePrice: 50 } });
    const got = applyRestaurantPicks(result([dear, stale, picked]), set('c'), 3);
    expect(ids(got.items)).toEqual(['c', 'a', 'b']);
    // nothing is cheaper than the new first wine, so no wine is best value
    expect(got.items.some((i) => i.bestValue)).toBe(false);
  });

  it('best value follows the new order: it is chosen against the new first item', () => {
    const cheaper = item('b', 88, { wine: { ...template, id: 'b', bottlePrice: 90 } });
    const dear = item('a', 90, { wine: { ...template, id: 'a', bottlePrice: 300 } });
    const picked = item('c', 85, { wine: { ...template, id: 'c', bottlePrice: 400 } });
    expect(BEST_VALUE_WINDOW).toBeGreaterThanOrEqual(5);
    const got = applyRestaurantPicks(result([dear, cheaper, picked]), set('c'), 3);
    expect(ids(got.items)).toEqual(['c', 'a', 'b']);
    expect(got.items.filter((i) => i.bestValue).map((i) => i.wine.id)).toEqual(['b']);
  });
});

describe('rankForGuest with picks (R11)', () => {
  it('runs the engine on the whole list, cuts to the limit after the layer and marks the picks', () => {
    let proved = 0;
    for (const dish of ds.dishes) {
      const wholeList = rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, limit: ds.wines.length, locale: 'en', showUnreviewed: true });
      const tier2 = wholeList.items.filter((i) => i.tier === 2);
      if (tier2.length === 0) continue;
      const top = Math.max(...tier2.map((i) => i.matchScore));
      const defaultCut = new Set(rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'en', showUnreviewed: true }).items.map((i) => i.wine.id));
      // a wine that qualifies but is below the default cut of 4: only a pick can bring it in
      const candidate = tier2.find((i) => !defaultCut.has(i.wine.id) && i.matchScore >= PICK_MIN_SCORE && i.matchScore >= top - PICK_WINDOW);
      if (!candidate) continue;
      proved++;
      const got = rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'en', showUnreviewed: true, picks: set(candidate.wine.id) });
      expect(got.items).toHaveLength(4);
      expect(got.items.find((i) => i.wine.id === candidate.wine.id)?.restaurantPick).toBe(true);
    }
    expect(proved).toBeGreaterThan(0);
  });

  it('showUnreviewed false hides tier 2, picks included', () => {
    for (const dish of ds.dishes) {
      const all = new Set(ds.wines.map((w) => w.id));
      const got = rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs: DEFAULT_PREFS, locale: 'en', showUnreviewed: false, picks: all });
      expect(got.items.every((i) => i.tier < 2 && !i.restaurantPick)).toBe(true);
    }
  });

  it('a budget that relaxes keeps the engine order and marks nothing, with picks of any wine', () => {
    const dish = ds.dishes.find((d) => d.status === 'published')!;
    const prefs = { ...DEFAULT_PREFS, maxPrice: 1 };
    const engine = recommendForDish(dish, ds.wines, ds.pairings, prefs, 4, 'en');
    const got = rankForGuest({ dish, wines: ds.wines, pairings: ds.pairings, prefs, locale: 'en', showUnreviewed: true, picks: new Set(ds.wines.map((w) => w.id)) });
    expect(engine.notice).not.toBeNull();
    expect(got).toEqual(engine);
  });
});
