import { KPI_DAYS, type KpiPeriod, type Locale, type Metric } from '@wine-match/core';
import { getDictionary } from '@/server/i18n';
import type { KpiDelta } from './kpi';

/**
 * How A1 writes KPI values and their change (spec 2026-10-15-kpi-dashboard, R5–R7, UI "Format"). Presentation only:
 * the values and the reason a change is missing come from `AnalyticsService`. Counts and rates in the panel language
 * (`en-GB`: 1,030 and 46.0%), a % change rounded to a whole number, a pp change to one decimal; a change that rounds
 * to 0 reads "No change".
 */

const TAG: Record<Locale, string> = { en: 'en-GB', pl: 'pl-PL' };

export const formatCount = (n: number, locale: Locale) => new Intl.NumberFormat(TAG[locale]).format(n);

/** A rate (0..1) as "31.2%"; null when there is no denominator. */
export function formatRate(value: number | null, locale: Locale): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat(TAG[locale], { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

/** The delta line of a tile. */
export function formatDelta(m: Metric, locale: Locale): KpiDelta {
  const d = getDictionary(locale).admin.dashboard.delta;
  if (m.change === null) return { text: m.noChange === 'small_sample' ? d.smallSample : d.noComparison };
  const rounded = m.unit === 'pp' ? Math.round(m.change * 10) / 10 : Math.round(m.change);
  if (rounded === 0) return { text: d.noChange };
  const abs = Math.abs(rounded);
  const amount = m.unit === 'pp'
    ? d.points(new Intl.NumberFormat(TAG[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(abs))
    : `${formatCount(abs, locale)}%`;
  return { text: d.vsPrevious(amount, KPI_DAYS), arrow: rounded > 0 ? { symbol: '▲', label: d.up } : { symbol: '▼', label: d.down } };
}

/** "17 Sep – 14 Oct 2026" / "17 wrz – 14 paź 2026" (local dates, both inclusive). */
export function formatPeriod(p: KpiPeriod, locale: Locale): string {
  const at = (day: string) => new Date(`${day}T00:00:00.000Z`);
  const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
  const from = new Intl.DateTimeFormat(TAG[locale], { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(at(p.from));
  const to = new Intl.DateTimeFormat(TAG[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(at(p.to));
  return getDictionary(locale).admin.dashboard.usage.window(KPI_DAYS, from, to);
}
