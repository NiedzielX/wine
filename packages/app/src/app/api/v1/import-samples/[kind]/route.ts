import { SAMPLE_MENU_CSV, SAMPLE_SALES_CSV, SAMPLE_WINES_CSV } from '@wine-match/core';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from '@/server/api';

export const dynamic = 'force-static';

/** GET /api/v1/import-samples/{menu|wines|sales} — an example CSV with the expected columns (public, static). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  const samples = new Map([['menu', SAMPLE_MENU_CSV], ['wines', SAMPLE_WINES_CSV], ['sales', SAMPLE_SALES_CSV]]);
  const sample = samples.get(kind);
  if (!sample) return apiError(404, 'not_found', 'Unknown sample.');
  return new NextResponse(sample, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-sample.csv"` }
  });
}

export function generateStaticParams() {
  return [{ kind: 'menu' }, { kind: 'wines' }, { kind: 'sales' }];
}
