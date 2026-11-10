import type { ContractRunner } from './contract-types';
import type { RateLimiter } from '../ports/runtime';
import { DEFAULT_RATE_LIMIT_RULES, type RateLimitRule } from '../ratelimit/rules';

/**
 * The behaviour every `RateLimiter` must have (spec E21 F3, AC5), run against the memory adapter (core) and PostgreSQL (db).
 * `make()` returns a limiter on fresh state. Times are fixed instants, never the wall clock. Keys are unique per case, so a
 * shared store does not leak counts between cases.
 */
export function rateLimiterContract(name: string, make: () => Promise<RateLimiter> | RateLimiter, { describe, it, expect }: Omit<ContractRunner, 'beforeEach'>): void {
  const rule: RateLimitRule = { name: 'login', limit: 3, windowSeconds: 600 };
  // 12:00:00 UTC is a window boundary for a 600-second window
  const t0 = new Date('2026-11-10T12:00:00.000Z');
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);
  const key = (k: string) => `${name}-${k}`.replace(/[^a-z0-9-]/gi, '').slice(0, 32);

  describe(`RateLimiter contract: ${name}`, () => {
    it('allows `limit` hits in a window and refuses the next with the seconds left in the window', async () => {
      const limiter = await make();
      for (let i = 0; i < 3; i++) expect(await limiter.hit(rule, key('a'), at(10 + i))).toMatchObject({ allowed: true });
      expect(await limiter.hit(rule, key('a'), at(100))).toEqual({ allowed: false, retryAfterSeconds: 500 });
      expect(await limiter.hit(rule, key('a'), at(599.2))).toEqual({ allowed: false, retryAfterSeconds: 1 });
    });

    it('starts again in the next window', async () => {
      const limiter = await make();
      for (let i = 0; i < 4; i++) await limiter.hit(rule, key('b'), at(i));
      expect((await limiter.hit(rule, key('b'), at(599))).allowed).toBe(false);
      expect(await limiter.hit(rule, key('b'), at(600))).toEqual({ allowed: true, retryAfterSeconds: 600 });
    });

    it('counts two keys and two rules independently', async () => {
      const limiter = await make();
      for (let i = 0; i < 4; i++) await limiter.hit(rule, key('c'), at(i));
      expect((await limiter.hit(rule, key('c'), at(5))).allowed).toBe(false);
      expect((await limiter.hit(rule, key('d'), at(5))).allowed).toBe(true);
      // the same client on another rule (another route class) has its own counter
      expect((await limiter.hit({ ...DEFAULT_RATE_LIMIT_RULES['public-api'], limit: 1 }, key('c'), at(5))).allowed).toBe(true);
    });

    it('counts concurrent hits together: exactly `limit` of them are allowed', async () => {
      const limiter = await make();
      const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit(rule, key('e'), at(1))));
      expect(results.filter((r) => r.allowed).length).toBe(3);
    });
  });
}
