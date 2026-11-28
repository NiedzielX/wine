'use server';

import { PROOF_REASON_MAX } from '@wine-match/core';
import { act, str } from '@/server/action-runner';
import { domainError } from '@/server/domain-errors';

/**
 * The one server action of the results report (spec 2026-11-18-owner-proof-report, R5, R10, A33): adds an entry to the launch
 * day log. A plain form post (no JavaScript). `proof.manage` is checked here again for a post sent directly (owner and general
 * manager; the Wine Director cannot even open the screen, and a forged post is refused). `expectedCurrent` is the id of the entry
 * the form was drawn from (empty = none yet): a stale form is a `version_conflict`, never an overwrite. The rules (day not in the
 * future, reason from the second entry, the log under a lock) are `ProofReportService`'s; the session carries no membership id, so
 * only the role of the writer is stored.
 */
export async function setProofLaunchDay(form: FormData) {
  return act(form, 'proof.manage', async ({ c, slug, membership, form: f }): Promise<Record<string, string>> => {
    const reason = str(f, 'reason').trim();
    if (reason.length > PROOF_REASON_MAX) return { error: 'reason_too_long' };
    try {
      await c.proofReportService.setLaunchDay(
        slug,
        { launchDay: str(f, 'launchDay'), reason: reason || null, expectedCurrent: str(f, 'expectedCurrent') || null },
        { role: membership.role, membershipId: null }
      );
    } catch (e) {
      // a body that breaks the schema in some other way (a forged id) is read as a bad launch day, not as the generic "check the details"
      if (domainError(e)?.code === 'validation_failed') return { error: 'invalid_launch_day' };
      throw e;
    }
    return { saved: 'launch_day_saved' };
  });
}
