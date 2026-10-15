import type { Dish, Pairing, Restaurant, Wine } from '../domain/types';
import { LOCALES, type Locale } from './locale';

/**
 * Restaurant content in two languages (spec 2026-10-15-bilingual-content). The base fields of a dish, wine,
 * pairing note and restaurant stay as they are (written in the restaurant's `contentLocale`); translations live
 * next to them per language. `localize*` shows an entity in a language: the translation when there is one,
 * otherwise the base field (A7: no marker, the guest never sees an empty field). Pure and runtime-agnostic.
 */
export type Translations<T> = { [L in Locale]?: Partial<T> };

export interface DishText { name: string; description: string }
export interface WineText { tastingNote: string; region: string; country: string }
export interface RestaurantText { tagline: string; city: string }

export type DishTranslations = Translations<DishText>;
export type WineTranslations = Translations<WineText>;
export type RestaurantTranslations = Translations<RestaurantText>;
/** The sommelier's note per language (the base note is `Pairing.comment`). */
export type CommentTranslations = { [L in Locale]?: string };

export const DISH_TEXT_FIELDS = ['name', 'description'] as const;
export const WINE_TEXT_FIELDS = ['tastingNote', 'region', 'country'] as const;
export const RESTAURANT_TEXT_FIELDS = ['tagline', 'city'] as const;

/** The same limits as the base fields (spec edge cases: a translation is not longer than its base field may be). */
export const TEXT_LIMITS = { name: 120, description: 1000, tastingNote: 1000, region: 120, country: 80, tagline: 200, city: 120, comment: 140 } as const;

/**
 * Keeps only the known languages and fields, trimmed, without empty values. Built with `Object.fromEntries`, so a
 * key such as `__proto__` from stored JSON or a form can never reach a prototype (lesson client-chosen-keys).
 */
export function cleanTranslations<F extends string>(input: unknown, fields: readonly F[]): Translations<Record<F, string>> {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const entries: Array<[Locale, Partial<Record<F, string>>]> = [];
  for (const locale of LOCALES) {
    const raw = Object.hasOwn(src, locale) ? src[locale] : undefined;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const texts = fields
      .map((f): [F, string] => [f, Object.hasOwn(r, f) && typeof r[f] === 'string' ? (r[f] as string).trim() : ''])
      .filter(([, v]) => v !== '');
    if (texts.length) entries.push([locale, Object.fromEntries(texts) as Partial<Record<F, string>>]);
  }
  return Object.fromEntries(entries) as Translations<Record<F, string>>;
}

export function cleanCommentTranslations(input: unknown): CommentTranslations {
  const src = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return Object.fromEntries(LOCALES.flatMap((l): Array<[Locale, string]> => {
    const v = Object.hasOwn(src, l) && typeof src[l] === 'string' ? (src[l] as string).trim() : '';
    return v ? [[l, v]] : [];
  }));
}

/** A stable text form (sorted keys, empty values dropped): equal for equal translations. */
export function canonicalTranslations(t: unknown): string {
  const sort = (v: unknown): unknown => {
    if (!v || typeof v !== 'object') return v;
    return Object.fromEntries(Object.keys(v as object).sort()
      .map((k) => [k, sort((v as Record<string, unknown>)[k])] as [string, unknown])
      .filter(([, x]) => x !== '' && x !== undefined && x !== null && !(typeof x === 'object' && Object.keys(x as object).length === 0)));
  };
  return JSON.stringify(sort(t) ?? {});
}

export const sameTranslations = (a: unknown, b: unknown): boolean => canonicalTranslations(a) === canonicalTranslations(b);

