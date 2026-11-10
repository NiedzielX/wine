import type { RateLimiter } from '../ports/runtime';
import { decide, windowStartMs, type RateLimitDecision, type RateLimitRule } from '../ratelimit/rules';

/** Most counters the in-memory limiter keeps (one per client and rule); beyond it the least recently used ones go first. */
export const MAX_MEMORY_RATE_LIMIT_ENTRIES = 10_000;

interface Entry { windowStart: number; windowEnd: number; count: number }

/**
 * Fixed-window counters in one process (DATA_SOURCE=memory, spec E21 F3 R7). Memory is BOUNDED: when a new counter would pass
 * `maxEntries`, the least recently used counters go (and with them any ended windows at the front of the order). A client whose counter is evicted
 * starts again from zero, which only matters when more than `maxEntries` clients are active at once (documented risk). The
 * map keys are built from our own rule names and hashed keys (never a client-chosen object key).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly maxEntries = MAX_MEMORY_RATE_LIMIT_ENTRIES) {}

  async hit(rule: RateLimitRule, key: string, now: Date): Promise<RateLimitDecision> {
    const id = `${rule.name}\u0000${key}`;
    const windowStart = windowStartMs(rule, now);
    const previous = this.entries.get(id);
    const count = previous && previous.windowStart === windowStart ? previous.count + 1 : 1;
    // delete + set moves the counter to the end of the insertion order: the first key is always the least recently used
    this.entries.delete(id);
    this.entries.set(id, { windowStart, windowEnd: windowStart + rule.windowSeconds * 1000, count });
    if (this.entries.size > this.maxEntries) this.evict(now.getTime());
    return decide(rule, count, windowStart, now);
  }

  /** How many counters are held (for tests of the memory bound). */
  get size(): number {
    return this.entries.size;
  }

  /** O(1) per hit even under a flood: only the front of the insertion order is looked at. */
  private evict(now: number): void {
    for (const [id, e] of this.entries) {
      if (this.entries.size <= this.maxEntries && e.windowEnd > now) break;
      this.entries.delete(id);
    }
  }
}
