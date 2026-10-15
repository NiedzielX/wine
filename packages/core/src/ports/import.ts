import type { Dish, DishCategory, Pairing, Wine } from '../domain/types';
import type { ImportJob, ImportResult, ImportRow } from '../import/types';

/** Everything an import changes, applied in ONE transaction together with closing the job. */
export interface ImportPlan {
  newDishes: Dish[];
  dishUpdates: Array<{ id: string; description: string; category: DishCategory; price: number }>;
  newWines: Wine[];
  wineUpdates: Array<{ id: string; glassPrice: number | null; bottlePrice: number }>;
  /** engine suggestions for the new items (status "suggested": they do not change what guests see) */
  newPairings: Pairing[];
  result: ImportResult;
}

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
   */
  confirm(restaurantId: string, jobId: string, plan: ImportPlan, at: string): Promise<void>;
}
