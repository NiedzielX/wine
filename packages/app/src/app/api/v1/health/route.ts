import { NextResponse, type NextRequest } from 'next/server';
import { handleUnscoped } from '@/server/api-auth';
import { checkHealth } from '@/server/health';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/health: 200 when the process can serve and (DATA_SOURCE=postgres) the database answers `select 1` within 2 s,
 * otherwise 503. Public, no session, never cached. The body names no host, password or error (see server/health.ts).
 * The image HEALTHCHECK (a later phase) treats ANY HTTP answer as alive; a load balancer routes traffic only on 200.
 */
export async function GET(req: NextRequest) {
  return handleUnscoped(req, { route: '/api/v1/health' }, async () => {
    const report = await checkHealth();
    return NextResponse.json(report, { status: report.status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  });
}
