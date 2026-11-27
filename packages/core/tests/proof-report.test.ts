import { describe, expect, it } from 'vitest';
import {
  computeProofReport, minimumDetectableChange, newcombeDifference, PROOF_MIN_FOOD_CHECKS, PROOF_MIN_TRADING_DAYS, proofWindows, wilsonInterval,
  type ProofReportInput
} from '../src/services/proof/proof-report';
import type { MarkedCheckTotals } from '../src/ports/sales';
import { MIN_RATE_SAMPLE } from '../src/services/analytics/compare-metric';
import { shiftServiceDay } from '../src/recommendation-code/service-day';

/** Spec 2026-11-18-owner-proof-report, step 1: AC1, AC2, AC4, AC6 (the pure part). Hand-checked examples H1..H5. */

const L = '2026-11-02';
const NOW = new Date('2027-03-01T12:00:00Z');
const pct = (v: number) => v * 100;

function check(businessDate: string, checkId: string, o: Partial<MarkedCheckTotals> = {}): MarkedCheckTotals {
  return { businessDate, checkId, covers: null, foodQuantity: 1, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0, bottleAmount: 0, hasCode: false, ...o };
}

/** `n` checks with food, `x` of them with a glass, spread over `days` days from `from`. */
function checks(from: string, n: number, x: number, days: number, prefix: string, hasCode = false): MarkedCheckTotals[] {
  return Array.from({ length: n }, (_, i) =>
    check(shiftServiceDay(from, i % days), `${prefix}${i}`, { hasCode, ...(i < x ? { glassQuantity: 1, glassAmount: 30 } : {}) }));
}

function input(base: [number, number], win: [number, number], extra: Partial<ProofReportInput> = {}): ProofReportInput {
  const w = proofWindows(L, 1, NOW);
  return {
    launchDay: L, window: 1, now: NOW, dataRange: { from: w.baseline.from, to: '2026-12-31' },
    baselineChecks: checks(w.baseline.from, base[1], base[0], 28, 'b'), windowChecks: checks(w.window.from, win[1], win[0], 28, 'w'), codes: null, ...extra
  };
}

describe('H1: checks and groups (AC1)', () => {
  it('5 checks with food, 2 with wine: 40.0%; with code 1 of 2, without 1 of 3', () => {
    const w = proofWindows(L, 1, NOW);
    const d = w.window.from;
    const rows = [
      check(d, '1', { foodQuantity: 2, glassQuantity: 1, glassAmount: 30 }),
      check(d, '2', { foodQuantity: 3 }),
      check(d, '3', { foodQuantity: 1, bottleQuantity: 0, bottleAmount: 0 }), // the returned bottle nets out
      check(d, '4', { foodQuantity: 0, glassQuantity: 2, glassAmount: 60 }), // bar
      check(d, '5', { foodQuantity: 2, bottleQuantity: 1, bottleAmount: 150, hasCode: true }),
      check(d, '6', { foodQuantity: 1, hasCode: true })
    ];
    const r = computeProofReport({ ...input([0, 0], [0, 0]), baselineChecks: [], windowChecks: rows });
    expect(r.window).toMatchObject({ foodChecks: 5, foodChecksWithWine: 2, attachRate: null, tradingDays: 1 }); // 5 < 30: no percent
    expect(r.groups?.withCode).toMatchObject({ foodChecks: 2, foodChecksWithWine: 1, attachRate: null, enough: false });
    expect(r.groups?.withoutCode).toMatchObject({ foodChecks: 3, foodChecksWithWine: 1, attachRate: null, enough: false });
  });

  it('the same six checks times thirty: rates show at the threshold, 40.0%, 50.0%, 33.3%', () => {
    const w = proofWindows(L, 1, NOW);
    const rows: MarkedCheckTotals[] = [];
    for (let k = 0; k < 30; k++) {
      const d = shiftServiceDay(w.window.from, k % 28);
      const p = `${k}-`;
      rows.push(
        check(d, p + '1', { foodQuantity: 2, glassQuantity: 1, glassAmount: 30 }), check(d, p + '2', { foodQuantity: 3 }), check(d, p + '3'),
        check(d, p + '4', { foodQuantity: 0, glassQuantity: 2, glassAmount: 60 }),
        check(d, p + '5', { foodQuantity: 2, bottleQuantity: 1, bottleAmount: 150, hasCode: true }), check(d, p + '6', { hasCode: true })
      );
    }
    const r = computeProofReport({ ...input([0, 0], [0, 0]), windowChecks: rows });
    expect(r.window?.attachRate).toBeCloseTo(0.4, 12);
    expect(r.groups?.withCode.attachRate).toBeCloseTo(0.5, 12);
    expect(r.groups?.withoutCode.attachRate).toBeCloseTo(1 / 3, 12);
    expect(r.groups?.withCode.wineRevenuePerTable).toBe(75);
    expect(r.groups?.withoutCode.wineRevenuePerTable).toBe(10);
  });

  it('each group has its own threshold: 30 with code, 29 without', () => {
    const w = proofWindows(L, 1, NOW);
    const rows = [...checks(w.window.from, 30, 30, 28, 'c', true), ...checks(w.window.from, 29, 3, 28, 'n')];
    const r = computeProofReport({ ...input([0, 0], [0, 0]), windowChecks: rows });
    expect(r.groups?.withCode).toMatchObject({ enough: true, attachRate: 1 });
    expect(r.groups?.withoutCode).toMatchObject({ enough: false, attachRate: null, wineRevenuePerTable: null });
    expect(JSON.stringify(r.groups)).not.toMatch(/delta|difference/i); // no change between the groups
  });
});

