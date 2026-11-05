import type { DatabaseHealth } from '@wine-match/core';
import { createRequestScope } from './container';
import { env } from './env';
import { logger } from './logger';
import { observeDbHealthCheck } from './metrics';

/**
 * What GET /api/v1/health reports (spec 2026-10-15-production-deployment, R3, Q5). The answer carries no host, user, password,
 * driver message, version, count or data source: an uptime checker and anyone who finds the URL learn only whether the app can
 * serve. A failure to build the container is the same "unreachable" as a failing `select 1`, and is not remembered, so the first
 * check after the database returns is 200 without a restart.
 *
 * The route is public, so it must not become a way to pile work on a database that hangs: concurrent requests SHARE one in-flight
 * check, and the last answer is reused for `HEALTH_CACHE_MS` (a recovery shows within that bound). One check = one query, one
 * error log line, one `db_health_check_duration_seconds` sample, however many requests ask. (A statement-level timeout for the
 * `select 1` is not set: the driver offers it only per session or inside a transaction, which would change the pool's behaviour
 * for a probe; the 2 s limit in PgSystemHealth bounds the wait instead.)
 */
export interface HealthReport {
  status: 'ok' | 'unavailable';
  checks: { database: DatabaseHealth };
}

export const HEALTH_CACHE_MS = 2000;

interface HealthState {
  inflight?: Promise<HealthReport>;
  last?: { at: number; report: HealthReport };
}

const g = globalThis as unknown as { __wineMatchHealth?: HealthState };
const state = (): HealthState => (g.__wineMatchHealth ??= {});

/** For tests only. */
export function resetHealthCache(): void {
  g.__wineMatchHealth = {};
}

async function runCheck(): Promise<HealthReport> {
  let database: DatabaseHealth = 'unreachable';
  const started = performance.now();
  try {
    const dataSource = env().dataSource;
    const scope = await createRequestScope();
    try {
      database = await scope.cradle.systemHealth.database();
    } finally {
      await scope.dispose();
    }
    if (database === 'unreachable') logger.error('health check failed: the database did not answer', { dataSource });
  } catch (error) {
    // the reason goes to the log (redacted), never to the caller
    logger.error('health check failed', { err: error });
  }
  if (database !== 'skipped') observeDbHealthCheck((performance.now() - started) / 1000);
  return { status: database === 'unreachable' ? 'unavailable' : 'ok', checks: { database } };
}

export function checkHealth(opts: { now?: () => number; cacheMs?: number } = {}): Promise<HealthReport> {
  const now = opts.now ?? Date.now;
  const s = state();
  if (s.last && now() - s.last.at < (opts.cacheMs ?? HEALTH_CACHE_MS)) return Promise.resolve(s.last.report);
  s.inflight ??= runCheck().then((report) => {
    s.last = { at: now(), report };
    return report;
  }).finally(() => { s.inflight = undefined; });
  return s.inflight;
}
