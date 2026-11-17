import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors';
import {
  assertDishUnique, checkFieldsVersion, dishFieldsVersion, nameKey, planDishEdit, planWineEdit, pruneUnchanged, staleTranslationLocales, wineFieldsVersion, wineKey
} from '../src/services/catalog/catalog-edit-rules';
import type { DishFields, WineFields } from '../src/ports/repositories';
import { catalogText, cleanCatalogText } from '../src/validators/catalog/catalog-text';
import { dishDetailsSchema, dishFieldsSchema, dishShapeSchema } from '../src/validators/catalog/dish-fields.schema';
import { parseFormPrice } from '../src/validators/catalog/form-price';
import { wineDetailsSchema, wineFieldsSchema } from '../src/validators/catalog/wine-fields.schema';
import { parseWith } from '../src/validators/parse';

/** Spec 2026-11-16-catalog-field-editing, C1a: R1 to R4 as pure rules (AC1, AC2, AC3, AC5). */

const dish: DishFields = { name: 'Halibut', description: 'Fish', category: 'Mains', price: 96 };
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const wine: WineFields = { producer: 'Dom', name: 'Riesling', vintage: 2020, region: 'Mosel', country: 'Germany', tastingNote: 'Crisp', listNumber: 101, bottlePrice: 200, glassPrice: 40 };
const fieldsOf = (fn: () => unknown): Record<string, string> => {
  try { fn(); } catch (e) { return (e as ValidationError).fields ?? { thrown: String(e) }; }
  return {};
};

describe('text cleaning (R1, W2, W4)', () => {
  it('normalises to NFC, trims and collapses white space; a description keeps its lines', () => {
    expect(cleanCatalogText('  H' + cp(0x61, 0x301) + 'libut ' + cp(9) + '  fillet  ')).toEqual({ text: 'H' + cp(0xe1) + 'libut fillet' });
    expect(cleanCatalogText('a\r\n\r\n\r\n\r\nb  c\n d ', true)).toEqual({ text: 'a\n\nb c\nd' });
    expect(cleanCatalogText('a\nb')).toEqual({ text: 'a b' });
  });

  it('refuses control, invisible and direction characters and line separators in every field', () => {
    for (const bad of [0, 0x202e, 0x200b, 7, 0x2028, 0xfeff, 0xad, 0x2066, 0x85].map((c) => 'a' + cp(c) + 'b')) {
      expect(cleanCatalogText(bad), JSON.stringify(bad)).toEqual({ error: 'invalid_chars' });
      expect(cleanCatalogText(bad, true), JSON.stringify(bad)).toEqual({ error: 'invalid_chars' });
    }
  });

  it('counts code points and names the problem: required, too_long, invalid_chars', () => {
    const f = catalogText({ max: 3, required: true });
    expect(f.safeParse('😀😀😀').success).toBe(true);
    expect(f.safeParse('😀😀😀😀').success).toBe(false);
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { name: '   ' }))).toEqual({ name: 'required' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { name: 'x'.repeat(121) }))).toEqual({ name: 'too_long' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { name: 'A' + cp(0x202e) + 'B' }))).toEqual({ name: 'invalid_chars' });
    expect(parseWith(dishFieldsSchema, { description: '  ' })).toEqual({ description: '' });
  });
});

