import type { AuthUser, Membership, SessionRecord } from '../auth/types';

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  membershipsOf(userId: string): Promise<Membership[]>;
  /**
   * Counts a failed login atomically and locks the account when `maxAttempts` is reached.
   * A lock that has already expired starts the count again from zero.
   */
  registerFailedLogin(userId: string, input: { maxAttempts: number; lockMs: number; now: string }): Promise<{ attempts: number; lockedUntil: string | null }>;
  /** Clears the failed-login count and the lock, stamps the login time. */
  registerSuccessfulLogin(userId: string, at: string): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  findSession(tokenHash: string): Promise<{ session: SessionRecord; user: AuthUser } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(now: string): Promise<number>;
  /** Replaces the stored password hash (used when a hash is upgraded to the current parameters). */
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

/** Implemented with scrypt in @wine-match/db/auth; core stays free of Node built-ins. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
  /** True when the hash was made with weaker parameters than today's: it is replaced after a correct login. */
  needsRehash(hash: string): boolean;
  /** A valid hash of a random password: verified against when the account does not exist (equal timing). */
  readonly dummyHash: string;
}

export interface SessionTokens {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}
