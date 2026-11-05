import { teamChangeSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatch, parseBody, teamMemberJson } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string; membershipId: string }> };

/**
 * PATCH /api/v1/restaurants/{slug}/team/{membershipId} — `If-Match: "<version>"` is required (the member's `version`).
 * Body: `{ role?, status? }` with at least one (status `deactivated` or `active`). Needs `team.manage`; the hierarchy
 * (a manager does not touch an owner or grant owner/manager; nobody changes themselves or the last owner) is the
 * service's. Answers with the member and its new version in `ETag`.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { slug, membershipId } = await ctx.params;
  return handle(req, { write: true, slug, permission: 'team.manage' }, async ({ c, actor }) => {
    const version = ifMatch(req);
    if (version === undefined) return apiError(428, 'precondition_required', 'Send the version you read in the If-Match header.');
    if (version === null) return apiError(400, 'invalid_if_match', 'If-Match must be the member version, e.g. "3".');
    const change = await parseBody(req, teamChangeSchema);
    const member = await c.teamService.change(slug, membershipId, change, actor, version);
    return NextResponse.json(teamMemberJson(member), { headers: { ETag: `"${member.version}"` } });
  });
}
