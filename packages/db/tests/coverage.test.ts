import { DEFAULT_RESTAURANT_SETTINGS } from '@wine-match/core';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, ScryptPasswordHasher } from '../src/auth';
import { NodeImportFileParser, readXlsx } from '../src/import';
import { ormConfig } from '../src/config';
import { toDecision, toDish, toImportJob, toPairing, toPublishedPairing, toRestaurant, toWine } from '../src/mappers';

const at = new Date('2026-10-14T10:00:00.000Z');

/** A workbook made of the given sheet XML, shared strings and extra parts. */
function xlsx(sheets: Record<string, string>, extra: Record<string, string> = {}, rels = true): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const sheetNames = Object.keys(sheets);
  files['xl/workbook.xml'] = strToU8(`<workbook><sheets>${sheetNames.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  if (rels) files['xl/_rels/workbook.xml.rels'] = strToU8(`<Relationships>${sheetNames.map((_, i) => `<Relationship Id="rId${i + 1}" Target="/xl/worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  sheetNames.forEach((n, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheets[n]); });
  for (const [name, xml] of Object.entries(extra)) files[name] = strToU8(xml);
  return zipSync(files);
}
const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe('xlsx reader: every cell type and every way a workbook can be shaped', () => {
  it('shared strings, inline strings, booleans, formula text, errors, numbers and missing values', () => {
    const data = xlsx(
      {
        Data: sheet(
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Inline &amp; &#x41;&#66;</t></is></c><c r="C1" t="b"><v>1</v></c><c r="D1" t="str"><v>a &lt; b</v></c><c r="E1" t="e"><v>#N/A</v></c><c r="F1"><v>58.499999999999993</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>9</v></c><c r="B2" t="b"><v>0</v></c><c r="C2" t="inlineStr"><is><t>x</t></is></c><c r="F2"><v>1e400</v></c><c r="G2"/></row>' +
          '<row r="3"><c><v>1</v></c></row><row r="4"/>'
        )
      },
      { 'xl/sharedStrings.xml': '<sst><si><t>Shared</t></si><si><rPh><t>phonetic</t></rPh><t>word</t></si></sst>' }
    );
    const rows = readXlsx(data);
    // a cell with no value keeps its column, so the first row is as wide as the widest row
    expect(rows[0]).toEqual(['Shared', 'Inline & AB', 'TRUE', 'a < b', '', '58.5', '']);
    expect(rows[1][0]).toBe('');       // a shared-string index that is not in the table reads as empty
    expect(rows[1][1]).toBe('FALSE');
    expect(rows[1][2]).toBe('x');
    expect(rows[1][5]).toBe('1e400');  // not a finite number: kept as written
    expect(rows).toHaveLength(2);      // a cell without a reference and an empty row are skipped
  });

  it('a workbook without sharedStrings, without relationships, or with a sheet that is not there, and the fallback to any worksheet', () => {
    const noShared = xlsx({ One: sheet('<row r="1"><c r="A1"><v>7</v></c></row>') });
    expect(readXlsx(noShared)).toEqual([['7']]);
    const noRels = xlsx({ One: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c></row>') }, {}, false);
    expect(readXlsx(noRels)).toEqual([['x']]);
    const missingSheet = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Gone" sheetId="1" r:id="rId9"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>fallback</t></is></c></row>'))
    });
    expect(readXlsx(missingSheet)).toEqual([['fallback']]);
  });

  it('a sheet entry with no relationship id is skipped in favour of the worksheets present', () => {
    const data = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="NoId" sheetId="1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>found</t></is></c></row>'))
    });
    expect(readXlsx(data)).toEqual([['found']]);
  });

  it('a relationship without a target, and an empty workbook, are refused', () => {
    const odd = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>z</t></is></c></row>'))
    });
    expect(readXlsx(odd)).toEqual([['z']]);
    expect(() => readXlsx(xlsx({ Empty: sheet('<row r="1"/>') }))).toThrow(/no data/);
    expect(() => readXlsx(zipSync({ 'readme.txt': strToU8('x') }))).toThrow(/not a valid Excel/);
  });

  it('a corrupt archive and an entity declared in the file', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/could not be opened/);
    const numeric = xlsx({ S: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>&#x20AC; &#65; &unknown;</t></is></c></row>') });
    expect(readXlsx(numeric)[0][0]).toBe('€ A &unknown;');
  });
});

describe('file parser: the decisions made before any reader runs', () => {
  const parser = new NodeImportFileParser();
  it('a file without an extension, and an unknown one, are refused by name', async () => {
    await expect(parser.parse({ name: 'menu', bytes: strToU8('a,b\n1,2') })).rejects.toThrow(/“.?”|not supported/);
    await expect(parser.parse({ name: 'menu.docx', bytes: strToU8('a,b\n1,2') })).rejects.toThrow(/“.docx”/);
  });

  it('a text file with only blank lines has no data; a CSV with a NUL byte is not text', async () => {
    await expect(parser.parse({ name: 'x.csv', bytes: strToU8('\n\n  \n') })).rejects.toMatchObject({ code: 'empty_file' });
    await expect(parser.parse({ name: 'x.csv', bytes: new Uint8Array([97, 0, 98]) })).rejects.toMatchObject({ code: 'format_mismatch' });
  });

  it('a workbook with no rows is refused by the parser', async () => {
    await expect(parser.parse({ name: 'x.xlsx', bytes: xlsx({ S: sheet('<row r="1"/>') }) })).rejects.toMatchObject({ code: 'empty_file' });
  });
});

describe('row mappers: database rows become domain values, with defaults for missing data', () => {
  const profile = { intensity: 3, fat: 2, salt: 1, sweetness: 0, acidity: 4, spice: 0, umami: 2, smoke: 0, creaminess: 1, protein: 'fish', cooking: 'grilled', source: 'confirmed' };
  const restaurant = { id: 'r1', slug: 'halka', name: 'Halka', tagline: 'Tag', address: 'a', city: 'Warsaw', currency: 'PLN', wineDirector: 'Marta', publishedAt: at, settings: { showUnreviewed: true, showScores: false } };
  const dish = { id: 'd1', name: 'Pike', description: 'desc', category: 'Mains', price: '98.50', status: 'published', profile };
  const wine = { id: 'w1', producer: 'P', name: 'N', vintage: null, region: 'R', country: 'C', grapes: ['G'], glassPrice: '52', glassPourMl: 150, bottlePrice: '240', bottleSizeMl: 750, active: true, listNumber: null, colourHex: '#fff', tastingNote: 'note', profile: { ...profile, sweetness: 0, acidity: 3, tannin: 2, body: 3, alcohol: 13, fruitiness: 3, oak: 0, aromatic: 3, freshness: 3, style: 'white', adventurous: false } };

  it('restaurant, dish and wine', () => {
    expect(toRestaurant(restaurant as never)).toMatchObject({ id: 'r1', publishedAt: at.toISOString(), settings: { showUnreviewed: true, showScores: false } });
    // a restaurant without stored settings gets the defaults, never undefined
    const bare = toRestaurant({ ...restaurant, publishedAt: null, settings: undefined } as never);
    expect(bare.publishedAt).toBeNull();
    expect(bare.settings).toEqual(DEFAULT_RESTAURANT_SETTINGS);
    expect(toDish(dish as never)).toMatchObject({ price: 98.5, profile: { protein: 'fish', intensity: 3 } });
    const clamped = toDish({ ...dish, profile: { ...profile, intensity: 9, fat: -2 } } as never);
    expect(clamped.profile.intensity).toBe(5);
    expect(clamped.profile.fat).toBe(0);
    expect(toWine(wine as never)).toMatchObject({ vintage: 'NV', glassPrice: 52, listNumber: undefined, colour: '#fff' });
    expect(toWine({ ...wine, vintage: 2022, glassPrice: null, listNumber: 112 } as never)).toMatchObject({ vintage: 2022, glassPrice: null, listNumber: 112 });
    expect(toWine({ ...wine, glassPrice: undefined } as never).glassPrice).toBeNull();
  });

  it('pairings, published pairings, decisions and import jobs, with their optional fields', () => {
    const pairing = { id: 'p1', dish: { id: 'd1' }, wine: { id: 'w1' }, status: 'approved', role: undefined, rank: undefined, comment: undefined, modelScore: 80, factors: null, source: 'engine', dirty: true, version: 3, updatedBy: 'M', updatedAt: at };
    expect(toPairing(pairing as never)).toMatchObject({ role: null, rank: null, comment: null, dirty: true, version: 3 });
    expect(toPairing({ ...pairing, role: 'primary', rank: 1, comment: 'x', version: undefined } as never)).toMatchObject({ role: 'primary', rank: 1, comment: 'x', version: undefined });
    expect(toPublishedPairing({ id: 'p', dishId: 'd', wineId: 'w', status: 'approved', role: null, rank: null, comment: null, modelScore: 1, source: 'engine', updatedBy: 'M', updatedAt: at.toISOString() })).toMatchObject({ dirty: false });
    expect(toDecision({ id: 'x', pairingId: 'p', dishId: 'd', wineId: 'w', actor: 'M', actorId: undefined, action: 'approve', before: undefined, after: { status: 'approved' }, createdAt: at } as never)).toMatchObject({ actorId: null, before: null, at: at.toISOString() });
    expect(toDecision({ id: 'y', pairingId: 'p', dishId: 'd', wineId: 'w', actor: 'M', actorId: 'a', action: 'reject', before: null, after: undefined, createdAt: at } as never)).toMatchObject({ after: null, actorId: 'a' });
    const job = { id: 'j', restaurant: { id: 'r1' }, kind: 'menu', fileName: 'm.csv', fileType: 'csv', fileSize: 10, status: 'preview_ready', parser: undefined, rows: undefined, notes: undefined, error: undefined, createdBy: 'M', createdAt: at, confirmedAt: null, result: undefined };
    expect(toImportJob(job as never)).toMatchObject({ parser: null, rows: [], notes: [], error: null, confirmedAt: null, result: null });
    expect(toImportJob({ ...job, parser: 'csv', rows: [{ rowNumber: 1 }], notes: ['n'], error: 'e', confirmedAt: at, result: { created: 1 } } as never)).toMatchObject({ parser: 'csv', error: 'e', confirmedAt: at.toISOString() });
  });
});

describe('database configuration: the defaults and the overrides', () => {
  it('reads the pool and debug settings from the environment, and an override wins', () => {
    const before = { ...process.env };
    try {
      delete process.env.DB_POOL_MIN; delete process.env.DB_POOL_MAX; delete process.env.DB_DEBUG; delete process.env.DATABASE_URL;
      const defaults = ormConfig();
      expect(defaults.pool).toEqual({ min: 2, max: 10 });
      expect(defaults.debug).toBe(false);
      process.env.DB_POOL_MIN = '4'; process.env.DB_POOL_MAX = 'not-a-number'; process.env.DB_DEBUG = 'true'; process.env.DATABASE_URL = 'postgres://from-env';
      const fromEnv = ormConfig();
      expect(fromEnv.pool).toEqual({ min: 4, max: 10 });
      expect(fromEnv.debug).toBe(true);
      expect(fromEnv.clientUrl).toBe('postgres://from-env');
      expect(ormConfig({ clientUrl: 'postgres://override' }).clientUrl).toBe('postgres://override');
    } finally {
      process.env = before;
    }
  });
});

describe('scrypt: the wrappers and the failure of a hash that cannot be computed', () => {
  it('a hash with parameters the machine cannot afford is an error, not a hash', async () => {
    await expect(hashPassword('x', { N: 2 ** 30, r: 8, p: 1 })).rejects.toThrow();
  });

  it('the hasher object forwards hashing, verification and the rehash check', async () => {
    const hasher = await ScryptPasswordHasher.create();
    const stored = await hasher.hash('correct horse battery');
    expect(await hasher.verify('correct horse battery', stored)).toBe(true);
    expect(hasher.needsRehash(stored)).toBe(false);
    expect(hasher.needsRehash('scrypt$1$1$1$a$b')).toBe(true);
    expect(needsRehash(stored)).toBe(false);
  });
});
