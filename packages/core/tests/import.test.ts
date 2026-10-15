import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { InvariantError, ValidationError } from '../src/errors';
import { ImportService } from '../src/import/import-service';
import { linesToRows, mapTable } from '../src/import/mapping';
import { normKey, normaliseCategory, normaliseStyle, normaliseVintage, parsePrice } from '../src/import/normalize';
import { IMPORT_LIMITS, type ImportFileParser, type ParsedFile } from '../src/import/types';
import { buildRows, revalidate, type ExistingItems } from '../src/import/validate';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { RestaurantService } from '../src/services/restaurants/restaurant-service';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { importContract } from '../src/testing/import-contract';

describe('prices', () => {
  it.each([
    ['46', 46], ['58,50 zł', 58.5], ['1 234,50', 1234.5], ['1.234,50', 1234.5], ['1,234.50', 1234.5], ['1,234', 1234], ['12,5', 12.5],
    ['12.5', 12.5], ['PLN 120', 120], ['120,-', 120], ['€12.5', 12.5], ['38,50 zl', 38.5], ['0,5', 0.5], ['1 000', 1000], ['38.999', 38999]
  ])('reads %s as %d', (text, n) => expect(parsePrice(text)).toBe(n));

  it.each(['', 'abc', '-5', 'ca. 40', '12/15', '1,2,3x'])('refuses "%s"', (text) => expect(parsePrice(text)).toBeNull());
});

describe('normalisers', () => {
  it('categories in English and Polish', () => {
    for (const [t, c] of [['Starters', 'Starters'], ['PRZYSTAWKI', 'Starters'], ['Dania główne', 'Mains'], ['mains', 'Mains'], ['Desery', 'Desserts'], ['Zakąski', 'Starters']] as const) expect(normaliseCategory(t)).toBe(c);
    expect(normaliseCategory('Snacks')).toBeNull();
    expect(normaliseCategory('')).toBeNull();
  });

  it('styles in English and Polish', () => {
    for (const [t, s] of [['Red', 'red'], ['czerwone', 'red'], ['Białe', 'white'], ['Rosé', 'rose'], ['różowe', 'rose'], ['Musujące', 'sparkling'], ['Champagne', 'sparkling'], ['Orange', 'orange'], ['słodkie', 'sweet'], ['Port', 'sweet']] as const) expect(normaliseStyle(t)).toBe(s);
    expect(normaliseStyle('fizzy')).toBeNull();
  });

  it('vintages', () => {
    expect([normaliseVintage('2021'), normaliseVintage('2021.0'), normaliseVintage('NV'), normaliseVintage('N.V.'), normaliseVintage('bez rocznika'), normaliseVintage(' 1999 ')]).toEqual(['2021', '2021', 'NV', 'NV', 'NV', '1999']);
    expect(normaliseVintage('1850')).toBeNull();
    expect(normaliseVintage('twenty')).toBeNull();
    expect(normaliseVintage('')).toBeNull();
  });

  it('comparison keys ignore case, accents, Polish letters and punctuation', () => {
    expect(normKey('  Łosoś — „Wędzony”! ')).toBe('losos wedzony');
    expect(normKey('Duck  Breast')).toBe(normKey('duck breast'));
  });
});

