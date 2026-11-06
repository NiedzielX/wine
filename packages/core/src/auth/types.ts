export type Role = 'owner' | 'manager' | 'sommelier' | 'waiter';

/** Who performs a change: the id goes to the audit trail, the name is shown in the dashboard. */
export interface Actor {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  /** lower-case, unique */
  email: string;
  name: string;
  passwordHash: string;
  failedAttempts: number;
  /** ISO time until which logins are refused, or null */
  lockedUntil: string | null;
  lastLoginAt: string | null;
}

export interface Membership {
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  role: Role;
}

export type MembershipStatus = 'active' | 'deactivated';
export const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ['active', 'deactivated'];
export const ROLES: readonly Role[] = ['owner', 'manager', 'sommelier', 'waiter'];

/** One person's place in a restaurant's team, as the team screen (A15) shows it. */
export interface TeamMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  /** for `expectedVersion`; every change of role or status raises it */
  version: number;
  lastLoginAt: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  /** user id of the person who deactivated this one */
  deactivatedBy: string | null;
}

/** The kinds of authentication event (spec E12 R11). The table's CHECK lists the same names. */
export const AUTH_EVENT_TYPES = [
  'login_succeeded', 'login_failed', 'account_locked', 'logout', 'session_revoked', 'password_changed', 'reset_issued', 'reset_completed',
  'invite_created', 'invite_revoked', 'invite_accepted', 'role_changed', 'member_deactivated', 'member_reactivated',
  'pin_set', 'pin_login_succeeded', 'pin_login_failed', 'pin_locked', 'pin_paused', 'staff_access_changed'
] as const;
export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

/**
 * The only keys an event's `meta` may carry (spec E12 R11): never a password, a PIN, a token or a stranger's
 * full e-mail address. New phases add keys here, not ad hoc.
 */
export const AUTH_EVENT_META_KEYS = ['membership_id', 'from', 'to', 'role', 'invitation_id'] as const;
export type AuthEventMeta = Partial<Record<(typeof AUTH_EVENT_META_KEYS)[number], string | number | boolean | null>>;

export interface AuthEvent {
  id: string;
  /** null for an event that belongs to no restaurant (a sign-in) */
  restaurantId: string | null;
  /** user ids, deliberately without a foreign key: the trail outlives the account */
  actorUserId: string | null;
  subjectUserId: string | null;
  type: AuthEventType;
  meta: AuthEventMeta;
  at: string;
}

/** The roles an invitation can carry (spec E12 R4): a waiter has no link, the owner or manager makes them in A15 (R9, F5). */
export const INVITABLE_ROLES: readonly Role[] = ['owner', 'manager', 'sommelier'];
/** How long an invitation link works (spec E12 Q6). */
export const INVITATION_HOURS = 72;

/**
 * A pending invitation as A15 lists it: not accepted, not revoked (it may have expired: the list says so). The token
 * is never part of it: only its SHA-256 is stored, and the plain token is shown once, to the person who invited.
 */
export interface Invitation {
  id: string;
  restaurantId: string;
  /** lower-case */
  email: string;
  role: Role;
  /** user id of the inviter (a member, or the platform account for `inviteOwner`) */
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  /** SHA-256 of the session token; the token itself is never stored */
  tokenHash: string;
  /** bound to the session, required on state-changing API calls */
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
}

/** The authenticated caller, as the application sees it. */
export interface Principal {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
  session: { id: string; csrfToken: string; expiresAt: string };
}

export interface AuthConfig {
  maxFailedAttempts: number;
  lockMinutes: number;
  sessionHours: number;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = { maxFailedAttempts: 5, lockMinutes: 15, sessionHours: 12 };
