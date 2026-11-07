export interface Fetcher {
  json(path: string, opts?: { paginate?: boolean }): unknown | Promise<unknown>;
  text(path: string, accept: string): string | Promise<string>;
}
export const DEFAULT_REPO: string;
export const MAX_DIFF_BYTES: number;
export function createGhFetcher(exec?: unknown): Fetcher;
export function fenceFor(content: string): string;
export function riskOf(labels: string[], files: string[]): { label: string | null; pathSignalHigh: boolean; effective: 'low' | 'medium' | 'high' };
export function parseChecklists(text: string): Map<string, string>;
export function passesFor(files: string[]): string[];
export function idsFromBranch(branch: string): { epic: string | null; phase: string | null };
export function specExcerpt(text: string, ids?: { phase?: string | null; epic?: string | null }): string;
export function buildReviewPack(options: { pr: number | string; repo?: string; fetcher: Fetcher; maxDiffBytes?: number }): Promise<string>;
