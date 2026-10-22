import { SALES_NOTES } from './mapping';
import { normalizeCode } from '../recommendation-code/code-format';
import { normKey, normaliseItemType, parseAmount, parseCovers, parseQuantity, readDateCell, isoDay, slashedDateOrder, type DateCell } from './normalize';
import { SALES_FIELDS, type ImportIssue, type ImportIssueCode, type ImportRow, type RowEdit, type ValueMapEntry } from './types';
import type { CheckKey, SalesItemType, SalesRecord } from '../services/sales/types';

/**
 * Checks of a sales import (spec 2026-10-15-pos-sales-import-attach-rate, R3–R6, Edge cases). One row is one line of a
 * check. Lines are always `create` (no matching with dishes or wines, Q10). Rules over the whole file — the order of
 * day and month (Q16) and "the whole check or nothing" (R6) — are worked out again on every check, from the rows as they
 * are: a derived warning never changes another row's tick (G8).
 */

type Code = ImportIssueCode;
const issue = (level: ImportIssue['level'], field: string, code: Code, message: string, params?: Record<string, string>): ImportIssue =>
  ({ level, field, code, message, ...(params ? { params } : {}) });
const err = (field: string, code: Code, message: string, params?: Record<string, string>) => issue('error', field, code, message, params);
const warn = (field: string, code: Code, message: string, params?: Record<string, string>) => issue('warning', field, code, message, params);

const hasError = (issues: ImportIssue[]) => issues.some((i) => i.level === 'error');
const MAX_AMOUNT = 100_000;
const MAX_QUANTITY = 99_999;

