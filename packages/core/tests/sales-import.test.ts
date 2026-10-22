import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { ValidationError } from '../src/errors';
import { ImportService } from '../src/import/import-service';
import { mapTable } from '../src/import/mapping';
import { normaliseItemType, parseAmount, parseCovers, parseQuantity, readDateCell, slashedDateOrder } from '../src/import/normalize';
import type { ImportFileParser, ImportRow, ParsedFile } from '../src/import/types';
import { applyValueMap, buildSalesRows, completeChecks, revalidateSales, unmappedValues } from '../src/import/validate-sales';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { aggregateChecks, computeSalesKpis, type CheckTotals } from '../src/services/sales/sales-kpis';
import { confirmImportSchema, parseWith, rowEditsSchema } from '../src/validators';

/** Spec 2026-10-15-pos-sales-import-attach-rate, phase 1: the sales import and the KPI rules it previews. */

const TODAY = '2026-10-18';
const PERIOD = { from: '2026-10-01', to: '2026-10-31' };
const check = (checkId: string, over: Partial<CheckTotals> = {}): CheckTotals =>
  ({ businessDate: '2026-10-10', checkId, covers: null, foodQuantity: 0, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0, bottleAmount: 0, ...over });

describe('Wine Attach Rate and the sales KPIs (computeSalesKpis)', () => {
  it('10 checks with food, 4 of them with wine, and 2 bar checks with wine: 40% (AC7)', () => {
    const checks = [
      ...Array.from({ length: 4 }, (_, i) => check(`w${i}`, { foodQuantity: 2, covers: 2, bottleQuantity: 1, bottleAmount: 200 })),
      ...Array.from({ length: 6 }, (_, i) => check(`f${i}`, { foodQuantity: 1, covers: 2 })),
      check('bar1', { glassQuantity: 2, glassAmount: 60 }), check('bar2', { bottleQuantity: 1, bottleAmount: 150 })
    ];
    const k = computeSalesKpis(PERIOD, checks);
    expect(k).toMatchObject({ source: 'sales_import', checks: 12, foodChecks: 10, foodChecksWithWine: 4, attachRate: 0.4, covers: 20 });
    // the bar checks count for the wine revenue, never for the rate or the per-table figure
    expect(k.wineRevenue).toBe(4 * 200 + 60 + 150);
    expect(k.wineRevenuePerTable).toBe(80);
    expect(k.wineRevenuePerGuest).toBe(40);
    expect(k.averageBottle).toBe(190);
    expect(k.averageGlass).toBe(30);
    expect(k.period).toEqual(PERIOD);
  });

  it('a period without checks with food has no rate, but has data; no checks at all has no source (AC8)', () => {
    const bar = computeSalesKpis(PERIOD, [check('b', { glassQuantity: 1, glassAmount: 30 })]);
    expect(bar).toMatchObject({ source: 'sales_import', attachRate: null, foodChecks: 0, wineRevenuePerTable: null, covers: null, wineRevenuePerGuest: null, wineRevenue: 30 });
    expect(computeSalesKpis(PERIOD, [])).toEqual({
      period: PERIOD, source: null, checks: 0, foodChecks: 0, foodChecksWithWine: 0, attachRate: null, covers: null, wineRevenue: 0,
      wineRevenuePerGuest: null, wineRevenuePerTable: null, averageBottle: null, averageGlass: null
    });
  });

  it('a returned bottle cancels the sale in the same check: the check has no wine (AC10)', () => {
    const lines = [
      { businessDate: '2026-10-10', checkId: '7', covers: 2, itemType: 'food' as const, quantity: 1, netAmount: 60 },
      { businessDate: '2026-10-10', checkId: '7', covers: 2, itemType: 'wine_bottle' as const, quantity: 1, netAmount: 180 },
      { businessDate: '2026-10-10', checkId: '7', covers: 2, itemType: 'wine_bottle' as const, quantity: -1, netAmount: -180 }
    ];
    const totals = aggregateChecks(lines);
    expect(totals).toEqual([{ businessDate: '2026-10-10', checkId: '7', covers: 2, foodQuantity: 1, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0, bottleAmount: 0 }]);
    const k = computeSalesKpis(PERIOD, totals);
    expect(k).toMatchObject({ foodChecks: 1, foodChecksWithWine: 0, attachRate: 0, averageBottle: null, wineRevenue: 0 });
  });

  it('checks without guests stay out of "per guest"; amounts are rounded to the grosz, the rate is not', () => {
    const k = computeSalesKpis(PERIOD, [
      check('1', { foodQuantity: 1, covers: 3, glassQuantity: 1, glassAmount: 10 }),
      check('2', { foodQuantity: 1, covers: null, glassQuantity: 1, glassAmount: 20 }),
      check('3', { foodQuantity: 1, covers: 0 })
    ]);
    expect(k.covers).toBe(3);
    expect(k.wineRevenuePerGuest).toBe(3.33);
    expect(k.wineRevenuePerTable).toBe(10);
    expect(k.attachRate).toBeCloseTo(2 / 3, 10);
  });

  it('aggregates lines per check: the largest covers, quantities of fractions without float noise, other items ignored', () => {
    const line = (checkId: string, itemType: 'food' | 'wine_glass' | 'wine_bottle' | 'other', quantity: number, netAmount: number, covers: number | null = null) =>
      ({ businessDate: '2026-10-11', checkId, covers, itemType, quantity, netAmount });
    const totals = aggregateChecks([line('a', 'wine_bottle', 0.1, 10.1), line('a', 'wine_bottle', 0.2, 20.2, 4), line('a', 'other', 3, 30, 2), line('b', 'food', 1, 5)]);
    expect(totals[0]).toEqual({ businessDate: '2026-10-11', checkId: 'a', covers: 4, foodQuantity: 0, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0.3, bottleAmount: 30.3 });
    expect(totals[1].checkId).toBe('b');
  });
});

