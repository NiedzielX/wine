import { z } from 'zod';
import { IMPORT_LIMITS, MENU_FIELDS, WINE_FIELDS } from '../../import/types';

/** Only the columns an import knows. Any other key is refused, so nothing unknown is ever stored with a row. */
const fieldNames = [...new Set<string>([...MENU_FIELDS, ...WINE_FIELDS])];
const rowFields = z
  .strictObject(Object.fromEntries(fieldNames.map((k) => [k, z.string().max(2000).optional()])))
  // a column that was not sent is not a correction: leave it out instead of passing `undefined` on
  .transform((f): Record<string, string> => Object.fromEntries(Object.entries(f).flatMap(([key, value]) => (value === undefined ? [] : [[key, value]]))));

const rowEdit = z.strictObject({
  rowNumber: z.number().int().min(1).max(100_000),
  fields: rowFields.optional(),
  include: z.boolean().optional()
});

/** PATCH /imports/{id}/rows: at least one row. */
export const rowEditsSchema = z.strictObject({ rows: z.array(rowEdit).min(1).max(IMPORT_LIMITS.maxRows) });

/** POST /imports/{id}/confirm: the corrections are optional (an empty body is fine). */
export const confirmImportSchema = z.strictObject({ rows: z.array(rowEdit).max(IMPORT_LIMITS.maxRows).optional() });

export type RowEditsInput = z.output<typeof rowEditsSchema>;
