import { z } from 'zod';

export const bulkDecisionSchema = z.strictObject({
  action: z.literal('approve_all'),
  dishId: z.guid().optional()
});
export type BulkDecisionInput = z.output<typeof bulkDecisionSchema>;
