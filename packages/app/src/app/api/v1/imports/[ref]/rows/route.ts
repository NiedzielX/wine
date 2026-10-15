import { rowEditsSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, importJson, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/v1/imports/{id}/rows?restaurant={slug}  {rows: [{rowNumber, fields?: {name: "…"}, include?: boolean}]}
 * Applies the corrections, checks every row again and returns the updated preview.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
  return handle(req, { write: true, slug, permission: 'import.manage' }, async ({ c }) => {
    const { rows } = await parseBody(req, rowEditsSchema);
    return NextResponse.json(importJson(await c.importService.updateRows(slug, ref, rows)));
  });
}
