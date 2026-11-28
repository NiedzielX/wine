import { PROOF_MAX_WINDOW, PROOF_MIN_FOOD_CHECKS, PROOF_MIN_TRADING_DAYS, proofWindows, serviceDay, type ProofReportResult } from '@wine-match/core';
import type { Cradle } from './container';
import { isDomainError } from './domain-errors';

/**
 * What the results report screen (A33) and its printable version (A34) read (spec 2026-11-18-owner-proof-report): the chosen window
 * and, for the window table, every window that has started (one `getReport` each, at most 12). `null` when the window asked for does
 * not exist (outside 1 to 12, not whole digits, or not started): the page then shows an error message.
 */
export interface ProofView {
  result: ProofReportResult;
  /** the reports of the windows that have started, in order (empty without a launch day or without data) */
  all: ProofReportResult[];
  /** the window `i` has started (its first day is not after today's service day) */
  started: (i: number) => boolean;
}

export async function loadProofView(c: Cradle, slug: string, window: string | undefined): Promise<ProofView | null> {
  let result: ProofReportResult;
  try {
    result = await c.proofReportService.getReport(slug, window);
  } catch (e) {
    if (isDomainError(e, 'invalid_window')) return null;
    throw e;
  }
  const L = result.report.launchDay;
  const now = c.clock.now();
  const started = (i: number) => L !== null && i >= 1 && i <= PROOF_MAX_WINDOW && proofWindows(L, i, now).window.from <= serviceDay(now);
  const count = L === null ? 0 : Array.from({ length: PROOF_MAX_WINDOW }, (_, i) => i + 1).filter(started).length;
  const all = L !== null && result.report.baseline && result.report.window
    ? await Promise.all(Array.from({ length: count }, (_, i) => (i + 1 === result.window ? result : c.proofReportService.getReport(slug, i + 1))))
    : [];
  return { result, all, started };
}

/** The values the "not enough data" reasons quote, already written as dates by `day`. */
export function proofFacts(r: ProofReportResult['report'], day: (d: string) => string) {
  const facts = { from: r.baseline ? day(r.baseline.period.from) : '', to: r.window ? day(r.window.period.to) : '', minChecks: PROOF_MIN_FOOD_CHECKS, minDays: PROOF_MIN_TRADING_DAYS, dataThrough: r.dataThrough ? day(r.dataThrough) : '' };
  const baselineFacts = { ...facts, from: r.baseline ? day(r.baseline.period.from) : '', to: r.baseline ? day(r.baseline.period.to) : '' };
  return { facts, baselineFacts };
}