describe('sales normalisers', () => {
  it('reads business days: ISO, Polish dotted, Excel serial days; refuses time stamps (AC15)', () => {
    expect(readDateCell('2026-10-14')).toEqual({ kind: 'date', iso: '2026-10-14' });
    expect(readDateCell('14.10.2026')).toEqual({ kind: 'date', iso: '2026-10-14' });
    expect(readDateCell('45943')).toEqual({ kind: 'date', iso: '2025-10-13' });
    expect(readDateCell('45943.0')).toEqual({ kind: 'date', iso: '2025-10-13' });
    expect(readDateCell('2026-10-14 23:45')).toEqual({ kind: 'timestamp' });
    expect(readDateCell('45943.98')).toEqual({ kind: 'timestamp' });
    expect(readDateCell('14.10.2026 23:45')).toEqual({ kind: 'timestamp' });
    expect(readDateCell('03/04/2026')).toEqual({ kind: 'slashed', first: 3, second: 4, year: 2026 });
    for (const bad of ['', 'yesterday', '2026-02-30', '31.04.2026', '12345', '99999', '1999-01-01', '2026-10-14x']) expect(readDateCell(bad).kind, bad).toBe('invalid');
  });

  it('decides the order of day and month for the whole file (Q16)', () => {
    const order = (...t: string[]) => slashedDateOrder(t.map(readDateCell));
    expect(order('03/04/2026', '13/04/2026')).toEqual({ order: 'dmy', ambiguous: true });
    expect(order('03/04/2026')).toEqual({ order: 'dmy', ambiguous: true });
    expect(order('04/13/2026', '03/04/2026')).toEqual({ order: 'mdy', ambiguous: true });
    expect(order('13/04/2026', '04/13/2026')).toMatchObject({ order: 'conflict' });
    expect(order('2026-10-14', '05/05/2026')).toEqual({ order: 'dmy', ambiguous: false });
  });

  it('quantities, amounts (returns included) and guests', () => {
    expect(['2', '-1', '0,5', '1.25', '−1', ' 3 '].map(parseQuantity)).toEqual([2, -1, 0.5, 1.25, -1, 3]);
    expect(['', 'x', '1,2345', '1 000', '1e3'].map(parseQuantity)).toEqual([null, null, null, 1000, null]);
    expect(['-12,50', '−12.50 zł', '(12,50)', '12,50-', '1 234,50', '0', '120,-'].map(parseAmount)).toEqual([-12.5, -12.5, -12.5, -12.5, 1234.5, 0, 120]);
    expect(['', 'abc', '--5'].map(parseAmount)).toEqual([null, null, null]);
    expect(['4', '4.0', '0', '999'].map(parseCovers)).toEqual([4, 4, 0, 999]);
    expect(['-1', '1000', '2.5', 'two'].map(parseCovers)).toEqual([null, null, null, null]);
  });

  it('item types: POS words in Polish and English, canonical values, a bare "wine" is a bottle; the rest is unrecognised (Q3)', () => {
    expect(normaliseItemType('Kuchnia')).toEqual({ type: 'food', generic: false });
    expect(normaliseItemType('Dania główne')).toEqual({ type: 'food', generic: false });
    expect(normaliseItemType('Wino kieliszek')).toEqual({ type: 'wine_glass', generic: false });
    expect(normaliseItemType('BUTELKA')).toEqual({ type: 'wine_bottle', generic: false });
    expect(normaliseItemType('wine_glass')).toEqual({ type: 'wine_glass', generic: false });
    expect(normaliseItemType('Napoje')).toEqual({ type: 'other', generic: false });
    expect(normaliseItemType('Wino')).toEqual({ type: 'wine_bottle', generic: true });
    expect(normaliseItemType('Wina białe')).toBeNull();
    expect(normaliseItemType('')).toBeNull();
  });
});

