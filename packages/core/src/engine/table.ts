import type { Dish, GuestPreferences, Pairing, Wine } from '../domain/types';
import { passesHardFilters, preferenceAdjustment, priceFor, recommendForDish } from './recommend';
import type { Locale } from '../i18n/locale';
import { pairingScore } from './scoring';

/**
 * "Best bottle for the table".
 *
 * overall = 0.6 * weighted mean + 0.4 * weakest dish score
 * Weights: Mains 1.5, Starters 1.0. Desserts are scored separately (a shared bottle rarely
 * suits dessert), unless the table ordered only desserts.
 * A sommelier-approved pairing for a dish adds +3 to that dish's score inside the table calc.
 * A rejected pairing caps that dish at 50, so a wine the sommelier ruled out cannot win the table.
 */

export const TABLE_MEAN_WEIGHT = 0.6;
export const TABLE_MIN_WEIGHT = 0.4;
export const COMPROMISE_THRESHOLD = 76;
export const WEAK_DISH_THRESHOLD = 64;

export interface TableDishScore {
  dish: Dish;
  score: number;
  sommelierPick: boolean;
}

export interface TableItem {
  wine: Wine;
  overall: number;
  perDish: TableDishScore[];
  weakest: TableDishScore;
  price: number;
  serving: 'glass' | 'bottle';
  why: string;
}

export interface TableResult {
  items: TableItem[];
  /** dishes taken out of the bottle calculation (desserts) */
  setAside: Dish[];
  /** true when no single bottle is good enough for everything */
  splitSuggested: boolean;
  /** per-dish glass suggestions when a split is suggested */
  split: Array<{ dish: Dish; wine: Wine; score: number }>;
}

const weightOf = (d: Dish) => (d.category === 'Mains' ? 1.5 : 1);

export function recommendForTable(
  dishes: Dish[],
  wines: Wine[],
  pairings: Pairing[],
  prefs: GuestPreferences,
  limit = 3,
  /** language of the one-line reasons; English by default (the public API) */
  locale: Locale = 'en'
): TableResult {
  const savoury = dishes.filter((d) => d.category !== 'Desserts');
  const scored = savoury.length > 0 ? savoury : dishes;
  const setAside = savoury.length > 0 ? dishes.filter((d) => d.category === 'Desserts') : [];
  const tablePrefs: GuestPreferences = { ...prefs, serving: prefs.serving === 'any' ? 'bottle' : prefs.serving };

  const items: TableItem[] = [];
  for (const wine of wines) {
    if (!passesHardFilters(wine, tablePrefs)) continue;
    const perDish: TableDishScore[] = scored.map((dish) => {
      const p = pairings.find((x) => x.dishId === dish.id && x.wineId === wine.id);
      let score = pairingScore(dish, wine).score;
      const pick = !!p && (p.status === 'approved' || p.status === 'modified');
      if (pick) score = Math.min(99, score + 3);
      if (p?.status === 'rejected') score = Math.min(score, 50);
      return { dish, score, sommelierPick: pick };
    });
    const wSum = perDish.reduce((s, x) => s + weightOf(x.dish), 0);
    const mean = perDish.reduce((s, x) => s + x.score * weightOf(x.dish), 0) / wSum;
    const weakest = perDish.reduce((m, x) => (x.score < m.score ? x : m), perDish[0]);
    const overall = Math.round(TABLE_MEAN_WEIGHT * mean + TABLE_MIN_WEIGHT * weakest.score);
    const { price, serving } = priceFor(wine, tablePrefs.serving);
    items.push({ wine, overall, perDish, weakest, price, serving, why: tableWhy(perDish, locale) });
  }

  items.sort((a, b) => compareTableItems(a, b, prefs));

  const top = items.slice(0, limit);
  const splitSuggested = scored.length > 1 && (!top[0] || top[0].overall < COMPROMISE_THRESHOLD || top[0].weakest.score < WEAK_DISH_THRESHOLD);
  const split = splitSuggested
    ? scored.flatMap((dish) => {
        const r = recommendForDish(dish, wines, pairings, { ...prefs, serving: 'glass' }, 1, locale);
        return r.items[0] ? [{ dish, wine: r.items[0].wine, score: r.items[0].matchScore }] : [];
      })
    : [];

  return { items: top, setAside, splitSuggested, split };
}

/** The one-line reason under a table wine. Polish keeps dish names as written (no declension), in quotes. */
export function tableWhy(perDish: TableDishScore[], locale: Locale = 'en'): string {
  const sorted = [...perDish].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (locale === 'pl') {
    if (perDish.length === 1) return `Najlepiej pasuje do dania „${best.dish.name}”.`;
    if (worst.score >= 80) return 'Pasuje do wszystkich dań na stole.';
    if (worst.score >= 70) return `Najlepiej pasuje do dania „${best.dish.name}”, a do „${worst.dish.name}” też dobrze.`;
    return `Najlepiej pasuje do dania „${best.dish.name}”, przy „${worst.dish.name}” to kompromis.`;
  }
  if (perDish.length === 1) return `Best with the ${best.dish.name.toLowerCase()}.`;
  if (worst.score >= 80) return 'Works across every dish on the table.';
  if (worst.score >= 70) return `Strongest with the ${best.dish.name.toLowerCase()}, still good with the ${worst.dish.name.toLowerCase()}.`;
  return `Best with the ${best.dish.name.toLowerCase()}, a compromise for the ${worst.dish.name.toLowerCase()}.`;
}

/** Best table first: the preference-adjusted overall score, then the weakest dish, then price, then the wine id. */
export function compareTableItems(a: TableItem, b: TableItem, prefs: GuestPreferences): number {
  const ra = a.overall + preferenceAdjustment(a.wine, prefs);
  const rb = b.overall + preferenceAdjustment(b.wine, prefs);
  return rb - ra || b.weakest.score - a.weakest.score || a.price - b.price || a.wine.id.localeCompare(b.wine.id);
}
