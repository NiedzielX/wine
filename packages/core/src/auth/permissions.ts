import { ForbiddenError } from '../errors';
import type { Membership, Principal, Role } from './types';

/**
 * What each role may do in a restaurant (docs/USER_ROLES.md). One table, one function:
 * the dashboard, the server actions and the API all ask `can()`.
 * The Wine Director decides pairings; the owner / general manager runs the business but does not
 * decide pairings, so "Sommelier’s pairing" always means a sommelier's decision.
 */
export type Permission = 'panel.view' | 'pairings.decide' | 'wines.toggle' | 'publish' | 'settings.change' | 'import.manage' | 'restaurant.edit';

const BUSINESS: Permission[] = ['panel.view', 'wines.toggle', 'publish', 'settings.change', 'import.manage', 'restaurant.edit'];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: BUSINESS,
  manager: BUSINESS,
  // the sommelier imports and publishes but does not edit the restaurant's own details (docs/USER_ROLES.md)
  sommelier: ['panel.view', 'pairings.decide', 'wines.toggle', 'publish', 'settings.change', 'import.manage'],
  // waiters use the public staff lookup and have no dashboard login in the MVP
  waiter: []
};

export const can = (role: Role, permission: Permission): boolean => MATRIX[role].includes(permission);

export const roleLabel = (role: Role): string =>
  ({ owner: 'Owner', manager: 'General Manager', sommelier: 'Wine Director', waiter: 'Waiter' })[role];

/** The caller's membership in this restaurant, or null when they have none. */
export function membershipFor(principal: Principal, slug: string): Membership | null {
  return principal.memberships.find((m) => m.restaurantSlug === slug) ?? null;
}

/** Throws ForbiddenError unless the caller's role in the restaurant has the permission. Returns the membership. */
export function authorize(principal: Principal, slug: string, permission: Permission): Membership {
  const m = membershipFor(principal, slug);
  if (!m || !can(m.role, permission)) throw new ForbiddenError();
  return m;
}
