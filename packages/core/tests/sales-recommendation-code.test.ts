import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import type { GuestSessionRef } from '../src/guest/session';
import { ImportService } from '../src/import/import-service';
import { mapTable } from '../src/import/mapping';
import type { ImportFileParser, ParsedFile, RowEdit } from '../src/import/types';
import { buildSalesRows, completeChecks, revalidateSales } from '../src/import/validate-sales';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { RecommendationCodeService } from '../src/services/recommendations/recommendation-code-service';
import { createLogger } from '../src/logging/logger';

/** Spec 2026-10-16-recommendation-code, phase 3 (E09 F3): the recommendation code on a POS line (R8, R9, Q9–Q11). */

const TODAY = '2026-10-21';
const ACTOR = { id: 'user-marta', name: 'Marta Wierzbicka' };

/** A till export with a free-text comment column: only the code may leave it. */
const POS: ParsedFile = {
  parser: 'csv',
  rows: [
    ['business date', 'check number', 'item type', 'item', 'quantity', 'net amount', 'comment'],
    ['14.10.2026', '301', 'Kuchnia', 'Kaczka', '2', '207,41', 'Pan Kowalski, alergia, W7K'],
    ['14.10.2026', '301', 'Butelka', 'Morgon 2021', '1', '166,67', ''],
    ['14.10.2026', '302', 'Kuchnia', 'W3M', '1', '35,19', ''],
    ['14.10.2026', '303', 'Butelka', 'Wino W7K butelka', '1', '180', ''],
    ['14.10.2026', '304', 'Kuchnia', 'Salatka', '1', '30', 'stolik A4K']
  ]
};

describe('mapping: only the code of a POS comment is kept (R8)', () => {
  it('a comment becomes the code, the rest of the comment is gone', () => {
    const { records } = mapTable('sales', POS.rows as string[][]);
    expect(records[0]).toMatchObject({ checkId: '301', recommendationCode: 'W7K' });
    expect(JSON.stringify(records)).not.toMatch(/Kowalski|alergia/);
    expect(records[4]).toMatchObject({ checkId: '304', recommendationCode: 'A4K' });
  });

  it('an item cell that is a code alone is a code; a cell with words around it is not (R8)', () => {
    const { records } = mapTable('sales', POS.rows as string[][]);
    expect(records[2]).toMatchObject({ checkId: '302', itemName: 'W3M', recommendationCode: 'W3M' });
    expect(records[3]).toMatchObject({ checkId: '303', itemName: 'Wino W7K butelka', recommendationCode: '' });
  });

  it('a file without a comment or an item code has no code field at all', () => {
    const plain = mapTable('sales', [
      ['business date', 'check number', 'item type', 'quantity', 'net amount'],
      ['14.10.2026', '1', 'Kuchnia', '1', '10']
    ]);
    expect(plain.records[0]).not.toHaveProperty('recommendationCode');
  });
});