describe('finding the columns', () => {
  it('reads an English header in any order, ignoring columns it does not know', () => {
    const t = mapTable('menu', [['Price', 'Name', 'Allergens', 'Category'], ['46', 'Tart', 'nuts', 'Desserts']]);
    expect(t.records).toEqual([{ category: 'Desserts', name: 'Tart', description: '', price: '46' }]);
    expect(t.notes.join(' ')).toMatch(/Columns not used: Allergens/);
  });

  it('reads Polish headers, including "Cena (PLN)"', () => {
    const t = mapTable('menu', [['Kategoria', 'Danie', 'Opis', 'Cena (PLN)'], ['Desery', 'Sernik', 'Rokitnik', '38']]);
    expect(t.records[0]).toEqual({ category: 'Desery', name: 'Sernik', description: 'Rokitnik', price: '38' });
  });

  it('finds the header below a title row', () => {
    const t = mapTable('menu', [['Autumn menu'], ['Name', 'Price'], ['Tart', '36']]);
    expect(t.records).toEqual([{ category: '', name: 'Tart', description: '', price: '36' }]);
    expect(t.notes.join(' ')).toMatch(/No category column/);
  });

  it('a plain "Price" next to a glass price is the bottle price', () => {
    const t = mapTable('wines', [['Producer', 'Wine', 'Glass', 'Price'], ['Keller', 'Riesling', '52', '240']]);
    expect(t.records[0]).toMatchObject({ producer: 'Keller', name: 'Riesling', glassPrice: '52', bottlePrice: '240' });
  });

  it('without a header, reads the default order and says so', () => {
    const t = mapTable('menu', [['Starters', 'Tart', 'Sweet', '36'], ['Mains', 'Duck', 'Cherry', '112']]);
    expect(t.records[1]).toEqual({ category: 'Mains', name: 'Duck', description: 'Cherry', price: '112' });
    expect(t.notes[0]).toMatch(/No header row was found.*category, name, description, price/);
    expect(mapTable('menu', [['Tart', '36']]).records[0]).toMatchObject({ name: 'Tart', price: '36' });
  });

  it('keeps short rows and skips empty ones', () => {
    const t = mapTable('menu', [['Name', 'Price'], ['Tart'], ['', ''], ['Duck', '112']]);
    expect(t.records.map((r) => [r.name, r.price])).toEqual([['Tart', ''], ['Duck', '112']]);
  });
});

describe('PDF lines', () => {
  const lines = ['Halka - Autumn menu', 'Starters', 'Smoked trout rillettes ........................ 46', 'Horseradish cream, pickled cucumber',
    'Beetroot carpaccio 38,50 zl', 'Mains', 'Roast chicken for two ........................ 158', 'Free-range chicken, chanterelles', 'Desserts', 'Plum tart ........................ 36', '2'];

  it('turns priced lines into dishes, section words into categories, and following lines into descriptions', () => {
    const { rows, notes } = linesToRows('menu', lines);
    expect(rows.slice(1)).toEqual([
      ['Starters', 'Smoked trout rillettes', 'Horseradish cream, pickled cucumber', '46'],
      ['Starters', 'Beetroot carpaccio', '', '38,50'],
      ['Mains', 'Roast chicken for two', 'Free-range chicken, chanterelles', '158'],
      ['Desserts', 'Plum tart', '', '36']
    ]);
    expect(notes[0]).toMatch(/check every row/);
  });

  it('the rows survive the whole way: lines → rows → named fields (the prices must not get lost)', () => {
    const wines = mapTable('wines', linesToRows('wines', ['Red', 'Isole e Olena - Chianti Classico 2020 Tuscany 46 / 220', 'Domaine Huet - Le Haut-Lieu Sec 2021 Vouvray 310']).rows);
    expect(wines.records).toEqual([
      { producer: 'Isole e Olena', name: 'Chianti Classico', vintage: '2020', region: 'Tuscany', country: '', grape: '', style: 'Red', glassPrice: '46', bottlePrice: '220' },
      { producer: 'Domaine Huet', name: 'Le Haut-Lieu Sec', vintage: '2021', region: 'Vouvray', country: '', grape: '', style: 'Red', glassPrice: '', bottlePrice: '310' }
    ]);
    const menu = mapTable('menu', linesToRows('menu', ['Starters', 'Beetroot carpaccio ..... 38,50']).rows);
    expect(menu.records).toEqual([{ category: 'Starters', name: 'Beetroot carpaccio', description: '', price: '38,50' }]);
  });

  it('reads wine lines: producer, wine, vintage, region, glass / bottle, style from the heading', () => {
    const { rows } = linesToRows('wines', ['Wine list', 'White', 'Weingut Keller - Riesling trocken 2022 Rheinhessen 52 / 240', 'Domaine Huet - Le Haut-Lieu Sec 2021 Vouvray 310', 'Sparkling', 'Bérêche & Fils - Brut Réserve NV Champagne 68 / 360', '3']);
    expect(rows[0]).toEqual(['producer', 'wine', 'vintage', 'region', 'grape', 'style', 'glass price', 'bottle price']);
    expect(rows.slice(1)).toEqual([
      ['Weingut Keller', 'Riesling trocken', '2022', 'Rheinhessen', '', 'White', '52', '240'],
      ['Domaine Huet', 'Le Haut-Lieu Sec', '2021', 'Vouvray', '', 'White', '', '310'],
      ['Bérêche & Fils', 'Brut Réserve', 'NV', 'Champagne', '', 'Sparkling', '68', '360']
    ]);
  });
});

