import { z } from 'zod';

const preferences = z.strictObject({
  serving: z.enum(['any', 'glass', 'bottle']).optional(),
  // an array, or the comma-separated form the guest pages use in the address
  styles: z.union([z.array(z.enum(['sparkling', 'white', 'rose', 'orange', 'red', 'sweet'])).max(6), z.string().max(100)]).optional(),
  maxPrice: z.union([z.number().positive().max(100_000), z.string().max(10), z.null()]).optional(),
  weight: z.enum(['any', 'lighter', 'fuller']).optional(),
  mood: z.enum(['any', 'classic', 'adventurous']).optional()
});

/** Best bottle for a table: 2 to 12 distinct dishes (a table of one dish uses the single-dish endpoint). */
export const tableRecommendationSchema = z.strictObject({
  restaurantSlug: z.string().min(1).max(40),
  dishIds: z.array(z.guid()).max(12).refine((ids) => new Set(ids).size >= 2, { error: 'at_least_two_distinct' }),
  preferences: preferences.optional()
});
export type TableRecommendationInput = z.output<typeof tableRecommendationSchema>;
