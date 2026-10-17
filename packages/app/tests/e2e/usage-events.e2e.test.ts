import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Usage events of the guest path on the built app and PostgreSQL (spec 2026-10-15-guest-usage-events: phase 1 #12,
 * phase 2 #13 — the wine choice, phase 3 #14 — the staff lookup).
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

describe('wine choice and staff lookup without JavaScript (phases 2 and 3: AC7–AC10)', () => {
  const hrefs = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);
  /** The form of G7 submitted the way a browser without JavaScript does: action + its fields, the default serving. */
  const submitWine = (html: string, serving: 'glass' | 'bottle') => {
    const form = /<form [^>]*action="(\/r\/halka\/selected\/[^"]+)"[^>]*>([\s\S]*?)<\/form>/.exec(html)!;
    const fields = new URLSearchParams([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    fields.set('serving', serving);
    return `${form[1]}?${fields}`;
  };

  it('dish → wine → "Choose this wine": wine_viewed and wine_selected with dish, serving and context dish (AC7)', async () => {
    const menu = await get('/r/halka/menu');
    const sid = sidIn(menu.html);
    const winesHref = hrefs(menu.html, /href="(\/r\/halka\/dish\/[^"]+\/wines\?[^"]*)"/g)[0];
    const dish = /\/dish\/([^/]+)\/wines/.exec(winesHref)![1];
    const wines = await get(winesHref);
    const wineHref = hrefs(wines.html, /href="(\/r\/halka\/wine\/[^"]+)"/g)[0];
    expect(wineHref).toContain(`sid=${sid}`);
    const winePage = await get(wineHref);
    const wine = /\/wine\/([^/?]+)/.exec(wineHref)![1];
    const selected = await get(submitWine(winePage.html, 'bottle'));
    expect(selected.res.status).toBe(200);
    expect(selected.html).toContain('Show this to your waiter');
    expect(selected.res.headers.get('set-cookie')).toBeNull();

    const rows = await eventsOf(sid, 5);
    expect(rows.map((r) => r.name)).toEqual(['guest_session_started', 'menu_viewed', 'recommendations_viewed', 'wine_viewed', 'wine_selected']);
    expect(rows[3]).toMatchObject({ dish_id: dish, wine_id: wine, props: { context: 'dish' } });
    expect(rows[4]).toMatchObject({ dish_id: dish, wine_id: wine, props: { serving: 'bottle', context: 'dish' } });
    expect(rows[4].props.menuVersion).toBe(rows[0].props.menuVersion);
  });

  it('an inactive wine ("no longer available") or a wine not on the list (404) records no wine_selected (AC8)', async () => {
    const sid = '0e2e0000-0000-4000-8000-000000000008';
    const [inactive] = await queryDatabase<{ id: string }>(inject('e2e').databaseUrl,
      "select w.id::text from wine w join restaurant r on r.id = w.restaurant_id where r.slug = 'halka' and not w.active limit 1");
    expect(inactive).toBeDefined();
    const page = await get(`/r/halka/selected/${inactive.id}?serving=bottle&sid=${sid}`);
    expect(page.res.status).toBe(200);
    expect(page.html).toContain('no longer available');
    expect((await get(`/r/halka/selected/00000000-0000-4000-8000-000000000000?sid=${sid}`)).res.status).toBe(404);
    expect(await noEventsOf(sid)).toEqual([]);
  });

  it('table result → bottle → select: wine_selected with context table and the table dishes (AC9)', async () => {
    const table = await get('/r/halka/table');
    const sid = sidIn(table.html);
    const dishes = [...table.html.matchAll(/name="dish" value="([^"]+)"/g)].map((m) => m[1]).slice(0, 2);
    expect(dishes).toHaveLength(2);
    const result = await get(`/r/halka/table/result?dishes=${dishes.join(',')}&sid=${sid}`);
    expect(result.res.status).toBe(200);
    const bottleHref = hrefs(result.html, /href="(\/r\/halka\/wine\/[^"]+\?table=[^"]+)"/g)[0];
    const wine = /\/wine\/([^/?]+)/.exec(bottleHref)![1];
    const winePage = await get(bottleHref);
    await get(submitWine(winePage.html, 'bottle'));

    const rows = await eventsOf(sid, 4);
    expect(rows.map((r) => r.name)).toEqual(['guest_session_started', 'table_recommendation_viewed', 'wine_viewed', 'wine_selected']);
    expect(rows[1].props).toMatchObject({ dishIds: dishes });
    expect((rows[1].props.wineIds as string[])[0]).toBe(wine);
    expect(rows[3]).toMatchObject({ dish_id: null, wine_id: wine, props: { serving: 'bottle', context: 'table', dishIds: dishes } });
  });

  it('the staff lookup records staff_lookup under the waiter\'s own sid, without a guest session start (AC10)', async () => {
    const landing = await get('/r/halka');
    const guestSid = sidIn(landing.html);
    const staffHref = /href="(\/r\/halka\/staff[^"]*)"/.exec(landing.html)![1];
    expect(staffHref).not.toContain('sid=');   // "For staff" does not carry the guest's session
    const staff = await get(staffHref);
    const sid = sidIn(staff.html);
    expect(sid).not.toBe(guestSid);
    const dish = [...staff.html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])[1];
    // the waiter picks a dish and presses "Show": the form GET with its hidden fields
    const shown = await get(`/r/halka/staff?sid=${sid}&dish=${dish}`);
    expect(shown.res.status).toBe(200);

    const rows = await eventsOf(sid, 1);
    await new Promise((r) => setTimeout(r, 1_000));
    // the first visit showed the first dish without a choice: nothing; the chosen dish: one lookup, no session start
    expect((await eventsOf(sid)).map((r) => r.name)).toEqual(['staff_lookup']);
    expect(rows[0]).toMatchObject({ dish_id: dish, wine_id: null, props: { source: 'staff' } });
    expect((rows[0].props.wineIds as string[]).length).toBeGreaterThan(0);
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
