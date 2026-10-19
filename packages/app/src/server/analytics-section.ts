import { logger } from './logger';

/**
 * One section of the KPI dashboard, loaded on its own (spec 2026-10-15-kpi-dashboard, R9, Q14): a failed read shows
 * "Analytics are temporarily unavailable." in that section only, and the rest of A1 renders. The cause goes to the log.
 */
export type SettledSection<T> = { ok: true; value: T } | { ok: false };

export async function settleSection<T>(slug: string, section: string, promise: Promise<T>): Promise<SettledSection<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    logger.error('analytics section failed', { slug, section, error: error instanceof Error ? error.message : String(error) });
    return { ok: false };
  }
}
