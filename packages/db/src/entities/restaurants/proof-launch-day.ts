import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from './restaurant';

/**
 * The launch day of the results report (spec 2026-11-18-owner-proof-report, R5): an append-only log, the newest row is
 * the current day. A change is a new row with a reason, never an edit; the repository has no update and no delete.
 * `seq` (1, 2, …) is unique per restaurant, and the database itself refuses a second row without a reason, so the rule
 * holds even for a writer that bypasses the repository. The role is stored, not the person's name.
 */
export const ProofLaunchDayEntity = defineEntity({
  name: 'ProofLaunchDay',
  tableName: 'proof_launch_day',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    seq: p.integer(),
    launchDay: p.date(),
    reason: p.string().length(200).nullable(),
    setByRole: p.string(),
    /** the membership, for the audit (a plain column: it outlives the membership) */
    setByMembershipId: p.uuid().nullable(),
    setAt: p.datetime()
  },
  uniques: [{ properties: ['restaurant', 'seq'] }],
  indexes: [{ properties: ['restaurant', 'setAt'] }],
  checks: [
    { name: 'proof_launch_day_reason_check', expression: 'seq = 1 or (reason is not null and char_length(reason) > 0)' },
    { name: 'proof_launch_day_seq_check', expression: 'seq >= 1' }
  ]
});

export type ProofLaunchDayRow = InferEntity<typeof ProofLaunchDayEntity>;