const existing: ExistingItems = {
  dishes: [{ id: 'd1', name: 'Duck breast' }],
  wines: [{ id: 'w1', producer: 'Marcel Lapierre', name: 'Morgon', vintage: 2022 }]
};

describe('checking menu rows', () => {
  const rec = (o: Record<string, string>) => ({ category: 'Mains', name: 'Tart', description: '', price: '36', ...o });
  const check = (o: Record<string, string>) => buildRows('menu', [rec(o)], existing)[0];
  const errors = (o: Record<string, string>) => check(o).issues.filter((i) => i.level === 'error').map((i) => i.field);

  it('a clean row is ticked and its values are normalised', () => {
    const r = check({ category: 'przystawki', price: '38,50 zł' });
    expect(r).toMatchObject({ include: true, action: 'create', fields: { category: 'Starters', price: '38.5' }, issues: [] });
  });

  it('a missing name or price, or a price that is not a price, is an error and the row is not ticked', () => {
    expect(errors({ name: '' })).toEqual(['name']);
    expect(errors({ price: '' })).toEqual(['price']);
    expect(errors({ price: 'about 40' })).toEqual(['price']);
    expect(errors({ price: '0' })).toEqual(['price']);
    expect(errors({ price: '99999' })).toEqual(['price']);
    expect(check({ price: '' }).include).toBe(false);
  });

  it('a missing or unknown category is only a warning: the dish goes to Mains', () => {
    const r = check({ category: 'Snacks' });
    expect(r.fields.category).toBe('Mains');
    expect(r.issues).toEqual([expect.objectContaining({ level: 'warning', field: 'category', message: expect.stringContaining('Snacks') })]);
    expect(r.include).toBe(true);
  });

  it('a dish that is already on the menu is an update and is NOT ticked', () => {
    const r = check({ name: 'DUCK  breast' });
    expect(r).toMatchObject({ action: 'update', matchId: 'd1', include: false });
    expect(r.issues[0]).toMatchObject({ level: 'warning', code: 'exists' });
  });

  it('the second occurrence in the same file is flagged and not ticked', () => {
    const [a, b] = buildRows('menu', [rec({}), rec({ name: 'tart' })], existing);
    expect(a.include).toBe(true);
    expect(b.include).toBe(false);
    expect(b.issues[0]).toMatchObject({ code: 'duplicate_in_file', message: expect.stringContaining('row 1') });
  });
});

describe('checking wine rows', () => {
  const rec = (o: Record<string, string>) => ({ producer: 'Weingut Keller', name: 'Riesling', vintage: '2022', region: 'Rheinhessen', country: '', grape: 'Riesling', style: 'White', glassPrice: '52', bottlePrice: '240', ...o });
  const check = (o: Record<string, string>) => buildRows('wines', [rec(o)], existing)[0];
  const errors = (o: Record<string, string>) => check(o).issues.filter((i) => i.level === 'error').map((i) => i.field);

  it('a clean row is ticked and normalised', () => {
    expect(check({ style: 'Białe', vintage: '2022.0', glassPrice: '52,00' })).toMatchObject({ include: true, fields: { style: 'white', vintage: '2022', glassPrice: '52' } });
  });

  it('producer, bottle price and a valid vintage are required; the glass price must be lower than the bottle price', () => {
    expect(errors({ producer: '' })).toEqual(['producer']);
    expect(errors({ bottlePrice: '' })).toEqual(['bottlePrice']);
    expect(errors({ vintage: 'twenty' })).toEqual(['vintage']);
    expect(errors({ glassPrice: '300' })).toEqual(['glassPrice']);
    expect(errors({ glassPrice: 'x' })).toEqual(['glassPrice']);
  });

  it('a missing vintage becomes NV, a missing name falls back to the grape, a missing style is guessed from the grape (warnings)', () => {
    const r = check({ vintage: '', name: '', style: '', grape: 'Pinot Noir' });
    expect(r.fields).toMatchObject({ vintage: 'NV', name: 'Pinot Noir', style: 'red' });
    expect(r.issues.every((i) => i.level === 'warning')).toBe(true);
    expect(r.issues.map((i) => i.field)).toEqual(['name', 'vintage', 'style']);
  });

  it('the same producer, wine and vintage already on the list is an update', () => {
    expect(check({ producer: 'marcel lapierre', name: 'MORGON', vintage: '2022' })).toMatchObject({ action: 'update', matchId: 'w1', include: false });
    expect(check({ producer: 'Marcel Lapierre', name: 'Morgon', vintage: '2021' }).action).toBe('create');   // another vintage is another wine
  });
});

