import { NextResponse, type NextRequest } from 'next/server';
import { handle, teamMemberJson } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/restaurants/{slug}/team — everyone with a membership here, active or deactivated (needs `team.manage`).
 * Each member carries the `version` to send back in `If-Match`.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/team', write: false, slug, permission: 'team.manage' }, async ({ c, actor }) => {
    const members = await c.teamService.list(slug, actor);
    return NextResponse.json({ members: members.map(teamMemberJson) });
  });
}
