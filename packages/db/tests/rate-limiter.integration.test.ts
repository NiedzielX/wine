import type { MikroORM } from '@mikro-orm/postgresql';
import { rateLimiterContract } from '@wine-match/core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PgRateLimiter, RATE_LIMIT_ROW_TTL_MS } from '../src/repositories/rate-limiter';
import { freshDatabase } from './support/pg';

/**
 * Spec E21 F3, AC5 on real PostgreSQL: the shared limiter contract (one fork, so one connection, per limiter), concurrent hits
 * over separate connections, and the clean-up of old counters. Every case uses its own keys.
 */
const baseUrl = inject('databaseUrl');

describe('PgRateLimiter on PostgreSQL', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_ratelimit_test'); }, 120_000);
  afterAll(async () => { await orm?.close(true); });

  rateLimiterContract('postgres', () => new PgRateLimiter({ em: orm.em.fork() }), { describe, it, expect });

  const rule = { name: 'code-mark' as const, limit: 5, windowSeconds: 600 };
  const now = new Date('2026-11-10T12:00:01.000Z');

  it('counts hits from ten separate connections together: exactly the limit is allowed, one row holds the total', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => new PgRateLimiter({ em: orm.em.fork() }).hit(rule, 'concurrent-key', now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const rows = await orm.em.fork().getConnection().execute<Array<{ count: number }>>(`select count from rate_limit_bucket where key = 'concurrent-key'`);
    expect(rows).toEqual([{ count: 10 }]);
  });

  it('deletes counters older than two days on a later hit, and keeps the young ones', async () => {
    const em = orm.em.fork();
    const old = new Date(now.getTime() - RATE_LIMIT_ROW_TTL_MS - 60_000);
    await em.getConnection().execute(`insert into rate_limit_bucket (key, rule, window_start, count) values ('old-key', 'login', ?, 3), ('young-key', 'login', ?, 3)`, [old, now]);
    // well after any earlier clean-up of this process (at most one per ten minutes)
    await new PgRateLimiter({ em }).hit(rule, 'trigger-key', new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const keys = (await em.getConnection().execute<Array<{ key: string }>>(`select key from rate_limit_bucket where key in ('old-key', 'young-key') order by key`)).map((r) => r.key);
    expect(keys).toEqual(['young-key']);
  });
});
