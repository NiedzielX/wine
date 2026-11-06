import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_CACHE_MS, checkHealth, resetHealthCache } from '@/server/health';
import { GET } from '@/app/api/v1/health/route';
import { logger } from '@/server/logger';
import { renderMetrics, resetMetrics } from '@/server/metrics';
import { req } from './helpers';

/**
 * Spec 2026-10-15-production-deployment, R3 / AC5, data source `memory` (the default of the unit suite): the
 * health route answers 200 with no database to ask. The PostgreSQL side (503, recovery) is in health-postgres.test.ts.
 */
const URL0 = 'http://localhost:3000/api/v1/health';

describe('GET /api/v1/health with the in-memory data source', () => {
  beforeEach(() => { resetMetrics(); resetHealthCache(); });

  it('answers 200 with the status and a skipped database check, never cached', async () => {
    const res = await GET(req(URL0));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', checks: { database: 'skipped' } });
  });

  it('needs no session and no cookie, and leaves one log line and one metrics sample under the route pattern', async () => {
    const info = vi.spyOn(logger, 'info');
    const res = await GET(req(`${URL0}?sid=secret-marker`));
    expect(res.status).toBe(200);
    const lines = info.mock.calls.filter((c) => c[0] === 'api request');
    expect(lines).toHaveLength(1);
    expect(lines[0][1]).toMatchObject({ method: 'GET', route: '/api/v1/health', status: 200 });
    expect(JSON.stringify(lines[0][1])).not.toContain('secret-marker');
    expect(renderMetrics()).toContain('http_requests_total{group="/api/v1/health",status_class="2xx"} 1');
    info.mockRestore();
  });

  it('does not tell an anonymous caller which data source it runs on', async () => {
    expect(JSON.stringify(await (await GET(req(URL0))).json())).not.toMatch(/memory|postgres|dataSource/);
  });

  it('shares one check between concurrent requests and reuses the answer until the cache expires (injectable clock)', async () => {
    let clock = 1_000;
    const opts = { now: () => clock };
    const container = await import('@/server/container');
    const scope = vi.spyOn(container, 'createRequestScope');
    const all = await Promise.all([checkHealth(opts), checkHealth(opts), checkHealth(opts), checkHealth(opts)]);
    expect(all.every((r) => r.status === 'ok')).toBe(true);
    expect(scope).toHaveBeenCalledTimes(1);
    clock += HEALTH_CACHE_MS - 1;
    await checkHealth(opts);
    expect(scope).toHaveBeenCalledTimes(1);
    clock += 1;
    await checkHealth(opts);
    expect(scope).toHaveBeenCalledTimes(2);
    scope.mockRestore();
  });

  it('does not time a database check when there is no database', async () => {
    await GET(req(URL0));
    expect(renderMetrics()).not.toMatch(/db_health_check_duration_seconds_count/);
  });
});
