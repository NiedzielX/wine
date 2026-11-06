import { beforeEach, describe, expect, it } from 'vitest';
import { InvitationService } from '../src/auth/invitation-service';
import { buildDemoDataset } from '../src/demo/dataset';
import { MemoryAuthAuditRepository, MemoryAuthRepository, MemoryInvitationRepository, MemoryStore, MemoryTeamRepository, createMemoryRepositories } from '../src/memory/memory-repositories';
import type { SessionTokens } from '../src/ports/auth';
import { invitationContract } from '../src/testing/invitation-contract';
import { SECOND_RESTAURANT, addSecondRestaurant } from '../src/testing/team-contract';
import { TeamService } from '../src/auth/team-service';
import type { Actor } from '../src/auth/types';

invitationContract('memory', async () => {
  const dataset = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(dataset);
  const second = addSecondRestaurant(store);
  return { invites: new MemoryInvitationRepository(store), team: new MemoryTeamRepository(store), audit: new MemoryAuthAuditRepository(store), auth: new MemoryAuthRepository(store), dataset, second };
}, { describe, it, expect, beforeEach });

let tokenSeq = 0;
/** Not random on purpose: the tests need to know the token. They never pick values the real generator could produce by chance. */
const tokens: SessionTokens = { generate: () => { const token = `token-${'x'.repeat(20)}-${++tokenSeq}`; return { token, hash: `h(${token})` }; }, hash: (t) => `h(${t})` };
const hasher = { hash: async (p: string) => `plain:${p}` };

function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(data);
  const second = addSecondRestaurant(store);
  const repos = createMemoryRepositories(store);
  const authRepository = new MemoryAuthRepository(store);
  let now = Date.parse('2026-11-06T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date(now) };
  const idGenerator = { uuid: () => `5ec0d000-0000-4000-8000-${String(600_000_000_000 + ++seq)}` };
  const invitations = new InvitationService({ ...repos, authRepository, passwordHasher: hasher, sessionTokens: tokens, clock, idGenerator });
  const team = new TeamService({ ...repos, clock, idGenerator });
  const actor = (m: { userId: string; name: string }): Actor => ({ id: m.userId, name: m.name });
  return {
    data, store, second, repos, invitations, team, authRepository, advance: (ms: number) => { now += ms; },
    owner: actor(second.owner1), owner2: actor(second.owner2), manager: actor(second.manager), sommelier: actor(second.sommelier)
  };
}
const SLUG = SECOND_RESTAURANT.slug;

