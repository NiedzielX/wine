import { ForbiddenError, InvalidTokenError, NotFoundError, ValidationError } from '../errors';
import type { AcceptedInvitation } from '../ports/invitations';
import type { PasswordHasher, SessionTokens } from '../ports/auth';
import type { AuthRepository } from '../ports/auth';
import type { Repositories } from '../ports/repositories';
import type { Clock, IdGenerator } from '../ports/runtime';
import { parseWith } from '../validators/parse';
import { acceptInvitationSchema, invitationSchema } from '../validators/invitations/invitation.schema';
import { MIN_PASSWORD_LENGTH } from './auth-service';
import { assertMayInvite, assertPlatformMayInvite } from './invitation-rules';
import { can } from './permissions';
import { INVITATION_HOURS, type Actor, type AuthEvent, type Invitation, type Role, type TeamMember } from './types';

export type InvitationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'teamRepository' | 'invitationRepository'> & {
  authRepository: Pick<AuthRepository, 'findUserByEmail'>;
  passwordHasher: Pick<PasswordHasher, 'hash'>;
  /** the same random-token generator as the sessions: 32 random bytes, only the SHA-256 is stored */
  sessionTokens: SessionTokens;
  clock: Clock;
  idGenerator: IdGenerator;
};

/** The platform account that invites a restaurant's first owner (E14): built by the caller from the authenticated `is_staff` account, never from client input. */
export interface PlatformActor extends Actor { isStaff: boolean }

/** What the person who invited gets, once: the plain token is not stored anywhere. */
export interface IssuedInvitation { invitation: Invitation; token: string }

/** What a usable link tells the person who opens it. */
export interface InvitationOffer {
  restaurantName: string;
  role: Role;
  email: string;
  /** an account with this e-mail exists: the person must sign in to it instead of choosing a password */
  accountExists: boolean;
}

export const MAX_PASSWORD_LENGTH = 128;

/**
 * Invitations by one-time link (spec E12 F2, R4). The inviter's answer is the same whether the e-mail has an account or not
 * (only a person already in the team is named, `already_member`: the inviter sees the team list). The link works once, for 72 hours,
 * and dies with a revocation or with the inviter's access; it is stored only as a SHA-256.
 */
export class InvitationService {
  constructor(private readonly d: InvitationServiceDeps) {}

  /** Pending invitations of the restaurant. Needs `team.manage`. */
  async list(slug: string, actor: Actor): Promise<Invitation[]> {
    const { restaurantId } = await this.caller(slug, actor);
    return this.d.invitationRepository.listPending(restaurantId);
  }

  /**
   * Invites by e-mail. `TeamHierarchyError` for a role the inviter may not grant (a manager invites only a Wine Director),
   * `AlreadyMemberError`, `ValidationError`. A second invitation for the same e-mail replaces the first.
   */
  async invite(slug: string, input: { email: string; role: Role }, actor: Actor): Promise<IssuedInvitation> {
    const parsed = parseWith(invitationSchema, input);
    const { restaurantId, me } = await this.caller(slug, actor);
    assertMayInvite(me, parsed.role);
    return this.issue(restaurantId, parsed.email, parsed.role, actor.id, false);
  }

  /**
   * E14's entry: the first owner of a restaurant that has none. Only role `owner`, only a caller flagged `isStaff` (the platform
   * account), only a restaurant without an active owner, never someone who manages that restaurant's team. The event carries the
   * restaurant and the platform account as actor.
   */
  async inviteOwner(platformActor: PlatformActor, restaurantId: string, email: string, role: Role = 'owner'): Promise<IssuedInvitation> {
    const parsed = parseWith(invitationSchema.pick({ email: true }), { email });
    if (!platformActor.isStaff) throw new ForbiddenError();
    const team = await this.d.teamRepository.list(restaurantId);
    const owners = team.filter((m) => m.role === 'owner' && m.status === 'active').length;
    assertPlatformMayInvite(team.find((m) => m.userId === platformActor.id) ?? null, owners, role);
    return this.issue(restaurantId, parsed.email, role, platformActor.id, true);
  }

  /** Cancels a pending invitation: the link stops working at once. `NotFoundError` for one that is not pending here. */
  async revoke(slug: string, invitationId: string, actor: Actor): Promise<void> {
    const { restaurantId } = await this.caller(slug, actor);
    const at = this.d.clock.now().toISOString();
    // the role is not known yet: the repository takes it from the row and checks the actor's entitlement inside the transaction
    const pending = (await this.d.invitationRepository.listPending(restaurantId)).find((i) => i.id === invitationId);
    if (!pending) throw new NotFoundError('Invitation');
    const event: AuthEvent = {
      id: this.d.idGenerator.uuid(), restaurantId, actorUserId: actor.id, subjectUserId: null, type: 'invite_revoked', meta: { role: pending.role, invitation_id: pending.id }, at
    };
    await this.d.invitationRepository.revoke(restaurantId, invitationId, { actorUserId: actor.id, at, event });
  }

