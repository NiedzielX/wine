import { z } from 'zod';

/**
 * A change to one team member (spec E12 R3): their role, their status, or both. At least one field is required.
 * The version the caller read goes in `If-Match` (API) or a hidden form field, never in this body.
 */
export const teamChangeSchema = z.strictObject({
  role: z.enum(['owner', 'manager', 'sommelier', 'waiter']).optional(),
  status: z.enum(['active', 'deactivated']).optional()
}).refine((v) => v.role !== undefined || v.status !== undefined, { message: 'required', path: ['role'] });
export type TeamChangeInput = z.output<typeof teamChangeSchema>;
