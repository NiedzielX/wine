import { loginSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handlePublic, parseBody } from '@/server/api-auth';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/login {email, password} → 200 {user, memberships, csrfToken} + session cookie. */
export async function POST(req: NextRequest) {
  return handlePublic(req, { write: true }, async ({ c }) => {
    const { email, password } = await parseBody(req, loginSchema);
    const { token, principal } = await c.authService.login(email, password);
    const res = NextResponse.json({ user: principal.user, memberships: principal.memberships, csrfToken: principal.session.csrfToken, expiresAt: principal.session.expiresAt });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(principal.session.expiresAt)));
    return res;
  });
}
