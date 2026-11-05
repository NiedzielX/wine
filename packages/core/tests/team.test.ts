import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth-service';
import { TeamService } from '../src/auth/team-service';
import { DEFAULT_AUTH_CONFIG, type Actor, type Role } from '../src/auth/types';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEMO_PASSWORD } from '../src/demo/users';
import { MemoryAuthAuditRepository, MemoryAuthRepository, MemoryStore, MemoryTeamRepository, createMemoryRepositories } from '../src/memory/memory-repositories';
import type { PasswordHasher, SessionTokens } from '../src/ports/auth';
import { addSecondRestaurant, teamContract } from '../src/testing/team-contract';

teamContract('memory', async () => {
  const dataset = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(dataset);
  const second = addSecondRestaurant(store);
  return { team: new MemoryTeamRepository(store), audit: new MemoryAuthAuditRepository(store), auth: new MemoryAuthRepository(store), dataset, second };
}, { describe, it, expect, beforeEach });

const hasher: PasswordHasher = { dummyHash: 'plain:dummy', hash: async (p) => `plain:${p}`, verify: async (p, h) => h === `plain:${p}`, needsRehash: () => false };
let tokenSeq = 0;
const tokens: SessionTokens = { generate: () => { const token = `token-${++tokenSeq}`; return { token, hash: `h(${token})` }; }, hash: (t) => `h(${t})` };

