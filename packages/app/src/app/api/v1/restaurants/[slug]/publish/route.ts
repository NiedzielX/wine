import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/restaurants/{slug}/publish → 201 {versionId, number, changesCount, publishedAt}. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { write: true, slug, permission: 'publish' }, async ({ c, actor }) => {
    const v = await c.publishService.publish(slug, actor);
    return NextResponse.json({ versionId: v.id, number: v.number, changesCount: v.changesCount, publishedBy: v.publishedBy, publishedAt: v.publishedAt }, { status: 201 });
  });
}
