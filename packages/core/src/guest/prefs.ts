import type { Dish, GuestPreferences, WineStyle } from '../domain/types';
import { DEFAULT_PREFS } from '../domain/types';
import type { TableItem } from '../engine/table';
import type { Locale, Localized } from '../i18n/locale';

/**
 * Guest state lives in the URL (no cookies, no storage): this module parses it, serialises it and
 * applies single changes (a chip tap). Pure and runtime-agnostic, so pages stay free of logic.
 */
export type QueryInput = Record<string, string | string[] | undefined>;

export const WINE_STYLES: WineStyle[] = ['sparkling', 'white', 'rose', 'orange', 'red', 'sweet'];

/** English style labels; kept for existing callers (the dashboard). New code uses `styleLabel(style, locale)`. */
export const STYLE_LABELS: Record<WineStyle, string> = {
  sparkling: 'Sparkling', white: 'White', rose: 'Rosé', orange: 'Orange', red: 'Red', sweet: 'Sweet'
};

const STYLE_LABELS_PL: Record<WineStyle, string> = {
  sparkling: 'Musujące', white: 'Białe', rose: 'Różowe', orange: 'Pomarańczowe', red: 'Czerwone', sweet: 'Słodkie'
};

/** The label of a wine style in the interface language. Only the label is translated: `styles=red` stays in the URL. */
export function styleLabel(style: WineStyle, locale: Locale = 'en'): string {
  return (locale === 'pl' ? STYLE_LABELS_PL : STYLE_LABELS)[style];
}

const SUMMARY: Record<'glass' | 'bottle' | 'lighter' | 'fuller' | 'classic' | 'adventurous', Localized> = {
  glass: { en: 'By the glass', pl: 'Na kieliszki' },
  bottle: { en: 'By the bottle', pl: 'Na butelki' },
  lighter: { en: 'Lighter', pl: 'Lżejsze' },
  fuller: { en: 'Fuller', pl: 'Pełniejsze' },
  classic: { en: 'Classic', pl: 'Klasyczne' },
  adventurous: { en: 'Adventurous', pl: 'Odważne' }
};

/** "Up to 60 zł" / "Do 60 zł" (a non-breaking space before the currency in Polish). */
export function upToPrice(maxPrice: number, locale: Locale = 'en'): string {
  return locale === 'pl' ? `Do ${maxPrice}\u00a0zł` : `Up to ${maxPrice} zł`;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v : v === undefined ? [] : [v]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);

/** Parses guest preferences from query parameters; unknown or invalid values fall back to defaults. */
export function parseGuestPrefs(q: QueryInput): GuestPreferences {
  const serving = first(q.serving);
  const weight = first(q.weight);
  const mood = first(q.mood);
  const max = Number(first(q.maxPrice));
  // canonical order (the same order prefsToQuery writes), so one filter has one address
  const requested = new Set(list(q.styles));
  const styles = WINE_STYLES.filter((s) => requested.has(s));
  return {
    serving: serving === 'glass' || serving === 'bottle' ? serving : DEFAULT_PREFS.serving,
    styles,
    maxPrice: Number.isFinite(max) && max > 0 ? max : null,
    weight: weight === 'lighter' || weight === 'fuller' ? weight : DEFAULT_PREFS.weight,
    mood: mood === 'classic' || mood === 'adventurous' ? mood : DEFAULT_PREFS.mood
  };
}

/** Query parameters for the non-default preferences, in a stable order. */
export function prefsToQuery(p: GuestPreferences): Record<string, string> {
  const q: Record<string, string> = {};
  if (p.serving !== 'any') q.serving = p.serving;
  if (p.styles.length) q.styles = WINE_STYLES.filter((s) => p.styles.includes(s)).join(',');
  if (p.maxPrice !== null) q.maxPrice = String(p.maxPrice);
  if (p.weight !== 'any') q.weight = p.weight;
  if (p.mood !== 'any') q.mood = p.mood;
  return q;
}

/** "?a=1&b=2" for the defined values, or "" when there are none. */
export function toQueryString(params: Record<string, string | undefined>): string {
  const parts = Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const withServing = (p: GuestPreferences, serving: GuestPreferences['serving']): GuestPreferences =>
  // glass and bottle prices are on different scales, so a budget never survives the switch
  ({ ...p, serving, maxPrice: serving === p.serving ? p.maxPrice : null });

export const withStyleToggled = (p: GuestPreferences, style: WineStyle): GuestPreferences =>
  ({ ...p, styles: p.styles.includes(style) ? p.styles.filter((s) => s !== style) : [...p.styles, style] });

export const withBudget = (p: GuestPreferences, maxPrice: number | null): GuestPreferences => ({ ...p, maxPrice });

export const withWeight = (p: GuestPreferences, weight: GuestPreferences['weight']): GuestPreferences => ({ ...p, weight });

export const withMood = (p: GuestPreferences, mood: GuestPreferences['mood']): GuestPreferences => ({ ...p, mood });

/** Budget thresholds offered to the guest, in zł. */
export function budgetOptions(serving: GuestPreferences['serving']): number[] {
  return serving === 'glass' ? [45, 60, 75] : [200, 300, 400];
}

/** Labels for the active preferences, for the chips above the list. */
export function prefsSummary(p: GuestPreferences, locale: Locale = 'en'): string[] {
  const s: string[] = [];
  if (p.serving !== 'any') s.push(SUMMARY[p.serving][locale]);
  if (p.styles.length) s.push(WINE_STYLES.filter((x) => p.styles.includes(x)).map((x) => styleLabel(x, locale)).join(', '));
  if (p.maxPrice !== null) s.push(upToPrice(p.maxPrice, locale));
  if (p.weight !== 'any') s.push(SUMMARY[p.weight][locale]);
  if (p.mood !== 'any') s.push(SUMMARY[p.mood][locale]);
  return s;
}

/** Dish ids from `dish=a&dish=b` or `dishes=a,b`, without duplicates. */
export function parseDishIds(q: QueryInput): string[] {
  return [...new Set([...list(q.dish), ...list(q.dishes)])];
}

/** Most dishes one table calculation takes (the same limit as the public API schema); the first ones are used. */
export const MAX_TABLE_DISHES = 12;

/**
 * Whether the "whole table" entry makes sense for this menu: at least two published dishes outside desserts
 * (desserts are set aside from the shared bottle, so a menu of one savoury dish and desserts has no table to pair).
 */
export function canPairTable(dishes: Dish[]): boolean {
  return dishes.filter((d) => d.status === 'published' && d.category !== 'Desserts').length >= 2;
}

/**
 * The table result with the chosen wine first ("Choose this one"): the chosen item becomes the bottle, the others
 * keep the engine's order. A wine id that is not in the result (or none) leaves the result as it is.
 */
export function pickTableItem(items: TableItem[], wineId: string | null | undefined): TableItem[] {
  const picked = wineId ? items.find((i) => i.wine.id === wineId) : undefined;
  return picked ? [picked, ...items.filter((i) => i !== picked)] : items;
}