describe('finding the columns of a sales file (R3, Q13)', () => {
  const header = ['Data', 'Nr rachunku', 'Goście', 'Kategoria', 'Pozycja', 'Ilość', 'Kwota netto'];

  it('reads Polish headers with Polish letters, exactly; other columns are not copied into the records (R9)', () => {
    const t = mapTable('sales', [['Raport sprzedaży'], [...header, 'Nazwa klienta', 'Typ płatności', 'Typ', 'Stolik', 'Kelner', 'Uwagi'], ['14.10.2026', '101', '2', 'Kuchnia', 'Kaczka', '1', '96,30', 'Jan Kowalski', 'Karta', 'X', '12', 'Ola', 'Pan Kowalski, alergia']]);
    // „Uwagi” is the comment column of the recommendation code (R8): it is read, but only a code would leave it
    expect(t.records).toEqual([{ businessDate: '14.10.2026', checkId: '101', covers: '2', itemType: 'Kuchnia', itemName: 'Kaczka', quantity: '1', netAmount: '96,30', recommendationCode: '' }]);
    expect(t.notes).toEqual(['Columns not used: Nazwa klienta, Typ płatności, Typ, Stolik, Kelner.']);
    expect(JSON.stringify(t.records)).not.toMatch(/Kowalski|Karta|Ola|alergia/);
  });

  it('"Nazwa klienta", "Typ płatności", "Typ" and "Stolik" are never a column of the import (AC14)', () => {
    expect(() => mapTable('sales', [['Data', 'Stolik', 'Typ', 'Nazwa klienta', 'Ilość', 'Netto'], ['2026-10-14', '5', 'Kuchnia', 'X', '1', '10']])).toThrowError(ValidationError);
  });

  it('refuses a file without a required column and names the missing ones; gross is not net (AC14)', () => {
    const e = (() => { try { mapTable('sales', [['Data', 'Rachunek', 'Kategoria', 'Ilość', 'Brutto'], ['2026-10-14', '1', 'Kuchnia', '1', '10']]); } catch (x) { return x as ValidationError; } return null; })();
    expect(e).toMatchObject({ code: 'no_header', message: 'Could not find the columns: net amount.', fields: { netAmount: 'required' } });
    // no header at all: every required column is missing, and no default order is guessed
    expect(() => mapTable('sales', [['2026-10-14', '1', 'Kuchnia', '1', '10']])).toThrowError(/business date, check number, item type, quantity, net amount/);
    // headers are matched exactly, not by prefix
    expect(() => mapTable('sales', [['Data', 'Rachunek', 'Kategoria', 'Ilość', 'Kwota netto (PLN)'], ['2026-10-14', '1', 'Kuchnia', '1', '10']])).toThrowError(/net amount/);
  });

  it('optional columns are in a record only when the file has them; a note says when there are no guests', () => {
    const t = mapTable('sales', [['Date', 'Check', 'Category', 'Qty', 'Net'], ['2026-10-14', '1', 'Food', '1', '10']]);
    expect(t.records[0]).toEqual({ businessDate: '2026-10-14', checkId: '1', itemType: 'Food', quantity: '1', netAmount: '10' });
    expect(t.notes).toEqual(['No guests column: wine revenue per guest cannot be calculated from this file.']);
  });
});

