import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildRows, mapTable } from '@wine-match/core';
import { describe, expect, it } from 'vitest';
import { NodeImportFileParser } from '../src/import';

/**
 * Fix import-cost-columns-not-price: real files written by Python's csv module with a purchase-cost column
 * ("Cena zakupu netto") BEFORE the price column. The canary 7777,77 is a cost that must never become a price.
 */
const fx = (name: string) => ({ name, bytes: new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)))) });
const parser = new NodeImportFileParser();
const CANARY = '7777,77';

async function table(name: string) {
  const parsed = await parser.parse(fx(name));
  if (parsed.parser === 'pdf-text') throw new Error('a table was expected');
  return parsed.rows;
}

describe('purchase-cost columns in real files', () => {
  it('menu-purchase-cost.csv: the price is the Cena column, the cost is skipped with a warning', async () => {
    const rows = await table('menu-purchase-cost.csv');
    expect(rows[0]).toEqual(['Kategoria', 'Danie', 'Opis', 'Cena zakupu netto', 'Cena']);
    const mapped = mapTable('menu', rows);
    expect(mapped.records.map((r) => [r.name, r.price])).toEqual([['Tarta śliwkowa', '36'], ['Kaczka z wiśniami', '112']]);
    expect(mapped.notes).toContain('Cost columns skipped, never read as a price: Cena zakupu netto.');
    const built = buildRows('menu', mapped.records, { dishes: [], wines: [] });
    expect(JSON.stringify([mapped, built])).not.toContain('7777');
    expect(JSON.stringify([mapped, built])).not.toContain(CANARY);
  });

  it('wines-purchase-cost.csv: the bottle price is "Cena butelka", the cost is skipped', async () => {
    const mapped = mapTable('wines', await table('wines-purchase-cost.csv'));
    expect(mapped.records.map((r) => [r.name, r.bottlePrice, r.glassPrice])).toEqual([['Riesling trocken', '240', ''], ['Chianti Classico', '220', '']]);
    expect(mapped.notes).toContain('Cost columns skipped, never read as a price: Cena zakupu netto.');
    expect(JSON.stringify(mapped)).not.toContain('7777');
  });
});