describe('issue codes (the dashboard translates issues by code, spec 2026-10-15-polish-language)', () => {
  it('every issue has a code, and the values it quotes travel in params', () => {
    const menu = buildRows('menu', [
      { category: 'Snacks', name: '', description: 'x'.repeat(401), price: 'about 40' },
      { category: '', name: 'Duck breast', description: '', price: '0' }
    ], existing);
    const wines = buildRows('wines', [
      { producer: '', name: '', vintage: 'twenty', region: '', country: '', grape: '', style: 'Fizzy', glassPrice: 'x', bottlePrice: '' },
      { producer: 'P', name: '', vintage: '', region: '', country: '', grape: 'Pinot Noir', style: '', glassPrice: '300', bottlePrice: '200' }
    ], existing);
    const issues = [...menu, ...wines].flatMap((r) => r.issues);
    expect(issues.every((i) => typeof i.code === 'string' && i.message.length > 0)).toBe(true);
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining([
      'category_unknown', 'name_missing', 'description_long', 'price_invalid', 'category_missing', 'price_not_positive', 'exists',
      'producer_missing', 'wine_name_missing', 'vintage_invalid', 'grape_missing', 'style_unknown', 'glass_price_invalid', 'bottle_price_missing',
      'wine_name_from_grape', 'vintage_missing', 'style_missing_from_grape', 'glass_price_not_lower'
    ]));
    expect(menu[0].issues.find((i) => i.code === 'price_invalid')!.params).toEqual({ value: 'about 40' });
    expect(menu[0].issues.find((i) => i.code === 'category_unknown')!.params).toEqual({ value: 'Snacks' });
    expect(wines[0].issues.find((i) => i.code === 'style_unknown')!.params).toMatchObject({ value: 'Fizzy', guess: expect.any(String) });
    expect(wines[1].issues.find((i) => i.code === 'style_missing_from_grape')!.params).toEqual({ guess: 'red' });
  });

  it('a repeat in the file names its first row in params', () => {
    const [, b] = buildRows('menu', [{ category: 'Mains', name: 'Tart', description: '', price: '36' }, { category: 'Mains', name: 'tart', description: '', price: '36' }], existing);
    expect(b.issues[0]).toMatchObject({ code: 'duplicate_in_file', params: { row: '1' } });
  });
});

describe('correcting rows in the preview', () => {
  const start = () => buildRows('menu', [
    { category: 'Mains', name: 'Tart', description: '', price: '' },
    { category: 'Mains', name: 'Pie', description: '', price: '40' }
  ], existing);

  it('fixing an error ticks the row; the other rows keep their state', () => {
    const rows = revalidate('menu', start(), [{ rowNumber: 1, fields: { price: '36,00' } }], existing);
    expect(rows[0]).toMatchObject({ include: true, fields: { price: '36' }, issues: [] });
    expect(rows[1].include).toBe(true);
  });

  it('a form sends the state of EVERY row: an unchanged unticked row that was just fixed is still ticked', () => {
    const rows = start();
    const formEdits = rows.map((r) => ({ rowNumber: r.rowNumber, include: r.include, fields: (r.rowNumber === 1 ? { price: '36' } : {}) as Record<string, string> }));
    const after = revalidate('menu', rows, formEdits, existing);
    expect(after.map((r) => r.include)).toEqual([true, true]);
  });

  it('but a tick the user really changes is respected, also in a form', () => {
    const rows = start();
    const formEdits = rows.map((r) => ({ rowNumber: r.rowNumber, include: r.rowNumber === 2 ? false : r.include }));
    expect(revalidate('menu', rows, formEdits, existing).map((r) => r.include)).toEqual([false, false]);
  });

  it('a row with an error cannot be ticked', () => {
    const rows = revalidate('menu', start(), [{ rowNumber: 1, include: true }], existing);
    expect(rows[0].include).toBe(false);
  });

  it('a user can untick a clean row, and tick an update on purpose', () => {
    let rows = revalidate('menu', start(), [{ rowNumber: 2, include: false }], existing);
    expect(rows[1].include).toBe(false);
    rows = revalidate('menu', rows, [{ rowNumber: 2, fields: { name: 'Duck breast' } }], existing);
    expect(rows[1]).toMatchObject({ action: 'update', include: false });
    rows = revalidate('menu', rows, [{ rowNumber: 2, include: true }], existing);
    expect(rows[1].include).toBe(true);
  });

  it('renaming a row into a duplicate (or out of one) re-checks the others', () => {
    let rows = revalidate('menu', start(), [{ rowNumber: 1, fields: { price: '36', name: 'Pie' } }], existing);
    expect(rows[1].issues.some((i) => i.code === 'duplicate_in_file')).toBe(true);
    rows = revalidate('menu', rows, [{ rowNumber: 1, fields: { name: 'Tart' } }], existing);
    expect(rows[1].issues).toEqual([]);
  });
});

