import { z } from 'zod';

/** Longest note accepted at the door; the 140-character rule itself belongs to the pairing rules. */
const NOTE_INPUT_LIMIT = 1000;

/**
 * ONE change per request: a status (approve / reject / restore), a role or a note. Reordering has its own
 * screen. The status, the role and the note are all a client may set; everything else (ids, rank, source,
 * version) is refused as an unknown field.
 */
export const pairingUpdateSchema = z
  .strictObject({
    status: z.enum(['approved', 'rejected', 'suggested']).optional(),
    role: z.enum(['primary', 'alternative', 'best_value']).optional(),
    comment: z.string().max(NOTE_INPUT_LIMIT).optional()
  })
  .refine((b) => [b.status, b.role, b.comment].filter((v) => v !== undefined).length === 1, { error: 'one_of_status_role_comment' });
export type PairingUpdateInput = z.output<typeof pairingUpdateSchema>;