describe('dish schema (R1, AC1)', () => {
  it('accepts a partial update and returns the cleaned values', () => {
    expect(parseWith(dishFieldsSchema, { name: ' Halibut ', price: 58.5 })).toEqual({ name: 'Halibut', price: 58.5 });
    expect(parseWith(dishFieldsSchema, { price: 19.99 })).toEqual({ price: 19.99 });
  });

  it('reports every wrong field at once and refuses extra fields', () => {
    const fields = fieldsOf(() => parseWith(dishFieldsSchema, { name: '', category: 'Snacks', price: 0, description: 'x'.repeat(1001) }));
    expect(fields).toEqual({ name: 'required', category: 'invalid', price: 'not_positive', description: 'too_long' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { price: -1 }))).toEqual({ price: 'not_positive' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { price: 12.345 }))).toEqual({ price: 'too_many_decimals' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { price: 10_000.01 }))).toEqual({ price: 'out_of_range' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { price: '58' }))).toEqual({ price: 'invalid' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, JSON.parse('{"price": 1e999}')))).toEqual({ price: 'invalid' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { price: Number.NaN }))).toEqual({ price: 'invalid' });
    expect(fieldsOf(() => parseWith(dishFieldsSchema, { profile: {}, status: 'hidden', name: 'ok' }))).toEqual({ profile: 'unknown_field', status: 'unknown_field' });
  });

  it('keeps unknown keys out, including __proto__, and wants at least one field in a body', () => {
    expect(Object.keys(fieldsOf(() => parseWith(dishDetailsSchema, JSON.parse('{"__proto__": 1}'))))).toContain('__proto__');
    expect(fieldsOf(() => parseWith(dishDetailsSchema, {}))).toEqual({ body: 'required' });
    expect(fieldsOf(() => parseWith(dishShapeSchema, {}))).toEqual({ body: 'required' });
  });
});

describe('wine schema (R2, AC2)', () => {
  it('checks vintage, list number, prices and the glass switch types', () => {
    expect(parseWith(wineFieldsSchema, { vintage: 'NV', listNumber: null, pouredByGlass: false })).toEqual({ vintage: 'NV', listNumber: null, pouredByGlass: false });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { vintage: 1899 }))).toEqual({ vintage: 'out_of_range' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { vintage: 'nv' }))).toEqual({ vintage: 'invalid' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { vintage: 2019.5 }))).toEqual({ vintage: 'invalid' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { listNumber: 0 }))).toEqual({ listNumber: 'out_of_range' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { listNumber: 10000 }))).toEqual({ listNumber: 'out_of_range' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { bottlePrice: 100_000.5, glassPrice: 0 }))).toEqual({ bottlePrice: 'out_of_range', glassPrice: 'not_positive' });
    expect(fieldsOf(() => parseWith(wineFieldsSchema, { pouredByGlass: 'yes', producer: ' ', name: 'x'.repeat(161) }))).toEqual({ pouredByGlass: 'invalid', producer: 'required', name: 'too_long' });
    expect(fieldsOf(() => parseWith(wineDetailsSchema, {}))).toEqual({ body: 'required' });
  });
});

