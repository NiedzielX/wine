import type { AuthEvent, Role } from '../auth/types';
import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { AuthRepository } from '../ports/auth';
import type { InvitationPreview, InvitationRepository, NewInvitation } from '../ports/invitations';
import type { AuthAuditRepository, TeamRepository } from '../ports/team';
import type { SecondRestaurant } from './team-contract';

/**
 * Behaviour every InvitationRepository must have (memory and PostgreSQL), spec E12 F2: invitations of one restaurant and
 * nobody else's, single use, the link dying with a revocation, an expiry or its inviter's access, one invitation replacing
 * the one before, the account and membership created together with the event or not at all.
 *
 * The second restaurant of `teamContract` supplies the people (two owners, a manager, a sommelier); the demo restaurant
 * (Halka) is "another restaurant". Ids are fixed in this file; token hashes are 64-character strings built from a counter.
 */

const NOW = '2026-11-06T10:00:00.000Z';
const HOURS = 3_600_000;
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
let n = 0;
const next = () => ++n;
const uuid = (series: number) => `5ec0d000-0000-4000-8000-${String(series * 1_000_000_000 + next()).padStart(12, '0')}`;
const tokenHash = () => next().toString(16).padStart(64, 'f');

export function invitationContract(
  name: string,
  setup: () => Promise<{ invites: InvitationRepository; team: TeamRepository; audit: AuthAuditRepository; auth: AuthRepository; dataset: DemoDataset; second: SecondRestaurant }>,
  t: ContractRunner
): void {
  t.describe(`invitation contract: ${name}`, () => {
    let invites: InvitationRepository;
    let team: TeamRepository;
    let audit: AuthAuditRepository;
    let auth: AuthRepository;
    let ds: DemoDataset;
    let second: SecondRestaurant;
    t.beforeEach(async () => { ({ invites, team, audit, auth, dataset: ds, second } = await setup()); });

    type Person = { userId: string };
    /** A pending invitation made by `by` (the first owner by default) for `email` as `role`. */
    const invite = async (over: Partial<NewInvitation> & { by?: Person; restaurantId?: string; platform?: boolean } = {}) => {
      const restaurantId = over.restaurantId ?? second.restaurantId;
      const createdBy = over.createdBy ?? (over.by ?? second.owner1).userId;
      const invitation: NewInvitation = {
        id: uuid(7), email: `new${n}@invited.test`, role: 'sommelier', tokenHash: tokenHash(), createdBy, createdAt: NOW, expiresAt: at(72 * HOURS), ...over
      };
      const event: AuthEvent = { id: uuid(8), restaurantId, actorUserId: createdBy, subjectUserId: null, type: 'invite_created', meta: { role: invitation.role, invitation_id: invitation.id }, at: NOW };
      const made = await invites.create(restaurantId, { invitation, platform: over.platform ?? false, event });
      return { invitation, made, event };
    };
    const revokeEvent = (invitationId: string, by: Person, role: Role = 'sommelier', restaurantId = second.restaurantId): AuthEvent =>
      ({ id: uuid(9), restaurantId, actorUserId: by.userId, subjectUserId: null, type: 'invite_revoked', meta: { role, invitation_id: invitationId }, at: NOW });
    const accept = (hash: string, who: { newAccount?: boolean; userId?: string; name?: string; now?: string } = {}) => invites.accept({
      tokenHash: hash, now: who.now ?? NOW, membershipId: uuid(6), eventId: uuid(5),
      newAccount: who.newAccount === false ? null : { userId: who.userId ?? uuid(4), name: who.name ?? 'New Person', passwordHash: 'scrypt$not-a-real-hash' },
      existingUserId: who.newAccount === false ? (who.userId ?? null) : null
    });
    const deactivate = (target: { userId: string; membershipId: string }, by: Person, expectedVersion = 1) => team.applyChange(second.restaurantId, target.membershipId, {
      expectedVersion, set: { status: 'deactivated' }, actorUserId: by.userId, at: NOW,
      events: [{ id: uuid(3), restaurantId: second.restaurantId, actorUserId: by.userId, subjectUserId: target.userId, type: 'member_deactivated', meta: {}, at: NOW }]
    });
    const usable = (hash: string, now = NOW): Promise<InvitationPreview | null> => invites.findUsable(hash, now);

    t.it('creates a pending invitation, lists it for its own restaurant only and writes invite_created with it', async () => {
      const { made, event, invitation } = await invite({ email: 'wine@lover.test', role: 'manager' });
      t.expect(made).toMatchObject({ id: invitation.id, restaurantId: second.restaurantId, email: 'wine@lover.test', role: 'manager', createdBy: second.owner1.userId, createdByName: 'First Owner', expiresAt: at(72 * HOURS) });
      t.expect((await invites.listPending(second.restaurantId)).map((i) => i.id)).toEqual([invitation.id]);
      t.expect(await invites.listPending(ds.restaurant.id)).toEqual([]);
      t.expect((await audit.list(second.restaurantId, { type: 'invite_created' }))[0]).toEqual(event);
      t.expect(await invites.listPending('abc')).toEqual([]);
    });

    t.it('refuses an inviter without the right: a sommelier, a manager inviting a manager or an owner, a person of another restaurant, an unknown restaurant', async () => {
      await t.expect(invite({ by: second.sommelier })).rejects.toMatchObject({ name: 'ForbiddenError' });
      await t.expect(invite({ by: second.manager, role: 'manager' })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      await t.expect(invite({ by: second.manager, role: 'owner' })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      await t.expect(invite({ by: second.manager, role: 'waiter' })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      await t.expect(invite({ by: second.owner1, role: 'waiter' })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      // an owner of the second restaurant has no say in Halka
      await t.expect(invite({ restaurantId: ds.restaurant.id })).rejects.toMatchObject({ name: 'ForbiddenError' });
      await t.expect(invite({ restaurantId: '5ec0d000-0000-4000-8000-0000000000fe' })).rejects.toMatchObject({ name: 'NotFoundError' });
      await t.expect(invite({ restaurantId: 'abc' })).rejects.toMatchObject({ name: 'NotFoundError' });
      t.expect(await invites.listPending(second.restaurantId)).toEqual([]);
      t.expect((await audit.list(second.restaurantId, { type: 'invite_created' })).length).toBe(0);
      // a manager may invite a Wine Director
      t.expect((await invite({ by: second.manager, role: 'sommelier' })).made.role).toBe('sommelier');
    });

    t.it('names a person who is already in the team, active or deactivated, and invites nothing (AC24)', async () => {
      await t.expect(invite({ email: second.sommelier.email })).rejects.toMatchObject({ name: 'AlreadyMemberError', code: 'already_member' });
      await deactivate(second.sommelier, second.owner1);
      await t.expect(invite({ email: second.sommelier.email })).rejects.toMatchObject({ name: 'AlreadyMemberError' });
      t.expect(await invites.listPending(second.restaurantId)).toEqual([]);
    });

    t.it('lets a second invitation for the same e-mail replace the first: the first link dies, the list keeps one (AC24)', async () => {
      const first = await invite({ email: 'twice@invited.test' });
      t.expect((await usable(first.invitation.tokenHash))?.id).toBe(first.invitation.id);
      const again = await invite({ email: 'twice@invited.test', role: 'manager', createdAt: at(1000), expiresAt: at(72 * HOURS + 1000) });
      t.expect(await usable(first.invitation.tokenHash)).toBeNull();
      t.expect((await usable(again.invitation.tokenHash))?.role).toBe('manager');
      t.expect((await invites.listPending(second.restaurantId)).map((i) => i.id)).toEqual([again.invitation.id]);
      // other e-mails and the other restaurant are not touched
      const other = await invite({ email: 'other@invited.test' });
      t.expect((await usable(other.invitation.tokenHash))?.id).toBe(other.invitation.id);
    });

    t.it('does not let a manager replace an invitation they could not have made: it stays valid, nothing is written', async () => {
      const ownerInvite = await invite({ email: 'boss@invited.test', role: 'owner' });
      const before = (await audit.list(second.restaurantId)).length;
      await t.expect(invite({ by: second.manager, email: 'boss@invited.test', role: 'sommelier' })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      t.expect((await usable(ownerInvite.invitation.tokenHash))?.role).toBe('owner');
      t.expect((await audit.list(second.restaurantId)).length).toBe(before);
    });

    t.it('revokes a pending invitation atomically with its event; a second revoke, another restaurant and a bad id are "not found"', async () => {
      const a = await invite({ email: 'gone@invited.test' });
      const ev = revokeEvent(a.invitation.id, second.owner2);
      await invites.revoke(second.restaurantId, a.invitation.id, { actorUserId: second.owner2.userId, at: NOW, event: ev });
      t.expect(await usable(a.invitation.tokenHash)).toBeNull();
      t.expect(await invites.listPending(second.restaurantId)).toEqual([]);
      t.expect((await audit.list(second.restaurantId, { type: 'invite_revoked' }))[0]).toEqual(ev);
      await t.expect(invites.revoke(second.restaurantId, a.invitation.id, { actorUserId: second.owner2.userId, at: NOW, event: revokeEvent(a.invitation.id, second.owner2) })).rejects.toMatchObject({ name: 'NotFoundError' });
      const b = await invite({ email: 'kept@invited.test' });
      await t.expect(invites.revoke(ds.restaurant.id, b.invitation.id, { actorUserId: second.owner1.userId, at: NOW, event: revokeEvent(b.invitation.id, second.owner1, 'sommelier', ds.restaurant.id) })).rejects.toMatchObject({ name: 'NotFoundError' });
      await t.expect(invites.revoke(second.restaurantId, 'abc', { actorUserId: second.owner1.userId, at: NOW, event: revokeEvent('abc', second.owner1) })).rejects.toMatchObject({ name: 'NotFoundError' });
      t.expect((await usable(b.invitation.tokenHash))?.id).toBe(b.invitation.id);
    });

    t.it('treats an expired pending invitation as no obstacle: a manager replaces an expired owner invitation, a live one still refuses them', async () => {
      const old = await invite({ email: 'stale@invited.test', role: 'owner', createdAt: NOW, expiresAt: at(1 * HOURS) });
      // two hours later the owner's invitation has expired: the manager's new invitation replaces it instead of failing on its role
      const fresh = await invite({ by: second.manager, email: 'stale@invited.test', role: 'sommelier', createdAt: at(2 * HOURS), expiresAt: at(74 * HOURS) });
      t.expect(await usable(old.invitation.tokenHash, at(30 * 60_000))).toBeNull();
      t.expect((await usable(fresh.invitation.tokenHash, at(2 * HOURS)))?.role).toBe('sommelier');
      t.expect((await invites.listPending(second.restaurantId)).map((i) => i.id)).toEqual([fresh.invitation.id]);
      // a live owner invitation still blocks the manager
      const live = await invite({ email: 'live@invited.test', role: 'owner', createdAt: at(2 * HOURS), expiresAt: at(74 * HOURS) });
      await t.expect(invite({ by: second.manager, email: 'live@invited.test', role: 'sommelier', createdAt: at(3 * HOURS), expiresAt: at(75 * HOURS) })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      t.expect((await usable(live.invitation.tokenHash, at(3 * HOURS)))?.role).toBe('owner');
    });

    t.it('revoking needs the entitlement to invite that role: a sommelier is forbidden, a manager cannot revoke an owner invitation', async () => {
      const boss = await invite({ email: 'boss2@invited.test', role: 'owner' });
      const wine = await invite({ email: 'wine2@invited.test', role: 'sommelier' });
      await t.expect(invites.revoke(second.restaurantId, wine.invitation.id, { actorUserId: second.sommelier.userId, at: NOW, event: revokeEvent(wine.invitation.id, second.sommelier) })).rejects.toMatchObject({ name: 'ForbiddenError' });
      await t.expect(invites.revoke(second.restaurantId, boss.invitation.id, { actorUserId: second.manager.userId, at: NOW, event: revokeEvent(boss.invitation.id, second.manager, 'owner') })).rejects.toMatchObject({ name: 'TeamHierarchyError' });
      t.expect((await usable(boss.invitation.tokenHash))?.id).toBe(boss.invitation.id);
      await invites.revoke(second.restaurantId, wine.invitation.id, { actorUserId: second.manager.userId, at: NOW, event: revokeEvent(wine.invitation.id, second.manager) });
      t.expect(await usable(wine.invitation.tokenHash)).toBeNull();
    });

    t.it('finds a usable link and tells nothing else: unknown, expired and just-expired all give null (AC7)', async () => {
      const a = await invite({ email: 'open@invited.test', role: 'manager' });
      t.expect(await usable(a.invitation.tokenHash)).toMatchObject({ id: a.invitation.id, restaurantId: second.restaurantId, restaurantSlug: 'second-table', restaurantName: 'Second Table', email: 'open@invited.test', role: 'manager' });
      t.expect(await usable(tokenHash())).toBeNull();
      t.expect(await usable(a.invitation.tokenHash, at(72 * HOURS - 1))).toMatchObject({ id: a.invitation.id });
      t.expect(await usable(a.invitation.tokenHash, at(72 * HOURS))).toBeNull();
      t.expect(await usable(a.invitation.tokenHash, at(73 * HOURS))).toBeNull();
    });

    t.it('accepts once: creates the account and the membership with the role of the invitation and writes invite_accepted; the link then works no more (AC7)', async () => {
      const a = await invite({ email: 'fresh@invited.test', role: 'sommelier' });
      const userId = uuid(4);
      const got = await accept(a.invitation.tokenHash, { userId, name: 'Fresh Face' });
      t.expect(got).toMatchObject({ restaurantId: second.restaurantId, restaurantSlug: 'second-table', userId, email: 'fresh@invited.test', role: 'sommelier' });
      t.expect(await auth.findUserByEmail('fresh@invited.test')).toMatchObject({ id: userId, name: 'Fresh Face', passwordHash: 'scrypt$not-a-real-hash' });
      t.expect(await auth.membershipsOf(userId)).toEqual([{ restaurantId: second.restaurantId, restaurantSlug: 'second-table', restaurantName: 'Second Table', role: 'sommelier' }]);
      t.expect(await team.findByUser(second.restaurantId, userId)).toMatchObject({ role: 'sommelier', status: 'active', version: 1 });
      const events = await audit.list(second.restaurantId, { type: 'invite_accepted' });
      t.expect(events.length).toBe(1);
      t.expect(events[0]).toMatchObject({ actorUserId: userId, subjectUserId: userId, restaurantId: second.restaurantId, meta: { role: 'sommelier', invitation_id: a.invitation.id } });
      t.expect(await invites.listPending(second.restaurantId)).toEqual([]);
      t.expect(await usable(a.invitation.tokenHash)).toBeNull();
      await t.expect(accept(a.invitation.tokenHash, { userId: uuid(4), name: 'Again' })).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
      t.expect((await team.list(second.restaurantId)).filter((m) => m.email === 'fresh@invited.test').length).toBe(1);
    });

    t.it('gives every dead link the same error: unknown, revoked, expired, already used (AC7)', async () => {
      const revoked = await invite({ email: 'r@invited.test' });
      await invites.revoke(second.restaurantId, revoked.invitation.id, { actorUserId: second.owner1.userId, at: NOW, event: revokeEvent(revoked.invitation.id, second.owner1) });
      const expired = await invite({ email: 'e@invited.test' });
      const used = await invite({ email: 'u@invited.test' });
      await accept(used.invitation.tokenHash);
      const dead = [tokenHash(), revoked.invitation.tokenHash, used.invitation.tokenHash];
      for (const hash of dead) await t.expect(accept(hash)).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token', message: 'This link is not valid any more.' });
      await t.expect(accept(expired.invitation.tokenHash, { now: at(72 * HOURS) })).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token', message: 'This link is not valid any more.' });
      // nothing was created by the failures
      t.expect(await auth.findUserByEmail('r@invited.test')).toBeNull();
      t.expect(await auth.findUserByEmail('e@invited.test')).toBeNull();
    });

    t.it('lets an existing account join with the link without touching its password; another account, or a new one for an e-mail that has an account, is refused and the link stays usable', async () => {
      const email = ds.users.find((u) => u.key === 'marta')!.email;
      const marta = (await auth.findUserByEmail(email))!;
      const a = await invite({ email, role: 'manager' });
      await t.expect(accept(a.invitation.tokenHash, { newAccount: false, userId: ds.users.find((u) => u.key === 'tomasz')!.id })).rejects.toMatchObject({ code: 'wrong_account' });
      await t.expect(accept(a.invitation.tokenHash, { userId: uuid(4) })).rejects.toMatchObject({ code: 'account_exists' });
      t.expect((await usable(a.invitation.tokenHash))?.id).toBe(a.invitation.id);
      const got = await accept(a.invitation.tokenHash, { newAccount: false, userId: marta.id });
      t.expect(got).toMatchObject({ userId: marta.id, restaurantId: second.restaurantId, role: 'manager' });
      t.expect((await auth.findUserByEmail(email))!.passwordHash).toBe(marta.passwordHash);
      t.expect((await auth.membershipsOf(marta.id)).map((m) => m.restaurantSlug).sort()).toEqual(['halka', 'second-table']);
    });

    t.it('lets the link die with its inviter: deactivated, or no longer allowed to invite that role (AC24)', async () => {
      const owned = await invite({ by: second.owner2, email: 'x1@invited.test', role: 'sommelier' });
      const managerMade = await invite({ by: second.manager, email: 'x2@invited.test', role: 'sommelier' });
      const ownerMade = await invite({ by: second.owner1, email: 'x3@invited.test', role: 'manager' });
      t.expect((await usable(managerMade.invitation.tokenHash))?.id).toBe(managerMade.invitation.id);
      await deactivate(second.manager, second.owner1);
      t.expect(await usable(managerMade.invitation.tokenHash)).toBeNull();
      await t.expect(accept(managerMade.invitation.tokenHash)).rejects.toMatchObject({ name: 'InvalidTokenError' });
      await deactivate(second.owner2, second.owner1);
      t.expect(await usable(owned.invitation.tokenHash)).toBeNull();
      await t.expect(accept(owned.invitation.tokenHash)).rejects.toMatchObject({ name: 'InvalidTokenError' });
      // an invitation of a person who is still entitled is untouched
      t.expect((await usable(ownerMade.invitation.tokenHash))?.id).toBe(ownerMade.invitation.id);
      t.expect(await auth.findUserByEmail('x1@invited.test')).toBeNull();
    });

    t.it('re-checks a platform invitation when the link is used: once the restaurant has an active owner, every other owner invitation is dead (same answer)', async () => {
      const a = await invite({ platform: true, by: second.owner1, restaurantId: ds.restaurant.id, role: 'owner', email: 'founder-a@halka.test' });
      const b = await invite({ platform: true, by: second.owner1, restaurantId: ds.restaurant.id, role: 'owner', email: 'founder-b@halka.test' });
      t.expect((await usable(b.invitation.tokenHash))?.id).toBe(b.invitation.id);
      await accept(a.invitation.tokenHash);
      t.expect(await usable(b.invitation.tokenHash)).toBeNull();
      await t.expect(accept(b.invitation.tokenHash)).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token', message: 'This link is not valid any more.' });
      t.expect(await auth.findUserByEmail('founder-b@halka.test')).toBeNull();
    });

    t.it('keeps the platform invitation (inviteOwner) alive without a membership, but only for the owner role into a restaurant without an active owner', async () => {
      // a platform account is nobody's member: a Halka person for the second restaurant, a second-restaurant owner for Halka
      const marta = { userId: ds.users.find((u) => u.key === 'marta')!.id };
      await t.expect(invite({ platform: true, by: marta, restaurantId: second.restaurantId, role: 'owner' })).rejects.toMatchObject({ code: 'restaurant_has_owner' });
      await t.expect(invite({ platform: true, by: second.owner1, restaurantId: ds.restaurant.id, role: 'sommelier' })).rejects.toMatchObject({ code: 'invalid_role' });
      // a member who manages the team of the restaurant uses the normal path
      await t.expect(invite({ platform: true, by: second.owner1, restaurantId: second.restaurantId, role: 'owner' })).rejects.toMatchObject({ name: 'ForbiddenError' });
      // Halka has no owner in the demo data
      const a = await invite({ platform: true, by: second.owner1, restaurantId: ds.restaurant.id, role: 'owner', email: 'founder@halka.test' });
      t.expect(a.made).toMatchObject({ role: 'owner', restaurantId: ds.restaurant.id, createdBy: second.owner1.userId });
      t.expect((await usable(a.invitation.tokenHash))?.restaurantSlug).toBe('halka');
      t.expect((await audit.list(ds.restaurant.id, { type: 'invite_created' }))[0]).toMatchObject({ actorUserId: second.owner1.userId, restaurantId: ds.restaurant.id });
    });
  });
}
