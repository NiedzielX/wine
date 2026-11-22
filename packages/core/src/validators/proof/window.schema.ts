import { z } from 'zod';
import { PROOF_MAX_WINDOW } from '../../services/proof/proof-report';

/**
 * The query of `GET /restaurants/{slug}/proof-report` (spec 2026-11-18-owner-proof-report, R11): `window` is a whole
 * number from 1 to `PROOF_MAX_WINDOW`, absent = the newest complete window. It arrives as text from the address, so
 * the text must be plain digits (`1e9`, `abc`, `0x2`, `+3` and `2.0` are refused, not read as numbers).
 */
const windowNumber = z.union([
  z.number().int().min(1).max(PROOF_MAX_WINDOW),
  z.string().regex(/^[1-9]\d?$/, 'invalid').transform(Number).pipe(z.number().int().min(1).max(PROOF_MAX_WINDOW))
]);

export const proofWindowQuerySchema = z.strictObject({ window: windowNumber.optional() });

export type ProofWindowQuery = z.output<typeof proofWindowQuerySchema>;
