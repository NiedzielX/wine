import type { Wine } from '@wine-match/core';
import { NextResponse } from 'next/server';

/** Error body of docs/API_SPECIFICATION.md: `{ error: { code, message, fields? } }`. */
export function apiError(status: number, code: string, message: string, fields?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status });
}

/** Public cache policy for guest endpoints: CDN for a minute, stale-while-revalidate for ten. */
export const PUBLIC_CACHE = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' };

/** The wine fields the public API exposes (no profile internals). */
export function publicWine(w: Wine) {
  return {
    id: w.id, producer: w.producer, name: w.name, vintage: w.vintage, region: w.region, colour: w.colour,
    glassPrice: w.glassPrice, glassPourMl: w.glassPour, bottlePrice: w.bottlePrice, listNumber: w.listNumber ?? null
  };
}
