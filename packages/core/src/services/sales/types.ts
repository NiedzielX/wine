/**
 * Sales from the restaurant's POS (spec 2026-10-15-pos-sales-import-attach-rate). One record is one line of a check
 * (bill): no guest data, no item name (Q18), amounts net (Q9). A check is identified by its business day and its
 * number, unique within that day (Q17).
 */

export const SALES_ITEM_TYPES = ['food', 'wine_glass', 'wine_bottle', 'other'] as const;
export type SalesItemType = (typeof SALES_ITEM_TYPES)[number];

/** A check: the business day (`YYYY-MM-DD`) and the check number unique within that day. */
export interface CheckKey {
  businessDate: string;
  checkId: string;
}

/** One line of a check, as the import saves it. `restaurant_id` and `import_job_id` are added by the repository. */
export interface SalesRecord extends CheckKey {
  id: string;
  /** guests at the check, repeated on its lines; null when the export has none */
  covers: number | null;
  itemType: SalesItemType;
  /** negative for a return or a void */
  quantity: number;
  /** net amount of the line, PLN; negative for a return */
  netAmount: number;
}

/** A period of business days (`YYYY-MM-DD`), both ends inclusive. */
export interface SalesPeriod {
  from: string;
  to: string;
}
