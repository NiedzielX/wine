export const SYNTHETIC_HEADER: 'x-wine-match-synthetic';
export interface SentRequest { method: string; url: string }
export function syntheticFetch(options?: { baseFetch?: typeof fetch; getOnly?: boolean; sent?: SentRequest[] }): typeof fetch;
