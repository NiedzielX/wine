import { DEFAULT_LOCALE, isLocale, type Locale } from '@wine-match/core';
import { headers } from 'next/headers';
import { en, type Dictionary } from '@/i18n/en';
import { pl } from '@/i18n/pl';

/**
 * Interface language of the current request (spec 2026-10-15-polish-language). `src/proxy.ts` decides it
 * (`?lang`, then the browser's `Accept-Language`) and always overwrites the `x-wine-lang` header, so a client
 * cannot send its own value past the proxy; anything unexpected falls back to English.
 */
export const LANG_HEADER = 'x-wine-lang';

export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get(LANG_HEADER);
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

const DICTIONARIES: Record<Locale, Dictionary> = { en, pl };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** The request's language with its texts, for a page or a layout. */
export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}

const NUMBER_FORMATS: Record<Locale, Intl.NumberFormat> = {
  // Polish groups thousands only from five digits by default; prices group from four ("1 234 zł")
  pl: new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2, useGrouping: 'always' }),
  en: new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 })
};

/** A price in złoty: "1 234 zł" in Polish (non-breaking spaces), "1,234 zł" in English. */
export function formatPrice(amount: number, locale: Locale): string {
  const n = NUMBER_FORMATS[locale].format(amount);
  return locale === 'pl' ? `${n.replace(/\s/g, ' ')} zł` : `${n} zł`;
}
