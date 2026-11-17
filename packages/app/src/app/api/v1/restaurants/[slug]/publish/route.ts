import { publishSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/restaurants/{slug}/publish → 201 {versionId, number, changesCount, publishedAt}. Optional body
 * `{expectedLatest}` (spec 2026-11-04-panel-completion, R12): the latest version number the caller saw; another one is
 * 409 `version_conflict`. An empty body publishes as before.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/publish', write: true, slug, permission: 'publish' }, async ({ c, actor }) => {
    const { expectedLatest } = await parseBody(req, publishSchema, { optional: true });
    const v = await c.publishService.publish(slug, actor, { expectedLatest });
    return NextResponse.json({ versionId: v.id, number: v.number, changesCount: v.changesCount, publishedBy: v.publishedBy, publishedAt: v.publishedAt }, { status: 201 });
  });
}
