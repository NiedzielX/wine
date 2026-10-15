import { draftWineProfile } from '../engine/drafts';
import { formatPrice, normKey, normaliseCategory, normaliseStyle, normaliseVintage, parsePrice } from './normalize';
import { MENU_FIELDS, TRANSLATION_FIELDS, WINE_FIELDS, type ImportIssue, type ImportIssueCode, type ImportKind, type ImportRow, type RowEdit } from './types';

/** What already exists in the restaurant: used to recognise updates. */
export interface ExistingItems {
  dishes: Array<{ id: string; name: string }>;
  wines: Array<{ id: string; producer: string; name: string; vintage: number | 'NV' }>;
}

interface Evaluated { fields: Record<string, string>; issues: ImportIssue[]; action: 'create' | 'update'; matchId: string | null }

type Code = ImportIssueCode;
const issue = (level: ImportIssue['level'], field: string, code: Code, message: string, params?: Record<string, string>): ImportIssue =>
  ({ level, field, code, message, ...(params ? { params } : {}) });
const err = (field: string, code: Code, message: string, params?: Record<string, string>) => issue('error', field, code, message, params);
const warn = (field: string, code: Code, message: string, params?: Record<string, string>) => issue('warning', field, code, message, params);

/** Checks one row and writes the normalised values back ("58,50 zł" → "58.5", "Przystawki" → "Starters"). */
function evaluate(kind: ImportKind, rowNumber: number, input: Record<string, string>, existing: ExistingItems, seen: Map<string, number>): Evaluated {
  // only the known columns survive: an unexpected key is dropped here even if a caller let it through
  const f: Record<string, string> = Object.fromEntries([
    ...(kind === 'menu' ? MENU_FIELDS : WINE_FIELDS).map((k) => [k, (Object.hasOwn(input, k) ? input[k] ?? '' : '').trim()]),
    // translation columns only when the file has them (spec 2026-10-15-bilingual-content, R5)
    ...TRANSLATION_FIELDS[kind].filter((k) => Object.hasOwn(input, k)).map((k) => [k, (input[k] ?? '').trim()])
  ]);
  const issues: ImportIssue[] = [];
  for (const k of TRANSLATION_FIELDS[kind]) {
    if (!Object.hasOwn(f, k)) continue;
    if (f[k] === '') issues.push(warn(k, 'translation_empty', 'Empty translation: the current one is kept.', { column: k }));
    else if (f[k].length > (k.startsWith('description') || k.startsWith('tasting_note') ? 1000 : 120)) issues.push(err(k, 'translation_too_long', 'The translation is too long.', { column: k }));
  }
  let key = '';
  let matchId: string | null = null;

  if (kind === 'menu') {
    if (!f.name) issues.push(err('name', 'name_missing', 'Name is missing.'));
    else if (f.name.length > 120) issues.push(err('name', 'name_too_long', 'Name is too long (120 characters at most).'));
    if (!f.price) issues.push(err('price', 'price_missing', 'Price is missing.'));
    else {
      const p = parsePrice(f.price);
      if (p === null) issues.push(err('price', 'price_invalid', `“${f.price}” is not a price.`, { value: f.price }));
      else if (p <= 0) issues.push(err('price', 'price_not_positive', 'Price must be more than zero.'));
      else if (p > 10000) issues.push(err('price', 'price_too_high', 'Price looks too high (10 000 at most).'));
      else f.price = formatPrice(p);
    }
    const c = normaliseCategory(f.category);
    if (c) f.category = c;
    else {
      issues.push(f.category ? warn('category', 'category_unknown', `Unknown category “${f.category}”: set to Mains.`, { value: f.category }) : warn('category', 'category_missing', 'No category: set to Mains.'));
      f.category = 'Mains';
    }
    if (f.description.length > 400) issues.push(warn('description', 'description_long', 'The description is very long.'));
    key = normKey(f.name);
    matchId = key ? existing.dishes.find((d) => normKey(d.name) === key)?.id ?? null : null;
  } else {
    if (!f.producer) issues.push(err('producer', 'producer_missing', 'Producer is missing.'));
    if (!f.name) {
      if (f.grape) { f.name = f.grape; issues.push(warn('name', 'wine_name_from_grape', 'No wine name: the grape is used as the name.')); }
      else issues.push(err('name', 'wine_name_missing', 'Wine name is missing.'));
    }
    if (f.producer.length > 120 || f.name.length > 160) issues.push(err('name', 'wine_name_too_long', 'Producer or wine name is too long.'));
    if (!f.vintage) { f.vintage = 'NV'; issues.push(warn('vintage', 'vintage_missing', 'No vintage: set to NV (non-vintage).')); }
    else {
      const v = normaliseVintage(f.vintage);
      if (v === null) issues.push(err('vintage', 'vintage_invalid', `“${f.vintage}” is not a year or NV.`, { value: f.vintage }));
      else f.vintage = v;
    }
    if (!f.grape) issues.push(warn('grape', 'grape_missing', 'No grape: the taste profile uses the style only.'));
    const s = normaliseStyle(f.style);
    if (s) f.style = s;
    else {
      const guess = draftWineProfile(f.grape, f.style).style;
      issues.push(f.style
        ? warn('style', 'style_unknown', `Unknown style “${f.style}”: assumed ${guess}.`, { value: f.style, guess })
        : f.grape ? warn('style', 'style_missing_from_grape', `No style: assumed ${guess} from the grape.`, { guess }) : warn('style', 'style_missing', `No style: assumed ${guess}.`, { guess }));
      f.style = guess;
    }
    let bottle: number | null = null;
    if (!f.bottlePrice) issues.push(err('bottlePrice', 'bottle_price_missing', 'Bottle price is missing.'));
    else {
      bottle = parsePrice(f.bottlePrice);
      if (bottle === null || bottle <= 0) { issues.push(err('bottlePrice', 'bottle_price_invalid', `“${f.bottlePrice}” is not a price.`, { value: f.bottlePrice })); bottle = null; }
      else f.bottlePrice = formatPrice(bottle);
    }
    if (f.glassPrice) {
      const g = parsePrice(f.glassPrice);
      if (g === null || g <= 0) issues.push(err('glassPrice', 'glass_price_invalid', `“${f.glassPrice}” is not a price.`, { value: f.glassPrice }));
      else if (bottle !== null && g >= bottle) issues.push(err('glassPrice', 'glass_price_not_lower', 'The glass price must be lower than the bottle price.'));
      else f.glassPrice = formatPrice(g);
    }
    key = f.producer && f.name && f.vintage ? `${normKey(f.producer)}|${normKey(f.name)}|${f.vintage}` : '';
    matchId = key ? existing.wines.find((w) => `${normKey(w.producer)}|${normKey(w.name)}|${w.vintage}` === key)?.id ?? null : null;
  }

  const action: 'create' | 'update' = matchId ? 'update' : 'create';
  if (matchId) {
    issues.push(warn('', 'exists', kind === 'menu' ? 'Already on the menu: importing will update its description, category and price.' : 'Already on the wine list: importing will update its prices.'));
  } else if (key) {
    const first = seen.get(key);
    if (first !== undefined) issues.push(warn('', 'duplicate_in_file', `Appears more than once in this file (first in row ${first}).`, { row: String(first) }));
    else seen.set(key, rowNumber);
  }
  return { fields: f, issues, action, matchId };
}

