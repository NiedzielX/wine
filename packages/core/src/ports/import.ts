import type { Dish, DishCategory, Pairing, Wine } from '../domain/types';
import type { DishTranslations, WineTranslations } from '../i18n/content';
import type { ImportJob, ImportResult, ImportRow } from '../import/types';
import type { CheckKey, SalesRecord } from '../services/sales/types';

/** Everything a menu or wine-list import changes, applied in ONE transaction together with closing the job. */
export interface CatalogImportPlan {
  kind: 'catalog';
  newDishes: Dish[];
  /** `translations`, when present, replaces the dish's translations (the plan merges the file's values into the current ones) */
  dishUpdates: Array<{ id: string; description: string; category: DishCategory; price: number; translations?: DishTranslations }>;
  newWines: Wine[];
  wineUpdates: Array<{ id: string; glassPrice: number | null; bottlePrice: number; translations?: WineTranslations }>;
  /** engine suggestions for the new items (status "suggested": they do not change what guests see) */
  newPairings: Pairing[];
  result: ImportResult;
}

/**
 * A sales import (spec 2026-10-15-pos-sales-import-attach-rate, Q4): whole checks only. In one transaction the active
 * lines of the restaurant with a (business_date, check_id) in `checks` are marked replaced by this job, then `records`
 * are inserted. `checks` are exactly the checks of `records`.
 */
export interface SalesImportPlan {
  kind: 'sales';
  records: SalesRecord[];
  checks: CheckKey[];
  result: ImportResult;
}

export type ImportPlan = CatalogImportPlan | SalesImportPlan;

export interface ImportRepository {
  create(job: ImportJob): Promise<void>;
  find(restaurantId: string, jobId: string): Promise<ImportJob | null>;
  listRecent(restaurantId: string, limit: number): Promise<ImportJob[]>;
  /** Replaces the rows of an OPEN job (preview_ready). Returns false when the job is closed or unknown. */
  saveRows(restaurantId: string, jobId: string, rows: ImportRow[]): Promise<boolean>;
  /** Closes an open job without importing. Returns false when it was not open. */
  cancel(restaurantId: string, jobId: string): Promise<boolean>;
  /**
   * Applies the plan and marks the job confirmed, all or nothing. Throws InvariantError("job_closed")
   * when the job is not open (so a double click cannot import twice) and NotFoundError for an unknown job.
   * Returns how many distinct checks a sales plan replaced (0 for a catalog plan); the stored result carries it as `replaced`.
   */
  confirm(restaurantId: string, jobId: string, plan: ImportPlan, at: string): Promise<{ replacedChecks: number }>;
}
