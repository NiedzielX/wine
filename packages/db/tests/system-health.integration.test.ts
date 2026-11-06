import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabase, createTcpRelay } from '@wine-match/testkit';
import { describe, expect, inject, it } from 'vitest';
import { ormConfig } from '../src/config';
import { getOrm } from '../src/orm';
import { HEALTH_TIMEOUT_MS, PgSystemHealth } from '../src/repositories/system-health';

/** Spec 2026-10-15-production-deployment, R3 / AC5: the PostgreSQL health check, against a real server. */
const baseUrl = inject('databaseUrl');

describe('PgSystemHealth on PostgreSQL', () => {
  it('is ok while the connection works', async () => {
    const orm = await MikroORM.init(ormConfig({ clientUrl: await createDatabase(baseUrl, 'winematch_health_ok') }));
    try {
      expect(await new PgSystemHealth({ em: orm.em.fork() }).database()).toBe('ok');
    } finally {
      await orm.close(true);
    }
  });

  it('is unreachable, within the time limit, when the server cannot be reached at all', async () => {
    const orm = await MikroORM.init(ormConfig({ clientUrl: 'postgres://nobody@127.0.0.1:1/none' }));   // init does not connect: the failure shows at the first query
    try {
      const started = Date.now();
      expect(await new PgSystemHealth({ em: orm.em.fork() }).database()).toBe('unreachable');
      expect(Date.now() - started).toBeLessThanOrEqual(HEALTH_TIMEOUT_MS + 500);
    } finally {
      await orm.close(true);
    }
  });

  it('follows the server away and back on the same pool: ok, unreachable, ok (no restart)', async () => {
    const url = new URL(await createDatabase(baseUrl, 'winematch_health_relay'));
    const relay = await createTcpRelay({ host: url.hostname, port: Number(url.port || 5432) });
    const viaRelay = new URL(url);
    viaRelay.hostname = relay.host;
    viaRelay.port = String(relay.port);
    const orm = await MikroORM.init(ormConfig({ clientUrl: viaRelay.toString() }));
    try {
      const check = () => new PgSystemHealth({ em: orm.em.fork() }).database();
      expect(await check()).toBe('ok');
      await relay.stop();
      const started = Date.now();
      expect(await check()).toBe('unreachable');
      expect(Date.now() - started).toBeLessThanOrEqual(HEALTH_TIMEOUT_MS + 500);
      await relay.start();
      expect(await check()).toBe('ok');
    } finally {
      await orm.close(true);
      await relay.stop();
    }
  });
});

describe('getOrm after a failed init', () => {
  it('an init that fails is not remembered: the next call tries again and succeeds', async () => {
    const good = await createDatabase(baseUrl, 'winematch_health_orm');
    // MikroORM.init does not connect (an unreachable server shows at the first query), but it does reject on a configuration it cannot use
    const first = getOrm({ clientUrl: 'nonsense' });
    await expect(first).rejects.toThrow();
    const second = getOrm({ clientUrl: good });
    expect(second).not.toBe(first);
    const orm = await second;
    try {
      expect(await new PgSystemHealth({ em: orm.em.fork() }).database()).toBe('ok');
    } finally {
      const { closeOrm } = await import('../src/orm');
      await closeOrm();
    }
  });
});
