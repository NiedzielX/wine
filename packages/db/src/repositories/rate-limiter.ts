import type { EntityManager } from '@mikro-orm/postgresql';
import {
  DEFAULT_RATE_LIMIT_MAX_CLIENTS, RATE_LIMIT_CLIENT_COUNT_KEY, RATE_LIMIT_OVERFLOW_KEY, decide, windowStartMs, type Logger, type RateLimitDecision, type RateLimitRule,
  type RateLimiter
} from '@wine-match/core';

/** Ended windows of a rule are deleted at most this often per process (a hit costs one or two statements almost always). */
export const CLEANUP_EVERY_MS = 60_000;
/** After a failed clean-up, the next try comes this soon (not after the full interval). */
export const CLEANUP_RETRY_MS = 10_000;

interface Deps {
  em: EntityManager;
  /** RATE_LIMIT_MAX_CLIENTS (the container passes it); distinct clients per rule and window with their own row */
  rateLimitMaxClients?: number;
  logger?: Pick<Logger, 'warn'>;
}

/** When each rule may be cleaned up next, per process (shared by every request scope). Rule names are our own constants. */
const nextCleanup = new Map<string, number>();
/** For tests: forget the clean-up schedule. */
export function resetRateLimiterCleanup(): void {
  nextCleanup.clear();
}

/**
 * Fixed-window counters in `rate_limit_bucket`, shared by every instance on the database (spec E21 F3, R7). Outside any
 * transaction of the request; the decision is `decide()` from core, as in memory. No `restaurantId`: the key is a hashed client,
 * not tenant data (deliberate exception, `packages/db/AGENTS.md`).
 *
 * The table is BOUNDED (review of PR #148), whatever the number of addresses an attacker holds:
 *  - a known client of the window: one `update … returning count`;
 *  - a new client: the window's client count (`~clients` row) goes up first; past `rateLimitMaxClients` the hit counts on the one
 *    `~overflow` row of the rule instead (degraded mode, same limit, `degraded: true` so the guard can log it);
 *  - rows of ended windows of a rule are deleted at most once a minute per process, so a row lives about one window, not days.
 * So a rule holds at most `rateLimitMaxClients + 2` rows per live window. Concurrent first hits of one client are still counted
 * together (`insert … on conflict do update`), but each of N parallel FIRST hits of one client raises `~clients` (by at most N, tested):
 * one source can inflate the count by its parallelism, so the ceiling can trip with far fewer distinct addresses than
 * `rateLimitMaxClients`; new legitimate clients then share `~overflow` until the window ends. Leniency is never the result.
 * The unidentified variant of a rule (half limit) shares the rule's `~overflow` row with the identified one; each compares the
 * shared count with its own limit, so in degraded mode who is refused first depends on arrival order.
 * A failing clean-up is logged and retried sooner; it never changes the decision of the hit that was already counted.
 */
export class PgRateLimiter implements RateLimiter {
  private readonly em: EntityManager;
  private readonly maxClients: number;
  private readonly logger?: Pick<Logger, 'warn'>;
  constructor({ em, rateLimitMaxClients, logger }: Deps) {
    this.em = em;
    this.maxClients = rateLimitMaxClients ?? DEFAULT_RATE_LIMIT_MAX_CLIENTS;
    this.logger = logger;
  }

  async hit(rule: RateLimitRule, key: string, now: Date): Promise<RateLimitDecision> {
    const start = windowStartMs(rule, now);
    const windowStart = new Date(start);
    const known = await this.em.execute<Array<{ count: number }>>(
      'update rate_limit_bucket set count = count + 1 where key = ? and rule = ? and window_start = ? returning count',
      [key, rule.name, windowStart]
    );
    let count: number;
    let degraded = false;
    if (known.length > 0) {
      count = Number(known[0].count);
    } else {
      const clients = await this.upsert(RATE_LIMIT_CLIENT_COUNT_KEY, rule, windowStart);
      degraded = clients > this.maxClients;
      count = await this.upsert(degraded ? RATE_LIMIT_OVERFLOW_KEY : key, rule, windowStart);
    }
    await this.cleanUp(rule, windowStart, now);
    return decide(rule, count, start, now, degraded);
  }

  private async upsert(key: string, rule: RateLimitRule, windowStart: Date): Promise<number> {
    const rows = await this.em.execute<Array<{ count: number }>>(
      `insert into rate_limit_bucket (key, rule, window_start, count) values (?, ?, ?, 1)
       on conflict (key, rule, window_start) do update set count = rate_limit_bucket.count + 1
       returning count`,
      [key, rule.name, windowStart]
    );
    // no row back cannot happen with `returning`; if it did, refuse rather than allow (the hit is not known to be counted)
    return Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);
  }

  /** Deletes the rule's rows of ended windows. Never throws: the hit has already been counted and decided. */
  private async cleanUp(rule: RateLimitRule, windowStart: Date, now: Date): Promise<void> {
    if (now.getTime() < (nextCleanup.get(rule.name) ?? Number.NEGATIVE_INFINITY)) return;
    // set before the statement, so concurrent hits of this process do not all start a clean-up
    nextCleanup.set(rule.name, now.getTime() + CLEANUP_RETRY_MS);
    try {
      await this.em.execute('delete from rate_limit_bucket where rule = ? and window_start < ?', [rule.name, windowStart]);
      nextCleanup.set(rule.name, now.getTime() + CLEANUP_EVERY_MS);
    } catch (error) {
      this.logger?.warn('rate limit clean-up failed', { rule: rule.name, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
