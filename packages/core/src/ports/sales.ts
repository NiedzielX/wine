import type { CheckTotals } from '../services/sales/sales-kpis';
import type { CheckKey, SalesPeriod } from '../services/sales/types';

/**
 * Sales lines imported from the POS (spec 2026-10-15-pos-sales-import-attach-rate). Read side only: lines are written
 * and replaced by `ImportRepository.confirm` (a `sales` plan), in the same transaction that closes the import.
 * Every method reads ACTIVE lines only (`replaced_at IS NULL`) of one restaurant.
 */
export interface SalesRepository {
  /** the active lines of the period summed per check, sorted by business day, then check number */
  checkTotals(restaurantId: string, period: SalesPeriod): Promise<CheckTotals[]>;
  /** the first and the last business day with active lines; null when there is none */
  dataRange(restaurantId: string): Promise<SalesPeriod | null>;
  /** how many of these distinct checks already have active lines (the import preview: "N checks will be replaced") */
  countChecks(restaurantId: string, keys: CheckKey[]): Promise<number>;
}
