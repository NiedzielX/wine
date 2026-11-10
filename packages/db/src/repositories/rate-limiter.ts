import type { EntityManager } from '@mikro-orm/postgresql';
import { decide, windowStartMs, type RateLimitDecision, type RateLimitRule, type RateLimiter } from '@wine-match/core';

/** Counters older than this are deleted (spec E21 F3, Q6: "rows expire after two days"). */
export const RATE_LIMIT_ROW_TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** At most one clean-up per process in this time, so a hit costs one statement almost always. */
const CLEANUP_EVERY_MS = 10 * 60 * 1000;

interface Deps { em: EntityManager }

/** Last clean-up of this process (shared by every request scope). */
const state = { lastCleanup: Number.NEGATIVE_INFINITY };

/**
 * Fixed-window counters in `rate_limit_bucket`, shared by every instance on the database (spec E21 F3, R7). One atomic
 * `insert … on conflict do update … returning count`: concurrent hits from several connections are counted together, without
 * a read-then-write race. Outside any transaction of the request. The decision is `decide()` from core, as in memory.
 * No `restaurantId`: the key is a hashed client, not tenant data (deliberate exception, `packages/db/AGENTS.md`).
 */
export class PgRateLimiter implements RateLimiter {
  private readonly em: EntityManager;
  constructor({ em }: Deps) {
    this.em = em;
  }

  async hit(rule: RateLimitRule, key: string, now: Date): Promise<RateLimitDecision> {
    const windowStart = windowStartMs(rule, now);
    const rows = await this.em.execute<Array<{ count: number }>>(
      `insert into rate_limit_bucket (key, rule, window_start, count) values (?, ?, ?, 1)
       on conflict (key, rule, window_start) do update set count = rate_limit_bucket.count + 1
       returning count`,
      [key, rule.name, new Date(windowStart)]
    );
    const count = Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);
    await this.cleanUp(now);
    return decide(rule, count, windowStart, now);
  }

  private async cleanUp(now: Date): Promise<void> {
    if (now.getTime() - state.lastCleanup < CLEANUP_EVERY_MS) return;
    state.lastCleanup = now.getTime();
    await this.em.execute('delete from rate_limit_bucket where window_start < ?', [new Date(now.getTime() - RATE_LIMIT_ROW_TTL_MS)]);
  }
}
