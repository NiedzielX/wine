import type { Dish, GuestPreferences, Pairing, Wine } from '../domain/types';
import { BUDGET_FALLBACK_COUNT, budgetNotice, passesHardFilters, preferenceAdjustment, priceFor, recommendForDish, type Serving } from './recommend';
import type { Locale } from '../i18n/locale';
import { MAX_SCORE, pairingScore } from './scoring';

/**
 * "Best bottle for the table".
 *
 * overall = 0.6 * weighted mean + 0.4 * weakest dish score
 * Weights: Mains 1.5, Starters 1.0. Desserts are scored separately (a shared bottle rarely
 * suits dessert), unless the table ordered only desserts.
 * A sommelier-approved pairing for a dish adds +3 to that dish's score inside the table calc.
 * A rejected pairing caps that dish at 50, so a wine the sommelier ruled out cannot win the table.
 *
 * Two scores per dish (spec 2026-10-16-whole-table-waiter-path, R1): `engineScore` is the raw pairing score that
 * screens display and `table.fit` counts; `score` (with the bonus and the cap) only feeds `overall` and the ranking.
 *
 * Named rules (documentation ids, docs/RECOMMENDATION_ENGINE.md §8; the table emits no `Factor`):
 * - `table.fit` — "works with n of m dishes" (`tableFit`);
 * - `table.budget_relaxed` — with `relaxBudget`, a budget that rules out every wine is lifted, with a notice;
 * - `table.people_default` — no default number of people: only a number the guest or the waiter chose counts (`tablePeople`);
 * - `table.quantity` — how much of the bottle the chosen number of people needs (`tableQuantity`).
 * People never change the ranking (spec Q6): only the quantity and its total price.
 */

export const TABLE_MEAN_WEIGHT = 0.6;
export const TABLE_MIN_WEIGHT = 0.4;
export const COMPROMISE_THRESHOLD = 76;
export const WEAK_DISH_THRESHOLD = 64;
/** How many bottles the table result lists. */
export const TABLE_LIMIT = 3;
/** Weight of a main course in the weighted mean (starters weigh 1). */
export const TABLE_MAINS_WEIGHT = 1.5;
/** Bonus for a sommelier-approved pairing inside the table calculation (capped at MAX_SCORE). */
export const TABLE_SOMMELIER_BONUS = 3;
/** A pairing the sommelier rejected caps that dish's score at this value. */
export const TABLE_REJECTED_CAP = 50;
/** `table.fit`: a dish "works" with the bottle from this raw engine score up (never when the sommelier rejected the pair). */
export const TABLE_FIT_THRESHOLD = 70;
/** `table.quantity`: wine per person at the table, in ml (about two 150 ml glasses; owner's decision Q3, 2026-10-16). */
export const TABLE_ML_PER_PERSON = 300;
/** `table.quantity`: what is left over after full bottles is topped up with up to this many glasses instead of one more bottle. */
export const TABLE_MAX_EXTRA_GLASSES = 2;
/** `table.people_default`: the number of people a table quantity accepts (the chosen value must be a whole number in this range). */
export const TABLE_PEOPLE_MIN = 2;
export const TABLE_PEOPLE_MAX = 12;

export interface TableDishScore {
  dish: Dish;
  /** ranking score: the engine score with the sommelier bonus (+3, capped at 99) or the rejected cap (50); feeds `overall` only */
  score: number;
  /** the raw engine score (`pairingScore`): the only per-dish score a screen may display */
  engineScore: number;
  sommelierPick: boolean;
  /** the sommelier rejected this pairing: the dish never counts as a fit */
  rejected: boolean;
}

/** `table.fit`: how many of the dishes in the bottle calculation the wine works with. */
export interface TableFit {
  fits: number;
  /** dishes in the bottle calculation (set-aside desserts excluded) */
  of: number;
  /** the other dishes, weakest raw score first (ties: order of choice) */
  weaker: TableDishScore[];
  /** the test behind `splitSuggested`, for this bottle; always false for a single dish */
  compromise: boolean;
}

