import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  AlreadyMemberError, ForbiddenError, InvalidTokenError, InvariantError, NotFoundError, ValidationError, assertInvitationEvent, assertMayInvite, assertPlatformMayInvite, assertValidAuthEvent, invitationStillValid,
  type AcceptInvitation, type AcceptedInvitation, type AuthEvent, type CreateInvitation, type Invitation, type InvitationPreview, type InvitationRepository, type MembershipStatus, type RevokeInvitation, type Role
} from '@wine-match/core';
import { isUuid } from './ids';
import { insertAuthEvent } from './team';

interface Deps { em: EntityManager }

interface InvitationRow { id: string; restaurant_id: string; email: string; role: Role; created_by: string; created_by_name: string | null; created_at: Date; expires_at: Date }
interface MemberRow { role: Role; status: MembershipStatus }

const iso = (d: Date | string): string => new Date(d).toISOString();

const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id, restaurantId: r.restaurant_id, email: r.email, role: r.role, createdBy: r.created_by, createdByName: r.created_by_name, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at)
});

const SELECT = `select t.id, t.restaurant_id, t.email, t.role, t.created_by, u.name as created_by_name, t.created_at, t.expires_at
  from auth_token t left join app_user u on u.id = t.created_by`;

/**
 * Invitations in PostgreSQL (spec E12 F2, R4): `auth_token` rows of kind `invite`. Every statement that works on one
 * restaurant's invitations carries its id; an id that is not a UUID is "not there", never a driver error (lesson
 * url-ids-vs-uuid-columns). The link's token is only ever compared as its SHA-256 through the unique index. Inside a
 * transaction every raw statement goes through `em.execute` (lesson pg-execute-inside-transaction).
 */
