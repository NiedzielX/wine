import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  InvariantError, NotFoundError, VersionConflictError, assertKeepsAnOwner,
  type AuthAuditRepository, type AuthEvent, type AuthEventFilter, type AuthEventMeta, type AuthEventType, type MembershipStatus, type Role, type TeamChange, type TeamMember, type TeamRepository
} from '@wine-match/core';
import { isUuid } from './ids';

interface Deps { em: EntityManager }

interface MemberRow {
  membership_id: string; user_id: string; name: string; email: string; role: Role; status: MembershipStatus; version: number;
  last_login_at: Date | null; created_at: Date; deactivated_at: Date | null; deactivated_by: string | null;
}

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

const toMember = (r: MemberRow): TeamMember => ({
  membershipId: r.membership_id, userId: r.user_id, name: r.name, email: r.email, role: r.role, status: r.status, version: Number(r.version),
  lastLoginAt: iso(r.last_login_at), createdAt: iso(r.created_at)!, deactivatedAt: iso(r.deactivated_at), deactivatedBy: r.deactivated_by
});

const MEMBER_SELECT = `select m.id as membership_id, m.user_id, u.name, u.email, m.role, m.status, m.version, u.last_login_at, m.created_at, m.deactivated_at, m.deactivated_by
  from membership m join app_user u on u.id = m.user_id`;

/** A duplicate event id is a domain error, whatever the table's other constraints are. */
async function insertAuthEvent(em: EntityManager, e: AuthEvent): Promise<void> {
  try {
    await em.execute(
      `insert into auth_event (id, restaurant_id, actor_user_id, subject_user_id, type, meta, at) values (?, ?, ?, ?, ?, ?::jsonb, ?::timestamptz)`,
      [e.id, e.restaurantId, e.actorUserId, e.subjectUserId, e.type, JSON.stringify(e.meta), new Date(e.at)]
    );
  } catch (err) {
    if (err instanceof UniqueConstraintViolationException) throw new InvariantError('duplicate_event', 'The audit event already exists.');
    throw err;
  }
}

/**
 * The team of one restaurant in PostgreSQL (spec E12 F1, R3). Every query carries the restaurant id; an id that is
 * not a UUID is "not there", never a driver error (lesson url-ids-vs-uuid-columns).
 */
export class PgTeamRepository implements TeamRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async list(restaurantId: string) {
    if (!isUuid(restaurantId)) return [];
    const rows = await this.em.getConnection().execute<MemberRow[]>(`${MEMBER_SELECT} where m.restaurant_id = ? order by m.created_at, m.id`, [restaurantId]);
    return rows.map(toMember);
  }

  async find(restaurantId: string, membershipId: string) {
    if (!isUuid(restaurantId) || !isUuid(membershipId)) return null;
    return this.one(this.em, `${MEMBER_SELECT} where m.restaurant_id = ? and m.id = ?`, [restaurantId, membershipId]);
  }

  async findByUser(restaurantId: string, userId: string) {
    if (!isUuid(restaurantId) || !isUuid(userId)) return null;
    return this.one(this.em, `${MEMBER_SELECT} where m.restaurant_id = ? and m.user_id = ?`, [restaurantId, userId]);
  }

  /**
   * One transaction. It first locks the restaurant's owner memberships and the target in one statement ordered by id
   * (two changes always take the locks in the same order, so they wait for each other instead of deadlocking), then
   * reads the locked rows: the version, and how many OTHER active owners there are. Two owners demoting each other at
   * the same moment run one after the other, and the second finds no other owner (`last_owner`). The audit event is
   * inserted in the same transaction: when it cannot be written, nothing changes.
   */
  async applyChange(restaurantId: string, membershipId: string, change: TeamChange) {
    if (!isUuid(restaurantId) || !isUuid(membershipId)) throw new NotFoundError('Team member');
    try {
      return await this.em.transactional(async (em) => {
        const locked = await em.execute<Array<{ id: string; role: Role; status: MembershipStatus; version: number }>>(
          `select id, role, status, version from membership where restaurant_id = ? and (role = 'owner' or id = ?) order by id for update`,
          [restaurantId, membershipId]
        );
        const target = locked.find((r) => r.id === membershipId);
        if (!target) throw new NotFoundError('Team member');
        if (Number(target.version) !== change.expectedVersion) throw new VersionConflictError();
        const role = change.set.role ?? target.role;
        const status = change.set.status ?? target.status;
        const otherOwners = locked.filter((r) => r.id !== membershipId && r.role === 'owner' && r.status === 'active').length;
        assertKeepsAnOwner(target, { role, status }, otherOwners);

        await insertAuthEvent(em, change.event);
        const statusChanges = status !== target.status;
        await em.execute(
          `update membership set role = ?, status = ?, version = version + 1,
             deactivated_at = case when ? then ?::timestamptz when ? then null else deactivated_at end,
             deactivated_by = case when ? then ?::uuid when ? then null else deactivated_by end
           where id = ? and restaurant_id = ?`,
          [role, status, statusChanges && status === 'deactivated', new Date(change.at), statusChanges && status === 'active',
            statusChanges && status === 'deactivated', change.actorUserId, statusChanges && status === 'active', membershipId, restaurantId]
        );
        return (await this.one(em, `${MEMBER_SELECT} where m.restaurant_id = ? and m.id = ?`, [restaurantId, membershipId]))!;
      });
    } finally {
      this.em.clear();
    }
  }

  private async one(em: EntityManager, sql: string, params: unknown[]): Promise<TeamMember | null> {
    const rows = await em.execute<MemberRow[]>(sql, params);
    return rows[0] ? toMember(rows[0]) : null;
  }
}

interface EventRow { id: string; restaurant_id: string | null; actor_user_id: string | null; subject_user_id: string | null; type: AuthEventType; meta: AuthEventMeta; at: Date }

/** The authentication trail in PostgreSQL. Reads are scoped to one restaurant. */
export class PgAuthAuditRepository implements AuthAuditRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async record(event: AuthEvent) {
    await insertAuthEvent(this.em, event);
  }

  async list(restaurantId: string, filter: AuthEventFilter = {}) {
    if (!isUuid(restaurantId)) return [];
    const where = ['restaurant_id = ?'];
    const params: unknown[] = [restaurantId];
    if (filter.type) { where.push('type = ?'); params.push(filter.type); }
    if (filter.subjectUserId) {
      if (!isUuid(filter.subjectUserId)) return [];
      where.push('subject_user_id = ?'); params.push(filter.subjectUserId);
    }
    if (filter.before) { where.push('at < ?::timestamptz'); params.push(new Date(filter.before)); }
    params.push(filter.limit ?? 100);
    const rows = await this.em.getConnection().execute<EventRow[]>(
      `select id, restaurant_id, actor_user_id, subject_user_id, type, meta, at from auth_event where ${where.join(' and ')} order by at desc, id desc limit ?`, params
    );
    return rows.map((r): AuthEvent => ({
      id: r.id, restaurantId: r.restaurant_id, actorUserId: r.actor_user_id, subjectUserId: r.subject_user_id, type: r.type, meta: r.meta, at: new Date(r.at).toISOString()
    }));
  }
}
