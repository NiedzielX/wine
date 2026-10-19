import type { Repositories } from '../../ports/repositories';
import type { Clock } from '../../ports/runtime';
import { count, rate, type Metric } from './compare-metric';
import { kpiWindow, type KpiPeriod } from './kpi-window';

/**
 * The KPI dashboard's read service (spec 2026-10-15-kpi-dashboard). Phase 1: guest usage. Sales (`salesSummary`,
 * phase 2) and pairing performance (`pairingPerformance`, phase 3) are added here with their own dependencies; each
 * method is loaded and fails on its own on A1 (R9).
 */
export type AnalyticsServiceDeps = Pick<Repositories, 'restaurantRepository' | 'guestInteractionRepository'> & { clock: Clock };

export interface UsageSummary {
  period: { current: KpiPeriod; previous: KpiPeriod };
  /** false when there are no guest sessions in either window: A1 shows the empty state, not zeros */
  hasData: boolean;
  /** guest sessions (R2) */
  sessions: Metric;
  /** distinct (session, dish) recommendation views (Q8) */
  recommendationViews: Metric;
  /** sessions with a dish selection / sessions with a recommendation view (R3); `sample` in sessions */
  recommendationToSelection: Metric;
  /**
   * The waiter's lookups on G9 and G11 (E02 F3, E08): not guest usage, shown apart and never part of the guest figures
   * (E04 R2). Distinct (session, dish or table) per window.
   */
  staffLookups: Metric;
}

export class AnalyticsService {
  constructor(private readonly deps: AnalyticsServiceDeps) {}

  /** Guest usage of the last 28 full days against the 28 before (R1–R7). Null for an unknown restaurant. */
  async usageSummary(slug: string): Promise<UsageSummary | null> {
    const restaurant = await this.deps.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const w = kpiWindow(this.deps.clock.now());
    const [cur, prev] = await Promise.all([
      this.deps.guestInteractionRepository.usageTotals(restaurant.id, w.currentRange),
      this.deps.guestInteractionRepository.usageTotals(restaurant.id, w.previousRange)
    ]);
    return {
      period: { current: w.current, previous: w.previous },
      hasData: cur.sessions > 0 || prev.sessions > 0,
      sessions: count(cur.sessions, prev.sessions),
      recommendationViews: count(cur.recommendationViews, prev.recommendationViews),
      recommendationToSelection: rate(cur.sessionsWithSelection, cur.sessionsWithViews, prev.sessionsWithSelection, prev.sessionsWithViews),
      staffLookups: count(cur.staffLookups, prev.staffLookups)
    };
  }
}
