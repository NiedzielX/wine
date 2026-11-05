import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
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
 *
 * Deliberately NOT behind `handlePublic`: no request scope, so no container and no database. The scrape must work
 * while the database is down (the moment metrics matter), and an unauthenticated caller or a disabled endpoint must
 * not cost a DB-backed scope. For the same reason a scrape is not logged and not counted in `http_requests_total`:
 * it would add 2xx/4xx noise to the error ratio that the 5xx alert divides by.
 */
export async function GET(req: NextRequest) {
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
}
