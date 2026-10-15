import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';
import { handle } from '@/server/api-auth';
import { clampSize, guestUrl, qrPng, qrSvg } from '@/server/qr';

export const dynamic = 'force-dynamic';

/** GET /api/v1/restaurants/{slug}/qr?format=svg|png&size=<px>&download=1 — the guest QR code. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return handle(req, { write: false, slug, permission: 'panel.view' }, async ({ c }) => {
    const q = req.nextUrl.searchParams;
    const format = q.get('format') ?? 'svg';
    if (format !== 'svg' && format !== 'png') return apiError(422, 'validation_failed', 'format must be svg or png.', { format: 'invalid' });
    // the permission check has already found the restaurant
    await c.adminService.setup(slug);
    const url = guestUrl(slug);
    const size = clampSize(q.get('size'));
    const headers: Record<string, string> = { 'Cache-Control': 'private, max-age=300' };
    if (q.get('download')) headers['Content-Disposition'] = `attachment; filename="wine-match-${slug}.${format}"`;
    if (format === 'png') return new NextResponse(new Uint8Array(await qrPng(url, size)), { headers: { ...headers, 'Content-Type': 'image/png' } });
    return new NextResponse(await qrSvg(url, size), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
  });
}