const rec = (businessDate: string, checkId: string, itemType: string, quantity = '1', netAmount = '10', covers = '2') =>
  ({ businessDate, checkId, covers, itemType, quantity, netAmount });
const issues = (r: ImportRow) => r.issues.map((i) => i.code);

describe('checking sales lines (validate-sales)', () => {
  it('a line without a check number has an error, is not ticked and is never saved; the other checks can be (AC2)', () => {
    const { rows } = buildSalesRows([rec('2026-10-14', '1', 'Kuchnia'), rec('2026-10-14', '', 'Kuchnia'), rec('2026-10-14', '2', 'Butelka', '1', '180')], TODAY);
    expect(rows[1]).toMatchObject({ include: false, action: 'create', matchId: null });
    expect(issues(rows[1])).toContain('check_missing');
    expect(rows[0].fields).toEqual({ businessDate: '2026-10-14', checkId: '1', covers: '2', itemType: 'food', quantity: '1', netAmount: '10' });
    const plan = completeChecks(rows);
    expect(plan.checks).toEqual([{ businessDate: '2026-10-14', checkId: '1' }, { businessDate: '2026-10-14', checkId: '2' }]);
    expect(plan.lines.map((l) => l.checkId)).toEqual(['1', '2']);
  });

  it('a check with one broken line is saved not at all; its other lines are warned but keep their tick (AC13)', () => {
    const { rows } = buildSalesRows([rec('2026-10-14', '1', 'Kuchnia'), rec('2026-10-14', '1', 'Butelka', 'x'), rec('2026-10-14', '2', 'Kuchnia')], TODAY);
    expect(rows[0].include).toBe(true);
    expect(issues(rows[0])).toContain('check_incomplete');
    expect(issues(rows[2])).not.toContain('check_incomplete');
    const plan = completeChecks(rows);
    expect(plan.checks).toEqual([{ businessDate: '2026-10-14', checkId: '2' }]);
    expect(plan.incomplete).toBe(1);
    // unticking one line warns its neighbours and leaves their ticks alone
    const unticked = revalidateSales(rows, [{ rowNumber: 1, include: true }, { rowNumber: 2, fields: { quantity: '1' }, include: false }, { rowNumber: 3, include: false }], TODAY);
    expect(unticked.map((r) => r.include)).toEqual([true, true, false]);
    expect(issues(unticked[0])).not.toContain('check_incomplete');
    expect(completeChecks(unticked).checks).toEqual([{ businessDate: '2026-10-14', checkId: '1' }]);
  });

  it('dates: day/month for the whole file, both orders in one file are errors, time stamps and future days are errors (AC15)', () => {
    const dmy = buildSalesRows([rec('03/04/2026', '1', 'Kuchnia'), rec('13/04/2026', '2', 'Kuchnia')], TODAY);
    expect(dmy.rows.map((r) => r.fields.businessDate)).toEqual(['2026-04-03', '2026-04-13']);
    expect(dmy.notes).toContain('Dates like 03/04/2026 were read as day/month (3 April 2026).');
    const both = buildSalesRows([rec('13/04/2026', '1', 'Kuchnia'), rec('04/13/2026', '2', 'Kuchnia'), rec('2026-04-14', '3', 'Kuchnia')], TODAY);
    expect(both.rows.map((r) => issues(r)[0] ?? null)).toEqual(['date_order_conflict', 'date_order_conflict', null]);
    const stamps = buildSalesRows([rec('2026-10-14 23:45', '1', 'Kuchnia'), rec('45943.98', '2', 'Kuchnia'), rec('2026-10-20', '3', 'Kuchnia'), rec('2026-10-19', '4', 'Kuchnia')], TODAY);
    expect(stamps.rows.map((r) => issues(r)[0] ?? null)).toEqual(['date_timestamp', 'date_timestamp', 'date_future', null]);
    expect(stamps.rows[0].issues[0].message).toBe('Use the business day column, not a time stamp.');
    // the conflict is resolved by correcting one date
    const fixed = revalidateSales(both.rows, [{ rowNumber: 2, fields: { businessDate: '2026-04-13' } }], TODAY);
    expect(fixed.map((r) => [r.fields.businessDate, r.include])).toEqual([['2026-04-13', true], ['2026-04-13', true], ['2026-04-14', true]]);
  });

  it('returns, a bare "wine", guests that differ or are missing: warnings, the lines stay ticked', () => {
    const { rows } = buildSalesRows([
      rec('2026-10-14', '1', 'Kuchnia', '1', '50', '2'), rec('2026-10-14', '1', 'Wino', '1', '120', '3'), rec('2026-10-14', '1', 'Butelka', '-1', '-120', '3'),
      rec('2026-10-14', '2', 'Kuchnia', '1', '50', '')
    ], TODAY);
    expect(rows.every((r) => r.include)).toBe(true);
    expect(issues(rows[0])).toEqual(['covers_differ']);
    expect(issues(rows[1])).toEqual(['generic_wine', 'covers_differ']);
    expect(issues(rows[2])).toEqual(['return_line', 'covers_differ']);
    expect(issues(rows[3])).toEqual(['covers_missing']);
    expect(rows[1].fields.itemType).toBe('wine_bottle');
  });

  it('quantity zero, a too-high amount, an unknown category and repeated check numbers on other days', () => {
    const { rows, notes } = buildSalesRows([
      rec('2026-10-14', '1', 'Kuchnia', '0'), rec('2026-10-14', '2', 'Kuchnia', '1', '100001'), rec('2026-10-14', '3', 'Wina białe'), rec('2026-10-15', '3', 'Kuchnia')
    ], TODAY);
    expect(rows.map((r) => issues(r)[0])).toEqual(['quantity_zero', 'amount_too_high', 'unmapped_category', undefined]);
    expect(rows[2].fields.itemType).toBe('Wina białe');
    expect(notes).toContain('Check numbers repeat across days. That is fine if your POS numbers receipts per day.');
  });

  it('one decision per unrecognised category fixes and ticks every line with it (AC16, R4)', () => {
    const records = [...Array.from({ length: 40 }, (_, i) => rec('2026-10-14', `c${i}`, i % 2 ? 'Wina białe' : 'WINA BIAŁE!')), rec('2026-10-14', 'x', 'Kuchnia'), rec('2026-10-14', 'y', 'Bar karta')];
    const { rows } = buildSalesRows(records, TODAY);
    expect(rows.filter((r) => issues(r).includes('unmapped_category')).length).toBe(41);
    expect(rows.filter((r) => r.include).length).toBe(1);
    expect(unmappedValues(rows)).toEqual([{ value: 'WINA BIAŁE!', lines: 40 }, { value: 'Bar karta', lines: 1 }]);
    // the form sends every row as it is (the select keeps the unrecognised value): the map still applies
    const form = rows.map((r) => ({ rowNumber: r.rowNumber, fields: { itemType: r.fields.itemType }, include: r.include }));
    const edits = applyValueMap(rows, form, [{ field: 'itemType', from: 'Wina białe', to: 'wine_bottle' }, { field: 'itemType', from: '__proto__', to: 'food' }, { field: 'itemType', from: 'constructor', to: 'food' }]);
    const next = revalidateSales(rows, edits, TODAY);
    expect(next.filter((r) => r.fields.itemType === 'wine_bottle' && r.include).length).toBe(40);
    expect(next[41]).toMatchObject({ include: false, fields: { itemType: 'Bar karta' } });
    expect(next[40]).toMatchObject({ include: true, fields: { itemType: 'food' } });
    // a recognised value is never re-mapped
    expect(applyValueMap(next, [], [{ field: 'itemType', from: 'food', to: 'wine_glass' }])).toEqual([]);
  });

  it('a correction touches only the columns of the file', () => {
    const { rows } = buildSalesRows([{ businessDate: '2026-10-14', checkId: '1', itemType: 'Kuchnia', quantity: '1', netAmount: '10' }], TODAY);
    const next = revalidateSales(rows, [{ rowNumber: 1, fields: { covers: '4', itemName: 'Kaczka' } }], TODAY);
    expect(next[0].fields).toEqual({ businessDate: '2026-10-14', checkId: '1', itemType: 'food', quantity: '1', netAmount: '10' });
  });
});

