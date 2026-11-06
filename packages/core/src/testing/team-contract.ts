import { MAX_AUTH_EVENTS } from '../auth/audit-rules';
import { AUTH_EVENT_META_KEYS, type AuthEvent, type Role } from '../auth/types';
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
    type Set = { role?: Role; status?: 'active' | 'deactivated' };
    /**
     * A change of `target` (of the second restaurant unless `restaurantId` says otherwise) with the events the service
     * would write. The actor is the first owner, or the second owner when the target is the first.
     */
    const change = (target: { userId: string; role: Role }, set: Set, over: { expectedVersion?: number; restaurantId?: string; actorUserId?: string; events?: AuthEvent[]; at?: string } = {}) => {
      const restaurantId = over.restaurantId ?? second.restaurantId;
      const actorUserId = over.actorUserId ?? (target.userId === second.owner1.userId ? second.owner2.userId : second.owner1.userId);
      const at = over.at ?? NOW;
      const events = over.events ?? [
        ...(set.role && set.role !== target.role ? [event(restaurantId, { actorUserId, subjectUserId: target.userId, type: 'role_changed', meta: { from: target.role, to: set.role }, at })] : []),
        ...(set.status ? [event(restaurantId, { actorUserId, subjectUserId: target.userId, type: set.status === 'deactivated' ? 'member_deactivated' : 'member_reactivated', meta: {}, at })] : []),
        ...(set.role && set.role === target.role && !set.status ? [event(restaurantId, { actorUserId, subjectUserId: target.userId, type: 'role_changed', meta: {}, at })] : [])
      ];
      return { expectedVersion: over.expectedVersion ?? 1, set, actorUserId, at, events };
    };
    const apply = (m: SecondTeamMember, set: Set, over: Parameters<typeof change>[2] = {}) => team.applyChange(second.restaurantId, m.membershipId, change(m, set, over));
    const activeOwners = async () => (await team.list(second.restaurantId)).filter((m) => m.role === 'owner' && m.status === 'active').length;
    const events = async () => (await audit.list(second.restaurantId)).length;

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
      await t.expect(team.applyChange(second.restaurantId, 'abc', change(second.sommelier, { role: 'waiter' }))).rejects.toMatchObject({ name: 'NotFoundError', code: 'not_found' });
      t.expect(await audit.list('abc')).toEqual([]);
    });

    t.it('changes the role with the current version and raises the version (AC4)', async () => {
      const changed = await apply(second.sommelier, { role: 'waiter' });
      t.expect(changed).toMatchObject({ membershipId: second.sommelier.membershipId, role: 'waiter', status: 'active', version: 2 });
      t.expect((await team.find(second.restaurantId, second.sommelier.membershipId))!.version).toBe(2);
      const again = await apply({ ...second.sommelier, role: 'waiter' }, { role: 'sommelier' }, { expectedVersion: 2 });
      t.expect(again).toMatchObject({ role: 'sommelier', version: 3 });
    });

    t.it('refuses a stale expected version with version_conflict and changes and records nothing (AC4)', async () => {
      await apply(second.sommelier, { role: 'waiter' });
      const before = await events();
      await t.expect(apply({ ...second.sommelier, role: 'waiter' }, { role: 'manager' }, { expectedVersion: 1 })).rejects.toMatchObject({ name: 'VersionConflictError', code: 'version_conflict' });
      t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'waiter', version: 2 });
      t.expect(await events()).toBe(before);
    });

    t.it('writes every audit event of the change together with it, as written (AC5)', async () => {
      const c = change(second.sommelier, { role: 'waiter', status: 'deactivated' }, { at: at(5) });
      t.expect(c.events.map((e) => e.type)).toEqual(['role_changed', 'member_deactivated']);
      await team.applyChange(second.restaurantId, second.sommelier.membershipId, c);
      t.expect((await audit.list(second.restaurantId)).map((e) => e.id).sort()).toEqual(c.events.map((e) => e.id).sort());
      t.expect((await audit.list(second.restaurantId, { type: 'role_changed' }))[0]).toEqual(c.events[0]);
    });

    t.it('writes no event when the change fails: a duplicate event id rolls the whole change back (AC5)', async () => {
      const first = change(second.sommelier, { role: 'waiter' });
      await team.applyChange(second.restaurantId, second.sommelier.membershipId, first);
      await t.expect(team.applyChange(second.restaurantId, second.sommelier.membershipId, { ...change({ ...second.sommelier, role: 'waiter' }, { role: 'manager' }, { expectedVersion: 2 }), events: first.events })).rejects.toBeInstanceOf(Error);
      t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'waiter', version: 2 });
      t.expect(await events()).toBe(1);
    });

    t.it('deactivates and reactivates: stamps who and when, and the account loses and regains access to the restaurant at once (AC2)', async () => {
      t.expect((await auth.membershipsOf(second.manager.userId)).map((m) => m.restaurantId)).toEqual([second.restaurantId]);
      const off = await apply(second.manager, { status: 'deactivated' });
      t.expect(off).toMatchObject({ status: 'deactivated', version: 2, deactivatedAt: NOW, deactivatedBy: second.owner1.userId });
      t.expect(await auth.membershipsOf(second.manager.userId)).toEqual([]);
      t.expect((await team.list(second.restaurantId)).find((m) => m.userId === second.manager.userId)).toMatchObject({ status: 'deactivated' });
      const on = await apply(second.manager, { status: 'active' }, { expectedVersion: 2 });
      t.expect(on).toMatchObject({ status: 'active', version: 3, deactivatedAt: null, deactivatedBy: null });
      t.expect((await auth.membershipsOf(second.manager.userId)).map((m) => m.role)).toEqual(['manager']);
    });

    t.it('keeps at least one active owner: the last one cannot be demoted or deactivated, even by an actor decided on stale rows (AC23)', async () => {
      await apply(second.owner2, { role: 'manager' });
      t.expect(await activeOwners()).toBe(1);
      // owner2 is a manager now: a request decided before that (the race) must not take the last owner away
      await t.expect(apply(second.owner1, { role: 'manager' })).rejects.toMatchObject({ name: 'LastOwnerError', code: 'last_owner' });
      await t.expect(apply(second.owner1, { status: 'deactivated' })).rejects.toMatchObject({ code: 'last_owner' });
      t.expect(await team.find(second.restaurantId, second.owner1.membershipId)).toMatchObject({ role: 'owner', status: 'active', version: 1 });
      t.expect(await apply(second.owner1, { role: 'owner' })).toMatchObject({ role: 'owner' });
    });

    t.it('a deactivated owner does not count as an owner, and reactivating one makes a demotion possible again (AC23)', async () => {
      await apply(second.owner2, { status: 'deactivated' });
      await t.expect(apply(second.owner1, { role: 'sommelier' })).rejects.toMatchObject({ code: 'last_owner' });
      await apply({ ...second.owner2 }, { status: 'active' }, { expectedVersion: 2, actorUserId: second.owner1.userId });
      t.expect(await apply(second.owner1, { role: 'sommelier' })).toMatchObject({ role: 'sommelier' });
    });

    t.it('re-checks the actor against the stored rows when it applies: a deactivated actor, a role without team.manage, a manager and an owner, oneself, another restaurant (TOCTOU)', async () => {
      const refused = async (run: Promise<unknown>, name: string) => { await t.expect(run).rejects.toMatchObject({ name }); };
      // a role without team.manage
      await refused(apply(second.manager, { role: 'waiter' }, { actorUserId: second.sommelier.userId }), 'ForbiddenError');
      // a manager changing an owner, and granting manager
      await refused(apply(second.owner1, { role: 'sommelier' }, { actorUserId: second.manager.userId }), 'TeamHierarchyError');
      await refused(apply(second.sommelier, { role: 'manager' }, { actorUserId: second.manager.userId }), 'TeamHierarchyError');
      // oneself
      await refused(apply(second.manager, { status: 'deactivated' }, { actorUserId: second.manager.userId }), 'SelfChangeError');
      // a person of another restaurant (Halka's manager) acting here
      await refused(apply(second.sommelier, { role: 'waiter' }, { actorUserId: tomasz().id }), 'ForbiddenError');
      t.expect(await events()).toBe(0);
      // the actor was active when the service looked, and is deactivated now
      await apply(second.owner2, { status: 'deactivated' });
      t.expect(await events()).toBe(1);
      await refused(apply(second.sommelier, { role: 'waiter' }, { actorUserId: second.owner2.userId }), 'ForbiddenError');
      t.expect(await events()).toBe(1);
      t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'sommelier', status: 'active', version: 1 });
      t.expect(await team.find(second.restaurantId, second.manager.membershipId)).toMatchObject({ status: 'active', version: 1 });
    });

    t.it('never reads or changes another restaurant’s team, and writes no event for it (AC6)', async () => {
      await t.expect(team.applyChange(ds.restaurant.id, second.manager.membershipId, change(second.manager, { role: 'waiter' }, { restaurantId: ds.restaurant.id }))).rejects.toMatchObject({ name: 'NotFoundError' });
      await t.expect(team.applyChange(second.restaurantId, tomasz().membershipId, change({ userId: tomasz().id, role: 'manager' }, { status: 'deactivated' }))).rejects.toMatchObject({ name: 'NotFoundError' });
      t.expect(await team.find(second.restaurantId, second.manager.membershipId)).toMatchObject({ role: 'manager', status: 'active', version: 1 });
      t.expect(await team.find(ds.restaurant.id, tomasz().membershipId)).toMatchObject({ role: 'manager', status: 'active', version: 1 });
      t.expect(await audit.list(ds.restaurant.id)).toEqual([]);
      t.expect(await audit.list(second.restaurantId)).toEqual([]);
    });

    t.it('refuses events that do not belong to the change: wrong restaurant, wrong actor, wrong subject, none, unknown or secret-bearing meta, and changes nothing', async () => {
      const ok = change(second.sommelier, { role: 'waiter' });
      const [good] = ok.events;
      const bad = async (events: AuthEvent[], code: string) => {
        await t.expect(team.applyChange(second.restaurantId, second.sommelier.membershipId, { ...ok, events })).rejects.toMatchObject({ code });
        t.expect(await team.find(second.restaurantId, second.sommelier.membershipId)).toMatchObject({ role: 'sommelier', version: 1 });
        t.expect(await events_()).toBe(0);
      };
      const events_ = events;
      await bad([{ ...good, restaurantId: ds.restaurant.id }], 'event_restaurant_mismatch');
      await bad([{ ...good, restaurantId: null }], 'event_restaurant_mismatch');
      await bad([{ ...good, actorUserId: second.owner2.userId }], 'event_actor_mismatch');
      await bad([{ ...good, subjectUserId: second.manager.userId }], 'event_subject_mismatch');
      await bad([], 'invalid_event');
      await bad([good, { ...good }], 'duplicate_event');
      await bad([{ ...good, meta: { password: 'x' } as unknown as AuthEvent['meta'] }], 'invalid_event_meta');
      await bad([{ ...good, meta: { from: 'stranger@example.com' } }], 'invalid_event_meta');
      await bad([{ ...good, meta: { to: 'x'.repeat(200) } }], 'invalid_event_meta');
      await bad([{ ...good, type: 'nonsense' as AuthEvent['type'] }], 'invalid_event');
    });

    t.it('stores only allowed meta, and reads back exactly what was stored', async () => {
      const e = event(second.restaurantId, { actorUserId: second.owner1.userId, subjectUserId: second.manager.userId, meta: { membership_id: second.manager.membershipId, from: 'manager', to: 'waiter', role: 'waiter', invitation_id: second.manager.membershipId } });
      await audit.record(second.restaurantId, e);
      const stored = (await audit.list(second.restaurantId))[0];
      t.expect(stored).toEqual(e);
      t.expect(Object.keys(stored.meta).sort()).toEqual([...AUTH_EVENT_META_KEYS].sort());
      // an event with a key outside the list, or a secret-looking value, is never stored
      await t.expect(audit.record(second.restaurantId, event(second.restaurantId, { meta: { token: 'abc' } as unknown as AuthEvent['meta'] }))).rejects.toMatchObject({ code: 'invalid_event_meta' });
      await t.expect(audit.record(second.restaurantId, event(second.restaurantId, { meta: { to: 'someone@example.com' } }))).rejects.toMatchObject({ code: 'invalid_event_meta' });
      t.expect((await audit.list(second.restaurantId)).length).toBe(1);
    });

    t.it('record refuses an event whose restaurant is not the one given', async () => {
      await t.expect(audit.record(ds.restaurant.id, event(second.restaurantId))).rejects.toMatchObject({ code: 'event_restaurant_mismatch' });
      await t.expect(audit.record(null, event(second.restaurantId))).rejects.toMatchObject({ code: 'event_restaurant_mismatch' });
      await t.expect(audit.record(second.restaurantId, event(null))).rejects.toMatchObject({ code: 'event_restaurant_mismatch' });
      t.expect(await audit.list(second.restaurantId)).toEqual([]);
      t.expect(await audit.list(ds.restaurant.id)).toEqual([]);
    });

    t.it('lists events of one restaurant only, newest first, filtered by type and person', async () => {
      const mk = (restaurantId: string | null, type: AuthEvent['type'], ms: number, subject: string | null) => event(restaurantId, { type, at: at(ms), subjectUserId: subject, actorUserId: second.owner1.userId });
      const a = mk(second.restaurantId, 'role_changed', 10, second.manager.userId);
      const b = mk(second.restaurantId, 'member_deactivated', 20, second.sommelier.userId);
      const c = mk(second.restaurantId, 'role_changed', 30, second.sommelier.userId);
      const foreign = mk(ds.restaurant.id, 'role_changed', 40, tomasz().id);
      const noRestaurant = mk(null, 'login_succeeded', 50, second.owner1.userId);
      for (const e of [a, b, c, foreign, noRestaurant]) await audit.record(e.restaurantId, e);
      t.expect((await audit.list(second.restaurantId)).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
      t.expect((await audit.list(ds.restaurant.id)).map((e) => e.id)).toEqual([foreign.id]);
      t.expect((await audit.list(second.restaurantId, { type: 'role_changed' })).map((e) => e.id)).toEqual([c.id, a.id]);
      t.expect((await audit.list(second.restaurantId, { subjectUserId: second.sommelier.userId })).map((e) => e.id)).toEqual([c.id, b.id]);
      t.expect((await audit.list(second.restaurantId, { limit: 1 })).map((e) => e.id)).toEqual([c.id]);
    });

    t.it('pages by (time, id): equal timestamps are neither skipped nor repeated, and the page size is capped', async () => {
      const same = [1, 2, 3, 4, 5].map(() => event(second.restaurantId, { at: at(100), actorUserId: second.owner1.userId }));
      const older = event(second.restaurantId, { at: at(50) });
      for (const e of [...same, older]) await audit.record(second.restaurantId, e);
      const seen: string[] = [];
      let before: { at: string; id: string } | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const page = await audit.list(second.restaurantId, { limit: 2, before });
        if (page.length === 0) break;
        seen.push(...page.map((e) => e.id));
        before = { at: page[page.length - 1].at, id: page[page.length - 1].id };
      }
      t.expect(seen).toEqual([...same.map((e) => e.id).sort().reverse(), older.id]);
      t.expect(new Set(seen).size).toBe(6);
      // a zero or negative limit still returns one row, and a huge limit is capped
      t.expect((await audit.list(second.restaurantId, { limit: 0 })).length).toBe(1);
      t.expect((await audit.list(second.restaurantId, { limit: -3 })).length).toBe(1);
      for (let i = 0; i < MAX_AUTH_EVENTS; i++) await audit.record(second.restaurantId, event(second.restaurantId, { at: at(200 + i) }));
      t.expect((await audit.list(second.restaurantId, { limit: 1_000_000 })).length).toBe(MAX_AUTH_EVENTS);
    });

    t.it('refuses to record the same event twice', async () => {
      const e = event(second.restaurantId);
      await audit.record(second.restaurantId, e);
      await t.expect(audit.record(second.restaurantId, e)).rejects.toBeInstanceOf(Error);
      t.expect((await audit.list(second.restaurantId)).length).toBe(1);
    });
  });
}

/** The second restaurant as the in-memory store keeps it (the PostgreSQL setup inserts the same rows). */
export function addSecondRestaurant(store: { users: AuthUserLike[]; memberships: StoredMembershipLike[]; restaurants: RestaurantLike[] }): SecondRestaurant {
  // the restaurant itself (the invitation repository looks it up): a copy of the first one under the second one's identity
  if (!store.restaurants.some((r) => r.id === SECOND_RESTAURANT.id)) store.restaurants.push({ ...store.restaurants[0], id: SECOND_RESTAURANT.id, slug: SECOND_RESTAURANT.slug, name: SECOND_RESTAURANT.name });
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
type RestaurantLike = import('../domain/types').Restaurant;
type AuthUserLike = import('../auth/types').AuthUser;
type StoredMembershipLike = import('../memory/memory-repositories').StoredMembership;
