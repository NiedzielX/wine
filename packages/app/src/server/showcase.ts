import { notFound } from 'next/navigation';
import type { ShowcaseMode } from '@wine-match/core';
import { env } from './env';
import { logger } from './logger';

/**
 * The public sales showcase under `/demo` (spec 2026-11-04-sales-demo-and-roi-calculator, R1, R11, Q9).
 * A page calls `showcaseGate()` FIRST and `logShowcaseView()` as its last step before it returns.
 */

/** Modes in the order in which they switch more on; a page asks for the lowest mode that serves it. */
const RANK: Readonly<Record<ShowcaseMode, number>> = { off: 0, calculator: 1, demo: 2 };

/**
 * 404 unless `SHOWCASE_MODE` is at least `required` (fails closed: unset is `off`). The configuration is read through `env()`,
 * so a wrong value has already stopped the start (`instrumentation.ts`), and the calculator reads no data at all.
 */
export function showcaseGate(required: Exclude<ShowcaseMode, 'off'>): ShowcaseMode {
  const mode = env().showcaseMode;
  if (RANK[mode] < RANK[required]) notFound();
  return mode;
}

/** The showcase pages that are counted. The value is the whole of what is recorded about a visit. */
export type ShowcasePage = 'hub' | 'tour' | 'roi' | 'roi_summary';

/**
 * One log line per page view and nothing else (Q9): the page name. No address, no user agent, no query string (the calculator's
 * numbers are the restaurant's own), no identifier, no cookie; the operator counts the lines with `grep` and `wc`. Not a write to
 * any store: the request log of the process is the only place it goes.
 */
export function logShowcaseView(page: ShowcasePage): void {
  logger.info('showcase_view', { page });
}
