import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, pairingJson } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

const STATUSES = ['suggested', 'approved', 'modified', 'rejected'] as const;

/** GET /api/v1/restaurants/{slug}/pairings?dishId=&status= — current pairings, including unpublished changes. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { write: false, slug, permission: 'panel.view' }, async ({ c }) => {
    const q = req.nextUrl.searchParams;
    const status = q.get('status');
    if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) return apiError(422, 'validation_failed', 'Unknown status.', { status: 'invalid' });
    // the permission check above has already found the restaurant: a membership cannot point at a missing one
    const out = (await c.adminService.listPairings(slug, { dishId: q.get('dishId') ?? undefined, status: (status as (typeof STATUSES)[number]) ?? undefined }))!;
    return NextResponse.json({ data: out.pairings.map(pairingJson) });
  });
}
