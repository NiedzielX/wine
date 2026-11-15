/**
 * At most one log line per key per interval, on the clock the caller passes (deterministic in tests). For warnings that a flood
 * of requests would otherwise repeat on every request (a failing rate-limit store, a client ceiling reached). One instance per
 * process: the app registers it once in the container. Keys are our own constants, never client input.
 */
export class LogThrottle {
  private readonly last = new Map<string, number>();
  constructor(private readonly intervalMs: number) {}

  allow(key: string, now: Date): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now.getTime() - previous < this.intervalMs) return false;
    this.last.set(key, now.getTime());
    return true;
  }
}
