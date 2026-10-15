import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** GET /api/v1/auth/me → the signed-in user, their restaurants and roles, and the CSRF token for changes. */
export async function GET(req: NextRequest) {
  return handle(req, { write: false }, async ({ principal }) =>
    NextResponse.json({ user: principal.user, memberships: principal.memberships, csrfToken: principal.session.csrfToken, expiresAt: principal.session.expiresAt }));
}
