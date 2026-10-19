import { NotFoundError, ValidationError } from '../../errors';
import type { Repositories } from '../../ports/repositories';
import { parseWith } from '../../validators/parse';
import { salesPeriodSchema } from '../../validators/sales/sales-period.schema';
import { KPI_DAYS, kpiWindow, shiftDay } from '../analytics/kpi-window';
import { computeSalesKpis, type SalesKpis } from './sales-kpis';
import type { SalesPeriod } from './types';

export type SalesKpiServiceDeps = Pick<Repositories, 'restaurantRepository' | 'salesRepository'>;

/**
 * Wine Attach Rate and the sales KPIs of a period (spec 2026-10-15-pos-sales-import-attach-rate, phase 2, R10, R12).
 * The contract for E04 (`getSalesKpis`, `dataRange`, `SalesKpis`) is stable: E04 calls `getSalesKpis` once per window.
 * Only the active lines of the restaurant are counted; the rules are `computeSalesKpis`.
 */
export class SalesKpiService {
  constructor(private readonly deps: SalesKpiServiceDeps) {}

  /** NotFoundError for an unknown slug, ValidationError('invalid_period') for a bad period. */
  async getSalesKpis(slug: string, period: SalesPeriod): Promise<SalesKpis> {
    const p = validPeriod(period);
    const restaurantId = await this.restaurantId(slug);
    return computeSalesKpis(p, await this.deps.salesRepository.checkTotals(restaurantId, p));
  }

  /** The first and the last business day with active data, null when there is none. */
  async dataRange(slug: string): Promise<SalesPeriod | null> {
    return this.deps.salesRepository.dataRange(await this.restaurantId(slug));
  }

  private async restaurantId(slug: string): Promise<string> {
    const r = await this.deps.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r.id;
  }
}

/** The period as the schema reads it; any problem is `invalid_period` (422), with the field codes of the schema. */
function validPeriod(period: SalesPeriod): SalesPeriod {
  try {
    const { from, to } = parseWith(salesPeriodSchema, period);
    return { from, to };
  } catch (e) {
    if (e instanceof ValidationError) throw new ValidationError('invalid_period', 'Choose a period of up to 366 days that does not end before it starts.', e.fields);
    throw e;
  }
}

/**
 * The period A13 shows before the GM chooses one (spec UI/UX "Karta Wine Attach Rate"): the 28 days (`KPI_DAYS`, the
 * dashboard's window) ending on the last day with data; with no data, the dashboard's last 28 full days in Warsaw.
 */
export function defaultSalesPeriod(range: SalesPeriod | null, now: Date): SalesPeriod {
  if (!range) return kpiWindow(now).current;
  return { from: shiftDay(range.to, -(KPI_DAYS - 1)), to: range.to };
}
