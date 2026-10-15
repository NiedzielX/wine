import { NextResponse, type NextRequest } from 'next/server';
import { apiError, PUBLIC_CACHE } from '@/server/api';
import { handlePublic } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['Starters', 'Mains', 'Desserts'];

/** GET /api/v1/public/restaurants/{slug}/menu — published dishes grouped by category. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handlePublic(req, {}, async ({ c }) => {
    const menu = await c.catalogService.publishedMenu(slug);
    if (!menu) return apiError(404, 'not_found', 'Restaurant not found.');
    const coverage = await c.catalogService.pairingCoverage(menu.restaurant.id);
    const names = [...CATEGORIES, ...new Set(menu.dishes.map((d) => d.category))].filter((name, i, all) => all.indexOf(name) === i);
    return NextResponse.json({
      restaurant: { slug: menu.restaurant.slug, name: menu.restaurant.name },
      categories: names
        .map((name) => ({
          name,
          dishes: menu.dishes.filter((d) => d.category === name).map((d) => ({
            id: d.id, name: d.name, description: d.description, price: d.price, hasSommelierPairing: coverage.get(d.id)?.hasPrimary ?? false
          }))
        }))
        .filter((category) => category.dishes.length > 0)
    }, { headers: PUBLIC_CACHE });
  });
}