/** The day after `today` (`YYYY-MM-DD`): a business day later than that is a mistake (Edge cases). */
function nextDay(today: string): string {
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface FileFacts { order: 'dmy' | 'mdy' | 'conflict'; latest: string }

/** Only the known columns survive, and an optional one only when the row has it (the file has the column). */
function known(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(SALES_FIELDS
    .filter((k) => Object.hasOwn(input, k) || k === 'businessDate' || k === 'checkId' || k === 'itemType' || k === 'quantity' || k === 'netAmount')
    .map((k) => [k, (Object.hasOwn(input, k) ? input[k] ?? '' : '').trim()]));
}

/** Checks one line and writes the normalised values back ("14.10.2026" → "2026-10-14", "Butelka" → "wine_bottle", "-12,50" → "-12.5"). */
export function evaluateSalesRow(input: Record<string, string>, facts: FileFacts): { fields: Record<string, string>; issues: ImportIssue[] } {
  const f = known(input);
  const issues: ImportIssue[] = [];

  if (!f.businessDate) issues.push(err('businessDate', 'date_missing', 'Date is missing.'));
  else {
    const cell = readDateCell(f.businessDate);
    let iso: string | null = null;
    if (cell.kind === 'timestamp') issues.push(err('businessDate', 'date_timestamp', 'Use the business day column, not a time stamp.'));
    else if (cell.kind === 'date') iso = cell.iso;
    else if (cell.kind === 'slashed') {
      if (facts.order === 'conflict') issues.push(err('businessDate', 'date_order_conflict', 'This file mixes day/month and month/day dates. Write the date as 2026-10-14.'));
      else {
        iso = facts.order === 'dmy' ? isoDay(cell.year, cell.second, cell.first) : isoDay(cell.year, cell.first, cell.second);
        if (!iso) issues.push(err('businessDate', 'date_invalid', `“${f.businessDate}” is not a date.`, { value: f.businessDate }));
      }
    } else issues.push(err('businessDate', 'date_invalid', `“${f.businessDate}” is not a date.`, { value: f.businessDate }));
    if (iso && iso > facts.latest) issues.push(err('businessDate', 'date_future', 'The date is in the future.'));
    else if (iso) f.businessDate = iso;
  }

  if (!f.checkId) issues.push(err('checkId', 'check_missing', 'Check number is missing.'));
  else if (f.checkId.length > 64) issues.push(err('checkId', 'check_too_long', 'The check number is too long (64 characters at most).'));

  // R8: the field holds a code in its stored form or nothing; text typed over it in the preview is dropped, not an error
  if (Object.hasOwn(f, 'recommendationCode')) f.recommendationCode = normalizeCode(f.recommendationCode) ?? '';

  if (Object.hasOwn(f, 'covers') && f.covers) {
    const c = parseCovers(f.covers);
    if (c === null) issues.push(err('covers', 'covers_invalid', `“${f.covers}” is not a number of guests (0–999).`, { value: f.covers }));
    else f.covers = String(c);
  }

  if (!f.itemType) issues.push(err('itemType', 'item_type_missing', 'Item type is missing.'));
  else {
    const t = normaliseItemType(f.itemType);
    // the cell text stays as it is, so one decision can map every line with it (Q3, R4)
    if (!t) issues.push(err('itemType', 'unmapped_category', `Unrecognised category “${f.itemType}”: choose its type below.`, { value: f.itemType }));
    else {
      if (t.generic) issues.push(warn('itemType', 'generic_wine', `“${f.itemType}” was read as a bottle of wine.`, { value: f.itemType }));
      f.itemType = t.type;
    }
  }

  let quantity: number | null = null;
  if (!f.quantity) issues.push(err('quantity', 'quantity_missing', 'Quantity is missing.'));
  else {
    quantity = parseQuantity(f.quantity);
    if (quantity === null || Math.abs(quantity) > MAX_QUANTITY) { issues.push(err('quantity', 'quantity_invalid', `“${f.quantity}” is not a quantity.`, { value: f.quantity })); quantity = null; }
    else if (quantity === 0) { issues.push(err('quantity', 'quantity_zero', 'Quantity cannot be zero.')); quantity = null; }
    else f.quantity = String(quantity);
  }

  let amount: number | null = null;
  if (!f.netAmount) issues.push(err('netAmount', 'amount_missing', 'Net amount is missing.'));
  else {
    amount = parseAmount(f.netAmount);
    if (amount === null) issues.push(err('netAmount', 'amount_invalid', `“${f.netAmount}” is not an amount.`, { value: f.netAmount }));
    else if (Math.abs(amount) > MAX_AMOUNT) { issues.push(err('netAmount', 'amount_too_high', 'The amount looks too high (100 000 at most).')); amount = null; }
    else f.netAmount = String(amount);
  }
  if ((quantity !== null && quantity < 0) || (amount !== null && amount < 0)) issues.push(warn('', 'return_line', 'Return or void: it is subtracted from the check.'));
  return { fields: f, issues };
}

function factsOf(inputs: Array<Record<string, string>>, today: string): FileFacts & { ambiguous: boolean } {
  const cells: DateCell[] = inputs.map((i) => readDateCell(Object.hasOwn(i, 'businessDate') ? i.businessDate ?? '' : ''));
  return { ...slashedDateOrder(cells), latest: nextDay(today) };
}

const keyOf = (f: Record<string, string>) => `${f.businessDate}|${f.checkId}`;
/** a line belongs to a check when its date and check number are both valid */
const hasKey = (r: ImportRow) => !r.issues.some((i) => i.level === 'error' && (i.field === 'businessDate' || i.field === 'checkId'));

/**
 * Warnings that depend on the other lines of the check: an incomplete check (R6, nothing of it is saved), guests that
 * differ between lines, a check with food but no guests. Never changes a tick.
 */
function withCheckRules(rows: ImportRow[]): ImportRow[] {
  const checks = new Map<string, ImportRow[]>();
  for (const r of rows) {
    if (!hasKey(r)) continue;
    const k = keyOf(r.fields);
    checks.set(k, [...(checks.get(k) ?? []), r]);
  }
  const coversColumn = rows.some((r) => Object.hasOwn(r.fields, 'covers'));
  const extra = new Map<number, ImportIssue[]>();
  const add = (r: ImportRow, i: ImportIssue) => extra.set(r.rowNumber, [...(extra.get(r.rowNumber) ?? []), i]);
  for (const lines of checks.values()) {
    if (lines.some((l) => !l.include || hasError(l.issues))) {
      for (const l of lines) if (l.include && !hasError(l.issues)) add(l, warn('', 'check_incomplete', 'Check incomplete: the whole check will be skipped.'));
    }
    if (!coversColumn) continue;
    const covers = new Set(lines.filter((l) => !l.issues.some((i) => i.field === 'covers')).map((l) => l.fields.covers ?? '').filter(Boolean));
    if (covers.size > 1) for (const l of lines) add(l, warn('covers', 'covers_differ', 'The lines of this check have different numbers of guests: the largest is used.'));
    else if (covers.size === 0) {
      for (const l of lines) if (l.fields.itemType === 'food') add(l, warn('covers', 'covers_missing', 'No guests on this check: it is left out of wine revenue per guest.'));
    }
  }
  return rows.map((r) => (extra.has(r.rowNumber) ? { ...r, issues: [...r.issues, ...extra.get(r.rowNumber)!] } : r));
}

/** The first check of a freshly read file: lines without errors are ticked. Also returns the notes about the file. */
export function buildSalesRows(records: Array<Record<string, string>>, today: string): { rows: ImportRow[]; notes: string[] } {
  const facts = factsOf(records, today);
  const rows = records.map((rec, i): ImportRow => {
    const e = evaluateSalesRow(rec, facts);
    return { rowNumber: i + 1, ...e, include: !hasError(e.issues), action: 'create', matchId: null };
  });
  const notes: string[] = [];
  if (facts.order === 'dmy' && facts.ambiguous) notes.push(SALES_NOTES.dayMonth);
  if (facts.order === 'mdy') notes.push(SALES_NOTES.monthDay);
  const days = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!hasKey(r)) continue;
    const set = days.get(r.fields.checkId) ?? new Set<string>();
    set.add(r.fields.businessDate);
    days.set(r.fields.checkId, set);
  }
  if ([...days.values()].some((d) => d.size > 1)) notes.push(SALES_NOTES.repeatedChecks);
  return { rows: withCheckRules(rows), notes };
}

