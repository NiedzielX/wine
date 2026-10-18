import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors';
import { buildRows, revalidate } from '../src/import/validate';
import { bulkDecisionSchema, codeActionSchema, confirmImportSchema, loginSchema, pairingCreateSchema, pairingUpdateSchema, parseWith, rowEditsSchema, tableRecommendationSchema, wineAvailabilitySchema } from '../src/validators';

const GUID = '0050b6dd-3e72-8012-bbc9-7f4f99f579d4';
const GUID2 = '00000000-0000-4000-8000-000000000002';

const fieldsOf = (schema: Parameters<typeof parseWith>[0], input: unknown): Record<string, string> => {
  try {
    parseWith(schema, input);
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    expect((e as ValidationError).code).toBe('validation_failed');
    return (e as ValidationError).fields ?? {};
  }
  throw new Error('expected the input to be refused');
};

describe('parseWith', () => {
  it('returns only what the schema describes (a typed, explicit value)', () => {
    expect(parseWith(loginSchema, { email: '  a@b.pl ', password: 'x' })).toEqual({ email: 'a@b.pl', password: 'x' });
  });

  it('names each problem with a short code: required / invalid / too_long / unknown_field', () => {
    expect(fieldsOf(loginSchema, {})).toEqual({ email: 'required', password: 'required' });
    expect(fieldsOf(loginSchema, { email: 5, password: 'x' })).toEqual({ email: 'invalid' });
    expect(fieldsOf(loginSchema, { email: '', password: 'x' })).toEqual({ email: 'required' });
    expect(fieldsOf(loginSchema, { email: 'a', password: 'x'.repeat(2000) })).toEqual({ password: 'too_long' });
    expect(fieldsOf(loginSchema, 'not an object')).toEqual({ body: 'invalid' });
    expect(fieldsOf(loginSchema, null)).toEqual({ body: 'invalid' });
  });
});

describe('mass assignment: unknown fields are refused, not ignored', () => {
  it('a login cannot carry extras', () => {
    expect(fieldsOf(loginSchema, { email: 'a', password: 'b', role: 'owner' })).toEqual({ role: 'unknown_field' });
  });

  it('a pairing change cannot set the id, the version, the rank, the source or the author', () => {
    for (const evil of [{ id: GUID }, { version: 9 }, { rank: 1 }, { source: 'sommelier' }, { updatedBy: 'someone' }, { dirty: false }]) {
      const key = Object.keys(evil)[0];
      expect(fieldsOf(pairingUpdateSchema, { comment: 'ok', ...evil })).toEqual({ [key]: 'unknown_field' });
    }
  });

  it('a new pairing cannot set its score, status, source or author', () => {
    expect(fieldsOf(pairingCreateSchema, { dishId: GUID, wineId: GUID2, modelScore: 99, status: 'approved', source: 'engine' })).toEqual({ modelScore: 'unknown_field', status: 'unknown_field', source: 'unknown_field' });
  });

  it('prototype pollution keys are just unknown fields', () => {
    expect(fieldsOf(loginSchema, JSON.parse('{"email":"a","password":"b","__proto__":{"admin":true},"constructor":{"x":1}}'))).toMatchObject({ constructor: 'unknown_field' });
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });
});

describe('pairing change: exactly one of status, role, note', () => {
  it('accepts each alone', () => {
    expect(parseWith(pairingUpdateSchema, { status: 'approved' })).toEqual({ status: 'approved' });
    expect(parseWith(pairingUpdateSchema, { role: 'best_value' })).toEqual({ role: 'best_value' });
    expect(parseWith(pairingUpdateSchema, { comment: '' })).toEqual({ comment: '' });
  });

  it('refuses none, two, and values outside the lists', () => {
    expect(fieldsOf(pairingUpdateSchema, {})).toEqual({ body: 'one_of_status_role_comment' });
    expect(fieldsOf(pairingUpdateSchema, { status: 'approved', role: 'primary' })).toEqual({ body: 'one_of_status_role_comment' });
    expect(fieldsOf(pairingUpdateSchema, { status: 'modified' })).toEqual({ status: 'invalid' });
    expect(fieldsOf(pairingUpdateSchema, { role: 'boss' })).toEqual({ role: 'invalid' });
    expect(fieldsOf(pairingUpdateSchema, { comment: 'x'.repeat(1001) })).toEqual({ comment: 'too_long' });
  });

  it('lets a note over 140 characters through: the pairing rule gives the proper message', () => {
    expect(parseWith(pairingUpdateSchema, { comment: 'x'.repeat(141) }).comment).toHaveLength(141);
  });
});

