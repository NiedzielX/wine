import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-16-whole-table-waiter-path, phase 4 (R16, AC19 with the owner's decision Q4): how much wine for the
 * table, on the built app and PostgreSQL, in a browser where no script of the app runs (lesson e2e-without-javascript).
 * No amount until someone chooses the number of people; one tap on a number shows it; `people` travels G6 → G7 → G8.
 */

interface Row { name: string; props: Record<string, unknown> }
const eventsOf = (sid: string) => queryDatabase<Row>(inject('e2e').databaseUrl, 'select name, props from guest_interaction where session_id = $1 order by id', [sid]);
async function poll<T>(read: () => Promise<T[]>, count: number, timeoutMs = 5_000): Promise<T[]> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const rows = await read();
    if (rows.length >= count || Date.now() > until) return rows;
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('the table quantity without JavaScript (R16, AC19, Q4)', () => {
  const { browser, baseUrl } = e2eSuite('table-quantity');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;
  const noSideScroll = () => evalJs('document.documentElement.scrollWidth <= window.innerWidth');
  const tap = (selector: string) => browser.run('eval', `document.querySelector(${JSON.stringify(selector)}).click()`);
  let six = '';

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    const menu = (await (await fetch(`${baseUrl()}/api/v1/public/restaurants/halka/menu`)).json()) as { categories: Array<{ dishes: Array<{ id: string; name: string }> }> };
    const id = (name: string) => menu.categories.flatMap((c) => c.dishes).find((d) => d.name === name)!.id;
    six = ['Baltic herring', 'Seared scallops', 'Pike-perch', 'Salt-baked celeriac', 'Dry-aged ribeye, 300 g', 'Venison loin'].map(id).join(',');
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await browser.run('set', 'viewport', '390', '844');
  });
  afterAll(async () => {
    await browser.close();
  });

  it('390 px, G6: no amount before a choice; a tap on "6" shows 3 bottles · 960 zł; G7 and G8 keep the six people', async () => {
    await browser.open(`${baseUrl()}/r/halka/table/result?dishes=${six}&lang=en`);
    let page = await browser.waitForPageText('How many people are drinking wine?');
    expect(await evalJs('typeof window.next === "object" && !!window.next?.router')).toBe(false);
    expect(await browser.count('[data-table-quantity]')).toBe(0);
    expect(page).toContain('Choose how many people are drinking');
    expect(await noSideScroll()).toBe(true);

    await tap('a[aria-label="6 people"]');
    page = await browser.waitForPageText('For 6 people: 3 bottles');
    expect(page).toMatch(/For 6 people: 3 bottles · 960/);
    expect(await browser.count('a[aria-label="6 people"][aria-current="true"]')).toBe(1);
    expect(await noSideScroll()).toBe(true);
    const sid = new URL(await browser.url()).searchParams.get('sid')!;

    // the bottle card → G7 → "Choose this wine" (a GET form) → G8 "For the table" with the same amount
    await tap('a[href*="/r/halka/wine/"][href*="people=6"]');
    await browser.waitForPageText('Choose this wine');
    await browser.run('eval', '[...document.querySelectorAll("button[type=submit]")].find((b) => b.textContent.trim() === "Choose this wine").click()');
    page = await browser.waitForPageText('For the table');
    expect(page).toMatch(/For 6 people: 3 bottles · 960/);
    expect(await noSideScroll()).toBe(true);

    const rows = await poll(() => eventsOf(sid), 3);
    const viewed = rows.filter((r) => r.name === 'table_recommendation_viewed');
    expect(viewed.map((r) => r.props.people ?? null)).toEqual([null, 6]);
    expect(rows.find((r) => r.name === 'wine_selected')?.props).toMatchObject({ context: 'table', people: 6 });
  });

  it('1440 px, G11: the waiter taps "4" under the bottle — the amount, no sideways scroll', async () => {
    await browser.run('set', 'viewport', '1440', '900');
    await browser.open(`${baseUrl()}/r/halka/staff/table?dishes=${six}&lang=en`);
    await browser.waitForPageText('This bottle: No. 109 Radikon Slatnik.');
    expect(await browser.count('[data-table-quantity]')).toBe(0);
    await tap('[data-staff-table-result] a[aria-label="4 people"]');
    const page = await browser.waitForPageText('For 4 people:');
    expect(page).toContain('This bottle: No. 109 Radikon Slatnik.');
    expect(await noSideScroll()).toBe(true);
  });
});
