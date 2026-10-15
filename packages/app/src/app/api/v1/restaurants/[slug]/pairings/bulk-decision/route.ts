import { bulkDecisionSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/restaurants/{slug}/pairings/bulk-decision {dishId?, action: "approve_all"} → {approved}. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { write: true, slug, permission: 'pairings.decide' }, async ({ c, actor }) => {
    const { dishId } = await parseBody(req, bulkDecisionSchema);
    return NextResponse.json({ approved: await c.sommelierService.approveAll(slug, actor, dishId) });
  });
}
