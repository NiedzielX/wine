import type { CheckTotals } from '../services/sales/sales-kpis';
import type { CheckKey, SalesPeriod } from '../services/sales/types';

/** A check of the results report: `CheckTotals` plus whether one of its active lines carries a recommendation code (R6). */
export interface MarkedCheckTotals extends CheckTotals {
  hasCode: boolean;
}

/**
 * Sales lines imported from the POS (spec 2026-10-15-pos-sales-import-attach-rate). Read side only: lines are written
 * and replaced by `ImportRepository.confirm` (a `sales` plan), in the same transaction that closes the import.
 * Every method reads ACTIVE lines only (`replaced_at IS NULL`) of one restaurant.
 */
export interface SalesRepository {
  /** the active lines of the period summed per check, sorted by business day, then check number */
  checkTotals(restaurantId: string, period: SalesPeriod): Promise<CheckTotals[]>;
  /**
   * `checkTotals` with `hasCode` (spec 2026-11-18-owner-proof-report, step 2): a check has a code when one of its active
   * lines with a positive quantity carries a recommendation code (a returned line does not count). The totals are
   * exactly those of `checkTotals`, so the report's rate equals A1's (R2). One call serves every window of a report.
   */
  checkTotalsMarked(restaurantId: string, period: SalesPeriod): Promise<MarkedCheckTotals[]>;
  /** the first and the last business day with active lines; null when there is none */
  dataRange(restaurantId: string): Promise<SalesPeriod | null>;
  /** how many of these distinct checks already have active lines (the import preview: "N checks will be replaced") */
  countChecks(restaurantId: string, keys: CheckKey[]): Promise<number>;
}
