import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthRepository, AuthUser, Membership, SessionRecord } from '@wine-match/core';
import { MembershipEntity, SessionEntity, UserEntity, type UserRow } from '../entities';

interface Deps { em: EntityManager }

const toUser = (u: UserRow): AuthUser => ({
  id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash, failedAttempts: u.failedAttempts,
  lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null, lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null
});

export class PgAuthRepository implements AuthRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async findUserByEmail(email: string) {
    const u = await this.em.findOne(UserEntity, { email });
    return u ? toUser(u) : null;
  }

  async membershipsOf(userId: string): Promise<Membership[]> {
    const rows = await this.em.find(MembershipEntity, { user: userId }, { populate: ['restaurant'], orderBy: { createdAt: 'asc' } });
    return rows.map((m) => ({ restaurantId: m.restaurant.id, restaurantSlug: m.restaurant.slug, restaurantName: m.restaurant.name, role: m.role }));
  }

  /** One UPDATE ... RETURNING: parallel failed attempts are all counted, none is lost. */
  async registerFailedLogin(userId: string, input: { maxAttempts: number; lockMs: number; now: string }) {
    const lockUntil = new Date(Date.parse(input.now) + input.lockMs);
    const rows = await this.em.getConnection().execute<Array<{ failed_attempts: number; locked_until: Date | null }>>(
      `update app_user set
         failed_attempts = (case when locked_until is not null and locked_until <= ?::timestamptz then 0 else failed_attempts end) + 1,
         locked_until = case
           when (case when locked_until is not null and locked_until <= ?::timestamptz then 0 else failed_attempts end) + 1 >= ? then ?::timestamptz
           when locked_until is not null and locked_until <= ?::timestamptz then null
           else locked_until end
       where id = ?
       returning failed_attempts, locked_until`,
      [input.now, input.now, input.maxAttempts, lockUntil, input.now, userId]
    );
    const r = rows[0];
    return { attempts: r ? Number(r.failed_attempts) : 0, lockedUntil: r?.locked_until ? new Date(r.locked_until).toISOString() : null };
  }

  async registerSuccessfulLogin(userId: string, at: string) {
    await this.em.nativeUpdate(UserEntity, { id: userId }, { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(at) });
  }

  async createSession(s: SessionRecord) {
    this.em.create(SessionEntity, {
      id: s.id, user: this.em.getReference(UserEntity, s.userId), tokenHash: s.tokenHash, csrfToken: s.csrfToken,
      createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt)
    });
    await this.em.flush();
  }

  async findSession(tokenHash: string) {
    const s = await this.em.findOne(SessionEntity, { tokenHash }, { populate: ['user'] });
    if (!s) return null;
    return {
      session: { id: s.id, userId: s.user.id, tokenHash: s.tokenHash, csrfToken: s.csrfToken, createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString() },
      user: toUser(s.user)
    };
  }

  async deleteSession(tokenHash: string) {
    await this.em.nativeDelete(SessionEntity, { tokenHash });
  }

  async updatePasswordHash(userId: string, passwordHash: string) {
    await this.em.nativeUpdate(UserEntity, { id: userId }, { passwordHash });
  }

  async deleteExpiredSessions(now: string) {
    return this.em.nativeDelete(SessionEntity, { expiresAt: { $lte: new Date(now) } });
  }
}
