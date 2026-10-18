/**
 * The recommendation code format (spec 2026-10-16-recommendation-code, R1, Q1). A short code the guest shows to the
 * waiter and the waiter may type into the till: letter–digit–letter (`W7K`, 20 × 8 × 20 = 3200 per restaurant and
 * service day), or letter–digit–letter–digit (`W7K3`, 25 600) when the short space is taken. The alphabet leaves out
 * characters that are easy to confuse (0/O/Q, 1/I, 2/Z, 5/S, 8/B), and the digit in the middle keeps a code from
 * spelling a word. The format is a durable contract with printed receipts and POS exports: do not change it.
 */
export const CODE_LETTERS = 'ACDEFGHJKLMNPRTUVWXY';
export const CODE_DIGITS = '23456789';

export type CodeLength = 3 | 4;

const L = `[${CODE_LETTERS}]`;
const D = `[${CODE_DIGITS}]`;
const CODE = new RegExp(`^${L}${D}${L}(?:${D})?$`);
/** a code token inside free text: not preceded or followed by a letter or a digit of any script (`\b` is ASCII only) */
const CODE_IN_TEXT = new RegExp(`(?<![\\p{L}\\p{N}])(${L}${D}${L}(?:${D})?)(?![\\p{L}\\p{N}])`, 'u');
/** the longest raw input worth parsing: a code with a prefix and separators */
const MAX_INPUT = 16;

/**
 * A code candidate from a UUID v4 (the `IdGenerator`, so tests are deterministic and core needs no random source).
 * Reads the hex digits outside the version and variant nibbles (positions 14 and 19 of the canonical form), two
 * at a time, one byte per character.
 */
export function codeFromUuid(uuid: string, length: CodeLength): string {
  const canonical = uuid.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(canonical)) throw new Error('codeFromUuid: not a UUID');
  const hex = [...canonical].filter((ch, i) => ch !== '-' && i !== 14 && i !== 19).join('');
  let code = '';
  for (let i = 0; i < length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    code += i % 2 === 0 ? CODE_LETTERS[byte % CODE_LETTERS.length] : CODE_DIGITS[byte % CODE_DIGITS.length];
  }
  return code;
}

/**
 * The code in its stored form, or null. Case-insensitive; spaces, `-` and `#` are ignored, and so is a leading
 * `kod` / `code` (with an optional colon). Anything that is not exactly a code in the format is rejected.
 */
export function normalizeCode(input: string): string | null {
  if (typeof input !== 'string' || input.length > MAX_INPUT) return null;
  const s = input.toUpperCase().replace(/[\s#-]/g, '').replace(/^(?:KOD|CODE):?/, '');
  return CODE.test(s) ? s : null;
}

/** The first code-shaped token in free text (a till comment), upper-cased, or null. */
export function findCodeInText(text: string): string | null {
  if (typeof text !== 'string') return null;
  return CODE_IN_TEXT.exec(text.toUpperCase())?.[1] ?? null;
}

/** Whether a cell holds nothing but a code (with an optional prefix): `W7K`, `kod: W7K` — not `Wino W7K butelka`. */
export function isWholeCellCode(text: string): boolean {
  return normalizeCode(text) !== null;
}
