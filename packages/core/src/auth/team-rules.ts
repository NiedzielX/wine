import { LastOwnerError, SelfChangeError, TeamHierarchyError, ValidationError } from '../errors';
import type { MembershipStatus, Role, TeamMember } from './types';

/**
 * Who may change whom (spec E12 Q7). The permission matrix says who may manage the team at all (`team.manage`);
 * these pure functions are the hierarchy on top of it. They throw the domain error, or return when the change is allowed.
 *
 *  - nobody changes their own role or deactivates themselves;
 *  - only an owner touches an owner, and only an owner grants `owner` or `manager`;
 *  - the last active owner is protected by the repository, atomically (a check here would race).
 */

/** Roles a manager may grant: the ones below their own. */
const MANAGER_GRANTS: readonly Role[] = ['sommelier', 'waiter'];

function mayTouch(actor: TeamMember, target: TeamMember): boolean {
  return actor.role === 'owner' || target.role !== 'owner';
}

export function assertMayChangeRole(actor: TeamMember, target: TeamMember, role: Role): void {
  if (actor.userId === target.userId) throw new SelfChangeError();
  if (!mayTouch(actor, target)) throw new TeamHierarchyError();
  if (actor.role !== 'owner' && !MANAGER_GRANTS.includes(role)) throw new TeamHierarchyError();
  if (target.status !== 'active') throw new ValidationError('member_deactivated', 'Reactivate this person before changing their role.');
}

export function assertMayChangeStatus(actor: TeamMember, target: TeamMember, status: MembershipStatus): void {
  if (status === 'deactivated' && actor.userId === target.userId) throw new SelfChangeError();
  if (!mayTouch(actor, target)) throw new TeamHierarchyError();
}

/** Used by the in-memory repository and documented for the SQL one: the change leaves no active owner. */
export function leavesNoOwner(before: { role: Role; status: MembershipStatus }, after: { role: Role; status: MembershipStatus }, otherActiveOwners: number): boolean {
  const wasOwner = before.role === 'owner' && before.status === 'active';
  return wasOwner && !(after.role === 'owner' && after.status === 'active') && otherActiveOwners === 0;
}

export function assertKeepsAnOwner(before: { role: Role; status: MembershipStatus }, after: { role: Role; status: MembershipStatus }, otherActiveOwners: number): void {
  if (leavesNoOwner(before, after, otherActiveOwners)) throw new LastOwnerError();
}
