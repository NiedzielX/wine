import type { DishCategory, WineStyle } from '../domain/types';
import { SALES_ITEM_TYPES, type SalesItemType } from '../services/sales/types';

/** Lower case, no accents (Polish ł included), single spaces: the form used to compare texts. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * "46", "58,50 zł", "1 234,50", "1.234,50", "1,234.50", "PLN 120", "120,-" → a number, or null.
 * A separator followed by exactly three digits is a thousands separator, otherwise it is the decimal point.
 */
export function parsePrice(text: string): number | null {
  // currency words are cut with lookarounds, not \b: JavaScript's \b does not treat "ł" as a letter
  const raw = text.replace(/\u00a0/g, ' ').toLowerCase().replace(/(?<![a-z])(pln|zł|zl|eur|usd)(?![a-z])|[€$£]|,-|,–/g, '').replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(raw)) return null;
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  let normalised: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalised = raw.split(thousands).join('').replace(decimal, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (!sep) normalised = raw;
    else {
      const parts = raw.split(sep);
      const last = parts[parts.length - 1];
      if (parts.length > 2) {
        // 1.234.567: every group after the first has three digits, or it is not a price (1.2.3 is not 123)
        if (!parts.slice(1).every((g) => g.length === 3)) return null;
        normalised = parts.join('');
      } else {
        normalised = last.length === 3 && parts[0].length <= 3 && parts[0] !== '0'
          ? parts.join('')                             // 1,234: thousands
          : `${parts[0]}.${last}`;                     // 58,50 or 58.5: decimal
      }
    }
  }
  return Math.round(Number(normalised) * 100) / 100;
}

/** 46 → "46", 38.5 → "38.5": the form shown (and edited) in the preview. */
export const formatPrice = (n: number): string => String(Math.round(n * 100) / 100);

const CATEGORY: Array<[DishCategory, string[]]> = [
  ['Starters', ['starter', 'starters', 'przystawka', 'przystawki', 'zakaski', 'zakaska', 'appetizer', 'appetizers', 'appetiser', 'appetisers', 'small plates', 'to start', 'cold starters', 'hot starters', 'zimne przekaski', 'ciepłe przekaski']],
  ['Mains', ['main', 'mains', 'main course', 'main courses', 'dania glowne', 'danie glowne', 'glowne', 'entree', 'entrees', 'large plates', 'ryby', 'mieso', 'dania mieso', 'fish', 'meat']],
  ['Desserts', ['dessert', 'desserts', 'desery', 'deser', 'slodkie', 'sweets', 'sweet', 'sweet endings', 'cheese', 'sery']]
];

export function normaliseCategory(text: string): DishCategory | null {
  const k = normKey(text);
  if (!k) return null;
  return CATEGORY.find(([, words]) => words.some((w) => normKey(w) === k))?.[0] ?? null;
}

const STYLE: Array<[WineStyle, string[]]> = [
  ['sparkling', ['sparkling', 'musujace', 'musujacy', 'babelki', 'bubbles', 'champagne', 'prosecco', 'cava', 'cremant', 'spumante', 'sekt', 'brut', 'pet nat']],
  ['rose', ['rose', 'rosé', 'rozowe', 'rozowy', 'rosado']],
  ['orange', ['orange', 'pomaranczowe', 'pomaranczowy', 'amber', 'skin contact']],
  ['sweet', ['sweet', 'slodkie', 'slodki', 'deserowe', 'dessert', 'dessert wine', 'late harvest', 'fortified', 'port', 'wzmacniane']],
  ['red', ['red', 'czerwone', 'czerwony', 'rouge', 'tinto', 'rosso']],
  ['white', ['white', 'biale', 'bialy', 'blanc', 'blanco', 'bianco']]
];

export function normaliseStyle(text: string): WineStyle | null {
  const k = normKey(text);
  if (!k) return null;
  return STYLE.find(([, words]) => words.some((w) => normKey(w) === k))?.[0] ?? null;
}

