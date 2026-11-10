import type { Logger } from '../logging/logger';
import type { Clock, RateLimiter } from '../ports/runtime';
import { ruleForClient, type RateLimitDecision, type RateLimitRuleName, type RateLimitRules } from './rules';

/** Who is asking, as the app worked it out: a keyed hash, and whether it stands for one client or for "everyone unidentified". */
export interface RateLimitClient {
  key: string;
  identified: boolean;
}

export interface RateLimitGuardDeps {
  rateLimiter: RateLimiter;
  clock: Clock;
  logger: Logger;
  rateLimitRules: RateLimitRules;
}

/**
 * The one door every limited entry goes through (spec E21 F3, R7–R9): the configured rule, the stricter variant for an
 * unidentified client (R8), the clock from outside (deterministic tests), and Q7: a limiter store that fails does NOT turn
 * into an outage. The request is let through and a `warn` names the rule (never the key or the client).
 */
export class RateLimitGuard {
  constructor(private readonly deps: RateLimitGuardDeps) {}

  async check(ruleName: RateLimitRuleName, client: RateLimitClient): Promise<RateLimitDecision> {
    const rule = ruleForClient(this.deps.rateLimitRules[ruleName], client.identified);
    try {
      return await this.deps.rateLimiter.hit(rule, client.key, this.deps.clock.now());
    } catch (error) {
      this.deps.logger.warn('rate limit store failed: request allowed', { rule: ruleName, error: error instanceof Error ? error.message : String(error) });
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }
}
