import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { AUTH_EVENT_TYPES, MEMBERSHIP_STATUSES, ROLES, type AuthEventMeta } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/** A person who can sign in to the dashboard. (`app_user`: "user" is reserved in PostgreSQL.) */
export const UserEntity = defineEntity({
  name: 'User',
  tableName: 'app_user',
  properties: {
    id: p.uuid().primary(),
    /** lower-case; the application normalises before every lookup */
    email: p.string().unique(),
    name: p.string(),
    passwordHash: p.text(),
    failedAttempts: p.integer().default(0),
    lockedUntil: p.datetime().nullable(),
    lastLoginAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date())
  }
});

/** What a user may do in one restaurant. */
export const MembershipEntity = defineEntity({
  name: 'Membership',
  tableName: 'membership',
  properties: {
    id: p.uuid().primary(),
    user: () => p.manyToOne(UserEntity).deleteRule('cascade'),
    restaurant: () => p.manyToOne(RestaurantEntity),
    role: p.enum(['owner', 'manager', 'sommelier', 'waiter'] as const),
    /** a deactivated person keeps the row (the audit trail points at it) but loses all access at the next request (spec E12 R2) */
    status: p.enum([...MEMBERSHIP_STATUSES] as const).default('active'),
    /** for `expectedVersion`: every change of role or status raises it by one (written by `PgTeamRepository`, not by the ORM) */
    version: p.integer().default(1),
    deactivatedAt: p.datetime().nullable(),
    /** the user who deactivated this person; a plain column, like `sommelier_decision.actor_id` */
    deactivatedBy: p.uuid().nullable(),
    createdAt: p.datetime().onCreate(() => new Date())
  },
  uniques: [{ properties: ['user', 'restaurant'] }]
});

/**
 * The authentication trail (spec E12 R11). `actor_user_id` and `subject_user_id` are plain columns, not foreign keys:
 * the trail outlives the account. `restaurant_id` is null for an event that belongs to no restaurant (a sign-in).
 * `type` is checked against the full list from the start, so later phases need no migration for a new event type.
 */
export const AuthEventEntity = defineEntity({
  name: 'AuthEvent',
  tableName: 'auth_event',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity).nullable(),
    actorUserId: p.uuid().nullable(),
    subjectUserId: p.uuid().nullable(),
    type: p.enum([...AUTH_EVENT_TYPES] as const),
    /** only the keys of `AUTH_EVENT_META_KEYS`: never a password, a PIN, a token or a stranger's full e-mail */
    meta: p.json<AuthEventMeta>().defaultRaw(`'{}'`),
    at: p.datetime()
  },
  indexes: [{ properties: ['restaurant', 'at'] }]
});

/**
 * A one-time link (spec E12 F2): an invitation to a restaurant's team (`kind = 'invite'`), later a password reset (`'reset'`, F4).
 * Only the SHA-256 of the token is stored. A link is used at most once (`used_at`), can be revoked (`revoked_at`) and expires
 * (`expires_at`); the partial unique index keeps one pending invitation per restaurant and e-mail. `created_by` is a plain
 * column like the audit trail's user ids: the row outlives nothing it needs a key for.
 */
export const AuthTokenEntity = defineEntity({
  name: 'AuthToken',
  tableName: 'auth_token',
  properties: {
    id: p.uuid().primary(),
    kind: p.enum(['invite', 'reset'] as const),
    tokenHash: p.string().length(64).unique(),
    restaurant: () => p.manyToOne(RestaurantEntity).nullable().deleteRule('cascade'),
    /** lower-case, trimmed */
    email: p.string().length(254),
    role: p.enum([...ROLES] as const).nullable(),
    user: () => p.manyToOne(UserEntity).nullable().deleteRule('cascade'),
    /** made by `InvitationService.inviteOwner` (E14): judged by the platform rule at every use, never inferred from a missing membership */
    platform: p.boolean().default(false),
    createdBy: p.uuid(),
    createdAt: p.datetime(),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable(),
    revokedAt: p.datetime().nullable()
  },
  indexes: [
    { properties: ['restaurant', 'kind'] },
    {
      // a second pending invitation for the same e-mail and restaurant cannot exist: the new one revokes the old one in the same transaction
      name: 'auth_token_pending_invite_unique',
      expression: `create unique index auth_token_pending_invite_unique on auth_token (restaurant_id, email) where kind = 'invite' and used_at is null and revoked_at is null`
    }
  ],
  checks: [{ name: 'auth_token_invite_shape_check', expression: `kind <> 'invite' or (restaurant_id is not null and role is not null and role <> 'waiter')` }]
});

/** Only the SHA-256 of the session token is stored: a leaked database cannot be replayed. */
export const SessionEntity = defineEntity({
  name: 'Session',
  tableName: 'session',
  properties: {
    id: p.uuid().primary(),
    user: () => p.manyToOne(UserEntity).deleteRule('cascade'),
    tokenHash: p.string().length(64).unique(),
    csrfToken: p.string().length(64),
    createdAt: p.datetime(),
    expiresAt: p.datetime()
  },
  indexes: [{ properties: ['expiresAt'] }]
});

export type UserRow = InferEntity<typeof UserEntity>;
export type MembershipRow = InferEntity<typeof MembershipEntity>;
export type AuthEventRow = InferEntity<typeof AuthEventEntity>;
export type AuthTokenRow = InferEntity<typeof AuthTokenEntity>;
export type SessionRow = InferEntity<typeof SessionEntity>;
