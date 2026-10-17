import type { GuestInteraction, GuestInteractionRepository, UsageEventService } from '@wine-match/core';
import { NextRequest } from 'next/server';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import LandingPage from '@/app/(guest)/r/[slug]/page';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import MenuPage from '@/app/(guest)/r/[slug]/menu/page';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import TableResultPage from '@/app/(guest)/r/[slug]/table/result/page';
import WinePage from '@/app/(guest)/r/[slug]/wine/[wineId]/page';
import { proxy } from '@/proxy';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { NON_GUEST_UA, PREFETCH_HEADER, SYNTHETIC_TRAFFIC_HEADER, shouldRecord, trackUsage } from '@/server/usage-events';

/**
 * Spec 2026-10-15-guest-usage-events, phase 1 (#12): the request filter, the write after the response, the session in
 * every guest link and form (AC4, AC5), and the page views of G0, G1 and G3 (AC1, AC6a, AC6b) — rendered to HTML the
 * way the server sends them, on the in-memory data source.
 */

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const HEADLESS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36';
const SID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const UNUSED_SID = '1d0f5a2e-3b4c-4d5e-9f60-718293a4b5c6';

const reader = (h: Record<string, string>) => ({ get: (name: string) => h[name.toLowerCase()] ?? null });

async function render(page: unknown, params: Record<string, string>, search: Record<string, string> = {}, extraHeaders: Record<string, string> = {}): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', 'en');
  next().headers.set('user-agent', SAFARI);
  for (const [k, v] of Object.entries(extraHeaders)) next().headers.set(k, v);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

/** Every link (`href`) of the page that leads into the guest app. Forms carry the session in a hidden field instead. */
const guestTargets = (html: string) => [...html.matchAll(/\shref="(\/r\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const sidOf = (target: string) => new URL(target, 'http://x').searchParams.get('sid');
const hiddenSid = (html: string) => [...html.matchAll(/<input type="hidden" name="sid" value="([^"]+)"/g)].map((m) => m[1]);
const settle = async () => { await Promise.all(next().afterTasks.splice(0)); };

let repo: GuestInteractionRepository;
let restaurantId = '';
let publishedAt: string | null = null;
let duck = '';
let dessert = '';
let wine = '';
let inactiveWine = '';

beforeAll(async () => {
  const c = (await createRequestScope()).cradle;
  repo = c.guestInteractionRepository;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  publishedAt = menu.restaurant.publishedAt;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!.id;
  dessert = menu.dishes.find((d) => d.category === 'Desserts')!.id;
  const wines = await c.wineRepository.listByRestaurant(restaurantId);
  wine = (await c.recommendationService.forDish('halka', duck, { serving: 'any', styles: [], maxPrice: null, weight: 'any', mood: 'any' }))!.result.items[0].wine.id;
  inactiveWine = wines.find((w) => !w.active)?.id ?? '';
});

afterEach(async () => {
  await settle();
  vi.restoreAllMocks();
});

describe('shouldRecord: only a guest\'s own page views (R6, AC6, AC6b)', () => {
  it('skips prefetches, our synthetic traffic, an empty user agent and bots or link previews', () => {
    expect(shouldRecord(reader({ 'user-agent': SAFARI, [PREFETCH_HEADER]: '1' }))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, 'next-router-prefetch': '1' }))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, 'sec-purpose': 'prefetch' }))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, 'sec-purpose': 'prefetch;prerender' }))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, purpose: 'prefetch' }))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, [SYNTHETIC_TRAFFIC_HEADER]: '1' }))).toBe(false);
    expect(shouldRecord(reader({}))).toBe(false);
    expect(shouldRecord(reader({ 'user-agent': '   ' }))).toBe(false);
    for (const ua of ['WhatsApp/2.23.20.0 A', 'curl/8.7.1', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'facebookexternalhit/1.1', 'TelegramBot (like TwitterBot)', 'python-requests/2.32', 'Go-http-client/2.0', 'Pingdom.com_bot_version_1.4']) {
      expect(shouldRecord(reader({ 'user-agent': ua })), ua).toBe(false);
    }
    expect(NON_GUEST_UA).not.toContain('headless');
  });

  it('records Safari on iOS, Chrome on Android, headless Chrome (the end-to-end tests) and a soft navigation (RSC)', () => {
    expect(shouldRecord(reader({ 'user-agent': SAFARI }))).toBe(true);
    expect(shouldRecord(reader({ 'user-agent': CHROME_ANDROID }))).toBe(true);
    expect(shouldRecord(reader({ 'user-agent': HEADLESS }))).toBe(true);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, rsc: '1' }))).toBe(true);
    expect(shouldRecord(reader({ 'user-agent': SAFARI, [SYNTHETIC_TRAFFIC_HEADER]: '0' }))).toBe(true);
  });

  it('the proxy marks router prefetches, which server components cannot see, and clears a forged mark', () => {
    const marked = (headers: Record<string, string>) => proxy(new NextRequest('http://localhost:3000/r/halka/menu', { headers })).headers.get(`x-middleware-request-${PREFETCH_HEADER}`);
    expect(marked({ 'next-router-prefetch': '1' })).toBe('1');
    expect(marked({ 'next-router-segment-prefetch': '/_tree' })).toBe('1');
    expect(marked({ rsc: '1' })).toBeNull();
    expect(marked({ [PREFETCH_HEADER]: '1' })).toBeNull();
  });
});

