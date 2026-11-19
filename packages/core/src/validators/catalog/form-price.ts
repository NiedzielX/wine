/**
 * A price typed into a form (spec 2026-11-16-catalog-field-editing, R11, B3). Stricter than the import's `parsePrice`,
 * which reads "58,500" and "1.234" as thousands: here digits, spaces as thousands separators (a no-break space counts
 * as a space), and at most one separator, `,` or `.`, followed by one or two digits. A currency word after the number
 * ("zł", "PLN") is allowed. Anything else is `null` (shown as `not_a_number`). An empty text is `null` too.
 */
export function parseFormPrice(text: string): number | null {
  const t = text.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/ ?(zł|zl|pln)$/iu, '');
  const m = /^(\d{1,3}(?: \d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const whole = m[1].replace(/ /g, '');
  const cents = m[2] === undefined ? '00' : m[2].padEnd(2, '0');
  const value = Number(`${whole}.${cents}`);
  return Number.isFinite(value) ? value : null;
}
