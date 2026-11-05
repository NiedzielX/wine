import { ForbiddenError, NotFoundError } from '../errors';
import type { AuthEvent, AuthEventMeta, AuthEventType, Actor, MembershipStatus, Role, TeamMember } from './types';
import type { Repositories } from '../ports/repositories';
import type { AuthEventFilter } from '../ports/team';
import type { Clock, IdGenerator } from '../ports/runtime';
import { parseWith } from '../validators/parse';
import { teamChangeSchema, type TeamChangeInput } from '../validators/team/team-change.schema';
import { can } from './permissions';
import { assertMayChangeRole, assertMayChangeStatus } from './team-rules';

export type TeamServiceDeps = Pick<Repositories, 'restaurantRepository' | 'teamRepository' | 'authAuditRepository'> & { clock: Clock; idGenerator: IdGenerator };

/**
 * The restaurant's team (spec E12 F1, R3): the list, a change of role, deactivation and reactivation. Every command
 * takes the actor and the version the caller read, re-checks `team.manage` against the stored membership (not the
 * session's copy), applies the hierarchy of `team-rules.ts` and writes its audit event in the same transaction.
 */
export class TeamService {
  constructor(private readonly d: TeamServiceDeps) {}

  /** Everyone in the restaurant's team, active or not. Needs `team.manage`. */
  async list(slug: string, actor: Actor): Promise<TeamMember[]> {
    const { restaurantId } = await this.caller(slug, actor);
    return this.d.teamRepository.list(restaurantId);
  }

  /** Needs `audit.view`. Newest first. */
  async events(slug: string, actor: Actor, filter: AuthEventFilter = {}): Promise<AuthEvent[]> {
    const { restaurantId } = await this.caller(slug, actor, 'audit.view');
    return this.d.authAuditRepository.list(restaurantId, filter);
  }

  /**
   * Changes the role and/or the status of one person. `NotFoundError` when the person is not in this restaurant,
   * `VersionConflictError` for a stale `expectedVersion`, `TeamHierarchyError`, `SelfChangeError`, `LastOwnerError`.
   * A change that changes nothing returns the member as it is, without a new version or an event.
   */
  async change(slug: string, membershipId: string, input: TeamChangeInput, actor: Actor, expectedVersion: number): Promise<TeamMember> {
    const parsed = parseWith(teamChangeSchema, input);
    const { restaurantId, me } = await this.caller(slug, actor);
    const target = await this.d.teamRepository.find(restaurantId, membershipId);
    if (!target) throw new NotFoundError('Team member');

    const role: Role = parsed.role ?? target.role;
    const status: MembershipStatus = parsed.status ?? target.status;
    const roleChanges = role !== target.role;
    const statusChanges = status !== target.status;
    if (roleChanges) assertMayChangeRole(me, target, role);
    if (statusChanges) assertMayChangeStatus(me, target, status);
    if (!roleChanges && !statusChanges) return target;

    const now = this.d.clock.now().toISOString();
    // one event per change; a request that changes both writes the more serious one (status), the role goes in its meta
    const type: AuthEventType = statusChanges ? (status === 'deactivated' ? 'member_deactivated' : 'member_reactivated') : 'role_changed';
    const meta: AuthEventMeta = { membership_id: target.membershipId };
    if (roleChanges) { meta.from = target.role; meta.to = role; }
    else meta.role = target.role;
    const event: AuthEvent = { id: this.d.idGenerator.uuid(), restaurantId, actorUserId: actor.id, subjectUserId: target.userId, type, meta, at: now };
    return this.d.teamRepository.applyChange(restaurantId, membershipId, {
      expectedVersion, set: { ...(roleChanges ? { role } : {}), ...(statusChanges ? { status } : {}) }, actorUserId: actor.id, at: now, event
    });
  }

  deactivate(slug: string, membershipId: string, actor: Actor, expectedVersion: number) {
    return this.change(slug, membershipId, { status: 'deactivated' }, actor, expectedVersion);
  }

  reactivate(slug: string, membershipId: string, actor: Actor, expectedVersion: number) {
    return this.change(slug, membershipId, { status: 'active' }, actor, expectedVersion);
  }

  changeRole(slug: string, membershipId: string, role: Role, actor: Actor, expectedVersion: number) {
    return this.change(slug, membershipId, { role }, actor, expectedVersion);
  }

  /** The restaurant and the actor's own, active membership with the permission, or Forbidden / NotFound. */
  private async caller(slug: string, actor: Actor, permission: 'team.manage' | 'audit.view' = 'team.manage'): Promise<{ restaurantId: string; me: TeamMember }> {
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    const me = await this.d.teamRepository.findByUser(restaurant.id, actor.id);
    if (!me || me.status !== 'active' || !can(me.role, permission)) throw new ForbiddenError();
    return { restaurantId: restaurant.id, me };
  }
}

