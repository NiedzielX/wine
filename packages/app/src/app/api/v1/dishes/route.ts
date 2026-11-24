import { dishCreateSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/dishes?restaurant={slug} — add one dish: `name`, `category` (`Starters` | `Mains` | `Desserts`) and `price` are
 * required, `description` is optional (`strictObject`: `status`, `profile` and the like are 422 `unknown_field`). The dish is a
 * `draft` with the engine's draft taste profile and suggestions; guests see it after the next publish. A name that exists
 * (any status) is 422 `name: duplicate`. 201 with `Location` (its details) and the `ETag` of its fields.
 */
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  return handle(req, { route: '/api/v1/dishes', write: true, slug: slug || undefined, permission: 'catalog.edit' }, async ({ c, actor }) => {
    if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
    const body = await parseBody(req, dishCreateSchema);
    const made = await c.catalogEditService.createDish(slug, body, actor);
    return NextResponse.json({ id: made.id, status: 'draft', suggestions: made.suggestions }, {
      status: 201, headers: { Location: `/api/v1/dishes/${made.id}/details?restaurant=${encodeURIComponent(slug)}`, ETag: `"${made.version}"` }
    });
  });
}
