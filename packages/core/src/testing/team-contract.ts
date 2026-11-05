import type { AuthEvent, Role } from '../auth/types';
import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { AuthRepository } from '../ports/auth';
import type { AuthAuditRepository, TeamRepository } from '../ports/team';

/**
 * Behaviour every TeamRepository and AuthAuditRepository must have (memory and PostgreSQL), spec E12 F1: the team of
 * one restaurant and nobody else's, the version check, the audit event written with the change or not at all,
 * deactivation cutting access at once, the last active owner kept.
 *
 * A second restaurant with two owners, a manager and a sommelier is created by the backend (`second`): the demo
 * data has one restaurant and no owner.
 */

export interface SecondTeamMember { userId: string; membershipId: string; role: Role; email: string; name: string }
export interface SecondRestaurant { restaurantId: string; owner1: SecondTeamMember; owner2: SecondTeamMember; manager: SecondTeamMember; sommelier: SecondTeamMember }

/** The second restaurant's fixed ids and people (the backends insert them). */
export const SECOND_RESTAURANT = {
  id: '5ec0d000-0000-4000-8000-000000000001', slug: 'second-table', name: 'Second Table',
  members: [
    { userId: '5ec0d000-0000-4000-8000-0000000000a1', membershipId: '5ec0d000-0000-4000-8000-0000000000b1', role: 'owner', email: 'owner1@second.test', name: 'First Owner' },
    { userId: '5ec0d000-0000-4000-8000-0000000000a2', membershipId: '5ec0d000-0000-4000-8000-0000000000b2', role: 'owner', email: 'owner2@second.test', name: 'Second Owner' },
    { userId: '5ec0d000-0000-4000-8000-0000000000a3', membershipId: '5ec0d000-0000-4000-8000-0000000000b3', role: 'manager', email: 'manager@second.test', name: 'The Manager' },
    { userId: '5ec0d000-0000-4000-8000-0000000000a4', membershipId: '5ec0d000-0000-4000-8000-0000000000b4', role: 'sommelier', email: 'sommelier@second.test', name: 'The Sommelier' }
  ] satisfies SecondTeamMember[]
};

const NOW = '2026-11-05T10:00:00.000Z';
let n = 0;
const eventId = () => `5ec0d000-0000-4000-8000-${String(900_000_000_000 + ++n)}`;
const event = (restaurantId: string | null, over: Partial<AuthEvent> = {}): AuthEvent => ({
  id: eventId(), restaurantId, actorUserId: null, subjectUserId: null, type: 'role_changed', meta: {}, at: NOW, ...over
});
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

