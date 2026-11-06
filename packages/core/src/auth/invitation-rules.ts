import { ForbiddenError, TeamHierarchyError, ValidationError } from '../errors';
import { can } from './permissions';
import { grantableRoles } from './team-rules';
import { INVITABLE_ROLES, type MembershipStatus, type Role } from './types';

/**
 * Who may invite whom (spec E12 R4, Q7). The roles an inviter may put in an invitation are the roles they may grant
 * (`grantableRoles`: an owner anyone, a manager the roles below manager) minus `waiter`, who has no link (R9).
 * Pure functions: the service runs them on the rows it read, the repositories again on the rows they locked.
 */

export const invitableRoles = (actor: { role: Role }): Role[] => grantableRoles(actor).filter((r) => INVITABLE_ROLES.includes(r));

/** The inviter is an active member with `team.manage` and may invite this role. */
export function assertMayInvite(actor: { role: Role; status: MembershipStatus }, role: Role): void {
  if (actor.status !== 'active' || !can(actor.role, 'team.manage')) throw new ForbiddenError();
  if (!invitableRoles(actor).includes(role)) throw new TeamHierarchyError();
}

/**
 * The platform path (E14's `inviteOwner`): only `owner`, only into a restaurant without an active owner, never by someone
 * who is already a member with `team.manage` there (they use the normal path).
 */
export function assertPlatformMayInvite(member: { role: Role; status: MembershipStatus } | null, activeOwners: number, role: Role): void {
  if (role !== 'owner') throw new ValidationError('invalid_role', 'The platform can only invite an owner.', { role: 'invalid' });
  if (member && member.status === 'active' && can(member.role, 'team.manage')) throw new ForbiddenError();
  if (activeOwners > 0) throw new ValidationError('restaurant_has_owner', 'This restaurant already has an active owner.');
}

/**
 * Whether the person who made an invitation may still stand behind it when the link is used. A deactivated inviter, or
 * one whose role changed so that they could no longer have invited this role, takes their pending invitations with them.
 * `null` (no membership in the restaurant at all) is the platform account of `inviteOwner`.
 */
export function inviterStillEntitled(inviter: { role: Role; status: MembershipStatus } | null, role: Role): boolean {
  if (inviter === null) return true;
  return inviter.status === 'active' && can(inviter.role, 'team.manage') && invitableRoles(inviter).includes(role);
}