describe('Wilson and Newcombe: H2..H5 (AC2, tolerance 0.05 pp)', () => {
  const cases = [
    { name: 'H2', b: [42, 120], w: [65, 130], bw: [27.05, 43.88], ww: [41.53, 58.47], d: [15.0, 2.73, 26.62], verdict: 'increase' },
    { name: 'H3', b: [70, 200], w: [100, 210], bw: [28.73, 41.84], ww: [40.97, 54.36], d: [12.62, 3.08, 21.82], verdict: 'increase' },
    { name: 'H4', b: [40, 100], w: [46, 100], bw: [30.94, 49.8], ww: [36.56, 55.74], d: [6.0, -7.61, 19.3], verdict: 'inconclusive' },
    { name: 'H5', b: [12, 40], w: [18, 45], bw: [18.07, 45.43], ww: [27.02, 54.55], d: [10.0, -10.16, 28.81], verdict: 'inconclusive' }
  ] as const;
  for (const c of cases) {
    it(`${c.name}: intervals, change and verdict`, () => {
      const wb = wilsonInterval(c.b[0], c.b[1])!;
      const ww = wilsonInterval(c.w[0], c.w[1])!;
      expect(Math.abs(pct(wb.low) - c.bw[0])).toBeLessThan(0.05);
      expect(Math.abs(pct(wb.high) - c.bw[1])).toBeLessThan(0.05);
      expect(Math.abs(pct(ww.low) - c.ww[0])).toBeLessThan(0.05);
      expect(Math.abs(pct(ww.high) - c.ww[1])).toBeLessThan(0.05);
      const n = newcombeDifference({ x: c.b[0], n: c.b[1] }, { x: c.w[0], n: c.w[1] })!;
      expect(Math.abs(n.delta - c.d[0])).toBeLessThan(0.05);
      expect(Math.abs(n.low - c.d[1])).toBeLessThan(0.05);
      expect(Math.abs(n.high - c.d[2])).toBeLessThan(0.05);
      const r = computeProofReport(input([c.b[0], c.b[1]], [c.w[0], c.w[1]]));
      expect(r.reasons).toEqual([]);
      expect(r.verdict).toBe(c.verdict);
      expect(r.change?.lowPp).toBeCloseTo(n.low, 10);
    });
  }

  it('a decrease: the upper end is below 0', () => {
    expect(computeProofReport(input([70, 200], [40, 210])).verdict).toBe('decrease');
  });

  it('x = 0, x = n and n = 0 give no NaN and nothing outside 0..1', () => {
    expect(wilsonInterval(0, 50)).toMatchObject({ low: 0 });
    expect(wilsonInterval(50, 50)).toMatchObject({ high: 1 });
    for (const [x, n] of [[0, 50], [50, 50], [0, 1], [1, 1]]) {
      const i = wilsonInterval(x, n)!;
      expect(i.low).toBeGreaterThanOrEqual(0);
      expect(i.high).toBeLessThanOrEqual(1);
      expect(i.low).toBeLessThanOrEqual(i.high);
      expect(Number.isNaN(i.low + i.high)).toBe(false);
    }
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(newcombeDifference({ x: 0, n: 0 }, { x: 3, n: 40 })).toBeNull();
    const d = newcombeDifference({ x: 0, n: 40 }, { x: 40, n: 40 })!;
    expect([d.delta, d.low, d.high].every(Number.isFinite)).toBe(true);
    expect(d.delta).toBe(100);
    expect(d.high).toBeLessThanOrEqual(100);
    expect(newcombeDifference({ x: 40, n: 40 }, { x: 0, n: 40 })!.low).toBeGreaterThanOrEqual(-100);
  });
});

