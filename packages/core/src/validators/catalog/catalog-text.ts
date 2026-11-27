import { z } from 'zod';

/**
 * Text fields of the catalog forms (spec 2026-11-16-catalog-field-editing, R1, W2, W4): NFC, trimmed, a run of white
 * space becomes one space (a note or description keeps its line breaks), control, invisible and direction-changing
 * characters are refused (`invalid_chars`), the length counts code points. The value that comes out is the one that
 * is compared and stored, so " Halibut " and "Halibut" are the same text.
 */

/**
 * Code point ranges refused in every text field (numbers, not escapes, so no invisible character sits in this source):
 * C0 controls without tab, line feed and carriage return (those are white space, handled first), DEL and the C1 controls
 * (U+0085 included), soft hyphen, combining grapheme joiner, Arabic letter mark, Mongolian vowel separator, zero-width and
 * direction marks (U+200B to U+200F), embeddings (U+202A to U+202E), line and paragraph separators (U+2028, U+2029),
 * word joiner, invisible operators and isolates (U+2060 to U+206F), the byte order mark and interlinear annotation.
 */
const FORBIDDEN: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]
];

const hasForbidden = (s: string): boolean => {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (FORBIDDEN.some(([from, to]) => c >= from && c <= to)) return true;
  }
  return false;
};

export interface TextRules { max: number; required: boolean; multiline?: boolean }

/** The cleaned text, or the code of what is wrong with it (`invalid_chars`). Never throws. */
export function cleanCatalogText(input: string, multiline = false): { text: string } | { error: 'invalid_chars' } {
  const nfc = input.normalize('NFC').replace(/\r\n?/g, '\n');
  if (hasForbidden(nfc)) return { error: 'invalid_chars' };
  if (!multiline) return { text: nfc.replace(/\s+/gu, ' ').trim() };
  const lines = nfc.split('\n').map((l) => l.replace(/[^\S\n]+/gu, ' ').trim());
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/** A text field of a schema: `required` = at least one character after cleaning, `max` in code points. */
export const catalogText = ({ max, required, multiline = false }: TextRules) =>
  z.string().transform((raw, ctx) => {
    const cleaned = cleanCatalogText(raw, multiline);
    if ('error' in cleaned) {
      ctx.issues.push({ code: 'custom', message: cleaned.error, input: raw });
      return z.NEVER;
    }
    const length = [...cleaned.text].length;
    if (required && length === 0) {
      ctx.issues.push({ code: 'custom', message: 'required', input: raw });
      return z.NEVER;
    }
    if (length > max) {
      ctx.issues.push({ code: 'custom', message: 'too_long', input: raw });
      return z.NEVER;
    }
    return cleaned.text;
  });

/**
 * A price in zloty as a number: more than zero, at most `max`, at most two decimal places (checked on whole grosze, so
 * 19.99 passes and 12.345 does not). Anything that is not a finite number (a string, `1e999` read as Infinity, NaN) is `invalid`.
 */
export const catalogPrice = (max: number) =>
  z.number().transform((n, ctx) => {
    if (n <= 0) { ctx.issues.push({ code: 'custom', message: 'not_positive', input: n }); return z.NEVER; }
    if (n > max) { ctx.issues.push({ code: 'custom', message: 'out_of_range', input: n }); return z.NEVER; }
    const grosze = Math.round(n * 100);
    if (Math.abs(n * 100 - grosze) > 1e-6) { ctx.issues.push({ code: 'custom', message: 'too_many_decimals', input: n }); return z.NEVER; }
    return grosze / 100;
  });
