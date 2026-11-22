import {
  dishProfileFromQuery, dishScales, wineProfileFromQuery, wineScales, type Dish, type DishPreview, type Wine, type WinePreview
} from '@wine-match/core';
import type { Cradle } from '@/server/container';
import { domainError } from '@/server/domain-errors';
import type { ProfileValues } from './profile-editor';
import { first } from './format';

type Search = Record<string, string | string[] | undefined>;

const DISH_KEYS = ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess', 'protein', 'cooking'] as const;
const WINE_KEYS = ['sweetness', 'acidity', 'tannin', 'body', 'alcohol', 'fruitiness', 'oak', 'aromatic', 'freshness', 'style', 'adventurous'] as const;

export interface ProfilePageState<P> { values: ProfileValues; preview: P | null; previewInvalid: boolean }

/**
 * The state of the profile editor from the URL (spec 2026-11-04-panel-completion, R7): the saved scales, or the ones
 * the GET form sent; with a candidate in the URL the preview is computed on the server, so it needs no JavaScript.
 * A candidate that fails the schema is shown back as typed, with an error, never previewed.
 */
async function load<P>(keys: readonly string[], saved: ProfileValues, sp: Search, canEdit: boolean, parse: (get: (k: string) => string | null) => Record<string, unknown>, run: (candidate: Record<string, unknown>) => Promise<P>): Promise<ProfilePageState<P>> {
  if (!canEdit || !keys.some((k) => Object.hasOwn(sp, k))) return { values: saved, preview: null, previewInvalid: false };
  const get = (k: string) => (Object.hasOwn(sp, k) ? first(sp[k]) : null);
  const values: ProfileValues = { ...saved, ...Object.fromEntries(keys.filter((k) => get(k) !== null).map((k) => [k, get(k)!])) };
  try {
    return { values, preview: await run(parse(get)), previewInvalid: false };
  } catch (e) {
    if (domainError(e)?.code === 'validation_failed') return { values, preview: null, previewInvalid: true };
    throw e;
  }
}

export const dishProfileState = (c: Cradle, slug: string, dish: Dish, sp: Search, canEdit: boolean) =>
  load<DishPreview>(DISH_KEYS, { ...dishScales(dish.profile) }, sp, canEdit, dishProfileFromQuery, (cand) => c.profilePreviewService.previewDish(slug, dish.id, cand));

export const wineProfileState = (c: Cradle, slug: string, wine: Wine, sp: Search, canEdit: boolean) =>
  load<WinePreview>(WINE_KEYS, { ...wineScales(wine.profile) }, sp, canEdit, wineProfileFromQuery, (cand) => c.profilePreviewService.previewWine(slug, wine.id, cand));