describe('the API schemas of a sales correction', () => {
  it('take sales columns and a value map; refuse unknown keys, a wrong type and prototype keys', () => {
    expect(parseWith(rowEditsSchema, { rows: [{ rowNumber: 1, fields: { checkId: '12', netAmount: '10' } }] }).rows[0].fields).toEqual({ checkId: '12', netAmount: '10' });
    expect(parseWith(rowEditsSchema, { rows: [], valueMap: [{ field: 'itemType', from: 'Wina białe', to: 'wine_bottle' }] }).valueMap).toHaveLength(1);
    expect(() => parseWith(rowEditsSchema, { rows: [] })).toThrowError(ValidationError);
    expect(() => parseWith(confirmImportSchema, { valueMap: [{ field: 'itemType', from: 'x', to: 'beer' }] })).toThrowError(ValidationError);
    expect(() => parseWith(confirmImportSchema, { valueMap: [{ field: 'covers', from: 'x', to: 'food' }] })).toThrowError(ValidationError);
    expect(() => parseWith(confirmImportSchema, { valueMap: [{ field: 'itemType', from: '', to: 'food' }] })).toThrowError(ValidationError);
    const e = (() => { try { parseWith(rowEditsSchema, JSON.parse('{"rows":[{"rowNumber":1,"fields":{"__proto__":"x","constructor":"y"}}]}')); } catch (x) { return x as ValidationError; } return null; })();
    expect(Object.hasOwn(e?.fields ?? {}, '__proto__') && Object.hasOwn(e?.fields ?? {}, 'constructor')).toBe(true);
  });
});

