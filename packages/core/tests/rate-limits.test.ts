import { describe, expect, it, vi } from 'vitest';
import {
  ConfigError, DEFAULT_RATE_LIMIT_RULES, MemoryRateLimiter, RateLimitGuard, createLogger, decide, parseEnv, parseRateLimits, rateLimiterContract, ruleForClient,
  windowStartMs, type RateLimiter, type RateLimitRules
} from '../src/index';

/** Spec E21 F3: R7 (rules, port, memory adapter), R8 (unidentified clients), Q7 (a failing store lets the request through), AC5. */

rateLimiterContract('memory', () => new MemoryRateLimiter(), { describe, it, expect });

describe('rate limit rules (R7)', () => {
  it('has the default rule of every route class from the spec', () => {
    expect(Object.values(DEFAULT_RATE_LIMIT_RULES).map((r) => [r.name, r.limit, r.windowSeconds])).toEqual([
      ['public-api', 120, 60], ['login', 20, 600], ['code-issue', 60, 600], ['code-lookup', 60, 600], ['code-mark', 30, 600], ['pin-login', 60, 600]
    ]);
  });

  it('allows exactly `limit` hits and gives the whole seconds left in the window, at least 1', () => {
    const r = { name: 'login' as const, limit: 2, windowSeconds: 60 };
    const now = new Date('2026-11-10T12:00:30.400Z');
    const start = windowStartMs(r, now);
    expect(new Date(start).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(decide(r, 2, start, now)).toEqual({ allowed: true, retryAfterSeconds: 30 });
    expect(decide(r, 3, start, now)).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(decide(r, 3, start, new Date('2026-11-10T12:00:59.999Z')).retryAfterSeconds).toBe(1);
  });

  it('halves the limit (rounded up) for a client the app cannot identify', () => {
    expect(ruleForClient(DEFAULT_RATE_LIMIT_RULES.login, false).limit).toBe(10);
    expect(ruleForClient(DEFAULT_RATE_LIMIT_RULES['code-mark'], true).limit).toBe(30);
    expect(ruleForClient({ name: 'login', limit: 3, windowSeconds: 1 }, false).limit).toBe(2);
  });

  it('reads RATE_LIMITS over the defaults and refuses anything it cannot read exactly', () => {
    const rules = parseRateLimits(' login=5/60 , public-api=1000/1') as RateLimitRules;
    expect(rules.login).toEqual({ name: 'login', limit: 5, windowSeconds: 60 });
    expect(rules['public-api']).toEqual({ name: 'public-api', limit: 1000, windowSeconds: 1 });
    expect(rules['code-mark']).toEqual(DEFAULT_RATE_LIMIT_RULES['code-mark']);
    for (const bad of ['login=0/60', 'login=5/0', 'login=5/86401', 'login=5', 'logins=5/60', 'login=5/60,login=6/60', 'login=1.5/60', '__proto__=1/1', 'login=-1/60']) {
      expect(typeof parseRateLimits(bad)).toBe('string');
    }
  });

  it('is part of the configuration: defaults, the forwarded-header setting and fail-closed errors', () => {
    const base = parseEnv({});
    expect(base.trustedProxyHops).toBe(0);
    expect(base.rateLimitSecret).toBeNull();
    expect(base.rateLimitRules).toEqual(DEFAULT_RATE_LIMIT_RULES);
    const set = parseEnv({ TRUSTED_PROXY_HOPS: '1', RATE_LIMIT_SECRET: 's'.repeat(32), RATE_LIMITS: 'login=3/60' });
    expect([set.trustedProxyHops, set.rateLimitSecret, set.rateLimitRules.login.limit]).toEqual([1, 's'.repeat(32), 3]);
    for (const raw of [{ TRUSTED_PROXY_HOPS: '-1' }, { TRUSTED_PROXY_HOPS: '11' }, { TRUSTED_PROXY_HOPS: 'yes' }, { RATE_LIMIT_SECRET: 'short' }, { RATE_LIMITS: 'nope' }]) {
      expect(() => parseEnv(raw)).toThrow(ConfigError);
    }
    // production does NOT require the secret (UPGRADE_NOTES: no new required variable)
    expect(() => parseEnv({ NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://db/x', PUBLIC_BASE_URL: 'https://wine.example.com' })).not.toThrow();
  });
});

describe('MemoryRateLimiter memory bound', () => {
  const rule = { name: 'public-api' as const, limit: 2, windowSeconds: 60 };
  const now = new Date('2026-11-10T12:00:00.000Z');

  it('never holds more than its maximum, dropping the least recently used counter first', async () => {
    const limiter = new MemoryRateLimiter(3);
    for (const k of ['a', 'b', 'c']) await limiter.hit(rule, k, now);
    await limiter.hit(rule, 'a', now);          // `a` is used again: `b` is now the oldest
    await limiter.hit(rule, 'd', now);
    expect(limiter.size).toBe(3);
    // `a` kept its count (2nd hit was above), `b` was dropped and starts again
    expect((await limiter.hit(rule, 'a', now)).allowed).toBe(false);
    expect(limiter.size).toBe(3);
    for (let i = 0; i < 1000; i++) await limiter.hit(rule, `flood-${i}`, now);
    expect(limiter.size).toBe(3);
  });
});

describe('RateLimitGuard', () => {
  const clock = { now: () => new Date('2026-11-10T12:00:00.000Z') };
  const rules: RateLimitRules = { ...DEFAULT_RATE_LIMIT_RULES, login: { name: 'login', limit: 2, windowSeconds: 600 } };
  const quiet = createLogger(() => {}, { level: 'error' });

  it('applies the configured rule with the clock from outside, and the stricter one to an unidentified client', async () => {
    const guard = new RateLimitGuard({ rateLimiter: new MemoryRateLimiter(), clock, logger: quiet, rateLimitRules: rules });
    expect((await guard.check('login', { key: 'k1', identified: true })).allowed).toBe(true);
    expect((await guard.check('login', { key: 'k1', identified: true })).allowed).toBe(true);
    expect(await guard.check('login', { key: 'k1', identified: true })).toEqual({ allowed: false, retryAfterSeconds: 600 });
    // unidentified: half of 2 = 1
    expect((await guard.check('login', { key: 'unknown', identified: false })).allowed).toBe(true);
    expect((await guard.check('login', { key: 'unknown', identified: false })).allowed).toBe(false);
  });

  it('lets the request through and warns (rule only) when the store fails (Q7)', async () => {
    const warn = vi.fn();
    const failing: RateLimiter = { hit: async () => { throw new Error('connection refused'); } };
    const guard = new RateLimitGuard({ rateLimiter: failing, clock, logger: { ...quiet, warn }, rateLimitRules: rules });
    expect(await guard.check('login', { key: 'secret-key-hash', identified: true })).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(warn).toHaveBeenCalledWith('rate limit store failed: request allowed', { rule: 'login', error: 'connection refused' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-key-hash');
  });
});
