import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';
import { proofReportJson } from '@/server/proof-json';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/restaurants/{slug}/proof-report?window=N (spec 2026-11-18-owner-proof-report, R11): the results report of one
 * 28-day window against the fixed baseline, with uncertainty and reasons for "not enough data" (full precision, the screen
 * rounds). `window` is a whole number 1 to 12; absent = the newest complete window; anything else, or a window that has not
 * started, is 422 `invalid_window`. Needs `proof.view` (owner and general manager; the Wine Director and the waiter get 403).
 * Only aggregates of the restaurant: no check id, code, session id or POS text. The `ETag` is the id of the current launch
 * day entry (`"none"` without one): what `POST …/proof-launch` takes in `If-Match`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/proof-report', write: false, slug, permission: 'proof.view' }, async ({ c }) => {
    const result = await c.proofReportService.getReport(slug, req.nextUrl.searchParams.get('window') ?? undefined);
    return NextResponse.json(proofReportJson(result), { headers: { 'Cache-Control': 'private, no-store', ETag: `"${result.launch.current?.id ?? 'none'}"` } });
  });
}
