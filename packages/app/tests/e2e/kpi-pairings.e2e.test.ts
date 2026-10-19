import { kpiWindow, seedUsageEvents, type GuestInteractionInput } from '@wine-match/core';
import { closeOrm, getOrm, PgGuestInteractionRepository } from '@wine-match/db';
import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 3 (#22, AC7, AC8, AC12): A1 "Pairing performance" on the built app and
 * PostgreSQL. Events go in through `seedUsageEvents` and `PgGuestInteractionRepository` in the current KPI window (the
 * app itself only records "now", and today is outside the window). A dish and a wine get long names for the layout
 * check. The rows and the names are restored at the end, so the other suites see neither.
 */

const ENGINE = 'wm-e2e-e04-f3';
const DAY = 86_400_000;
const LONG_DISH = 'Slow-roasted duck breast with cherry and juniper jus, smoked beetroot purée, kopytka and a long name';
const LONG_WINE = 'Savigny-lès-Beaune Premier Cru Aux Vergelesses Vieilles Vignes Cuvée Exceptionnelle Sans Soufre Ajouté';

async function signIn(b: AgentBrowser, base: string) {
  await b.open(`${base}/admin/login`);
  await b.waitForPageText('Work e-mail');
  await b.fill('input[name=email]', 'marta@halka.pl');
  await b.fill('input[name=password]', 'demo-halka-2026');
  await b.clickRole('button', 'Sign in');
  await b.waitForUrl('/admin/halka');
}

describe('A1 pairing performance (PostgreSQL)', () => {
  const { browser, baseUrl } = e2eSuite('kpi-pairings');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;
  const restore: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    await signIn(browser, baseUrl());
  });

  afterAll(async () => {
    const db = inject('e2e').databaseUrl;
    await queryDatabase(db, 'delete from guest_interaction where engine_version = $1', [ENGINE]);
    for (const undo of restore) await undo();
    await closeOrm();
    await browser.close();
  });

  it('AC7 + AC8: seen pairings lead with shown, chosen, conversion and their source then; approved ones without views read "No views"', async () => {
    const db = inject('e2e').databaseUrl;
    const [{ id: restaurant }] = await queryDatabase<{ id: string }>(db, "select id::text from restaurant where slug = 'halka'");
    // an approved pairing of a published dish with an active wine, and another active wine of the same dish for the engine
    const [pair] = await queryDatabase<{ dish: string; wine: string; dishName: string; wineName: string }>(db,
      `select p.dish_id::text as dish, p.wine_id::text as wine, d.name as "dishName", w.name as "wineName"
         from pairing p join dish d on d.id = p.dish_id join wine w on w.id = p.wine_id
        where p.restaurant_id = $1 and p.status in ('approved', 'modified') and d.status = 'published' and w.active
          and d.deleted_at is null and w.deleted_at is null
        order by d.name, w.name limit 1`, [restaurant]);
    const [{ id: engineWine }] = await queryDatabase<{ id: string }>(db,
      `select id::text from wine where restaurant_id = $1 and active and deleted_at is null and id <> $2 order by name limit 1`, [restaurant, pair.wine]);
    restore.push(() => queryDatabase(db, 'update dish set name = $2 where id = $1', [pair.dish, pair.dishName]));
    restore.push(() => queryDatabase(db, 'update wine set name = $2 where id = $1', [pair.wine, pair.wineName]));
    await queryDatabase(db, 'update dish set name = $2 where id = $1', [pair.dish, LONG_DISH]);
    await queryDatabase(db, 'update wine set name = $2 where id = $1', [pair.wine, LONG_WINE]);

    const w = kpiWindow(new Date());
    const inCurrent = new Date(w.currentRange.from.getTime() + 3 * DAY);
    const inPrevious = new Date(w.previousRange.from.getTime() + 3 * DAY);
    let n = 0;
    const ev = (sessionId: string, name: GuestInteractionInput['name'], createdAt: Date, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: ENGINE, createdAt, ...extra });
    const saw = (at: Date, wineId: string, tier: string, select: boolean) => {
      const s = `e0430000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      return [
        ev(s, 'guest_session_started', at, { props: { source: 'qr', menuVersion: null } }),
        ev(s, 'recommendations_viewed', at, { dishId: pair.dish, props: { wineIds: [wineId], items: [{ wineId, tier }], menuVersion: null } }),
        ...(select ? [ev(s, 'wine_selected', at, { dishId: pair.dish, wineId, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
      ];
    };
    const events = [
      ...Array.from({ length: 12 }, (_, i) => saw(inCurrent, pair.wine, 'sommelier_primary', i < 3)).flat(),   // 3 of 12 = 25.0%
      ...Array.from({ length: 5 }, (_, i) => saw(inCurrent, engineWine, 'engine', i < 1)).flat(),             // 1 of 5 = 20.0%
      ...Array.from({ length: 9 }, () => saw(inPrevious, pair.wine, 'sommelier', true)).flat()                // not in the table
    ];
    const orm = await getOrm({ clientUrl: db, pool: { min: 0, max: 2 } });
    await seedUsageEvents(new PgGuestInteractionRepository({ em: orm.em.fork() }), restaurant, events);

    await browser.open(`${baseUrl()}/admin/halka`);
    const text = await browser.waitForPageText('Pairing performance');
    expect(text).toContain('Dish');
    const rows = await evalJs(`[...document.querySelectorAll('[data-pairing-row]')].map((r) => ({ source: r.dataset.pairingRow, cells: [...r.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim()) }))`) as Array<{ source: string; cells: string[] }>;
    expect(rows).toHaveLength(10);
    expect(rows[0].source).toBe('sommelier');
    expect(rows[0].cells[0]).toBe(LONG_DISH);
    expect(rows[0].cells[1]).toContain(LONG_WINE);
    expect(rows[0].cells.slice(2)).toEqual(['Sommelier', expect.stringMatching(/^\d+%/), '12', '3', '25.0%']);
    expect(rows[1].source).toBe('engine');
    expect(rows[1].cells.slice(4)).toEqual(['5', '1', '20.0%']);
    expect(rows.slice(2).every((r) => r.cells[6] === 'No views')).toBe(true);
    // the dish links to its pairings (A6)
    expect(await browser.count(`a[href="/admin/halka/pairings/${pair.dish}"]`)).toBeGreaterThan(0);
    expect(text).toMatch(/Show all \d+ pairings/);
  });

  it('?pairs=all shows every row; AC12: no horizontal page scroll at 390 px and 1440 px with long names', async () => {
    for (const [width, height] of [['390', '844'], ['1440', '900']]) {
      await browser.run('set', 'viewport', width, height);
      for (const path of ['/admin/halka', '/admin/halka?pairs=all']) {
        await browser.open(`${baseUrl()}${path}`);
        await browser.waitForPageText(LONG_DISH);
        expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth'), `${path} at ${width} px`).toBe(true);
      }
    }
    const all = await evalJs(`document.querySelectorAll('[data-pairing-row]').length`) as number;
    expect(all).toBeGreaterThan(10);
    expect(await browser.count('a[href="/admin/halka"]')).toBeGreaterThan(0);   // "Show top 10"
  });
});
