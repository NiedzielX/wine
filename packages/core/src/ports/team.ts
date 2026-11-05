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
  /**
   * written in the same transaction (at least one; the service writes one per change of role and one per change of
   * status): when one cannot be written, nothing changes. Each must belong to this restaurant, name the actor and the
   * target's user as actor and subject, and pass `assertValidAuthEvent`.
   */
  events: AuthEvent[];
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
   * One transaction: locks the restaurant's owner memberships, the actor's and the target (so two owners cannot demote
   * each other at once), re-checks INSIDE the lock that the actor is still active with `team.manage` and still may do
   * this to this person (`ForbiddenError`, `TeamHierarchyError`, `SelfChangeError`: the service's earlier check read
   * them outside the transaction), checks the version, refuses to leave the restaurant without an active owner
   * (`LastOwnerError`), applies the change, raises the version and writes `change.events`. `NotFoundError` for an unknown membership
   * (also one of another restaurant), `VersionConflictError` for a stale version.
   */
  applyChange(restaurantId: string, membershipId: string, change: TeamChange): Promise<TeamMember>;
}

export interface AuthEventFilter {
  type?: AuthEventType;
  /** events about this person (subject) */
  subjectUserId?: string;
  /** paging: only events older than this one in the listing order (`at`, then `id`, both descending): pass the last event of the previous page */
  before?: { at: string; id: string };
  /** at most `MAX_AUTH_EVENTS` (the default is `DEFAULT_AUTH_EVENTS`) */
  limit?: number;
}

/** The authentication trail. Reads are scoped to one restaurant: an event of another restaurant is never returned. */
export interface AuthAuditRepository {
  /**
   * Appends one event. Used for events that are not part of a change (the changes write theirs themselves).
   * `restaurantId` (null for an event of no restaurant) must equal `event.restaurantId`, and the event passes `assertValidAuthEvent`.
   */
  record(restaurantId: string | null, event: AuthEvent): Promise<void>;
  /** Newest first. */
  list(restaurantId: string, filter?: AuthEventFilter): Promise<AuthEvent[]>;
}
