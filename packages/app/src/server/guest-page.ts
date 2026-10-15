import { parseGuestPrefs, prefsToQuery, toQueryString, type GuestPreferences, type QueryInput } from '@wine-match/core';
import { notFound } from 'next/navigation';
import { getRequestScope } from './request-scope';

/** Shared helpers of the guest pages: request scope, preferences from the URL, link building. */
export type SearchParams = Promise<QueryInput>;

export async function guestContext(searchParams: SearchParams) {
  const q = await searchParams;
  const scope = await getRequestScope();
  return { q, prefs: parseGuestPrefs(q), services: scope.cradle };
}

/** `path` + the given preferences (+ extra parameters) as a link. */
export function hrefWith(path: string, prefs: GuestPreferences, extra: Record<string, string | undefined> = {}): string {
  return `${path}${toQueryString({ ...extra, ...prefsToQuery(prefs) })}`;
}

export { notFound };

export const CATEGORIES = ['Starters', 'Mains', 'Desserts'] as const;
