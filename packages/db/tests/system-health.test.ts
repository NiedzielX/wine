import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { PgSystemHealth } from '../src/repositories/system-health';

/** The part of PgSystemHealth that needs no database: what it makes of a connection that fails or never answers. */
const withExecute = (execute: () => Promise<unknown>) => ({ em: { getConnection: () => ({ execute }) } as unknown as EntityManager });

describe('PgSystemHealth without a database', () => {
  it('a query that works is ok', async () => {
    expect(await new PgSystemHealth(withExecute(async () => [{ '?column?': 1 }])).database()).toBe('ok');
  });

  it('a query that fails is unreachable, and the reason is not part of the answer', async () => {
    const answer = await new PgSystemHealth(withExecute(async () => { throw new Error('connect ECONNREFUSED db.example:5432 password=TopSecretPw9'); })).database();
    expect(answer).toBe('unreachable');
  });

  it('a query that never answers is unreachable after the time limit', async () => {
    const started = Date.now();
    const answer = await new PgSystemHealth(withExecute(() => new Promise(() => undefined)), 50).database();
    expect(answer).toBe('unreachable');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
