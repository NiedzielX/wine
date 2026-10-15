import {
  DEFAULT_PREFS, isLocale, parseGuestPrefs, prefsToQuery, toQueryString,
  type GuestPreferences, type Locale, type QueryInput
} from '@wine-match/core';
import { notFound } from 'next/navigation';
import { getDictionary, getLocale } from './i18n';
import { getRequestScope } from './request-scope';

/** Shared helpers of the guest pages: request scope, preferences and language from the URL, link building. */
export type SearchParams = Promise<QueryInput>;

/**
 * What every guest link carries besides the preferences. `lang` only when the guest chose it in the URL: a
 * language that came from the browser is not written into links (spec 2026-10-15-polish-language R3).
 * E02 adds the anonymous `sid` here.
 */
export interface GuestLinkState {
  lang?: Locale;
}

export async function guestContext(searchParams: SearchParams) {
  const q = await searchParams;
  const scope = await getRequestScope();
  const locale = await getLocale();
  const lang = typeof q.lang === 'string' && isLocale(q.lang) ? q.lang : undefined;
  const prefs = parseGuestPrefs(q);
  const state: GuestLinkState = { lang };
  return {
    q, prefs, services: scope.cradle, locale, lang, t: getDictionary(locale),
    /** `hrefWith` bound to this request's link state: every guest link goes through it */
    href: (path: string, p: GuestPreferences = DEFAULT_PREFS, extra: Record<string, string | undefined> = {}) => hrefWith(path, p, extra, state),
    /** the targets of the language switch on the page at `path` */
    langHrefs: (path: string): Record<Locale, string> => ({ pl: langHref(path, q, 'pl'), en: langHref(path, q, 'en') })
  };
}

/**
 * `path` + extra parameters + the given preferences + the link state, as a link. The one place that builds
 * guest links, in a fixed parameter order (extra, preferences, `lang`).
 */
export function hrefWith(path: string, prefs: GuestPreferences, extra: Record<string, string | undefined> = {}, state: GuestLinkState = {}): string {
  return `${path}${toQueryString({ ...extra, ...prefsToQuery(prefs), lang: state.lang })}`;
}

/**
 * The same page in another language (the language switch): the current query unchanged, `lang` replaced.
 * Repeated parameters (`dish=a&dish=b`) are kept as they came.
 */
export function langHref(path: string, q: QueryInput, lang: Locale): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === 'lang' || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(one)}`);
  }
  parts.push(`lang=${lang}`);
  return `${path}?${parts.join('&')}`;
}

export { notFound };

export const CATEGORIES = ['Starters', 'Mains', 'Desserts'] as const;