/* ------------------------------ the service ------------------------------ */

const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const MENU: ParsedFile = {
  parser: 'xlsx',
  rows: [['Category', 'Name', 'Description', 'Price'],
    ['Starters', 'Smoked trout rillettes', 'Smoked trout, horseradish cream', '46'],
    ['Mains', 'Roast chicken for two', 'Free-range chicken, chanterelles', '158'],
    ['Mains', 'Veal schnitzel', 'Breaded veal', ''],
    ['Mains', 'Duck breast', 'Roasted duck breast, sour cherry jus', '118'],
    ['Desserts', 'Plum tart', 'Baked plum tart', '36']]
};
const WINES: ParsedFile = {
  parser: 'csv',
  rows: [['Producer', 'Wine', 'Vintage', 'Region', 'Grape', 'Style', 'Glass price', 'Bottle price'],
    ['Weingut Keller', 'Riesling trocken', '2022', 'Rheinhessen', 'Riesling', 'White', '52', '240'],
    ['Isole e Olena', 'Chianti Classico', '2020', 'Tuscany', 'Sangiovese', 'Red', '', '220'],
    ['Marcel Lapierre', 'Morgon', '2022', 'Beaujolais', 'Gamay', 'Red', '48', '230'],
    ['Broken Row', '', '', '', '', '', '', '']]
};

function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(data);
  const repos = createMemoryRepositories(store);
  const files: Record<string, ParsedFile> = { 'menu.xlsx': MENU, 'wines.csv': WINES };
  const importFileParser: ImportFileParser = { parse: async (f) => { const p = files[f.name]; if (!p) throw new ValidationError('unsupported_format', 'nope'); return p; } };
  let tick = Date.parse('2026-10-14T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return {
    data, store, repos, files,
    imp: new ImportService({ ...repos, importFileParser, clock, idGenerator }),
    rec: new RecommendationService(repos),
    catalog: new CatalogService(repos),
    restaurantSvc: new RestaurantService(repos)
  };
}
const file = (name: string, size = 100) => ({ name, bytes: new Uint8Array(size) });

