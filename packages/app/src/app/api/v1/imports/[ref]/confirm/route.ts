import { confirmImportSchema } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, parseBody } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/imports/{id}/confirm?restaurant={slug}  [{rows: [...]}]
 * Saves the ticked rows in one transaction → 200 {created, updated, skipped, suggestions}. Works once per import.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const slug = req.nextUrl.searchParams.get('restaurant') ?? '';
  if (!slug) return apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });
  return handle(req, { write: true, slug, permission: 'import.manage' }, async ({ c, actor }) => {
    const { rows } = await parseBody(req, confirmImportSchema, { optional: true });
    return NextResponse.json(await c.importService.confirm(slug, ref, actor, rows ?? []));
  });
}
