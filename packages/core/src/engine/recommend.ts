import type { Dish, GuestPreferences, Pairing, PairingRole, Wine } from '../domain/types';
import { pairingScore } from './scoring';

/**
 * Ranking layer on top of pairing_score. Deterministic:
 *   1. hard filters (active, serving, style, budget, rejected pairings)
 *   2. model score + soft preference adjustments
 *   3. sommelier tiers: Primary > other sommelier picks (by rank) > model picks
 *   4. ties broken by score desc, price asc, wine id asc
 */

export const MIN_MODEL_SCORE = 62;
export const SOMMELIER_BOOST = 6;
export const DEFAULT_LIMIT = 4;

export type Serving = 'glass' | 'bottle';

export interface RecommendationItem {
  wine: Wine;
  /** displayed Match Score — always the engine score, never inflated */
  matchScore: number;
  /** internal ranking score (model + boosts + preferences) */
  rankScore: number;
  tier: 0 | 1 | 2;
  sommelier: { role: PairingRole | null; comment: string | null; status: Pairing['status'] } | null;
  bestValue: boolean;
  why: string;
  /** how the guest would buy it under the current preferences */
  servings: Serving[];
  /** price used for budget filtering and display */
  displayPrice: number;
  displayServing: Serving;
}

export interface RecommendationResult {
  items: RecommendationItem[];
  /** set when filters were relaxed to avoid an empty screen */
  notice: string | null;
  filteredOut: number;
}

export function servingsFor(wine: Wine, serving: GuestPreferences['serving']): Serving[] {
  const s: Serving[] = [];
  if (wine.glassPrice !== null && serving !== 'bottle') s.push('glass');
  if (serving !== 'glass') s.push('bottle');
  return s;
}

export function priceFor(wine: Wine, serving: GuestPreferences['serving']): { price: number; serving: Serving } {
  if (serving === 'bottle' || wine.glassPrice === null) return { price: wine.bottlePrice, serving: 'bottle' };
  return { price: wine.glassPrice, serving: 'glass' };
}

export function passesHardFilters(wine: Wine, prefs: GuestPreferences, ignoreBudget = false): boolean {
  if (!wine.active) return false;
  if (prefs.serving === 'glass' && wine.glassPrice === null) return false;
  if (prefs.styles.length > 0 && !prefs.styles.includes(wine.profile.style)) return false;
  if (!ignoreBudget && prefs.maxPrice !== null && priceFor(wine, prefs.serving).price > prefs.maxPrice) return false;
  return true;
}

export function preferenceAdjustment(wine: Wine, prefs: GuestPreferences): number {
  let adj = 0;
  if (prefs.weight === 'lighter') adj += wine.profile.body <= 2 ? 4 : wine.profile.body >= 4 ? -4 : 0;
  if (prefs.weight === 'fuller') adj += wine.profile.body >= 4 ? 4 : wine.profile.body <= 2 ? -4 : 0;
  if (prefs.mood === 'adventurous') adj += wine.profile.adventurous ? 5 : 0;
  if (prefs.mood === 'classic') adj += wine.profile.adventurous ? -5 : 0;
  return adj;
}

function tierFor(p: Pairing | undefined): 0 | 1 | 2 {
  if (!p || (p.status !== 'approved' && p.status !== 'modified')) return 2;
  return p.role === 'primary' ? 0 : 1;
}

export function compareItems(a: RecommendationItem, b: RecommendationItem, pa?: Pairing, pb?: Pairing): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.tier === 1) {
    const ra = pa?.rank ?? 99;
    const rb = pb?.rank ?? 99;
    if (ra !== rb) return ra - rb;
  }
  if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;
  if (a.displayPrice !== b.displayPrice) return a.displayPrice - b.displayPrice;
  return a.wine.id.localeCompare(b.wine.id);
}

export function recommendForDish(
  dish: Dish,
  wines: Wine[],
  pairings: Pairing[],
  prefs: GuestPreferences,
  limit = DEFAULT_LIMIT
): RecommendationResult {
  const forDish = new Map(pairings.filter((p) => p.dishId === dish.id).map((p) => [p.wineId, p]));

  const build = (ignoreBudget: boolean) => {
    const out: Array<{ item: RecommendationItem; pairing?: Pairing }> = [];
    let filteredOut = 0;
    for (const wine of wines) {
      const pairing = forDish.get(wine.id);
      if (pairing?.status === 'rejected') continue;
      if (!passesHardFilters(wine, prefs, ignoreBudget)) { if (wine.active) filteredOut++; continue; }
      const { score, why } = pairingScore(dish, wine);
      const tier = tierFor(pairing);
      if (tier === 2 && score < MIN_MODEL_SCORE) continue;
      const { price, serving } = priceFor(wine, prefs.serving);
      out.push({
        pairing,
        item: {
          wine,
          matchScore: score,
          rankScore: score + preferenceAdjustment(wine, prefs) + (tier < 2 ? SOMMELIER_BOOST : 0),
          tier,
          sommelier: tier < 2 && pairing ? { role: pairing.role, comment: pairing.comment, status: pairing.status } : null,
          bestValue: false,
          why: pairing?.comment ?? why,
          servings: servingsFor(wine, prefs.serving),
          displayPrice: price,
          displayServing: serving
        }
      });
    }
    out.sort((a, b) => compareItems(a.item, b.item, a.pairing, b.pairing));
    return { list: out.slice(0, limit).map((x) => x.item), filteredOut };
  };

  const first = build(false);
  const { filteredOut } = first;
  let list = first.list;
  let notice: string | null = null;
  if (list.length === 0 && prefs.maxPrice !== null) {
    list = build(true).list.slice(0, 2);
    if (list.length > 0) notice = `Nothing matches under ${prefs.maxPrice} zł. These are the closest options.`;
  }
  markBestValue(list);
  return { items: list, notice, filteredOut };
}

/**
 * Best value: a sommelier "best_value" pick wins. Otherwise the cheapest wine (by bottle price)
 * within 8 points of the top match score, excluding the top item itself.
 */
export function markBestValue(list: RecommendationItem[]): void {
  const somm = list.find((i) => i.sommelier?.role === 'best_value');
  if (somm) { somm.bestValue = true; return; }
  if (list.length < 2) return;
  const top = Math.max(...list.map((i) => i.matchScore));
  const candidates = list.slice(1).filter((i) => i.matchScore >= top - 8 && i.wine.bottlePrice < list[0].wine.bottlePrice);
  candidates.sort((a, b) => a.wine.bottlePrice - b.wine.bottlePrice || a.wine.id.localeCompare(b.wine.id));
  if (candidates[0]) candidates[0].bestValue = true;
}