/** "2021", "2021.0" → "2021"; "NV", "N.V.", "non-vintage", "bez rocznika" → "NV"; anything else → null. */
export function normaliseVintage(text: string): string | null {
  const t = text.trim();
  if (/^(n\.?\s?v\.?|non[- ]?vintage|bez rocznika|mv|multi[- ]?vintage)$/i.test(t)) return 'NV';
  const m = /^(\d{4})(?:\.0+)?$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1900 && y <= 2100 ? String(y) : null;
}

export const STYLE_COLOURS: Record<WineStyle, string> = {
  sparkling: '#E6DC9C', white: '#E3D78C', rose: '#E7B7A3', orange: '#D9A35B', red: '#7A1F36', sweet: '#C8923B'
};

/* ---------------- sales (spec 2026-10-15-pos-sales-import-attach-rate) ---------------- */

/**
 * What a date cell of a sales file is, before the order of day and month is known for the whole file (Q16):
 * - `date`: unambiguous (ISO `2026-10-14`, Polish `14.10.2026`, a whole Excel serial day number);
 * - `slashed`: `03/04/2026` or `03-04-2026`, read as day/month or month/day depending on the file;
 * - `timestamp`: a date with a time (`2026-10-14 23:45`, a serial with a fraction): refused, the business day column is
 *   needed, not a time stamp (Q17, nothing is cut off);
 * - `invalid`: anything else.
 */
