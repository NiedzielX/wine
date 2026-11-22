import { DEFAULT_LIMIT, MIN_MODEL_SCORE, compareItems, markBestValue, type RecommendationItem, type RecommendationResult } from '../engine/recommend';

/**
 * The restaurant's picks: a layer of order AFTER the engine (spec 2026-11-18-restaurant-picks, R8–R10). Nothing here
 * is part of `engine/`: the engine stays a function of (dish, wines, pairings, preferences) and `ENGINE_VERSION` does
 * not change. The layer never touches a `matchScore`, `rankScore`, `why`, `tier` or `sommelier`; it only chooses the
 * order inside the engine's own group (tier 2), marks the wines that qualify and cuts the list to `limit`.
 *
 * Named rules (each has a test in `tests/restaurant-picks.test.ts`):
 * - `pick.tier2_only`: only items with `tier === 2` change places; tiers 0 and 1 (the sommelier's pairs) keep their
 *   place and their company, whatever the set of picks is.
 * - `pick.min_score`: a pick qualifies from a raw `matchScore` of `PICK_MIN_SCORE`.
 * - `pick.window`: and only within `PICK_WINDOW` points of the best `matchScore` of tier 2, so a 75 never stands above a 95.
 * - `pick.promote_cap`: at most `PICKS_PROMOTED_MAX` qualifying picks go to the front of tier 2, in the engine's order.
 * - `pick.no_seal`: the layer adds no seal and no sommelier role; the mark is `restaurantPick`.
 * - `pick.budget_untouched`: when the engine relaxed the budget (`notice`), nothing is moved or marked.
 * - `pick.deterministic`: ties are broken by the engine's own key (rank score, price, wine id), never by input order.
 */

/** At most this many wines may be marked by a restaurant. */
export const PICKS_MAX = 5;
/** A pick qualifies from this raw Match Score (a relation to the engine's floor, not a literal). */
export const PICK_MIN_SCORE = MIN_MODEL_SCORE + 13;
/** At most this many qualifying picks move to the front of the engine's group on one list. */
export const PICKS_PROMOTED_MAX = 2;
/** A pick qualifies only within this many points of the best `matchScore` of tier 2 (like `BEST_VALUE_WINDOW`). */
export const PICK_WINDOW = 10;
/**
 * The version of this layer's rules and constants, next to `ENGINE_VERSION` (R03: what a guest saw can be rebuilt).
 * Change it with any change of the constants or rules above. Not yet stored with the snapshot or the events.
 */
export const RANKING_LAYER_VERSION = 'wm-picks-1.0.0';

/**
 * A recommendation with the layer's mark. `restaurantPick` is present (and `true`) only on an item the restaurant
 * marked and that qualified; it is absent otherwise, so a list without any marked item is the engine's list as it is.
 * The type lives here, not in `engine/`, so the engine's types stay as they were.
 */
export interface RankedItem extends RecommendationItem {
  restaurantPick?: true;
}

export interface RankedResult extends Omit<RecommendationResult, 'items'> {
  items: RankedItem[];
}

/**
 * Applies the picks to an engine result computed with a `limit` of at least the whole list. Pure: the input is not
 * changed. `bestValue` is zeroed and counted again on the final list (`markBestValue` only ever sets it), and the list
 * is cut to `limit` on every path, the budget relaxation included.
 */
export function applyRestaurantPicks(result: RecommendationResult, picks: ReadonlySet<string>, limit: number = DEFAULT_LIMIT): RankedResult {
  const items: RankedItem[] = result.items.map((i) => ({ ...i, bestValue: false }));
  let ordered = items;

  if (result.notice === null && picks.size > 0) {
    const tier2 = items.filter((i) => i.tier === 2);
    const best = tier2.reduce((m, i) => Math.max(m, i.matchScore), -Infinity);
    const qualifies = (i: RankedItem) => picks.has(i.wine.id) && i.matchScore >= PICK_MIN_SCORE && i.matchScore >= best - PICK_WINDOW;
    const qualified = tier2.filter(qualifies).sort((a, b) => compareItems(a, b));
    for (const i of qualified) i.restaurantPick = true;
    const promoted = qualified.slice(0, PICKS_PROMOTED_MAX);
    const rest = tier2.filter((i) => !promoted.includes(i)).sort((a, b) => compareItems(a, b));
    ordered = [...items.filter((i) => i.tier < 2), ...promoted, ...rest];
  }

  const list = ordered.slice(0, limit);
  markBestValue(list);
  return { items: list, notice: result.notice, filteredOut: result.filteredOut };
}