describe('other write bodies', () => {
  it('a new pairing needs real ids', () => {
    expect(parseWith(pairingCreateSchema, { dishId: GUID, wineId: GUID2, role: null }).role).toBeNull();
    expect(fieldsOf(pairingCreateSchema, { dishId: 'x', wineId: GUID2 })).toEqual({ dishId: 'invalid' });
    expect(fieldsOf(pairingCreateSchema, { dishId: GUID })).toEqual({ wineId: 'required' });
    expect(fieldsOf(pairingCreateSchema, { dishId: GUID, wineId: GUID2, role: 'boss' })).toEqual({ role: 'invalid' });
  });

  it('bulk decision and wine availability', () => {
    expect(parseWith(bulkDecisionSchema, { action: 'approve_all' })).toEqual({ action: 'approve_all' });
    expect(fieldsOf(bulkDecisionSchema, { action: 'delete_everything' })).toEqual({ action: 'invalid' });
    expect(fieldsOf(bulkDecisionSchema, { action: 'approve_all', dishId: 'nope' })).toEqual({ dishId: 'invalid' });
    expect(parseWith(wineAvailabilitySchema, { active: false })).toEqual({ active: false });
    expect(fieldsOf(wineAvailabilitySchema, { active: 'yes' })).toEqual({ active: 'invalid' });
    expect(fieldsOf(wineAvailabilitySchema, {})).toEqual({ active: 'required' });
  });

  it('table recommendation: 2 to 12 distinct dishes, known preferences only', () => {
    const ok = parseWith(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: [GUID, GUID2], preferences: { serving: 'bottle', styles: ['red'], maxPrice: 300 } });
    expect(ok.dishIds).toHaveLength(2);
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: [GUID] })).toEqual({ dishIds: 'at_least_two_distinct' });
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: [GUID, GUID] })).toEqual({ dishIds: 'at_least_two_distinct' });
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: Array.from({ length: 13 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) })).toEqual({ dishIds: 'too_many' });
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: 'x' })).toEqual({ dishIds: 'invalid' });
    expect(fieldsOf(tableRecommendationSchema, { dishIds: [GUID, GUID2] })).toEqual({ restaurantSlug: 'required' });
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: [GUID, GUID2], preferences: { serving: 'sip' } })).toEqual({ 'preferences.serving': 'invalid' });
    expect(fieldsOf(tableRecommendationSchema, { restaurantSlug: 'halka', dishIds: [GUID, GUID2], preferences: { vip: true } })).toEqual({ vip: 'unknown_field' });
  });
});

describe('import row corrections', () => {
  it('accept the import columns only, with a bounded size', () => {
    expect(parseWith(rowEditsSchema, { rows: [{ rowNumber: 2, fields: { price: '64', name: 'Pie' }, include: true }] }).rows).toHaveLength(1);
    expect(fieldsOf(rowEditsSchema, { rows: [{ rowNumber: 2, fields: { evil: 'x' } }] })).toEqual({ evil: 'unknown_field' });
    expect(fieldsOf(rowEditsSchema, { rows: [{ rowNumber: 0 }] })).toEqual({ 'rows.0.rowNumber': 'invalid' });
    expect(fieldsOf(rowEditsSchema, { rows: [{ rowNumber: 1, fields: { name: 'x'.repeat(3000) } }] })).toEqual({ 'rows.0.fields.name': 'too_long' });
    expect(fieldsOf(rowEditsSchema, { rows: [] })).toEqual({ rows: 'too_few' });
    expect(fieldsOf(rowEditsSchema, { rows: 'x' })).toEqual({ rows: 'invalid' });
    expect(fieldsOf(rowEditsSchema, {})).toEqual({ rows: 'required' });
  });

  it('a confirm may carry no corrections at all', () => {
    expect(parseWith(confirmImportSchema, {})).toEqual({});
    expect(fieldsOf(confirmImportSchema, { rows: [{ rowNumber: 1, nonsense: 1 }] })).toEqual({ nonsense: 'unknown_field' });
  });

  it('the import rules themselves drop unknown columns even if a caller lets them through', () => {
    const existing = { dishes: [], wines: [] };
    const rows = buildRows('menu', [{ category: 'Mains', name: 'Pie', description: '', price: '40' }], existing);
    const edited = revalidate('menu', rows, [{ rowNumber: 1, fields: { price: '45', evil: 'x', __proto__: 'y' } as Record<string, string> }], existing);
    expect(Object.keys(edited[0].fields).sort()).toEqual(['category', 'description', 'name', 'price']);
    expect(edited[0].fields.price).toBe('45');
  });
});

describe('codeActionSchema (spec 2026-10-16-recommendation-code, R7)', () => {
  it('accepts the form of "Ordered" / "Undo" and refuses anything else', () => {
    expect(parseWith(codeActionSchema, { slug: 'halka', code: 'w7k', intent: 'confirm', sid: GUID2, lang: 'pl' })).toEqual({ slug: 'halka', code: 'w7k', intent: 'confirm', sid: GUID2, lang: 'pl' });
    expect(parseWith(codeActionSchema, { slug: 'halka', code: 'W7K', intent: 'undo' }).intent).toBe('undo');
    expect(fieldsOf(codeActionSchema, { slug: 'halka', code: 'W7K', intent: 'delete' })).toEqual({ intent: 'invalid' });
    expect(fieldsOf(codeActionSchema, { slug: 'halka', code: 'x'.repeat(17), intent: 'confirm' })).toEqual({ code: 'too_long' });
    expect(fieldsOf(codeActionSchema, { slug: 'halka', code: '', intent: 'confirm' })).toEqual({ code: 'required' });
    // a slug that would leave the site in a redirect (`//evil.example`, `../`) is not a slug
    for (const slug of ['//evil.example', '../admin', 'Halka', 'a', 'halka?x=1']) expect(fieldsOf(codeActionSchema, { slug, code: 'W7K', intent: 'confirm' })).toHaveProperty('slug');
    expect(fieldsOf(codeActionSchema, { slug: 'halka', code: 'W7K', intent: 'confirm', confirmedAt: '2020-01-01' })).toEqual({ confirmedAt: 'unknown_field' });
  });
});
