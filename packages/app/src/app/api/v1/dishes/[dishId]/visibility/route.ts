import { dishVisibilitySchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchToken, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ dishId: string }> };

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/** GET /api/v1/dishes/{dishId}/visibility?restaurant={slug} → `{ status }`; the fingerprint is the `ETag` (what POST wants in `If-Match`). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { dishId: id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/dishes/{dishId}/visibility', write: false, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c }) => {
    if (!slug) return needRestaurant();
    const { status, version } = await c.catalogEditService.getDishVisibility(slug, id);
    return NextResponse.json({ id, status }, { headers: { ETag: `"${version}"` } });
  });
}

/**
 * POST /api/v1/dishes/{dishId}/visibility?restaurant={slug} `{ hidden: boolean }` — hide a published dish from guests or show a
 * hidden one again. `If-Match: "<fingerprint>"` is required (428 without it, 400 when malformed, 409 when the dish changed since).
 * A dish in draft, or one already in the wanted state, is 422 `status: transition`. It takes effect at once, without a publish;
 * showing a dish also adds the engine suggestions it missed while hidden (`suggestions`).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { dishId: id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/dishes/{dishId}/visibility', write: true, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c, actor }) => {
    if (!slug) return needRestaurant();
    const expectedVersion = ifMatchToken(req);
    if (expectedVersion === undefined) return apiError(428, 'precondition_required', 'Send the version you read in the If-Match header.');
    if (expectedVersion === null) return apiError(400, 'invalid_if_match', 'If-Match must be the version from the ETag header.');
    const { hidden } = await parseBody(req, dishVisibilitySchema);
    const result = await c.catalogEditService.setDishHidden(slug, id, hidden, actor, expectedVersion);
    return NextResponse.json({ id, status: result.status, suggestions: result.suggestions }, { headers: { ETag: `"${result.version}"` } });
  });
}