/**
 * Applies the corrections and checks every line again. A line with errors is never ticked; a line whose errors were
 * just fixed is ticked; a tick counts as the user's choice only when it changed (lesson import-conventions).
 */
export function revalidateSales(rows: ImportRow[], edits: RowEdit[], today: string): ImportRow[] {
  const byRow = new Map(edits.map((e) => [e.rowNumber, e]));
  // a correction may only touch the columns the file has
  const inputs = rows.map((prev) => {
    const edit = byRow.get(prev.rowNumber)?.fields ?? {};
    return Object.fromEntries(Object.keys(prev.fields).map((k) => [k, Object.hasOwn(edit, k) ? edit[k] : prev.fields[k]]));
  });
  const facts = factsOf(inputs, today);
  return withCheckRules(rows.map((prev, i): ImportRow => {
    const edit = byRow.get(prev.rowNumber);
    const e = evaluateSalesRow(inputs[i], facts);
    let include = prev.include;
    const chose = edit?.include !== undefined && edit.include !== prev.include;
    if (hasError(e.issues)) include = false;
    else if (chose) include = edit!.include!;
    else if (hasError(prev.issues)) include = true;
    return { rowNumber: prev.rowNumber, ...e, include, action: 'create', matchId: null };
  }));
}

/**
 * One decision per unrecognised category (Q3, R4): every line whose item type (as corrected in this request, else as
 * stored) is the `from` value — compared by `normKey` — gets the `to` type. Only unrecognised values can be mapped, so a
 * map cannot turn every „Kuchnia” line into wine. Keys come from the client: a `Map`, never a plain object.
 */