describe('trackUsage: the write after the response (R5, AC3)', () => {
  const restaurant = { id: '00000000-0000-4000-8000-000000000001', publishedAt: null };
  const session = { id: SID, isNew: true, source: 'link' as const };

  it('a failing repository is logged as a warning and never reaches the page', async () => {
    next().headers.clear();
    next().headers.set('user-agent', SAFARI);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const failing = { record: async () => { throw new Error('database down'); } } as unknown as UsageEventService;
    await expect(trackUsage({ usageEventService: failing }, restaurant, session, [{ name: 'menu_viewed' }])).resolves.toBeUndefined();
    await settle();
    expect(warn).toHaveBeenCalledWith('usage event not recorded', { names: ['menu_viewed'], restaurantId: restaurant.id, sessionId: SID, error: 'database down' });
  });

  it('schedules nothing for a skipped request or when there is nothing to write', async () => {
    const record = vi.fn(async () => undefined);
    const service = { record } as unknown as UsageEventService;
    next().headers.clear();
    next().headers.set('user-agent', 'curl/8.7.1');
    await trackUsage({ usageEventService: service }, restaurant, session, [{ name: 'menu_viewed' }]);
    next().headers.set('user-agent', SAFARI);
    await trackUsage({ usageEventService: service }, restaurant, { ...session, isNew: false }, []);
    await trackUsage({ usageEventService: service }, restaurant, { ...session, source: 'staff' }, []);
    expect(next().afterTasks).toHaveLength(0);
    await trackUsage({ usageEventService: service }, restaurant, session, []);
    await settle();
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe('every guest link and form carries the session (R3, AC4, AC5)', () => {
  const pages = (): Array<[string, unknown, Record<string, string>, Record<string, string>]> => [
    ['G0 landing', LandingPage, {}, {}],
    ['G1 menu', MenuPage, {}, { serving: 'glass' }],
    ['G3 wines', WinesPage, { dishId: duck }, { styles: 'red', lang: 'pl' }],
    ['G4 filters sheet', WinesPage, { dishId: duck }, { sheet: 'filters' }],
    ['G5 table', TablePage, {}, { dishes: `${duck},${dessert}` }],
    ['G6 table result', TableResultPage, {}, { dishes: `${duck},${dessert}` }],
    ['G6 needs two dishes', TableResultPage, {}, { dishes: duck }],
    ['G7 wine', WinePage, { wineId: wine }, { dish: duck }],
    ['G8 selected', SelectedPage, { wineId: wine }, { dish: duck, serving: 'bottle' }],
    ['G9 staff', StaffPage, {}, { dish: duck }]
  ];

  it('continues the session of a valid sid: every /r/ link and form carries it, only "For staff" on G0 does not', async () => {
    for (const [name, page, params, search] of pages()) {
      const html = await render(page, params, { ...search, sid: SID });
      const targets = guestTargets(html);
      expect(targets.length, name).toBeGreaterThan(0);
      const without = targets.filter((t) => sidOf(t) !== SID);
      expect(without, name).toEqual(name === 'G0 landing' ? ['/r/halka/staff', '/r/halka/staff'] : []);
      for (const t of targets.filter((x) => sidOf(x))) expect(t.endsWith(`sid=${SID}`), `${name}: ${t}`).toBe(true);
      const forms = (html.match(/<form /g) ?? []).length;
      if (forms) {
        expect(hiddenSid(html), name).toEqual(Array(forms).fill(SID));
        expect(html.match(/<form [^>]*action="\/r\/[^"?]*"/g)?.length, name).toBe(forms);
      }
      expect(html).not.toMatch(new RegExp(`aria-[a-z]+="[^"]*${SID}`));
    }
  });

  it('a link without sid renders as before and its links carry one new session (AC4)', async () => {
    for (const [name, page, params, search] of pages()) {
      const html = await render(page, params, search);
      const sids = new Set(guestTargets(html).map(sidOf).filter((s) => s !== null));
      expect(sids.size, name).toBe(1);
      expect([...sids][0], name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      for (const s of hiddenSid(html)) expect(s, name).toBe([...sids][0]);
    }
  });

  it('an invalid sid is replaced by a new one', async () => {
    const html = await render(MenuPage, {}, { sid: SID.toUpperCase() });
    const sid = sidOf(guestTargets(html)[0]);
    expect(sid).not.toBe(SID.toUpperCase());
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('page views of phase 1 (R1, R4, AC1, AC4, AC6a, AC6b)', () => {
  const events = async (sid: string) => { await settle(); return repo.listBySession(restaurantId, sid); };
  const names = (list: GuestInteraction[]) => list.map((e) => e.name);
  const newSid = (html: string) => sidOf(guestTargets(html).find((t) => sidOf(t))!)!;

  it('the QR path landing → menu → wines is one session with its start, both views and the wines shown (AC1)', async () => {
    const sid = newSid(await render(LandingPage, {}));
    await render(MenuPage, {}, { sid });
    await render(WinesPage, { dishId: duck }, { serving: 'glass', sid });
    const list = await events(sid);
    expect(names(list)).toEqual(['guest_session_started', 'menu_viewed', 'menu_viewed', 'recommendations_viewed']);
    expect(list[0].props).toEqual({ source: 'qr', menuVersion: publishedAt });
    const reco = list[3];
    expect(reco.dishId).toBe(duck);
    expect(reco.engineVersion).toMatch(/^wm-rules-/);
    expect(reco.props).toMatchObject({ prefs: { serving: 'glass' }, menuVersion: publishedAt });
    const { wineIds, items } = reco.props as { wineIds: string[]; items: Array<{ wineId: string; tier: string }> };
    expect(wineIds.length).toBeGreaterThan(0);
    expect(items.map((i) => i.wineId)).toEqual(wineIds);
    for (const i of items) expect(['sommelier_primary', 'sommelier', 'engine']).toContain(i.tier);
    expect(list.every((e) => e.sessionId === sid)).toBe(true);
  });

  it('a shared link to the wines without sid starts a `link` session (AC4); the filters sheet is not a new view', async () => {
    const sid = newSid(await render(WinesPage, { dishId: duck }, { serving: 'glass' }));
    await render(WinesPage, { dishId: duck }, { serving: 'glass', sheet: 'filters', sid });
    expect(names(await events(sid))).toEqual(['guest_session_started', 'recommendations_viewed']);
    expect((await events(sid))[0].props).toMatchObject({ source: 'link' });
  });

  it('other guest pages only start a new session in phase 1; the staff lookup records nothing', async () => {
    for (const [page, params, search] of [[TablePage, {}, {}], [WinePage, { wineId: wine }, { dish: duck }], [SelectedPage, { wineId: wine }, { dish: duck }], [TableResultPage, {}, { dishes: `${duck},${dessert}` }]] as const) {
      const sid = newSid(await render(page, params, search));
      expect(names(await events(sid))).toEqual(['guest_session_started']);
    }
    const staff = newSid(await render(StaffPage, {}, { dish: duck }));
    expect(await events(staff)).toEqual([]);
    await render(MenuPage, {}, { sid: staff });
    expect(names(await events(staff))).toEqual(['menu_viewed']);   // a staff sid on a guest page: no start (Q16)
  });

  it('an inactive wine on G8 records nothing', async () => {
    if (!inactiveWine) return;
    const html = await render(SelectedPage, { wineId: inactiveWine }, {});
    expect(await events(newSid(html))).toEqual([]);
  });

  it('a page that ends in 404 records nothing (AC6a)', async () => {
    const before = next().afterTasks.length;
    await expect(render(WinesPage, { dishId: '00000000-0000-4000-8000-000000000000' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(MenuPage, { slug: 'no-such-place' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(WinePage, { wineId: '00000000-0000-4000-8000-000000000000' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(next().afterTasks.length).toBe(before);
    expect(await events(UNUSED_SID)).toEqual([]);
  });

  it('our synthetic traffic, bots and prefetches render the page with a session but record nothing (AC6, AC6b)', async () => {
    for (const h of [{ [SYNTHETIC_TRAFFIC_HEADER]: '1' }, { 'user-agent': 'WhatsApp/2.23.20.0 A' }, { 'user-agent': '' }, { [PREFETCH_HEADER]: '1' }]) {
      const html = await render(LandingPage, {}, {}, h);
      expect(html).toContain('Halka');
      expect(await events(newSid(html))).toEqual([]);
    }
  });
});
