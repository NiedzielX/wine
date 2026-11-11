import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';

/**
 * One counter of the request limits (spec E21 F3, R7): hits of one client against one rule in one fixed window. Shared by every
 * instance on the same database. `key` is a keyed, daily-rotating hash of the client (32 hex characters), never an IP. No
 * `restaurant`: infrastructure without tenant data, like the health check (a deliberate exception, `packages/db/AGENTS.md`).
 * Rows of ended windows are deleted by `PgRateLimiter` itself; the keys `~clients` and `~overflow` are its bookkeeping of the
 * per-window client ceiling (never a hex digest, so never a client).
 */
export const RateLimitBucketEntity = defineEntity({
  name: 'RateLimitBucket',
  tableName: 'rate_limit_bucket',
  properties: {
    key: p.string().length(32).primary(),
    rule: p.string().length(30).primary(),
    windowStart: p.datetime().primary(),
    count: p.integer()
  },
  indexes: [{ properties: ['windowStart'] }]
});

export type RateLimitBucketRow = InferEntity<typeof RateLimitBucketEntity>;
