/**
 * Set by the proxy on a router prefetch request (spec 2026-10-15-guest-usage-events, R6). Next.js hides its own router
 * headers (`Next-Router-Prefetch`, `RSC`, …) from `headers()` in server components, so the proxy, which still sees
 * them, passes the fact on in this header. Its own module: the proxy must not load the server-only usage code.
 */
export const PREFETCH_HEADER = 'x-wine-prefetch';
