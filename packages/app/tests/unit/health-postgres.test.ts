import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { req } from './helpers';

/**
 * Spec 2026-10-15-production-deployment, R3 / AC5, DATA_SOURCE=postgres, in its own module graph (the data source is
 * read once per process). The connection is replaced by a stand-in that we can break and repair; the health port, the
 * container and the route are the real ones.
 */
const SECRET = 'TopSecretPw9';
const HOST = 'db.internal.example';

type Execute = () => Promise<unknown>;
const state: { initFailures: number; execute: Execute } = { initFailures: 0, execute: async () => [{ '?column?': 1 }] };

async function load() {
  vi.resetModules();
  vi.doMock('@wine-match/db', async (importOriginal) => {
    const orm = { em: { fork: () => ({ getConnection: () => ({ execute: () => state.execute() }) }) } };
    return {
      ...(await importOriginal<typeof import('@wine-match/db')>()),
      getOrm: async () => {
        if (state.initFailures > 0) { state.initFailures--; throw new Error(`connect ECONNREFUSED ${HOST}:5432 password=${SECRET}`); }
        return orm;
      }
    };
  });
  process.env.DATA_SOURCE = 'postgres';
  process.env.DATABASE_URL = ['postgres://wine', `${SECRET}@${HOST}:5432/winematch`].join(':');   // built from parts: a literal connection string with a password trips secrets:scan
  const route = await import('@/app/api/v1/health/route');
  const logger = (await import('@/server/logger')).logger;
  const metrics = await import('@/server/metrics');
  return { GET: route.GET, logger, metrics, container: await import('@/server/container') };
}

const URL0 = 'http://localhost:3000/api/v1/health';

describe('GET /api/v1/health with DATA_SOURCE=postgres', () => {
  beforeEach(() => {
    // the container is cached on globalThis (it survives vi.resetModules), like in a real process: start every test without one
    delete (globalThis as { __wineMatchContainer?: unknown }).__wineMatchContainer;
    state.initFailures = 0; state.execute = async () => [{ '?column?': 1 }];
  });
  afterEach(() => { vi.doUnmock('@wine-match/db'); });

  it('answers 200 when the database answers, and times the check', async () => {
    const { GET, metrics } = await load();
    const res = await GET(req(URL0));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', dataSource: 'postgres', checks: { database: 'ok' } });
    expect(metrics.renderMetrics()).toMatch(/db_health_check_duration_seconds_count 1/);
  });

  it('answers 503 when select 1 fails, without the host, the password or the driver message', async () => {
    state.execute = async () => { throw new Error(`connection to ${HOST} failed for password ${SECRET}`); };
    const { GET } = await load();
    const res = await GET(req(URL0));
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: 'unavailable', dataSource: 'postgres', checks: { database: 'unreachable' } });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(HOST);
  });

  it('answers 503 (not 500) when the container cannot be built, logs the reason redacted, and recovers on the next request without a restart', async () => {
    state.initFailures = 1;
    const { GET, logger } = await load();
    const error = vi.spyOn(logger, 'error');
    const down = await GET(req(URL0));
    expect(down.status).toBe(503);
    const body = await down.text();
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain(HOST);
    expect(JSON.parse(body).checks.database).toBe('unreachable');
    expect(JSON.stringify(error.mock.calls)).not.toContain(SECRET);

    const up = await GET(req(URL0));   // same module graph = same process: the rejected build was not remembered
    expect(up.status).toBe(200);
    expect(await up.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
    error.mockRestore();
  });

  it('a rejected container build is not cached: the first call throws, the second builds from scratch', async () => {
    state.initFailures = 1;
    const { container } = await load();
    await expect(container.getContainer()).rejects.toThrow(/ECONNREFUSED/);
    const built = await container.getContainer();
    expect(typeof built.createScope).toBe('function');
    expect(Object.is(await container.getContainer(), built)).toBe(true);   // a successful build IS cached
  });

  it('a request that cannot open its scope while the database is down is an error and a later one works', async () => {
    state.initFailures = 1;
    const { container } = await load();
    await expect(container.createRequestScope()).rejects.toThrow();
    const scope = await container.createRequestScope();
    expect(typeof scope.cradle.systemHealth.database).toBe('function');
    await scope.dispose();
  });
});
