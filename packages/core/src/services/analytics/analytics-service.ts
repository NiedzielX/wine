import type { Dish, Wine } from '../../domain/types';
import { pairingScore } from '../../engine/scoring';
import { localizeDish } from '../../i18n/content';
import type { Locale } from '../../i18n/locale';
import type { PairingStatSource, Repositories } from '../../ports/repositories';
import type { Clock } from '../../ports/runtime';
import { count, rate, type Metric } from './compare-metric';
import { kpiWindow, type KpiPeriod } from './kpi-window';

/**
 * The KPI dashboard's read service (spec 2026-10-15-kpi-dashboard). Phase 1: guest usage; phase 3: pairing
 * performance. Sales (`salesSummary`, phase 2) is added here with its own dependency; each method is loaded and fails
 * on its own on A1 (R9).
 */
export type AnalyticsServiceDeps = Pick<Repositories,
  'restaurantRepository' | 'guestInteractionRepository' | 'pairingRepository' | 'dishRepository' | 'wineRepository'> & { clock: Clock };

/** The number of pairing rows A1 shows before "Show all N pairings" (Q11). */
export const PAIRING_ROWS_LIMIT = 10;

/** One row of "Pairing performance": a (dish, wine) with the source it had when guests saw it (R8, Q10). */
export interface PairingPerformanceRow {
  dish: { id: string; name: string };
  /** `producer` is additive to the spec's contract: wine names alone repeat across producers */
  wine: { id: string; name: string; producer: string; vintage: string };
  source: PairingStatSource;
  /** `pairingScore(dish, wine).score`: the engine's score, without guest preferences (R02, AC9) */
  matchScore: number;
  shown: number;
  chosen: number;
  /** chosen / shown, 0..1; null without views ("No views", AC8) */
  conversion: number | null;
}

export interface PairingPerformance {
  period: UsageSummary['period'];
  rows: PairingPerformanceRow[];
  /** rows before the limit (without the omitted ones) */
  total: number;
  /** rows left out because their dish or wine is no longer in the catalog */
  omitted: number;
}

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

  /**
   * How guests saw and chose each pairing in the last 28 full days (#22, R8, Q10, Q11). Rows from
   * `pairingStats` (one per dish, wine and source at the time of viewing), plus the reviewed pairings of the published
   * snapshot (`approved` / `modified`, source Sommelier) that guests never saw — only for a published dish and an
   * active wine. A pairing rejected today but seen in the window keeps its historical row. Sorted by shown ↓, chosen ↓,
   * dish name, source (Sommelier first), wine name; rows without views come last. `limit` cuts the rows (A1 passes
   * `PAIRING_ROWS_LIMIT`), undefined = all. Null for an unknown restaurant.
   */
  async pairingPerformance(slug: string, opts: { limit?: number; locale?: Locale } = {}): Promise<PairingPerformance | null> {
    const restaurant = await this.deps.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const locale = opts.locale ?? 'en';
    const w = kpiWindow(this.deps.clock.now());
    const [stats, dishes, wines, published] = await Promise.all([
      this.deps.guestInteractionRepository.pairingStats(restaurant.id, w.currentRange),
      this.deps.dishRepository.listByRestaurant(restaurant.id),
      this.deps.wineRepository.listByRestaurant(restaurant.id),
      this.deps.pairingRepository.listPublishedByRestaurant(restaurant.id)
    ]);
    const dishById = new Map(dishes.map((d) => [d.id, d]));
    const wineById = new Map(wines.map((x) => [x.id, x]));
    const pairKey = (dishId: string, wineId: string) => JSON.stringify([dishId, wineId]);
    const seen = new Set<string>();
    const rows: PairingPerformanceRow[] = [];
    let omitted = 0;
    const row = (dish: Dish, wine: Wine, source: PairingStatSource, shown: number, chosen: number): PairingPerformanceRow => ({
      dish: { id: dish.id, name: localizeDish(dish, locale).name },
      wine: { id: wine.id, name: wine.name, producer: wine.producer, vintage: String(wine.vintage) },
      source,
      matchScore: pairingScore(dish, wine).score,
      shown,
      chosen,
      conversion: shown > 0 ? chosen / shown : null
    });
    for (const s of stats) {
      seen.add(pairKey(s.dishId, s.wineId));
      const dish = dishById.get(s.dishId);
      const wine = wineById.get(s.wineId);
      if (!dish || !wine) { omitted += 1; continue; }
      rows.push(row(dish, wine, s.source, s.shown, s.chosen));
    }
    for (const p of published) {
      if ((p.status !== 'approved' && p.status !== 'modified') || seen.has(pairKey(p.dishId, p.wineId))) continue;
      const dish = dishById.get(p.dishId);
      const wine = wineById.get(p.wineId);
      if (dish?.status !== 'published' || !wine?.active) continue;
      seen.add(pairKey(p.dishId, p.wineId));
      rows.push(row(dish, wine, 'sommelier', 0, 0));
    }
    const collator = new Intl.Collator(locale);
    const sourceOrder = (s: PairingStatSource) => (s === 'sommelier' ? 0 : 1);
    rows.sort((a, b) => b.shown - a.shown || b.chosen - a.chosen || collator.compare(a.dish.name, b.dish.name) ||
      sourceOrder(a.source) - sourceOrder(b.source) || collator.compare(a.wine.name, b.wine.name) ||
      (a.dish.id < b.dish.id ? -1 : a.dish.id > b.dish.id ? 1 : 0) || (a.wine.id < b.wine.id ? -1 : a.wine.id > b.wine.id ? 1 : 0));
    return {
      period: { current: w.current, previous: w.previous },
      rows: opts.limit === undefined ? rows : rows.slice(0, opts.limit),
      total: rows.length,
      omitted
    };
  }
}
