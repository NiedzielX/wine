import { InvalidCredentialsError, NoPanelAccessError } from '../errors';
import type { AuthRepository, PasswordHasher, SessionTokens } from '../ports/auth';
import type { Clock, IdGenerator } from '../ports/runtime';
import { can } from './permissions';
import type { AuthConfig, Principal } from './types';

export interface AuthServiceDeps {
  authRepository: AuthRepository;
  passwordHasher: PasswordHasher;
  sessionTokens: SessionTokens;
  clock: Clock;
  idGenerator: IdGenerator;
  authConfig: AuthConfig;
}

export const MIN_PASSWORD_LENGTH = 12;

/**
 * Sign-in, sessions and lockout. Deliberately gives one answer for "no such user", "wrong password"
 * and "account locked", and spends the same time on all three, so it cannot be used to find accounts.
 */
export class AuthService {
  private readonly d: AuthServiceDeps;

  constructor(deps: AuthServiceDeps) {
    this.d = deps;
  }

  /** Verifies the credentials and opens a session. Returns the raw token for the cookie (never stored). */
  async login(email: string, password: string): Promise<{ token: string; principal: Principal }> {
    const { authRepository: repo, passwordHasher: hasher, clock, authConfig: cfg } = this.d;
    const now = clock.now();
    const user = await repo.findUserByEmail(email.trim().toLowerCase());
    const locked = !!user?.lockedUntil && Date.parse(user.lockedUntil) > now.getTime();

    if (!user || locked) {
      await hasher.verify(password, hasher.dummyHash);
      throw new InvalidCredentialsError();
    }
    if (!(await hasher.verify(password, user.passwordHash))) {
      await repo.registerFailedLogin(user.id, { maxAttempts: cfg.maxFailedAttempts, lockMs: cfg.lockMinutes * 60_000, now: now.toISOString() });
      throw new InvalidCredentialsError();
    }

    await repo.registerSuccessfulLogin(user.id, now.toISOString());
    // the only moment the plain password is in hand: bring an old hash up to today's strength
    if (hasher.needsRehash(user.passwordHash)) await repo.updatePasswordHash(user.id, await hasher.hash(password));
    const memberships = await repo.membershipsOf(user.id);
    // the password is right, but a role without dashboard access (a waiter) gets no session
    if (!memberships.some((m) => can(m.role, 'panel.view'))) throw new NoPanelAccessError();

    const { token, hash } = this.d.sessionTokens.generate();
    const csrfToken = this.d.sessionTokens.generate().token;
    const session = {
      id: this.d.idGenerator.uuid(), userId: user.id, tokenHash: hash, csrfToken,
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + cfg.sessionHours * 3_600_000).toISOString()
    };
    await repo.createSession(session);
    await repo.deleteExpiredSessions(now.toISOString());
    return { token, principal: this.principal(user, memberships, session) };
  }

  /** The caller behind a session token, or null when it is unknown or expired. */
  async authenticate(token: string): Promise<Principal | null> {
    if (!token) return null;
    const { authRepository: repo, clock } = this.d;
    const hash = this.d.sessionTokens.hash(token);
    const found = await repo.findSession(hash);
    if (!found) return null;
    if (Date.parse(found.session.expiresAt) <= clock.now().getTime()) {
      await repo.deleteSession(hash);
      return null;
    }
    return this.principal(found.user, await repo.membershipsOf(found.user.id), found.session);
  }

  async logout(token: string): Promise<void> {
    if (token) await this.d.authRepository.deleteSession(this.d.sessionTokens.hash(token));
  }

  private principal(user: { id: string; email: string; name: string }, memberships: Principal['memberships'], s: { id: string; csrfToken: string; expiresAt: string }): Principal {
    return { user: { id: user.id, email: user.email, name: user.name }, memberships, session: { id: s.id, csrfToken: s.csrfToken, expiresAt: s.expiresAt } };
  }
}
