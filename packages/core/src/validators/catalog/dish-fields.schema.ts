import { z } from 'zod';
import { TEXT_LIMITS } from '../../i18n/content';
import { catalogPrice, catalogText } from './catalog-text';

/**
 * The editable fields of a dish (spec 2026-11-16-catalog-field-editing, R1): every field optional (a partial update),
 * `strictObject` (an unknown field, also `profile`, `status` or `__proto__`, is refused), texts cleaned by `catalogText`,
 * the price a number of zloty. The category is the dictionary of the import.
 */
export const DISH_PRICE_MAX = 10_000;
export const DISH_CATEGORY_VALUES = ['Starters', 'Mains', 'Desserts'] as const;

const dishFieldShape = {
  name: catalogText({ max: TEXT_LIMITS.name, required: true }),
  description: catalogText({ max: TEXT_LIMITS.description, required: false, multiline: true }),
  category: z.enum(DISH_CATEGORY_VALUES),
  price: catalogPrice(DISH_PRICE_MAX)
};

/** The fields as the service reads them (the service decides "nothing sent" itself, see `CatalogEditService`). */
export const dishFieldsSchema = z.strictObject(dishFieldShape).partial();

/**
 * The first look at an input (and the body schema of `PATCH /dishes/{id}/details`): only the names a body may carry, each with a
 * value of the right TYPE, and at least one of them. The content rules (length, characters, the price's range and decimals) are
 * `dishFieldsSchema`'s and run in the service after the fields that equal the stored ones are set aside, so a stored value that
 * breaks a new rule never blocks editing another field (R1).
 */
export const dishShapeSchema = z.strictObject({ name: z.string(), description: z.string(), category: z.enum(DISH_CATEGORY_VALUES), price: z.number() }).partial()
  .refine((o) => Object.keys(o).length > 0, 'required');

export type DishDetailsInput = z.output<typeof dishFieldsSchema>;
