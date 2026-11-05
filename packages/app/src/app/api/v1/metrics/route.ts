import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handlePublic } from '@/server/api-auth';
import { env } from '@/server/env';
import { renderMetrics } from '@/server/metrics';

export const dynamic = 'force-dynamic';

/** Constant-time comparison: both sides are hashed first, so the length of the token is not leaked either. */
function sameSecret(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/**
 * GET /api/v1/metrics: process metrics in the Prometheus text format. 404 until METRICS_TOKEN is set (the endpoint
 * does not exist for an operator who did not ask for it), 401 without the right `Authorization: Bearer`.
 */
export async function GET(req: NextRequest) {
  return handlePublic(req, { route: '/api/v1/metrics' }, async () => {
    const token = env().metricsToken;
    if (!token) return apiError(404, 'not_found', 'Not found.');
    const given = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
    if (!sameSecret(given, token)) {
      const res = apiError(401, 'unauthenticated', 'A valid bearer token is required.');
      res.headers.set('WWW-Authenticate', 'Bearer');
      return res;
    }
    return new NextResponse(renderMetrics(), {
      headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  });
}
