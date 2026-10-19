import type { Locale, Wine } from '@wine-match/core';
import { formatPrice, getDictionary } from '@/server/i18n';

/** Dates and money of the dashboard, through `Intl` in the interface language (spec 2026-10-15-polish-language, R9). */

const DATE_TIME: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' }),
  pl: new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
};

/** "9 Oct 2026, 17:40" / "09.10.2026, 17:40" in the restaurant's timezone, or "Never" / "Nigdy" when there is no date. */
export function formatDateTime(iso: string | null, locale: Locale = 'en'): string {
  if (!iso) return getDictionary(locale).admin.common.never;
  return DATE_TIME[locale].format(new Date(iso));
}

/** A price in złoty: "1,234 zł" / "1 234 zł" (non-breaking spaces in Polish). */
export const zl = (n: number, locale: Locale = 'en') => formatPrice(n, locale);

export const vintageLabel = (w: Wine, locale: Locale = 'en') => (w.vintage === 'NV' ? getDictionary(locale).admin.common.nonVintage : String(w.vintage));

export const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

const DAY: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  pl: new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
};

/** A business day (`YYYY-MM-DD`, no time zone): "14 Oct 2026" / "14.10.2026". */
export const formatDay = (day: string, locale: Locale = 'en') => DAY[locale].format(new Date(`${day}T00:00:00.000Z`));

/** A rate 0..1 with one decimal: "40.0%" / "40,0%" (spec 2026-10-15-pos-sales-import-attach-rate, AC7). */
export const formatRate = (rate: number, locale: Locale = 'en') =>
  `${new Intl.NumberFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rate * 100)}%`;
