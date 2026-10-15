import { z } from 'zod';
import { TEXT_LIMITS } from '../../i18n/content';

/**
 * Translated content from a form or a request (spec 2026-10-15-bilingual-content, R1/R6). Only `pl` and `en`, only
 * the fields of R1, strings within the limits of the base fields: anything else (also `__proto__` or `constructor`)
 * is refused as an unknown field. An empty string means "no translation, show the base text".
 */
const text = (max: number) => z.string().max(max).optional();
const perLocale = <T extends z.ZodRawShape>(shape: T) => {
  const one = z.strictObject(shape);
  return z.strictObject({ pl: one.optional(), en: one.optional() });
};

export const dishTranslationsSchema = perLocale({ name: text(TEXT_LIMITS.name), description: text(TEXT_LIMITS.description) });
export type DishTranslationsInput = z.output<typeof dishTranslationsSchema>;

export const wineTranslationsSchema = perLocale({ tastingNote: text(TEXT_LIMITS.tastingNote), region: text(TEXT_LIMITS.region), country: text(TEXT_LIMITS.country) });
export type WineTranslationsInput = z.output<typeof wineTranslationsSchema>;

export const restaurantContentSchema = z.strictObject({
  contentLocale: z.enum(['pl', 'en']),
  translations: perLocale({ tagline: text(TEXT_LIMITS.tagline), city: text(TEXT_LIMITS.city) })
});
export type RestaurantContentInput = z.output<typeof restaurantContentSchema>;

/** The note per language; the 140-character rule itself belongs to the pairing rules (as for the base note). */
export const commentTranslationsSchema = z.strictObject({ pl: z.string().max(1000).optional(), en: z.string().max(1000).optional() });
export type CommentTranslationsInput = z.output<typeof commentTranslationsSchema>;