describe('thresholds and reasons (AC4)', () => {
  it('uses the threshold of E04, not a copy', () => {
    expect(PROOF_MIN_FOOD_CHECKS).toBe(MIN_RATE_SAMPLE);
    expect(PROOF_MIN_FOOD_CHECKS).toBe(30);
    expect(PROOF_MIN_TRADING_DAYS).toBe(14);
  });

  it('29 checks with food in the window: window_too_few_checks, counters but no change, interval, verdict or percent', () => {
    const r = computeProofReport(input([40, 100], [12, 29]));
    expect(r.reasons).toEqual(['window_too_few_checks']);
    expect(r.verdict).toBe('insufficient');
    expect(r.change).toBeNull();
    expect(r.minimumDetectableChangePp).toBeNull();
    expect(r.window).toMatchObject({ foodChecks: 29, foodChecksWithWine: 12, attachRate: null, interval: null });
    expect(r.baseline?.attachRate).toBeCloseTo(0.4, 12);
  });

  it('exactly 30: the change is computed', () => {
    const r = computeProofReport(input([40, 100], [20, 30]));
    expect(r.reasons).toEqual([]);
    expect(r.change).not.toBeNull();
    expect(r.window?.attachRate).toBeCloseTo(2 / 3, 12);
  });

  it('13 days with data: too_few_days; 14: ok', () => {
    const w = proofWindows(L, 1, NOW);
    const r13 = computeProofReport({ ...input([40, 100], [0, 0]), windowChecks: checks(w.window.from, 60, 20, 13, 'w') });
    expect(r13.reasons).toEqual(['window_too_few_days']);
    expect(r13.window).toMatchObject({ tradingDays: 13, foodChecks: 60 });
    expect(r13.window?.attachRate).toBeCloseTo(1 / 3, 12); // 60 checks: the percent shows, the change does not
    expect(r13.verdict).toBe('insufficient');
    const r14 = computeProofReport({ ...input([40, 100], [0, 0]), windowChecks: checks(w.window.from, 60, 20, 14, 'w') });
    expect(r14.reasons).toEqual([]);
    expect(r14.window?.tradingDays).toBe(14);
  });

  it('days with only bar checks are not days with data', () => {
    const w = proofWindows(L, 1, NOW);
    const bar = Array.from({ length: 20 }, (_, i) => check(shiftServiceDay(w.window.from, i), `bar${i}`, { foodQuantity: 0, glassQuantity: 1, glassAmount: 30 }));
    const r = computeProofReport({ ...input([40, 100], [0, 0]), windowChecks: [...checks(w.window.from, 60, 20, 13, 'w'), ...bar] });
    expect(r.window?.tradingDays).toBe(13);
  });

  it('baseline without data: baseline_no_data, and the dates to import are the baseline period', () => {
    const r = computeProofReport({ ...input([0, 0], [20, 60]), baselineChecks: [] });
    expect(r.reasons).toEqual(['baseline_no_data']);
    expect(r.baseline?.period).toEqual({ from: '2026-10-05', to: '2026-11-01' });
    expect(r.change).toBeNull();
  });

  it('baseline with too few checks and days: both reasons at once', () => {
    const r = computeProofReport(input([5, 20], [20, 60]));
    expect(r.reasons).toEqual(['baseline_too_few_checks']);
    const w = proofWindows(L, 1, NOW);
    const r2 = computeProofReport({ ...input([0, 0], [20, 60]), baselineChecks: checks(w.baseline.from, 20, 5, 10, 'b') });
    expect(r2.reasons).toEqual(['baseline_too_few_checks', 'baseline_too_few_days']);
  });

  it('data that ends before the window does: window_not_imported, not a result (even with enough rows)', () => {
    const r = computeProofReport(input([40, 100], [20, 60], { dataRange: { from: '2026-10-05', to: '2026-11-20' } }));
    expect(r.reasons).toEqual(['window_not_imported']);
    expect(r.verdict).toBe('insufficient');
    expect(r.dataThrough).toBe('2026-11-20');
  });

  it('a running window: window_incomplete, counters only', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const r = computeProofReport(input([40, 100], [5, 10], { now }));
    expect(r.reasons).toEqual(['window_incomplete']);
    expect(r.window).toMatchObject({ foodChecks: 10, foodChecksWithWine: 5 });
  });

  it('no launch day and no import', () => {
    expect(computeProofReport({ ...input([1, 1], [1, 1]), launchDay: null }).reasons).toEqual(['no_launch_day']);
    const r = computeProofReport({ ...input([1, 1], [1, 1]), dataRange: null });
    expect(r.reasons).toEqual(['no_sales_import']);
    expect(r.baseline).toBeNull();
    expect(r.groups).toBeNull();
  });

  it('ignores checks outside the period it was given', () => {
    const w = proofWindows(L, 1, NOW);
    const stray = checks(shiftServiceDay(w.window.to, 1), 200, 200, 5, 'x');
    const r = computeProofReport({ ...input([40, 100], [20, 60]), windowChecks: [...input([40, 100], [20, 60]).windowChecks, ...stray] });
    expect(r.window?.foodChecks).toBe(60);
  });

  it('is deterministic and does not touch its input', () => {
    const i = input([42, 120], [65, 130], { codes: { period: { from: L, to: L }, issued: 5, staffConfirmed: 3, posMatched: 2, ordered: 4, unmatchedPosCodes: 1 } });
    const frozen = JSON.stringify(i);
    const a = computeProofReport(i);
    expect(computeProofReport(i)).toEqual(a);
    expect(JSON.stringify(i)).toBe(frozen);
    expect(a.codes).toBe(i.codes); // passed through, R7
  });

  it('window 4 and later mark the baseline as old (R9); caveats are always there', () => {
    const w4 = computeProofReport({ ...input([0, 0], [0, 0]), window: 4, launchDay: null });
    expect(w4.oldBaseline).toBe(true);
    expect(computeProofReport({ ...input([0, 0], [0, 0]), window: 3, launchDay: null }).oldBaseline).toBe(false);
    expect(w4.caveats).toContain('not_causal');
  });

  it('rejects windows outside 1..12 and launch days that are not dates', () => {
    for (const bad of [0, 13, 1.5, NaN, 1e9]) expect(() => proofWindows(L, bad, NOW)).toThrow(/window/);
    for (const bad of ['2026-02-30', '2026-1-2', 'abc', '']) expect(() => proofWindows(bad, 1, NOW)).toThrow(/launch day/);
    expect(() => computeProofReport({ ...input([0, 0], [0, 0]), launchDay: null, window: 13 })).toThrow(/window/);
  });
});

