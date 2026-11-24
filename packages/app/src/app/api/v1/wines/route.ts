import { wineCreateSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/wines?restaurant={slug} — add one wine: `producer`, `name`, `vintage` (a year from 1900 to next year, or `"NV"`),
 * `bottlePrice` and `style` (`sparkling` | `white` | `rose` | `orange` | `red` | `sweet`) are required; optional `region`,
 * `country`, `tastingNote`, `listNumber` (1–9999, unique; empty = the next free number), `pouredByGlass` with `glassPrice`
 * (below the bottle), `grape`. `style` and `grape` only prepare the draft taste profile. The wine is active, has a draft profile
 * and engine suggestions, and guests see it after the next publish. A taken key `producer|name|vintage` is 422 `name: duplicate`.
 * 201 with `Location` (its details) and the `ETag` of its fields.
 */
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/wines', write: true, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c, actor }) => {
    if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
    const body = await parseBody(req, wineCreateSchema);
    const made = await c.catalogEditService.createWine(slug, body, actor);
    return NextResponse.json({ id: made.id, listNumber: made.listNumber, suggestions: made.suggestions }, {
      status: 201, headers: { Location: `/api/v1/wines/${made.id}/details?restaurant=${encodeURIComponent(slug)}`, ETag: `"${made.version}"` }
    });
  });
}
