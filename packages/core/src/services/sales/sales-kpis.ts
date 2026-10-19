import type { CheckKey, SalesPeriod, SalesRecord } from './types';

/**
 * Wine Attach Rate and the sales KPIs (spec 2026-10-15-pos-sales-import-attach-rate, Q7, Q8, contract for E04).
 * Two stages: the lines are summed per check (`aggregateChecks` here, `GROUP BY` in PostgreSQL), then
 * `computeSalesKpis` applies the rules. Both are pure, so the import preview, the memory store and PostgreSQL share them.
 */

/** The lines of one check summed by type. Quantities and amounts are sums (a return cancels a sale). */
export interface CheckTotals extends CheckKey {
  /** the largest `covers` of the check's lines; null when no line has one */
  covers: number | null;
  foodQuantity: number;
  glassQuantity: number;
  glassAmount: number;
  bottleQuantity: number;
  bottleAmount: number;
}

export interface SalesKpis {
  period: SalesPeriod;
  /** null: no active line at all in the period */
  source: 'sales_import' | null;
  /** checks (business_date, check_id) */
  checks: number;
  foodChecks: number;
  foodChecksWithWine: number;
  /** foodChecksWithWine / foodChecks (0..1), per check, not rounded; null = no data */
  attachRate: number | null;
  /** sum of covers of the checks with food that have guests; null when none has */
  covers: number | null;
  /** net, glass + bottle, every check (bar checks too) */
  wineRevenue: number;
  /** wine revenue of the checks with food and guests / covers */
  wineRevenuePerGuest: number | null;
  /** wine revenue of the checks with food / foodChecks */
  wineRevenuePerTable: number | null;
  /** bottle revenue / bottles */
  averageBottle: number | null;
  /** glass revenue / glasses */
  averageGlass: number | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
/** sums of decimals (0.1 + 0.2) are rounded to the precision of the column, so 3 × 0.1 bottles is 0.3, not 0.30000000000000004 */
const qty = (n: number) => Math.round(n * 1000) / 1000;
const keyOf = (k: CheckKey) => `${k.businessDate}|${k.checkId}`;

/** Sums the lines per check, in the order the checks first appear. Used by the memory store and the import preview. */
export function aggregateChecks(lines: Array<Omit<SalesRecord, 'id'>>): CheckTotals[] {
  const checks = new Map<string, CheckTotals>();
  for (const l of lines) {
    const key = keyOf(l);
    let c = checks.get(key);
    if (!c) {
      c = { businessDate: l.businessDate, checkId: l.checkId, covers: null, foodQuantity: 0, glassQuantity: 0, glassAmount: 0, bottleQuantity: 0, bottleAmount: 0 };
      checks.set(key, c);
    }
    if (l.covers !== null) c.covers = Math.max(c.covers ?? 0, l.covers);
    if (l.itemType === 'food') c.foodQuantity = qty(c.foodQuantity + l.quantity);
    else if (l.itemType === 'wine_glass') { c.glassQuantity = qty(c.glassQuantity + l.quantity); c.glassAmount = money(c.glassAmount + l.netAmount); }
    else if (l.itemType === 'wine_bottle') { c.bottleQuantity = qty(c.bottleQuantity + l.quantity); c.bottleAmount = money(c.bottleAmount + l.netAmount); }
  }
  return [...checks.values()];
}

/**
 * A check "has food" / "has wine" when the summed quantity of that type is above zero (Q8: a returned bottle cancels
 * the sale). Wine Attach Rate = checks with food and wine / checks with food (Q7): bar checks (wine only) count for
 * the wine revenue, never for the rate. Amounts are rounded to 0.01; the rate is not rounded.
 */
export function computeSalesKpis(period: SalesPeriod, checks: CheckTotals[]): SalesKpis {
  let foodChecks = 0;
  let foodChecksWithWine = 0;
  let covers = 0;
  let withGuests = 0;
  let wineRevenue = 0;
  let foodWineRevenue = 0;
  let guestWineRevenue = 0;
  let bottles = 0;
  let bottleRevenue = 0;
  let glasses = 0;
  let glassRevenue = 0;
  for (const c of checks) {
    const wine = c.glassAmount + c.bottleAmount;
    wineRevenue += wine;
    bottles += c.bottleQuantity;
    bottleRevenue += c.bottleAmount;
    glasses += c.glassQuantity;
    glassRevenue += c.glassAmount;
    if (c.foodQuantity <= 0) continue;
    foodChecks += 1;
    foodWineRevenue += wine;
    if (c.glassQuantity > 0 || c.bottleQuantity > 0) foodChecksWithWine += 1;
    if (c.covers !== null && c.covers > 0) {
      withGuests += 1;
      covers += c.covers;
      guestWineRevenue += wine;
    }
  }
  return {
    period: { ...period },
    source: checks.length > 0 ? 'sales_import' : null,
    checks: checks.length,
    foodChecks,
    foodChecksWithWine,
    attachRate: foodChecks > 0 ? foodChecksWithWine / foodChecks : null,
    covers: withGuests > 0 ? covers : null,
    wineRevenue: money(wineRevenue),
    wineRevenuePerGuest: withGuests > 0 ? money(guestWineRevenue / covers) : null,
    wineRevenuePerTable: foodChecks > 0 ? money(foodWineRevenue / foodChecks) : null,
    averageBottle: qty(bottles) > 0 ? money(bottleRevenue / bottles) : null,
    averageGlass: qty(glasses) > 0 ? money(glassRevenue / glasses) : null
  };
}
