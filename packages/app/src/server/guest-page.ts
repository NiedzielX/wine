import {
  DEFAULT_PREFS, GUEST_SESSION_PARAM, isLocale, parseGuestPrefs, prefsToQuery, toQueryString,
  type GuestPreferences, type GuestSessionSource, type Locale, type QueryInput
} from '@wine-match/core';
import { notFound } from 'next/navigation';
import { getDictionary, getLocale } from './i18n';
import { getRequestScope } from './request-scope';

/** Shared helpers of the guest pages: request scope, preferences, language and session from the URL, link building. */
export type SearchParams = Promise<QueryInput>;

/**
 * What every guest link carries besides the preferences. `lang` only when the guest chose it in the URL: a
 * language that came from the browser is not written into links (spec 2026-10-15-polish-language R3).
 * `sid` is the anonymous session (spec 2026-10-15-guest-usage-events, R3): every guest link carries it, last.
 */
export interface GuestLinkState {
  lang?: Locale;
  sid?: string;
}

/**
 * Everything a guest page needs from its URL. `source` says where a new session begins: `qr` on the landing page (G0),
 * `staff` on the staff lookup (G9, never a guest session), `link` everywhere else (Q8).
 */
export async function guestContext(searchParams: SearchParams, { source = 'link' }: { source?: GuestSessionSource } = {}) {
  const q = await searchParams;
  const scope = await getRequestScope();
  const locale = await getLocale();
  const lang = typeof q.lang === 'string' && isLocale(q.lang) ? q.lang : undefined;
  const prefs = parseGuestPrefs(q);
  const services = scope.cradle;
  const session = services.usageEventService.session(q, source);
  const state: GuestLinkState = { lang, sid: session.id };
  return {
    q, prefs, services, locale, lang, session, t: getDictionary(locale),
    /** `hrefWith` bound to this request's link state (`lang`, `sid`): every guest link goes through it */
    href: (path: string, p: GuestPreferences = DEFAULT_PREFS, extra: Record<string, string | undefined> = {}) => hrefWith(path, p, extra, state),
    /** the targets of the language switch on the page at `path`, in the same session */
    langHrefs: (path: string): Record<Locale, string> => ({ pl: langHref(path, q, 'pl', session.id), en: langHref(path, q, 'en', session.id) })
  };
}

/**
 * `path` + extra parameters + the given preferences + the link state, as a link. The one place that builds
 * guest links, in a fixed parameter order (extra, preferences, `lang`, `sid`).
 */
export function hrefWith(path: string, prefs: GuestPreferences, extra: Record<string, string | undefined> = {}, state: GuestLinkState = {}): string {
  return `${path}${toQueryString({ ...extra, ...prefsToQuery(prefs), lang: state.lang, [GUEST_SESSION_PARAM]: state.sid })}`;
}

/**
 * The same page in another language (the language switch): the current query unchanged, `lang` replaced, and the
 * session (`sid`) of this request at the end — also when the request came without one. Repeated parameters
 * (`dish=a&dish=b`) are kept as they came.
 */
export function langHref(path: string, q: QueryInput, lang: Locale, sid?: string): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (k === 'lang' || k === GUEST_SESSION_PARAM || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(one)}`);
  }
  parts.push(`lang=${lang}`);
  if (sid) parts.push(`${GUEST_SESSION_PARAM}=${encodeURIComponent(sid)}`);
  return `${path}?${parts.join('&')}`;
}

export { notFound };

export const CATEGORIES = ['Starters', 'Mains', 'Desserts'] as const;

/** The dishes in the order the menu shows them (by section, then as listed): the order a table form submits. */
export const inMenuOrder = <D extends { category: string }>(dishes: D[]): D[] => CATEGORIES.flatMap((c) => dishes.filter((d) => d.category === c));
