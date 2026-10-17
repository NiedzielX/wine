import type { QueryInput } from './prefs';

/**
 * The anonymous guest session (spec 2026-10-15-guest-usage-events, R2): a random UUID carried in the `sid` URL
 * parameter of every guest link and form. No cookie, no browser storage, no script. A missing or malformed `sid`
 * starts a new session. The parameter name is a protected contract (BACKWARD_COMPATIBILITY.md §1).
 */
export const GUEST_SESSION_PARAM = 'sid';

/** Where a session began: the QR landing page, any other guest link, or the staff lookup (never a guest session). */
export type GuestSessionSource = 'qr' | 'link' | 'staff';

export interface GuestSessionRef {
  id: string;
  /** true when the request carried no valid `sid`: this page view opens the session */
  isNew: boolean;
  source: GuestSessionSource;
}

/** A canonical UUID v4 in lower case — the only form `sid` takes. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The session id from the query, or null when it is missing, repeated, upper case or anything else. */
export function parseSessionId(q: QueryInput): string | null {
  const v = q[GUEST_SESSION_PARAM];
  return typeof v === 'string' && SESSION_ID.test(v) ? v : null;
}

/**
 * Which path a view belongs to: `table` when it came from the table result (`table=`), `dish` when it names a
 * published dish (`dish=`), otherwise `direct`.
 */
export function usageContext(q: QueryInput, menu: { dishes: ReadonlyArray<{ id: string }> }): 'table' | 'dish' | 'direct' {
  if (typeof q.table === 'string' && q.table !== '') return 'table';
  if (typeof q.dish === 'string' && menu.dishes.some((d) => d.id === q.dish)) return 'dish';
  return 'direct';
}