describe('windows, service day and clock changes (AC6)', () => {
  it('baseline L-28..L-1; window k is 28 dates; windows follow each other', () => {
    const w1 = proofWindows('2026-11-02', 1, NOW);
    expect(w1.baseline).toEqual({ from: '2026-10-05', to: '2026-11-01' });
    expect(w1.window).toEqual({ from: '2026-11-02', to: '2026-11-29' });
    const w2 = proofWindows('2026-11-02', 2, NOW);
    expect(w2.window).toEqual({ from: '2026-11-30', to: '2026-12-27' });
    expect(w2.baseline).toEqual(w1.baseline); // the baseline never moves
    expect(w2.span).toEqual({ from: '2026-10-05', to: '2026-12-27' });
    expect(proofWindows('2026-11-02', 12, NOW).span.to <= '2027-11-01').toBe(true);
  });

  it('a window is complete only when its last day is not after yesterday\'s service day (02:00 and 05:00)', () => {
    // window 1 of L = 2026-11-02 ends 2026-11-29; yesterday's service day must be >= 2026-11-29
    const at = (iso: string) => proofWindows(L, 1, new Date(iso)).windowEnded;
    // 2026-11-30 02:00 Warsaw (CET, +1) = 01:00Z: still service day 11-29, so yesterday is 11-28: not ended
    expect(at('2026-11-30T01:00:00Z')).toBe(false);
    // 2026-11-30 05:00 Warsaw = 04:00Z: service day 11-30, yesterday 11-29: ended
    expect(at('2026-11-30T04:00:00Z')).toBe(true);
  });

  it('28 calendar dates across the clock changes of 2026-10-25 and 2027-03-28', () => {
    const autumn = proofWindows('2026-10-25', 1, NOW);
    expect(autumn.window).toEqual({ from: '2026-10-25', to: '2026-11-21' });
    expect(autumn.baseline).toEqual({ from: '2026-09-27', to: '2026-10-24' });
    const across = proofWindows('2026-10-20', 1, NOW).window; // contains the 25-hour day
    expect(across).toEqual({ from: '2026-10-20', to: '2026-11-16' });
    const spring = proofWindows('2027-03-28', 1, new Date('2027-06-01T12:00:00Z'));
    expect(spring.baseline).toEqual({ from: '2027-02-28', to: '2027-03-27' });
    expect(spring.window).toEqual({ from: '2027-03-28', to: '2027-04-24' });
    const count = (p: { from: string; to: string }) => { let n = 1; for (let d = p.from; d < p.to; d = shiftServiceDay(d, 1)) n++; return n; };
    for (const p of [autumn.baseline, autumn.window, across, spring.baseline, spring.window]) expect(count(p)).toBe(28);
  });

  it('the day of the clock change stays in its own window at the 04:00 cut-off', () => {
    // 2027-03-28 03:30 Warsaw does not exist; 2027-03-29 03:00 CEST = 01:00Z is service day 03-28
    const w = proofWindows('2027-03-01', 1, new Date('2027-03-29T01:00:00Z'));
    expect(w.lastFullDay).toBe('2027-03-27');
  });
});