describe('form prices (R11, B3)', () => {
  it('reads one separator with one or two digits, spaces as thousands and a currency word', () => {
    expect(parseFormPrice('58,50')).toBe(58.5);
    expect(parseFormPrice('58.5')).toBe(58.5);
    expect(parseFormPrice('58')).toBe(58);
    expect(parseFormPrice(' 1 234,5 zł ')).toBe(1234.5);
    expect(parseFormPrice('1' + cp(0xa0) + '234')).toBe(1234);
    expect(parseFormPrice('120 PLN')).toBe(120);
  });

  it('refuses what the import would read as thousands or as something else', () => {
    for (const bad of ['58,500', '1.234', '1,234.50', 'abc', '', ' ', '12,', ',5', '1e3', '-5', '1 23', '12.345', '5,5,5', '58 zł zł']) {
      expect(parseFormPrice(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('fingerprints and keys (R4, R1)', () => {
  it('changes with an editable field and with nothing else', () => {
    const v = dishFieldsVersion(dish);
    expect(v).toMatch(/^[0-9a-f]{8}-\d{1,6}$/);
    expect(dishFieldsVersion({ ...dish })).toBe(v);
    for (const over of [{ name: 'Cod' }, { description: 'x' }, { category: 'Starters' as const }, { price: 96.5 }]) expect(dishFieldsVersion({ ...dish, ...over })).not.toBe(v);
    const w = wineFieldsVersion(wine);
    for (const over of [{ producer: 'X' }, { name: 'X' }, { vintage: 'NV' as const }, { region: 'X' }, { country: 'X' }, { tastingNote: 'X' }, { listNumber: null }, { bottlePrice: 201 }, { glassPrice: null }]) {
      expect(wineFieldsVersion({ ...wine, ...over })).not.toBe(w);
    }
    expect(() => checkFieldsVersion(v, v)).not.toThrow();
    expect(() => checkFieldsVersion(v, undefined)).not.toThrow();
    expect(() => checkFieldsVersion(v, '00000000-1')).toThrow();
  });

  it('compares names by the import key, with a fallback for names without Latin letters', () => {
    expect(nameKey('Tatar')).toBe(nameKey('Tatar!'));
    expect(nameKey('  TATAR  wołowy')).toBe(nameKey('tatar wolowy'));
    expect(nameKey('Борщ')).not.toBe(nameKey('Суп'));
    expect(nameKey('Борщ')).toBe(nameKey('борщ'));
    expect(wineKey(wine)).toBe(wineKey({ ...wine, producer: 'DOM!' }));
    expect(wineKey(wine)).not.toBe(wineKey({ ...wine, vintage: 'NV' }));
  });
});

describe('planDishEdit (R1, R3, AC3, AC5)', () => {
  const others = [{ id: 'a', name: 'Tatar' }, { id: 'b', name: 'Cod' }];
  it('applies the change, names the changed fields and flags a rename as identity', () => {
    const p = planDishEdit(dish, { name: 'Halibut fillet', price: 99 }, { selfId: 'x', others });
    expect(p).toMatchObject({ changed: true, keys: ['name', 'price'], before: { name: 'Halibut', price: 96 }, after: { name: 'Halibut fillet', price: 99 }, identity: true });
    expect(planDishEdit(dish, { price: 99 }, { selfId: 'x', others }).identity).toBe(false);
  });

  it('is a no-change when nothing differs after cleaning', () => {
    const p = planDishEdit(dish, parseWith(dishFieldsSchema, { name: ' Halibut ', price: 96 }), { selfId: 'x', others });
    expect(p.changed).toBe(false);
    expect(p.keys).toEqual([]);
  });

  it('refuses a name that collides with another dish, only when the name changes (a stored duplicate does not block a price)', () => {
    expect(fieldsOf(() => planDishEdit(dish, { name: 'tatar!' }, { selfId: 'x', others }))).toEqual({ name: 'duplicate' });
    expect(planDishEdit({ ...dish, name: 'Cod' }, { price: 50 }, { selfId: 'x', others }).changed).toBe(true);
    expect(() => assertDishUnique(dish, { ...dish, name: 'Halibut' }, 'x', others)).not.toThrow();
    // renaming a dish to its own name in another case is fine
    expect(planDishEdit(dish, { name: 'HALIBUT' }, { selfId: 'x', others: [...others, { id: 'x', name: 'Halibut' }] }).changed).toBe(true);
  });
});

describe('planWineEdit (R2, AC2, AC3)', () => {
  const ctx = { selfId: 'w', others: [{ id: 'o', producer: 'Other', name: 'Pinot', vintage: 2019 as number | 'NV', listNumber: 102 }], maxVintage: 2027 };

  it('switches the glass off by saving null, with a glass price it is not allowed', () => {
    const p = planWineEdit(wine, { pouredByGlass: false }, ctx);
    expect(p.next.glassPrice).toBeNull();
    expect(p.keys).toEqual(['glassPrice']);
    expect(fieldsOf(() => planWineEdit(wine, { pouredByGlass: false, glassPrice: 30 }, ctx))).toEqual({ glassPrice: 'not_allowed' });
    expect(fieldsOf(() => planWineEdit({ ...wine, glassPrice: null }, { glassPrice: 30 }, ctx))).toEqual({ glassPrice: 'not_allowed' });
  });

  it('wants a glass price below the bottle, judged on the merged state', () => {
    expect(fieldsOf(() => planWineEdit({ ...wine, glassPrice: null }, { pouredByGlass: true }, ctx))).toEqual({ glassPrice: 'required' });
    expect(fieldsOf(() => planWineEdit(wine, { glassPrice: 200 }, ctx))).toEqual({ glassPrice: 'glass_not_below_bottle' });
    expect(fieldsOf(() => planWineEdit(wine, { bottlePrice: 30 }, ctx))).toEqual({ bottlePrice: 'glass_not_below_bottle' });
    expect(planWineEdit(wine, { bottlePrice: 30, glassPrice: 10 }, ctx).next).toMatchObject({ bottlePrice: 30, glassPrice: 10 });
    expect(planWineEdit({ ...wine, glassPrice: null }, { pouredByGlass: true, glassPrice: 25 }, ctx).next.glassPrice).toBe(25);
  });

  it('limits the vintage to next year and checks uniqueness, reporting everything at once', () => {
    expect(fieldsOf(() => planWineEdit(wine, { vintage: 2028 }, ctx))).toEqual({ vintage: 'out_of_range' });
    expect(planWineEdit(wine, { vintage: 2027 }, ctx).changed).toBe(true);
    expect(fieldsOf(() => planWineEdit(wine, { producer: 'other', name: 'PINOT', vintage: 2019 }, ctx))).toEqual({ name: 'duplicate' });
    expect(fieldsOf(() => planWineEdit(wine, { listNumber: 102 }, ctx))).toEqual({ listNumber: 'duplicate' });
    expect(fieldsOf(() => planWineEdit(wine, { vintage: 2030, listNumber: 102, glassPrice: 300 }, ctx))).toEqual({ vintage: 'out_of_range', glassPrice: 'glass_not_below_bottle' });
    // an unchanged list number that is taken (history) is no error
    expect(planWineEdit({ ...wine, listNumber: 102 }, { bottlePrice: 210 }, ctx).changed).toBe(true);
    expect(planWineEdit(wine, { listNumber: null }, ctx).next.listNumber).toBeNull();
  });

  it('flags producer, name and vintage as identity, nothing else', () => {
    expect(planWineEdit(wine, { vintage: 2021 }, ctx).identity).toBe(true);
    expect(planWineEdit(wine, { name: 'Riesling Kabinett' }, ctx).identity).toBe(true);
    expect(planWineEdit(wine, { region: 'Rheingau', bottlePrice: 210 }, ctx).identity).toBe(false);
  });
});

describe('pruneUnchanged (R1: a stored value that breaks a new rule does not block another field)', () => {
  it('drops fields equal to the stored value, also with browser line breaks, and keeps the named ones', () => {
    const stored = { name: 'A', description: 'x\ny', price: 10, pouredByGlass: false };
    expect(pruneUnchanged({ name: 'A', description: 'x\r\ny', price: 11, pouredByGlass: false }, stored, ['pouredByGlass'])).toEqual({ price: 11, pouredByGlass: false });
    expect(pruneUnchanged({ name: 'A' }, stored)).toEqual({});
    expect(pruneUnchanged({ price: '10' }, stored)).toEqual({ price: '10' });
  });
});

describe('staleTranslationLocales (R11, N2)', () => {
  it('names the languages whose published translation belongs to a changed field', () => {
    const t = { en: { name: 'Halibut', description: '' }, pl: { description: 'Opis' } };
    expect(staleTranslationLocales('dish', ['name'], t)).toEqual(['en']);
    expect([...staleTranslationLocales('dish', ['description', 'name'], t)].sort()).toEqual(['en', 'pl']);
    expect(staleTranslationLocales('dish', ['price'], t)).toEqual([]);
    expect(staleTranslationLocales('dish', ['name'], undefined)).toEqual([]);
    expect(staleTranslationLocales('wine', ['name', 'bottlePrice'], { en: { tastingNote: 'x' } })).toEqual([]);
    expect(staleTranslationLocales('wine', ['region'], { en: { region: 'Mosel' } })).toEqual(['en']);
  });
});
