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

/** The request body of `PATCH /dishes/{id}/details`: the fields, at least one of them. */
export const dishDetailsSchema = dishFieldsSchema.refine((o) => Object.keys(o).length > 0, 'required');

/** The names a body may carry, with any value: the first look at an input, before the values are checked. */
export const dishShapeSchema = z.strictObject({ name: z.unknown(), description: z.unknown(), category: z.unknown(), price: z.unknown() }).partial()
  .refine((o) => Object.keys(o).length > 0, 'required');

export type DishDetailsInput = z.output<typeof dishFieldsSchema>;