describe('InvitationService: inviting (AC8, AC24)', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });

  it('answers the inviter the same way for an e-mail that has an account and for one that has none (AC8)', async () => {
    const known = await t.invitations.invite(SLUG, { email: 'marta@halka.pl', role: 'sommelier' }, t.owner);
    const unknown = await t.invitations.invite(SLUG, { email: 'nobody-yet@example.test', role: 'sommelier' }, t.owner);
    const shape = (r: typeof known) => ({ keys: Object.keys(r).sort(), inv: Object.keys(r.invitation).sort(), role: r.invitation.role, tokenLength: r.token.length, hours: (Date.parse(r.invitation.expiresAt) - Date.parse(r.invitation.createdAt)) / 3_600_000 });
    expect(shape(known)).toEqual(shape(unknown));
    expect(shape(known).hours).toBe(72);
    // and the list shows both alike: nothing says which e-mail has an account
    const listed = await t.invitations.list(SLUG, t.owner);
    expect(listed.map((i) => Object.keys(i).sort())).toEqual([Object.keys(listed[0]).sort(), Object.keys(listed[0]).sort()]);
    // the offer, which only the holder of the link sees, is what tells them to sign in
    expect(await t.invitations.offer(known.token)).toMatchObject({ accountExists: true, email: 'marta@halka.pl' });
    expect(await t.invitations.offer(unknown.token)).toMatchObject({ accountExists: false });
  });

  it('normalises the e-mail (trim, lower case) and names a person already in the team, whatever the spelling (AC24)', async () => {
    const issued = await t.invitations.invite(SLUG, { email: '  Mixed.Case@Example.TEST ', role: 'sommelier' }, t.owner);
    expect(issued.invitation.email).toBe('mixed.case@example.test');
    await expect(t.invitations.invite(SLUG, { email: ' MANAGER@second.test', role: 'sommelier' }, t.owner)).rejects.toMatchObject({ name: 'AlreadyMemberError' });
    // the same e-mail again, in other letters, replaces the first invitation
    await t.invitations.invite(SLUG, { email: 'MIXED.case@example.test', role: 'manager' }, t.owner);
    expect((await t.invitations.list(SLUG, t.owner)).map((i) => i.role)).toEqual(['manager']);
  });

  it('refuses bad input before anything is written: a waiter, an unknown role, a bad e-mail, extra fields', async () => {
    for (const input of [{ email: 'a@b.test', role: 'waiter' }, { email: 'a@b.test', role: 'janitor' }, { email: 'not-an-address', role: 'owner' }, { email: '', role: 'owner' }, { email: 'a@b.test', role: 'owner', extra: 1 }]) {
      await expect(t.invitations.invite(SLUG, input as never, t.owner), JSON.stringify(input)).rejects.toMatchObject({ name: 'ValidationError', code: 'validation_failed' });
    }
    expect(await t.invitations.list(SLUG, t.owner)).toEqual([]);
  });

  it('denied paths: a sommelier, a manager of the hierarchy, a person of another restaurant, an unknown restaurant, a deactivated inviter', async () => {
    await expect(t.invitations.invite(SLUG, { email: 'a@b.test', role: 'sommelier' }, t.sommelier)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.invitations.list(SLUG, t.sommelier)).rejects.toMatchObject({ name: 'ForbiddenError' });
    for (const role of ['owner', 'manager'] as const) await expect(t.invitations.invite(SLUG, { email: 'a@b.test', role }, t.manager)).rejects.toMatchObject({ name: 'TeamHierarchyError' });
    const halkaManager: Actor = { id: t.data.users.find((u) => u.key === 'tomasz')!.id, name: 'Tomasz' };
    await expect(t.invitations.invite(SLUG, { email: 'a@b.test', role: 'sommelier' }, halkaManager)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.invitations.list(SLUG, halkaManager)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.invitations.invite('no-such-place', { email: 'a@b.test', role: 'sommelier' }, t.owner)).rejects.toMatchObject({ name: 'NotFoundError' });
    await t.team.deactivate(SLUG, SECOND_RESTAURANT.members[2].membershipId, t.owner, 1);
    await expect(t.invitations.invite(SLUG, { email: 'a@b.test', role: 'sommelier' }, t.manager)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.invitations.list(SLUG, t.manager)).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(await t.invitations.list(SLUG, t.owner)).toEqual([]);
  });

  it('wrong scope: the owner of one restaurant cannot list, revoke or see the invitations of another', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'a@b.test', role: 'sommelier' }, t.owner);
    const halkaOwner: Actor = { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Halka Owner' };
    t.store.users.push({ id: halkaOwner.id, email: 'owner@halka.test', name: halkaOwner.name, passwordHash: 'x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    t.store.memberships.push({ userId: halkaOwner.id, membershipId: 'aaaaaaaa-0000-4000-8000-000000000002', restaurantId: t.data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner', status: 'active', version: 1, createdAt: '2026-10-01T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    expect(await t.invitations.list('halka', halkaOwner)).toEqual([]);
    // the invitation id through the other restaurant's slug is "not found", and it is still pending
    await expect(t.invitations.revoke('halka', issued.invitation.id, halkaOwner)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(t.invitations.revoke(SLUG, issued.invitation.id, halkaOwner)).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect((await t.invitations.list(SLUG, t.owner)).map((i) => i.id)).toEqual([issued.invitation.id]);
  });

  it('revokes: the link is dead at once, the revocation is audited without an e-mail address, a stranger id is not found', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'revoke-me@example.test', role: 'sommelier' }, t.owner);
    await t.invitations.revoke(SLUG, issued.invitation.id, t.owner2);
    expect(await t.invitations.offer(issued.token)).toBeNull();
    await expect(t.invitations.accept({ token: issued.token, name: 'X', password: 'a-long-enough-passphrase' }, null)).rejects.toMatchObject({ name: 'InvalidTokenError' });
    const events = await t.repos.authAuditRepository.list(t.second.restaurantId);
    expect(events.map((e) => e.type).sort()).toEqual(['invite_created', 'invite_revoked']);
    expect(JSON.stringify(events)).not.toContain('@example.test');
    await expect(t.invitations.revoke(SLUG, issued.invitation.id, t.owner)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(t.invitations.revoke(SLUG, 'not-a-uuid', t.owner)).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('InvitationService: accepting (AC7, AC8, AC24)', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const PASSWORD = 'a-long-enough-passphrase';

  it('a new person gets an account and the role of the invitation, the link works once, and a second use gives the same answer as a revoked or unknown link (AC7)', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'newbie@example.test', role: 'manager' }, t.owner);
    const got = await t.invitations.accept({ token: issued.token, name: '  Nina Newbie ', password: PASSWORD }, null);
    expect(got).toMatchObject({ newAccount: true, email: 'newbie@example.test', role: 'manager', restaurantSlug: SLUG });
    const user = (await t.authRepository.findUserByEmail('newbie@example.test'))!;
    expect(user.name).toBe('Nina Newbie');
    expect(user.passwordHash).toBe(`plain:${PASSWORD}`);
    expect((await t.authRepository.membershipsOf(user.id)).map((m) => [m.restaurantSlug, m.role])).toEqual([[SLUG, 'manager']]);
    const messages = new Set<string>();
    for (const token of [issued.token, 'token-never-issued-by-anyone-0']) {
      const err = await t.invitations.accept({ token, name: 'Again', password: PASSWORD }, null).then(() => { throw new Error('accepted'); }, (e: unknown) => e as { name: string; code: string; message: string });
      expect(err).toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
      messages.add(err.message);
    }
    const revoked = await t.invitations.invite(SLUG, { email: 'revoked@example.test', role: 'sommelier' }, t.owner);
    await t.invitations.revoke(SLUG, revoked.invitation.id, t.owner);
    messages.add((await t.invitations.accept({ token: revoked.token, name: 'R', password: PASSWORD }, null).then(() => { throw new Error('accepted'); }, (e: unknown) => e as { message: string })).message);
    expect(messages.size).toBe(1);
    expect(await t.invitations.offer(issued.token)).toBeNull();
  });

  it('a link stops working after 72 hours, not before (AC7)', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'late@example.test', role: 'sommelier' }, t.owner);
    t.advance(72 * 3_600_000 - 1000);
    expect(await t.invitations.offer(issued.token)).toMatchObject({ email: 'late@example.test' });
    t.advance(1000);
    expect(await t.invitations.offer(issued.token)).toBeNull();
    await expect(t.invitations.accept({ token: issued.token, name: 'L', password: PASSWORD }, null)).rejects.toMatchObject({ name: 'InvalidTokenError' });
    expect(await t.authRepository.findUserByEmail('late@example.test')).toBeNull();
  });

  it('checks the name and the password before the link is used: a short password leaves the link alive', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'weak@example.test', role: 'sommelier' }, t.owner);
    await expect(t.invitations.accept({ token: issued.token, name: 'W', password: 'short' }, null)).rejects.toMatchObject({ code: 'validation_failed', fields: { password: 'too_short' } });
    await expect(t.invitations.accept({ token: issued.token, name: '   ', password: PASSWORD }, null)).rejects.toMatchObject({ fields: { name: 'required' } });
    await expect(t.invitations.accept({ token: issued.token, name: 'W', password: 'x'.repeat(129) }, null)).rejects.toMatchObject({ fields: { password: 'too_long' } });
    expect(await t.invitations.offer(issued.token)).not.toBeNull();
    expect(await t.authRepository.findUserByEmail('weak@example.test')).toBeNull();
  });

  it('an existing account must be signed in as that account, gets only the membership and keeps its password (AC8)', async () => {
    const martaBefore = (await t.authRepository.findUserByEmail('marta@halka.pl'))!;
    const issued = await t.invitations.invite(SLUG, { email: 'marta@halka.pl', role: 'manager' }, t.owner);
    // not signed in, another account, and a "new account" attempt with a password for an e-mail that has one: all refused, link intact
    await expect(t.invitations.accept({ token: issued.token, name: 'Mallory', password: PASSWORD }, null)).rejects.toMatchObject({ code: 'sign_in_required' });
    const tomasz = (await t.authRepository.findUserByEmail('tomasz@halka.pl'))!;
    await expect(t.invitations.accept({ token: issued.token }, { userId: tomasz.id, email: tomasz.email })).rejects.toMatchObject({ code: 'wrong_account' });
    expect(await t.invitations.offer(issued.token)).not.toBeNull();
    // a password in the form is ignored for an existing account
    const got = await t.invitations.accept({ token: issued.token, name: 'Ignored', password: 'a-different-password-entirely' }, { userId: martaBefore.id, email: martaBefore.email });
    expect(got).toMatchObject({ newAccount: false, userId: martaBefore.id, role: 'manager' });
    expect(await t.authRepository.findUserByEmail('marta@halka.pl')).toEqual(martaBefore);
    expect((await t.authRepository.membershipsOf(martaBefore.id)).map((m) => m.restaurantSlug).sort()).toEqual(['halka', SLUG]);
  });

  it('two accepts of one link: one wins, the other gets the dead-link answer, and there is one membership (AC24)', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'race@example.test', role: 'sommelier' }, t.owner);
    const results = await Promise.allSettled([
      t.invitations.accept({ token: issued.token, name: 'First', password: PASSWORD }, null),
      t.invitations.accept({ token: issued.token, name: 'Second', password: PASSWORD }, null)
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
    expect((await t.team.list(SLUG, t.owner)).filter((m) => m.email === 'race@example.test')).toHaveLength(1);
    expect(t.store.users.filter((u) => u.email === 'race@example.test')).toHaveLength(1);
  });

  it('an inviter deactivated after inviting takes the link with them; a demoted one too (AC24)', async () => {
    const byManager = await t.invitations.invite(SLUG, { email: 'orphan@example.test', role: 'sommelier' }, t.manager);
    await t.team.deactivate(SLUG, SECOND_RESTAURANT.members[2].membershipId, t.owner, 1);
    expect(await t.invitations.offer(byManager.token)).toBeNull();
    await expect(t.invitations.accept({ token: byManager.token, name: 'O', password: PASSWORD }, null)).rejects.toMatchObject({ name: 'InvalidTokenError' });
    expect(await t.authRepository.findUserByEmail('orphan@example.test')).toBeNull();
    // reactivation does not need a new link: the person is entitled again, so the same link lives again (the owner who wants it dead revokes it)
    await t.team.reactivate(SLUG, SECOND_RESTAURANT.members[2].membershipId, t.owner, 2);
    expect(await t.invitations.offer(byManager.token)).not.toBeNull();
    // a manager made a sommelier can no longer stand behind a link of any kind
    await t.team.changeRole(SLUG, SECOND_RESTAURANT.members[2].membershipId, 'sommelier', t.owner, 3);
    expect(await t.invitations.offer(byManager.token)).toBeNull();
  });

  it('a person who joined by other means gets already_member and the link stays unused', async () => {
    const issued = await t.invitations.invite(SLUG, { email: 'sneaky@example.test', role: 'sommelier' }, t.owner);
    // the account appears with a membership here before the link is used (what an organisation of E14 will do)
    t.store.users.push({ id: 'bbbbbbbb-0000-4000-8000-000000000001', email: 'sneaky@example.test', name: 'S', passwordHash: 'x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    t.store.memberships.push({ userId: 'bbbbbbbb-0000-4000-8000-000000000001', membershipId: 'bbbbbbbb-0000-4000-8000-000000000002', restaurantId: t.second.restaurantId, restaurantSlug: SLUG, restaurantName: 'Second Table', role: 'sommelier', status: 'active', version: 1, createdAt: '2026-10-05T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    await expect(t.invitations.accept({ token: issued.token }, { userId: 'bbbbbbbb-0000-4000-8000-000000000001', email: 'sneaky@example.test' })).rejects.toMatchObject({ name: 'AlreadyMemberError', code: 'already_member' });
    expect(await t.invitations.offer(issued.token)).not.toBeNull();
  });
});

