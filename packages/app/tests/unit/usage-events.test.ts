import type { GuestInteraction, GuestInteractionRepository, UsageEventService } from '@wine-match/core';
import { NextRequest } from 'next/server';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import LandingPage from '@/app/(guest)/r/[slug]/page';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import HowItWorksPage from '@/app/(guest)/r/[slug]/how-it-works/page';
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
 * Spec 2026-10-15-guest-usage-events: the request filter, the write after the response, the session in every guest
 * link and form (AC4, AC5), the page views of G0, G1 and G3 (phase 1: AC1, AC6a, AC6b), the wine choice on G6–G8
 * (phase 2: AC7–AC9) and the staff lookup on G9 (phase 3: AC10, AC11) — rendered to HTML the way the server sends
 * them, on the in-memory data source.
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
const newSidOf = (html: string) => sidOf(guestTargets(html).find((t) => sidOf(t))!)!;

let repo: GuestInteractionRepository;
let restaurantId = '';
let publishedAt: string | null = null;
let duck = '';
let dessert = '';
let tartare = '';
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
  tartare = menu.dishes.find((d) => d.name === 'Beef tartare')!.id;
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
    ['G9 staff', StaffPage, {}, { dish: duck }],
    ['G12 how it works', HowItWorksPage, {}, { serving: 'glass' }]
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

  it('the table form (G5) only starts a new session; a staff sid on a guest page starts none (Q16)', async () => {
    const sid = newSid(await render(TablePage, {}, {}));
    expect(names(await events(sid))).toEqual(['guest_session_started']);
    const staff = newSid(await render(StaffPage, {}, {}));
    await render(MenuPage, {}, { sid: staff });
    expect(names(await events(staff))).toEqual(['menu_viewed']);
  });

  it('"How we pick your wine" (G12) records one view, in the session of the link (spec how-it-works-explanations, Q9)', async () => {
    const sid = newSid(await render(LandingPage, {}));
    await render(HowItWorksPage, {}, { sid });
    const list = await events(sid);
    expect(names(list)).toEqual(['guest_session_started', 'menu_viewed', 'explainer_viewed']);
    expect(list[2]).toMatchObject({ dishId: null, wineId: null, props: { menuVersion: publishedAt } });
    // a shared link straight to the page starts a `link` session
    const shared = newSid(await render(HowItWorksPage, {}, {}));
    expect(names(await events(shared))).toEqual(['guest_session_started', 'explainer_viewed']);
    expect((await events(shared))[0].props).toMatchObject({ source: 'link' });
    await expect(render(HowItWorksPage, { slug: 'no-such-place' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(await events(UNUSED_SID)).toEqual([]);
  });

  it('a page that ends in 404 records nothing (AC6a)', async () => {
    const before = next().afterTasks.length;
    await expect(render(WinesPage, { dishId: '00000000-0000-4000-8000-000000000000' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(MenuPage, { slug: 'no-such-place' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(WinePage, { wineId: '00000000-0000-4000-8000-000000000000' }, { sid: UNUSED_SID })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(SelectedPage, { wineId: '00000000-0000-4000-8000-000000000000' }, { sid: UNUSED_SID, dish: duck })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(StaffPage, { slug: 'no-such-place' }, { sid: UNUSED_SID, dish: duck })).rejects.toThrow('NEXT_NOT_FOUND');
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

describe('the wine choice: G6, G7, G8 (phase 2, #13, AC7–AC9)', () => {
  const events = async (sid: string) => { await settle(); return repo.listBySession(restaurantId, sid); };

  it('dish → wine → "Choose this wine": wine_viewed, then wine_selected with the dish, the serving and context dish (AC7)', async () => {
    const sid = '6b2c3d4e-5f60-4b7c-9d8e-0f1a2b3c4d5e';
    await render(WinePage, { wineId: wine }, { dish: duck, sid });
    await render(SelectedPage, { wineId: wine }, { dish: duck, serving: 'bottle', sid });
    const list = await events(sid);
    expect(list.map((e) => e.name)).toEqual(['wine_viewed', 'wine_selected']);
    expect(list[0]).toMatchObject({ dishId: duck, wineId: wine, props: { context: 'dish', menuVersion: publishedAt } });
    expect(list[1]).toMatchObject({ dishId: duck, wineId: wine, props: { serving: 'bottle', context: 'dish', menuVersion: publishedAt } });
    expect(list[1].props).not.toHaveProperty('dishIds');
    expect(list[1].engineVersion).toMatch(/^wm-rules-/);
  });

  it('a glass is recorded only for a wine poured by the glass; a selection link without sid starts a `link` session', async () => {
    const c = (await createRequestScope()).cradle;
    const wines = await c.wineRepository.listByRestaurant(restaurantId, { activeOnly: true });
    const byGlass = wines.find((w) => w.glassPrice !== null)!.id;
    const bottleOnly = wines.find((w) => w.glassPrice === null)!.id;
    const sid = newSidOf(await render(SelectedPage, { wineId: byGlass }, { serving: 'glass' }));
    await render(SelectedPage, { wineId: bottleOnly }, { serving: 'glass', sid });
    const list = await events(sid);
    expect(list.map((e) => e.name)).toEqual(['guest_session_started', 'wine_selected', 'wine_selected']);
    expect(list[0].props).toMatchObject({ source: 'link' });
    expect(list[1]).toMatchObject({ dishId: null, wineId: byGlass, props: { serving: 'glass', context: 'direct' } });
    expect(list[2]).toMatchObject({ wineId: bottleOnly, props: { serving: 'bottle', context: 'direct' } });
  });

  it('a dish id typed into the URL is not stored: the view is `direct`, without a dish (R8)', async () => {
    const sid = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    await render(WinePage, { wineId: wine }, { dish: 'not-a-dish', sid });
    expect(await events(sid)).toMatchObject([{ name: 'wine_viewed', dishId: null, props: { context: 'direct' } }]);
  });

  it('an inactive wine on G8 records nothing, not even a new session; its G7 view is recorded (AC8, Q6)', async () => {
    expect(inactiveWine).not.toBe('');
    const html = await render(SelectedPage, { wineId: inactiveWine }, { dish: duck });
    expect(html).toContain('no longer available');
    expect(await events(newSidOf(html))).toEqual([]);
    const sid = '7c3d4e5f-6071-4c8d-8e9f-1a2b3c4d5e6f';
    await render(SelectedPage, { wineId: inactiveWine }, { dish: duck, sid });
    expect(await events(sid)).toEqual([]);
    await render(WinePage, { wineId: inactiveWine }, { dish: duck, sid });
    expect(await events(sid)).toMatchObject([{ name: 'wine_viewed', wineId: inactiveWine }]);
  });

  it('table result → bottle → select: table_recommendation_viewed, wine_viewed, wine_selected with context table and dishIds (AC9)', async () => {
    const sid = '8d4e5f60-7182-4d9e-9fa0-2b3c4d5e6f70';
    const html = await render(TableResultPage, {}, { dishes: `${duck},${dessert},unknown`, sid });
    const bottle = /href="\/r\/halka\/wine\/([^/?"]+)\?table=([^&"]+)[^"]*"/.exec(html)!;
    const table = decodeURIComponent(bottle[2]);
    await render(WinePage, { wineId: bottle[1] }, { table, sid });
    await render(SelectedPage, { wineId: bottle[1] }, { table, serving: 'bottle', sid });
    const list = await events(sid);
    expect(list.map((e) => e.name)).toEqual(['table_recommendation_viewed', 'wine_viewed', 'wine_selected']);
    const shown = list[0].props as { dishIds: string[]; wineIds: string[]; budgetRelaxed: boolean };
    expect(shown.dishIds).toEqual([duck, dessert]);
    expect(shown.budgetRelaxed).toBe(false);
    expect(shown.wineIds[0]).toBe(bottle[1]);
    expect(list[0]).toMatchObject({ dishId: null, wineId: null });
    expect(list[1]).toMatchObject({ dishId: null, wineId: bottle[1], props: { context: 'table' } });
    expect(list[2]).toMatchObject({ dishId: null, wineId: bottle[1], props: { serving: 'bottle', context: 'table', dishIds: [duck, dessert] } });
  });

  it('a table budget no bottle meets is lifted and recorded as budgetRelaxed (spec whole-table-waiter-path, R13)', async () => {
    const sid = '8d4e5f60-7182-4d9e-9fa0-2b3c4d5e6f71';
    const html = await render(TableResultPage, {}, { dishes: `${duck},${dessert},${tartare}`, maxPrice: '150', sid });
    expect(html).toContain('Nothing matches under 150 zł');
    const [shown] = await events(sid);
    expect(shown).toMatchObject({ name: 'table_recommendation_viewed', props: { budgetRelaxed: true } });
    expect((shown.props as { wineIds: string[] }).wineIds).toHaveLength(2);
  });

  it('an id typed into `table=` never reaches the event (R8); fewer than two dishes is no table result', async () => {
    const sid = '9e5f6071-8293-4eaf-8fb1-3c4d5e6f7081';
    await render(SelectedPage, { wineId: wine }, { table: `${duck},<b>`, sid });
    await render(TableResultPage, {}, { dishes: duck, sid });
    expect(await events(sid)).toMatchObject([{ name: 'wine_selected', props: { context: 'table', dishIds: [duck] } }]);
  });
});

describe('the staff lookup: G9 (phase 3, #14, AC10, AC11)', () => {
  const events = async (sid: string) => { await settle(); return repo.listBySession(restaurantId, sid); };
  const everything = { from: new Date(0), to: new Date('2100-01-01') };

  it('a chosen dish records staff_lookup under the staff sid, without starting a guest session (AC10, AC11)', async () => {
    const sessionsBefore = await repo.countGuestSessions(restaurantId, everything);
    const html = await render(StaffPage, {}, { dish: duck, serving: 'glass' });
    const sid = newSidOf(html);
    const list = await events(sid);
    expect(list.map((e) => e.name)).toEqual(['staff_lookup']);
    expect(list[0]).toMatchObject({ dishId: duck, wineId: null, props: { source: 'staff', prefs: { serving: 'glass' }, menuVersion: publishedAt } });
    const wineIds = (list[0].props as { wineIds: string[] }).wineIds;
    expect(wineIds.length).toBeGreaterThan(0);
    expect(wineIds.length).toBe((html.match(/<article /g) ?? []).length);   // the wines the waiter sees, in that order
    await render(StaffPage, {}, { dish: dessert, sid });
    expect((await events(sid)).map((e) => e.name)).toEqual(['staff_lookup', 'staff_lookup']);
    expect(await repo.countGuestSessions(restaurantId, everything)).toBe(sessionsBefore);
  });

  it('without an explicit dish (the first dish is only shown) or with an unknown one, nothing is recorded (Q9)', async () => {
    const sid = 'af607182-93a4-4fb0-80c2-4d5e6f708192';
    await render(StaffPage, {}, { sid });
    await render(StaffPage, {}, { dish: 'not-a-dish', sid });
    expect(await events(sid)).toEqual([]);
  });

  it('an empty result is still a lookup (`wineIds: []`)', async () => {
    const sid = 'b0718293-a4b5-4c01-91d3-5e6f708192a3';
    // a dish and a style with no wine in the demo list (found, not assumed)
    const c = (await createRequestScope()).cradle;
    const menu = (await c.catalogService.publishedMenu('halka'))!;
    let empty: { dish: string; styles: string } | undefined;
    for (const d of menu.dishes) {
      for (const styles of ['sweet', 'orange', 'sparkling', 'rose', 'white', 'red'] as const) {
        const out = await c.recommendationService.forDish('halka', d.id, { serving: 'glass', styles: [styles], maxPrice: null, weight: 'any', mood: 'any' });
        if (out && out.result.items.length === 0) empty ??= { dish: d.id, styles };
      }
    }
    expect(empty).toBeDefined();
    const html = await render(StaffPage, {}, { dish: empty!.dish, styles: empty!.styles, serving: 'glass', sid });
    expect(html).not.toContain('<article ');
    expect(await events(sid)).toMatchObject([{ name: 'staff_lookup', props: { wineIds: [] } }]);
  });
});