/* ------------------------------ the service ------------------------------ */

const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Lis' };
const SALES: ParsedFile = {
  parser: 'csv',
  rows: [
    ['Data', 'Nr rachunku', 'Goście', 'Kategoria', 'Pozycja', 'Ilość', 'Kwota netto', 'Nazwa klienta'],
    ['14.10.2026', '101', '2', 'Kuchnia', 'Kaczka', '2', '207,41', 'Jan Kowalski'],
    ['14.10.2026', '101', '2', 'Wina białe', 'Riesling', '1', '166,67', ''],
    ['14.10.2026', '102', '1', 'Kuchnia', 'Carpaccio', '1', '35,19', ''],
    ['14.10.2026', '103', '', 'Wino kieliszek', 'Chianti', '2', '85,18', ''],
    ['15.10.2026', '201', '4', 'Kuchnia', 'Kurczak', '2', '292,59', ''],
    ['15.10.2026', '201', '4', 'Butelka', 'Morgon', '1', '190', '']
  ]
};

function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(data);
  const repos = createMemoryRepositories(store);
  const files: Record<string, ParsedFile> = { 'sales.csv': SALES, 'menu.pdf': { parser: 'pdf-text', lines: ['x'] } };
  const importFileParser: ImportFileParser = { parse: async (f) => files[f.name] };
  let tick = Date.parse('2026-10-18T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return { data, store, repos, files, imp: new ImportService({ ...repos, importFileParser, clock, idGenerator }) };
}
const file = (name: string) => ({ name, bytes: new Uint8Array(10) });

