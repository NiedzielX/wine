import { MENU_FIELDS, TRANSLATION_FIELDS, WINE_FIELDS, type ImportKind } from './types';
import { normKey } from './normalize';

/**
 * Turns the rows of a file into records of named fields. The header row is recognised by its words
 * (English and Polish); without one the columns are read in a default order and the user is told.
 */
const SYNONYMS: Record<ImportKind, Record<string, string[]>> = {
  menu: {
    name: ['name', 'dish', 'dish name', 'danie', 'nazwa', 'nazwa dania', 'pozycja', 'item', 'menu item'],
    description: ['description', 'opis', 'skladniki', 'ingredients', 'details', 'desc'],
    category: ['category', 'kategoria', 'section', 'sekcja', 'dzial', 'course', 'typ dania'],
    price: ['price', 'cena', 'pln', 'zl', 'cost', 'koszt', 'cena pln', 'price pln']
  },
  wines: {
    producer: ['producer', 'producent', 'winery', 'winnica', 'domaine', 'estate', 'maker'],
    name: ['wine', 'wine name', 'name', 'wino', 'nazwa', 'cuvee', 'nazwa wina', 'label'],
    vintage: ['vintage', 'rocznik', 'year', 'rok', 'rok zbioru'],
    region: ['region', 'appellation', 'apelacja', 'origin', 'pochodzenie'],
    country: ['country', 'kraj'],
    grape: ['grape', 'grapes', 'szczep', 'szczepy', 'variety', 'odmiana', 'varietal'],
    style: ['style', 'colour', 'color', 'kolor', 'typ', 'type', 'rodzaj'],
    glassPrice: ['glass', 'glass price', 'by the glass', 'kieliszek', 'cena kieliszek', 'cena za kieliszek', 'price glass', 'price per glass'],
    bottlePrice: ['bottle', 'bottle price', 'butelka', 'cena butelka', 'cena za butelke', 'price', 'cena', 'price bottle', 'price per bottle']
  }
};

/**
 * Headers of the translation columns: the field's words followed by a language word, so `name_pl`, „Nazwa (PL)”,
 * „opis EN”, „Tasting note – English” or „Region po polsku” are recognised (spec 2026-10-15-bilingual-content, R5).
 */
const LANGUAGE_WORDS = { pl: ['pl', 'polski', 'polish', 'po polsku', 'polska'], en: ['en', 'eng', 'english', 'angielski', 'po angielsku', 'angielska'] } as const;
const TRANSLATED_WORDS: Record<ImportKind, Record<string, string[]>> = {
  menu: {
    name: ['name', 'dish', 'dish name', 'danie', 'nazwa', 'nazwa dania'],
    description: ['description', 'opis', 'opis dania', 'skladniki', 'ingredients', 'desc']
  },
  wines: {
    tasting_note: ['tasting note', 'tasting notes', 'note', 'notes', 'notatka', 'notatka degustacyjna', 'opis', 'opis wina', 'description'],
    region: ['region', 'apelacja', 'appellation'],
    country: ['country', 'kraj']
  }
};
for (const kind of ['menu', 'wines'] as const) {
  for (const [base, words] of Object.entries(TRANSLATED_WORDS[kind])) {
    for (const lang of ['pl', 'en'] as const) SYNONYMS[kind][`${base}_${lang}`] = words.flatMap((w) => LANGUAGE_WORDS[lang].map((l) => `${w} ${l}`));
  }
}

/** Column order used when a file has no recognisable header. */
const DEFAULT_ORDER: Record<ImportKind, string[][]> = {
  menu: [['name', 'price'], ['name', 'description', 'price'], ['category', 'name', 'description', 'price']],
  wines: [['producer', 'name', 'vintage', 'region', 'grape', 'style', 'glassPrice', 'bottlePrice']]
};

function matchField(kind: ImportKind, cell: string): string | null {
  const k = normKey(cell);
  if (!k) return null;
  for (const [field, words] of Object.entries(SYNONYMS[kind])) {
    if (words.some((w) => normKey(w) === k)) return field;
  }
  // "Price (PLN)", "Cena za butelkę": the header word followed by more words; the longest such word wins, so
  // "Opis EN (krótki)" is the English description, not the description
  let best: { field: string; length: number } | null = null;
  for (const [field, words] of Object.entries(SYNONYMS[kind])) {
    for (const w of words) {
      const n = normKey(w);
      if (k.startsWith(`${n} `) && (!best || n.length > best.length)) best = { field, length: n.length };
    }
  }
  return best?.field ?? null;
}

export interface MappedTable {
  records: Array<Record<string, string>>;
  notes: string[];
}

