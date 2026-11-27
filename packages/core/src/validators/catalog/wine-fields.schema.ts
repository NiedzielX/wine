import { z } from 'zod';
import { TEXT_LIMITS } from '../../i18n/content';
import { catalogPrice, catalogText } from './catalog-text';

/**
 * The editable fields of a wine (spec 2026-11-16-catalog-field-editing, R2): every field optional, `strictObject`.
 * Rules that need the stored wine (glass below bottle, the vintage's upper bound from the clock, uniqueness) are
 * checked by `planWineEdit`. `vintage` is a whole year from 1900 or the exact text `NV`; `listNumber` a whole number
 * 1 to 9999 or `null` (take the wine off the printed list); `pouredByGlass` a boolean, `glassPrice` only with it.
 */
export const WINE_PRICE_MAX = 100_000;
export const VINTAGE_MIN = 1900;
export const LIST_NUMBER_MAX = 9999;

const vintage = z.unknown().transform((v, ctx): number | 'NV' => {
  if (v === 'NV') return 'NV';
  if (typeof v !== 'number' || !Number.isInteger(v)) { ctx.issues.push({ code: 'custom', message: v === undefined ? 'required' : 'invalid', input: v }); return z.NEVER; }
  if (v < VINTAGE_MIN) { ctx.issues.push({ code: 'custom', message: 'out_of_range', input: v }); return z.NEVER; }
  return v;
});

const listNumber = z.number().int().transform((n, ctx) => {
  if (n < 1 || n > LIST_NUMBER_MAX) { ctx.issues.push({ code: 'custom', message: 'out_of_range', input: n }); return z.NEVER; }
  return n;
}).nullable();

export const wineFieldShape = {
  producer: catalogText({ max: TEXT_LIMITS.name, required: true }),
  name: catalogText({ max: 160, required: true }),
  vintage,
  region: catalogText({ max: TEXT_LIMITS.region, required: false }),
  country: catalogText({ max: TEXT_LIMITS.country, required: false }),
  tastingNote: catalogText({ max: TEXT_LIMITS.tastingNote, required: false, multiline: true }),
  listNumber,
  bottlePrice: catalogPrice(WINE_PRICE_MAX),
  pouredByGlass: z.boolean(),
  glassPrice: catalogPrice(WINE_PRICE_MAX)
};

export const wineFieldsSchema = z.strictObject(wineFieldShape).partial();

/** The first look at a wine input: names and types only, at least one field (see `dishShapeSchema`); the content rules run in the service. */
export const wineShapeSchema = z.strictObject({
  producer: z.string(), name: z.string(), vintage: z.union([z.literal('NV'), z.number().int()]), region: z.string(), country: z.string(), tastingNote: z.string(),
  listNumber: z.number().int().nullable(), bottlePrice: z.number(), pouredByGlass: z.boolean(), glassPrice: z.number()
}).partial().refine((o) => Object.keys(o).length > 0, 'required');

export type WineDetailsInput = z.output<typeof wineFieldsSchema>;
