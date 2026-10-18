import { randomUUID } from 'node:crypto';
import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-16-whole-table-waiter-path, phase 2: the waiter's whole table G11 on the built app and PostgreSQL.
 * Without JavaScript the waiter's phone loads HTML, ticks native checkboxes and submits a GET form: plain requests do
 * exactly that for the events and codes (AC12, E09 Q19); a real browser with every script blocked checks the five taps,
 * the tile height and the width at 390 px and 1440 px (AC7). With JavaScript, the alternatives' links never prefetch a code.
 */

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface Row { name: string; wine_id: string | null; props: Record<string, unknown> }
interface Code { code: string; source: string; context: string; wine_id: string }

const db = <T>(sql: string, params: unknown[]) => queryDatabase<T>(inject('e2e').databaseUrl, sql, params);
const eventsOf = (sid: string) => db<Row>('select name, wine_id::text, props from guest_interaction where session_id = $1 order by id', [sid]);
const codesOf = (sid: string) => db<Code>('select code, source, context, wine_id::text from recommendation_code where session_id = $1 order by issued_at', [sid]);
/** The write runs after the response: poll until `count` rows are there (or the time is up). */
async function poll<T>(read: () => Promise<T[]>, count: number, timeoutMs = 5_000): Promise<T[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await read();
    if (rows.length >= count || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function get(path: string) {
  const res = await fetch(`${inject('e2e').baseUrl}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': 'en' }, redirect: 'manual' });
  return { res, html: (await res.text()).replace(/&amp;/g, '&') };
}
const sidIn = (html: string) => /name="sid" value="([0-9a-f-]{36})"/.exec(html)?.[1] ?? '';

describe('G11 without JavaScript: the lookup, the code, "Choose this one" (AC12, E09 Q19)', () => {
  it('G9 → "Whole table" → the form GET with four dishes: one staff_table_lookup and one staff code, no guest session', async () => {
    const staff = await get('/r/halka/staff');
    const tableHref = /href="(\/r\/halka\/staff\/table\?[^"]*)"/.exec(staff.html)![1];
    const form = await get(tableHref);
    expect(form.res.status).toBe(200);
    const sid = sidIn(form.html);
    expect(sid).toMatch(/^[0-9a-f-]{36}$/);
    const dishes = [...form.html.matchAll(/name="dish"[^>]* value="([^"]+)"/g)].map((m) => m[1]).slice(0, 4);
    expect(dishes).toHaveLength(4);
    // the form as a browser without JavaScript submits it: the hidden fields, the ticked tiles, the default budget
    const query = new URLSearchParams([['lang', 'en'], ['sid', sid], ...dishes.map((d) => ['dish', d] as [string, string]), ['maxPrice', '']]);
    const answer = await get(`/r/halka/staff/table?${query}`);
    expect(answer.res.status).toBe(200);
    expect(answer.html).toContain('This bottle:');
    expect(answer.html).toMatch(/Works with|Not a strong match/);
    expect(answer.res.headers.get('set-cookie')).toBeNull();

    const rows = await poll(() => eventsOf(sid), 1);
    await new Promise((r) => setTimeout(r, 1_000));
    expect((await eventsOf(sid)).map((r) => r.name)).toEqual(['staff_table_lookup']);
    expect(rows[0].props).toMatchObject({ source: 'staff', dishIds: dishes, budgetRelaxed: false });
    const wineIds = rows[0].props.wineIds as string[];
    expect(wineIds.length).toBeGreaterThan(0);
    expect(rows[0].wine_id).toBe(wineIds[0]);
    const codes = await codesOf(sid);
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ source: 'staff', context: 'table', wine_id: wineIds[0] });
    expect(answer.html).toContain(`data-recommendation-code="${codes[0].code}"`);

    // "Choose this one": the alternative becomes the bottle, with its own code and a lookup that names it
    const choose = /href="(\/r\/halka\/staff\/table\?[^"]*wine=[^"]+)"/.exec(answer.html)![1];
    const alt = new URL(choose, 'http://x').searchParams.get('wine')!;
    expect((await get(choose)).html).toContain('This bottle:');
    const after = await poll(() => eventsOf(sid), 2);
    expect(after[1]).toMatchObject({ name: 'staff_table_lookup', wine_id: alt, props: { pickedWineId: alt } });
    const both = await poll(() => codesOf(sid), 2);
    expect(both.map((c) => c.wine_id)).toEqual([wineIds[0], alt]);
  });

  it('G11 without dishes or with one dish records nothing and issues no code', async () => {
    const sid = '0e2e0000-0000-4000-8000-0000000000b1';
    const form = await get(`/r/halka/staff/table?sid=${sid}`);
    const dish = /name="dish"[^>]* value="([^"]+)"/.exec(form.html)![1];
    expect((await get(`/r/halka/staff/table?sid=${sid}&dish=${dish}`)).html).toContain('Tick at least two dishes.');
    await new Promise((r) => setTimeout(r, 1_000));
    expect(await eventsOf(sid)).toEqual([]);
    expect(await codesOf(sid)).toEqual([]);
  });
});

describe('G11 in a browser without JavaScript: five taps, 48 px tiles, no sideways scroll (AC7)', () => {
  const { browser, baseUrl } = e2eSuite('staff-table');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    // no script of the app ever runs in this session: the route is set before the first page (lesson e2e-without-javascript)
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await browser.run('set', 'viewport', '390', '844');
  });
  afterAll(async () => {
    await browser.close();
  });

  it('390 px: tick four tiles and press "Show the bottle" — the answer, from the form alone', async () => {
    await browser.open(`${baseUrl()}/r/halka/staff/table?lang=en`);
    await browser.waitForPageText('Show the bottle');
    expect(await evalJs('typeof window.next === "object" && !!window.next?.router')).toBe(false);
    expect(await evalJs('document.querySelectorAll(\'input[type="search"]\').length')).toBe(0);
    const heights = await evalJs('JSON.stringify([...document.querySelectorAll("[data-dish-name]")].map((t) => t.getBoundingClientRect().height))');
    for (const h of JSON.parse(heights as string) as number[]) expect(h).toBeGreaterThanOrEqual(48);
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    // four taps on the tiles (the label, as a finger would) and the fifth on the button: native clicks, no script of the page
    for (const name of ['beef tartare', 'wild mushroom risotto', 'duck breast', 'pike-perch']) {
      expect(await evalJs(`(() => { const t = document.querySelector('[data-dish-name="${name}"]'); if (!t) return false; t.click(); return true; })()`)).toBe(true);
    }
    expect(await evalJs('document.querySelectorAll(\'input[name="dish"]:checked\').length')).toBe(4);
    await browser.run('eval', '[...document.querySelectorAll("button[type=submit]")].find((b) => b.textContent.trim() === "Show the bottle").click()');
    const page = await browser.waitForPageText('This bottle:');
    expect(page).toContain('Works with all 4 dishes.');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    expect(await browser.count('details[data-explain="staffTable"]')).toBe(1);
    expect(await browser.count('[data-alternative]')).toBeLessThanOrEqual(2);
  });

  it('1440 px: the same answer in the 720 px column, no sideways scroll', async () => {
    await browser.run('set', 'viewport', '1440', '900');
    await browser.run('reload');
    await browser.waitForPageText('This bottle:');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  });
});

describe('G11 with JavaScript: alternatives are not prefetched, so they get no code (R6, Q10)', () => {
  const browser = new AgentBrowser(`wm-staff-table-js-${randomUUID().slice(0, 8)}`);
  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('one code for the bottle on screen after the router had time to prefetch the links in view', async () => {
    const menu = (await (await fetch(`${inject('e2e').baseUrl}/api/v1/public/restaurants/halka/menu`)).json()) as { categories: Array<{ dishes: Array<{ id: string; name: string }> }> };
    const id = (name: string) => menu.categories.flatMap((c) => c.dishes).find((d) => d.name === name)!.id;
    const sid = randomUUID();
    const dishes = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast', 'Pike-perch'].map(id).join(',');
    await browser.open(`${inject('e2e').baseUrl}/r/halka/staff/table?dishes=${dishes}&sid=${sid}`);
    await browser.waitForPageText('Choose this one');
    await new Promise((r) => setTimeout(r, 2_000));
    expect(await codesOf(sid)).toHaveLength(1);
  });
});
