import { invitationSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { handle, parseBody } from '@/server/api-auth';
import { invitationJson, invitationLink } from '@/server/invitations';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };
const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** GET /api/v1/restaurants/{slug}/invitations — pending invitations (not accepted, not cancelled; expired ones say `expired`). Needs `team.manage`. Never a token or a link. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/invitations', write: false, slug, permission: 'team.manage' }, async ({ c, actor }) => {
    const invitations = await c.invitationService.list(slug, actor);
    const nowMs = c.clock.now().getTime();
    return NextResponse.json({ invitations: invitations.map((i) => invitationJson(i, nowMs)) }, { headers: NO_STORE });
  });
}

/**
 * POST /api/v1/restaurants/{slug}/invitations — body `{ email, role }`, role `owner`, `manager` or `sommelier` (a waiter has no
 * link). Needs `team.manage`; a manager may invite only a Wine Director. 201 with the invitation and its `link`: the only time the
 * link is shown, it is not stored. The answer is the same whether the e-mail has an account or not; a person already in the team
 * is `409 already_member`. A second invitation for the same e-mail replaces the first.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/invitations', write: true, slug, permission: 'team.manage' }, async ({ c, actor }) => {
    const input = await parseBody(req, invitationSchema);
    const issued = await c.invitationService.invite(slug, input, actor);
    return NextResponse.json({ ...invitationJson(issued.invitation, c.clock.now().getTime()), link: invitationLink(issued.token) }, { status: 201, headers: NO_STORE });
  });
}
