import { IMPORT_LIMITS } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle, importJson, readUpload } from '@/server/api-auth';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ ref: string }> };

const slugOf = (req: NextRequest) => req.nextUrl.searchParams.get('restaurant') ?? '';
const needRestaurant = () => apiError(422, 'validation_failed', 'Query parameter "restaurant" is required.', { restaurant: 'required' });

/**
 * POST /api/v1/imports/menu|wines|sales?restaurant={slug}  — multipart/form-data with a `file` field (CSV, XLSX or PDF, up to 10 MB;
 * sales: CSV or XLSX only, spec 2026-10-15-pos-sales-import-attach-rate).
 * → 201 with the preview: rows, checks and notes. Nothing is saved until the import is confirmed.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { ref } = await ctx.params;
  const slug = slugOf(req);
  if (!slug) return needRestaurant();
  if (ref !== 'menu' && ref !== 'wines' && ref !== 'sales') return apiError(404, 'not_found', 'Upload to /imports/menu, /imports/wines or /imports/sales.');
  return handle(req, { write: true, slug, permission: 'import.manage' }, async ({ c, actor }) => {
    const file = await readUpload(req, IMPORT_LIMITS.maxBytes);
    return NextResponse.json(importJson(await c.importService.upload(slug, ref, file, actor)), { status: 201 });
  });
}

/** GET /api/v1/imports/{id}?restaurant={slug} — the preview or the result of an import. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { ref } = await ctx.params;
  const slug = slugOf(req);
  if (!slug) return needRestaurant();
  return handle(req, { write: false, slug, permission: 'import.manage' }, async ({ c }) => NextResponse.json(importJson(await c.importService.get(slug, ref))));
}

/** DELETE /api/v1/imports/{id}?restaurant={slug} — cancels an open import; nothing was changed. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { ref } = await ctx.params;
  const slug = slugOf(req);
  if (!slug) return needRestaurant();
  return handle(req, { write: true, slug, permission: 'import.manage' }, async ({ c }) => {
    await c.importService.cancel(slug, ref);
    return new NextResponse(null, { status: 204 });
  });
}
