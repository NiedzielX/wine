import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Usage events of the guest path on the built app and PostgreSQL (spec 2026-10-15-guest-usage-events, phase 1, #12).
 * Without JavaScript a browser only loads HTML and follows links: plain requests with a phone's user agent do exactly
 * that (AC1, AC2, AC6a, AC6b). With JavaScript the real browser navigates softly and prefetches links (AC6).
 * These tests never send the synthetic-traffic header except where they test it.
 */

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface Row { name: string; dish_id: string | null; wine_id: string | null; props: Record<string, unknown>; engine_version: string | null; restaurant_id: string; session_id: string }

/** The events of one session, in order. The write runs after the response: poll until `count` rows are there. */
async function eventsOf(sid: string, count = 0, timeoutMs = 5_000): Promise<Row[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await queryDatabase<Row>(inject('e2e').databaseUrl,
      'select name, dish_id, wine_id, props, engine_version, restaurant_id::text, session_id::text from guest_interaction where session_id = $1 order by id', [sid]);
    if (rows.length >= count || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Waits long enough for an `after()` write that should not happen, then reads. */
async function noEventsOf(sid: string): Promise<Row[]> {
  await new Promise((r) => setTimeout(r, 1_000));
  return eventsOf(sid);
}

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${inject('e2e').baseUrl}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': 'en', ...headers }, redirect: 'manual' });
  return { res, html: (await res.text()).replace(/&amp;/g, '&') };
}

const sidIn = (html: string) => /[?&]sid=([0-9a-f-]{36})/.exec(html)?.[1] ?? '';
const halkaId = async () => (await queryDatabase<{ id: string }>(inject('e2e').databaseUrl, "select id::text from restaurant where slug = 'halka'"))[0].id;

describe('usage events without JavaScript (AC1, AC2, AC6a, AC6b)', () => {
  it('QR landing → menu → dish wines: one session with its start, both views and the wines shown; no cookie', async () => {
    const landing = await get('/r/halka');
    expect(landing.res.status).toBe(200);
    const sid = sidIn(landing.html);
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    const menuHref = /href="(\/r\/halka\/menu\?[^"]*)"/.exec((await get(`/r/halka/table?sid=${sid}`)).html)?.[1];
    expect(menuHref).toContain(`sid=${sid}`);
    const menu = await get(menuHref!);
    const dishHref = /href="(\/r\/halka\/dish\/[^"]+\/wines\?[^"]*)"/.exec(menu.html)?.[1];
    expect(dishHref).toContain(`sid=${sid}`);
    const wines = await get(dishHref!);
    expect(wines.res.status).toBe(200);
    for (const r of [landing.res, menu.res, wines.res]) expect(r.headers.get('set-cookie')).toBeNull();

    const rows = await eventsOf(sid, 4);
    expect(rows.map((r) => r.name)).toEqual(['guest_session_started', 'menu_viewed', 'menu_viewed', 'recommendations_viewed']);
    const restaurant = await halkaId();
    expect(rows.every((r) => r.restaurant_id === restaurant && r.session_id === sid)).toBe(true);
    expect(rows[0].props).toMatchObject({ source: 'qr' });
    expect(rows[0].props).toHaveProperty('menuVersion');
    const reco = rows[3];
    expect(reco.dish_id).toBe(/\/dish\/([^/]+)\/wines/.exec(dishHref!)![1]);
    expect(reco.engine_version).toMatch(/^wm-rules-/);
    expect((reco.props.wineIds as string[]).length).toBeGreaterThan(0);
    expect(reco.props.menuVersion).toBe(rows[0].props.menuVersion);
  });

  it('a shared link without sid starts a `link` session and its links carry it (AC4)', async () => {
    const menu = await get('/r/halka/menu');
    const dish = /href="\/r\/halka\/dish\/([^/]+)\/wines/.exec(menu.html)![1];
    const page = await get(`/r/halka/dish/${dish}/wines?serving=glass`);
    const sid = sidIn(page.html);
    const rows = await eventsOf(sid, 2);
    expect(rows.map((r) => r.name)).toEqual(['guest_session_started', 'recommendations_viewed']);
    expect(rows[0].props).toMatchObject({ source: 'link' });
    expect(rows[1].props).toMatchObject({ prefs: { serving: 'glass' } });
  });

  it('a page that ends in 404 records nothing (AC6a)', async () => {
    const sid = '0e2e0000-0000-4000-8000-000000000404';
    expect((await get(`/r/halka/dish/00000000-0000-4000-8000-000000000000/wines?sid=${sid}`)).res.status).toBe(404);
    expect((await get(`/r/no-such-place?sid=${sid}`)).res.status).toBe(404);
    expect(await noEventsOf(sid)).toEqual([]);
  });

  it('our synthetic traffic and a link preview get the page and record nothing (AC6b)', async () => {
    const synthetic = await get('/r/halka', { 'x-wine-match-synthetic': '1' });
    expect(synthetic.res.status).toBe(200);
    const preview = await get('/r/halka', { 'user-agent': 'WhatsApp/2.23.20.0 A' });
    expect(preview.res.status).toBe(200);
    expect(await noEventsOf(sidIn(synthetic.html))).toEqual([]);
    expect(await noEventsOf(sidIn(preview.html))).toEqual([]);
  });
});

describe('usage events with JavaScript (AC6)', () => {
  const { browser, baseUrl } = e2eSuite('usage');

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('prefetched links record nothing; each screen the guest opens records once', async () => {
    await browser.open(`${baseUrl()}/r/halka`);
    await browser.waitForPageText('Pick your dish');
    // let the router prefetch the dish links in view
    await new Promise((r) => setTimeout(r, 1_500));
    await browser.clickRole('link', 'Duck breast');
    const url = await browser.waitForUrl('/wines');
    const sid = new URL(url).searchParams.get('sid')!;
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    await browser.waitForPageText('By the glass');
    const rows = await eventsOf(sid, 3);
    await new Promise((r) => setTimeout(r, 1_000));
    expect((await eventsOf(sid)).map((r) => r.name)).toEqual(['guest_session_started', 'menu_viewed', 'recommendations_viewed']);
    expect(rows[2].dish_id).toBe(/\/dish\/([^/]+)\/wines/.exec(url)![1]);
  });
});
