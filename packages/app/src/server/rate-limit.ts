import type { Clock, RateLimitDecision, RateLimitGuard, RateLimitRuleName } from '@wine-match/core';
import type { NextResponse } from 'next/server';
import { apiError } from './api';
import { clientKey } from './client-key';
import { env } from './env';
import { countRateLimitDenied } from './metrics';

/**
 * The app side of the request limits (spec E21 F3, R8, R9): the hashed client of this request, the guard from the request scope
 * (`RateLimitGuard` in core: rule, clock, fail-open on a store failure), and the metric of a refusal. Nothing here logs the client.
 * Used by `handlePublic(…, { rateLimit })`, the sign-in action, `issueCodeForPage` and the staff view G9.
 */

interface HeaderReader { get(name: string): string | null }

export async function checkRateLimit(c: { rateLimitGuard: RateLimitGuard; clock: Clock }, rule: RateLimitRuleName, headers: HeaderReader): Promise<RateLimitDecision> {
  const e = env();
  const client = clientKey(headers, { hops: e.trustedProxyHops ?? 0, secret: e.rateLimitSecret ?? null }, c.clock.now());
  const decision = await c.rateLimitGuard.check(rule, client);
  if (!decision.allowed) countRateLimitDenied(rule);
  return decision;
}

/** 429 in the error format of docs/API_SPECIFICATION.md, with `Retry-After` in seconds; never cached (a CDN must not keep it). */
export function tooManyRequests(decision: RateLimitDecision): NextResponse {
  const res = apiError(429, 'rate_limited', 'Too many requests. Try again later.');
  res.headers.set('Retry-After', String(decision.retryAfterSeconds));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