describe('ImportService: menu', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const rid = () => t.data.restaurant.id;

  it('stores a preview with every row checked, and changes nothing yet', async () => {
    const before = (await t.repos.dishRepository.listByRestaurant(rid())).length;
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    expect(job).toMatchObject({ status: 'preview_ready', kind: 'menu', fileName: 'menu.xlsx', parser: 'xlsx', createdBy: ACTOR.name });
    expect(job.rows).toHaveLength(5);
    expect(job.rows.map((r) => r.include)).toEqual([true, true, false, false, true]);   // schnitzel: no price; duck: already on the menu
    expect(job.rows[2].issues[0]).toMatchObject({ level: 'error', field: 'price' });
    expect(job.rows[3]).toMatchObject({ action: 'update' });
    expect((await t.repos.dishRepository.listByRestaurant(rid())).length).toBe(before);
    expect((await t.imp.get('halka', job.id)).rows).toEqual(job.rows);
  });

  it('confirm creates the ticked dishes as drafts with a draft profile, and prepares engine suggestions', async () => {
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    const result = await t.imp.confirm('halka', job.id, ACTOR);
    expect(result).toMatchObject({ created: 3, updated: 0, skipped: 2 });
    const dishes = await t.repos.dishRepository.listByRestaurant(rid());
    const tart = dishes.find((d) => d.name === 'Plum tart')!;
    expect(tart).toMatchObject({ status: 'draft', category: 'Desserts', price: 36, profile: { source: 'draft' } });
    expect(dishes.find((d) => d.name === 'Veal schnitzel')).toBeUndefined();
    const sug = (await t.repos.pairingRepository.listByRestaurant(rid())).filter((p) => p.dishId === tart.id);
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.length).toBeLessThanOrEqual(4);
    expect(sug.every((p) => p.status === 'suggested' && p.source === 'engine' && p.role === null)).toBe(true);
    expect(result.suggestions).toBe((await t.repos.pairingRepository.listByRestaurant(rid())).length - t.data.pairings.length);
    expect((await t.imp.get('halka', job.id))).toMatchObject({ status: 'confirmed', result });
  });

  it('guests see nothing of it: drafts stay off the menu, existing recommendations do not change', async () => {
    const duck = t.data.dishes.find((d) => d.name === 'Duck breast')!;
    const guestBefore = JSON.stringify((await t.rec.forDish('halka', duck.id))!.result.items.map((i) => [i.wine.id, i.matchScore, i.tier]));
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await t.imp.confirm('halka', job.id, ACTOR);
    expect((await t.catalog.publishedMenu('halka'))!.dishes.some((d) => d.name === 'Plum tart')).toBe(false);
    expect(JSON.stringify((await t.rec.forDish('halka', duck.id))!.result.items.map((i) => [i.wine.id, i.matchScore, i.tier]))).toBe(guestBefore);
  });

  it('an update changes description, category and price only; it keeps the profile, the status and the pairings', async () => {
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await t.imp.updateRows('halka', job.id, [{ rowNumber: 4, include: true }]);
    const duck = t.data.dishes.find((d) => d.name === 'Duck breast')!;
    const before = (await t.repos.pairingRepository.listByDish(rid(), duck.id)).length;
    const result = await t.imp.confirm('halka', job.id, ACTOR);
    expect(result.updated).toBe(1);
    const after = (await t.repos.dishRepository.findById(rid(), duck.id))!;
    expect(after).toMatchObject({ price: 118, description: 'Roasted duck breast, sour cherry jus', status: 'published', profile: duck.profile });
    expect((await t.repos.pairingRepository.listByDish(rid(), duck.id)).length).toBe(before);
    expect(after.name).toBe('Duck breast');
  });

  it('corrections sent with the confirm count, so a fixed price is not lost', async () => {
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    const result = await t.imp.confirm('halka', job.id, ACTOR, [{ rowNumber: 3, fields: { price: '64' } }]);
    expect(result.created).toBe(4);
    expect((await t.repos.dishRepository.listByRestaurant(rid())).find((d) => d.name === 'Veal schnitzel')!.price).toBe(64);
  });

  it('refuses an empty selection and a second confirm; a cancelled or confirmed import is closed', async () => {
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await t.imp.updateRows('halka', job.id, job.rows.map((r) => ({ rowNumber: r.rowNumber, include: false })));
    await expect(t.imp.confirm('halka', job.id, ACTOR)).rejects.toMatchObject({ code: 'no_rows_selected' });
    await t.imp.updateRows('halka', job.id, [{ rowNumber: 1, include: true }]);
    await t.imp.confirm('halka', job.id, ACTOR);
    const dishes = (await t.repos.dishRepository.listByRestaurant(rid())).length;
    await expect(t.imp.confirm('halka', job.id, ACTOR)).rejects.toMatchObject({ code: 'job_closed' });
    await expect(t.imp.updateRows('halka', job.id, [{ rowNumber: 1, include: true }])).rejects.toMatchObject({ code: 'job_closed' });
    expect((await t.repos.dishRepository.listByRestaurant(rid())).length).toBe(dishes);
    const j2 = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await t.imp.cancel('halka', j2.id);
    await expect(t.imp.confirm('halka', j2.id, ACTOR)).rejects.toMatchObject({ code: 'job_closed' });
  });

  it('the store itself refuses a double confirm (two clicks at once)', async () => {
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    const plan = { newDishes: [], dishUpdates: [], newWines: [], wineUpdates: [], newPairings: [], result: { created: 0, updated: 0, skipped: 0, suggestions: 0 } };
    await t.repos.importRepository.confirm(rid(), job.id, plan, '2026-10-14T11:00:00.000Z');
    await expect(t.repos.importRepository.confirm(rid(), job.id, plan, '2026-10-14T11:00:01.000Z')).rejects.toBeInstanceOf(InvariantError);
  });

  it('reports problems with the file or the request', async () => {
    await expect(t.imp.upload('halka', 'menu', file('what.docx'), ACTOR)).rejects.toMatchObject({ code: 'unsupported_format' });
    await expect(t.imp.upload('halka', 'sales' as never, file('menu.xlsx'), ACTOR)).rejects.toMatchObject({ code: 'invalid_kind' });
    t.files['header.csv'] = { parser: 'csv', rows: [['name', 'price']] };
    await expect(t.imp.upload('halka', 'menu', file('header.csv'), ACTOR)).rejects.toMatchObject({ code: 'no_rows' });
    await expect(t.imp.upload('nope', 'menu', file('menu.xlsx'), ACTOR)).rejects.toMatchObject({ code: 'not_found' });
    await expect(t.imp.updateRows('halka', '00000000-0000-4000-8000-00000000ffff', [])).rejects.toMatchObject({ code: 'not_found' });
    const job = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await expect(t.imp.updateRows('halka', job.id, [{ rowNumber: 99, include: true }])).rejects.toMatchObject({ code: 'unknown_row' });
    expect(IMPORT_LIMITS.maxRows).toBe(2000);
  });

  it('turns a PDF read as text into a preview with a note to check every row', async () => {
    t.files['menu.pdf'] = { parser: 'pdf-text', lines: ['Starters', 'Beetroot carpaccio ...... 38,50', 'Goat cheese, walnuts', 'Mains', 'Roast chicken ...... 158'] };
    const job = await t.imp.upload('halka', 'menu', file('menu.pdf'), ACTOR);
    expect(job.fileType).toBe('pdf');
    expect(job.notes[0]).toMatch(/check every row/);
    expect(job.rows.map((r) => [r.fields.name, r.fields.category, r.fields.price])).toEqual([['Beetroot carpaccio', 'Starters', '38.5'], ['Roast chicken', 'Mains', '158']]);
  });

  it('lists recent imports of one kind, newest first', async () => {
    const a = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    await t.imp.upload('halka', 'wines', file('wines.csv'), ACTOR);
    const b = await t.imp.upload('halka', 'menu', file('menu.xlsx'), ACTOR);
    expect((await t.imp.recent('halka', 'menu')).map((j) => j.id)).toEqual([b.id, a.id]);
  });
});

