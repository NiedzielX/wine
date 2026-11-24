import type { MikroORM } from '@mikro-orm/postgresql';
import { buildDemoDataset } from '@wine-match/core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { freshDatabase, resetData } from './support/pg';

/**
 * The table of the launch day log refuses by itself what the repository refuses (spec 2026-11-18-owner-proof-report, R5):
 * a writer that bypasses the repository still cannot add a second entry without a reason (blank counts as none), repeat a
 * number, store an over-long reason or a role the team does not have; each refusal is checked by the name of the
 * constraint (or the PostgreSQL error code), not just "it threw". The migration round trip (`migrations-roundtrip.integration.test.ts`) proves up, down, up for this
 * table with the others; here the table and its constraints are checked on the migrated schema.
 */
const ds = buildDemoDataset({ ids: 'uuid' });
const baseUrl = inject('databaseUrl');

describe('proof_launch_day constraints', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_proof_launch_test'); await resetData(orm); }, 120_000);
  afterAll(async () => { await orm?.close(true); });

  let n = 0;
  const insert = (seq: number, reason: string | null, role = 'owner') => orm.em.getConnection().execute(
    'insert into proof_launch_day (id, restaurant_id, seq, launch_day, reason, set_by_role, set_at) values (?, ?, ?, ?, ?, ?, now())',
    [`9b000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, ds.restaurant.id, seq, '2033-01-10', reason, role]
  );
  const count = async () => Number((await orm.em.getConnection().execute<Array<{ n: string }>>('select count(*)::text as n from proof_launch_day'))[0].n);
  /** The PostgreSQL error code (`23505` unique, `23514` check, `22001` too long) and the constraint a refused insert names. */
  const refusal = async (promise: Promise<unknown>) => {
    const e = await promise.then(() => null, (err: unknown) => err as { code?: string; constraint?: string });
    return { code: e?.code, constraint: e?.constraint };
  };

  it('accepts a first entry without a reason and a second one with it', async () => {
    await insert(1, null);
    await insert(2, 'Guests started earlier');
    expect(await count()).toBe(2);
  });

  it('refuses a later entry without a reason (null, empty or only spaces) by the reason check', async () => {
    for (const reason of [null, '', ' ', '     ']) {
      expect(await refusal(insert(3, reason)), `reason ${JSON.stringify(reason)}`).toEqual({ code: '23514', constraint: 'proof_launch_day_reason_check' });
    }
    expect(await count()).toBe(2);
  });

  it('refuses a repeated number (unique), a number below 1 (seq check), a role the team does not have (role check) and an over-long reason (column length)', async () => {
    expect(await refusal(insert(2, 'again'))).toEqual({ code: '23505', constraint: 'proof_launch_day_restaurant_id_seq_unique' });
    expect(await refusal(insert(0, 'zero'))).toEqual({ code: '23514', constraint: 'proof_launch_day_seq_check' });
    for (const role of ['', 'admin', 'Owner']) {
      expect(await refusal(insert(3, 'a reason', role)), `role ${JSON.stringify(role)}`).toEqual({ code: '23514', constraint: 'proof_launch_day_set_by_role_check' });
    }
    expect((await refusal(insert(3, 'x'.repeat(201)))).code).toBe('22001');
    expect(await count()).toBe(2);
  });

  it('accepts every role of a membership', async () => {
    for (const [i, role] of ['owner', 'manager', 'sommelier', 'waiter'].entries()) await insert(3 + i, `by ${role}`, role);
    expect(await count()).toBe(6);
  });
});
