import { z } from 'zod';

/**
 * The body of `PUT /wines/{id}/pick` (spec 2026-11-18-restaurant-picks, R16): mark (`on: true`) or unmark a wine.
 * `expectedVersion` is the fingerprint of the working set the caller read (`picksVersion`); the route also accepts it
 * as `If-Match`. Anything else, also an extra field, is refused (`strictObject`); the restaurant is never part of the body.
 */
export const pickVersionSchema = z.string().regex(/^[0-9a-f]{8}-\d{1,6}$/, 'invalid');

export const pickSetSchema = z.strictObject({
  on: z.boolean(),
  expectedVersion: pickVersionSchema.optional()
});

export type PickSetInput = z.output<typeof pickSetSchema>;