export function mapTable(kind: ImportKind, rows: string[][]): MappedTable {
  const key = kind === 'menu' ? 'name' : 'producer';
  let best: { index: number; map: Record<string, number> } | null = null;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const map: Record<string, number> = {};
    rows[i].forEach((cell, c) => {
      const f = matchField(kind, cell);
      if (f && !(f in map)) map[f] = c;
    });
    // a plain "price" next to a glass price is the bottle price
    const n = Object.keys(map).length;
    if (n >= 2 && (key in map || 'name' in map) && (!best || n > Object.keys(best.map).length)) best = { index: i, map };
  }
  const notes: string[] = [];
  let map: Record<string, number>;
  let start: number;
  if (best) {
    map = best.map;
    start = best.index + 1;
    const known = Object.keys(map);
    const ignored = rows[best.index].filter((c, i) => c && !Object.values(map).includes(i));
    if (ignored.length) notes.push(`Columns not used: ${ignored.join(', ')}.`);
    if (kind === 'menu' && !('category' in map)) notes.push('No category column: dishes without a category are set to Mains. Check them in the preview.');
    void known;
  } else {
    const width = Math.max(...rows.slice(0, 5).map((r) => r.length));
    const order = [...DEFAULT_ORDER[kind]].reverse().find((o) => o.length <= width) ?? DEFAULT_ORDER[kind][0];
    map = Object.fromEntries(order.map((f, i) => [f, i]));
    start = 0;
    notes.push(`No header row was found, so the columns were read in this order: ${order.join(', ')}.`);
  }
  const fields = kind === 'menu' ? MENU_FIELDS : WINE_FIELDS;
  // a translation column is in a record only when the file has it: absent = keep, present and empty = warn
  const translated = TRANSLATION_FIELDS[kind].filter((f) => f in map);
  const records = rows.slice(start).filter((r) => r.some((c) => c.trim() !== '')).map((r) =>
    Object.fromEntries([...fields, ...translated].map((f) => [f, f in map ? (r[map[f]] ?? '').trim() : ''])));
  return { records, notes };
}

/* ---------------- PDF: lines → rows ---------------- */

const PRICE_END = /^(.*?)[\s.…·_\-–—]*?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln|PLN)?\s*$/;
const HEADING = /^(?:[-–—•*\s]*)([^\d]{2,30}?)(?:[-–—:•*\s]*)$/;
const PAGE_NUMBER = /^(?:page|strona|str\.)?\s*\d{1,3}(?:\s*\/\s*\d{1,3})?$/i;

/**
 * A PDF has no tables, only text lines. Best effort: a line that ends in a price is a dish (or a wine);
 * a known section word sets the category (or style); a line without a price continues the previous dish.
 * The result is ALWAYS shown to the user for checking.
 */
export function linesToRows(kind: ImportKind, lines: string[]): { rows: string[][]; notes: string[] } {
  const notes = ['This PDF was read as text. A PDF has no real columns, so check every row before importing.'];
  return kind === 'menu' ? { rows: menuLines(lines), notes } : { rows: wineLines(lines), notes };
}

function menuLines(lines: string[]): string[][] {
  const out: string[][] = [['category', 'name', 'description', 'price']];
  let category = '';
  let last: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_NUMBER.test(line)) continue;
    const priced = PRICE_END.exec(line);
    if (priced && priced[1].replace(/[\s.…·_\-–—]/g, '').length >= 3) {
      last = [category, priced[1].replace(/[\s.…·_\-–—]+$/, '').trim(), '', priced[2]];
      out.push(last);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading && sectionWord(heading[1])) { category = heading[1].trim(); last = null; continue; }
    if (last) last[2] = `${last[2]} ${line}`.trim();           // a continuation line: the description
    else if (!last && out.length > 1) continue;
    else {
      // before the first dish: a title or an unlabelled dish without a price; keep dishes without price visible
      if (/\s/.test(line) && line.length < 80 && !heading) out.push([category, line, '', '']);
    }
  }
  return out;
}

function sectionWord(text: string): boolean {
  return ['starters', 'mains', 'desserts', 'przystawki', 'dania glowne', 'desery', 'appetizers', 'sweets', 'main course', 'zakaski', 'cold starters', 'hot starters'].includes(normKey(text));
}

const STYLE_HEADINGS = new Set(['white', 'red', 'rose', 'orange', 'sparkling', 'sweet', 'dessert wines', 'bialy', 'biale', 'czerwone', 'rozowe', 'musujace', 'slodkie', 'bubbles', 'champagne']);

function wineLines(lines: string[]): string[][] {
  // the header uses the words mapTable recognises ("glass price", not the field name glassPrice)
  const out: string[][] = [['producer', 'wine', 'vintage', 'region', 'grape', 'style', 'glass price', 'bottle price']];
  let style = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || PAGE_NUMBER.test(line)) continue;
    // "… 52 / 240" (glass / bottle) or a single bottle price at the end
    const both = /^(.*?)\s+(\d{2,4}(?:[.,]\d{1,2})?)\s*[/|]\s*(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i.exec(line);
    const one = !both ? /^(.*?)\s+(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i.exec(line) : null;
    const m = both ?? one;
    if (!m) {
      if (STYLE_HEADINGS.has(normKey(line))) style = line;
      continue;
    }
    const glass = both ? both[2] : '';
    const bottle = both ? both[3] : one![2];
    let body = m[1].trim();
    let vintage = '';
    let region = '';
    const y = /\b((?:19|20)\d{2}|NV|N\.V\.)\b/.exec(body);
    if (y) {
      vintage = y[1];
      region = body.slice(y.index + y[0].length).trim();
      body = body.slice(0, y.index).trim();
    }
    const split = /\s[-–—]\s|,\s/.exec(body);
    const producer = split ? body.slice(0, split.index).trim() : '';
    const name = split ? body.slice(split.index + split[0].length).trim() : body;
    out.push([producer, name, vintage, region, '', style, glass, bottle]);
  }
  return out;
}
