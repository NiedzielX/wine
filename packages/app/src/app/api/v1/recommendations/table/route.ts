import { ENGINE_VERSION, parseGuestPrefs, tableRecommendationSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, publicWine } from '@/server/api';
import { handlePublic, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/recommendations/table
 * Body: { restaurantSlug, dishIds: string[], preferences?: { serving, styles, maxPrice, weight, mood } }
 * Best bottle for the whole table (docs/API_SPECIFICATION.md).
 */
export async function POST(req: NextRequest) {
  return handlePublic(req, {}, async ({ c }) => {
    const body = await parseBody(req, tableRecommendationSchema);
    // the same normalisation as the guest pages, so styles may be a list or a comma-separated string
    const p = body.preferences ?? {};
    const prefs = parseGuestPrefs({
      serving: p.serving,
      styles: Array.isArray(p.styles) ? p.styles.join(',') : p.styles,
      maxPrice: p.maxPrice === null || p.maxPrice === undefined ? undefined : String(p.maxPrice),
      weight: p.weight,
      mood: p.mood
    });
    const out = await c.recommendationService.forTable(body.restaurantSlug, [...new Set(body.dishIds)], prefs);
    if (!out) return apiError(404, 'not_found', 'Restaurant not found.');
    const { result } = out;
    return NextResponse.json({
      engineVersion: ENGINE_VERSION,
      items: result.items.map((i) => ({
        wine: publicWine(i.wine), overall: i.overall, price: i.price, serving: i.serving, why: i.why,
        perDish: i.perDish.map((d) => ({ dishId: d.dish.id, score: d.score, sommelierPick: d.sommelierPick }))
      })),
      setAside: result.setAside.map((d) => d.id),
      splitSuggested: result.splitSuggested,
      split: result.split.map((s) => ({ dishId: s.dish.id, wine: publicWine(s.wine), score: s.score }))
    });
  });
}