export function applyValueMap(rows: ImportRow[], edits: RowEdit[], map: ValueMapEntry[]): RowEdit[] {
  if (!map.length) return edits;
  const to = new Map<string, SalesItemType>();
  for (const m of map) if (m.field === 'itemType') to.set(normKey(m.from), m.to);
  const byRow = new Map(edits.map((e) => [e.rowNumber, e]));
  for (const r of rows) {
    const edit = byRow.get(r.rowNumber);
    const current = edit?.fields && Object.hasOwn(edit.fields, 'itemType') ? edit.fields.itemType : r.fields.itemType ?? '';
    const type = normaliseItemType(current) ? undefined : to.get(normKey(current));
    if (!type) continue;
    byRow.set(r.rowNumber, { ...edit, rowNumber: r.rowNumber, fields: { ...(edit?.fields ?? {}), itemType: type } });
  }
  return [...byRow.values()];
}

/** The distinct unrecognised categories of the file, in the order they first appear, with their number of lines. */
export function unmappedValues(rows: ImportRow[]): Array<{ value: string; lines: number }> {
  const seen = new Map<string, { value: string; lines: number }>();
  for (const r of rows) {
    if (!r.issues.some((i) => i.code === 'unmapped_category')) continue;
    const value = r.fields.itemType ?? '';
    const k = normKey(value);
    const s = seen.get(k);
    if (s) s.lines += 1;
    else seen.set(k, { value, lines: 1 });
  }
  return [...seen.values()];
}

/** A line as it will be saved (only for a ticked line without errors). */
const toLine = (r: ImportRow): Omit<SalesRecord, 'id'> => ({
  businessDate: r.fields.businessDate, checkId: r.fields.checkId, covers: r.fields.covers ? Number(r.fields.covers) : null,
  itemType: r.fields.itemType as SalesItemType, quantity: Number(r.fields.quantity), netAmount: Number(r.fields.netAmount),
  recommendationCode: r.fields.recommendationCode ? r.fields.recommendationCode : null
});

/**
 * What a confirm saves (R6): the lines of complete checks only — every line of the check ticked and without errors.
 * A check with one unticked or broken line is saved not at all and replaces nothing. Worked out once, here. `codes` are
 * the distinct (business day, recommendation code) pairs of the lines that will be saved; `checksWithCode` counts the
 * saved checks that carry a code (spec 2026-10-16-recommendation-code, A13 preview note).
 */
export function completeChecks(rows: ImportRow[]): {
  lines: Array<Omit<SalesRecord, 'id'>>; checks: CheckKey[]; incomplete: number; checksWithCode: number; codes: Array<{ businessDate: string; code: string }>
} {
  const groups = new Map<string, ImportRow[]>();
  for (const r of rows) {
    if (!hasKey(r)) continue;
    const k = keyOf(r.fields);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const lines: Array<Omit<SalesRecord, 'id'>> = [];
  const checks: CheckKey[] = [];
  const codes = new Map<string, { businessDate: string; code: string }>();
  let checksWithCode = 0;
  let incomplete = 0;
  for (const group of groups.values()) {
    if (group.some((l) => !l.include || hasError(l.issues))) {
      if (group.some((l) => l.include && !hasError(l.issues))) incomplete += 1;
      continue;
    }
    checks.push({ businessDate: group[0].fields.businessDate, checkId: group[0].fields.checkId });
    lines.push(...group.map(toLine));
    const own = group.map((l) => l.fields.recommendationCode).filter((c): c is string => Boolean(c));
    if (own.length) checksWithCode += 1;
    for (const code of own) codes.set(`${group[0].fields.businessDate}|${code}`, { businessDate: group[0].fields.businessDate, code });
  }
  return { lines, checks, incomplete, checksWithCode, codes: [...codes.values()] };
}