export type DateCell =
  | { kind: 'date'; iso: string }
  | { kind: 'slashed'; first: number; second: number; year: number }
  | { kind: 'timestamp' }
  | { kind: 'invalid' };

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` when the parts make a real calendar day between 2000 and 2100, otherwise null. */
export function isoDay(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** Excel's serial day numbers (1900 system): serial 25569 is 1970-01-01. */
function fromSerial(serial: number): string | null {
  const d = new Date((serial - 25569) * 86_400_000);
  return isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const TIME = /\d{1,2}:\d{2}/;

export function readDateCell(text: string): DateCell {
  const t = text.trim();
  if (!t) return { kind: 'invalid' };
  // a number from a spreadsheet: a whole serial day number is a date, a fraction is a time of day
  const serial = /^(\d{5})(?:\.(\d+))?$/.exec(t);
  if (serial) {
    const day = Number(serial[1]);
    if (day < 20000 || day > 80000) return { kind: 'invalid' };
    if (serial[2] && /[1-9]/.test(serial[2])) return { kind: 'timestamp' };
    const iso = fromSerial(day);
    return iso ? { kind: 'date', iso } : { kind: 'invalid' };
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/.exec(t);
  if (iso) {
    if (TIME.test(iso[4])) return { kind: 'timestamp' };
    if (iso[4].trim()) return { kind: 'invalid' };
    const day = isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return day ? { kind: 'date', iso: day } : { kind: 'invalid' };
  }
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$/.exec(t);
  if (dotted) {
    if (TIME.test(dotted[4])) return { kind: 'timestamp' };
    if (dotted[4].trim()) return { kind: 'invalid' };
    const day = isoDay(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));
    return day ? { kind: 'date', iso: day } : { kind: 'invalid' };
  }
  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(.*)$/.exec(t);
  if (slashed) {
    if (TIME.test(slashed[4])) return { kind: 'timestamp' };
    if (slashed[4].trim()) return { kind: 'invalid' };
    return { kind: 'slashed', first: Number(slashed[1]), second: Number(slashed[2]), year: Number(slashed[3]) };
  }
  return TIME.test(t) ? { kind: 'timestamp' } : { kind: 'invalid' };
}

/**
 * The order of day and month for the whole file (Q16): a part above 12 decides; both orders in one file conflict;
 * only ambiguous dates (both parts ≤ 12) are read day/month, the Polish order. `ambiguous` says whether a date could
 * be read both ways (the preview then says how it was read).
 */
export function slashedDateOrder(cells: DateCell[]): { order: 'dmy' | 'mdy' | 'conflict'; ambiguous: boolean } {
  let dayFirst = false;
  let monthFirst = false;
  let ambiguous = false;
  for (const c of cells) {
    if (c.kind !== 'slashed') continue;
    if (c.first > 12 && c.second <= 12) dayFirst = true;
    else if (c.second > 12 && c.first <= 12) monthFirst = true;
    else if (c.first <= 12 && c.second <= 12 && c.first !== c.second) ambiguous = true;
  }
  return { order: dayFirst && monthFirst ? 'conflict' : monthFirst ? 'mdy' : 'dmy', ambiguous };
}

/** "2", "-1", "0,5", "1.5", "−1" → a number with at most three decimals, or null. */
export function parseQuantity(text: string): number | null {
  const t = text.replace(/−/g, '-').replace(/\s+/g, '');
  const m = /^([+-]?)(\d{1,7})(?:[.,](\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const n = Number(`${m[1]}${m[2]}.${m[3] ?? '0'}`);
  return n === 0 ? 0 : n;
}

/** An amount that may be negative (a return): "-12,50", "−12.50 zł", "(12,50)", "12,50-" → -12.5; otherwise as `parsePrice`. */
export function parseAmount(text: string): number | null {
  let t = text.replace(/−/g, '-').trim();
  let sign = 1;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) { t = paren[1].trim(); sign = -1; }
  if (t.startsWith('-')) { t = t.slice(1).trim(); sign = -sign; }
  else if (t.endsWith('-') && !t.endsWith(',-')) { t = t.slice(0, -1).trim(); sign = -sign; }
  const n = parsePrice(t);
  if (n === null) return null;
  return n === 0 ? 0 : sign * n;
}

/** Guests of a check: a whole number 0–999, or null. */
export function parseCovers(text: string): number | null {
  const m = /^(\d{1,3})(?:[.,]0+)?$/.exec(text.trim());
  return m ? Number(m[1]) : null;
}

const ITEM_TYPES: Array<[SalesItemType, string[]]> = [
  ['food', [
    'food', 'kitchen', 'dish', 'dishes', 'starters', 'starter', 'mains', 'main', 'main course', 'main courses', 'desserts', 'dessert', 'appetizers',
    'soups', 'salads', 'kuchnia', 'jedzenie', 'danie', 'dania', 'dania glowne', 'przystawki', 'przystawka', 'zupy', 'zupa', 'desery', 'deser', 'salatki', 'salaty'
  ]],
  ['wine_glass', [
    'wine glass', 'wine by the glass', 'by the glass', 'glass', 'glass wine', 'wine glasses', 'kieliszek', 'kieliszki', 'wino kieliszek',
    'wino na kieliszki', 'wino na kieliszek', 'wina na kieliszki', 'wino lampka', 'lampka wina'
  ]],
  ['wine_bottle', ['wine bottle', 'bottle', 'bottles', 'bottle wine', 'wine bottles', 'butelka', 'butelki', 'wino butelka', 'wino butelki', 'wina butelkowe', 'wino w butelce']],
  ['other', [
    'other', 'others', 'drinks', 'beverages', 'bar', 'beer', 'coffee', 'tea', 'water', 'spirits', 'cocktails', 'soft drinks', 'softs', 'juice',
    'inne', 'napoje', 'napoj', 'napoje zimne', 'napoje gorace', 'piwo', 'kawa', 'herbata', 'woda', 'soki', 'alkohole', 'wodka', 'koktajle'
  ]]
];
/** a bare "wine": a bottle, with a warning (the attach rate is right; the average bottle may be too low) */
const GENERIC_WINE = new Set(['wine', 'wines', 'wino', 'wina']);
const ITEM_TYPE_BY_WORD = new Map(ITEM_TYPES.flatMap(([type, words]) => words.map((w) => [w, type] as const)));

/**
 * The type of a POS category (Q3): a known word or a canonical value (`wine_glass`) → the type; a bare "wine" → bottle,
 * `generic`; anything else → null, an unrecognised category the user maps once for all its lines.
 */
export function normaliseItemType(text: string): { type: SalesItemType; generic: boolean } | null {
  const k = normKey(text);
  if (!k) return null;
  const canonical = SALES_ITEM_TYPES.find((t) => normKey(t) === k);
  if (canonical) return { type: canonical, generic: false };
  if (GENERIC_WINE.has(k)) return { type: 'wine_bottle', generic: true };
  const type = ITEM_TYPE_BY_WORD.get(k);
  return type ? { type, generic: false } : null;
}
