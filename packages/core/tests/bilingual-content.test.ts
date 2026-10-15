import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { ValidationError, VersionConflictError } from '../src/errors';
import {
  canonicalTranslations, cleanTranslations, contentSnapshot, countContentChanges, localizeComment, localizeDish, localizeRestaurant, localizeWine,
  readContentSnapshot, sameTranslations, translationsVersion, DISH_TEXT_FIELDS
} from '../src/i18n/content';
import { ImportService } from '../src/import/import-service';
import { mapTable } from '../src/import/mapping';
import type { ImportFileParser, ParsedFile } from '../src/import/types';
import { buildRows } from '../src/import/validate';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { planDishTranslations } from '../src/services/catalog/translation-rules';
import { TranslationService, restaurantContentVersion } from '../src/services/catalog/translation-service';
import { AdminService } from '../src/services/dashboard/admin-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { SommelierService } from '../src/services/pairings/sommelier-service';
import { PublishService } from '../src/services/publishing/publish-service';
import { dishTranslationsSchema } from '../src/validators/catalog/translations.schema';
import { parseWith } from '../src/validators/parse';

/** Spec 2026-10-15-bilingual-content: translated content, its commands, publishing and import. */

const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };

function build(files: Record<string, ParsedFile> = {}) {
  const data = buildDemoDataset({ ids: 'uuid' });
  const repos = createMemoryRepositories(MemoryStore.from(data));
  let tick = Date.parse('2026-10-15T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  const importFileParser: ImportFileParser = { parse: async (f) => { const p = files[f.name]; if (!p) throw new ValidationError('unsupported_format', 'nope'); return p; } };
  return {
    data, repos,
    tr: new TranslationService(repos),
    som: new SommelierService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    catalog: new CatalogService(repos),
    rec: new RecommendationService(repos),
    admin: new AdminService(repos),
    imp: new ImportService({ ...repos, importFileParser, clock, idGenerator })
  };
}

describe('localize', () => {
  const ds = buildDemoDataset({ ids: 'uuid' });
  const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;

  it('shows the translation, and the base field when there is none', () => {
    expect(localizeDish(duck, 'pl')).toMatchObject({ name: 'Pierś z kaczki', description: expect.stringContaining('sos wiśniowy') });
    expect(localizeDish(duck, 'en')).toMatchObject({ name: 'Duck breast' });
    expect(localizeDish({ ...duck, translations: { pl: { name: 'Kaczka' } } }, 'pl').description).toBe(duck.description);
    expect(localizeDish({ ...duck, translations: { pl: { name: '  ' } } }, 'pl').name).toBe('Duck breast');
    expect(localizeRestaurant(ds.restaurant, 'pl').city).toBe('Warszawa');
    expect(localizeRestaurant(ds.restaurant, 'en').city).toBe('Warsaw');
    const savigny = ds.wines.find((w) => w.name === 'Savigny-lès-Beaune')!;
    expect(localizeWine(savigny, 'pl')).toMatchObject({ region: 'Burgundia', country: 'Francja', name: 'Savigny-lès-Beaune' });
    expect(localizeComment({ comment: 'Base', commentTranslations: { pl: 'Polski' } }, 'pl')).toBe('Polski');
    expect(localizeComment({ comment: 'Base', commentTranslations: {} }, 'pl')).toBe('Base');
  });

  it('every demo dish, wine and sommelier note has a Polish version (R8)', () => {
    for (const d of ds.dishes) expect(d.translations.pl?.name && d.translations.pl?.description).toBeTruthy();
    for (const w of ds.wines) expect(w.translations.pl?.tastingNote && w.translations.pl?.region && w.translations.pl?.country).toBeTruthy();
    for (const p of ds.pairings.filter((x) => x.comment)) expect(p.commentTranslations.pl).toBeTruthy();
    expect(ds.restaurant).toMatchObject({ contentLocale: 'en', translations: { pl: { city: 'Warszawa' } } });
  });

  it('cleans translations without letting prototype keys through', () => {
    const dirty = JSON.parse('{"pl":{"name":" Kaczka ","__proto__":{"x":1},"constructor":"y"},"de":{"name":"Ente"},"__proto__":{"name":"z"}}');
    const clean = cleanTranslations(dirty, DISH_TEXT_FIELDS);
    expect(clean).toEqual({ pl: { name: 'Kaczka' } });
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
    expect(() => parseWith(dishTranslationsSchema, dirty)).toThrow(ValidationError);
    expect(sameTranslations({ pl: { name: 'a', description: '' } }, { pl: { name: 'a' } })).toBe(true);
    expect(canonicalTranslations({ en: {}, pl: { b: '2', a: '1' } })).toBe('{"pl":{"a":"1","b":"2"}}');
    expect(translationsVersion({ pl: { name: 'a' } })).not.toBe(translationsVersion({ pl: { name: 'b' } }));
  });

  it('counts the entities whose translations differ from the published content; old snapshots read as {}', () => {
    const published = readContentSnapshot(contentSnapshot(ds.restaurant, ds.dishes, ds.wines));
    expect(countContentChanges(ds, published)).toBe(0);
    const changed = ds.dishes.map((d) => (d.id === duck.id ? { ...d, translations: { pl: { name: 'Kaczka' } } } : d));
    expect(countContentChanges({ ...ds, dishes: changed }, published)).toBe(1);
    expect(readContentSnapshot(undefined).dishes.size).toBe(0);
    expect(countContentChanges(ds, readContentSnapshot(null))).toBe(1 + ds.dishes.length + ds.wines.length);
  });
});

describe('translation rules', () => {
  it('replaces the languages the input names, keeps the others, drops empty values', () => {
    const current = { pl: { name: 'Kaczka', description: 'Opis' }, en: { name: 'Duck' } };
    expect(planDishTranslations(current, { pl: { name: 'Pierś', description: '' } })).toEqual({ next: { pl: { name: 'Pierś' }, en: { name: 'Duck' } }, changed: true });
    expect(planDishTranslations(current, { pl: { name: 'Kaczka', description: ' Opis ' } }).changed).toBe(false);
  });
});

describe('TranslationService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => { t = build(); });
  const duckOf = () => t.data.dishes.find((d) => d.name === 'Duck breast')!;

  it('saves a dish translation; guests see it only after publish, and it counts as an unpublished change (AC4)', async () => {
    const duck = duckOf();
    const before = await t.publish.preview('halka');
    await t.tr.setDishTranslations('halka', duck.id, { pl: { name: 'Pierś z kaczki po staropolsku', description: '' }, en: { name: '', description: '' } }, ACTOR, translationsVersion(duck.translations));
    expect((await t.repos.dishRepository.findById(t.data.restaurant.id, duck.id))!.translations).toEqual({ pl: { name: 'Pierś z kaczki po staropolsku' } });
    const guestBefore = (await t.catalog.publishedMenu('halka', 'pl'))!.dishes.find((d) => d.id === duck.id)!;
    expect(guestBefore.name).toBe('Pierś z kaczki');
    const preview = await t.publish.preview('halka');
    expect(preview.pendingContent).toBe(1);
    expect(preview.pendingChanges).toBe(before.pendingChanges + 1);
    expect((await t.admin.overview('halka'))!.unpublishedChanges).toBe(preview.pendingChanges);
    // the panel shows the current translation in its language
    expect((await t.admin.dishDetail('halka', duck.id, 'pl'))!.dish.name).toBe('Pierś z kaczki po staropolsku');
    expect((await t.admin.dishDetail('halka', duck.id, 'pl'))!.source.name).toBe('Duck breast');
    const v = await t.publish.publish('halka', ACTOR);
    expect(v.changesCount).toBe(preview.pendingChanges);
    expect((await t.catalog.publishedMenu('halka', 'pl'))!.dishes.find((d) => d.id === duck.id)!.name).toBe('Pierś z kaczki po staropolsku');
    expect((await t.rec.forDish('halka', duck.id, {}, undefined, 'pl'))!.dish.name).toBe('Pierś z kaczki po staropolsku');
    // the public API (no locale) keeps the base fields (R10)
    expect((await t.catalog.publishedMenu('halka'))!.dishes.find((d) => d.id === duck.id)!.name).toBe('Duck breast');
    expect((await t.publish.preview('halka')).pendingContent).toBe(0);
  });

  it('refuses a stale version, an unknown dish and input outside the schema', async () => {
    const duck = duckOf();
    await expect(t.tr.setDishTranslations('halka', duck.id, { pl: { name: 'X' } }, ACTOR, 'stale-1')).rejects.toBeInstanceOf(VersionConflictError);
    await expect(t.tr.setDishTranslations('halka', '00000000-0000-4000-8000-00000000beef', {}, ACTOR)).rejects.toMatchObject({ code: 'not_found' });
    await expect(t.tr.setDishTranslations('halka', duck.id, { de: { name: 'Ente' } }, ACTOR)).rejects.toMatchObject({ code: 'validation_failed', fields: { de: 'unknown_field' } });
    await expect(t.tr.setDishTranslations('halka', duck.id, { pl: { name: 'x'.repeat(121) } }, ACTOR)).rejects.toMatchObject({ fields: { 'pl.name': 'too_long' } });
    await expect(t.tr.setDishTranslations('nope', duck.id, {}, ACTOR)).rejects.toMatchObject({ code: 'not_found' });
    expect(await t.tr.setDishTranslations('halka', duck.id, { pl: duck.translations.pl }, ACTOR)).toEqual({ changed: false });
  });

  it('saves wine translations and the restaurant content (content language, tagline and city)', async () => {
    const wine = t.data.wines[0];
    await t.tr.setWineTranslations('halka', wine.id, { en: { tastingNote: 'Chalky.' } }, ACTOR, translationsVersion(wine.translations));
    expect((await t.repos.wineRepository.findById(t.data.restaurant.id, wine.id))!.translations).toMatchObject({ en: { tastingNote: 'Chalky.' }, pl: wine.translations.pl });
    await expect(t.tr.setWineTranslations('halka', wine.id, {}, ACTOR, 'stale')).rejects.toBeInstanceOf(VersionConflictError);
    const r = t.data.restaurant;
    await t.tr.setRestaurantContent('halka', { contentLocale: 'pl', translations: { pl: { city: 'Warszawa', tagline: 'Kuchnia' }, en: { city: 'Warsaw' } } }, ACTOR, restaurantContentVersion(r));
    expect(await t.repos.restaurantRepository.findBySlug('halka')).toMatchObject({ contentLocale: 'pl', translations: { pl: { city: 'Warszawa', tagline: 'Kuchnia' }, en: { city: 'Warsaw' } } });
    await expect(t.tr.setRestaurantContent('halka', { contentLocale: 'xx', translations: {} }, ACTOR)).rejects.toMatchObject({ fields: { contentLocale: 'invalid' } });
    await expect(t.tr.setRestaurantContent('halka', { contentLocale: 'en', translations: {} }, ACTOR, restaurantContentVersion(r))).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe('note translations (A6)', () => {
  it('saves the note in both languages with the 140-character rule; guests see it after publish', async () => {
    const t = build();
    const duck = t.data.dishes.find((d) => d.name === 'Duck breast')!;
    const p = (await t.repos.pairingRepository.listByDish(t.data.restaurant.id, duck.id)).find((x) => x.role === 'primary')!;
    await expect(t.som.setNote('halka', p.id, { comment: 'Base', translations: { pl: 'x'.repeat(141) } }, ACTOR, p.version)).rejects.toMatchObject({ code: 'comment_too_long', fields: { comment_pl: 'max_140' } });
    await expect(t.som.setNote('halka', p.id, { comment: 'Base', translations: { de: 'x' } }, ACTOR, p.version)).rejects.toMatchObject({ code: 'validation_failed' });
    await t.som.setNote('halka', p.id, { comment: p.comment ?? '', translations: { pl: 'Nowa notatka', en: '' } }, ACTOR, p.version);
    const after = (await t.repos.pairingRepository.findById(t.data.restaurant.id, p.id))!;
    expect(after.commentTranslations).toEqual({ pl: 'Nowa notatka' });
    const history = await t.repos.pairingRepository.listDecisions(t.data.restaurant.id, { pairingId: p.id });
    expect(history[0]).toMatchObject({ action: 'modify', after: { commentTranslations: { pl: 'Nowa notatka' } } });
    expect((await t.rec.forDish('halka', duck.id, {}, undefined, 'pl'))!.result.items[0].why).not.toBe('Nowa notatka');
    await t.publish.publish('halka', ACTOR);
    expect((await t.rec.forDish('halka', duck.id, {}, undefined, 'pl'))!.result.items[0].why).toBe('Nowa notatka');
    expect((await t.admin.pairingWorkbench('halka', duck.id, 'pl'))!.approved[0].note).toBe('Nowa notatka');
  });
});

describe('import with translation columns (R5, AC3)', () => {
  it('recognises _pl / _en columns and their Polish and English header synonyms', () => {
    const t = mapTable('menu', [['Name', 'Price', 'name_pl', 'Opis (PL)', 'Nazwa EN', 'Description – English'], ['Tart', '36', 'Tarta', 'Śliwki', 'Tart', '']]);
    expect(t.records[0]).toEqual({ category: '', name: 'Tart', description: '', price: '36', name_pl: 'Tarta', name_en: 'Tart', description_pl: 'Śliwki', description_en: '' });
    const w = mapTable('wines', [['Producer', 'Wine', 'Bottle', 'tasting_note_pl', 'Kraj PL', 'Region (EN)'], ['Keller', 'Riesling', '240', 'Morela', 'Niemcy', 'Rhinehesse']]);
    expect(w.records[0]).toMatchObject({ tasting_note_pl: 'Morela', country_pl: 'Niemcy', region_en: 'Rhinehesse' });
    expect('name_pl' in mapTable('menu', [['Name', 'Price'], ['Tart', '36']]).records[0]).toBe(false);
  });

  it('warns about an empty translation cell and keeps the row importable', () => {
    const [row] = buildRows('menu', [{ name: 'Tart', price: '36', category: '', description: '', name_pl: '', description_pl: 'Śliwki' }], { dishes: [], wines: [] });
    expect(row.issues.find((i) => i.code === 'translation_empty')).toMatchObject({ level: 'warning', field: 'name_pl' });
    expect(row.include).toBe(true);
    expect(row.fields).toMatchObject({ name_pl: '', description_pl: 'Śliwki' });
  });

  it('writes translations of new and existing dishes; an empty cell changes nothing', async () => {
    const t = build({
      'menu.csv': { parser: 'csv', rows: [['Category', 'Name', 'Description', 'Price', 'name_pl', 'description_pl', 'name_en'],
        ['Desserts', 'Plum tart', 'Plums', '36', 'Tarta śliwkowa', 'Śliwki, kruszonka', ''],
        ['Mains', 'Duck breast', 'Roasted duck breast, sour cherry jus, beetroot, toasted buckwheat', '112', '', 'Nowy opis kaczki', 'Duck']] }
    });
    const job = await t.imp.upload('halka', 'menu', { name: 'menu.csv', bytes: new Uint8Array(10) }, ACTOR);
    const duck = t.data.dishes.find((d) => d.name === 'Duck breast')!;
    await t.imp.confirm('halka', job.id, ACTOR, [{ rowNumber: 2, include: true }]);
    const dishes = await t.repos.dishRepository.listByRestaurant(t.data.restaurant.id);
    expect(dishes.find((d) => d.name === 'Plum tart')!.translations).toEqual({ pl: { name: 'Tarta śliwkowa', description: 'Śliwki, kruszonka' } });
    expect(dishes.find((d) => d.id === duck.id)!.translations).toEqual({ pl: { name: 'Pierś z kaczki', description: 'Nowy opis kaczki' }, en: { name: 'Duck' } });
  });
});
