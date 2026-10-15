import { z } from 'zod';

/** Sign-in. The length limits keep an absurd body from reaching the password hash. */
export const loginSchema = z.strictObject({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024)
});
export type LoginInput = z.output<typeof loginSchema>;
