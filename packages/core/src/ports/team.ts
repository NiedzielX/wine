import type { AuthEvent, AuthEventType, MembershipStatus, Role, TeamMember } from '../auth/types';

/** A change to one membership, applied atomically together with its audit event (spec E12 R3, Q11). */
export interface TeamChange {
  /** the version the caller read; a different stored version is a `VersionConflictError` */
  expectedVersion: number;
  /** what changes; the other field stays */
  set: { role?: Role; status?: MembershipStatus };
  /** user id of the person making the change */
  actorUserId: string;
  at: string;
  /** written in the same transaction: when it cannot be written, nothing changes */
  event: AuthEvent;
}

/**
 * The team of one restaurant. Every method takes the restaurant's id: a membership of another
 * restaurant is "not found", never readable or changeable (tenant isolation is part of the contract).
 */
export interface TeamRepository {
  /** Everyone with a membership here, active or deactivated, oldest first. */
  list(restaurantId: string): Promise<TeamMember[]>;
  find(restaurantId: string, membershipId: string): Promise<TeamMember | null>;
  findByUser(restaurantId: string, userId: string): Promise<TeamMember | null>;
  /**
   * One transaction: locks the restaurant's owner memberships and the target (so two owners cannot demote each
   * other at once), checks the version, refuses to leave the restaurant without an active owner (`LastOwnerError`),
   * applies the change, raises the version and writes `change.event`. `NotFoundError` for an unknown membership
   * (also one of another restaurant), `VersionConflictError` for a stale version.
   */
  applyChange(restaurantId: string, membershipId: string, change: TeamChange): Promise<TeamMember>;
}

export interface AuthEventFilter {
  type?: AuthEventType;
  /** events about this person (subject) */
  subjectUserId?: string;
  /** only events older than this ISO time (paging) */
  before?: string;
  limit?: number;
}

/** The authentication trail. Reads are scoped to one restaurant: an event of another restaurant is never returned. */
export interface AuthAuditRepository {
  /** Appends one event. Used for events that are not part of a change (the changes write theirs themselves). */
  record(event: AuthEvent): Promise<void>;
  /** Newest first. */
  list(restaurantId: string, filter?: AuthEventFilter): Promise<AuthEvent[]>;
}