describe('checking the code of a line (validate-sales, R8)', () => {
  it('a code typed over in the preview is normalised, and text that is not a code is dropped without an error', () => {
    const { rows } = buildSalesRows(mapTable('sales', POS.rows as string[][]).records, TODAY);
    const edits: RowEdit[] = [{ rowNumber: 1, fields: { recommendationCode: ' w-7k ' } }, { rowNumber: 2, fields: { recommendationCode: 'Pan W7K' } }];
    const next = revalidateSales(rows, edits, TODAY);
    expect(next[0].fields.recommendationCode).toBe('W7K');
    expect(next[1].fields.recommendationCode).toBe('');
    expect(next[1].issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('completeChecks reports the codes of the checks that will be saved, once per day and code', () => {
    const { rows } = buildSalesRows(mapTable('sales', POS.rows as string[][]).records, TODAY);
    const plan = completeChecks(rows);
    // check 301 has W7K on its food line, 302 has W3M, 303 none, 304 A4K; 303 is still complete (no error)
    expect(plan.checksWithCode).toBe(3);
    expect(plan.codes.map((c) => `${c.businessDate}|${c.code}`).sort()).toEqual(['2026-10-14|A4K', '2026-10-14|W3M', '2026-10-14|W7K'].sort());
    expect(plan.lines.filter((l) => l.checkId === '301').map((l) => l.recommendationCode)).toEqual(['W7K', null]);
  });
});

describe('ImportService: codes on the sales preview and in the saved lines', () => {
  let store: MemoryStore;
  let imp: ImportService;
  let data: ReturnType<typeof buildDemoDataset>;
  let repos: ReturnType<typeof createMemoryRepositories>;
  beforeEach(() => {
    data = buildDemoDataset({ ids: 'uuid' });
    store = MemoryStore.from(data);
    repos = createMemoryRepositories(store);
    const parser: ImportFileParser = { parse: async () => POS };
    let tick = Date.parse('2026-10-21T10:00:00.000Z');
    let seq = 0;
    imp = new ImportService({
      ...repos, importFileParser: parser, clock: { now: () => new Date((tick += 1000)) },
      idGenerator: { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` }
    });
  });

  it('the preview counts the checks with a code and the codes no recommendation matches (A13 note, Q11)', async () => {
    const job = await imp.upload('halka', 'sales', { name: 'pos.csv', bytes: new Uint8Array(10) }, ACTOR);
    const preview = await imp.salesPreview('halka', job.id);
    expect(preview.summary).toMatchObject({ checks: 4, checksWithCode: 3, unmatchedCodes: 3 });
  });

  it('a confirm saves the normalised code and nothing of the comment (R8, AC9)', async () => {
    const job = await imp.upload('halka', 'sales', { name: 'pos.csv', bytes: new Uint8Array(10) }, ACTOR);
    await imp.confirm('halka', job.id, ACTOR);
    const saved = store.salesLines.map((l) => [l.checkId, l.recommendationCode]);
    expect(saved).toContainEqual(['301', 'W7K']);
    expect(saved).toContainEqual(['304', 'A4K']);
    expect(JSON.stringify(store.salesLines)).not.toMatch(/Kowalski|alergia|stolik/);
    expect(JSON.stringify(job.rows)).not.toMatch(/Kowalski|alergia|stolik/);
  });

  it('the summary of a recommendation period reads the imported codes: they are unmatched until a code is issued (A13)', async () => {
    const job = await imp.upload('halka', 'sales', { name: 'pos.csv', bytes: new Uint8Array(10) }, ACTOR);
    await imp.confirm('halka', job.id, ACTOR);
    const service = new RecommendationCodeService({
      restaurantRepository: repos.restaurantRepository, wineRepository: repos.wineRepository, dishRepository: repos.dishRepository,
      recommendationCodeRepository: repos.recommendationCodeRepository, clock: { now: () => new Date('2026-10-21T10:00:00.000Z') },
      idGenerator: { uuid: () => '00000000-0000-4000-8000-0000000000aa' }, logger: createLogger(() => {})
    });
    expect(await service.summary('halka', { from: '2026-10-14', to: '2026-10-15' })).toEqual({
      period: { from: '2026-10-14', to: '2026-10-15' }, issued: 0, staffConfirmed: 0, posMatched: 0, ordered: 0, unmatchedPosCodes: 3
    });
    await expect(service.summary('halka', { from: '2026-10-15', to: '2026-10-14' })).rejects.toMatchObject({ code: 'invalid_period' });
    await expect(service.summary('nope', { from: '2026-10-14', to: '2026-10-14' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('a bill re-imported without its code gives up the earlier match: its old lines are replaced and the code leaves the till (R8, R9)', async () => {
    const first = await imp.upload('halka', 'sales', { name: 'pos.csv', bytes: new Uint8Array(10) }, ACTOR);
    await imp.confirm('halka', first.id, ACTOR);
    const period = { from: '2026-10-14', to: '2026-10-15' };
    expect(await repos.recommendationCodeRepository.unmatchedPosCodes(data.restaurant.id, period)).toBe(3);

    // the same bill 301 again, exported without its comment: no code on its lines (checks 302 and 304 are not in this file)
    const again: ParsedFile = { parser: 'csv', rows: [POS.rows[0], POS.rows[1].slice(0, 6).concat(['']), POS.rows[2].slice(0, 6).concat([''])] };
    let seqAgain = 0;
    const reimport = new ImportService({
      ...repos, importFileParser: { parse: async () => again }, clock: { now: () => new Date('2026-10-21T11:00:00.000Z') },
      idGenerator: { uuid: () => `00000000-0000-4000-9000-${String(++seqAgain).padStart(12, '0')}` }
    });
    const job = await reimport.upload('halka', 'sales', { name: 'pos-again.csv', bytes: new Uint8Array(10) }, ACTOR);
    await reimport.confirm('halka', job.id, ACTOR);

    const active = store.salesLines.filter((l) => l.replacedAt === null);
    expect(active.filter((l) => l.checkId === '301')).toHaveLength(2);
    expect(active.filter((l) => l.checkId === '301').every((l) => !l.recommendationCode)).toBe(true);
    expect(store.salesLines.filter((l) => l.checkId === '301' && l.replacedAt !== null)).toHaveLength(2);
    expect(active.map((l) => l.recommendationCode)).not.toContain('W7K');
    // W7K was an unmatched code of this day; with its line replaced only W3M and A4K remain
    expect(await repos.recommendationCodeRepository.unmatchedPosCodes(data.restaurant.id, period)).toBe(2);
  });
});

describe('AC11: a table order of three dishes is one recommendation in the summary and three rows in the pair stats (Q12, R10)', () => {
  const PERIOD = { from: '2026-10-14', to: '2026-10-14' };
  const ACTOR_TABLE = { id: 'user-marta', name: 'Marta Wierzbicka' };
  let data: ReturnType<typeof buildDemoDataset>;
  let store: MemoryStore;
  let repos: ReturnType<typeof createMemoryRepositories>;
  let seq: number;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
  const codeService = (iso: string) => new RecommendationCodeService({
    restaurantRepository: repos.restaurantRepository, wineRepository: repos.wineRepository, dishRepository: repos.dishRepository,
    recommendationCodeRepository: repos.recommendationCodeRepository, clock: { now: () => new Date(iso) },
    idGenerator: { uuid }, logger: createLogger(() => {})
  });
  const session = (id: string): GuestSessionRef => ({ id, isNew: false, source: 'qr' });

  beforeEach(() => {
    data = buildDemoDataset({ ids: 'uuid' });
    store = MemoryStore.from(data);
    repos = createMemoryRepositories(store);
    seq = 0;
  });

  it('counts the table code once in the summary, expands it to three table rows, and a POS match does not count it again', async () => {
    const service = codeService('2026-10-14T19:00:00.000Z');   // service day 14 Oct (21:00 Warsaw)
    const wine = data.wines[0].id;
    const dishes = data.dishes.slice(0, 3).map((d) => d.id).sort((a, b) => a.localeCompare(b));

    // a direct choice (no dish) is in the summary and never in the pair stats (AC11, Q12)
    const direct = await service.issue('halka', { session: session('sid-direct'), source: 'guest', wineId: wine, serving: 'bottle', dishIds: [] });
    expect(direct).not.toBeNull();
    const table = await service.issue('halka', { session: session('sid-table'), source: 'guest', wineId: wine, serving: 'bottle', dishIds: dishes });
    expect(table).not.toBeNull();
    const tableRows = (over: Record<string, number>) => dishes.map((dishId) => ({
      dishId, wineId: wine, context: 'table', issued: 1, staffConfirmed: 0, posMatched: 0, ordered: 0, ...over
    }));

    // issued, nobody confirmed, no POS match: one table choice and one direct choice, both counted once
    expect(await service.summary('halka', PERIOD)).toEqual({ period: PERIOD, issued: 2, staffConfirmed: 0, posMatched: 0, ordered: 0, unmatchedPosCodes: 0 });
    expect(await service.pairStats('halka', PERIOD)).toEqual(tableRows({}));

    // the waiter confirms the table code: still one order for the whole table
    await service.confirm('halka', table!.code, 'staff_view');
    expect(await service.summary('halka', PERIOD)).toEqual({ period: PERIOD, issued: 2, staffConfirmed: 1, posMatched: 0, ordered: 1, unmatchedPosCodes: 0 });
    expect(await service.pairStats('halka', PERIOD)).toEqual(tableRows({ staffConfirmed: 1, ordered: 1 }));

    // the till has the same code on a check with wine: matched in the POS, but still one order (R9, R10)
    const till: ParsedFile = { parser: 'csv', rows: [
      POS.rows[0],
      ['14.10.2026', '401', 'Kuchnia', 'Kaczka', '3', '310', ''],
      ['14.10.2026', '401', 'Butelka', 'Morgon 2021', '1', '166,67', table!.code]
    ] };
    let seqImport = 0;
    const imp = new ImportService({
      ...repos, importFileParser: { parse: async () => till }, clock: { now: () => new Date('2026-10-21T10:00:00.000Z') },
      idGenerator: { uuid: () => `00000000-0000-4000-9000-${String(++seqImport).padStart(12, '0')}` }
    });
    const job = await imp.upload('halka', 'sales', { name: 'pos-table.csv', bytes: new Uint8Array(10) }, ACTOR_TABLE);
    await imp.confirm('halka', job.id, ACTOR_TABLE);
    expect(await service.summary('halka', PERIOD)).toEqual({ period: PERIOD, issued: 2, staffConfirmed: 1, posMatched: 1, ordered: 1, unmatchedPosCodes: 0 });
    expect(await service.pairStats('halka', PERIOD)).toEqual(tableRows({ staffConfirmed: 1, posMatched: 1, ordered: 1 }));
  });
});