describe('InvitationService.inviteOwner (the interface E14 uses, AC24)', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const platform = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Platform Admin', isStaff: true };
  const halkaId = () => t.data.restaurant.id;

  it('invites the first owner of a restaurant without one, as the platform account; the owner role only; the event names the restaurant and the platform actor', async () => {
    const issued = await t.invitations.inviteOwner(platform, halkaId(), 'Founder@Halka.test');
    expect(issued.invitation).toMatchObject({ role: 'owner', restaurantId: halkaId(), email: 'founder@halka.test', createdBy: platform.id });
    const events = await t.repos.authAuditRepository.list(halkaId(), { type: 'invite_created' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorUserId: platform.id, restaurantId: halkaId(), meta: { role: 'owner', invitation_id: issued.invitation.id } });
    const got = await t.invitations.accept({ token: issued.token, name: 'Founder', password: 'a-long-enough-passphrase' }, null);
    expect(got).toMatchObject({ role: 'owner', restaurantSlug: 'halka' });
  });

  it('refuses a role other than owner, a restaurant with an active owner, a caller without the staff flag and a member who manages the team (each on its own)', async () => {
    await expect(t.invitations.inviteOwner(platform, halkaId(), 'a@b.test', 'manager')).rejects.toMatchObject({ code: 'invalid_role' });
    await expect(t.invitations.inviteOwner(platform, halkaId(), 'a@b.test', 'waiter')).rejects.toMatchObject({ code: 'invalid_role' });
    await expect(t.invitations.inviteOwner(platform, t.second.restaurantId, 'a@b.test')).rejects.toMatchObject({ code: 'restaurant_has_owner' });
    await expect(t.invitations.inviteOwner({ ...platform, isStaff: false }, halkaId(), 'a@b.test')).rejects.toMatchObject({ name: 'ForbiddenError' });
    // a manager of that restaurant flagged as staff would still manage its team: that is the normal path, not this one
    await expect(t.invitations.inviteOwner({ id: t.second.manager.userId, name: 'M', isStaff: true }, t.second.restaurantId, 'a@b.test')).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(t.invitations.inviteOwner(platform, '5ec0d000-0000-4000-8000-0000000000fe', 'a@b.test')).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(await t.repos.invitationRepository.listPending(halkaId())).toEqual([]);
  });
});

