import type { Dish, EntityStatus, Wine } from '../../domain/types';
import { ValidationError, VersionConflictError } from '../../errors';
import { DISH_TEXT_FIELDS, WINE_TEXT_FIELDS } from '../../i18n/content';
import { LOCALES, type Locale } from '../../i18n/locale';
import { draftDishProfile, draftWineProfile } from '../../engine/drafts';
import { STYLE_COLOURS, normKey } from '../../import/normalize';
import type { DishFields, WineFields } from '../../ports/repositories';
import type { DishCreateInput } from '../../validators/catalog/dish-create.schema';
import type { DishDetailsInput } from '../../validators/catalog/dish-fields.schema';
import type { WineCreateInput } from '../../validators/catalog/wine-create.schema';
import type { WineDetailsInput } from '../../validators/catalog/wine-fields.schema';

/**
 * Pure rules of the catalog edit commands (spec 2026-11-16-catalog-field-editing, R1 to R4, R15). A dish or wine has no
 * version column, so the caller's `expectedVersion` is a fingerprint of the editable fields only (a parallel change of a
 * profile, a translation or the availability is no conflict). No dates here: the clock comes in through the context.
 */

export const DISH_FIELD_KEYS = ['name', 'description', 'category', 'price'] as const satisfies ReadonlyArray<keyof DishFields>;
export const WINE_FIELD_KEYS = ['producer', 'name', 'vintage', 'region', 'country', 'tastingNote', 'listNumber', 'bottlePrice', 'glassPrice'] as const satisfies ReadonlyArray<keyof WineFields>;

export const dishFieldsOf = (d: Pick<Dish, 'name' | 'description' | 'category' | 'price'>): DishFields =>
  ({ name: d.name, description: d.description, category: d.category, price: d.price });

export const wineFieldsOf = (w: Pick<Wine, 'producer' | 'name' | 'vintage' | 'region' | 'country' | 'tastingNote' | 'listNumber' | 'bottlePrice' | 'glassPrice'>): WineFields => ({
  producer: w.producer, name: w.name, vintage: w.vintage, region: w.region, country: w.country, tastingNote: w.tastingNote,
  listNumber: w.listNumber ?? null, bottlePrice: w.bottlePrice, glassPrice: w.glassPrice
});

