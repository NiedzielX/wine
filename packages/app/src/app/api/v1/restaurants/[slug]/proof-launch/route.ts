import { launchDayRequestSchema, membershipFor } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchEntry, parseBody } from '@/server/api-auth';
import { launchEntryJson } from '@/server/proof-json';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/restaurants/{slug}/proof-launch {launchDay, reason?, expectedCurrent?} (spec 2026-11-18-owner-proof-report,
 * R5, R11): appends an entry to the launch day log (201), never edits one: the baseline of the results report stays fixed.
 * `reason` is required from the second entry. The id of the current entry you read (`ETag` of `GET …/proof-report`, or `none`)
 * is required: in `If-Match`, or as `expectedCurrent` in the body (`null` = no entry yet): 428 without either, 400 for a
 * malformed `If-Match`, 422 when both are sent and differ, 409 `version_conflict` when the log changed since. 422
 * `invalid_launch_day` (bad format, before 2020-01-01, after today's service day) and `reason_required`. Needs `proof.manage`
 * (owner and general manager); the session carries no membership id, so the entry stores the role only; the restaurant is the slug in the path, never a field of the body (`strictObject`).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/proof-launch', write: true, slug, permission: 'proof.manage' }, async ({ c, principal }) => {
    const header = ifMatchEntry(req);
    if (header === 'invalid') return apiError(400, 'invalid_if_match', 'If-Match must be the id of the launch day entry from the ETag header, or "none".');
    const body = await parseBody(req, launchDayRequestSchema);
    if (header !== undefined && body.expectedCurrent !== undefined && header !== body.expectedCurrent) {
      return apiError(422, 'validation_failed', 'If-Match and expectedCurrent differ.', { expectedCurrent: 'differs_from_if_match' });
    }
    const expectedCurrent = header !== undefined ? header : body.expectedCurrent;
    if (expectedCurrent === undefined) return apiError(428, 'precondition_required', 'Send the launch day entry you read in the If-Match header.');
    const m = membershipFor(principal, slug)!;
    const entry = await c.proofReportService.setLaunchDay(slug, { ...body, expectedCurrent }, { role: m.role, membershipId: null });
    return NextResponse.json(launchEntryJson(entry), { status: 201, headers: { 'Cache-Control': 'private, no-store', ETag: `"${entry.id}"` } });
  });
}
