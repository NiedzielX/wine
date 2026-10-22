import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aggregateChecks, buildSalesRows, completeChecks, computeSalesKpis, mapTable, revalidateSales, applyValueMap, unmappedValues } from '@wine-match/core';
import { describe, expect, it } from 'vitest';
import { NodeImportFileParser } from '../src/import';

/**
 * Spec 2026-10-15-pos-sales-import-attach-rate, AC11: the whole chain on real files written by other software
 * (Python's csv module in UTF-8 and Windows-1250, openpyxl with real date cells): parser → columns → checked lines.
 */
const fx = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)))) });
const parser = new NodeImportFileParser();
const TODAY = '2026-10-19';

async function chain(name: string) {
  const parsed = await parser.parse(fx(name));
  if (parsed.parser === 'pdf-text') throw new Error('a table was expected');
  const mapped = mapTable('sales', parsed.rows);
  return { parsed, mapped, ...buildSalesRows(mapped.records, TODAY) };
}

describe('sales files with recommendation codes: only the code leaves the till comment (E09 F3, AC9)', () => {
  it('sales-pos-codes.csv: the comment column keeps its code and nothing else (R8)', async () => {
    const { mapped, rows } = await chain('sales-pos-codes.csv');
    expect(mapped.notes).toEqual([expect.stringContaining('No guests column')]);
    expect(JSON.stringify(rows)).not.toMatch(/Kowalski|alergia|Ola|glutenu|stolik|Uwagi/);
    const { lines, checksWithCode, codes } = completeChecks(rows);
    expect(lines.map((l) => [l.checkId, l.recommendationCode])).toEqual([
      ['301', 'W7K'], ['301', null], ['302', 'W3M'], ['303', null], ['304', 'A4K'], ['305', null], ['305', 'H4N']
    ]);
    expect(checksWithCode).toBe(4);
    expect(codes.map((c) => `${c.businessDate}|${c.code}`).sort()).toEqual(['2026-10-14|A4K', '2026-10-14|W3M', '2026-10-14|W7K', '2026-10-15|H4N']);
  });
});

describe('sales files: parser → columns → lines (AC11)', () => {
  for (const name of ['sales-pos.csv', 'sales-pos-1250.csv']) {
    it(`${name}: Polish headers and letters, ';' and decimal commas; guest, waiter and payment columns are ignored`, async () => {
      const { mapped, rows, notes } = await chain(name);
      expect(mapped.notes).toEqual(['Columns not used: Kelner, Nazwa klienta, Typ płatności.']);
      expect(notes).toEqual([]);
      expect(JSON.stringify(rows)).not.toMatch(/Kowalski|Nowak|Karta|Gotówka|Ola|Piotr/);
      expect(rows[0].fields).toEqual({ businessDate: '2026-10-14', checkId: '101', covers: '2', itemType: 'food', itemName: 'Pierś z kaczki', quantity: '2', netAmount: '207.41' });
      // the line without a check number (AC2) is the only error; a return and a bare "Wino" are warnings
      expect(rows.filter((r) => !r.include).map((r) => r.rowNumber)).toEqual([13]);
      expect(rows[9].issues.map((i) => i.code)).toContain('return_line');
      expect(rows[11].issues.map((i) => i.code)).toContain('generic_wine');
      const { lines, checks } = completeChecks(rows);
      const k = computeSalesKpis({ from: '2026-10-14', to: '2026-10-15' }, aggregateChecks(lines));
      // checks with food: 101, 102, 103, 201, 202; with wine 101, 102, 202 (201 returned its bottle); 104 is a bar check
      expect(checks.length).toBe(6);
      expect(k).toMatchObject({ foodChecks: 5, foodChecksWithWine: 3, attachRate: 0.6 });
    });
  }

  it('sales-pos.xlsx: real date cells, "Brutto" never read as net, 40 lines of an unknown category mapped at once (AC11, AC14, AC16)', async () => {
    const { parsed, mapped, rows } = await chain('sales-pos.xlsx');
    expect((parsed as { rows: string[][] }).rows[1][0]).toMatch(/^\d{5}$/);   // a date cell is a serial day number
    expect(mapped.notes).toEqual(['Columns not used: Brutto, Kelner, Nazwa klienta.']);
    expect(rows[0].fields).toMatchObject({ businessDate: '2026-10-12', checkId: 'R-001', covers: '2', netAmount: '120.5' });
    expect(JSON.stringify(rows)).not.toMatch(/VIP|130\.14/);
    expect(unmappedValues(rows)).toEqual([{ value: 'Wina białe', lines: 40 }]);
    expect(rows.filter((r) => r.include).length).toBe(21);
    const next = revalidateSales(rows, applyValueMap(rows, [], [{ field: 'itemType', from: 'wina biale', to: 'wine_bottle' }]), TODAY);
    expect(next.filter((r) => r.include).length).toBe(61);
    expect(completeChecks(next).checks.length).toBe(21);
  });

  it('the menu and wine fixtures still map as before', async () => {
    const menu = await parser.parse(fx('menu.xlsx'));
    expect(mapTable('menu', (menu as { rows: string[][] }).rows).records).toHaveLength(7);
    const wines = await parser.parse(fx('wines.xlsx'));
    expect(mapTable('wines', (wines as { rows: string[][] }).rows).records[0]).toMatchObject({ producer: 'Weingut Keller', name: 'Riesling trocken' });
  });
});