describe('ImportService: wines', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const rid = () => t.data.restaurant.id;

  it('previews the file: clean rows ticked, the one without a name or price flagged, the existing wine an update', async () => {
    const job = await t.imp.upload('halka', 'wines', file('wines.csv'), ACTOR);
    expect(job.rows.map((r) => r.include)).toEqual([true, true, false, false]);
    expect(job.rows[2].action).toBe('update');
    expect(job.rows[3].issues.filter((i) => i.level === 'error').map((i) => i.field)).toEqual(expect.arrayContaining(['name', 'bottlePrice']));
  });

  it('confirm adds active wines with list numbers, a style-based colour, a profile from the grape and suggestions', async () => {
    const job = await t.imp.upload('halka', 'wines', file('wines.csv'), ACTOR);
    const result = await t.imp.confirm('halka', job.id, ACTOR);
    expect(result).toMatchObject({ created: 2, updated: 0, skipped: 2 });
    const wines = await t.repos.wineRepository.listByRestaurant(rid());
    const keller = wines.find((w) => w.producer === 'Weingut Keller')!;
    expect(keller).toMatchObject({ active: true, vintage: 2022, glassPrice: 52, glassPour: 150, bottlePrice: 240, bottleSize: 750, grapes: ['Riesling'], profile: { style: 'white' } });
    expect(keller.listNumber).toBe(Math.max(...t.data.wines.map((w) => w.listNumber ?? 0)) + 1);
    expect(wines.find((w) => w.producer === 'Isole e Olena')).toMatchObject({ glassPrice: null, profile: { style: 'red' } });
    const sug = (await t.repos.pairingRepository.listByRestaurant(rid())).filter((p) => p.wineId === keller.id);
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.every((p) => p.status === 'suggested')).toBe(true);
    expect(result.suggestions).toBe((await t.repos.pairingRepository.listByRestaurant(rid())).length - t.data.pairings.length);
  });

  it('a wine update changes prices only', async () => {
    const job = await t.imp.upload('halka', 'wines', file('wines.csv'), ACTOR);
    await t.imp.updateRows('halka', job.id, [{ rowNumber: 3, include: true }]);
    await t.imp.confirm('halka', job.id, ACTOR);
    const morgon = t.data.wines.find((w) => w.name === 'Morgon')!;
    const after = (await t.repos.wineRepository.findById(rid(), morgon.id))!;
    expect(after).toMatchObject({ glassPrice: 48, bottlePrice: 230, profile: morgon.profile, grapes: morgon.grapes, listNumber: morgon.listNumber });
  });

  it('new wines show up for guests at once (wines are live), but only as engine picks', async () => {
    const job = await t.imp.upload('halka', 'wines', file('wines.csv'), ACTOR);
    await t.imp.confirm('halka', job.id, ACTOR);
    const dishes = await t.repos.dishRepository.listByRestaurant(rid(), { statuses: ['published'] });
    const seen = (await Promise.all(dishes.map((d) => t.rec.forDish('halka', d.id)))).flatMap((r) => r!.result.items).filter((i) => i.wine.producer === 'Weingut Keller' || i.wine.producer === 'Isole e Olena');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((i) => i.tier === 2 && !i.sommelier)).toBe(true);
  });
});

