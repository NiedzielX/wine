import { SAMPLE_MENU_CSV, SAMPLE_WINES_CSV } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';

export const dynamic = 'force-static';

/** GET /api/v1/import-samples/{menu|wines} — an example CSV with the expected columns (public, static). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (kind !== 'menu' && kind !== 'wines') return apiError(404, 'not_found', 'Unknown sample.');
  return new NextResponse(kind === 'menu' ? SAMPLE_MENU_CSV : SAMPLE_WINES_CSV, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-sample.csv"` }
  });
}

export function generateStaticParams() {
  return [{ kind: 'menu' }, { kind: 'wines' }];
}
