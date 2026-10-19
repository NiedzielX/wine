import { describe, expect, it } from 'vitest';
import { buildDemoDataset, type DemoDataset } from '../src/demo/dataset';
import { pairingScore } from '../src/engine/scoring';
import { localizeDish } from '../src/i18n/content';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import type { GuestInteractionInput } from '../src/ports/repositories';
import { AnalyticsService, PAIRING_ROWS_LIMIT } from '../src/services/analytics/analytics-service';
import { count, MIN_RATE_SAMPLE, money, rate } from '../src/services/analytics/compare-metric';
import { KPI_DAYS, kpiWindow, localDate, startOfLocalDay } from '../src/services/analytics/kpi-window';
import { SalesKpiService } from '../src/services/sales/sales-kpi-service';
import type { SalesItemType } from '../src/services/sales/types';
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
    const service = new AnalyticsService({ ...repos, clock: { now: () => NOW }, salesKpiService: new SalesKpiService(repos) });
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

describe('AnalyticsService.pairingPerformance (#22, R8, Q10, Q11, AC7–AC9)', () => {
  const NOW = new Date('2026-10-15T06:00:00.000Z');   // current window 17 Sep – 14 Oct
  let n = 0;
  const sid = () => `cc000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const ev = (sessionId: string, name: GuestInteractionInput['name'], at: string, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
    ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test', createdAt: new Date(at), ...extra });
  /** a guest session that saw `wineId` for `dishId` with `tier` and, when `select`, chose it */
  const saw = (at: string, dishId: string, wineId: string, tier: string, select = false) => {
    const s = sid();
    return [
      ev(s, 'guest_session_started', at, { props: { source: 'qr', menuVersion: null } }),
      ev(s, 'recommendations_viewed', at, { dishId, props: { wineIds: [wineId], items: [{ wineId, tier }], menuVersion: null } }),
      ...(select ? [ev(s, 'wine_selected', at, { dishId, wineId, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
    ];
  };
  const times = (k: number, make: (i: number) => GuestInteractionInput[]) => Array.from({ length: k }, (_, i) => make(i)).flat();

  function setup(change?: (ds: DemoDataset) => void) {
    const ds = structuredClone(buildDemoDataset({ ids: 'uuid' }));
    change?.(ds);
    const repos = createMemoryRepositories(MemoryStore.from(ds));
    return { ds, repo: repos.guestInteractionRepository, service: new AnalyticsService({ ...repos, clock: { now: () => NOW }, salesKpiService: new SalesKpiService(repos) }) };
  }
  const reviewed = (ds: DemoDataset) => ds.pairings.filter((p) => p.status === 'approved' || p.status === 'modified');
  const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;

  it('AC7 + AC9: shown, chosen, conversion and the source at the time of viewing; the Match Score is the engine’s', async () => {
    const { ds, repo, service } = setup();
    const top = reviewed(ds)[0];
    const engineWine = ds.wines.find((w) => w.active && !ds.pairings.some((p) => p.dishId === top.dishId && p.wineId === w.id))!;
    await seedUsageEvents(repo, ds.restaurant.id, [
      ...times(54, (i) => saw('2026-10-01T12:00:00.000Z', top.dishId, top.wineId, i % 2 ? 'sommelier' : 'sommelier_primary', i < 19)),
      ...times(3, (i) => saw('2026-10-02T12:00:00.000Z', top.dishId, engineWine.id, 'engine', i === 0)),
      // the previous window is not part of the table
      ...times(5, () => saw('2026-09-01T12:00:00.000Z', top.dishId, top.wineId, 'sommelier', true))
    ]);
    const p = (await service.pairingPerformance(ds.restaurant.slug))!;
    expect(p.period.current).toEqual({ from: '2026-09-17', to: '2026-10-14' });
    const dish = byId(ds.dishes, top.dishId);
    const wine = byId(ds.wines, top.wineId);
    expect(p.rows[0]).toEqual({
      dish: { id: dish.id, name: dish.name },
      wine: { id: wine.id, name: wine.name, producer: wine.producer, vintage: String(wine.vintage) },
      source: 'sommelier', matchScore: pairingScore(dish, wine).score, shown: 54, chosen: 19, conversion: 19 / 54
    });
    expect(p.rows[1]).toMatchObject({ wine: { id: engineWine.id }, source: 'engine', shown: 3, chosen: 1, conversion: 1 / 3, matchScore: pairingScore(dish, engineWine).score });
    expect(p.omitted).toBe(0);
  });

  it('AC8: reviewed pairings guests never saw are rows with no views (conversion null) — only a published dish with an active wine', async () => {
    const draftDish = 'Polish cheese selection';
    const { ds, service } = setup((d) => {
      const draft = d.dishes.find((x) => x.name === draftDish)!;
      const hidden = d.wines.find((w) => !w.active)!;
      const extra = d.pairings.filter((x) => x.status === 'suggested').slice(0, 2);
      extra[0].dishId = draft.id;   // approved, but the dish is a draft
      extra[0].status = 'approved';
      extra[1].wineId = hidden.id;  // approved, but the wine is hidden
      extra[1].status = 'approved';
    });
    const p = (await service.pairingPerformance(ds.restaurant.slug))!;
    const visible = reviewed(ds).filter((x) => byId(ds.dishes, x.dishId).status === 'published' && byId(ds.wines, x.wineId).active);
    expect(visible.length).toBeLessThan(reviewed(ds).length);
    expect(p.total).toBe(visible.length);
    expect(p.rows).toHaveLength(visible.length);
    for (const r of p.rows) expect(r).toMatchObject({ source: 'sommelier', shown: 0, chosen: 0, conversion: null });
    expect(p.rows.some((r) => r.dish.name === draftDish)).toBe(false);
    expect(p.rows.some((r) => !byId(ds.wines, r.wine.id).active)).toBe(false);
    // no views: sorted by dish name, then wine name
    const names = p.rows.map((r) => r.dish.name);
    expect(names).toEqual([...names].sort(new Intl.Collator('en').compare));
  });

  it('a pairing rejected today but seen as the sommelier’s keeps its historical row; seen once as engine, once as sommelier → two rows', async () => {
    const { ds, repo, service } = setup();
    const rejected = ds.pairings.find((x) => x.status === 'rejected')!;
    const top = reviewed(ds)[0];
    await seedUsageEvents(repo, ds.restaurant.id, [
      ...times(2, () => saw('2026-10-01T12:00:00.000Z', rejected.dishId, rejected.wineId, 'sommelier')),
      ...saw('2026-10-01T12:00:00.000Z', top.dishId, top.wineId, 'engine'),
      ...saw('2026-10-03T12:00:00.000Z', top.dishId, top.wineId, 'sommelier_primary', true)
    ]);
    const p = (await service.pairingPerformance(ds.restaurant.slug))!;
    expect(p.rows.filter((r) => r.dish.id === rejected.dishId && r.wine.id === rejected.wineId)).toEqual([
      expect.objectContaining({ source: 'sommelier', shown: 2, chosen: 0, conversion: 0 })
    ]);
    // the pair with views has no extra "no views" row
    expect(p.rows.filter((r) => r.dish.id === top.dishId && r.wine.id === top.wineId).map((r) => [r.source, r.shown, r.chosen])).toEqual([['sommelier', 1, 1], ['engine', 1, 0]]);
    expect(p.rows.slice(0, 3).map((r) => r.shown)).toEqual([2, 1, 1]);
  });

  it('rows whose dish or wine left the catalog are omitted and counted; limit cuts the rows, total keeps them all', async () => {
    const { ds, repo, service } = setup();
    const top = reviewed(ds)[0];
    const gone = 'dddddddd-0000-4000-8000-000000000001';
    await seedUsageEvents(repo, ds.restaurant.id, [
      ...saw('2026-10-01T12:00:00.000Z', gone, top.wineId, 'engine'),
      ...saw('2026-10-01T12:00:00.000Z', top.dishId, gone, 'sommelier')
    ]);
    const all = (await service.pairingPerformance(ds.restaurant.slug))!;
    expect(all.omitted).toBe(2);
    expect(all.total).toBe(all.rows.length);
    expect(all.total).toBeGreaterThan(PAIRING_ROWS_LIMIT);
    const top10 = (await service.pairingPerformance(ds.restaurant.slug, { limit: PAIRING_ROWS_LIMIT }))!;
    expect(top10.rows).toEqual(all.rows.slice(0, PAIRING_ROWS_LIMIT));
    expect(top10).toMatchObject({ total: all.total, omitted: 2 });
  });

  it('dish names in the panel language; an unknown restaurant → null', async () => {
    const { ds, service } = setup();
    const p = (await service.pairingPerformance(ds.restaurant.slug, { locale: 'pl' }))!;
    for (const r of p.rows) expect(r.dish.name).toBe(localizeDish(byId(ds.dishes, r.dish.id), 'pl').name);
    expect(await service.pairingPerformance('no-such-place')).toBeNull();
  });
});

describe('AnalyticsService.salesSummary (#21, R4–R7, Q3, AC4–AC6)', () => {
  const NOW = new Date('2026-10-15T06:00:00.000Z');   // current window 17 Sep – 14 Oct, previous 20 Aug – 16 Sep
  function setup() {
    const ds = buildDemoDataset({ ids: 'uuid' });
    const store = MemoryStore.from(ds);
    const repos = createMemoryRepositories(store);
    const service = new AnalyticsService({ ...repos, clock: { now: () => NOW }, salesKpiService: new SalesKpiService(repos) });
    let n = 0;
    const line = (businessDate: string, checkId: string, itemType: SalesItemType, quantity: number, netAmount: number, covers: number | null = null, restaurantId = ds.restaurant.id) =>
      store.salesLines.push({
        id: `5a1e5000-0000-4000-8000-${String(++n).padStart(12, '0')}`, businessDate, checkId, covers, itemType, quantity, netAmount,
        restaurantId, importJobId: 'job', replacedAt: null, replacedByJobId: null
      });
    /** `food` checks with food and two guests on `day`; the first `withWine` of them also have a 180 zł bottle, the next `withGlass` two 30 zł glasses */
    const checks = (day: string, prefix: string, food: number, withWine: number, withGlass = 0) => {
      for (let i = 1; i <= food; i++) {
        line(day, `${prefix}${i}`, 'food', 2, 100, 2);
        if (i <= withWine) line(day, `${prefix}${i}`, 'wine_bottle', 1, 180);
        else if (i <= withWine + withGlass) line(day, `${prefix}${i}`, 'wine_glass', 2, 60);
      }
    };
    return { ds, store, repos, service, line, checks, slug: ds.restaurant.slug };
  }

  it('AC4: the attach rate per check in pp with its sample in checks with food, the four amounts in %', async () => {
    const { service, checks, line, slug } = setup();
    checks('2026-10-01', 'C', 40, 10, 10);   // 20 of 40 with wine: 0.5
    line('2026-10-02', 'BAR1', 'wine_glass', 1, 30);   // a bar check: wine revenue, never the rate
    checks('2026-09-01', 'P', 40, 8, 8);     // 16 of 40: 0.4
    checks('2026-10-15', 'T', 5, 5);         // today: in neither window
    const s = (await service.salesSummary(slug))!;
    expect(s.period).toEqual({ current: { from: '2026-09-17', to: '2026-10-14' }, previous: { from: '2026-08-20', to: '2026-09-16' } });
    expect(s.source).toBe('sales_import');
    expect(s.latestDataDay).toBe('2026-10-15');
    expect(s.attachRate).toMatchObject({ value: 0.5, previous: 0.4, unit: 'pp', noChange: null, sample: { numerator: 20, denominator: 40, previousDenominator: 40 } });
    expect(s.attachRate.change).toBeCloseTo(10, 9);
    // per table: (10 × 180 + 10 × 60) / 40 = 60 vs (8 × 180 + 8 × 60) / 40 = 48 → +25%
    expect(s.wineRevenuePerTable).toMatchObject({ value: 60, previous: 48, change: 25, unit: '%' });
    // per guest: 2400 / 80 covers = 30 vs 1920 / 80 = 24 → +25%
    expect(s.wineRevenuePerGuest).toMatchObject({ value: 30, previous: 24, change: 25, unit: '%' });
    expect(s.averageBottle).toMatchObject({ value: 180, previous: 180, change: 0 });
    // glasses: (600 + 30) / 21 = 30 vs 480 / 16 = 30
    expect(s.averageGlass).toMatchObject({ value: 30, previous: 30, change: 0 });
  });

  it(`AC6: fewer than ${MIN_RATE_SAMPLE} checks with food in either window keep the rate and hide its change`, async () => {
    const { service, checks, slug } = setup();
    checks('2026-10-01', 'C', 29, 10);
    checks('2026-09-01', 'P', 40, 8);
    const s = (await service.salesSummary(slug))!;
    expect(s.attachRate).toMatchObject({ value: 10 / 29, change: null, noChange: 'small_sample', sample: { numerator: 10, denominator: 29, previousDenominator: 40 } });
    expect(s.wineRevenuePerTable.noChange).toBeNull();
  });

  it('AC5 + Q3: no sales in the current window → source null with the latest day; the previous window alone is not a fall', async () => {
    const { service, checks, slug } = setup();
    checks('2026-09-02', 'P', 40, 8);
    const s = (await service.salesSummary(slug))!;
    expect(s.source).toBeNull();
    expect(s.latestDataDay).toBe('2026-09-02');
    expect(s.attachRate).toMatchObject({ value: null, previous: 0.2, change: null, noChange: 'no_comparison' });
    expect(s.wineRevenuePerTable).toMatchObject({ value: null, change: null, noChange: 'no_comparison' });
  });

  it('nothing imported at all → source and latestDataDay null; the previous window empty → no comparison', async () => {
    const { service, checks, slug } = setup();
    const none = (await service.salesSummary(slug))!;
    expect(none).toMatchObject({ source: null, latestDataDay: null });
    expect(none.attachRate).toMatchObject({ value: null, previous: null, noChange: 'no_comparison', sample: { numerator: 0, denominator: 0, previousDenominator: 0 } });
    checks('2026-10-01', 'C', 40, 10);
    const first = (await service.salesSummary(slug))!;
    expect(first.attachRate).toMatchObject({ value: 0.25, previous: null, change: null, noChange: 'no_comparison' });
    expect(first.wineRevenuePerTable).toMatchObject({ value: 45, previous: null, noChange: 'no_comparison' });
  });

  it('bar checks only → data, but no attach rate (null) and no revenue per table; the bottle average stays', async () => {
    const { service, line, slug } = setup();
    line('2026-10-05', 'BAR1', 'wine_bottle', 1, 200);
    const s = (await service.salesSummary(slug))!;
    expect(s.source).toBe('sales_import');
    expect(s.attachRate).toMatchObject({ value: null, sample: { numerator: 0, denominator: 0, previousDenominator: 0 } });
    expect(s.wineRevenuePerTable.value).toBeNull();
    expect(s.averageBottle.value).toBe(200);
  });

  it('R4 + R10: only the restaurant’s POS sales — guest events are not read (and codes are not a dependency); another restaurant is not counted', async () => {
    const { repos, service, checks, line, slug } = setup();
    checks('2026-10-01', 'C', 40, 10);
    line('2026-10-01', 'X1', 'food', 1, 100, 2, 'f0000000-0000-4000-8000-000000000099');
    line('2026-10-01', 'X1', 'wine_bottle', 1, 900, null, 'f0000000-0000-4000-8000-000000000099');
    const calls: string[] = [];
    const guestRepo = new Proxy(repos.guestInteractionRepository, { get: (t, k) => { calls.push(String(k)); return Reflect.get(t, k); } });
    const isolated = new AnalyticsService({ ...repos, guestInteractionRepository: guestRepo, clock: { now: () => NOW }, salesKpiService: new SalesKpiService(repos) });
    const s = (await isolated.salesSummary(slug))!;
    expect(calls).toEqual([]);
    expect(s.attachRate.sample).toEqual({ numerator: 10, denominator: 40, previousDenominator: 0 });
    expect(s.wineRevenuePerTable.value).toBe(45);
    expect(await service.salesSummary('no-such-place')).toBeNull();
  });
});
