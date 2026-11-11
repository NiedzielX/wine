import type { RateLimiter } from '../ports/runtime';
import { DEFAULT_RATE_LIMIT_MAX_CLIENTS, RATE_LIMIT_OVERFLOW_KEY, decide, windowStartMs, type RateLimitDecision, type RateLimitRule } from '../ratelimit/rules';

/** Most counters the in-memory limiter keeps (one per client and rule); beyond it the least recently used ones go first. */
export const MAX_MEMORY_RATE_LIMIT_ENTRIES = 10_000;

interface Entry { windowStart: number; windowEnd: number; count: number }

/**
 * Fixed-window counters in one process (DATA_SOURCE=memory, spec E21 F3 R7). Memory is BOUNDED: when a new counter would pass
 * `maxEntries`, the least recently used counters go (and with them any ended windows at the front of the order). A client whose counter is evicted
 * starts again from zero, which only matters when more than `maxEntries` clients are active at once (documented risk). Past
 * `maxClientsPerWindow` distinct clients of one rule in one window, new clients share one overflow counter (degraded mode). The LRU
 * map is shared by all rules and its default size equals the default ceiling, so under heavy traffic eviction starts before the
 * ceiling matters and an evicted client comes back as new: parity with `PgRateLimiter` is the ceiling semantics, not flood behaviour. The
 * map keys are built from our own rule names and hashed keys (never a client-chosen object key).
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();
  /** distinct clients per rule in its current window (the ceiling of the degraded mode, same as `PgRateLimiter`) */
  private readonly clients = new Map<string, { windowStart: number; count: number }>();
  constructor(private readonly maxEntries = MAX_MEMORY_RATE_LIMIT_ENTRIES, private readonly maxClientsPerWindow = DEFAULT_RATE_LIMIT_MAX_CLIENTS) {}

  async hit(rule: RateLimitRule, clientKey: string, now: Date): Promise<RateLimitDecision> {
    const windowStart = windowStartMs(rule, now);
    let key = clientKey;
    let id = `${rule.name}\u0000${key}`;
    let previous = this.entries.get(id);
    const known = previous !== undefined && previous.windowStart === windowStart;
    let degraded = false;
    if (!known) {
      const seen = this.clients.get(rule.name);
      const clients = seen && seen.windowStart === windowStart ? seen.count + 1 : 1;
      this.clients.set(rule.name, { windowStart, count: clients });
      if (clients > this.maxClientsPerWindow) {
        // the client's counter of an earlier window (if any) is dead: drop it, the hit counts on the shared overflow counter
        this.entries.delete(id);
        degraded = true;
        key = RATE_LIMIT_OVERFLOW_KEY;
        id = `${rule.name}\u0000${key}`;
        previous = this.entries.get(id);
      }
    }
    const count = previous && previous.windowStart === windowStart ? previous.count + 1 : 1;
    // delete + set moves the counter to the end of the insertion order: the first key is always the least recently used
    this.entries.delete(id);
    this.entries.set(id, { windowStart, windowEnd: windowStart + rule.windowSeconds * 1000, count });
    if (this.entries.size > this.maxEntries) this.evict(now.getTime());
    return decide(rule, count, windowStart, now, degraded);
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