export function teamContract(
  name: string,
  setup: () => Promise<{ team: TeamRepository; audit: AuthAuditRepository; auth: AuthRepository; dataset: DemoDataset; second: SecondRestaurant }>,
  t: ContractRunner
): void {
  t.describe(`team contract: ${name}`, () => {
    let team: TeamRepository;
    let audit: AuthAuditRepository;
    let auth: AuthRepository;
    let ds: DemoDataset;
    let second: SecondRestaurant;
    t.beforeEach(async () => { ({ team, audit, auth, dataset: ds, second } = await setup()); });
    const tomasz = () => ds.users.find((u) => u.key === 'tomasz')!;
    const marta = () => ds.users.find((u) => u.key === 'marta')!;
    const change = (over: { expectedVersion?: number; set: { role?: Role; status?: 'active' | 'deactivated' }; restaurantId: string; actorUserId?: string; ev?: Partial<AuthEvent> }) => ({
      expectedVersion: over.expectedVersion ?? 1, set: over.set, actorUserId: over.actorUserId ?? second.owner1.userId, at: NOW,
      event: event(over.restaurantId, { actorUserId: over.actorUserId ?? second.owner1.userId, ...over.ev })
    });
    const ownersAdmitted = async () => (await team.list(second.restaurantId)).filter((m) => m.role === 'owner' && m.status === 'active');

    t.it('lists the team of one restaurant, oldest first, with status and version and nobody from another restaurant', async () => {
      const halka = await team.list(ds.restaurant.id);
      t.expect(halka.map((m) => m.userId).sort()).toEqual(ds.users.map((u) => u.id).sort());
      t.expect(halka.find((m) => m.userId === marta().id)).toMatchObject({ membershipId: marta().membershipId, name: 'Marta Wierzbicka', email: 'marta@halka.pl', role: 'sommelier', status: 'active', version: 1, deactivatedAt: null, deactivatedBy: null });
      const other = await team.list(second.restaurantId);
      t.expect(other.map((m) => m.userId).sort()).toEqual(SECOND_RESTAURANT.members.map((m) => m.userId).sort());
      t.expect(await team.list('5ec0d000-0000-4000-8000-0000000000ff')).toEqual([]);
    });

    t.it('finds a member by membership or by user only inside the restaurant asked for (isolation)', async () => {
      t.expect((await team.find(ds.restaurant.id, tomasz().membershipId))?.userId).toBe(tomasz().id);
      t.expect((await team.findByUser(ds.restaurant.id, tomasz().id))?.membershipId).toBe(tomasz().membershipId);
      t.expect(await team.find(second.restaurantId, tomasz().membershipId)).toBeNull();
      t.expect(await team.findByUser(second.restaurantId, tomasz().id)).toBeNull();
      t.expect(await team.find(ds.restaurant.id, second.manager.membershipId)).toBeNull();
    });

    t.it('treats an id that is not a UUID as unknown (lookup returns null, a change is "not found")', async () => {
      t.expect(await team.find(ds.restaurant.id, 'abc')).toBeNull();
      t.expect(await team.findByUser(ds.restaurant.id, 'abc')).toBeNull();
      t.expect(await team.list('abc')).toEqual([]);
      await t.expect(team.applyChange(ds.restaurant.id, 'abc', change({ set: { role: 'waiter' }, restaurantId: ds.restaurant.id }))).rejects.toMatchObject({ name: 'NotFoundError', code: 'not_found' });
      t.expect(await audit.list('abc')).toEqual([]);
    });

    t.it('changes the role with the current version and raises the version (AC4)', async () => {
      const changed = await team.applyChange(second.restaurantId, second.sommelier.membershipId, change({ set: { role: 'waiter' }, restaurantId: second.restaurantId }));
      t.expect(changed).toMatchObject({ membershipId: second.sommelier.membershipId, role: 'waiter', status: 'active', version: 2 });
      t.expect((await team.find(second.restaurantId, second.sommelier.membershipId))!.version).toBe(2);
      // the next change must carry the new version
      const again = await team.applyChange(second.restaurantId, second.sommelier.membershipId, change({ expectedVersion: 2, set: { role: 'sommelier' }, restaurantId: second.restaurantId }));
      t.expect(again).toMatchObject({ role: 'sommelier', version: 3 });
    });

    t.it('refuses a stale expected version with version_conflict and changes and records nothing (AC4)', async () => {
      await team.applyChange(second.restaurantId, second.sommelier.membershipId, change({ set: { role: 'waiter' }, restaurantId: second.restaurantId }));
      const events = (await audit.list(second.restaurantId)).length;
      await t.expect(team.applyChange(second.restaurantId, second.sommelier.membershipId, change({ expectedVersion: 1, set: { role: 'manager' }, restaurantId: second.restaurantId }))).rejects.toMatchObject({ name: 'VersionConflictError', code: 'version_conflict' });
      t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'waiter', version: 2 });
      t.expect((await audit.list(second.restaurantId)).length).toBe(events);
    });

    t.it('writes the audit event together with the change (AC5)', async () => {
      const ev = event(second.restaurantId, { actorUserId: second.owner1.userId, subjectUserId: second.sommelier.userId, type: 'member_deactivated', meta: { membership_id: second.sommelier.membershipId, role: 'sommelier' }, at: at(5) });
      await team.applyChange(second.restaurantId, second.sommelier.membershipId, { expectedVersion: 1, set: { status: 'deactivated' }, actorUserId: second.owner1.userId, at: at(5), event: ev });
      t.expect(await audit.list(second.restaurantId)).toEqual([ev]);
    });

    t.it('writes no event when the change fails: a duplicate event id rolls the whole change back (AC5)', async () => {
      const first = change({ set: { role: 'waiter' }, restaurantId: second.restaurantId });
      await team.applyChange(second.restaurantId, second.sommelier.membershipId, first);
      // the same event id again, with a valid new version: the event cannot be written, so the role must not change
      await t.expect(team.applyChange(second.restaurantId, second.sommelier.membershipId, { ...change({ expectedVersion: 2, set: { role: 'manager' }, restaurantId: second.restaurantId }), event: first.event })).rejects.toBeInstanceOf(Error);
      t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'waiter', version: 2 });
      t.expect((await audit.list(second.restaurantId)).length).toBe(1);
    });

    t.it('deactivates and reactivates: stamps who and when, and the account loses and regains access to the restaurant at once (AC2)', async () => {
      t.expect((await auth.membershipsOf(second.manager.userId)).map((m) => m.restaurantId)).toEqual([second.restaurantId]);
      const off = await team.applyChange(second.restaurantId, second.manager.membershipId, change({ set: { status: 'deactivated' }, restaurantId: second.restaurantId }));
      t.expect(off).toMatchObject({ status: 'deactivated', version: 2, deactivatedAt: NOW, deactivatedBy: second.owner1.userId });
      t.expect(await auth.membershipsOf(second.manager.userId)).toEqual([]);
      t.expect((await team.list(second.restaurantId)).find((m) => m.userId === second.manager.userId)).toMatchObject({ status: 'deactivated' });
      const on = await team.applyChange(second.restaurantId, second.manager.membershipId, change({ expectedVersion: 2, set: { status: 'active' }, restaurantId: second.restaurantId }));
      t.expect(on).toMatchObject({ status: 'active', version: 3, deactivatedAt: null, deactivatedBy: null });
      t.expect((await auth.membershipsOf(second.manager.userId)).map((m) => m.role)).toEqual(['manager']);
    });

    t.it('keeps at least one active owner: demoting or deactivating the last one is refused with last_owner (AC23)', async () => {
      await team.applyChange(second.restaurantId, second.owner2.membershipId, change({ set: { role: 'manager' }, restaurantId: second.restaurantId }));
      t.expect((await ownersAdmitted()).length).toBe(1);
      await t.expect(team.applyChange(second.restaurantId, second.owner1.membershipId, change({ set: { role: 'manager' }, restaurantId: second.restaurantId }))).rejects.toMatchObject({ name: 'LastOwnerError', code: 'last_owner' });
      await t.expect(team.applyChange(second.restaurantId, second.owner1.membershipId, change({ set: { status: 'deactivated' }, restaurantId: second.restaurantId }))).rejects.toMatchObject({ code: 'last_owner' });
      t.expect(await team.find(second.restaurantId, second.owner1.membershipId)).toMatchObject({ role: 'owner', status: 'active', version: 1 });
      // a change that keeps the owner owner is not a "last owner" matter
      t.expect(await team.applyChange(second.restaurantId, second.owner1.membershipId, change({ set: { role: 'owner' }, restaurantId: second.restaurantId }))).toMatchObject({ role: 'owner' });
    });

    t.it('lets two owners go one after the other only until one is left, and a deactivated owner does not count (AC23)', async () => {
      await team.applyChange(second.restaurantId, second.owner2.membershipId, change({ set: { status: 'deactivated' }, restaurantId: second.restaurantId }));
      await t.expect(team.applyChange(second.restaurantId, second.owner1.membershipId, change({ set: { role: 'sommelier' }, restaurantId: second.restaurantId }))).rejects.toMatchObject({ code: 'last_owner' });
      // reactivating the other owner makes the demotion possible again
      await team.applyChange(second.restaurantId, second.owner2.membershipId, change({ expectedVersion: 2, set: { status: 'active' }, restaurantId: second.restaurantId }));
      t.expect(await team.applyChange(second.restaurantId, second.owner1.membershipId, change({ set: { role: 'sommelier' }, restaurantId: second.restaurantId }))).toMatchObject({ role: 'sommelier' });
    });

    t.it('never reads or changes another restaurant’s team, and writes no event for it (AC6)', async () => {
      // a membership of the second restaurant addressed through Halka (and the other way round) is "not found"
      await t.expect(team.applyChange(ds.restaurant.id, second.manager.membershipId, change({ set: { role: 'waiter' }, restaurantId: ds.restaurant.id }))).rejects.toMatchObject({ name: 'NotFoundError' });
      await t.expect(team.applyChange(second.restaurantId, tomasz().membershipId, change({ set: { status: 'deactivated' }, restaurantId: second.restaurantId }))).rejects.toMatchObject({ name: 'NotFoundError' });
      t.expect(await team.find(second.restaurantId, second.manager.membershipId)).toMatchObject({ role: 'manager', status: 'active', version: 1 });
      t.expect(await team.find(ds.restaurant.id, tomasz().membershipId)).toMatchObject({ role: 'manager', status: 'active', version: 1 });
      t.expect(await audit.list(ds.restaurant.id)).toEqual([]);
      t.expect(await audit.list(second.restaurantId)).toEqual([]);
    });

    t.it('lists events of one restaurant only, newest first, filtered by type, person and time, and pages', async () => {
      const mk = (restaurantId: string | null, type: AuthEvent['type'], ms: number, subject: string | null) => event(restaurantId, { type, at: at(ms), subjectUserId: subject, actorUserId: second.owner1.userId });
      const a = mk(second.restaurantId, 'role_changed', 10, second.manager.userId);
      const b = mk(second.restaurantId, 'member_deactivated', 20, second.sommelier.userId);
      const c = mk(second.restaurantId, 'role_changed', 30, second.sommelier.userId);
      const foreign = mk(ds.restaurant.id, 'role_changed', 40, tomasz().id);
      const noRestaurant = mk(null, 'login_succeeded', 50, second.owner1.userId);
      for (const e of [a, b, c, foreign, noRestaurant]) await audit.record(e);
      t.expect((await audit.list(second.restaurantId)).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
      t.expect((await audit.list(ds.restaurant.id)).map((e) => e.id)).toEqual([foreign.id]);
      t.expect((await audit.list(second.restaurantId, { type: 'role_changed' })).map((e) => e.id)).toEqual([c.id, a.id]);
      t.expect((await audit.list(second.restaurantId, { subjectUserId: second.sommelier.userId })).map((e) => e.id)).toEqual([c.id, b.id]);
      t.expect((await audit.list(second.restaurantId, { before: at(30) })).map((e) => e.id)).toEqual([b.id, a.id]);
      t.expect((await audit.list(second.restaurantId, { limit: 1 })).map((e) => e.id)).toEqual([c.id]);
      // a stored event reads back as written, including its meta
      t.expect((await audit.list(second.restaurantId, { limit: 1 }))[0]).toEqual(c);
    });

    t.it('refuses to record the same event twice', async () => {
      const e = event(second.restaurantId);
      await audit.record(e);
      await t.expect(audit.record(e)).rejects.toBeInstanceOf(Error);
      t.expect((await audit.list(second.restaurantId)).length).toBe(1);
    });
  });
}

/** The second restaurant as the in-memory store keeps it (the PostgreSQL setup inserts the same rows). */
export function addSecondRestaurant(store: { users: AuthUserLike[]; memberships: StoredMembershipLike[] }): SecondRestaurant {
  const [owner1, owner2, manager, sommelier] = SECOND_RESTAURANT.members;
  for (const m of SECOND_RESTAURANT.members) {
    store.users.push({ id: m.userId, email: m.email, name: m.name, passwordHash: 'plain:unused', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    store.memberships.push({
      userId: m.userId, membershipId: m.membershipId, restaurantId: SECOND_RESTAURANT.id, restaurantSlug: SECOND_RESTAURANT.slug, restaurantName: SECOND_RESTAURANT.name,
      role: m.role, status: 'active', version: 1, createdAt: '2026-10-02T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null
    });
  }
  return { restaurantId: SECOND_RESTAURANT.id, owner1, owner2, manager, sommelier };
}
type AuthUserLike = import('../auth/types').AuthUser;
type StoredMembershipLike = import('../memory/memory-repositories').StoredMembership;
