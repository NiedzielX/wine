/**
 * One KPI with its comparison to the previous window (spec 2026-10-15-kpi-dashboard, R5–R7, Q18).
 *
 * - `value` / `previous`: a count, an amount (PLN) or a rate as a fraction 0..1.
 * - `change` is in display units and not rounded: `unit: '%'` (counts, amounts) = relative change × 100 (18.2 = +18.2%);
 *   `unit: 'pp'` (rates) = (value − previous) × 100.
 * - `noChange` says why `change` is null: `no_comparison` (a value is missing, or the previous count/amount is 0) or
 *   `small_sample` (a rate's denominator is below `MIN_RATE_SAMPLE` in either window).
 */
export interface Metric {
  value: number | null;
  previous: number | null;
  change: number | null;
  unit: '%' | 'pp';
  noChange: 'no_comparison' | 'small_sample' | null;
  /** rates only: what the rate is "N of M" of, in both windows */
  sample?: { numerator: number; denominator: number; previousDenominator: number };
}

/** Below this many sessions (or checks) in either window a rate's change is noise: shown without a delta. */
export const MIN_RATE_SAMPLE = 30;

function relative(value: number | null, previous: number | null): Metric {
  if (value === null || previous === null || previous === 0) return { value, previous, change: null, unit: '%', noChange: 'no_comparison' };
  return { value, previous, change: ((value - previous) / previous) * 100, unit: '%', noChange: null };
}

/** A count (sessions, views): relative change in %. */
export const count = (value: number | null, previous: number | null): Metric => relative(value, previous);

/** An amount (PLN): relative change in %, like a count. */
export const money = (value: number | null, previous: number | null): Metric => relative(value, previous);

/** A rate `num / den` against `prevNum / prevDen`: value 0..1 (null when den is 0), change in percentage points. */
export function rate(num: number, den: number, prevNum: number, prevDen: number): Metric {
  const value = den > 0 ? num / den : null;
  const previous = prevDen > 0 ? prevNum / prevDen : null;
  const sample = { numerator: num, denominator: den, previousDenominator: prevDen };
  if (value === null || previous === null) return { value, previous, change: null, unit: 'pp', noChange: 'no_comparison', sample };
  if (den < MIN_RATE_SAMPLE || prevDen < MIN_RATE_SAMPLE) return { value, previous, change: null, unit: 'pp', noChange: 'small_sample', sample };
  return { value, previous, change: (value - previous) * 100, unit: 'pp', noChange: null, sample };
}
