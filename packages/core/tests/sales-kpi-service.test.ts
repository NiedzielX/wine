import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { defaultSalesPeriod, SalesKpiService } from '../src/services/sales/sales-kpi-service';
import type { SalesItemType } from '../src/services/sales/types';
import { businessDayTime, MAX_SALES_PERIOD_DAYS, salesPeriodSchema } from '../src/validators/sales/sales-period.schema';

/** Spec 2026-10-15-pos-sales-import-attach-rate, phase 2: `SalesKpiService` (R10, R12, AC7–AC10) and the period. */

function setup() {
  const ds = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  const service = new SalesKpiService(repos);
  let n = 0;
  const add = (restaurantId: string, businessDate: string, checkId: string, itemType: SalesItemType, quantity: number, netAmount: number, covers: number | null = null, replacedAt: string | null = null) =>
    store.salesLines.push({
      id: `5a1e5000-0000-4000-8000-${String(++n).padStart(12, '0')}`, businessDate, checkId, covers, itemType, quantity, netAmount,
      restaurantId, importJobId: 'job', replacedAt, replacedByJobId: replacedAt ? 'job-2' : null
    });
  return { ds, store, service, add, rid: ds.restaurant.id, slug: ds.restaurant.slug };
}

describe('SalesKpiService.getSalesKpis', () => {
  it('10 checks with food, 4 with wine, plus 2 bar checks with wine → 0.4 (AC7)', async () => {
    const { service, add, rid, slug } = setup();
    for (let i = 1; i <= 10; i++) {
      add(rid, '2026-10-01', `F${i}`, 'food', 2, 100, 2);
      if (i <= 2) add(rid, '2026-10-01', `F${i}`, 'wine_bottle', 1, 180);
      else if (i <= 4) add(rid, '2026-10-01', `F${i}`, 'wine_glass', 2, 60);
    }
    add(rid, '2026-10-02', 'B1', 'wine_glass', 1, 30);
    add(rid, '2026-10-02', 'B2', 'wine_bottle', 1, 200);
    const k = await service.getSalesKpis(slug, { from: '2026-10-01', to: '2026-10-02' });
    expect(k).toMatchObject({
      period: { from: '2026-10-01', to: '2026-10-02' }, source: 'sales_import', checks: 12, foodChecks: 10, foodChecksWithWine: 4, attachRate: 0.4, covers: 20,
      wineRevenue: 2 * 180 + 2 * 60 + 30 + 200, wineRevenuePerTable: 48, wineRevenuePerGuest: 24, averageBottle: 186.67, averageGlass: 30
    });
  });

  it('a period without checks with food → attachRate null, but data exists (AC8)', async () => {
    const { service, add, rid, slug } = setup();
    add(rid, '2026-10-05', 'B1', 'wine_glass', 2, 64);
    const bar = await service.getSalesKpis(slug, { from: '2026-10-05', to: '2026-10-05' });
    expect(bar).toMatchObject({ source: 'sales_import', checks: 1, foodChecks: 0, attachRate: null, wineRevenue: 64, wineRevenuePerTable: null });
    const none = await service.getSalesKpis(slug, { from: '2026-10-06', to: '2026-10-31' });
    expect(none).toMatchObject({ source: null, checks: 0, attachRate: null, covers: null, wineRevenue: 0 });
  });

  it('a returned bottle cancels the sale in its check: the check is not "with wine" (AC10)', async () => {
    const { service, add, rid, slug } = setup();
    add(rid, '2026-10-07', '1', 'food', 1, 80, 2);
    add(rid, '2026-10-07', '1', 'wine_bottle', 1, 180);
    add(rid, '2026-10-07', '1', 'wine_bottle', -1, -180);
    add(rid, '2026-10-07', '2', 'food', 1, 80, 2);
    add(rid, '2026-10-07', '2', 'wine_glass', 1, 30);
    const k = await service.getSalesKpis(slug, { from: '2026-10-07', to: '2026-10-07' });
    expect(k).toMatchObject({ foodChecks: 2, foodChecksWithWine: 1, attachRate: 0.5, wineRevenue: 30, averageBottle: null });
  });

  it('counts only the active lines of the restaurant asked about (AC9)', async () => {
    const { service, add, rid, slug } = setup();
    const other = '00000000-0000-4000-8000-000000000000';
    add(rid, '2026-10-08', '1', 'food', 1, 50, 2);
    add(other, '2026-10-08', '2', 'food', 1, 50, 2);
    add(other, '2026-10-08', '2', 'wine_glass', 1, 30);
    add(rid, '2026-10-08', '3', 'food', 1, 50, 2, '2026-10-09T10:00:00.000Z');   // replaced by a newer import
    add(rid, '2026-10-08', '3', 'wine_glass', 1, 30, null, '2026-10-09T10:00:00.000Z');
    const k = await service.getSalesKpis(slug, { from: '2026-10-08', to: '2026-10-08' });
    expect(k).toMatchObject({ checks: 1, foodChecks: 1, foodChecksWithWine: 0, attachRate: 0, wineRevenue: 0 });
  });

  it('accepts up to 366 days (to − from = 365) and refuses 367 with invalid_period', async () => {
    const { service, slug } = setup();
    await expect(service.getSalesKpis(slug, { from: '2025-01-01', to: '2026-01-01' })).resolves.toMatchObject({ source: null });   // 365
    await expect(service.getSalesKpis(slug, { from: '2024-01-01', to: '2024-12-31' })).resolves.toMatchObject({ source: null });   // leap year, 366 days
    await expect(service.getSalesKpis(slug, { from: '2024-01-01', to: '2025-01-01' })).rejects.toMatchObject({ name: 'ValidationError', code: 'invalid_period', fields: { to: 'too_long' } });
  });

  it('refuses a period that ends before it starts, a non-date or an extra field (invalid_period)', async () => {
    const { service, slug } = setup();
    await expect(service.getSalesKpis(slug, { from: '2026-10-02', to: '2026-10-01' })).rejects.toMatchObject({ code: 'invalid_period', fields: { to: 'before_from' } });
    await expect(service.getSalesKpis(slug, { from: '2026-02-30', to: '2026-03-01' })).rejects.toMatchObject({ code: 'invalid_period', fields: { from: 'invalid' } });
    await expect(service.getSalesKpis(slug, { from: '', to: '2026-03-01' })).rejects.toMatchObject({ code: 'invalid_period' });
    await expect(service.getSalesKpis(slug, { from: '2026-10-01', to: '2026-10-02', extra: 1 } as never)).rejects.toMatchObject({ code: 'invalid_period', fields: { extra: 'unknown_field' } });
    // the same day on both ends is a one-day period
    await expect(service.getSalesKpis(slug, { from: '2026-10-01', to: '2026-10-01' })).resolves.toMatchObject({ period: { from: '2026-10-01', to: '2026-10-01' } });
  });

  it('NotFoundError for an unknown restaurant, checked after the period', async () => {
    const { service } = setup();
    await expect(service.getSalesKpis('nowhere', { from: '2026-10-01', to: '2026-10-02' })).rejects.toMatchObject({ name: 'NotFoundError', code: 'not_found' });
    await expect(service.dataRange('nowhere')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('SalesKpiService.dataRange and the default period of A13', () => {
  it('is the first and the last day with active data, null with none', async () => {
    const { service, add, rid, slug } = setup();
    expect(await service.dataRange(slug)).toBeNull();
    add(rid, '2026-09-03', '1', 'food', 1, 10);
    add(rid, '2026-10-14', '2', 'food', 1, 10);
    add(rid, '2026-10-20', '3', 'food', 1, 10, null, '2026-10-21T10:00:00.000Z');
    expect(await service.dataRange(slug)).toEqual({ from: '2026-09-03', to: '2026-10-14' });
  });

  it('defaults to the 28 days ending on the last day with data; with none, the dashboard window (Warsaw)', () => {
    const now = new Date('2026-10-19T06:00:00.000Z');
    expect(defaultSalesPeriod({ from: '2026-09-03', to: '2026-10-14' }, now)).toEqual({ from: '2026-09-17', to: '2026-10-14' });
    expect(defaultSalesPeriod({ from: '2026-10-14', to: '2026-10-14' }, now)).toEqual({ from: '2026-09-17', to: '2026-10-14' });
    expect(defaultSalesPeriod(null, now)).toEqual({ from: '2026-09-21', to: '2026-10-18' });
  });
});

describe('salesPeriodSchema', () => {
  it('reads real calendar dates only', () => {
    expect(businessDayTime('2024-02-29')).not.toBeNull();
    expect(businessDayTime('2026-02-29')).toBeNull();
    expect(businessDayTime('2026-1-05')).toBeNull();
    expect(businessDayTime('2026-10-14T00:00')).toBeNull();
    expect(MAX_SALES_PERIOD_DAYS).toBe(366);
    expect(salesPeriodSchema.safeParse({ from: '2026-10-01', to: '2026-10-28' }).success).toBe(true);
    expect(salesPeriodSchema.safeParse({ from: '2026-10-01' }).success).toBe(false);
  });
});
