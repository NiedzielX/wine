/**
 * The dashboard language cookie (spec 2026-10-15-polish-language, R4). No imports on purpose: `src/proxy.ts`
 * reads the name, the `setLanguage` server action writes the cookie. Guests never get it: its path is `/admin`
 * and the proxy reads it only there.
 */
export const LANG_COOKIE = 'wm_lang';

/** One year, in seconds. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** SameSite=Lax, Secure like the session cookie, scoped to the dashboard. It holds only `pl` or `en`. */
export function langCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure, path: '/admin', maxAge: LANG_COOKIE_MAX_AGE };
}
