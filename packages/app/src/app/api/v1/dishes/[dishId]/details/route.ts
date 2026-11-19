import { dishShapeSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchToken, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ dishId: string }> };

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/** GET /api/v1/dishes/{dishId}/details?restaurant={slug} → the editable fields; the fingerprint is the `ETag` (what PATCH wants in `If-Match`). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { dishId: id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/dishes/{dishId}/details', write: false, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c }) => {
    if (!slug) return needRestaurant();
    const { fields, version } = await c.catalogEditService.getDishFields(slug, id);
    return NextResponse.json(fields, { headers: { ETag: `"${version}"` } });
  });
}

/**
 * PATCH /api/v1/dishes/{dishId}/details?restaurant={slug} — any of `name`, `description`, `category`, `price` (at least one).
 * `If-Match: "<fingerprint>"` is required (428 without it, 400 when malformed, 409 when the fields changed since). The
 * answer is every editable field with the new `ETag`. The change is live for guests at once; translations and the taste
 * profile are not touched, and no field changes a Match Score.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { dishId: id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/dishes/{dishId}/details', write: true, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c, actor }) => {
    if (!slug) return needRestaurant();
    const expectedVersion = ifMatchToken(req);
    if (expectedVersion === undefined) return apiError(428, 'precondition_required', 'Send the version you read in the If-Match header.');
    if (expectedVersion === null) return apiError(400, 'invalid_if_match', 'If-Match must be the version from the ETag header.');
    const body = await parseBody(req, dishShapeSchema);
    const result = await c.catalogEditService.updateDish(slug, id, body, actor, expectedVersion);
    return NextResponse.json({ changed: result.changed, ...result.fields }, { headers: { ETag: `"${result.version}"` } });
  });
}
