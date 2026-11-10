import type { RateLimitClient } from '@wine-match/core';
import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * Who a request comes from, for the request limits (spec E21 F3, Q6, R8), as a keyed hash: the raw address never leaves this
 * file (not stored, not logged, not a metric label).
 *
 * The address: Next.js gives a route no socket address, so the only source is `X-Forwarded-For`, and that header is whatever the
 * client wrote UNLESS a proxy we trust appended to it. `hops` (TRUSTED_PROXY_HOPS) is the number of such proxies:
 *  - 0 (default): the header is never read. Every request is the one unidentified client (`identified: false`, half limits).
 *  - N ≥ 1: the N-th entry from the RIGHT is the client (each trusted proxy appends the address it saw; entries further left were
 *    written by the client and are ignored). Too few entries or a malformed one = the unidentified client, never "no limit".
 *
 * IPv6 clients are counted per /64 (one subscriber gets a whole /64), IPv4-mapped IPv6 as IPv4.
 * The key: HMAC-SHA256 with a key derived from the secret and the UTC day, cut to 128 bits (32 hex). The same address on two days
 * gives two unrelated keys, so the table cannot follow a client across days.
 */

export interface ClientKeyConfig {
  hops: number;
  /** RATE_LIMIT_SECRET, or null for a random per-process secret */
  secret: string | null;
}

interface HeaderReader { get(name: string): string | null }

const UNIDENTIFIED = 'unidentified';

const g = globalThis as unknown as { __wineMatchRateLimitSecret?: string };
/** Random per process when RATE_LIMIT_SECRET is not set (start-up warns in production). Never logged. */
const processSecret = () => (g.__wineMatchRateLimitSecret ??= randomBytes(32).toString('hex'));

/** `a:b:…` (possibly with `::`) as eight 16-bit groups, or null. Input already passed `isIP() === 6`. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number);
    text = `${text.slice(0, -v4[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const parse = (s: string | undefined) => (s ? s.split(':').map((h) => parseInt(h, 16)) : []);
  const left = parse(head);
  const right = parse(tail);
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return groups.length === 8 && groups.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? groups : null;
}

/** The address as one counting unit: IPv4 as is, IPv4-mapped IPv6 as IPv4, other IPv6 as its /64. null when it is not an address. */
export function countingUnit(raw: string): string | null {
  const ip = raw.trim();
  const kind = isIP(ip);
  if (kind === 4) return ip;
  if (kind !== 6) return null;
  const groups = ipv6Groups(ip);
  if (!groups) return null;
  if (groups.slice(0, 5).every((n) => n === 0) && groups[5] === 0xffff) return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join('.');
  return `${groups.slice(0, 4).map((n) => n.toString(16)).join(':')}::/64`;
}

/** The client's counting unit from `X-Forwarded-For` under `hops` trusted proxies, or null (unidentified). */
export function clientAddress(headers: HeaderReader, hops: number): string | null {
  if (hops < 1) return null;
  const raw = headers.get('x-forwarded-for');
  if (!raw) return null;
  const entries = raw.split(',');
  if (entries.length < hops) return null;
  return countingUnit(entries[entries.length - hops]);
}

/** The key for the limiter: `{ key, identified }`. `now` picks the UTC day of the hash key. */
export function clientKey(headers: HeaderReader, config: ClientKeyConfig, now: Date): RateLimitClient {
  const address = clientAddress(headers, config.hops);
  const day = now.toISOString().slice(0, 10);
  const dayKey = createHmac('sha256', config.secret ?? processSecret()).update(`wine-match rate limit ${day}`).digest();
  const key = createHmac('sha256', dayKey).update(address ?? UNIDENTIFIED).digest('hex').slice(0, 32);
  return { key, identified: address !== null };
}
