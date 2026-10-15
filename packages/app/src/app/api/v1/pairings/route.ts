import { pairingCreateSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, pairingJson, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/pairings?restaurant={slug} {dishId, wineId, role?, comment?} → 201, the sommelier's own pairing. */
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
  return handle(req, { write: true, slug, permission: 'pairings.decide' }, async ({ c, actor }) => {
    const input = await parseBody(req, pairingCreateSchema);
    await c.sommelierService.addManual(slug, input, actor);
    // the pairing was just stored, so it is in the list
    const created = (await c.adminService.listPairings(slug, { dishId: input.dishId }))!.pairings.find((p) => p.wineId === input.wineId)!;
    return NextResponse.json(pairingJson(created), { status: 201 });
  });
}