  /** What the link offers, or null for any dead link (one answer: unknown, used, revoked, expired). */
  async offer(token: string): Promise<InvitationOffer | null> {
    if (!token) return null;
    const preview = await this.d.invitationRepository.findUsable(this.d.sessionTokens.hash(token), this.d.clock.now().toISOString());
    if (!preview) return null;
    const user = await this.d.authRepository.findUserByEmail(preview.email);
    return { restaurantName: preview.restaurantName, role: preview.role, email: preview.email, accountExists: user !== null };
  }

  /**
   * Accepts the link. A person without an account gives a name and a password (at least `MIN_PASSWORD_LENGTH`) and gets the account
   * and the membership; a person who has one must be signed in to it (`signedIn`) and gets only the membership: the password is never
   * touched. `InvalidTokenError` for a dead link, `ValidationError` (`sign_in_required`, `wrong_account`, `validation_failed`), `AlreadyMemberError`.
   */
  async accept(input: { token: string; name?: string; password?: string }, signedIn: { userId: string; email: string } | null): Promise<AcceptedInvitation & { newAccount: boolean }> {
    const parsed = parseWith(acceptInvitationSchema, input);
    const now = this.d.clock.now().toISOString();
    const tokenHash = this.d.sessionTokens.hash(parsed.token);
    const preview = await this.d.invitationRepository.findUsable(tokenHash, now);
    if (!preview) throw new InvalidTokenError();
    const existing = await this.d.authRepository.findUserByEmail(preview.email);
    const base = { tokenHash, now, membershipId: this.d.idGenerator.uuid(), eventId: this.d.idGenerator.uuid() };
    if (existing) {
      if (!signedIn) throw new ValidationError('sign_in_required', 'Sign in with the account of this e-mail address first.');
      if (signedIn.userId !== existing.id) throw new ValidationError('wrong_account', 'This invitation is for another account. Sign out and open the link again.');
      return { ...(await this.d.invitationRepository.accept({ ...base, newAccount: null, existingUserId: existing.id })), newAccount: false };
    }
    const fields: Record<string, string> = {};
    const name = (parsed.name ?? '').trim();
    const password = parsed.password ?? '';
    if (!name) fields.name = 'required';
    if (password.length < MIN_PASSWORD_LENGTH) fields.password = 'too_short';
    else if (password.length > MAX_PASSWORD_LENGTH) fields.password = 'too_long';
    if (Object.keys(fields).length) throw new ValidationError('validation_failed', 'Check the name and the password.', fields);
    const passwordHash = await this.d.passwordHasher.hash(password);
    const accepted = await this.d.invitationRepository.accept({ ...base, newAccount: { userId: this.d.idGenerator.uuid(), name, passwordHash }, existingUserId: null });
    return { ...accepted, newAccount: true };
  }

  private async issue(restaurantId: string, email: string, role: Role, createdBy: string, platform: boolean): Promise<IssuedInvitation> {
    const now = this.d.clock.now();
    const { token, hash } = this.d.sessionTokens.generate();
    const id = this.d.idGenerator.uuid();
    const at = now.toISOString();
    const event: AuthEvent = { id: this.d.idGenerator.uuid(), restaurantId, actorUserId: createdBy, subjectUserId: null, type: 'invite_created', meta: { role, invitation_id: id }, at };
    const invitation = await this.d.invitationRepository.create(restaurantId, {
      invitation: { id, email, role, tokenHash: hash, createdBy, createdAt: at, expiresAt: new Date(now.getTime() + INVITATION_HOURS * 3_600_000).toISOString() },
      platform, event
    });
    return { invitation, token };
  }

  /** The restaurant and the actor's own, active membership with `team.manage`, or Forbidden / NotFound (same rule as `TeamService`). */
  private async caller(slug: string, actor: Actor): Promise<{ restaurantId: string; me: TeamMember }> {
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    const me = await this.d.teamRepository.findByUser(restaurant.id, actor.id);
    if (!me || me.status !== 'active' || !can(me.role, 'team.manage')) throw new ForbiddenError();
    return { restaurantId: restaurant.id, me };
  }
}
