import { z } from 'zod';
import { PROOF_REASON_MAX } from '../../services/proof/launch-rules';
import { businessDayTime } from '../sales/sales-period.schema';

/**
 * The body of `POST /restaurants/{slug}/proof-launch` (spec 2026-11-18-owner-proof-report, R11): the launch day, an
 * optional reason (required from the second entry, which the service decides) and `expectedCurrent`, the id of the
 * current entry the caller saw or `null` when it saw none (always sent, so a stale form cannot omit it). Anything else,
 * also a restaurant, is refused (`strictObject`). A date in the future is checked by the service, which has the clock.
 */
export const PROOF_EARLIEST_LAUNCH_DAY = '2020-01-01';

const earliest = businessDayTime(PROOF_EARLIEST_LAUNCH_DAY)!;
const launchDay = z.string().max(10).refine((s) => {
  const t = businessDayTime(s);
  return t !== null && t >= earliest;
}, 'invalid');

export const launchDaySchema = z.strictObject({
  launchDay,
  reason: z.string().max(PROOF_REASON_MAX).nullable().optional(),
  expectedCurrent: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid').nullable()
});

export type LaunchDayInput = z.output<typeof launchDaySchema>;
