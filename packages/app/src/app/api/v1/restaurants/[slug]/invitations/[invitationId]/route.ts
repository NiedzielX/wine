import { NextResponse, type NextRequest } from 'next/server';
import { handle } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string; invitationId: string }> };

/**
 * DELETE /api/v1/restaurants/{slug}/invitations/{invitationId} — cancels a pending invitation: its link stops working at once.
 * Needs `team.manage` and the right to invite that role (a manager cannot cancel an owner's or a manager's invitation).
 * 404 for one that is unknown, of another restaurant, already used or already cancelled. 204 without a body.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { slug, invitationId } = await ctx.params;
  return handle(req, { route: '/api/v1/restaurants/{slug}/invitations/{invitationId}', write: true, slug, permission: 'team.manage' }, async ({ c, actor }) => {
    await c.invitationService.revoke(slug, invitationId, actor);
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  });
}