/** A short fingerprint of translations: the `expectedVersion` of the translation forms (dishes and wines have no version column). */
export function translationsVersion(t: unknown): string {
  const s = canonicalTranslations(t);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(16).padStart(8, '0')}-${s.length}`;
}

/** One field in a language: the translation, otherwise the base text. */
export function localizeText<T>(translations: Translations<T> | undefined, locale: Locale, field: keyof T & string, base: string): string {
  const v = translations?.[locale]?.[field];
  return typeof v === 'string' && v.trim() ? v : base;
}

export function localizeDish(dish: Dish, locale: Locale): Dish {
  const t = dish.translations;
  return { ...dish, name: localizeText(t, locale, 'name', dish.name), description: localizeText(t, locale, 'description', dish.description) };
}

export function localizeWine(wine: Wine, locale: Locale): Wine {
  const t = wine.translations;
  return {
    ...wine, tastingNote: localizeText(t, locale, 'tastingNote', wine.tastingNote),
    region: localizeText(t, locale, 'region', wine.region), country: localizeText(t, locale, 'country', wine.country)
  };
}

export function localizeRestaurant(r: Restaurant, locale: Locale): Restaurant {
  const t = r.translations;
  return { ...r, tagline: localizeText(t, locale, 'tagline', r.tagline), city: localizeText(t, locale, 'city', r.city) };
}

/** The sommelier's note in a language: its translation, otherwise the base note. */
export function localizeComment(p: Pick<Pairing, 'comment' | 'commentTranslations'>, locale: Locale): string | null {
  const v = p.commentTranslations?.[locale];
  return typeof v === 'string' && v.trim() ? v : p.comment;
}

export function localizePairing(p: Pairing, locale: Locale): Pairing {
  return { ...p, comment: localizeComment(p, locale) };
}

/** Translations of the latest published version: what guests see (R4). */
export interface PublishedContent {
  restaurant: RestaurantTranslations;
  dishes: Map<string, DishTranslations>;
  wines: Map<string, WineTranslations>;
}

/** Applies published translations to current entities (the base fields are always current). */
export function withPublishedContent(content: PublishedContent) {
  return {
    restaurant: (r: Restaurant): Restaurant => ({ ...r, translations: content.restaurant }),
    dish: (d: Dish): Dish => ({ ...d, translations: content.dishes.get(d.id) ?? {} }),
    wine: (w: Wine): Wine => ({ ...w, translations: content.wines.get(w.id) ?? {} })
  };
}

/** How many entities have translations that differ from the published version: part of "unpublished changes". */
export function countContentChanges(current: { restaurant: Restaurant; dishes: Dish[]; wines: Wine[] }, published: PublishedContent): number {
  let n = sameTranslations(current.restaurant.translations, published.restaurant) ? 0 : 1;
  for (const d of current.dishes) if (!sameTranslations(d.translations, published.dishes.get(d.id) ?? {})) n++;
  for (const w of current.wines) if (!sameTranslations(w.translations, published.wines.get(w.id) ?? {})) n++;
  return n;
}

/** The content part of a published snapshot, as stored (arrays, so the JSON has no client-chosen keys). */
export interface ContentSnapshot {
  restaurant: RestaurantTranslations;
  dishes: Array<{ id: string; translations: DishTranslations }>;
  wines: Array<{ id: string; translations: WineTranslations }>;
}

export function contentSnapshot(restaurant: Restaurant, dishes: Dish[], wines: Wine[]): ContentSnapshot {
  return {
    restaurant: cleanTranslations(restaurant.translations, RESTAURANT_TEXT_FIELDS),
    dishes: dishes.filter((d) => Object.keys(d.translations).length).map((d) => ({ id: d.id, translations: cleanTranslations(d.translations, DISH_TEXT_FIELDS) })),
    wines: wines.filter((w) => Object.keys(w.translations).length).map((w) => ({ id: w.id, translations: cleanTranslations(w.translations, WINE_TEXT_FIELDS) }))
  };
}

/** A stored snapshot back to lookups. A snapshot from before translations existed has none (read as `{}`). */
export function readContentSnapshot(s: ContentSnapshot | null | undefined): PublishedContent {
  return {
    restaurant: cleanTranslations(s?.restaurant, RESTAURANT_TEXT_FIELDS),
    dishes: new Map((s?.dishes ?? []).map((d) => [d.id, cleanTranslations(d.translations, DISH_TEXT_FIELDS)])),
    wines: new Map((s?.wines ?? []).map((w) => [w.id, cleanTranslations(w.translations, WINE_TEXT_FIELDS)]))
  };
}

/** Current translations as published content (a restaurant that was never published shows its current state). */
export function currentContent(restaurant: Restaurant, dishes: Dish[], wines: Wine[]): PublishedContent {
  return readContentSnapshot(contentSnapshot(restaurant, dishes, wines));
}
