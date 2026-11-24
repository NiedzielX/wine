import { ValidationError, VersionConflictError } from '../../errors';
import type { AppendLaunchDayInput, ProofLaunchEntry } from '../../ports/proof';

/**
 * Pure rules of the launch day log (spec 2026-11-18-owner-proof-report, R5). The day is never edited: every change is
 * a new entry. The memory store and PostgreSQL both apply `checkLaunchAppend` under their own lock, so the answers agree.
 */

/** Longest reason of a launch day entry (the database checks it too). */
export const PROOF_REASON_MAX = 200;

/** The reason as it is stored: trimmed, and null when nothing is left. */
export function normalizeReason(reason: string | null | undefined): string | null {
  const text = (reason ?? '').trim();
  return text === '' ? null : text;
}

/**
 * Whether `input` may be appended after `current` (the newest entry, null when there is none), in this order:
 * `expectedCurrent` is the entry the caller saw (VersionConflictError otherwise: a retry of a write that succeeded is
 * stale too, so the log never gets the same change twice); the first entry needs no reason, every later one does
 * (`reason_required`); a reason is at most `PROOF_REASON_MAX` characters (`reason_too_long`). Returns the stored reason.
 */
export function checkLaunchAppend(current: ProofLaunchEntry | null, input: Pick<AppendLaunchDayInput, 'expectedCurrent' | 'reason'>): string | null {
  if ((current?.id ?? null) !== input.expectedCurrent) throw new VersionConflictError();
  const reason = normalizeReason(input.reason);
  if (current && reason === null) throw new ValidationError('reason_required', 'A change of the launch day needs a reason.');
  if (reason !== null && reason.length > PROOF_REASON_MAX) throw new ValidationError('reason_too_long', `The reason can have at most ${PROOF_REASON_MAX} characters.`);
  return reason;
}