describe('minimum detectable change', () => {
  it('matches an independent calculation', () => {
    expect(minimumDetectableChange(9, 30, 30)!).toBeCloseTo(24.898, 2);
    expect(minimumDetectableChange(12, 40, 45)!).toBeCloseTo(20.896, 2);
    expect(minimumDetectableChange(42, 120, 130)!).toBeCloseTo(12.208, 2);
  });

  it('a change just above it shows as an increase, just below it does not', () => {
    const m = minimumDetectableChange(12, 40, 45)!;
    const rate = (pp: number) => 12 / 40 + pp / 100;
    const low = (pp: number) => newcombeDifference({ x: 12, n: 40 }, { x: rate(pp) * 45, n: 45 })!.low;
    expect(low(m + 0.1)).toBeGreaterThan(0);
    expect(low(m - 0.1)).toBeLessThan(0);
  });

  it('is null for an empty sample and for samples too small to show anything', () => {
    expect(minimumDetectableChange(0, 0, 30)).toBeNull();
    expect(minimumDetectableChange(5, 10, 0)).toBeNull();
    expect(minimumDetectableChange(1, 2, 1)).toBeNull();
  });

  it('is reported by the report when it can give a verdict, from the same samples', () => {
    const h5 = computeProofReport(input([12, 40], [18, 45]));
    expect(h5.minimumDetectableChangePp).toBeCloseTo(20.896, 2); // H5: +10 pp is below it, hence inconclusive
    expect(h5.change!.deltaPp).toBeLessThan(h5.minimumDetectableChangePp!);
    const small = computeProofReport(input([12, 29], [18, 45]));
    expect(small.reasons).toEqual(['baseline_too_few_checks']);
    expect(small.minimumDetectableChangePp).toBeNull();
    const ok = computeProofReport(input([42, 120], [65, 130]));
    expect(ok.minimumDetectableChangePp).toBeCloseTo(12.208, 2);
  });
});