function fingerprint(values: unknown): string {
  const s = JSON.stringify(values);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${h.toString(16).padStart(8, '0')}-${s.length}`;
}

const grosze = (n: number | null) => (n === null ? null : Math.round(n * 100));
const lf = (s: string) => s.replace(/\r\n?/g, '\n');

/** A short fingerprint of the editable fields of a dish: what a form sends back as `version` (an opaque text, R4, N7). */
export const dishFieldsVersion = (d: DishFields): string => fingerprint([lf(d.name), lf(d.description), d.category, grosze(d.price)]);

export const wineFieldsVersion = (w: WineFields): string =>
  fingerprint([lf(w.producer), lf(w.name), w.vintage, lf(w.region), lf(w.country), lf(w.tastingNote), w.listNumber, grosze(w.bottlePrice), grosze(w.glassPrice)]);

/**
 * The fingerprint a visibility change is checked against (R4, R7): the editable fields and the status, so a change of either
 * since the page was read is a conflict. The details form keeps its own fingerprint (`dishFieldsVersion`): hiding a dish
 * does not make a form that edits its price stale.
 */
export const dishVisibilityVersion = (d: Pick<Dish, 'name' | 'description' | 'category' | 'price' | 'status'>): string =>
  fingerprint([dishFieldsVersion(dishFieldsOf(d)), d.status]);

/** Throws VersionConflictError when someone changed the fields after the caller read them. */
export function checkFieldsVersion(currentVersion: string, expectedVersion: string | undefined): void {
  if (expectedVersion !== undefined && expectedVersion !== '' && expectedVersion !== currentVersion) throw new VersionConflictError();
}

/**
 * The key two names are compared by: the import's `normKey` (so "Tatar" and "Tatar!" are one name); a name without any
 * Latin letter or digit (Cyrillic, say) falls back to NFC, lower case, single spaces, so two different names stay
 * different and two equal ones still collide (R1).
 */
export function nameKey(s: string): string {
  const k = normKey(s);
  return k !== '' ? k : `~${s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

export const wineKey = (w: Pick<WineFields, 'producer' | 'name' | 'vintage'>): string => `${nameKey(w.producer)}|${nameKey(w.name)}|${w.vintage}`;

export interface DishOther { id: string; name: string }
export interface WineOther { id: string; producer: string; name: string; vintage: number | 'NV'; listNumber?: number | null }

/** The uniqueness problems of the change, only for what changes: a stored duplicate does not block editing another field (R1, R2). */
export function dishUniquenessErrors(current: DishFields, next: DishFields, selfId: string, others: readonly DishOther[]): Record<string, string> {
  if (next.name === current.name) return {};
  const key = nameKey(next.name);
  return others.some((o) => o.id !== selfId && nameKey(o.name) === key) ? { name: 'duplicate' } : {};
}

export function wineUniquenessErrors(current: WineFields, next: WineFields, selfId: string, others: readonly WineOther[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (wineKey(next) !== wineKey(current)) {
    const key = wineKey(next);
    if (others.some((o) => o.id !== selfId && wineKey(o) === key)) errors.name = 'duplicate';
  }
  if (next.listNumber !== null && next.listNumber !== current.listNumber && others.some((o) => o.id !== selfId && (o.listNumber ?? null) === next.listNumber)) errors.listNumber = 'duplicate';
  return errors;
}

const fail = (fields: Record<string, string>): never => { throw new ValidationError('validation_failed', 'Check the fields.', fields); };

export const assertDishUnique = (current: DishFields, next: DishFields, selfId: string, others: readonly DishOther[]): void => {
  const e = dishUniquenessErrors(current, next, selfId, others);
  if (Object.keys(e).length) fail(e);
};

export const assertWineUnique = (current: WineFields, next: WineFields, selfId: string, others: readonly WineOther[]): void => {
  const e = wineUniquenessErrors(current, next, selfId, others);
  if (Object.keys(e).length) fail(e);
};

/**
 * Drops from a raw input the fields whose value is exactly what is stored: a form sends the whole state, and a stored
 * value that breaks a new rule (a 1500-character description from an import) must not block editing another field (R1).
 * `keep` names fields that are always checked against the merged state (the glass pair).
 */
export function pruneUnchanged(raw: Record<string, unknown>, current: object, keep: readonly string[] = []): Record<string, unknown> {
  const same = (a: unknown, b: unknown) => (typeof a === 'string' && typeof b === 'string' ? lf(a) === lf(b) : Object.is(a, b));
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => keep.includes(k) || !(Object.hasOwn(current, k) && same(v, (current as Record<string, unknown>)[k]))));
}

export interface EditPlan<F> {
  next: F;
  /** false = after normalisation nothing differs: no write, no audit row */
  changed: boolean;
  /** the names of the fields that differ */
  keys: Array<keyof F & string>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** the name (dish) or producer, name or vintage (wine) changed (R15) */
  identity: boolean;
}

function diff<F extends object>(current: F, next: F, order: ReadonlyArray<keyof F & string>): Pick<EditPlan<F>, 'keys' | 'before' | 'after'> {
  const keys = order.filter((k) => !Object.is(current[k], next[k]));
  return {
    keys,
    before: Object.fromEntries(keys.map((k) => [k, current[k]])),
    after: Object.fromEntries(keys.map((k) => [k, next[k]]))
  };
}

export function planDishEdit(current: DishFields, input: DishDetailsInput, ctx: { selfId: string; others: readonly DishOther[] }): EditPlan<DishFields> {
  const next: DishFields = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const d = diff(current, next, DISH_FIELD_KEYS);
  if (d.keys.length === 0) return { next: current, changed: false, ...d, identity: false };
  assertDishUnique(current, next, ctx.selfId, ctx.others);
  return { next, changed: true, ...d, identity: d.keys.includes('name') };
}

/**
 * The rules need the whole state after the merge (R2): a missing `pouredByGlass` means "as stored" (a glass price is
 * set), a glass price needs the glass switch, the glass costs less than the bottle, the vintage is at most next year.
 * All problems come back together.
 */
export function planWineEdit(current: WineFields, input: WineDetailsInput, ctx: { selfId: string; others: readonly WineOther[]; maxVintage: number }): EditPlan<WineFields> {
  const errors: Record<string, string> = {};
  const { pouredByGlass, glassPrice: sentGlass, ...rest } = input;
  const base: WineFields = { ...current, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) };

  if (typeof base.vintage === 'number' && base.vintage > ctx.maxVintage && base.vintage !== current.vintage) errors.vintage = 'out_of_range';

  const glassOn = pouredByGlass ?? current.glassPrice !== null;
  let glass: number | null = null;
  if (glassOn) {
    glass = sentGlass ?? current.glassPrice;
    if (glass === null) errors.glassPrice = 'required';
    else if (glass >= base.bottlePrice) errors[sentGlass !== undefined ? 'glassPrice' : 'bottlePrice'] = 'glass_not_below_bottle';
  } else if (sentGlass !== undefined) {
    errors.glassPrice = 'not_allowed';
  }
  const next: WineFields = { ...base, glassPrice: glassOn ? glass : null };
  const d = diff(current, next, WINE_FIELD_KEYS);
  if (d.keys.length > 0 && Object.keys(errors).length === 0) Object.assign(errors, wineUniquenessErrors(current, next, ctx.selfId, ctx.others));
  if (Object.keys(errors).length) fail(errors);
  if (d.keys.length === 0) return { next: current, changed: false, ...d, identity: false };
  return { next, changed: true, ...d, identity: d.keys.some((k) => k === 'producer' || k === 'name' || k === 'vintage') };
}

/**
 * The languages whose published translation belongs to a field this edit changed (R11, N2): guests keep reading the
 * translation of the last publish, so it may no longer fit. `translations` is what the published version holds for the
 * dish or wine.
 */
