import { z } from 'zod';
import { SLUG_PATTERN } from '../../services/restaurants/restaurant-service';

/**
 * The form of "Ordered" / "Undo" on the staff view G9 (spec 2026-10-16-recommendation-code, R7, Contracts; the field
 * names are a contract, BACKWARD_COMPATIBILITY §8). `code` is the raw text the waiter typed (≤ 16 characters, as
 * `normalizeCode` reads it; the service normalises it). `slug` has the shape of a restaurant slug, so a redirect built
 * from it stays on this site. `sid` and `lang` only carry the page's state back; they are checked where they are used.
 */
export const CODE_ACTION_INTENTS = ['confirm', 'undo'] as const;
export type CodeActionIntent = (typeof CODE_ACTION_INTENTS)[number];

export const codeActionSchema = z.strictObject({
  slug: z.string().min(2).max(40).regex(SLUG_PATTERN),
  code: z.string().min(1).max(16),
  intent: z.enum(CODE_ACTION_INTENTS),
  sid: z.string().max(64).optional(),
  lang: z.string().max(8).optional()
});
export type CodeActionInput = z.output<typeof codeActionSchema>;
