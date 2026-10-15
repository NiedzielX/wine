import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes the requested path to the dashboard layout, which cannot see it by itself. After sign-in the
 * user returns to the page they asked for, not to the dashboard root. The header is always overwritten
 * here, so a client cannot send its own; `safeNext()` validates it before it is ever used.
 * (This is not an access check: the layout, the server actions and the API routes each check the session.)
 */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/admin/:path*'] };
