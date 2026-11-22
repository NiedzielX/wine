import { z } from 'zod';
import { TEXT_LIMITS } from '../../i18n/content';
import { catalogText } from './catalog-text';
import { DISH_CATEGORY_VALUES, dishFieldShape } from './dish-fields.schema';

/**
 * A new dish (spec 2026-11-16-catalog-field-editing, R8): `name`, `category` and `price` are required, `description` is
 * optional; the same text and price rules as an edit. `strictObject`: `status`, `profile` and anything else is refused (a new
 * dish is always a draft with the engine's draft profile).
 */
export const dishCreateSchema = z.strictObject({
  name: dishFieldShape.name,
  description: catalogText({ max: TEXT_LIMITS.description, required: false, multiline: true }).optional(),
  /** a missing category is `required`, a value outside the dictionary `invalid` */
  category: z.enum(DISH_CATEGORY_VALUES, { error: (i) => (i.input === undefined ? 'required' : 'invalid') }),
  price: dishFieldShape.price
});

export type DishCreateInput = z.output<typeof dishCreateSchema>;
