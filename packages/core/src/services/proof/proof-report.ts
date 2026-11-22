import type { CodeSummary } from '../../domain/types';
import { ValidationError } from '../../errors';
import { serviceDay, shiftServiceDay } from '../../recommendation-code/service-day';
import { MIN_RATE_SAMPLE } from '../analytics/compare-metric';
import { computeSalesKpis, type CheckTotals } from '../sales/sales-kpis';
import type { SalesPeriod } from '../sales/types';

/**
 * The results report of the owner (spec 2026-11-18-owner-proof-report, step 1): Wine Attach Rate before the launch day
 * (a fixed baseline) and after it (windows of 28 days), with the uncertainty and honest "not enough data" reasons.
 * Everything here is pure: no I/O, no clock (`now` comes from the caller), no randomness. The rate itself is
 * `computeSalesKpis` (R2): the report has no second definition of "check with wine". It states no cause.
 */

/** Days in the baseline and in every window: four whole weeks, so each has the same number of Fridays and Saturdays. */
export const PROOF_WINDOW_DAYS = 28;
/** The report offers windows 1..12 (28 + 12 × 28 = 364 days, within the 366 days a sales period may span). */
export const PROOF_MAX_WINDOW = 12;
/** Checks with food a window needs: E04's small-sample threshold (D20), imported, not copied. */
export const PROOF_MIN_FOOD_CHECKS = MIN_RATE_SAMPLE;
/** Days with at least one check with food a window needs (spec Q1, a proposal until the first pilot). */
export const PROOF_MIN_TRADING_DAYS = 14;
/** Wilson interval confidence: 95% (z = 1.96). */
export const PROOF_Z = 1.96;
/** From this window on the baseline is older than three windows (R9). */
export const PROOF_OLD_BASELINE_FROM_WINDOW = 4;

/** Why a report shows no change and no verdict (R3). Any number of them can hold at once. */
export const PROOF_REASONS = [
  'no_launch_day',
  'no_sales_import',
  'baseline_no_data',
  'baseline_too_few_checks',
  'baseline_too_few_days',
  'window_incomplete',
  'window_not_imported',
  'window_too_few_checks',
  'window_too_few_days'
] as const;
export type ProofReason = (typeof PROOF_REASONS)[number];

/**
 * Fixed caveats (R4, R6, R8, R9) as keys: the report states them every time and cannot switch them off. The texts
 * (Polish and English) belong to the app's dictionaries, so no user-facing wording lives in `core`.
 */
export const PROOF_CAVEATS = ['not_causal', 'no_control_group', 'season_menu_prices', 'checks_of_a_day_are_alike', 'looks_are_not_corrected'] as const;
export type ProofCaveat = (typeof PROOF_CAVEATS)[number];

export type ProofVerdict = 'increase' | 'decrease' | 'inconclusive' | 'insufficient';

/** A check of the report: `CheckTotals` plus whether one of its active lines carries a recommendation code (R6). */
export interface MarkedCheckTotals extends CheckTotals {
  hasCode: boolean;
}

/** A confidence interval of a proportion (0..1) or of a difference (percentage points, see the field). */
export interface Interval { low: number; high: number }

/** The Wilson score interval of `x` of `n`, within 0..1; null for `n = 0` (nothing to divide). */
export function wilsonInterval(x: number, n: number, z = PROOF_Z): Interval | null {
  if (!(n > 0) || x < 0 || x > n) return null;
  const p = x / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  // x = 0 and x = n sit on the edge exactly; the floating-point sum must not step over it
  return { low: x === 0 ? 0 : Math.max(0, centre - half), high: x === n ? 1 : Math.min(1, centre + half) };
}

/**
 * The difference of two proportions with Newcombe's hybrid score interval (method 10), built from the Wilson
 * intervals of both. 1 is the baseline and 2 the window; the result is in percentage points:
 * `L = Δ − √((p₂−l₂)² + (u₁−p₁)²)`, `U = Δ + √((u₂−p₂)² + (p₁−l₁)²)`. Null when either sample is empty.
 */
