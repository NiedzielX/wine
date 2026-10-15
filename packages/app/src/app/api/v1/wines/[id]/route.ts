import { wineAvailabilitySchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** PATCH /api/v1/wines/{id}?restaurant={slug} {active: boolean} — hide or show a wine; guests see it at once. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
  return handle(req, { write: true, slug, permission: 'wines.toggle' }, async ({ c }) => {
    const { active } = await parseBody(req, wineAvailabilitySchema);
    const wine = await c.sommelierService.setWineActive(slug, id, active);
    return NextResponse.json({ id: wine.id, active: wine.active });
  });
}
