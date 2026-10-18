import type { Locale } from '../i18n/locale';

/**
 * The service day of a restaurant (spec 2026-10-16-recommendation-code, R2, Q3): the calendar date in Warsaw, except
 * that the night belongs to the day it started in until 04:00 local time. A per-restaurant time zone and cut-off are
 * a separate change (`Restaurant.timezone` is in DATA_MODEL.md, not in the domain type).
 */
export const SERVICE_DAY_CUTOFF_HOUR = 4;
export const SERVICE_TIME_ZONE = 'Europe/Warsaw';

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SERVICE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * The service day (`YYYY-MM-DD`) of an instant. Computed from the local date and hour that `Intl` gives for Warsaw,
 * and the previous date is found by date arithmetic — never by subtracting four hours from the instant, which picks
 * the wrong date on the nights the clocks change.
 */
export function serviceDay(at: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(PARTS.formatToParts(at).find((p) => p.type === type)?.value);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  if (hour >= SERVICE_DAY_CUTOFF_HOUR) return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return `${pad(previous.getUTCFullYear(), 4)}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`;
}

/** `HH:mm` of an instant in the restaurant's time zone (the server runs in UTC). */
export function formatServiceTime(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { timeZone: SERVICE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}
