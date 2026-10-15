import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { SessionRecord } from '../auth/types';
import type { AuthRepository } from '../ports/auth';

/**
 * Behaviour every AuthRepository must have (memory and PostgreSQL): the failed-login counter and
 * the lock, session lookup by token hash, cleanup of expired sessions.
 */

const NOW = '2026-10-14T10:00:00.000Z';
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
let n = 0;
const session = (userId: string, over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, userId, tokenHash: `hash-${n}`, csrfToken: `csrf-${n}`,
  createdAt: NOW, expiresAt: at(3_600_000), ...over
});

export function authContract(name: string, setup: () => Promise<{ repo: AuthRepository; dataset: DemoDataset }>, t: ContractRunner): void {
  t.describe(`auth contract: ${name}`, () => {
    let repo: AuthRepository;
    let ds: DemoDataset;
    t.beforeEach(async () => { ({ repo, dataset: ds } = await setup()); });
    const marta = () => ds.users.find((u) => u.key === 'marta')!;
    const lock = { maxAttempts: 3, lockMs: 900_000 };

    t.it('finds a user by e-mail with the password hash, and nobody else', async () => {
      const u = (await repo.findUserByEmail('marta@halka.pl'))!;
      t.expect(u).toMatchObject({ id: marta().id, name: 'Marta Wierzbicka', passwordHash: marta().passwordHash, failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
      t.expect(await repo.findUserByEmail('nobody@halka.pl')).toBeNull();
    });

    t.it('lists the restaurants a user can access, with the role', async () => {
      t.expect(await repo.membershipsOf(marta().id)).toEqual([{ restaurantId: ds.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'sommelier' }]);
      t.expect(await repo.membershipsOf('00000000-0000-4000-8000-00000000dead')).toEqual([]);
    });

    t.it('counts failed logins and locks the account at the limit', async () => {
      t.expect(await repo.registerFailedLogin(marta().id, { ...lock, now: NOW })).toEqual({ attempts: 1, lockedUntil: null });
      t.expect(await repo.registerFailedLogin(marta().id, { ...lock, now: NOW })).toEqual({ attempts: 2, lockedUntil: null });
      const third = await repo.registerFailedLogin(marta().id, { ...lock, now: NOW });
      t.expect(third).toEqual({ attempts: 3, lockedUntil: at(900_000) });
      t.expect(await repo.findUserByEmail('marta@halka.pl')).toMatchObject({ failedAttempts: 3, lockedUntil: at(900_000) });
    });

    t.it('counts concurrent failures without losing any', async () => {
      await Promise.all([1, 2, 3, 4].map(() => repo.registerFailedLogin(marta().id, { maxAttempts: 10, lockMs: 900_000, now: NOW })));
      t.expect((await repo.findUserByEmail('marta@halka.pl'))!.failedAttempts).toBe(4);
    });

    t.it('starts again from zero once an earlier lock has expired', async () => {
      for (let i = 0; i < 3; i++) await repo.registerFailedLogin(marta().id, { ...lock, now: NOW });
      const after = await repo.registerFailedLogin(marta().id, { ...lock, now: at(900_001) });
      t.expect(after).toEqual({ attempts: 1, lockedUntil: null });
    });

    t.it('a successful login clears the counter and the lock and stamps the time', async () => {
      for (let i = 0; i < 3; i++) await repo.registerFailedLogin(marta().id, { ...lock, now: NOW });
      await repo.registerSuccessfulLogin(marta().id, at(1000));
      t.expect(await repo.findUserByEmail('marta@halka.pl')).toMatchObject({ failedAttempts: 0, lockedUntil: null, lastLoginAt: at(1000) });
    });

    t.it('finds a session by token hash together with its user, and deletes it', async () => {
      const s = session(marta().id);
      await repo.createSession(s);
      const found = (await repo.findSession(s.tokenHash))!;
      t.expect(found.session).toEqual(s);
      t.expect(found.user.email).toBe('marta@halka.pl');
      t.expect(await repo.findSession('hash-unknown')).toBeNull();
      await repo.deleteSession(s.tokenHash);
      t.expect(await repo.findSession(s.tokenHash)).toBeNull();
    });

    t.it('replaces the password hash', async () => {
      await repo.updatePasswordHash(marta().id, 'scrypt$32768$8$3$c2FsdA==$aGFzaA==');
      t.expect((await repo.findUserByEmail('marta@halka.pl'))!.passwordHash).toBe('scrypt$32768$8$3$c2FsdA==$aGFzaA==');
      t.expect((await repo.findUserByEmail('tomasz@halka.pl'))!.passwordHash).not.toBe('scrypt$32768$8$3$c2FsdA==$aGFzaA==');
    });

    t.it('removes only the expired sessions', async () => {
      const live = session(marta().id, { expiresAt: at(3_600_000) });
      const dead = session(marta().id, { expiresAt: at(-1000) });
      await repo.createSession(live);
      await repo.createSession(dead);
      t.expect(await repo.deleteExpiredSessions(NOW)).toBe(1);
      t.expect(await repo.findSession(dead.tokenHash)).toBeNull();
      t.expect(await repo.findSession(live.tokenHash)).not.toBeNull();
    });
  });
}