export function newcombeDifference(baseline: { x: number; n: number }, window: { x: number; n: number }, z = PROOF_Z): { delta: number; low: number; high: number } | null {
  const w1 = wilsonInterval(baseline.x, baseline.n, z);
  const w2 = wilsonInterval(window.x, window.n, z);
  if (!w1 || !w2) return null;
  const p1 = baseline.x / baseline.n;
  const p2 = window.x / window.n;
  const delta = p2 - p1;
  const low = delta - Math.sqrt((p2 - w2.low) ** 2 + (w1.high - p1) ** 2);
  const high = delta + Math.sqrt((w2.high - p2) ** 2 + (p1 - w1.low) ** 2);
  return { delta: delta * 100, low: low * 100, high: high * 100 };
}

/**
 * The smallest rise (percentage points) the report could show as `increase` with these samples: the baseline stays
 * as observed (`baselineX` of `baselineN`), the window has `windowN` checks, and the window's rate is moved up until
 * the lower end of Newcombe's interval passes 0. Null when even a rate of 100% would not (tiny samples). It depends
 * only on the sample sizes and the baseline, never on the window's own result, so it is no estimate of the effect.
 */
export function minimumDetectableChange(baselineX: number, baselineN: number, windowN: number, z = PROOF_Z): number | null {
  const w1 = wilsonInterval(baselineX, baselineN, z);
  if (!w1 || !(windowN > 0)) return null;
  const p1 = baselineX / baselineN;
  // the same formula as `newcombeDifference`, with the window's rate as a real number (x = rate × n need not be whole)
  const lowEnd = (p2: number) => {
    const w2 = wilsonInterval(p2 * windowN, windowN, z);
    return w2 ? p2 - p1 - Math.sqrt((p2 - w2.low) ** 2 + (w1.high - p1) ** 2) : -Infinity;
  };
  if (lowEnd(1) <= 0) return null;
  let lo = p1;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (lowEnd(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (hi - p1) * 100;
}

const isCalendarDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && shiftServiceDay(day, 0) === day;

export interface ProofWindows {
  /** `[L − 28, L − 1]` */
  baseline: SalesPeriod;
  /** `[L + 28(k−1), L + 28k − 1]` */
  window: SalesPeriod;
  /** baseline start to window end: the one period the service reads (R1 of the port step) */
  span: SalesPeriod;
  /** the last service day that is over: yesterday's, by the 04:00 cut-off of E09 */
  lastFullDay: string;
  /** the window's last day is over (R3: only then can it be a result) */
  windowEnded: boolean;
}

/**
 * The baseline and window `index` (1..12) for the launch day `launchDay` (a service day, `YYYY-MM-DD`). Dates move
 * by calendar arithmetic (28 dates, never 28 × 24 h), so the clock changes of Warsaw do not shift a window. A window
 * has ended when its last day is not after `shiftDay(serviceDay(now), −1)`.
 */
export function proofWindows(launchDay: string, index: number, now: Date): ProofWindows {
  if (!isCalendarDay(launchDay)) throw new ValidationError('invalid_launch_day', 'The launch day must be a real date (YYYY-MM-DD).');
  if (!Number.isInteger(index) || index < 1 || index > PROOF_MAX_WINDOW) {
    throw new ValidationError('invalid_window', `The window must be a whole number from 1 to ${PROOF_MAX_WINDOW}.`);
  }
  const baseline = { from: shiftServiceDay(launchDay, -PROOF_WINDOW_DAYS), to: shiftServiceDay(launchDay, -1) };
  const window = { from: shiftServiceDay(launchDay, PROOF_WINDOW_DAYS * (index - 1)), to: shiftServiceDay(launchDay, PROOF_WINDOW_DAYS * index - 1) };
  const lastFullDay = shiftServiceDay(serviceDay(now), -1);
  return { baseline, window, span: { from: baseline.from, to: window.to }, lastFullDay, windowEnded: window.to <= lastFullDay };
}

/** The counts of one period (the baseline or a window), and what may be shown of them. */
export interface ProofWindowSummary {
  period: SalesPeriod;
  /** checks with food ("N z M rachunków": the denominator) */
  foodChecks: number;
  /** of them with wine ("N") */
  foodChecksWithWine: number;
  /** days of the period with at least one check with food ("D z 28") */
  tradingDays: number;
  /** calendar days of the period (always 28) */
  days: number;
  /** foodChecksWithWine / foodChecks, only with at least `PROOF_MIN_FOOD_CHECKS` checks with food (Q2); else null */
  attachRate: number | null;
  /** Wilson interval of the rate, only when this period alone meets every threshold; else null */
  interval: Interval | null;
  /** the thresholds this period alone fails (empty: it can be a result) */
  reasons: ProofReason[];
}

/** Checks of one group (R6) of a window: each group has its own threshold; never compared with the other group. */
export interface ProofGroup {
  foodChecks: number;
  foodChecksWithWine: number;
  /** only with at least `PROOF_MIN_FOOD_CHECKS` checks with food; else null */
  attachRate: number | null;
  /** net wine revenue per check with food, PLN, same threshold; else null */
  wineRevenuePerTable: number | null;
  /** the group has at least `PROOF_MIN_FOOD_CHECKS` checks with food */
  enough: boolean;
}

export interface ProofReportInput {
  /** the launch day (a service day) or null when the owner has not set one */
  launchDay: string | null;
  /** 1..12 */
  window: number;
  now: Date;
  /** the first and last business day with active POS data, as `SalesKpiService.dataRange`; null: nothing imported */
  dataRange: SalesPeriod | null;
  /** the checks of the baseline period (checks outside it are ignored) */
  baselineChecks: MarkedCheckTotals[];
  /** the checks of the window (checks outside it are ignored) */
  windowChecks: MarkedCheckTotals[];
  /** `RecommendationCodeService.summary` for the window, passed through unchanged (R7); null when not read */
  codes: CodeSummary | null;
}

export interface ProofReport {
  launchDay: string | null;
  windowIndex: number;
  /** null without a launch day or without an import */
  baseline: ProofWindowSummary | null;
  window: ProofWindowSummary | null;
  /** the last business day of the POS data ("dane do dnia"), null without an import */
  dataThrough: string | null;
  /** every reason the change and the verdict are hidden; empty when both windows meet the thresholds */
  reasons: ProofReason[];
  verdict: ProofVerdict;
  /** the change in percentage points with Newcombe's interval, full precision; null while `verdict` is `insufficient` */
  change: { deltaPp: number; lowPp: number; highPp: number } | null;
  /** the smallest rise the samples could show (see `minimumDetectableChange`); null while `verdict` is `insufficient` */
  minimumDetectableChangePp: number | null;
  /** checks with and without a code in the window (R6); null without a window to count */
  groups: { withCode: ProofGroup; withoutCode: ProofGroup } | null;
  codes: CodeSummary | null;
  /** window 4 and later: the baseline is older than three windows (R9) */
  oldBaseline: boolean;
  caveats: readonly ProofCaveat[];
}

const inPeriod = <T extends CheckTotals>(checks: T[], p: SalesPeriod): T[] => checks.filter((c) => c.businessDate >= p.from && c.businessDate <= p.to);

function summarize(period: SalesPeriod, checks: MarkedCheckTotals[]): Omit<ProofWindowSummary, 'interval' | 'reasons'> {
  const kpis = computeSalesKpis(period, checks);
  const days = new Set(checks.filter((c) => c.foodQuantity > 0).map((c) => c.businessDate));
  return {
    period,
    foodChecks: kpis.foodChecks,
    foodChecksWithWine: kpis.foodChecksWithWine,
    tradingDays: days.size,
    days: PROOF_WINDOW_DAYS,
    attachRate: kpis.foodChecks >= PROOF_MIN_FOOD_CHECKS ? kpis.attachRate : null
  };
}

function group(period: SalesPeriod, checks: MarkedCheckTotals[]): ProofGroup {
  const kpis = computeSalesKpis(period, checks);
  const enough = kpis.foodChecks >= PROOF_MIN_FOOD_CHECKS;
  return {
    foodChecks: kpis.foodChecks,
    foodChecksWithWine: kpis.foodChecksWithWine,
    attachRate: enough ? kpis.attachRate : null,
    wineRevenuePerTable: enough ? kpis.wineRevenuePerTable : null,
    enough
  };
}

/**
 * The report for one window (R1): counts, thresholds, uncertainty, verdict. With any reason the counters show but no
 * change, interval of the change or verdict does (R3); the rate of a period shows when its denominator reaches the
 * threshold. A reason hides, it never turns into "no effect": `inconclusive` means the interval includes 0.
 */
export function computeProofReport(input: ProofReportInput): ProofReport {
  const base = { windowIndex: input.window, codes: input.codes, caveats: PROOF_CAVEATS, minimumDetectableChangePp: null, change: null, groups: null, baseline: null, window: null, oldBaseline: input.window >= PROOF_OLD_BASELINE_FROM_WINDOW };
  const empty = (reasons: ProofReason[]): ProofReport => ({ ...base, launchDay: input.launchDay, dataThrough: input.dataRange?.to ?? null, reasons, verdict: 'insufficient' });
  if (input.launchDay === null) {
    if (!Number.isInteger(input.window) || input.window < 1 || input.window > PROOF_MAX_WINDOW) throw new ValidationError('invalid_window', `The window must be a whole number from 1 to ${PROOF_MAX_WINDOW}.`);
    return empty(['no_launch_day']);
  }
  const w = proofWindows(input.launchDay, input.window, input.now);
  if (input.dataRange === null) return empty(['no_sales_import']);

  const baselineChecks = inPeriod(input.baselineChecks, w.baseline);
  const windowChecks = inPeriod(input.windowChecks, w.window);
  const baselineBase = summarize(w.baseline, baselineChecks);
  const windowBase = summarize(w.window, windowChecks);

  const baselineReasons: ProofReason[] = [];
  if (baselineBase.foodChecks === 0) baselineReasons.push('baseline_no_data');
  else {
    if (baselineBase.foodChecks < PROOF_MIN_FOOD_CHECKS) baselineReasons.push('baseline_too_few_checks');
    if (baselineBase.tradingDays < PROOF_MIN_TRADING_DAYS) baselineReasons.push('baseline_too_few_days');
  }
  const windowReasons: ProofReason[] = [];
  // a running window and a window the import does not reach are incomplete data, not "too few": say only that
  if (!w.windowEnded) windowReasons.push('window_incomplete');
  else if (input.dataRange.to < w.window.to) windowReasons.push('window_not_imported');
  else {
    if (windowBase.foodChecks < PROOF_MIN_FOOD_CHECKS) windowReasons.push('window_too_few_checks');
    if (windowBase.tradingDays < PROOF_MIN_TRADING_DAYS) windowReasons.push('window_too_few_days');
  }

  const baseline: ProofWindowSummary = { ...baselineBase, reasons: baselineReasons, interval: baselineReasons.length === 0 ? wilsonInterval(baselineBase.foodChecksWithWine, baselineBase.foodChecks) : null };
  const window: ProofWindowSummary = { ...windowBase, reasons: windowReasons, interval: windowReasons.length === 0 ? wilsonInterval(windowBase.foodChecksWithWine, windowBase.foodChecks) : null };
  const reasons = [...baselineReasons, ...windowReasons];
  const groups = { withCode: group(w.window, windowChecks.filter((c) => c.hasCode)), withoutCode: group(w.window, windowChecks.filter((c) => !c.hasCode)) };
  const common = { ...base, launchDay: input.launchDay, dataThrough: input.dataRange.to, baseline, window, groups, reasons };

  if (reasons.length > 0) return { ...common, verdict: 'insufficient' };
  const diff = newcombeDifference({ x: baseline.foodChecksWithWine, n: baseline.foodChecks }, { x: window.foodChecksWithWine, n: window.foodChecks });
  if (!diff) return { ...common, reasons: ['baseline_no_data'], verdict: 'insufficient' };
  const verdict: ProofVerdict = diff.low > 0 ? 'increase' : diff.high < 0 ? 'decrease' : 'inconclusive';
  return {
    ...common,
    verdict,
    change: { deltaPp: diff.delta, lowPp: diff.low, highPp: diff.high },
    minimumDetectableChangePp: minimumDetectableChange(baseline.foodChecksWithWine, baseline.foodChecks, window.foodChecks)
  };
}
