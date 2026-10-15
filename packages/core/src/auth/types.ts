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
