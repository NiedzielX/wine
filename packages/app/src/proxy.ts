import { isLocale, pickLocale, type Locale } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE } from './server/lang-cookie';
import { PREFETCH_HEADER } from './server/prefetch';

/** Dashboard language cookie (spec 2026-10-15-polish-language R4); read only for `/admin`, never on guest pages. */
export { LANG_COOKIE };

/**
 * The interface language: `?lang` wins; on the dashboard the `wm_lang` cookie comes next; then the browser's
 * `Accept-Language`; English when nothing matches. Guest pages never read a cookie (no cookies for guests).
 */
export function requestLocale(req: NextRequest): Locale {
  const fromUrl = req.nextUrl.searchParams.get('lang');
  if (isLocale(fromUrl)) return fromUrl;
  if (req.nextUrl.pathname.startsWith('/admin')) {
    const fromCookie = req.cookies.get(LANG_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;
  }
  return pickLocale(req.headers.get('accept-language'));
}

/**
 * 1. Passes the requested path to the dashboard layout, which cannot see it by itself. After sign-in the
 *    user returns to the page they asked for, not to the dashboard root. `safeNext()` validates it before use.
 * 2. Passes the interface language to guest and dashboard pages in `x-wine-lang`.
 * Both headers are always overwritten here, so a client cannot send its own.
 * No `Vary: Accept-Language` (spec R12): Next.js 16 replaces the Vary header of every app page with its own
 * (`app-page-runtime`: `res.setHeader('Vary', …)`), from the proxy and from `next.config` alike. The pages are
 * `force-dynamic` and answered `Cache-Control: private, no-store`, so no shared cache keeps one language for another.
 * (This is not an access check: the layout, the server actions and the API routes each check the session.)
 */
export function proxy(req: NextRequest) {
  const admin = req.nextUrl.pathname.startsWith('/admin');
  const headers = new Headers(req.headers);
  if (admin) headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  else headers.delete('x-pathname');
  headers.set('x-wine-lang', requestLocale(req));
  // 3. Marks router prefetches for the usage events (spec 2026-10-15-guest-usage-events, R6): server components cannot
  //    see Next.js's own `Next-Router-Prefetch` headers, which `headers()` hides.
  if (req.headers.has('next-router-prefetch') || req.headers.has('next-router-segment-prefetch')) headers.set(PREFETCH_HEADER, '1');
  else headers.delete(PREFETCH_HEADER);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/admin/:path*', '/r/:path*'] };
