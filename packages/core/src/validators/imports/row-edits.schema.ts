import { z } from 'zod';
import { SALES_ITEM_TYPES } from '../../services/sales/types';
import { IMPORT_LIMITS, MENU_FIELDS, SALES_FIELDS, WINE_FIELDS } from '../../import/types';

/** Only the columns an import knows. Any other key is refused, so nothing unknown is ever stored with a row. */
const fieldNames = [...new Set<string>([...MENU_FIELDS, ...WINE_FIELDS, ...SALES_FIELDS])];
const rowFields = z
  .strictObject(Object.fromEntries(fieldNames.map((k) => [k, z.string().max(2000).optional()])))
  // a column that was not sent is not a correction: leave it out instead of passing `undefined` on
  .transform((f): Record<string, string> => Object.fromEntries(Object.entries(f).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]]))));

const rowEdit = z.strictObject({
  rowNumber: z.number().int().min(1).max(100_000),
  fields: rowFields.optional(),
  include: z.boolean().optional()
});

/**
 * Sales only (spec 2026-10-15-pos-sales-import-attach-rate, Q3, R4): one type for every line with the same unrecognised
 * category. The `from` text is a client-chosen key: the service compares it through a `Map`, never as an object key.
 */
const valueMapEntry = z.strictObject({
  field: z.literal('itemType'),
  from: z.string().min(1).max(200),
  to: z.enum(SALES_ITEM_TYPES)
});
const valueMap = z.array(valueMapEntry).max(200);

/** PATCH /imports/{id}/rows: at least one row (a sales correction may also be only a `valueMap`). */
export const rowEditsSchema = z
  .strictObject({ rows: z.array(rowEdit).max(IMPORT_LIMITS.maxRows), valueMap: valueMap.optional() })
  .refine((b) => b.rows.length > 0 || (b.valueMap?.length ?? 0) > 0, { message: 'too_few', path: ['rows'] });

/** POST /imports/{id}/confirm: the corrections are optional (an empty body is fine). */
export const confirmImportSchema = z.strictObject({ rows: z.array(rowEdit).max(IMPORT_LIMITS.maxRows).optional(), valueMap: valueMap.optional() });

export type RowEditsInput = z.output<typeof rowEditsSchema>;
