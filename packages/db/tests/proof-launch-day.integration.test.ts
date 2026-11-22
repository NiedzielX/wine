import type { MikroORM } from '@mikro-orm/postgresql';
import { buildDemoDataset } from '@wine-match/core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { freshDatabase, resetData } from './support/pg';

/**
 * The table of the launch day log refuses by itself what the repository refuses (spec 2026-11-18-owner-proof-report, R5):
 * a writer that bypasses the repository still cannot add a second entry without a reason, repeat a number or store an
 * over-long reason. The migration round trip (`migrations-roundtrip.integration.test.ts`) proves up, down, up for this
 * table with the others; here the table and its constraints are checked on the migrated schema.
 */
const ds = buildDemoDataset({ ids: 'uuid' });
const baseUrl = inject('databaseUrl');

describe('proof_launch_day constraints', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_proof_launch_test'); await resetData(orm); }, 120_000);
  afterAll(async () => { await orm?.close(true); });

  let n = 0;
  const insert = (seq: number, reason: string | null) => orm.em.getConnection().execute(
    'insert into proof_launch_day (id, restaurant_id, seq, launch_day, reason, set_by_role, set_at) values (?, ?, ?, ?, ?, ?, now())',
    [`9b000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, ds.restaurant.id, seq, '2033-01-10', reason, 'owner']
  );
  const count = async () => Number((await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from proof_launch_day'))[0].n);

  it('accepts a first entry without a reason and a second one with it', async () => {
    await insert(1, null);
    await insert(2, 'Guests started earlier');
    expect(await count()).toBe(2);
  });

  it('refuses a later entry without a reason (null or empty), a repeated number, a number below 1 and a reason over 200 characters', async () => {
    for (const [seq, reason] of [[3, null], [3, ''], [2, 'again'], [0, 'zero'], [3, 'x'.repeat(201)]] as Array<[number, string | null]>) {
      await expect(insert(seq, reason), `seq ${seq}, reason ${reason?.length ?? 'null'}`).rejects.toThrow();
    }
    expect(await count()).toBe(2);
  });
});
