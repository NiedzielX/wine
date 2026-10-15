import { ENGINE_VERSION, parseGuestPrefs } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, PUBLIC_CACHE } from '@/server/api';
import { handlePublic } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** Most wines one answer may list (the guest screens show four). */
const MAX_LIMIT = 6;

/**
 * GET /api/v1/dishes/{dishId}/recommendations?restaurant={slug}&serving=&styles=&maxPrice=&weight=&mood=&limit=
 * Public endpoint (docs/API_SPECIFICATION.md). `restaurant` is required: every query is tenant-scoped.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ dishId: string }> }) {
  const { dishId } = await ctx.params;
  return handlePublic(req, {}, async ({ c }) => {
    const q = req.nextUrl.searchParams;
    const slug = q.get('restaurant');
    if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get('limit') ?? 4) || 4));
    const data = await c.recommendationService.forDish(slug, dishId, parseGuestPrefs(Object.fromEntries(q)), limit);
    if (!data) return apiError(404, 'not_found', 'Restaurant or published dish not found.');
    const { restaurant, dish, result } = data;
    return NextResponse.json({
      dishId: dish.id,
      engineVersion: ENGINE_VERSION,
      notice: result.notice,
      items: result.items.map((i) => ({
        wine: {
          id: i.wine.id, producer: i.wine.producer, name: i.wine.name, vintage: i.wine.vintage, region: i.wine.region,
          colour: i.wine.colour, glassPrice: i.wine.glassPrice, glassPourMl: i.wine.glassPour, bottlePrice: i.wine.bottlePrice
        },
        matchScore: i.matchScore,
        tier: i.tier === 0 ? 'sommelier_primary' : i.tier === 1 ? 'sommelier' : 'engine',
        sommelier: i.sommelier ? { role: i.sommelier.role, name: restaurant.wineDirector } : null,
        bestValue: i.bestValue,
        why: i.why
      }))
    }, { headers: PUBLIC_CACHE });
  });
}
