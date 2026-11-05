import type { DatabaseHealth } from '@wine-match/core';
import { createRequestScope } from './container';
import { env } from './env';
import { logger } from './logger';
import { observeDbHealthCheck } from './metrics';

/**
 * What GET /api/v1/health reports (spec 2026-10-15-production-deployment, R3, Q5). The answer carries no host, user, password,
 * driver message, version or count: an uptime checker and anyone who finds the URL learn only whether the app can serve.
 * A failure to build the container (the database was down at the first request) is the same "unreachable" as a failing
 * `select 1`, and is not remembered, so the first check after the database returns is 200 without a restart.
 */
export interface HealthReport {
  status: 'ok' | 'unavailable';
  dataSource: 'memory' | 'postgres' | 'unknown';
  checks: { database: DatabaseHealth };
}

export async function checkHealth(): Promise<HealthReport> {
  let dataSource: HealthReport['dataSource'] = 'unknown';
  let database: DatabaseHealth = 'unreachable';
  const started = performance.now();
  try {
    dataSource = env().dataSource;
    const scope = await createRequestScope();
    try {
      database = await scope.cradle.systemHealth.database();
    } finally {
      await scope.dispose();
    }
  } catch (error) {
    // the reason goes to the log (redacted), never to the caller
    logger.error('health check failed', { err: error });
  }
  if (database !== 'skipped') observeDbHealthCheck((performance.now() - started) / 1000);
  return { status: database === 'unreachable' ? 'unavailable' : 'ok', dataSource, checks: { database } };
}
