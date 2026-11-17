import { wineProfileEditSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatchToken, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/** GET /api/v1/wines/{id}/profile?restaurant={slug} → {profile, version} and the fingerprint as `ETag` (what PUT wants in `If-Match`). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/profile', write: false, slug: slug || undefined, permission: 'profiles.edit' }, async ({ c }) => {
    if (!slug) return needRestaurant();
    const current = await c.profileService.getWineProfile(slug, id);
    return NextResponse.json(current, { headers: { ETag: `"${current.version}"` } });
  });
}

/**
 * PUT /api/v1/wines/{id}/profile?restaurant={slug} {profile, confirm} — `If-Match: "<fingerprint>"` is required
 * (428 without it, 409 when the profile changed since). `confirm: true` saves it as confirmed, `false` as a draft. Guests
 * see the change after the next publish; the match scores of pairings are not recalculated here.
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/profile', write: true, slug: slug || undefined, permission: 'profiles.edit' }, async ({ c, actor }) => {
    if (!slug) return needRestaurant();
    const expectedVersion = ifMatchToken(req);
    if (expectedVersion === undefined) return apiError(428, 'precondition_required', 'Send the profile version you read in the If-Match header.');
    if (expectedVersion === null) return apiError(400, 'invalid_if_match', 'If-Match must be the profile version from the ETag header.');
    const body = await parseBody(req, wineProfileEditSchema);
    const result = await c.profileService.setWineProfile(slug, id, body.profile, actor, { confirm: body.confirm, expectedVersion });
    const current = await c.profileService.getWineProfile(slug, id);
    return NextResponse.json({ changed: result.changed, ...current }, { headers: { ETag: `"${current.version}"` } });
  });
}