const hasError = (issues: ImportIssue[]) => issues.some((i) => i.level === 'error');
const isDuplicate = (issues: ImportIssue[]) => issues.some((i) => i.code === 'duplicate_in_file');

/** The first evaluation of a freshly read file: clean rows are ticked, errors / updates / repeats are not. */
export function buildRows(kind: ImportKind, records: Array<Record<string, string>>, existing: ExistingItems): ImportRow[] {
  const seen = new Map<string, number>();
  return records.map((rec, i) => {
    const rowNumber = i + 1;
    const e = evaluate(kind, rowNumber, rec, existing, seen);
    return { rowNumber, ...e, include: !hasError(e.issues) && e.action === 'create' && !isDuplicate(e.issues) };
  });
}

/**
 * Applies the user's corrections and checks every row again (a corrected row can fix or create a
 * duplicate elsewhere). A row with errors is never included; a row whose errors were just fixed is ticked.
 */
export function revalidate(kind: ImportKind, rows: ImportRow[], edits: RowEdit[], existing: ExistingItems): ImportRow[] {
  const byRow = new Map(edits.map((e) => [e.rowNumber, e]));
  const seen = new Map<string, number>();
  return rows.map((prev) => {
    const edit = byRow.get(prev.rowNumber);
    const input = { ...prev.fields, ...(edit?.fields ?? {}) };
    const e = evaluate(kind, prev.rowNumber, input, existing, seen);
    let include = prev.include;
    // A tick only counts as the user's choice when it CHANGED. A form always sends the state of every row,
    // so an unchanged, unticked row (an error the user just fixed) must not be read as "I want it left out".
    const chose = edit?.include !== undefined && edit.include !== prev.include;
    if (hasError(e.issues)) include = false;
    else if (chose) include = edit!.include!;
    else if (hasError(prev.issues)) include = e.action === 'create' && !isDuplicate(e.issues);
    else if (e.action !== prev.action && e.action === 'update') include = false;
    return { rowNumber: prev.rowNumber, ...e, include };
  });
}
