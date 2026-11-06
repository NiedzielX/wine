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

const managesTeam = (m: { role: Role; status: MembershipStatus } | null): boolean => !!m && m.status === 'active' && can(m.role, 'team.manage');

/**
 * Whether an invitation may still be used: the same rules as when it was made, applied to the rows as they are now.
 *  - a member's invitation (`platform` false): the inviter must STILL be an active member with `team.manage` who may invite this role. A
 *    deactivated inviter, a demoted one, or one whose membership row is gone takes their pending invitations with them;
 *  - a platform invitation (`inviteOwner`, `platform` true, marked on the row, never inferred from a missing membership): the same rule as at
 *    creation (`assertPlatformMayInvite`): the role is `owner`, the restaurant has NO active owner now, and the platform account has not
 *    become an active team manager of the restaurant (then it would use the normal path). So once an owner exists, every other owner
 *    invitation of the platform is dead, and a platform account that is also a member is judged the same at both moments.
 */
export function invitationStillValid(invitation: { platform: boolean; role: Role }, inviter: { role: Role; status: MembershipStatus } | null, activeOwners: number): boolean {
  if (invitation.platform) return invitation.role === 'owner' && activeOwners === 0 && !managesTeam(inviter);
  return inviter !== null && managesTeam(inviter) && invitableRoles(inviter).includes(invitation.role);
}
