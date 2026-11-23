import { z } from 'zod';

/** Body of `POST /dishes/{id}/visibility` (spec 2026-11-16-catalog-field-editing, R7, R12): hide (`true`) or show (`false`) the dish for guests. */
export const dishVisibilitySchema = z.strictObject({ hidden: z.boolean() });
export type DishVisibilityInput = z.output<typeof dishVisibilitySchema>;
