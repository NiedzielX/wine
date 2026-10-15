import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
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
    createdAt: p.datetime().onCreate(() => new Date())
  },
  uniques: [{ properties: ['user', 'restaurant'] }]
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
export type SessionRow = InferEntity<typeof SessionEntity>;
