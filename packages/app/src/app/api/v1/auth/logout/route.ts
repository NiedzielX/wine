import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';
import { SESSION_COOKIE } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/logout → 204; ends the session and clears the cookie. */
export async function POST(req: NextRequest) {
  return handle(req, { write: true }, async ({ c }) => {
    // handle() has already refused a request without a session cookie
    await c.authService.logout(req.cookies.get(SESSION_COOKIE)!.value);
    const res = new NextResponse(null, { status: 204 });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  });
}
