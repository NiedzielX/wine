import { pickSetSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchToken, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/wines/{id}/pick?restaurant={slug} {on: boolean, expectedVersion?: string} (spec 2026-11-18-restaurant-picks,
 * R2, R16): mark (`on: true`) or unmark one of the restaurant's wines as a pick. Owner and general manager only
 * (`picks.edit`). The version of the set you read (`ETag` of `GET …/picks`) is required: in `If-Match`, or as
 * `expectedVersion` in the body (428 without either, 409 `version_conflict` when the set changed since). 422 `too_many_picks`
 * past 5 and `wine_inactive` for a wine that is switched off. Idempotent (`changed: false`). Another restaurant's wine, an
 * unknown one and an id that is not a UUID are all the same 404. Guests see the change after the next publish.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/pick', write: true, slug: slug || undefined, permission: 'picks.edit' }, async ({ c, actor }) => {
    if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
    const header = ifMatchToken(req);
    if (header === null) return apiError(400, 'invalid_if_match', 'If-Match must be the picks version from the ETag header.');
    const body = await parseBody(req, pickSetSchema);
    const expectedVersion = header ?? body.expectedVersion;
    if (expectedVersion === undefined) return apiError(428, 'precondition_required', 'Send the picks version you read in the If-Match header.');
    const result = await c.picksService.set(slug, id, body.on, actor, { expectedVersion });
    const state = await c.picksService.list(slug);
    return NextResponse.json({ changed: result.changed, version: state.version, max: state.max, count: state.picks.length }, { headers: { ETag: `"${state.version}"` } });
  });
}
