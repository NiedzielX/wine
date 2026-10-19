import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import type { GuestInteractionInput } from '../src/ports/repositories';
import { AnalyticsService } from '../src/services/analytics/analytics-service';
import { count, MIN_RATE_SAMPLE, money, rate } from '../src/services/analytics/compare-metric';
import { KPI_DAYS, kpiWindow, localDate, startOfLocalDay } from '../src/services/analytics/kpi-window';
import { seedUsageEvents } from '../src/testing/usage-events';

/** Spec 2026-10-15-kpi-dashboard, phase 1: the window, the comparison rules and the usage summary. */

describe('kpiWindow: the last 28 full days in Warsaw, ending yesterday (R1)', () => {
  it('ends yesterday and starts 27 days before it; the previous window is the 28 days right before', () => {
    const w = kpiWindow(new Date('2026-10-15T06:00:00.000Z'));   // Thursday 15 Oct, 08:00 in Warsaw
    expect(w.current).toEqual({ from: '2026-09-17', to: '2026-10-14' });
    expect(w.previous).toEqual({ from: '2026-08-20', to: '2026-09-16' });
    expect(w.currentRange.from.toISOString()).toBe('2026-09-16T22:00:00.000Z');
    expect(w.currentRange.to.toISOString()).toBe('2026-10-14T22:00:00.000Z');
    expect(w.previousRange.to.getTime()).toBe(w.currentRange.from.getTime());
    expect(w.previousRange.from.toISOString()).toBe('2026-08-19T22:00:00.000Z');
    expect(KPI_DAYS).toBe(28);
  });

  it('takes the date in Warsaw, not in UTC: 01:30 local on the 16th is already the 16th', () => {
    expect(kpiWindow(new Date('2026-10-15T23:30:00.000Z')).current.to).toBe('2026-10-15');
    expect(kpiWindow(new Date('2026-10-15T21:59:59.999Z')).current.to).toBe('2026-10-14');
    expect(localDate(new Date('2026-12-31T23:00:00.000Z'))).toBe('2027-01-01');
  });

  it('keeps local midnights across the clock change on 25 Oct 2026 (the window is 28 days and one hour long)', () => {
    const w = kpiWindow(new Date('2026-11-10T12:00:00.000Z'));
    expect(w.current).toEqual({ from: '2026-10-13', to: '2026-11-09' });
    expect(w.currentRange.from.toISOString()).toBe('2026-10-12T22:00:00.000Z');   // CEST, +02:00
    expect(w.currentRange.to.toISOString()).toBe('2026-11-09T23:00:00.000Z');     // CET, +01:00
    expect(w.currentRange.to.getTime() - w.currentRange.from.getTime()).toBe((28 * 24 + 1) * 3600_000);
    expect(startOfLocalDay('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');   // the spring change
    expect(startOfLocalDay('2026-03-30').toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });
});

describe('compare-metric: change in display units, hidden for missing or small samples (R5, R6)', () => {
  it('counts and amounts change in % relative to the previous window; previous 0 or null → no comparison', () => {
    expect(count(412, 349)).toMatchObject({ value: 412, previous: 349, unit: '%', noChange: null });
    expect(count(412, 349).change).toBeCloseTo(18.05, 2);
    expect(count(0, 10)).toMatchObject({ change: -100, noChange: null });
    expect(count(5, 0)).toEqual({ value: 5, previous: 0, change: null, unit: '%', noChange: 'no_comparison' });
    expect(money(null, 120)).toMatchObject({ change: null, noChange: 'no_comparison' });
    expect(money(150, 120)).toMatchObject({ change: 25, unit: '%' });
  });

  it('rates are fractions with the change in percentage points and the sample (N of M)', () => {
    const m = rate(129, 413, 100, 369);
    expect(m.value).toBeCloseTo(0.3123, 4);
    expect(m.unit).toBe('pp');
    expect(m.change).toBeCloseTo(4.13, 2);
    expect(m.sample).toEqual({ numerator: 129, denominator: 413, previousDenominator: 369 });
    expect(rate(312, 1000, 271, 1000).change).toBeCloseTo(4.1, 9);
  });

  it(`hides the change of a rate whose denominator is below ${MIN_RATE_SAMPLE} in either window`, () => {
    expect(MIN_RATE_SAMPLE).toBe(30);
    expect(rate(5, 29, 10, 40)).toMatchObject({ change: null, noChange: 'small_sample' });
    expect(rate(5, 40, 10, 29)).toMatchObject({ change: null, noChange: 'small_sample' });
    expect(rate(5, 30, 10, 30)).toMatchObject({ noChange: null });
    expect(rate(5, 30, 10, 30).change).toBeCloseTo(-16.67, 2);
  });

  it('a rate without a denominator has no value and no comparison', () => {
    expect(rate(0, 0, 3, 40)).toEqual({ value: null, previous: 0.075, change: null, unit: 'pp', noChange: 'no_comparison', sample: { numerator: 0, denominator: 0, previousDenominator: 40 } });
    expect(rate(3, 40, 0, 0)).toMatchObject({ value: 0.075, previous: null, noChange: 'no_comparison' });
  });
});

describe('AnalyticsService.usageSummary (R2, R3, AC1–AC3)', () => {
  const ds = buildDemoDataset({ ids: 'uuid' });
  const NOW = new Date('2026-10-15T06:00:00.000Z');   // current window 17 Sep – 14 Oct, previous 20 Aug – 16 Sep
  const [d1, d2] = [ds.dishes[0].id, ds.dishes[1].id];
  const wine = ds.wines[0].id;
  let n = 0;
  const sid = () => `aa000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const ev = (sessionId: string, name: GuestInteractionInput['name'], at: string, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
    ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test', createdAt: new Date(at), ...extra });
  /** a guest session started at `at` that views `dishes` and, when `select`, chooses a wine for the first one */
  const guest = (at: string, dishes: string[], select = false) => {
    const s = sid();
    return [
      ev(s, 'guest_session_started', at, { props: { source: 'qr', menuVersion: null } }),
      ...dishes.map((dishId) => ev(s, 'recommendations_viewed', at, { dishId, props: { wineIds: [wine], items: [{ wineId: wine, tier: 'engine' }], menuVersion: null } })),
      ...(select ? [ev(s, 'wine_selected', at, { dishId: dishes[0], wineId: wine, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
    ];
  };
  const times = (k: number, make: () => GuestInteractionInput[]) => Array.from({ length: k }, make).flat();

  function setup() {
    const repos = createMemoryRepositories(MemoryStore.from(ds));
    const service = new AnalyticsService({ restaurantRepository: repos.restaurantRepository, guestInteractionRepository: repos.guestInteractionRepository, clock: { now: () => NOW } });
    return { repo: repos.guestInteractionRepository, service };
  }

  it('AC1: sessions, distinct dish views and the conversion with N of M and the change against the previous 28 days', async () => {
    const { repo, service } = setup();
    await seedUsageEvents(repo, ds.restaurant.id, [
      // current: 40 sessions viewing (13 select, 4 of them view two dishes), 8 without a view
      ...times(13, () => guest('2026-10-01T12:00:00.000Z', [d1], true)),
      ...times(4, () => guest('2026-10-02T12:00:00.000Z', [d1, d2])),
      ...times(23, () => guest('2026-10-03T12:00:00.000Z', [d2])),
      ...times(8, () => guest('2026-09-17T00:00:00.000Z', [])),
      // previous: 32 sessions viewing, 8 select
      ...times(8, () => guest('2026-09-01T12:00:00.000Z', [d1], true)),
      ...times(24, () => guest('2026-09-16T21:00:00.000Z', [d2])),
      // the waiter: a lookup in each window, plus a second look at the same dish
      ev('bb000000-0000-4000-8000-000000000001', 'staff_lookup', '2026-10-05T12:00:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [wine], menuVersion: null } }),
      ev('bb000000-0000-4000-8000-000000000001', 'staff_lookup', '2026-10-05T12:05:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [wine], menuVersion: null } }),
      ev('bb000000-0000-4000-8000-000000000002', 'staff_lookup', '2026-09-05T12:00:00.000Z', { dishId: d2, props: { source: 'staff', prefs: {}, wineIds: [wine], menuVersion: null } }),
      // today (unfinished) is in neither window
      ...guest('2026-10-15T05:00:00.000Z', [d1], true)
    ]);
    const s = (await service.usageSummary(ds.restaurant.slug))!;
    expect(s.period).toEqual({ current: { from: '2026-09-17', to: '2026-10-14' }, previous: { from: '2026-08-20', to: '2026-09-16' } });
    expect(s.hasData).toBe(true);
    expect(s.sessions).toMatchObject({ value: 48, previous: 32, change: 50, unit: '%' });
    expect(s.recommendationViews).toMatchObject({ value: 44, previous: 32, unit: '%' });
    expect(s.recommendationViews.change).toBeCloseTo(37.5, 9);
    expect(s.recommendationToSelection.value).toBeCloseTo(13 / 40, 9);
    expect(s.recommendationToSelection.previous).toBeCloseTo(8 / 32, 9);
    expect(s.recommendationToSelection.change).toBeCloseTo(7.5, 9);
    expect(s.recommendationToSelection.sample).toEqual({ numerator: 13, denominator: 40, previousDenominator: 32 });
    expect(s.staffLookups).toMatchObject({ value: 1, previous: 1, change: 0 });
  });

  it('AC2: no guest session in either window → hasData false (the waiter alone does not count)', async () => {
    const { repo, service } = setup();
    await seedUsageEvents(repo, ds.restaurant.id, [
      ev('bb000000-0000-4000-8000-000000000003', 'staff_lookup', '2026-10-05T12:00:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [], menuVersion: null } })
    ]);
    const s = (await service.usageSummary(ds.restaurant.slug))!;
    expect(s.hasData).toBe(false);
    expect(s.sessions).toMatchObject({ value: 0, previous: 0, noChange: 'no_comparison' });
    expect(s.recommendationToSelection).toMatchObject({ value: null, noChange: 'no_comparison' });
    expect(s.staffLookups.value).toBe(1);
  });

  it('events only in the previous window: counts fall to 0 (▼ 100%), the conversion has no value', async () => {
    const { repo, service } = setup();
    await seedUsageEvents(repo, ds.restaurant.id, times(3, () => guest('2026-09-01T12:00:00.000Z', [d1], true)));
    const s = (await service.usageSummary(ds.restaurant.slug))!;
    expect(s.hasData).toBe(true);
    expect(s.sessions).toMatchObject({ value: 0, previous: 3, change: -100 });
    expect(s.recommendationToSelection).toMatchObject({ value: null, previous: 1, change: null, noChange: 'no_comparison' });
  });

  it('a small sample keeps the rate and hides its change', async () => {
    const { repo, service } = setup();
    await seedUsageEvents(repo, ds.restaurant.id, [
      ...times(5, () => guest('2026-10-01T12:00:00.000Z', [d1], true)), ...times(11, () => guest('2026-10-01T12:00:00.000Z', [d1])),
      ...times(40, () => guest('2026-09-01T12:00:00.000Z', [d1]))
    ]);
    const s = (await service.usageSummary(ds.restaurant.slug))!;
    expect(s.recommendationToSelection).toMatchObject({ value: 5 / 16, change: null, noChange: 'small_sample', sample: { numerator: 5, denominator: 16, previousDenominator: 40 } });
  });

  it('an unknown restaurant → null', async () => {
    expect(await setup().service.usageSummary('no-such-place')).toBeNull();
  });
});