export interface TableOptions {
  /** `table.budget_relaxed`: when the budget rules out every wine, list the closest bottles with a notice (screens; not the API) */
  relaxBudget?: boolean;
  /** `table.people_default`: the number of people the guest or the waiter chose; anything else means no quantity (no default) */
  people?: number | null;
}

/** `table.quantity`: full bottles plus up to TABLE_MAX_EXTRA_GLASSES glasses for `people`, and what it costs. */
export interface TableQuantity {
  people: number;
  bottles: number;
  glasses: number;
  /** bottles × bottle price + glasses × glass price, in zł */
  total: number;
}

export interface TableItem {
  wine: Wine;
  overall: number;
  perDish: TableDishScore[];
  weakest: TableDishScore;
  price: number;
  serving: 'glass' | 'bottle';
  why: string;
  fit: TableFit;
  /** `table.quantity` for the chosen number of people; null without a choice, by the glass, or for a sweet wine */
  quantity: TableQuantity | null;
}

export interface TableResult {
  items: TableItem[];
  /** dishes taken out of the bottle calculation (desserts) */
  setAside: Dish[];
  /** true when no single bottle is good enough for everything */
  splitSuggested: boolean;
  /** per-dish glass suggestions when a split is suggested */
  split: Array<{ dish: Dish; wine: Wine; score: number }>;
  /** set when the budget was relaxed to avoid an empty result (`table.budget_relaxed`); otherwise null */
  notice: string | null;
  /** the number of people chosen (`table.people_default`); null when nobody chose one, and then no item has a quantity */
  people: number | null;
}

const weightOf = (d: Dish) => (d.category === 'Mains' ? TABLE_MAINS_WEIGHT : 1);

/** One bottle is a compromise for the table: the table score or the weakest dish (ranking scores) is too low. */
const isCompromise = (overall: number, weakestScore: number) => overall < COMPROMISE_THRESHOLD || weakestScore < WEAK_DISH_THRESHOLD;

export function recommendForTable(
  dishes: Dish[],
  wines: Wine[],
  pairings: Pairing[],
  prefs: GuestPreferences,
  limit = TABLE_LIMIT,
  /** language of the one-line reasons and the budget notice; English by default (the public API) */
  locale: Locale = 'en',
  options: TableOptions = {}
): TableResult {
  const savoury = dishes.filter((d) => d.category !== 'Desserts');
  const scored = savoury.length > 0 ? savoury : dishes;
  const setAside = savoury.length > 0 ? dishes.filter((d) => d.category === 'Desserts') : [];
  const tablePrefs: GuestPreferences = { ...prefs, serving: prefs.serving === 'any' ? 'bottle' : prefs.serving };
  const people = tablePeople(options.people);

  const build = (ignoreBudget: boolean): TableItem[] => {
    const items: TableItem[] = [];
    for (const wine of wines) {
      if (!passesHardFilters(wine, tablePrefs, ignoreBudget)) continue;
      const perDish: TableDishScore[] = scored.map((dish) => {
        const p = pairings.find((x) => x.dishId === dish.id && x.wineId === wine.id);
        const engineScore = pairingScore(dish, wine).score;
        const pick = !!p && (p.status === 'approved' || p.status === 'modified');
        const rejected = p?.status === 'rejected';
        let score = engineScore;
        if (pick) score = Math.min(MAX_SCORE, score + TABLE_SOMMELIER_BONUS);
        if (rejected) score = Math.min(score, TABLE_REJECTED_CAP);
        return { dish, score, engineScore, sommelierPick: pick, rejected };
      });
      const wSum = perDish.reduce((s, x) => s + weightOf(x.dish), 0);
      const mean = perDish.reduce((s, x) => s + x.score * weightOf(x.dish), 0) / wSum;
      const weakest = perDish.reduce((m, x) => (x.score < m.score ? x : m), perDish[0]);
      const overall = Math.round(TABLE_MEAN_WEIGHT * mean + TABLE_MIN_WEIGHT * weakest.score);
      const { price, serving } = priceFor(wine, tablePrefs.serving);
      const quantity = people === null ? null : tableQuantity(people, wine, serving);
      items.push({ wine, overall, perDish, weakest, price, serving, why: tableWhy(perDish, locale), fit: tableFit(perDish, overall), quantity });
    }
    return items.sort((a, b) => compareTableItems(a, b, prefs));
  };

  let top = build(false).slice(0, limit);
  let notice: string | null = null;
  // table.budget_relaxed: only the budget is lifted (style and serving still apply), as for a single dish
  if (top.length === 0 && options.relaxBudget && tablePrefs.maxPrice !== null) {
    top = build(true).slice(0, Math.min(limit, BUDGET_FALLBACK_COUNT));
    if (top.length > 0) notice = budgetNotice(tablePrefs.maxPrice, locale);
  }

  const splitSuggested = scored.length > 1 && (!top[0] || isCompromise(top[0].overall, top[0].weakest.score));
  const split = splitSuggested
    ? scored.flatMap((dish) => {
        // the glass list's own budget notice is not shown at the table
        const r = recommendForDish(dish, wines, pairings, { ...prefs, serving: 'glass' }, 1, locale);
        return r.items[0] ? [{ dish, wine: r.items[0].wine, score: r.items[0].matchScore }] : [];
      })
    : [];

  return { items: top, setAside, splitSuggested, split, notice, people };
}