export function staleTranslationLocales(kind: 'dish' | 'wine', changedKeys: readonly string[], translations: unknown): Locale[] {
  const fields: readonly string[] = kind === 'dish' ? DISH_TEXT_FIELDS : WINE_TEXT_FIELDS;
  const touched = changedKeys.filter((k) => fields.includes(k));
  if (touched.length === 0 || !translations || typeof translations !== 'object') return [];
  const t = translations as Record<string, unknown>;
  return LOCALES.filter((l) => {
    const one = Object.hasOwn(t, l) ? t[l] : undefined;
    if (!one || typeof one !== 'object') return false;
    const o = one as Record<string, unknown>;
    return touched.some((k) => Object.hasOwn(o, k) && typeof o[k] === 'string' && (o[k] as string).trim() !== '');
  });
}

export type DishVisibility = Extract<EntityStatus, 'published' | 'hidden'>;

/**
 * R7: `published → hidden` and `hidden → published` only. A `draft` dish is released by a publish (it has no switch), and a
 * dish already in the wanted state is no transition: `ValidationError` `fields: { status: 'transition' }`.
 */
export function planDishVisibility(status: EntityStatus, hidden: boolean): { from: DishVisibility; to: DishVisibility } {
  const to: DishVisibility = hidden ? 'hidden' : 'published';
  const from: DishVisibility = hidden ? 'published' : 'hidden';
  if (status !== from) throw new ValidationError('validation_failed', 'This dish cannot change its visibility now.', { status: 'transition' });
  return { from, to };
}

/** The number a wine gets when none is given: the next after the highest, from 101 (the import numbers wines the same way, N10). */
export const nextListNumber = (others: ReadonlyArray<{ listNumber?: number | null }>): number => Math.max(100, ...others.map((o) => o.listNumber ?? 0)) + 1;

/** R8: the fields of a new dish; a name that exists (any status) is `duplicate`. */
export function planNewDish(input: DishCreateInput, ctx: { others: readonly DishOther[] }): DishFields {
  const fields: DishFields = { name: input.name, description: input.description ?? '', category: input.category, price: input.price };
  assertDishUnique({ ...fields, name: '' }, fields, '', ctx.others);
  return fields;
}

/** A new dish is a draft with the engine's draft profile, like one from the import. */
export const buildNewDish = (id: string, f: DishFields): Dish => ({
  id, name: f.name, description: f.description, category: f.category, price: f.price, status: 'draft',
  profile: draftDishProfile(f.name, f.description, f.category), translations: {}
});

export interface NewWinePlan {
  fields: WineFields;
  style: string;
  grape: string;
  /** no list number was given: the repository takes the next free one under the lock (it may differ from `fields.listNumber`) */
  autoListNumber: boolean;
}

/** R8, R2: the glass price needs the switch and costs less than the bottle, the vintage is at most next year, the key and an explicit list number are free; all problems come back together. */
export function planNewWine(input: WineCreateInput, ctx: { others: readonly WineOther[]; maxVintage: number }): NewWinePlan {
  const errors: Record<string, string> = {};
  if (typeof input.vintage === 'number' && input.vintage > ctx.maxVintage) errors.vintage = 'out_of_range';
  const glassOn = input.pouredByGlass === true;
  if (glassOn) {
    if (input.glassPrice === undefined) errors.glassPrice = 'required';
    else if (input.glassPrice >= input.bottlePrice) errors.glassPrice = 'glass_not_below_bottle';
  } else if (input.glassPrice !== undefined) {
    errors.glassPrice = 'not_allowed';
  }
  const autoListNumber = input.listNumber === undefined || input.listNumber === null;
  const fields: WineFields = {
    producer: input.producer, name: input.name, vintage: input.vintage, region: input.region ?? '', country: input.country ?? '', tastingNote: input.tastingNote ?? '',
    listNumber: autoListNumber ? nextListNumber(ctx.others) : (input.listNumber as number), bottlePrice: input.bottlePrice, glassPrice: glassOn ? (input.glassPrice ?? null) : null
  };
  if (Object.keys(errors).length === 0) Object.assign(errors, wineUniquenessErrors({ ...fields, producer: '', name: '', vintage: 'NV', listNumber: null }, fields, '', ctx.others));
  if (Object.keys(errors).length) fail(errors);
  return { fields, style: input.style, grape: input.grape ?? '', autoListNumber };
}

export function buildNewWine(id: string, p: NewWinePlan): Wine {
  const profile = draftWineProfile(p.grape, p.style);
  const f = p.fields;
  return {
    id, producer: f.producer, name: f.name, vintage: f.vintage, region: f.region, country: f.country,
    grapes: p.grape ? p.grape.split(/[,/]/).map((g) => g.trim()).filter(Boolean) : [], glassPrice: f.glassPrice, glassPour: profile.style === 'sweet' ? 75 : 150,
    bottlePrice: f.bottlePrice, bottleSize: 750, active: true, ...(f.listNumber !== null ? { listNumber: f.listNumber } : {}), colour: STYLE_COLOURS[profile.style],
    tastingNote: f.tastingNote, profile, translations: {}
  };
}