describe('ImportService: sales', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const rid = () => t.data.restaurant.id;
  const valueMap = [{ field: 'itemType' as const, from: 'Wina białe', to: 'wine_bottle' as const }];

  it('previews the file before anything is saved: columns, lines, unrecognised categories, the file’s own rate (AC1)', async () => {
    const job = await t.imp.upload('halka', 'sales', file('sales.csv'), ACTOR);
    expect(job).toMatchObject({ kind: 'sales', status: 'preview_ready' });
    expect(job.notes).toEqual(['Columns not used: Nazwa klienta.']);
    expect(job.rows.map((r) => [r.fields.businessDate, r.fields.checkId, r.fields.itemType, r.include])).toEqual([
      ['2026-10-14', '101', 'food', true], ['2026-10-14', '101', 'Wina białe', false], ['2026-10-14', '102', 'food', true],
      ['2026-10-14', '103', 'wine_glass', true], ['2026-10-15', '201', 'food', true], ['2026-10-15', '201', 'wine_bottle', true]
    ]);
    expect(JSON.stringify(job.rows)).not.toContain('Kowalski');
    const preview = await t.imp.salesPreview('halka', job.id);
    expect(preview.unmappedValues).toEqual([{ value: 'Wina białe', lines: 1 }]);
    expect(preview.summary).toEqual({
      from: '2026-10-14', to: '2026-10-15', checks: 3, lines: { food: 2, wine_glass: 1, wine_bottle: 1, other: 0 }, incompleteChecks: 1, replacedChecks: 0,
      checksWithCode: 0, unmatchedCodes: 0
    });
    expect(preview.kpis).toMatchObject({ foodChecks: 2, foodChecksWithWine: 1, attachRate: 0.5 });
    expect(t.store.salesLines).toEqual([]);
  });

  it('maps the category once, confirms whole checks, and a second import of the same file changes nothing (AC3, AC16)', async () => {
    const job = await t.imp.upload('halka', 'sales', file('sales.csv'), ACTOR);
    const mapped = await t.imp.updateRows('halka', job.id, [], valueMap);
    expect(mapped.rows[1]).toMatchObject({ include: true, fields: { itemType: 'wine_bottle' } });
    const result = await t.imp.confirm('halka', job.id, ACTOR);
    expect(result).toEqual({ created: 6, updated: 0, skipped: 0, suggestions: 0, replaced: 0 });
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const before = computeSalesKpis(period, await t.repos.salesRepository.checkTotals(rid(), period));
    expect(before).toMatchObject({ checks: 4, foodChecks: 3, foodChecksWithWine: 2 });
    // the item name and the guest name are never saved (Q18, R9)
    expect(JSON.stringify(t.store.salesLines)).not.toMatch(/Kaczka|Kowalski/);

    const again = await t.imp.upload('halka', 'sales', file('sales.csv'), ACTOR);
    expect((await t.imp.salesPreview('halka', again.id)).summary.replacedChecks).toBe(3);
    expect(await t.imp.confirm('halka', again.id, ACTOR, [], valueMap)).toMatchObject({ created: 6, replaced: 4 });
    expect(computeSalesKpis(period, await t.repos.salesRepository.checkTotals(rid(), period))).toEqual(before);
    expect(t.store.salesLines.filter((l) => l.replacedAt === null).length).toBe(6);
  });

  it('a confirm without the mapping skips the whole check with the unrecognised line (R6)', async () => {
    const job = await t.imp.upload('halka', 'sales', file('sales.csv'), ACTOR);
    expect(await t.imp.confirm('halka', job.id, ACTOR)).toMatchObject({ created: 4, skipped: 2, replaced: 0 });
    expect(t.store.salesLines.some((l) => l.checkId === '101')).toBe(false);
  });

  it('refuses a PDF, an empty selection and a selection of incomplete checks; a menu ignores a value map', async () => {
    await expect(t.imp.upload('halka', 'sales', file('menu.pdf'), ACTOR)).rejects.toMatchObject({ code: 'unsupported_format' });
    const job = await t.imp.upload('halka', 'sales', file('sales.csv'), ACTOR);
    const none = job.rows.map((r) => ({ rowNumber: r.rowNumber, include: false }));
    await expect(t.imp.confirm('halka', job.id, ACTOR, none)).rejects.toMatchObject({ code: 'no_rows_selected' });
    // only line 1 ticked: its check 101 has an unticked (broken) line
    await expect(t.imp.confirm('halka', job.id, ACTOR, none.map((e) => ({ ...e, include: e.rowNumber === 1 })))).rejects.toMatchObject({ code: 'no_complete_checks' });
    await expect(t.imp.updateRows('halka', job.id, [{ rowNumber: 99, include: true }])).rejects.toMatchObject({ code: 'unknown_row' });
    await expect(t.imp.salesPreview('halka', 'nope')).rejects.toMatchObject({ code: 'not_found' });
    await expect(t.imp.upload('halka', 'beer' as 'sales', file('sales.csv'), ACTOR)).rejects.toMatchObject({ code: 'invalid_kind' });
  });

  it('a file without a required column is refused with the missing columns, and nothing is stored', async () => {
    t.files['bad.csv'] = { parser: 'csv', rows: [['Data', 'Rachunek', 'Kategoria', 'Ilość', 'Brutto'], ['2026-10-14', '1', 'Kuchnia', '1', '10']] };
    await expect(t.imp.upload('halka', 'sales', file('bad.csv'), ACTOR)).rejects.toMatchObject({ code: 'no_header', fields: { netAmount: 'required' } });
    t.files['empty.csv'] = { parser: 'csv', rows: [['Data', 'Rachunek', 'Kategoria', 'Ilość', 'Netto']] };
    await expect(t.imp.upload('halka', 'sales', file('empty.csv'), ACTOR)).rejects.toMatchObject({ code: 'no_rows' });
    expect(t.store.importJobs).toEqual([]);
  });
});
