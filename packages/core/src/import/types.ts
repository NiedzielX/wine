import type { DishCategory } from '../domain/types';

/** Types of the import feature: what the user uploads, previews, corrects and confirms. */

export type ImportKind = 'menu' | 'wines';
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
  | 'bottle_price_missing' | 'bottle_price_invalid' | 'glass_price_invalid' | 'glass_price_not_lower';

/** One row of the preview. All values are text, exactly as the user can edit them. */
export interface ImportRow {
  /** 1-based number of the data row in the file (the header is not counted) */
  rowNumber: number;
  fields: Record<string, string>;
  include: boolean;
  /** `update` when the dish / wine already exists in the restaurant */
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

export const DISH_CATEGORIES: DishCategory[] = ['Starters', 'Mains', 'Desserts'];

/** What a file parser returns: a table (CSV, XLSX) or the text lines of a PDF. */
export type ParsedFile =
  | { parser: 'csv' | 'xlsx'; rows: string[][] }
  | { parser: 'pdf-text'; lines: string[] };

/** Implemented in @wine-match/db/import (needs Node and file libraries; core stays pure). */
export interface ImportFileParser {
  parse(file: { name: string; bytes: Uint8Array }): Promise<ParsedFile>;
}