export class PgInvitationRepository implements InvitationRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async listPending(restaurantId: string) {
    if (!isUuid(restaurantId)) return [];
    const rows = await this.em.getConnection().execute<InvitationRow[]>(
      `${SELECT} where t.kind = 'invite' and t.restaurant_id = ? and t.used_at is null and t.revoked_at is null order by t.created_at, t.id`, [restaurantId]
    );
    return rows.map(toInvitation);
  }

  /**
   * One transaction. The inviter's membership is locked `for share`: a deactivation of that person (which takes the row
   * `for update`, spec Q-F1 (4)) either commits first and is seen here, or waits until this transaction commits. The earlier
   * pending invitations of the same e-mail are revoked by one `update … returning`; if the inviter could not have revoked one of
   * them the whole transaction is rolled back.
   */
  async create(restaurantId: string, input: CreateInvitation) {
    const { invitation: n, platform, event } = input;
    if (!isUuid(restaurantId)) throw new NotFoundError('Restaurant');
    try {
      return await this.em.transactional(async (em) => {
        if ((await em.execute<unknown[]>(`select 1 from restaurant where id = ?`, [restaurantId])).length === 0) throw new NotFoundError('Restaurant');
        const actor = (await em.execute<MemberRow[]>(`select role, status from membership where restaurant_id = ? and user_id = ? for share`, [restaurantId, n.createdBy]))[0] ?? null;
        if (platform) {
          const owners = (await em.execute<Array<{ n: string }>>(`select count(*)::text as n from membership where restaurant_id = ? and role = 'owner' and status = 'active'`, [restaurantId]))[0];
          assertPlatformMayInvite(actor, Number(owners.n), n.role);
        } else {
          if (!actor) throw new ForbiddenError();
          assertMayInvite(actor, n.role);
        }
        if ((await em.execute<unknown[]>(`select 1 from membership m join app_user u on u.id = m.user_id where m.restaurant_id = ? and lower(u.email) = ?`, [restaurantId, n.email])).length > 0) throw new AlreadyMemberError();
        const replaced = await em.execute<Array<{ role: Role; expires_at: Date }>>(
          `update auth_token set revoked_at = ?::timestamptz where kind = 'invite' and restaurant_id = ? and email = ? and used_at is null and revoked_at is null returning role, expires_at`,
          [new Date(n.createdAt), restaurantId, n.email]
        );
        // an expired invitation is no obstacle: it is replaced whatever its role (only a live one the inviter could not have made refuses them)
        if (!platform) for (const r of replaced) if (new Date(r.expires_at).getTime() > new Date(n.createdAt).getTime()) assertMayInvite(actor!, r.role);
        assertInvitationEvent(restaurantId, event, 'invite_created', n.createdBy, n.id);
        await em.execute(
          `insert into auth_token (id, kind, token_hash, restaurant_id, email, role, user_id, platform, created_by, created_at, expires_at) values (?, 'invite', ?, ?, ?, ?, null, ?, ?, ?::timestamptz, ?::timestamptz)`,
          [n.id, n.tokenHash, restaurantId, n.email, n.role, platform, n.createdBy, new Date(n.createdAt), new Date(n.expiresAt)]
        );
        await insertAuthEvent(em, event);
        return toInvitation((await em.execute<InvitationRow[]>(`${SELECT} where t.id = ?`, [n.id]))[0]);
      });
    } catch (err) {
      // two invitations for one e-mail at the same moment: the second finds the first one's row only when it commits
      if (err instanceof UniqueConstraintViolationException) throw new InvariantError('invitation_conflict', 'Another invitation for this e-mail address was created at the same moment. Try again.');
      throw err;
    } finally {
      this.em.clear();
    }
  }

  async revoke(restaurantId: string, invitationId: string, input: RevokeInvitation) {
    if (!isUuid(restaurantId) || !isUuid(invitationId)) throw new NotFoundError('Invitation');
    try {
      await this.em.transactional(async (em) => {
        const row = (await em.execute<Array<{ id: string; role: Role }>>(
          `select id, role from auth_token where id = ? and restaurant_id = ? and kind = 'invite' and used_at is null and revoked_at is null for update`, [invitationId, restaurantId]
        ))[0];
        if (!row) throw new NotFoundError('Invitation');
        const actor = (await em.execute<MemberRow[]>(`select role, status from membership where restaurant_id = ? and user_id = ? for share`, [restaurantId, input.actorUserId]))[0];
        if (!actor) throw new ForbiddenError();
        assertMayInvite(actor, row.role);
        assertInvitationEvent(restaurantId, input.event, 'invite_revoked', input.actorUserId, row.id);
        await em.execute(`update auth_token set revoked_at = ?::timestamptz where id = ?`, [new Date(input.at), row.id]);
        await insertAuthEvent(em, input.event);
      });
    } finally {
      this.em.clear();
    }
  }

  async findUsable(tokenHash: string, now: string): Promise<InvitationPreview | null> {
    const row = (await this.em.getConnection().execute<Array<{ id: string; restaurant_id: string; slug: string; name: string; email: string; role: Role; platform: boolean; created_by: string; expires_at: Date }>>(
      `select t.id, t.restaurant_id, r.slug, r.name, t.email, t.role, t.platform, t.created_by, t.expires_at
         from auth_token t join restaurant r on r.id = t.restaurant_id
        where t.token_hash = ? and t.kind = 'invite' and t.used_at is null and t.revoked_at is null and t.expires_at > ?::timestamptz`,
      [tokenHash, new Date(now)]
    ))[0];
    if (!row) return null;
    const inviter = (await this.em.getConnection().execute<MemberRow[]>(`select role, status from membership where restaurant_id = ? and user_id = ?`, [row.restaurant_id, row.created_by]))[0] ?? null;
    const owners = (await this.em.getConnection().execute<Array<{ n: string }>>(`select count(*)::text as n from membership where restaurant_id = ? and role = 'owner' and status = 'active'`, [row.restaurant_id]))[0];
    if (!invitationStillValid(row, inviter, Number(owners.n))) return null;
    return { id: row.id, restaurantId: row.restaurant_id, restaurantSlug: row.slug, restaurantName: row.name, email: row.email, role: row.role, expiresAt: iso(row.expires_at) };
  }

  /**
   * One transaction. The token is consumed first by a single `update … returning`: a second accept of the same link waits for the
   * first one's row lock, and then finds nothing to update (`InvalidTokenError`), so one link gives one account and one membership.
   * Any later failure rolls the consumption back with everything else.
   */
  async accept(input: AcceptInvitation): Promise<AcceptedInvitation> {
    if ((input.newAccount === null) === (input.existingUserId === null)) throw new InvariantError('invalid_accept', 'Give either a new account or an existing user.');
    if (input.existingUserId !== null && !isUuid(input.existingUserId)) throw new ValidationError('wrong_account', 'This invitation is for another account. Sign out and open the link again.');
    try {
      return await this.em.transactional(async (em) => {
        const used = (await em.execute<Array<{ id: string; restaurant_id: string; email: string; role: Role; platform: boolean; created_by: string }>>(
          `update auth_token set used_at = ?::timestamptz
            where token_hash = ? and kind = 'invite' and used_at is null and revoked_at is null and expires_at > ?::timestamptz
            returning id, restaurant_id, email, role, platform, created_by`,
          [new Date(input.now), input.tokenHash, new Date(input.now)]
        ))[0];
        if (!used) throw new InvalidTokenError();
        const inviter = (await em.execute<MemberRow[]>(`select role, status from membership where restaurant_id = ? and user_id = ? for share`, [used.restaurant_id, used.created_by]))[0] ?? null;
        // a platform invitation is judged by the platform rule NOW: the restaurant row is locked so two platform links cannot both make "the first owner"
        let owners = 0;
        if (used.platform) {
          await em.execute(`select id from restaurant where id = ? for update`, [used.restaurant_id]);
          owners = (await em.execute<unknown[]>(`select id from membership where restaurant_id = ? and role = 'owner' and status = 'active' for share`, [used.restaurant_id])).length;
        }
        if (!invitationStillValid(used, inviter, owners)) throw new InvalidTokenError();
        const restaurant = (await em.execute<Array<{ slug: string }>>(`select slug from restaurant where id = ?`, [used.restaurant_id]))[0];
        let userId: string;
        if (input.newAccount) {
          userId = input.newAccount.userId;
          // the unique index is case-sensitive: an account stored in mixed case before addresses were normalised would be duplicated
          if ((await em.execute<unknown[]>(`select 1 from app_user where lower(email) = ?`, [used.email])).length > 0) throw new ValidationError('account_exists', 'An account with this e-mail address already exists. Sign in to it first.');
          try {
            await em.execute(
              `insert into app_user (id, email, name, password_hash, created_at) values (?, ?, ?, ?, ?::timestamptz)`,
              [userId, used.email, input.newAccount.name, input.newAccount.passwordHash, new Date(input.now)]
            );
          } catch (err) {
            if (err instanceof UniqueConstraintViolationException) throw new ValidationError('account_exists', 'An account with this e-mail address already exists. Sign in to it first.');
            throw err;
          }
        } else {
          const user = (await em.execute<Array<{ id: string; email: string }>>(`select id, email from app_user where id = ?`, [input.existingUserId]))[0];
          if (!user || user.email.toLowerCase() !== used.email) throw new ValidationError('wrong_account', 'This invitation is for another account. Sign out and open the link again.');
          userId = user.id;
        }
        try {
          await em.execute(
            `insert into membership (id, user_id, restaurant_id, role, created_at) values (?, ?, ?, ?, ?::timestamptz)`,
            [input.membershipId, userId, used.restaurant_id, used.role, new Date(input.now)]
          );
        } catch (err) {
          if (err instanceof UniqueConstraintViolationException) throw new AlreadyMemberError();
          throw err;
        }
        const event: AuthEvent = {
          id: input.eventId, restaurantId: used.restaurant_id, actorUserId: userId, subjectUserId: userId, type: 'invite_accepted',
          meta: { role: used.role, invitation_id: used.id, membership_id: input.membershipId }, at: input.now
        };
        assertValidAuthEvent(used.restaurant_id, event);
        await insertAuthEvent(em, event);
        return { restaurantId: used.restaurant_id, restaurantSlug: restaurant.slug, userId, email: used.email, role: used.role };
      });
    } finally {
      this.em.clear();
    }
  }
}
