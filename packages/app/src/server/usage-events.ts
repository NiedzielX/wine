import type { GuestSessionRef, UsageEvent, UsageEventService } from '@wine-match/core';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { logger } from './logger';
import { PREFETCH_HEADER } from './prefetch';

/**
 * Recording guest usage events from server pages (spec 2026-10-15-guest-usage-events). Server side only: no script,
 * no cookie, no browser storage. The write runs after the response is sent and never changes it.
 */

/**
 * Our own traffic (smoke tests, CI, monitoring) sends `x-wine-match-synthetic: 1`: the page renders as usual, but no
 * event is recorded. A forged header only hides the sender's own events. The end-to-end tests never send it.
 */
export const SYNTHETIC_TRAFFIC_HEADER = 'x-wine-match-synthetic';

export { PREFETCH_HEADER };

/** User agents of bots, link previews and command line clients: case-insensitive substrings (Q11). */
export const NON_GUEST_UA = [
  'bot', 'crawl', 'spider', 'slurp', 'preview', 'facebookexternalhit', 'whatsapp', 'telegrambot', 'slackbot', 'discordbot', 'linkedinbot',
  'twitterbot', 'embedly', 'curl/', 'wget/', 'python-requests', 'go-http-client', 'uptime', 'pingdom'
] as const;

interface HeaderReader { get(name: string): string | null }

/** Whether `Sec-Purpose` / `Purpose` announce a speculative load (prefetch or prerender). */
const speculative = (h: HeaderReader) => /prefetch|prerender/i.test(`${h.get('sec-purpose') ?? ''} ${h.get('purpose') ?? ''}`);

/**
 * Whether this request is a guest's own page view (R6): not a prefetch, not our synthetic traffic, not a bot or a link
 * preview, not a client without a user agent. A soft navigation with JavaScript (`RSC: 1`) is a page view.
 */
export function shouldRecord(h: HeaderReader): boolean {
  if (h.get(PREFETCH_HEADER) === '1' || h.get('next-router-prefetch') !== null || speculative(h)) return false;
  if (h.get(SYNTHETIC_TRAFFIC_HEADER) === '1') return false;
  const ua = (h.get('user-agent') ?? '').trim().toLowerCase();
  if (!ua) return false;
  return !NON_GUEST_UA.some((s) => ua.includes(s));
}

/**
 * Schedules the page's events to be written after the response. Call it as the **last statement before `return`** of
 * the page's default export (never in `generateMetadata`): Next.js runs `after()` even when the render later throws
 * `notFound()`, so nothing may come between this call and the return. The request headers are read here, before
 * `after()`; the callback holds only plain values and the resolved service. A failed write is logged, never thrown.
 */
export async function trackUsage(
  services: { usageEventService: UsageEventService },
  restaurant: { id: string; publishedAt: string | null },
  session: GuestSessionRef,
  events: UsageEvent[]
): Promise<void> {
  if (!shouldRecord(await headers())) return;
  if (!events.length && !(session.isNew && session.source !== 'staff')) return;
  const service = services.usageEventService;
  const target = { id: restaurant.id, publishedAt: restaurant.publishedAt };
  after(async () => {
    try {
      await service.record(target, session, events);
    } catch (error) {
      // the session id is anonymous; no IP, user agent or guest text is logged
      logger.warn('usage event not recorded', {
        names: events.map((e) => e.name), restaurantId: target.id, sessionId: session.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
