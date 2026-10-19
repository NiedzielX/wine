/**
 * The KPI window of the dashboard (spec 2026-10-15-kpi-dashboard, R1, Q2): the last 28 full calendar days in Warsaw,
 * ending yesterday, and the 28 days right before them. Calendar days, not E09's service days. A per-restaurant time
 * zone is a separate change (`Restaurant.timezone` is in DATA_MODEL.md, not in the domain type).
 */
export const KPI_DAYS = 28;
export const KPI_TIME_ZONE = 'Europe/Warsaw';

/** Local dates (`YYYY-MM-DD`), both ends inclusive — structurally the same as E03's `SalesPeriod`. */
export interface KpiPeriod { from: string; to: string }
/** Instants, half-open: `[from, to)`. */
export interface TimeRange { from: Date; to: Date }

export interface KpiWindow {
  current: KpiPeriod;
  previous: KpiPeriod;
  currentRange: TimeRange;
  previousRange: TimeRange;
}

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: KPI_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function localParts(at: Date) {
  const parts = PARTS.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

/** The local calendar date (`YYYY-MM-DD`) of an instant in Warsaw. */
export function localDate(at: Date): string {
  const { year, month, day } = localParts(at);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** `day` moved by `n` calendar days: date arithmetic only. */
export function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

/** Warsaw's offset from UTC (ms) at an instant. */
function offsetAt(at: Date): number {
  const p = localParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant local midnight of `day` begins in Warsaw. Midnight never falls in a clock change there (changes are at
 * 02:00/03:00), so one correction of the offset is exact on both sides of a change.
 */
export function startOfLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetAt(new Date(guess));
  return new Date(guess - offsetAt(new Date(first)));
}

/** The current and the previous window for `now`; today (unfinished) is in neither. */
export function kpiWindow(now: Date): KpiWindow {
  const to = shiftDay(localDate(now), -1);
  const from = shiftDay(to, -(KPI_DAYS - 1));
  const prevTo = shiftDay(from, -1);
  const prevFrom = shiftDay(prevTo, -(KPI_DAYS - 1));
  return {
    current: { from, to },
    previous: { from: prevFrom, to: prevTo },
    currentRange: { from: startOfLocalDay(from), to: startOfLocalDay(shiftDay(to, 1)) },
    previousRange: { from: startOfLocalDay(prevFrom), to: startOfLocalDay(from) }
  };
}
