import type { Role } from '../auth/types';

/**
 * The launch day of the results report (spec 2026-11-18-owner-proof-report, R5): the day the guests could first use
 * Wine Match, which fixes the baseline window. An append-only log: the newest entry is the current day, older ones are
 * the history. There is no update and no delete, on purpose (a test pins the shape of the port).
 */

/** One entry of the log. `launchDay` is a business day (`YYYY-MM-DD`). */
export interface ProofLaunchEntry {
  id: string;
  /** 1, 2, … per restaurant, without gaps */
  seq: number;
  launchDay: string;
  /** null only for the first entry; every later one has it (R5) */
  reason: string | null;
  /** the role of the person (not personal data) */
  setByRole: Role;
  /** the membership, for the audit; null when it is gone */
  setByMembershipId: string | null;
  /** when the entry was made (the application clock) */
  setAt: string;
}

export interface AppendLaunchDayInput {
  /** the id of the new entry */
  id: string;
  launchDay: string;
  reason: string | null;
  setByRole: Role;
  setByMembershipId: string | null;
  at: string;
  /** the `id` of the current entry the caller saw, null when it saw none; a different one is VersionConflictError */
  expectedCurrent: string | null;
}

export interface ProofLaunchRepository {
  /** the newest entry; null when the restaurant has none */
  current(restaurantId: string): Promise<ProofLaunchEntry | null>;
  /** every entry, newest first */
  history(restaurantId: string): Promise<ProofLaunchEntry[]>;
  /**
   * Adds an entry under a lock of the restaurant's log: the check of `expectedCurrent` and of the reason and the insert
   * are one step, so two parallel writers never both succeed (the second gets VersionConflictError). Rules:
   * `checkLaunchAppend`. An unknown restaurant is NotFoundError.
   */
  append(restaurantId: string, input: AppendLaunchDayInput): Promise<ProofLaunchEntry>;
}
