import type { DishCategory, WineStyle } from '../domain/types';

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
