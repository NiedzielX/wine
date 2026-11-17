import { wineProfileFromQuery } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/**
 * GET /api/v1/wines/{id}/profile/preview?restaurant={slug}&<scales> — how the Match Score would change with
 * these scales (same service as the dashboard's preview without JavaScript). Writes nothing.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const params = req.nextUrl.searchParams;
  const slug = params.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines/{id}/profile/preview', write: false, slug: slug || undefined, permission: 'profiles.edit' }, async ({ c }) => {
    if (!slug) return needRestaurant();
    const preview = await c.profilePreviewService.previewWine(slug, id, wineProfileFromQuery((k) => params.get(k)));
    return NextResponse.json(preview);
  });
}
