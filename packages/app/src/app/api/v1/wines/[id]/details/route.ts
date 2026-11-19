import { wineShapeSchema, type WineFields } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchToken, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/** The fields as the API names them: the glass switch is derived from the glass price. */
const json = (f: WineFields) => ({ ...f, pouredByGlass: f.glassPrice !== null });

/** GET /api/v1/wines/{id}/details?restaurant={slug} → the editable fields; the fingerprint is the `ETag` (what PATCH wants in `If-Match`). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/details', write: false, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c }) => {
    if (!slug) return needRestaurant();
    const { fields, version } = await c.catalogEditService.getWineFields(slug, id);
    return NextResponse.json(json(fields), { headers: { ETag: `"${version}"` } });
  });
}

/**
 * PATCH /api/v1/wines/{id}/details?restaurant={slug} — any of `producer`, `name`, `vintage` (a year or `NV`), `region`, `country`,
 * `tastingNote`, `listNumber` (a number or null), `bottlePrice`, `pouredByGlass`, `glassPrice` (at least one). A glass price needs
 * `pouredByGlass` (the stored state when it is left out) and costs less than the bottle. `If-Match: "<fingerprint>"` is required
 * (428 without it, 400 when malformed, 409 when the fields changed since). Availability (`PATCH /wines/{id}` `{active}`) is a
 * separate route. The change is live for guests at once; no field changes a Match Score.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/details', write: true, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c, actor }) => {
    if (!slug) return needRestaurant();
    const expectedVersion = ifMatchToken(req);
    if (expectedVersion === undefined) return apiError(428, 'precondition_required', 'Send the version you read in the If-Match header.');
    if (expectedVersion === null) return apiError(400, 'invalid_if_match', 'If-Match must be the version from the ETag header.');
    const body = await parseBody(req, wineShapeSchema);
    const result = await c.catalogEditService.updateWine(slug, id, body, actor, expectedVersion);
    return NextResponse.json({ changed: result.changed, ...json(result.fields) }, { headers: { ETag: `"${result.version}"` } });
  });
}
