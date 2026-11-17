import { z } from 'zod';
import { COOKING_METHODS, PROTEIN_TYPES, type CookingMethod, type Level, type ProteinType, type WineStyle } from '../../domain/types';
import { WINE_STYLES } from '../../guest/prefs';

/**
 * Taste profiles from a form or a request (spec 2026-11-04-panel-completion, R3). Scales are whole numbers 0 to 5,
 * `protein` and `cooking` come from the dictionaries, the wine's alcohol is a percent from 0 to 25 in steps of 0.1.
 * Anything else, also an extra field, is refused (`strictObject`).
 */
const level = z.number().int().min(0).max(5).transform((n) => n as Level);

export const dishProfileSchema = z.strictObject({
  intensity: level, fat: level, salt: level, sweetness: level, acidity: level, spice: level, umami: level, smoke: level, creaminess: level,
  protein: z.enum(PROTEIN_TYPES as unknown as [ProteinType, ...ProteinType[]]),
  cooking: z.enum(COOKING_METHODS as unknown as [CookingMethod, ...CookingMethod[]])
});

export const wineProfileSchema = z.strictObject({
  sweetness: level, acidity: level, tannin: level, body: level, fruitiness: level, oak: level, aromatic: level, freshness: level,
  alcohol: z.number().min(0).max(25).refine((n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9, 'invalid'),
  style: z.enum(WINE_STYLES as unknown as [WineStyle, ...WineStyle[]]),
  adventurous: z.boolean()
});

/** The request body of `PUT /dishes/{id}/profile` and `PUT /wines/{id}/profile`: the scales and the state. */
export const dishProfileEditSchema = z.strictObject({ profile: dishProfileSchema, confirm: z.boolean() });
export const wineProfileEditSchema = z.strictObject({ profile: wineProfileSchema, confirm: z.boolean() });

export type DishProfileInput = z.output<typeof dishProfileSchema>;
export type WineProfileInput = z.output<typeof wineProfileSchema>;

/**
 * The scales as a URL carries them (`?intensity=3&protein=fish`, no JavaScript needed): strings to numbers, then the
 * same schemas. A value that is not a number stays as it is and fails the schema (`invalid`); a missing one is
 * `required`. Only the names of the scales are read, so `?__proto__=x` is never looked at.
 */
const DISH_KEYS = ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess', 'protein', 'cooking'] as const;
const WINE_KEYS = ['sweetness', 'acidity', 'tannin', 'body', 'alcohol', 'fruitiness', 'oak', 'aromatic', 'freshness', 'style', 'adventurous'] as const;
const TEXT_KEYS = new Set<string>(['protein', 'cooking', 'style']);

function fromQuery(keys: readonly string[], get: (k: string) => string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = get(k);
    if (v === null) continue;
    if (TEXT_KEYS.has(k)) out[k] = v;
    else if (k === 'adventurous') out[k] = v === 'true' || v === 'on' || v === '1' ? true : v === 'false' || v === '' || v === '0' ? false : v;
    else out[k] = v.trim() === '' ? undefined : Number(v);
  }
  return out;
}

export const dishProfileFromQuery = (get: (k: string) => string | null): Record<string, unknown> => fromQuery(DISH_KEYS, get);
export const wineProfileFromQuery = (get: (k: string) => string | null): Record<string, unknown> => fromQuery(WINE_KEYS, get);
