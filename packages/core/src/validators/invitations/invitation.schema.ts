import { z } from 'zod';

const email = z.string().trim().toLowerCase().min(3).max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { error: 'invalid' });

/** An invitation (spec E12 R4): who and as what. A waiter has no link, so the role list leaves it out. */
export const invitationSchema = z.strictObject({
  email,
  role: z.enum(['owner', 'manager', 'sommelier'])
});
export type InvitationInput = z.output<typeof invitationSchema>;

/**
 * Accepting a link (A17). `name` and `password` are for a person without an account; an existing account only needs the token
 * (the service ignores both for it: accepting never changes a password). The length limits keep an absurd body from the hash.
 */
export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(16).max(200),
  name: z.string().trim().max(120).optional(),
  password: z.string().max(1024).optional()
});
export type AcceptInvitationInput = z.output<typeof acceptInvitationSchema>;
