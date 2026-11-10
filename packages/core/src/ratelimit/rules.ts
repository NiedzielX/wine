/**
 * Request limits per client (spec 2026-11-04-platform-quality-and-compliance, E21 F3: Q5–Q7, R7–R9). Pure rules: the
 * names, the default limits and the one decision every adapter applies, so the memory and the PostgreSQL limiter cannot
 * disagree. A fixed window: `limit` hits per `windowSeconds`, the window starts at a multiple of its length (UTC epoch).
 *
 * The counters are infrastructure, not tenant data: the key is a keyed hash of the client (never an IP, a slug or a session),
 * so the "every repository method takes `restaurantId`" rule does not apply to them (like `SystemHealth`).
 */

export const RATE_LIMIT_RULE_NAMES = ['public-api', 'login', 'code-issue', 'code-lookup', 'code-mark', 'pin-login'] as const;
export type RateLimitRuleName = (typeof RATE_LIMIT_RULE_NAMES)[number];

export interface RateLimitRule {
  name: RateLimitRuleName;
  /** hits allowed in one window; the next one is refused */
  limit: number;
  windowSeconds: number;
}

export type RateLimitRules = Readonly<Record<RateLimitRuleName, RateLimitRule>>;

export interface RateLimitDecision {
  allowed: boolean;
  /** whole seconds until the window ends (at least 1); what `Retry-After` says */
  retryAfterSeconds: number;
}

const rule = (name: RateLimitRuleName, limit: number, windowSeconds: number): RateLimitRule => ({ name, limit, windowSeconds });

/**
 * R7. `pin-login` (the waiter's PIN, E12) is higher than `login` because a whole floor shares the restaurant's Wi-Fi address;
 * it has no caller until E12 builds the PIN sign-in. Values are hypotheses to calibrate on `rate_limit_denied_total` (Risks).
 */
export const DEFAULT_RATE_LIMIT_RULES: RateLimitRules = {
  'public-api': rule('public-api', 120, 60),
  login: rule('login', 20, 600),
  'code-issue': rule('code-issue', 60, 600),
  'code-lookup': rule('code-lookup', 60, 600),
  'code-mark': rule('code-mark', 30, 600),
  'pin-login': rule('pin-login', 60, 600)
};

export const isRateLimitRuleName = (v: string): v is RateLimitRuleName => (RATE_LIMIT_RULE_NAMES as readonly string[]).includes(v);

/**
 * R8: a client the app cannot tell apart (no trusted proxy configured, or a missing or malformed forwarded address) shares ONE
 * counter with every other such client, at half the limit (rounded up). Never "no limit".
 */
export function ruleForClient(r: RateLimitRule, identified: boolean): RateLimitRule {
  return identified ? r : { ...r, limit: Math.ceil(r.limit / 2) };
}

/** The start of the window `now` falls in (milliseconds since the epoch). */
export function windowStartMs(r: RateLimitRule, now: Date): number {
  const size = r.windowSeconds * 1000;
  return Math.floor(now.getTime() / size) * size;
}

/** The decision for the `count`-th hit (1-based, this hit included) in the window that started at `windowStart`. */
export function decide(r: RateLimitRule, count: number, windowStart: number, now: Date): RateLimitDecision {
  const left = windowStart + r.windowSeconds * 1000 - now.getTime();
  return { allowed: count <= r.limit, retryAfterSeconds: Math.max(1, Math.ceil(left / 1000)) };
}

/**
 * `RATE_LIMITS` (optional): `rule=limit/windowSeconds`, comma-separated, e.g. `login=10/600,public-api=240/60`. Rules not named
 * keep their default. Anything else (an unknown rule, a zero, a fraction, a repeat) is an error: the start stops (fails closed).
 */
export function parseRateLimits(raw: string | undefined): RateLimitRules | string {
  const rules: Record<RateLimitRuleName, RateLimitRule> = { ...DEFAULT_RATE_LIMIT_RULES };
  if (raw === undefined) return rules;
  const seen = new Set<string>();
  for (const part of raw.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z-]+)=(\d{1,7})\/(\d{1,6})$/.exec(part);
    if (!m) return `"${part}" is not rule=limit/windowSeconds`;
    const [, name, limit, windowSeconds] = m;
    if (!isRateLimitRuleName(name)) return `unknown rule "${name}" (known: ${RATE_LIMIT_RULE_NAMES.join(', ')})`;
    if (seen.has(name)) return `rule "${name}" is set twice`;
    seen.add(name);
    const l = Number(limit);
    const w = Number(windowSeconds);
    if (l < 1 || l > 1_000_000) return `${name}: the limit must be 1 to 1000000`;
    if (w < 1 || w > 86_400) return `${name}: the window must be 1 to 86400 seconds`;
    rules[name] = rule(name, l, w);
  }
  return rules;
}
