/** Time and identity come from outside, so core stays deterministic and testable. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  uuid(): string;
}

/**
 * Whether the data store answers (spec 2026-10-15-production-deployment, R3). Not a tenant repository: it reads no restaurant
 * data, so it is the one port without `restaurantId` and has no case in `repositoryContract`. `skipped` = there is no store to ask
 * (the in-memory demo data source); `unreachable` = no answer in time, for whatever reason (the reason is never part of the answer).
 */
export type DatabaseHealth = 'ok' | 'skipped' | 'unreachable';

export interface SystemHealth {
  database(): Promise<DatabaseHealth>;
}

/**
 * Counts one hit of `key` against `rule` in the window `now` falls in and says whether it is allowed (spec E21 F3, R7). The
 * decision itself is `decide()` from `ratelimit/rules.ts`, the same for every adapter. Infrastructure, not a tenant repository:
 * `key` is already a keyed hash of the client (never an IP, a slug or a session id), so there is no `restaurantId`. Contract:
 * `testing/rate-limiter-contract.ts`; adapters: `MemoryRateLimiter` (core) and `PgRateLimiter` (db).
 */
export interface RateLimiter {
  hit(rule: import('../ratelimit/rules').RateLimitRule, key: string, now: Date): Promise<import('../ratelimit/rules').RateLimitDecision>;
}
