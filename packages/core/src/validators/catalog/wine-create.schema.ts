import { z } from 'zod';
import { WINE_STYLES } from '../../guest/prefs';
import { catalogText } from './catalog-text';
import { wineFieldShape } from './wine-fields.schema';

/**
 * A new wine (spec 2026-11-16-catalog-field-editing, R8): `producer`, `name`, `vintage`, `bottlePrice` and `style` are required;
 * `style` and the optional `grape` (up to 120 characters, split like the import's) only feed the draft taste profile and the
 * colour, and cannot be edited afterwards (Q4). Rules that need the restaurant's wines (uniqueness, glass below bottle, the
 * vintage bound from the clock) are `planNewWine`'s.
 */
export const wineCreateSchema = z.strictObject({
  producer: wineFieldShape.producer,
  name: wineFieldShape.name,
  vintage: wineFieldShape.vintage,
  region: wineFieldShape.region.optional(),
  country: wineFieldShape.country.optional(),
  tastingNote: wineFieldShape.tastingNote.optional(),
  listNumber: wineFieldShape.listNumber.optional(),
  bottlePrice: wineFieldShape.bottlePrice,
  pouredByGlass: wineFieldShape.pouredByGlass.optional(),
  glassPrice: wineFieldShape.glassPrice.optional(),
  style: z.enum(WINE_STYLES as [string, ...string[]], { error: (i) => (i.input === undefined ? 'required' : 'invalid') }),
  grape: catalogText({ max: 120, required: false }).optional()
});

export type WineCreateInput = z.output<typeof wineCreateSchema>;