/** Halka (marta sommelier, tomasz manager, jan waiter) plus a second restaurant with two owners, a manager and a sommelier. */
function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  data.users.forEach((u) => { u.passwordHash = `plain:${DEMO_PASSWORD}`; });
  const store = MemoryStore.from(data);
  const second = addSecondRestaurant(store);
  store.users.forEach((u) => { u.passwordHash = `plain:${DEMO_PASSWORD}`; });
  // Halka gets an owner of its own so every role is present there
  const halkaOwner = { userId: '5ec0d000-0000-4000-8000-0000000000c1', membershipId: '5ec0d000-0000-4000-8000-0000000000d1' };
  store.users.push({ id: halkaOwner.userId, email: 'owner@halka.test', name: 'Halka Owner', passwordHash: `plain:${DEMO_PASSWORD}`, failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
  store.memberships.push({ userId: halkaOwner.userId, membershipId: halkaOwner.membershipId, restaurantId: data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner', status: 'active', version: 1, createdAt: '2026-10-01T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
  const repos = createMemoryRepositories(store);
  let now = Date.parse('2026-11-05T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date(now += 1000) };
  const idGenerator = { uuid: () => `5ec0d000-0000-4000-8000-${String(800_000_000_000 + ++seq)}` };
  const team = new TeamService({ ...repos, clock, idGenerator });
  const auth = new AuthService({ authRepository: new MemoryAuthRepository(store), passwordHasher: hasher, sessionTokens: tokens, clock, idGenerator, authConfig: DEFAULT_AUTH_CONFIG });
  const actor = (userId: string, name: string): Actor => ({ id: userId, name });
  const m = (key: string) => data.users.find((u) => u.key === key)!;
  return {
    data, store, second, team, auth, repos, idGenerator,
    halka: {
      owner: actor(halkaOwner.userId, 'Halka Owner'), manager: actor(m('tomasz').id, 'Tomasz Lis'), sommelier: actor(m('marta').id, 'Marta Wierzbicka'), waiter: actor(m('kelner').id, 'Jan Kelner'),
      ownerMembership: halkaOwner.membershipId, managerMembership: m('tomasz').membershipId, sommelierMembership: m('marta').membershipId, waiterMembership: m('kelner').membershipId
    }
  };
}

function addHalkaManager(t: ReturnType<typeof build>, key: string, name: string) {
  const userId = `5ec0d000-0000-4000-8000-0000000000${key}`;
  const membershipId = `5ec0d000-0000-4000-8000-0000000002${key}`;
  t.store.users.push({ id: userId, email: `${key}@halka.test`, name, passwordHash: 'plain:x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
  t.store.memberships.push({ userId, membershipId, restaurantId: t.data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'manager', status: 'active', version: 1, createdAt: '2026-10-01T07:40:00.000Z', deactivatedAt: null, deactivatedBy: null });
  return { userId, membershipId, actor: { id: userId, name } as Actor };
}

function addHalkaOwner(t: ReturnType<typeof build>, key: string, name: string) {
  const userId = `5ec0d000-0000-4000-8000-0000000000${key}`;
  const membershipId = `5ec0d000-0000-4000-8000-0000000001${key}`;
  t.store.users.push({ id: userId, email: `${key}@halka.test`, name, passwordHash: 'plain:x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
  t.store.memberships.push({ userId, membershipId, restaurantId: t.data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner', status: 'active', version: 1, createdAt: '2026-10-01T07:30:00.000Z', deactivatedAt: null, deactivatedBy: null });
  return { userId, membershipId };
}

describe('TeamService: who may change whom (AC3)', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const version = async (id: string) => (await t.repos.teamRepository.find(t.data.restaurant.id, id))!.version;
  const state = async (id: string) => (await t.repos.teamRepository.find(t.data.restaurant.id, id))!;

  it('lets an owner list the team, and refuses a sommelier and a waiter (team.manage is owner and manager only)', async () => {
    expect((await t.team.list('halka', t.halka.owner)).map((m) => m.role).sort()).toEqual(['manager', 'owner', 'sommelier', 'waiter']);
    expect((await t.team.list('halka', t.halka.manager))).toHaveLength(4);
    await expect(t.team.list('halka', t.halka.sommelier)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.team.list('halka', t.halka.waiter)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  it('a manager does not change the role of an owner', async () => {
    await expect(t.team.changeRole('halka', t.halka.ownerMembership, 'sommelier', t.halka.manager, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError', code: 'team_hierarchy' });
    expect((await state(t.halka.ownerMembership)).role).toBe('owner');
  });

  it('a manager does not deactivate an owner', async () => {
    await expect(t.team.deactivate('halka', t.halka.ownerMembership, t.halka.manager, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect((await state(t.halka.ownerMembership)).status).toBe('active');
  });

  it('a manager does not reactivate a deactivated owner', async () => {
    const other = addHalkaOwner(t, 'c2', 'Other Owner');
    await t.team.deactivate('halka', other.membershipId, t.halka.owner, 1);
    await expect(t.team.reactivate('halka', other.membershipId, t.halka.manager, 2)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect((await t.repos.teamRepository.find(t.data.restaurant.id, other.membershipId))!.status).toBe('deactivated');
    expect(await t.team.reactivate('halka', other.membershipId, t.halka.owner, 2)).toMatchObject({ status: 'active' });
  });

  it.each(['owner', 'manager'] as Role[])('a manager does not grant the role %s', async (role) => {
    await expect(t.team.changeRole('halka', t.halka.sommelierMembership, role, t.halka.manager, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect((await state(t.halka.sommelierMembership)).role).toBe('sommelier');
  });

  it('a manager may move a sommelier to waiter, and an owner may grant owner and manager', async () => {
    expect(await t.team.changeRole('halka', t.halka.sommelierMembership, 'waiter', t.halka.manager, 1)).toMatchObject({ role: 'waiter', version: 2 });
    expect(await t.team.changeRole('halka', t.halka.sommelierMembership, 'manager', t.halka.owner, 2)).toMatchObject({ role: 'manager', version: 3 });
    expect(await t.team.changeRole('halka', t.halka.waiterMembership, 'owner', t.halka.owner, 1)).toMatchObject({ role: 'owner' });
  });

  it('a manager does not change, deactivate or reactivate a peer manager; the owner may (decided 2026-11-05)', async () => {
    const peer = addHalkaManager(t, 'f1', 'Peer Manager');
    await expect(t.team.changeRole('halka', peer.membershipId, 'sommelier', t.halka.manager, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    await expect(t.team.deactivate('halka', peer.membershipId, t.halka.manager, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect(await state(peer.membershipId)).toMatchObject({ role: 'manager', status: 'active', version: 1 });
    expect(await t.team.deactivate('halka', peer.membershipId, t.halka.owner, 1)).toMatchObject({ status: 'deactivated' });
    await expect(t.team.reactivate('halka', peer.membershipId, t.halka.manager, 2)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect(await t.team.reactivate('halka', peer.membershipId, t.halka.owner, 2)).toMatchObject({ status: 'active' });
    expect(await t.team.changeRole('halka', peer.membershipId, 'sommelier', t.halka.owner, 3)).toMatchObject({ role: 'sommelier' });
  });

  it('nobody changes their own role (an owner too)', async () => {
    await expect(t.team.changeRole('halka', t.halka.ownerMembership, 'manager', t.halka.owner, 1)).rejects.toMatchObject({ name: 'SelfChangeError', code: 'self_change' });
    await expect(t.team.changeRole('halka', t.halka.managerMembership, 'sommelier', t.halka.manager, 1)).rejects.toMatchObject({ name: 'SelfChangeError' });
  });

  it('nobody deactivates themselves (an owner too)', async () => {
    await expect(t.team.deactivate('halka', t.halka.ownerMembership, t.halka.owner, 1)).rejects.toMatchObject({ name: 'SelfChangeError' });
    await expect(t.team.deactivate('halka', t.halka.managerMembership, t.halka.manager, 1)).rejects.toMatchObject({ name: 'SelfChangeError' });
    expect((await state(t.halka.managerMembership)).status).toBe('active');
  });

  it('one owner may demote another while an active owner stays; the last-owner race itself is the repository\'s (AC23, test:db)', async () => {
    const other = addHalkaOwner(t, 'c2', 'Other Owner');
    expect(await t.team.changeRole('halka', other.membershipId, 'manager', t.halka.owner, 1)).toMatchObject({ role: 'manager', version: 2 });
    // the demoted owner is a manager now: it cannot touch the remaining owner (and nobody else can leave the restaurant ownerless)
    await expect(t.team.deactivate('halka', t.halka.ownerMembership, { id: other.userId, name: 'Other Owner' }, 1)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    expect((await state(t.halka.ownerMembership))).toMatchObject({ role: 'owner', status: 'active' });
  });

  it('a request that changes nothing returns the member without a new version or an event', async () => {
    const before = await version(t.halka.sommelierMembership);
    expect(await t.team.changeRole('halka', t.halka.sommelierMembership, 'sommelier', t.halka.owner, before)).toMatchObject({ role: 'sommelier', version: before });
    expect(await t.team.events('halka', t.halka.owner)).toEqual([]);
  });

  it('refuses a role change for a deactivated person, and an unknown person is not found', async () => {
    await t.team.deactivate('halka', t.halka.waiterMembership, t.halka.owner, 1);
    await expect(t.team.changeRole('halka', t.halka.waiterMembership, 'sommelier', t.halka.owner, 2)).rejects.toMatchObject({ name: 'ValidationError', code: 'member_deactivated' });
    await expect(t.team.changeRole('halka', t.idGenerator.uuid(), 'sommelier', t.halka.owner, 1)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(t.team.change('halka', t.halka.waiterMembership, {}, t.halka.owner, 2)).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('records who did what: role_changed, member_deactivated and member_reactivated with the subject, never more than the allowed keys', async () => {
    await t.team.changeRole('halka', t.halka.sommelierMembership, 'waiter', t.halka.manager, 1);
    await t.team.deactivate('halka', t.halka.waiterMembership, t.halka.manager, 1);
    await t.team.reactivate('halka', t.halka.waiterMembership, t.halka.manager, 2);
    const events = await t.team.events('halka', t.halka.owner);
    expect(events.map((e) => e.type)).toEqual(['member_reactivated', 'member_deactivated', 'role_changed']);
    expect(events[2]).toMatchObject({ actorUserId: t.halka.manager.id, subjectUserId: t.halka.sommelier.id, restaurantId: t.data.restaurant.id, meta: { membership_id: t.halka.sommelierMembership, from: 'sommelier', to: 'waiter' } });
    expect(Object.keys(events[1].meta).every((k) => ['membership_id', 'from', 'to', 'role'].includes(k))).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/@|password|token|pin/i);
  });

  it('the audit list needs audit.view', async () => {
    await expect(t.team.events('halka', t.halka.sommelier)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.team.events('halka', t.halka.waiter)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  it('a person of another restaurant has no say here: Forbidden for the list, the change and the events (AC6)', async () => {
    const foreignOwner: Actor = { id: t.second.owner1.userId, name: 'First Owner' };
    await expect(t.team.list('halka', foreignOwner)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.team.deactivate('halka', t.halka.waiterMembership, foreignOwner, 1)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.team.events('halka', foreignOwner)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.team.list('no-such-restaurant', foreignOwner)).rejects.toMatchObject({ name: 'NotFoundError' });
    expect((await state(t.halka.waiterMembership)).status).toBe('active');
  });

  it('a deactivated manager cannot manage the team any more, even with a service call that skips the session', async () => {
    await t.team.deactivate('halka', t.halka.managerMembership, t.halka.owner, 1);
    await expect(t.team.list('halka', t.halka.manager)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  it('a stale version is a version_conflict, a fresh one passes', async () => {
    await t.team.changeRole('halka', t.halka.sommelierMembership, 'waiter', t.halka.owner, 1);
    await expect(t.team.changeRole('halka', t.halka.sommelierMembership, 'sommelier', t.halka.owner, 1)).rejects.toMatchObject({ name: 'VersionConflictError', code: 'version_conflict' });
    expect(await t.team.changeRole('halka', t.halka.sommelierMembership, 'sommelier', t.halka.owner, 2)).toMatchObject({ version: 3 });
  });
});

describe('deactivation cuts access on the next request (AC2)', () => {
  it('authenticate returns a principal without the restaurant after deactivation and with it again after reactivation, on the same session', async () => {
    const t = build();
    const { token } = await t.auth.login('tomasz@halka.pl', DEMO_PASSWORD);
    expect((await t.auth.authenticate(token))!.memberships.map((m) => m.restaurantSlug)).toEqual(['halka']);
    await t.team.deactivate('halka', t.halka.managerMembership, t.halka.owner, 1);
    expect((await t.auth.authenticate(token))!.memberships).toEqual([]);
    await t.team.reactivate('halka', t.halka.managerMembership, t.halka.owner, 2);
    expect((await t.auth.authenticate(token))!.memberships.map((m) => m.role)).toEqual(['manager']);
  });

  it('a person with only a deactivated membership cannot sign in to the dashboard', async () => {
    const t = build();
    await t.team.deactivate('halka', t.halka.managerMembership, t.halka.owner, 1);
    await expect(t.auth.login('tomasz@halka.pl', DEMO_PASSWORD)).rejects.toMatchObject({ name: 'NoPanelAccessError' });
  });
});
