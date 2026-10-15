import { z } from 'zod';

/** A pairing the sommelier writes by hand. The score, the source and the author are never taken from the client. */
export const pairingCreateSchema = z.strictObject({
  dishId: z.guid(),
  wineId: z.guid(),
  role: z.enum(['primary', 'alternative', 'best_value']).nullish(),
  comment: z.string().max(1000).optional()
});
export type PairingCreateInput = z.output<typeof pairingCreateSchema>;
