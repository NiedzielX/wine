import type { AuthEvent, Invitation, Role } from '../auth/types';

/** A new invitation as the repository stores it: the SHA-256 of the token, never the token. */
export interface NewInvitation {
  id: string;
  /** lower-case, trimmed */
  email: string;
  role: Role;
  tokenHash: string;
  /** user id of the inviter */
  createdBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreateInvitation {
  invitation: NewInvitation;
  /**
   * true for `InvitationService.inviteOwner` (E14): the inviter is a platform account with no membership here, only the
   * role `owner` is allowed, and only while the restaurant has no active owner. false: the inviter is a member of the restaurant.
   */
  platform: boolean;
  /** `invite_created` for this restaurant, written in the same transaction */
  event: AuthEvent;
}

export interface RevokeInvitation {
  actorUserId: string;
  at: string;
  /** `invite_revoked`, written in the same transaction */
  event: AuthEvent;
}

/** What a usable link shows the person who opens it. */
export interface InvitationPreview {
  id: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface AcceptInvitation {
  tokenHash: string;
  now: string;
  membershipId: string;
  /** `invite_accepted`: the repository fills in the restaurant, the role and the invitation id */
  eventId: string;
  /** exactly one of the two: a new account (the person has none yet) or the signed-in existing one */
  newAccount: { userId: string; name: string; passwordHash: string } | null;
  existingUserId: string | null;
}

export interface AcceptedInvitation {
  restaurantId: string;
  restaurantSlug: string;
  userId: string;
  email: string;
  role: Role;
}

/**
 * Invitations to a restaurant's team (spec E12 F2, R4): `auth_token` rows of kind `invite`. Every method that works on
 * one restaurant's invitations takes its id: an invitation of another restaurant is "not found", never readable or
 * revocable. The two methods that start from the LINK (`findUsable`, `accept`) are the one exception to "every method
 * takes `restaurantId`" (like the identity port `AuthRepository`): the link carries no restaurant, its SHA-256 (256 random
 * bits) is the key, and the restaurant is read from the row. They never take a restaurant from the caller.
 */
export interface InvitationRepository {
  /** Pending invitations (not accepted, not revoked; expired ones included, `expiresAt` tells), oldest first. */
  listPending(restaurantId: string): Promise<Invitation[]>;
  /**
   * One transaction. Re-checks INSIDE the lock that the inviter is still an active member with `team.manage` who may
   * invite this role (`ForbiddenError`, `TeamHierarchyError`; `platform`: see `CreateInvitation`), that the e-mail is not already
   * a member of the restaurant, active or deactivated (`AlreadyMemberError`), revokes every earlier pending invitation for the
   * same e-mail and restaurant (a second invitation replaces the first; one the inviter could not have revoked is a `TeamHierarchyError`),
   * stores the new one and writes `event`. `NotFoundError` for an unknown restaurant.
   */
  create(restaurantId: string, input: CreateInvitation): Promise<Invitation>;
  /**
   * Revokes one pending invitation, atomically (`update … where used_at is null and revoked_at is null`) and writes the event.
   * `NotFoundError` when it is unknown, of another restaurant, already used or already revoked; the actor needs the same entitlement as to invite its role.
   */
  revoke(restaurantId: string, invitationId: string, input: RevokeInvitation): Promise<void>;
  /**
   * The invitation behind a link, or null for every kind of dead link (unknown, used, revoked, expired, or the inviter may no
   * longer stand behind it). A plain read: `accept` decides again, atomically.
   */
  findUsable(tokenHash: string, now: string): Promise<InvitationPreview | null>;
  /**
   * One transaction, single use: consumes the token (`update … where used_at is null and revoked_at is null and expires_at > now returning`,
   * so two parallel accepts give one success and one `InvalidTokenError`), re-checks that the inviter may still stand behind it
   * (`InvalidTokenError`), creates the account (`newAccount`; an e-mail that got an account meanwhile is `ValidationError account_exists`) or checks
   * that the existing user owns the invited e-mail (`ValidationError wrong_account`), creates the membership (`AlreadyMemberError` when one exists,
   * active or deactivated) and writes `invite_accepted`. Any failure leaves the token unused and nothing created.
   */
  accept(input: AcceptInvitation): Promise<AcceptedInvitation>;
}