describe('suggestions for what has none', () => {
  it('adds the missing engine suggestions, skips existing pairs, and is idempotent', async () => {
    const t = build();
    const rid = t.data.restaurant.id;
    expect(await t.imp.regenerateSuggestions('halka')).toBe(0);                         // the demo is complete
    const list = t.store.pairings.get(rid)!;
    const tart = t.data.dishes.find((d) => d.name === 'Plum tart' || d.category === 'Desserts')!;
    const removed = list.filter((p) => p.dishId === tart.id && p.status === 'suggested');
    t.store.pairings.set(rid, list.filter((p) => !removed.includes(p)));
    expect(removed.length).toBeGreaterThan(0);
    expect(await t.imp.regenerateSuggestions('halka')).toBe(removed.length);
    expect(await t.imp.regenerateSuggestions('halka')).toBe(0);
  });
});

describe('RestaurantService', () => {
  it('updates the details, lower-cases the slug and keeps the memberships in step', async () => {
    const t = build();
    const out = await t.restaurantSvc.updateDetails('halka', { name: '  Halka Warszawa ', slug: 'Halka-Warszawa', address: 'ul. Mokotowska 48', wineDirector: 'Marta Wierzbicka' });
    expect(out).toMatchObject({ name: 'Halka Warszawa', slug: 'halka-warszawa' });
    expect(await t.repos.restaurantRepository.findBySlug('halka')).toBeNull();
    expect((await t.repos.restaurantRepository.findBySlug('halka-warszawa'))!.name).toBe('Halka Warszawa');
    const m = t.store.memberships.find((x) => x.restaurantId === t.data.restaurant.id)!;
    expect(m).toMatchObject({ restaurantSlug: 'halka-warszawa', restaurantName: 'Halka Warszawa' });
  });

  it.each([['a', 'invalid'], ['Has Spaces', 'invalid'], ['under_score', 'invalid'], ['-lead', 'invalid'], ['trail-', 'invalid'], ['x'.repeat(41), 'invalid'], ['login', 'reserved'], ['api', 'reserved'], ['admin', 'reserved']])('refuses the slug "%s" (%s)', async (slug, why) => {
    const t = build();
    await expect(t.restaurantSvc.updateDetails('halka', { slug })).rejects.toMatchObject({ code: 'validation_failed', fields: { slug: why } });
  });

  it('refuses a slug used by another restaurant, and empty fields', async () => {
    const data = buildDemoDataset({ ids: 'uuid' });
    const other = buildDemoDataset({ ids: 'raw' });
    other.restaurant.slug = 'other';
    const repos = createMemoryRepositories(MemoryStore.from(data, other));
    const svc = new RestaurantService(repos);
    await expect(svc.updateDetails('halka', { slug: 'other' })).rejects.toMatchObject({ code: 'slug_taken' });
    await expect(svc.updateDetails('halka', { name: ' ', address: '' })).rejects.toMatchObject({ fields: { name: 'required', address: 'required' } });
    await expect(svc.updateDetails('nope', { name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });
});

importContract('memory', async () => { const dataset = buildDemoDataset({ ids: 'uuid' }); return { repos: createMemoryRepositories(MemoryStore.from(dataset)), dataset }; }, { describe, it, expect, beforeEach });
