import type { PickEntry } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/restaurants/{slug}/picks → {version, max, picks: [{wineId, producer, name, vintage, active, published,
 * setAt, setBy}]} (spec 2026-11-18-restaurant-picks, R16): the restaurant's working set of picks, including what is not
 * published yet. The fingerprint is also the `ETag`, what `PUT /wines/{id}/pick` takes in `If-Match`. Any member with
 * dashboard access reads it (the Wine Director too); how the picks would change the lists is in `…/picks/simulation`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/picks', write: false, slug, permission: 'panel.view' }, async ({ c }) => {
    const state = await c.picksService.list(slug);
    return NextResponse.json(
      { version: state.version, max: state.max, picks: state.picks.map(pickJson) },
      { headers: { ETag: `"${state.version}"` } }
    );
  });
}

/** The JSON shape of a pick in the API: the wine and who marked it when; never an internal id of the pick's row. */
function pickJson(p: PickEntry) {
  return { wineId: p.wineId, producer: p.producer, name: p.name, vintage: p.vintage, active: p.active, published: p.published, setAt: p.setAt, setBy: p.setBy };
}
