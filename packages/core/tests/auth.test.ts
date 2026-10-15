import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth-service';
import { authorize, can, membershipFor, roleLabel } from '../src/auth/permissions';
import { DEFAULT_AUTH_CONFIG, type Principal, type Role } from '../src/auth/types';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEMO_PASSWORD } from '../src/demo/users';
import { ForbiddenError, InvalidCredentialsError, NoPanelAccessError } from '../src/errors';
import { MemoryAuthRepository, MemoryStore } from '../src/memory/memory-repositories';
import { authContract } from '../src/testing/auth-contract';
import type { PasswordHasher, SessionTokens } from '../src/ports/auth';

/** Fast, deterministic stand-ins: the real scrypt hasher is exercised in packages/db. */
const hasher: PasswordHasher = {
  dummyHash: 'plain:dummy',
  hash: async (p) => `plain:${p}`,
  // "legacy:" stands for a hash made with weaker parameters than today's
  verify: async (p, h) => h === `plain:${p}` || h === `legacy:${p}`,
  needsRehash: (h) => h.startsWith('legacy:')
};
let n = 0;
const tokens: SessionTokens = {
  generate: () => { const token = `token-${++n}`; return { token, hash: `h(${token})` }; },
  hash: (t) => `h(${t})`
};

function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  // the demo hashes are scrypt; for the service tests every demo user gets the fake hash of the demo password
  data.users.forEach((u) => { u.passwordHash = `plain:${DEMO_PASSWORD}`; });
  const store = MemoryStore.from(data);
  const repo = new MemoryAuthRepository(store);
  let now = Date.parse('2026-10-14T10:00:00.000Z');
  const clock = { now: () => new Date(now) };
  const advance = (ms: number) => { now += ms; };
  let seq = 0;
  const svc = new AuthService({ authRepository: repo, passwordHasher: hasher, sessionTokens: tokens, clock, idGenerator: { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` }, authConfig: DEFAULT_AUTH_CONFIG });
  return { svc, store, repo, advance, data };
}

describe('AuthService.login', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });

  it('signs a sommelier in and returns a principal with their restaurant and role', async () => {
    const { token, principal } = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect(token).toMatch(/^token-/);
    expect(principal.user).toMatchObject({ email: 'marta@halka.pl', name: 'Marta Wierzbicka' });
    expect(principal.memberships).toEqual([expect.objectContaining({ restaurantSlug: 'halka', role: 'sommelier' })]);
    expect(principal.session.csrfToken).toMatch(/^token-/);
    expect(principal.session.csrfToken).not.toBe(token);
  });

  it('ignores case and surrounding spaces in the e-mail address', async () => {
    expect((await t.svc.login('  MARTA@Halka.PL ', DEMO_PASSWORD)).principal.user.email).toBe('marta@halka.pl');
  });

  it('stores only the hash of the session token', async () => {
    const { token } = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect(t.store.sessions).toHaveLength(1);
    expect(t.store.sessions[0].tokenHash).toBe(`h(${token})`);
    expect(JSON.stringify(t.store.sessions)).not.toContain(`"${token}"`);
  });

  it('gives one answer for a wrong password and for an unknown account', async () => {
    const wrong = await t.svc.login('marta@halka.pl', 'wrong-password').catch((e) => e);
    const unknown = await t.svc.login('nobody@halka.pl', 'wrong-password').catch((e) => e);
    expect(wrong).toBeInstanceOf(InvalidCredentialsError);
    expect(unknown).toBeInstanceOf(InvalidCredentialsError);
    expect(wrong.message).toBe(unknown.message);
    expect(wrong.code).toBe(unknown.code);
  });

  it('locks the account after five failed attempts, even for the right password, and says the same thing', async () => {
    for (let i = 0; i < 5; i++) await expect(t.svc.login('marta@halka.pl', 'nope')).rejects.toBeInstanceOf(InvalidCredentialsError);
    const locked = await t.svc.login('marta@halka.pl', DEMO_PASSWORD).catch((e) => e);
    expect(locked).toBeInstanceOf(InvalidCredentialsError);
    expect(t.store.users.find((u) => u.email === 'marta@halka.pl')!.lockedUntil).not.toBeNull();
  });

  it('unlocks after 15 minutes and starts counting again', async () => {
    for (let i = 0; i < 5; i++) await t.svc.login('marta@halka.pl', 'nope').catch(() => null);
    t.advance(14 * 60_000);
    await expect(t.svc.login('marta@halka.pl', DEMO_PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsError);
    t.advance(2 * 60_000);
    await expect(t.svc.login('marta@halka.pl', DEMO_PASSWORD)).resolves.toBeDefined();
    expect(t.store.users.find((u) => u.email === 'marta@halka.pl')).toMatchObject({ failedAttempts: 0, lockedUntil: null });
  });

  it('a successful login resets the failed-attempt counter', async () => {
    for (let i = 0; i < 4; i++) await t.svc.login('marta@halka.pl', 'nope').catch(() => null);
    await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    for (let i = 0; i < 4; i++) await t.svc.login('marta@halka.pl', 'nope').catch(() => null);
    await expect(t.svc.login('marta@halka.pl', DEMO_PASSWORD)).resolves.toBeDefined();   // 4 + 4 failures never reached 5 in a row
  });

  it('a lock does not stop other accounts', async () => {
    for (let i = 0; i < 5; i++) await t.svc.login('marta@halka.pl', 'nope').catch(() => null);
    await expect(t.svc.login('tomasz@halka.pl', DEMO_PASSWORD)).resolves.toBeDefined();
  });

  it('refuses a waiter: right password, but no dashboard access, and no session is created', async () => {
    await expect(t.svc.login('kelner@halka.pl', DEMO_PASSWORD)).rejects.toBeInstanceOf(NoPanelAccessError);
    expect(t.store.sessions).toHaveLength(0);
  });
});

describe('AuthService: old password hashes are upgraded', () => {
  it('a correct login replaces a hash made with weaker parameters, and the same password still works', async () => {
    const t = build();
    const marta = t.store.users.find((u) => u.email === 'marta@halka.pl')!;
    marta.passwordHash = `legacy:${DEMO_PASSWORD}`;
    await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect(marta.passwordHash).toBe(`plain:${DEMO_PASSWORD}`);
    await expect(t.svc.login('marta@halka.pl', DEMO_PASSWORD)).resolves.toBeDefined();
  });

  it('a wrong password never upgrades (and never changes) the stored hash', async () => {
    const t = build();
    const marta = t.store.users.find((u) => u.email === 'marta@halka.pl')!;
    marta.passwordHash = `legacy:${DEMO_PASSWORD}`;
    await t.svc.login('marta@halka.pl', 'wrong-password').catch(() => null);
    expect(marta.passwordHash).toBe(`legacy:${DEMO_PASSWORD}`);
  });

  it('an up-to-date hash is left alone', async () => {
    const t = build();
    const before = t.store.users.find((u) => u.email === 'marta@halka.pl')!.passwordHash;
    await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect(t.store.users.find((u) => u.email === 'marta@halka.pl')!.passwordHash).toBe(before);
  });
});

describe('AuthService sessions', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });

  it('recognises a session token, and nothing else', async () => {
    const { token } = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect((await t.svc.authenticate(token))!.user.email).toBe('marta@halka.pl');
    expect(await t.svc.authenticate('forged')).toBeNull();
    expect(await t.svc.authenticate('')).toBeNull();
  });

  it('expires after 12 hours and removes the expired session', async () => {
    const { token } = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    t.advance(11 * 3_600_000);
    expect(await t.svc.authenticate(token)).not.toBeNull();
    t.advance(2 * 3_600_000);
    expect(await t.svc.authenticate(token)).toBeNull();
    expect(t.store.sessions).toHaveLength(0);
  });

  it('logout ends only that session', async () => {
    const a = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    const b = await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    expect(a.token).not.toBe(b.token);                       // a new token on every login
    await t.svc.logout(a.token);
    expect(await t.svc.authenticate(a.token)).toBeNull();
    expect(await t.svc.authenticate(b.token)).not.toBeNull();
    await expect(t.svc.logout('unknown')).resolves.toBeUndefined();
  });

  it('cleans up other expired sessions when someone signs in', async () => {
    await t.svc.login('marta@halka.pl', DEMO_PASSWORD);
    t.advance(13 * 3_600_000);
    await t.svc.login('tomasz@halka.pl', DEMO_PASSWORD);
    expect(t.store.sessions).toHaveLength(1);
  });
});

describe('permissions', () => {
  const principal = (role: Role): Principal => ({
    user: { id: 'u', email: 'u@x', name: 'U' }, session: { id: 's', csrfToken: 'c', expiresAt: '2030-01-01T00:00:00.000Z' },
    memberships: [{ restaurantId: 'r1', restaurantSlug: 'halka', restaurantName: 'Halka', role }]
  });

  it('follows the roles matrix: only the sommelier decides pairings; owner, manager and sommelier run the rest', () => {
    expect(can('sommelier', 'pairings.decide')).toBe(true);
    expect(can('manager', 'pairings.decide')).toBe(false);
    expect(can('owner', 'pairings.decide')).toBe(false);
    for (const r of ['owner', 'manager', 'sommelier'] as Role[]) for (const p of ['panel.view', 'wines.toggle', 'publish', 'settings.change'] as const) expect(can(r, p)).toBe(true);
    for (const p of ['panel.view', 'pairings.decide', 'wines.toggle', 'publish', 'settings.change'] as const) expect(can('waiter', p)).toBe(false);
  });

  it('authorize returns the membership or throws ForbiddenError', () => {
    expect(authorize(principal('sommelier'), 'halka', 'pairings.decide').role).toBe('sommelier');
    expect(() => authorize(principal('manager'), 'halka', 'pairings.decide')).toThrow(ForbiddenError);
    expect(() => authorize(principal('sommelier'), 'other-restaurant', 'panel.view')).toThrow(ForbiddenError);
    expect(membershipFor(principal('owner'), 'nope')).toBeNull();
  });

  it('has a label for every role', () => {
    expect(roleLabel('sommelier')).toBe('Wine Director');
    expect(roleLabel('manager')).toBe('General Manager');
  });
});

authContract('memory', async () => {
  const dataset = buildDemoDataset({ ids: 'uuid' });
  return { repo: new MemoryAuthRepository(MemoryStore.from(dataset)), dataset };
}, { describe, it, expect, beforeEach });

describe('error names', () => {
  it('are fixed strings: production builds minify class names, and the app recognises errors by name', async () => {
    const { NotFoundError, ValidationError, VersionConflictError, InvariantError, ForbiddenError, InvalidCredentialsError, NoPanelAccessError } = await import('../src/errors');
    const { TableNeedsTwoDishesError } = await import('../src/services/guest/recommendation-service');
    const names = [new NotFoundError('x'), new ValidationError('c', 'm'), new VersionConflictError(), new InvariantError('c', 'm'), new ForbiddenError(), new InvalidCredentialsError(), new NoPanelAccessError(), new TableNeedsTwoDishesError()].map((e) => e.name);
    expect(names).toEqual(['NotFoundError', 'ValidationError', 'VersionConflictError', 'InvariantError', 'ForbiddenError', 'InvalidCredentialsError', 'NoPanelAccessError', 'TableNeedsTwoDishesError']);
  });
});
