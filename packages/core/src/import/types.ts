import type { DishCategory } from '../domain/types';
import type { SalesItemType } from '../services/sales/types';

/** Types of the import feature: what the user uploads, previews, corrects and confirms. */

/** `sales`: lines of checks exported from the POS (spec 2026-10-15-pos-sales-import-attach-rate). */
export type ImportKind = 'menu' | 'wines' | 'sales';
export type ImportStatus = 'uploaded' | 'parsing' | 'preview_ready' | 'confirmed' | 'failed' | 'cancelled';

export interface ImportIssue {
  /** errors keep a row from being imported; warnings are advice */
  level: 'error' | 'warning';
  field?: string;
  /**
   * Machine-readable kind of the issue. `duplicate_in_file` and `exists` are the ones the logic reacts to; every
   * other code lets the dashboard show the message in the user's language (spec 2026-10-15-polish-language, A9).
   * Jobs saved before 2026-10-15 may have issues without a code: show `message`.
   */
  code?: ImportIssueCode;
  /** values quoted in the message (the cell text, the guessed style, the first row of a repeat) */
  params?: Record<string, string>;
  /** English text, kept for the API and as the fallback when a translation is missing */
  message: string;
}

export type ImportIssueCode =
  | 'duplicate_in_file' | 'exists'
  | 'name_missing' | 'name_too_long' | 'price_missing' | 'price_invalid' | 'price_not_positive' | 'price_too_high'
  | 'category_unknown' | 'category_missing' | 'description_long'
  | 'producer_missing' | 'wine_name_from_grape' | 'wine_name_missing' | 'wine_name_too_long'
  | 'vintage_missing' | 'vintage_invalid' | 'grape_missing' | 'style_unknown' | 'style_missing' | 'style_missing_from_grape'
  | 'bottle_price_missing' | 'bottle_price_invalid' | 'glass_price_invalid' | 'glass_price_not_lower'
  | 'translation_empty' | 'translation_too_long'
  // sales (spec 2026-10-15-pos-sales-import-attach-rate)
  | 'date_missing' | 'date_invalid' | 'date_timestamp' | 'date_future' | 'date_order_conflict'
  | 'check_missing' | 'check_too_long' | 'covers_invalid' | 'covers_missing' | 'covers_differ'
  | 'item_type_missing' | 'unmapped_category' | 'generic_wine'
  | 'quantity_missing' | 'quantity_invalid' | 'quantity_zero' | 'amount_missing' | 'amount_invalid' | 'amount_too_high'
  | 'return_line' | 'check_incomplete';

/** One row of the preview. All values are text, exactly as the user can edit them. */
export interface ImportRow {
  /** 1-based number of the data row in the file (the header is not counted) */
  rowNumber: number;
  fields: Record<string, string>;
  include: boolean;
  /** `update` when the dish / wine already exists in the restaurant; always `create` for sales lines */
  action: 'create' | 'update';
  matchId: string | null;
  issues: ImportIssue[];
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** engine suggestions prepared for the new items */
  suggestions: number;
  /** sales only: checks already saved that this import replaced (Q4); `created` counts lines, `skipped` lines left out */
  replaced?: number;
}

export interface ImportJob {
  id: string;
  restaurantId: string;
  kind: ImportKind;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: ImportStatus;
  parser: string | null;
  rows: ImportRow[];
  /** notes about how the file was read (no header found, PDF is best effort, …) */
  notes: string[];
  error: string | null;
  createdBy: string;
  createdAt: string;
  confirmedAt: string | null;
  result: ImportResult | null;
}

export interface RowEdit {
  rowNumber: number;
  fields?: Record<string, string>;
  include?: boolean;
}

export const IMPORT_LIMITS = { maxBytes: 10 * 1024 * 1024, maxRows: 2000 } as const;

export const MENU_FIELDS = ['category', 'name', 'description', 'price'] as const;
export const WINE_FIELDS = ['producer', 'name', 'vintage', 'region', 'country', 'grape', 'style', 'glassPrice', 'bottlePrice'] as const;

/**
 * Translation columns (spec 2026-10-15-bilingual-content, R5): optional, never in the default column order. A row has
 * such a field only when its column is in the file; an empty cell means "no change" (and a warning).
 */
export const MENU_TRANSLATION_FIELDS = ['name_pl', 'name_en', 'description_pl', 'description_en'] as const;
export const WINE_TRANSLATION_FIELDS = ['tasting_note_pl', 'tasting_note_en', 'region_pl', 'region_en', 'country_pl', 'country_en'] as const;
export const TRANSLATION_FIELDS = { menu: MENU_TRANSLATION_FIELDS, wines: WINE_TRANSLATION_FIELDS, sales: [] } as const;

/**
 * Columns of a sales import. `covers` and `itemName` are optional: a record has them only when the file has the column.
 * `itemName` is shown in the preview to recognise a line but is never saved (Q18). Nothing outside this list is copied
 * from the file into a record (R9).
 */
export const SALES_FIELDS = ['businessDate', 'checkId', 'covers', 'itemType', 'itemName', 'quantity', 'netAmount'] as const;
export type SalesField = (typeof SALES_FIELDS)[number];
export const SALES_REQUIRED_FIELDS: readonly SalesField[] = ['businessDate', 'checkId', 'itemType', 'quantity', 'netAmount'];
export const SALES_OPTIONAL_FIELDS: readonly SalesField[] = ['covers', 'itemName'];

/**
 * One decision for every line with the same unrecognised category (Q3, R4): „Wina białe” → `wine_bottle`. Values are
 * compared by `normKey`, so case, Polish letters and punctuation do not matter.
 */
export interface ValueMapEntry {
  field: 'itemType';
  from: string;
  to: SalesItemType;
}

export const DISH_CATEGORIES: DishCategory[] = ['Starters', 'Mains', 'Desserts'];

/** What a file parser returns: a table (CSV, XLSX) or the text lines of a PDF. */
export type ParsedFile =
  | { parser: 'csv' | 'xlsx'; rows: string[][] }
  | { parser: 'pdf-text'; lines: string[] };

/** Implemented in @wine-match/db/import (needs Node and file libraries; core stays pure). */
export interface ImportFileParser {
  parse(file: { name: string; bytes: Uint8Array }): Promise<ParsedFile>;
}
