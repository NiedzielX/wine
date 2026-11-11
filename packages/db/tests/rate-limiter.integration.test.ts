import type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { rateLimiterContract } from '@wine-match/core';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { PgRateLimiter, resetRateLimiterCleanup } from '../src/repositories/rate-limiter';
import { freshDatabase } from './support/pg';

/**
 * Spec E21 F3, AC5 on real PostgreSQL: the shared limiter contract (one fork, so one connection, per limiter), concurrent hits
 * over separate connections, the clean-up of ended windows, and the storage bound of the review of PR #148 (a flood of new
 * clients cannot grow the table without limit; a failing clean-up never turns a counted hit into "allowed").
 */
const baseUrl = inject('databaseUrl');

describe('PgRateLimiter on PostgreSQL', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_ratelimit_test'); }, 120_000);
  afterAll(async () => { await orm?.close(true); });
  beforeEach(async () => {
    resetRateLimiterCleanup();
    await orm.em.getConnection().execute('truncate table rate_limit_bucket');
  });

  const limiter = (opts: { maxClients?: number; em?: EntityManager; warn?: (msg: string, fields?: Record<string, unknown>) => void } = {}) =>
    new PgRateLimiter({ em: opts.em ?? orm.em.fork(), rateLimitMaxClients: opts.maxClients, logger: opts.warn ? { warn: opts.warn } : undefined });
  const rows = async () => Number((await orm.em.fork().getConnection().execute<Array<{ n: string }>>('select count(*) as n from rate_limit_bucket'))[0].n);

  rateLimiterContract('postgres', (o) => limiter({ maxClients: o?.maxClientsPerWindow }), { describe, it, expect });

  const rule = { name: 'code-mark' as const, limit: 5, windowSeconds: 600 };
  const now = new Date('2026-11-10T12:00:01.000Z');

  it('counts hits from ten separate connections together: exactly the limit is allowed, one row holds the total', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter().hit(rule, 'concurrent-key', now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    const found = await orm.em.fork().getConnection().execute<Array<{ count: number }>>(`select count from rate_limit_bucket where key = 'concurrent-key'`);
    expect(found).toEqual([{ count: 10 }]);
  });

  it('a flood of distinct new clients stays bounded: at most the ceiling plus two bookkeeping rows, and the overflow still limits', async () => {
    const results = [];
    for (let i = 0; i < 300; i++) results.push(await limiter({ maxClients: 20 }).hit(rule, `flood-${i}`, now));
    expect(await rows()).toBeLessThanOrEqual(22);
    // the 280 clients past the ceiling share one counter: 5 allowed, the rest refused
    const overflow = results.slice(20);
    expect(overflow.every((r) => r.degraded === true)).toBe(true);
    expect(overflow.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.slice(0, 20).every((r) => r.allowed && r.degraded === undefined)).toBe(true);
  });

  it('deletes the counters of ended windows of the rule (rows live one window, not days), and keeps the current ones', async () => {
    await limiter().hit(rule, 'old-window', now);
    await limiter().hit({ ...rule, name: 'login' }, 'other-rule', now);
    resetRateLimiterCleanup();
    // the next window of the same rule: the old row is dead and goes; another rule's row is that rule's business
    await limiter().hit(rule, 'new-window', new Date(now.getTime() + 600_000));
    const keys = (await orm.em.fork().getConnection().execute<Array<{ key: string }>>(`select key from rate_limit_bucket where key not like '~%' order by key`)).map((r) => r.key);
    expect(keys).toEqual(['new-window', 'other-rule']);
  });

  it('a failing clean-up does not change the decision of the counted hit and is retried soon, not after the full interval', async () => {
    const real = orm.em.fork();
    let fail = true;
    const deletes = vi.fn();
    const em = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop !== 'execute') return Reflect.get(target, prop, receiver);
        return (sql: string, params: unknown[]) => {
          if (sql.startsWith('delete')) { deletes(); if (fail) return Promise.reject(new Error('delete timed out')); }
          return target.execute(sql, params);
        };
      }
    }) as EntityManager;
    const warn = vi.fn();
    for (let i = 0; i < 5; i++) expect((await limiter({ em, warn }).hit(rule, 'counted', now)).allowed).toBe(true);
    // the sixth hit is counted and refused even though its clean-up fails again (retry window passed)
    const sixth = await limiter({ em, warn }).hit(rule, 'counted', new Date(now.getTime() + 15_000));
    expect(sixth).toMatchObject({ allowed: false });
    expect(warn).toHaveBeenCalledWith('rate limit clean-up failed', { rule: 'code-mark', error: 'delete timed out' });
    expect(deletes).toHaveBeenCalledTimes(2);
    fail = false;
    await limiter({ em, warn }).hit(rule, 'counted', new Date(now.getTime() + 30_000));
    expect(deletes).toHaveBeenCalledTimes(3);
    // after a success the next clean-up waits the full interval
    await limiter({ em, warn }).hit(rule, 'counted', new Date(now.getTime() + 45_000));
    expect(deletes).toHaveBeenCalledTimes(3);
  });
});
