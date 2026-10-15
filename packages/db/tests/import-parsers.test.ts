import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NodeImportFileParser, readPdfLines, readXlsx } from '../src/import';

const fx = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));
const parser = new NodeImportFileParser();
const parse = (name: string) => parser.parse({ name, bytes: fx(name) });
const refuses = async (name: string, code: string, bytes?: Uint8Array) => {
  const e = await parser.parse({ name, bytes: bytes ?? fx(name) }).catch((x) => x);
  expect(e, `${name} should be refused`).toBeInstanceOf(Error);
  expect(e.code).toBe(code);
  return e as Error;
};

describe('XLSX (written by openpyxl)', () => {
  it('reads the first sheet with data: shared strings, numbers, empty cells', async () => {
    const f = await parse('menu.xlsx');
    expect(f.parser).toBe('xlsx');
    const rows = (f as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(['Category', 'Name', 'Description', 'Price']);
    expect(rows[1]).toEqual(['Starters', 'Smoked trout rillettes', 'Smoked trout, horseradish cream, pickled cucumber', '46']);
    expect(rows[2][2]).toBe('Goat cheese, walnuts, & "aged" balsamic');   // XML entities decoded
    expect(rows[2][3]).toBe('38,50 zł');                                  // text price kept as the user wrote it
    expect(rows[5]).toEqual(['Mains', 'Veal schnitzel', 'Breaded veal, potato salad, lemon', '']);   // a missing price is an empty cell
    expect(rows).toHaveLength(8);                                         // the second sheet is ignored
  });

  it('skips blank leading rows and reads Polish text and decimal numbers', async () => {
    const rows = (await parse('menu-pl.xlsx') as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(['Kategoria', 'Danie', 'Opis', 'Cena']);
    expect(rows[2]).toEqual(['Dania główne', 'Sandacz', 'Masło, por, kawior', '98.5']);
  });

  it('reads vintages as numbers and "NV" as text, and keeps empty cells in place', async () => {
    const rows = (await parse('wines.xlsx') as { rows: string[][] }).rows;
    expect(rows[1]).toEqual(['Weingut Keller', 'Riesling trocken', '2022', 'Rheinhessen', 'Riesling', 'White', '52', '240']);
    expect(rows[2][6]).toBe('');                    // no glass price
    expect(rows[4][4]).toBe('');                    // no grape
    expect(rows[4][7]).toBe('');                    // no bottle price
    expect(rows[5][2]).toBe('NV');
    expect(rows[6][1]).toBe('Cuis 1er Cru Blanc de Blancs Brut');
  });

  it('refuses a corrupt zip and a zip that is not a spreadsheet', async () => {
    const good = fx('menu.xlsx');
    await refuses('truncated.xlsx', 'corrupt_file', good.slice(0, 300));
    const { zipSync, strToU8 } = await import('fflate');
    await refuses('notes.xlsx', 'corrupt_file', zipSync({ 'readme.txt': strToU8('hello') }));
  });

  it('stops a zip bomb: many megabytes of XML from a tiny archive', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const big = strToU8('<worksheet><sheetData>' + '<row r="1"><c r="A1"><v>1</v></c></row>'.repeat(1) + 'x'.repeat(30 * 1024 * 1024) + '</sheetData></worksheet>');
    const bomb = zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/worksheets/sheet1.xml': big }, { level: 9 });
    expect(bomb.length).toBeLessThan(200_000);
    await refuses('bomb.xlsx', 'file_too_large', bomb);
  });

  it('does not expand XML entities defined in the file (no XXE)', () => {
    // a hand-made workbook with an entity declaration: it must come out as text, not as the file's contents
    const { zipSync, strToU8 } = require('fflate') as typeof import('fflate');
    const sheet = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY secret "LEAKED">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&secret;</t></is></c></row></sheetData></worksheet>`;
    const zip = zipSync({ 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) });
    expect(readXlsx(zip)).toEqual([['&secret;']]);
  });
});

describe('PDF (written by reportlab)', () => {
  it('returns the text lines of every page in reading order', async () => {
    const lines = await readPdfLines(fx('menu.pdf'));
    expect(lines).toContain('Starters');
    expect(lines.find((l) => l.startsWith('Smoked trout rillettes'))).toMatch(/46$/);
    expect(lines.indexOf('Starters')).toBeLessThan(lines.findIndex((l) => l.startsWith('Beetroot carpaccio')));
    expect(lines.find((l) => l.startsWith('Beetroot carpaccio'))).toMatch(/38,50 zl$/);
    expect(lines).toContain('Page two');                                       // second page
    expect(lines.find((l) => l.startsWith('Grilled cauliflower'))).toMatch(/62$/);
  });

  it('reads a wine list', async () => {
    const lines = await readPdfLines(fx('wines.pdf'));
    expect(lines).toContain('Weingut Keller - Riesling trocken 2022 Rheinhessen 52 / 240');
    expect(lines).toContain('Red');
  });

  it('says clearly that a scan has no text', async () => {
    const e = await refuses('scan.pdf', 'scanned_pdf');
    expect(e.message).toMatch(/scan or a photo/);
  });

  it('refuses a truncated PDF', async () => {
    await refuses('broken.pdf', 'corrupt_file', fx('menu.pdf').slice(0, 400));
  });
});

describe('CSV', () => {
  it('reads UTF-8 with a BOM, quotes, commas inside fields', async () => {
    const f = await parse('menu-bom.csv') as { rows: string[][] };
    expect(f.rows[0]).toEqual(['category', 'name', 'description', 'price']);
    expect(f.rows[1]).toEqual(['Starters', 'Tartare, hand-cut', 'Beef & egg', '68']);
  });

  it('reads Windows-1250 (Polish Excel) with ";" and decimal commas', async () => {
    const f = await parse('menu-1250.csv') as { rows: string[][] };
    expect(f.rows[1]).toEqual(['Przystawki', 'Tatar z jelenia', 'Jałowiec, żółtko', '74,00']);
    expect(f.rows[2][0]).toBe('Dania główne');
  });

  it('reads a tab-separated file', async () => {
    const f = await parse('menu.tsv') as { rows: string[][] };
    expect(f.rows).toEqual([['name', 'price'], ['Plum tart', '36'], ['Crème brûlée', '32,50']]);
  });
});

describe('refused files', () => {
  it('empty file, header only is fine to read (the service reports no rows)', async () => {
    await refuses('empty.csv', 'empty_file');
    expect(((await parse('header-only.csv')) as { rows: string[][] }).rows).toEqual([['name', 'price']]);
  });

  it('text pretending to be a spreadsheet, and binary garbage as CSV', async () => {
    await refuses('fake.xlsx', 'format_mismatch');
    await refuses('binary.csv', 'format_mismatch');
  });

  it('an Excel file renamed to .csv and a PDF renamed to .xlsx are refused, not guessed', async () => {
    await refuses('menu.csv', 'format_mismatch', fx('menu.xlsx'));
    await refuses('menu.xlsx', 'format_mismatch', fx('menu.pdf'));
    await refuses('menu.pdf', 'format_mismatch', fx('menu-bom.csv'));
  });

  it('legacy .xls, even when renamed', async () => {
    const e = await refuses('legacy.xls', 'legacy_xls');
    expect(e.message).toMatch(/Save the file as \.xlsx or CSV/);
    await refuses('legacy.csv', 'legacy_xls', fx('legacy.xls'));
  });

  it('unknown extensions, oversized files and too many rows', async () => {
    await refuses('menu.docx', 'unsupported_format', fx('menu-bom.csv'));
    await refuses('menu.csv', 'file_too_large', new Uint8Array(10 * 1024 * 1024 + 1).fill(65));
    const many = new TextEncoder().encode('name,price\n' + Array.from({ length: 2001 }, (_, i) => `Dish ${i},10`).join('\n'));
    await refuses('menu.csv', 'too_many_rows', many);
  });
});

describe('translation columns in a real file (spec 2026-10-15-bilingual-content, R5)', () => {
  it('reads _pl / _en columns and Polish and English header synonyms, empty cells included', async () => {
    const { mapTable, buildRows } = await import('@wine-match/core');
    const f = await parse('menu-translations.csv') as { rows: string[][] };
    const t = mapTable('menu', f.rows);
    expect(t.records[0]).toEqual({
      category: 'Desserts', name: 'Plum tart', description: 'Baked plum tart, vanilla ice cream', price: '36',
      name_pl: 'Tarta śliwkowa', description_pl: 'Pieczona tarta ze śliwkami, lody waniliowe', name_en: '', description_en: ''
    });
    expect(t.records[1]).toMatchObject({ name_pl: 'Pierś z kaczki', description_pl: '', name_en: 'Duck breast', description_en: 'Roasted duck, sour cherry jus' });
    const rows = buildRows('menu', t.records, { dishes: [], wines: [] });
    expect(rows[0].issues.filter((i) => i.code === 'translation_empty').map((i) => i.field)).toEqual(['name_en', 'description_en']);
  });

  it('reads a semicolon-separated wine list with translated tasting note, region and country', async () => {
    const { mapTable } = await import('@wine-match/core');
    const t = mapTable('wines', (await parse('wines-translations.csv') as { rows: string[][] }).rows);
    expect(t.records[0]).toMatchObject({
      producer: 'Weingut Keller', region: 'Rheinhessen', country: 'Germany', tasting_note_pl: 'Brzoskwinia, łupek, rześka kwasowość.',
      tasting_note_en: 'Peach, slate, crisp acidity.', region_pl: 'Hesja Reńska', country_pl: 'Niemcy'
    });
  });
});
