import {
  DISH_TEXT_FIELDS, RESTAURANT_TEXT_FIELDS, WINE_TEXT_FIELDS, cleanTranslations, sameTranslations, translationsVersion,
  type DishTranslations, type RestaurantTranslations, type WineTranslations
} from '../../i18n/content';
import { VersionConflictError } from '../../errors';

/**
 * Pure rules of the translation commands (spec 2026-10-15-bilingual-content, R6): the input replaces the
 * translations of the languages it names (a language it leaves out keeps what it had), values are trimmed and an
 * empty value removes that translation. The caller's `expectedVersion` is a fingerprint of the translations it saw.
 */
export interface TranslationPlan<T> { next: T; changed: boolean }

function plan<F extends string>(current: unknown, input: Record<string, unknown>, fields: readonly F[]) {
  const before = cleanTranslations(current, fields);
  const sent = cleanTranslations(input, fields);
  const merged = Object.fromEntries([
    ...Object.entries(before).filter(([l]) => !Object.hasOwn(input, l)),
    ...Object.entries(sent)
  ]);
  const next = cleanTranslations(merged, fields);
  return { next, changed: !sameTranslations(before, next) };
}

export const planDishTranslations = (current: DishTranslations, input: Record<string, unknown>): TranslationPlan<DishTranslations> => plan(current, input, DISH_TEXT_FIELDS);
export const planWineTranslations = (current: WineTranslations, input: Record<string, unknown>): TranslationPlan<WineTranslations> => plan(current, input, WINE_TEXT_FIELDS);
export const planRestaurantTranslations = (current: RestaurantTranslations, input: Record<string, unknown>): TranslationPlan<RestaurantTranslations> => plan(current, input, RESTAURANT_TEXT_FIELDS);

/** Throws VersionConflictError when someone changed the translations after the caller read them. */
export function checkTranslationsVersion(current: unknown, expectedVersion: string | undefined): void {
  if (expectedVersion !== undefined && expectedVersion !== '' && expectedVersion !== translationsVersion(current)) throw new VersionConflictError();
}
