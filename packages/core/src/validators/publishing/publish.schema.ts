import { z } from 'zod';

/**
 * POST /restaurants/{slug}/publish (spec 2026-11-04-panel-completion, R12): the body is optional; `expectedLatest` is the
 * number of the latest version the caller saw (0 = never published). Without it the publish behaves as before.
 */
export const publishSchema = z.strictObject({ expectedLatest: z.number().int().min(0).optional() });
export type PublishBody = z.output<typeof publishSchema>;
