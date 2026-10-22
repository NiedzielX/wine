import type { OnceRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { ImportJob } from '../import/types';
import type { Repositories } from '../ports/repositories';
import type { SalesImportPlan } from '../ports/import';
import { SalesKpiService } from '../services/sales/sales-kpi-service';
import type { CheckKey, SalesItemType, SalesRecord } from '../services/sales/types';

/**
 * `SalesRepository` cases of the repository contract (spec 2026-10-15-pos-sales-import-attach-rate, R7, R10, AC9,
 * AC10). Called from `repositoryContract`, so memory and PostgreSQL run the same cases. Lines are written the only way
 * the application writes them, through a confirmed sales import. The setup runs once per file: every case uses its own
 * business days (2033) and check numbers.
 */
export function salesContract(t: Omit<OnceRunner, 'beforeAll' | 'afterAll'>, get: () => { repos: Repositories; ds: DemoDataset }): void {
  const OTHER = '00000000-0000-4000-8000-000000000000';
  let n = 0;
  const uuid = (prefix: string) => `${prefix}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const line = (businessDate: string, checkId: string, itemType: SalesItemType, quantity: number, netAmount: number, covers: number | null = null): SalesRecord =>
    ({ id: uuid('5a1e5000'), businessDate, checkId, covers, itemType, quantity, netAmount, recommendationCode: null });

  /** An import job of the restaurant, confirmed with these lines. Returns how many checks it replaced. */
  async function importLines(records: SalesRecord[]): Promise<number> {
    const { repos, ds } = get();
    const job: ImportJob = {
      id: uuid('5a1e0b00'), restaurantId: ds.restaurant.id, kind: 'sales', fileName: 'sales.csv', fileType: 'csv', fileSize: 100, status: 'preview_ready', parser: 'csv',
      rows: [], notes: [], error: null, createdBy: 'Contract', createdAt: '2033-01-01T10:00:00.000Z', confirmedAt: null, result: null
    };
    await repos.importRepository.create(job);
    const checks = new Map<string, CheckKey>(records.map((r) => [`${r.businessDate}|${r.checkId}`, { businessDate: r.businessDate, checkId: r.checkId }]));
    const plan: SalesImportPlan = { kind: 'sales', records, checks: [...checks.values()], result: { created: records.length, updated: 0, skipped: 0, suggestions: 0 } };
    return (await repos.importRepository.confirm(ds.restaurant.id, job.id, plan, '2033-01-01T12:00:00.000Z')).replacedChecks;
  }

  t.it('sums the active lines per check: food, glasses and bottles, the largest covers, returns subtracted (AC10)', async () => {
    const { repos, ds } = get();
    await importLines([
      line('2033-01-02', '1', 'food', 2, 120, 2), line('2033-01-02', '1', 'wine_bottle', 1, 200, 3), line('2033-01-02', '1', 'other', 2, 20),
      line('2033-01-02', '2', 'food', 1, 60, 1), line('2033-01-02', '2', 'wine_bottle', 1, 180), line('2033-01-02', '2', 'wine_bottle', -1, -180),
      line('2033-01-03', '1', 'wine_glass', 2, 64), line('2033-01-03', '1', 'wine_glass', 0.5, 16)
    ]);
    const totals = await repos.salesRepository.checkTotals(ds.restaurant.id, { from: '2033-01-02', to: '2033-01-03' });
    t.expect(totals).toEqual([
      { businessDate: '2033-01-02', checkId: '1', covers: 3, foodQuantity: 2, glassQuantity: 0, glassAmount: 0, bottleQuantity: 1, bottleAmount: 200 },
      { businessDate: '2033-01-02', checkId: '2', covers: 1, foodQuantity: 1, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0, bottleAmount: 0 },
      { businessDate: '2033-01-03', checkId: '1', covers: null, foodQuantity: 0, glassQuantity: 2.5, glassAmount: 80, bottleQuantity: 0, bottleAmount: 0 }
    ]);
    // both ends of the period are inclusive
    t.expect((await repos.salesRepository.checkTotals(ds.restaurant.id, { from: '2033-01-03', to: '2033-01-03' })).length).toBe(1);
    t.expect(await repos.salesRepository.checkTotals(ds.restaurant.id, { from: '2033-01-04', to: '2033-01-31' })).toEqual([]);
  });

  t.it('a second import of the same checks replaces their lines: the active lines and the sums do not double (R7)', async () => {
    const { repos, ds } = get();
    const period = { from: '2033-02-01', to: '2033-02-28' };
    const file = () => [line('2033-02-01', 'A1', 'food', 1, 50, 2), line('2033-02-01', 'A1', 'wine_glass', 2, 60), line('2033-02-02', 'B7', 'food', 3, 90, 3)];
    t.expect(await importLines(file())).toBe(0);
    const first = await repos.salesRepository.checkTotals(ds.restaurant.id, period);
    t.expect(await importLines(file())).toBe(2);
    t.expect(await repos.salesRepository.checkTotals(ds.restaurant.id, period)).toEqual(first);
    // a corrected export replaces one check and leaves the other alone
    t.expect(await importLines([line('2033-02-01', 'A1', 'food', 1, 50, 2)])).toBe(1);
    const after = await repos.salesRepository.checkTotals(ds.restaurant.id, period);
    t.expect(after.map((c) => [c.checkId, c.glassQuantity, c.foodQuantity])).toEqual([['A1', 0, 1], ['B7', 0, 3]]);
    t.expect(await repos.salesRepository.countChecks(ds.restaurant.id, [{ businessDate: '2033-02-01', checkId: 'A1' }, { businessDate: '2033-02-02', checkId: 'B7' }, { businessDate: '2033-02-03', checkId: 'A1' }])).toBe(2);
  });

  t.it('a check is its day and its number: the same number on another day is another check', async () => {
    const { repos, ds } = get();
    await importLines([line('2033-03-01', '5', 'food', 1, 10)]);
    t.expect(await importLines([line('2033-03-02', '5', 'food', 1, 10)])).toBe(0);
    t.expect((await repos.salesRepository.checkTotals(ds.restaurant.id, { from: '2033-03-01', to: '2033-03-02' })).length).toBe(2);
    // a check number is compared whole and exactly
    t.expect(await repos.salesRepository.countChecks(ds.restaurant.id, [{ businessDate: '2033-03-01', checkId: '5 ' }, { businessDate: '2033-03-01', checkId: '55' }])).toBe(0);
  });

  t.it('keeps sales within their restaurant (AC9)', async () => {
    const { repos, ds } = get();
    await importLines([line('2033-04-01', 'T1', 'food', 1, 10, 2)]);
    t.expect(await repos.salesRepository.checkTotals(OTHER, { from: '2033-01-01', to: '2033-12-31' })).toEqual([]);
    t.expect(await repos.salesRepository.dataRange(OTHER)).toBeNull();
    t.expect(await repos.salesRepository.countChecks(OTHER, [{ businessDate: '2033-04-01', checkId: 'T1' }])).toBe(0);
    t.expect(await repos.salesRepository.countChecks(ds.restaurant.id, [{ businessDate: '2033-04-01', checkId: 'T1' }])).toBe(1);
    t.expect(await repos.salesRepository.countChecks(ds.restaurant.id, [])).toBe(0);
  });

  t.it('SalesKpiService over the store: 4 of 10 checks with food → 0.4; bar checks and a returned bottle do not count (AC7, AC10, phase 2)', async () => {
    const { repos, ds } = get();
    const lines: SalesRecord[] = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(line('2033-06-01', `F${i}`, 'food', 1, 50, 2));
      if (i <= 4) lines.push(line('2033-06-01', `F${i}`, i % 2 ? 'wine_bottle' : 'wine_glass', i % 2 ? 1 : 2, i % 2 ? 160 : 60));
    }
    lines.push(line('2033-06-02', 'R', 'food', 1, 50, 2), line('2033-06-02', 'R', 'wine_bottle', 1, 160), line('2033-06-02', 'R', 'wine_bottle', -1, -160));
    lines.push(line('2033-06-02', 'BAR', 'wine_glass', 1, 30));
    await importLines(lines);
    const service = new SalesKpiService(repos);
    const k = await service.getSalesKpis(ds.restaurant.slug, { from: '2033-06-01', to: '2033-06-02' });
    t.expect(k).toEqual({
      period: { from: '2033-06-01', to: '2033-06-02' }, source: 'sales_import', checks: 11, foodChecks: 10, foodChecksWithWine: 4, attachRate: 0.4, covers: 20,
      wineRevenue: 470, wineRevenuePerGuest: 22, wineRevenuePerTable: 44, averageBottle: 160, averageGlass: 30
    });
    // a period with no lines: no source, no rate
    t.expect(await service.getSalesKpis(ds.restaurant.slug, { from: '2033-06-03', to: '2033-06-30' })).toMatchObject({ source: null, checks: 0, attachRate: null });
  });

  t.it('the data range spans the first and the last business day with active lines', async () => {
    const { repos, ds } = get();
    await importLines([line('2033-12-30', 'R1', 'food', 1, 10)]);
    const range = (await repos.salesRepository.dataRange(ds.restaurant.id))!;
    t.expect(range.to).toBe('2033-12-30');
    t.expect(range.from <= '2033-01-02').toBe(true);
  });
}
