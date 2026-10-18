import type { IssueCodeInput, IssuedCode, RecommendationCodeService } from '@wine-match/core';
import { headers } from 'next/headers';
import { logger } from './logger';
import { shouldRecord } from './usage-events';

/**
 * Issuing a recommendation code while a page renders (spec 2026-10-16-recommendation-code, R4, Q6, Q7). The code
 * must be on the page, so the write happens before the response — but it never decides the response: no code for
 * a prefetch, a bot, a link preview or our synthetic traffic (`shouldRecord`, E02), and a failed or slow write
 * gives a page without a code, with the same status. E08 calls this on the staff table result with `source: 'staff'`.
 */

/** The page waits at most this long for the code. A write that loses the race may still commit: that code is simply unused. */
export const ISSUE_TIMEOUT_MS = 1500;

export async function issueCodeForPage(
  services: { recommendationCodeService: RecommendationCodeService },
  restaurant: { id: string; slug: string },
  input: IssueCodeInput
): Promise<IssuedCode | null> {
  if (!shouldRecord(await headers())) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ISSUE_TIMEOUT_MS} ms`)), ISSUE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([services.recommendationCodeService.issue(restaurant.slug, input), timeout]);
  } catch (error) {
    // the session id is anonymous, but it is not needed here: the restaurant is enough to find the cause
    logger.warn('recommendation code not issued', { restaurantId: restaurant.id, error: error instanceof Error ? error.message : String(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
