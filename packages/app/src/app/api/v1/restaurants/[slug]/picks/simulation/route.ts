import { parseWith, simulationQueryFromSearch, simulationQuerySchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/restaurants/{slug}/picks/simulation?picks=id,id&dish={dishId} (spec 2026-11-18-restaurant-picks, R13,
 * R16): the "before / after" lists of every visible dish (or of one) for the working set of picks, or for the set in
 * `picks` (at most 5 ids; present but empty = no picks). A read: nothing is written. "Before" is what guests see now,
 * "after" what they would see after the publish; only the picks differ between the two. An id that is not one of the
 * restaurant's wines is answered like an id that does not exist (reason `not_in_list`). Any member with dashboard access.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/picks/simulation', write: false, slug, permission: 'panel.view' }, async ({ c }) => {
    const q = parseWith(simulationQuerySchema, simulationQueryFromSearch((k) => req.nextUrl.searchParams.getAll(k)), 'Check the simulation parameters.');
    const result = await c.picksSimulationService.simulate(slug, { picks: q.picks, dishId: q.dish });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  });
}
