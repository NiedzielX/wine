import { pairingUpdateSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, ifMatch, pairingJson, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** The version the caller read (`If-Match`), or the error response that tells them to send it. */
function requiredVersion(req: NextRequest): number | NextResponse {
  const version = ifMatch(req);
  if (version === undefined) return apiError(428, 'precondition_required', 'Send the version you read in the If-Match header.');
  if (version === null) return apiError(400, 'invalid_if_match', 'If-Match must be the pairing version, e.g. "3".');
  return version;
}

const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/**
 * PATCH /api/v1/pairings/{id}?restaurant={slug}  — `If-Match: "<version>"` is required.
 * Body, ONE change per request: {status: "approved" | "rejected" | "suggested"} (suggested = restore),
 * or {role}, or {comment}. Reordering uses the dashboard for now.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return needRestaurant();
  return handle(req, { write: true, slug, permission: 'pairings.decide' }, async ({ c, actor }) => {
    const version = requiredVersion(req);
    if (typeof version !== 'number') return version;
    const change = await parseBody(req, pairingUpdateSchema);
    const s = c.sommelierService;
    if (change.status === 'approved') await s.approve(slug, id, actor, version);
    else if (change.status === 'rejected') await s.reject(slug, id, actor, version);
    else if (change.status === 'suggested') await s.restore(slug, id, actor, version);
    else if (change.role !== undefined) await s.setRole(slug, id, change.role, actor, version);
    // the schema allows exactly one of the three, so a note is what is left
    else await s.setComment(slug, id, change.comment!, actor, version);
    const now = (await c.adminService.listPairings(slug))?.pairings.find((p) => p.id === id);
    return NextResponse.json(pairingJson(now!), { headers: { ETag: `"${now!.version}"` } });
  });
}

/** DELETE /api/v1/pairings/{id}?restaurant={slug} — only pairings the sommelier added by hand; `If-Match` required. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return needRestaurant();
  return handle(req, { write: true, slug, permission: 'pairings.decide' }, async ({ c, actor }) => {
    const version = requiredVersion(req);
    if (typeof version !== 'number') return version;
    await c.sommelierService.deleteManual(slug, id, actor, version);
    return new NextResponse(null, { status: 204 });
  });
}
