import type { Wine } from '@wine-match/core';

/** "9 Oct 2026, 17:40" in the restaurant's timezone, or a dash when there is no date. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
}

export const zl = (n: number) => `${n.toLocaleString('pl-PL')} zł`;

export const vintageLabel = (w: Wine) => (w.vintage === 'NV' ? 'Non-vintage' : String(w.vintage));

export const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';
