import type { EntityManager } from '@mikro-orm/postgresql';
import type { DatabaseHealth, SystemHealth } from '@wine-match/core';

/** How long the database may take to answer `select 1` before it counts as unreachable (spec 2026-10-15-production-deployment, R3). */
export const HEALTH_TIMEOUT_MS = 2000;

interface Deps { em: EntityManager }

/**
 * `select 1` through the request-scoped connection, with a hard limit. Any failure (refused, reset, authentication, a hang) is
 * `unreachable`: the cause is deliberately not returned, so a caller can never learn the host, the user or the driver's message.
 */
export class PgSystemHealth implements SystemHealth {
  private readonly em: EntityManager;
  private readonly timeoutMs: number;
  constructor({ em }: Deps, timeoutMs = HEALTH_TIMEOUT_MS) {
    this.em = em;
    this.timeoutMs = timeoutMs;
  }

  async database(): Promise<DatabaseHealth> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<'unreachable'>((resolve) => { timer = setTimeout(() => resolve('unreachable'), this.timeoutMs); });
    const query = this.em.getConnection().execute('select 1').then((): DatabaseHealth => 'ok', (): DatabaseHealth => 'unreachable');
    try {
      return await Promise.race([query, limit]);
    } finally {
      clearTimeout(timer);
    }
  }
}