/**
 * `table.people_default`: there is no default number of people (owner's decision Q4, 2026-10-16) — guessing it from the
 * number of dishes would show a couple sharing four dishes "for 4 people: 2 bottles", which reads as an upsell. Only a
 * whole number from TABLE_PEOPLE_MIN to TABLE_PEOPLE_MAX that someone chose counts; anything else is null (no quantity).
 */
export function tablePeople(people: number | null | undefined): number | null {
  return typeof people === 'number' && Number.isInteger(people) && people >= TABLE_PEOPLE_MIN && people <= TABLE_PEOPLE_MAX ? people : null;
}

/**
 * `table.quantity`: TABLE_ML_PER_PERSON for each person, if everyone drinks the same wine. Full bottles first; what is
 * left is poured by the glass when the wine is sold by the glass and it takes at most TABLE_MAX_EXTRA_GLASSES glasses,
 * otherwise it is one more bottle. Always at least one bottle. No quantity for a wine served by the glass (the table
 * chose glasses) or a sweet wine (sweet and fortified wines are poured in small measures).
 */
export function tableQuantity(people: number, wine: Wine, serving: Serving = 'bottle'): TableQuantity | null {
  if (serving === 'glass' || wine.profile.style === 'sweet') return null;
  const need = people * TABLE_ML_PER_PERSON;
  let bottles = Math.floor(need / wine.bottleSize);
  const rest = need - bottles * wine.bottleSize;
  let glasses = 0;
  if (rest > 0) {
    if (wine.glassPrice !== null && rest <= TABLE_MAX_EXTRA_GLASSES * wine.glassPour) glasses = Math.ceil(rest / wine.glassPour);
    else bottles += 1;
  }
  if (bottles === 0) {
    // a bottle larger than the table needs: one bottle, never glasses alone
    bottles = 1;
    glasses = 0;
  }
  return { people, bottles, glasses, total: bottles * wine.bottlePrice + glasses * (wine.glassPrice ?? 0) };
}

/**
 * `table.fit`: a dish counts as a fit when its raw engine score is at least TABLE_FIT_THRESHOLD and the sommelier did not
 * reject the pair (the engine caps a rejected pair at 50 in the ranking, so "works" would contradict the sommelier).
 * `overall` is the item's table score, used for `compromise`.
 */
export function tableFit(perDish: TableDishScore[], overall: number): TableFit {
  const isFit = (d: TableDishScore) => !d.rejected && d.engineScore >= TABLE_FIT_THRESHOLD;
  // Array.prototype.sort is stable, so equal scores keep the order of choice
  const weaker = perDish.filter((d) => !isFit(d)).sort((a, b) => a.engineScore - b.engineScore);
  const weakest = perDish.reduce((m, x) => (x.score < m.score ? x : m), perDish[0]);
  return {
    fits: perDish.length - weaker.length,
    of: perDish.length,
    weaker,
    compromise: perDish.length > 1 && isCompromise(overall, weakest.score)
  };
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
