import { z } from 'zod';

/**
 * A period of business days for the sales KPIs (spec 2026-10-15-pos-sales-import-attach-rate, R10, contract for E04):
 * two real calendar dates `YYYY-MM-DD`, both inclusive, `from` not after `to`, at most 366 days (`to − from ≤ 365`).
 * Field codes: `invalid` (not a date), `before_from` (`to` earlier than `from`), `too_long` (more than 366 days).
 */
export const MAX_SALES_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;

/** The UTC midnight of a `YYYY-MM-DD` calendar date, or null when it is not one (`2026-02-30`, `2026-1-5`). */
export function businessDayTime(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const at = new Date(t);
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d ? t : null;
}

const businessDay = z.string().max(10).refine((s) => businessDayTime(s) !== null);

export const salesPeriodSchema = z.strictObject({ from: businessDay, to: businessDay }).superRefine((p, ctx) => {
  const from = businessDayTime(p.from);
  const to = businessDayTime(p.to);
  if (from === null || to === null) return;
  if (to < from) ctx.addIssue({ code: 'custom', path: ['to'], message: 'before_from' });
  else if ((to - from) / DAY_MS > MAX_SALES_PERIOD_DAYS - 1) ctx.addIssue({ code: 'custom', path: ['to'], message: 'too_long' });
});
export type SalesPeriodInput = z.output<typeof salesPeriodSchema>;