describe('the platform flag and the inviter that is gone (review majors 1 and 2)', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const PASSWORD = 'a-long-enough-passphrase';

  it('a regular inviter whose membership row has disappeared leaves a dead link, for every role (it is not a platform invitation)', async () => {
    const byOwner = await t.invitations.invite(SLUG, { email: 'gone1@example.test', role: 'owner' }, t.owner);
    const byManager = await t.invitations.invite(SLUG, { email: 'gone2@example.test', role: 'sommelier' }, t.manager);
    for (const id of [SECOND_RESTAURANT.members[0].userId, SECOND_RESTAURANT.members[2].userId]) {
      const i = t.store.memberships.findIndex((m) => m.userId === id && m.restaurantId === t.second.restaurantId);
      t.store.memberships.splice(i, 1);
    }
    for (const issued of [byOwner, byManager]) {
      expect(await t.invitations.offer(issued.token)).toBeNull();
      await expect(t.invitations.accept({ token: issued.token, name: 'X', password: PASSWORD }, null)).rejects.toMatchObject({ name: 'InvalidTokenError' });
    }
    expect(t.store.users.some((u) => u.email === 'gone1@example.test' || u.email === 'gone2@example.test')).toBe(false);
  });

  it('a platform invitation stays valid with no membership of the inviter, and is marked as one', async () => {
    const platform = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Platform Admin', isStaff: true };
    const issued = await t.invitations.inviteOwner(platform, t.data.restaurant.id, 'founder@halka.test');
    expect(t.store.invitations.find((i) => i.id === issued.invitation.id)).toMatchObject({ platform: true });
    expect(await t.invitations.offer(issued.token)).toMatchObject({ role: 'owner' });
    const regular = await t.invitations.invite(SLUG, { email: 'regular@example.test', role: 'sommelier' }, t.owner);
    expect(t.store.invitations.find((i) => i.id === regular.invitation.id)).toMatchObject({ platform: false });
  });

  it('a platform owner invitation dies when the restaurant gets an active owner another way (same answer as any dead link)', async () => {
    const platform = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Platform Admin', isStaff: true };
    const issued = await t.invitations.inviteOwner(platform, t.data.restaurant.id, 'late-founder@halka.test');
    // an owner appears through some other path (E14's organisation, an operator command)
    t.store.users.push({ id: 'dddddddd-0000-4000-8000-000000000001', email: 'operator-made@halka.test', name: 'Op', passwordHash: 'x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    t.store.memberships.push({ userId: 'dddddddd-0000-4000-8000-000000000001', membershipId: 'dddddddd-0000-4000-8000-000000000002', restaurantId: t.data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner', status: 'active', version: 1, createdAt: '2026-10-05T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    expect(await t.invitations.offer(issued.token)).toBeNull();
    await expect(t.invitations.accept({ token: issued.token, name: 'F', password: PASSWORD }, null)).rejects.toMatchObject({ name: 'InvalidTokenError', code: 'invalid_token' });
    expect(t.store.users.some((u) => u.email === 'late-founder@halka.test')).toBe(false);
  });

  it('one rule for a platform account that is also a member: the invitation is refused when made AND when used (consistency)', async () => {
    const platform = { id: 'cccccccc-0000-4000-8000-000000000001', name: 'Platform Admin', isStaff: true };
    const issued = await t.invitations.inviteOwner(platform, t.data.restaurant.id, 'consistent@halka.test');
    // afterwards the platform account becomes an active manager of that restaurant
    t.store.users.push({ id: platform.id, email: 'platform@example.test', name: platform.name, passwordHash: 'x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    t.store.memberships.push({ userId: platform.id, membershipId: 'dddddddd-0000-4000-8000-000000000003', restaurantId: t.data.restaurant.id, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'manager', status: 'active', version: 1, createdAt: '2026-10-05T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    await expect(t.invitations.inviteOwner(platform, t.data.restaurant.id, 'another@halka.test')).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(await t.invitations.offer(issued.token)).toBeNull();
    // a deactivated member is no team manager: both the creation and the use are allowed again
    t.store.memberships.find((m) => m.membershipId === 'dddddddd-0000-4000-8000-000000000003')!.status = 'deactivated';
    expect(await t.invitations.offer(issued.token)).not.toBeNull();
    await expect(t.invitations.inviteOwner(platform, t.data.restaurant.id, 'another@halka.test')).resolves.toBeTruthy();
  });
});

describe('e-mail case (review minor 8): both sides are compared in lower case', () => {
  it('a legacy account stored in mixed case is a member for the invitation check and an existing account at accept', async () => {
    const t = build();
    const legacy = (id: string, email: string) => t.store.users.push({ id, email, name: 'Legacy', passwordHash: 'x', failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
    legacy('eeeeeeee-0000-4000-8000-000000000001', 'Legacy.Member@Example.test');
    t.store.memberships.push({ userId: 'eeeeeeee-0000-4000-8000-000000000001', membershipId: 'eeeeeeee-0000-4000-8000-000000000002', restaurantId: t.second.restaurantId, restaurantSlug: SLUG, restaurantName: 'Second Table', role: 'sommelier', status: 'active', version: 1, createdAt: '2026-10-05T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    await expect(t.invitations.invite(SLUG, { email: 'legacy.member@example.test', role: 'sommelier' }, t.owner)).rejects.toMatchObject({ name: 'AlreadyMemberError' });
    // a legacy account that is not a member: a "new account" for the same address in lower case would be a duplicate of it
    legacy('eeeeeeee-0000-4000-8000-000000000003', 'Legacy.Other@Example.test');
    const issued = await t.invitations.invite(SLUG, { email: 'legacy.other@example.test', role: 'sommelier' }, t.owner);
    await expect(t.invitations.accept({ token: issued.token, name: 'Dup', password: 'a-long-enough-passphrase' }, null)).rejects.toMatchObject({ code: 'account_exists' });
    expect(t.store.users.filter((u) => u.email.toLowerCase() === 'legacy.other@example.test')).toHaveLength(1);
    // the link is not spent by the refusal (a legacy account cannot sign in at all: login lower-cases the address, so there is nothing to join with)
    expect(await t.invitations.offer(issued.token)).not.toBeNull();
  });
});
