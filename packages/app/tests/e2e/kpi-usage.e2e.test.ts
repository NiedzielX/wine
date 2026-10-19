import { kpiWindow, seedUsageEvents, type GuestInteractionInput } from '@wine-match/core';
import { closeOrm, getOrm, PgGuestInteractionRepository } from '@wine-match/db';
import { queryDatabase } from '@wine-match/testkit';
import { AgentBrowser } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 1 (#20, AC1, AC2, AC12): A1 "Guest usage" on the built app and PostgreSQL.
 * Events go in through `seedUsageEvents` and `PgGuestInteractionRepository` with dates in both KPI windows (the app
 * itself only records "now", and today is outside the window). A1 lives in `(lists)` (streams): JavaScript on.
 * The rows are removed at the end, so the other suites see no guest usage.
 */

const ENGINE = 'wm-e2e-e04';
const DAY = 86_400_000;

async function signIn(b: AgentBrowser, base: string) {
  await b.open(`${base}/admin/login`);
  await b.waitForPageText('Work e-mail');
  await b.fill('input[name=email]', 'marta@halka.pl');
  await b.fill('input[name=password]', 'demo-halka-2026');
  await b.clickRole('button', 'Sign in');
  await b.waitForUrl('/admin/halka');
}

describe('A1 guest usage (PostgreSQL)', () => {
  const { browser, baseUrl } = e2eSuite('kpi-usage');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    await signIn(browser, baseUrl());
  });

  afterAll(async () => {
    await queryDatabase(inject('e2e').databaseUrl, 'delete from guest_interaction where engine_version = $1', [ENGINE]);
    await closeOrm();
    await browser.close();
  });

  it('AC2: without guest sessions in either window, the empty state with the QR code link — not zeros', async () => {
    await browser.open(`${baseUrl()}/admin/halka`);
    const text = await browser.waitForPageText('No guests have used Wine Match yet');
    expect(text).toContain('Guest usage');
    expect(text).not.toContain('Guest sessions');
    expect(await browser.count('a[href="/admin/halka/qr"]')).toBeGreaterThan(0);
  });

  it('AC1 + AC3: sessions, views and the conversion with N of M and the change; the waiter apart', async () => {
    const db = inject('e2e').databaseUrl;
    const [{ id: restaurant }] = await queryDatabase<{ id: string }>(db, "select id::text from restaurant where slug = 'halka'");
    const [{ id: dish }] = await queryDatabase<{ id: string }>(db, "select id::text from dish where restaurant_id = $1 and status = 'published' order by name limit 1", [restaurant]);
    const [{ id: wine }] = await queryDatabase<{ id: string }>(db, 'select id::text from wine where restaurant_id = $1 and active order by name limit 1', [restaurant]);
    const w = kpiWindow(new Date());
    const inCurrent = new Date(w.currentRange.from.getTime() + 2 * DAY);
    const inPrevious = new Date(w.previousRange.from.getTime() + 2 * DAY);
    let n = 0;
    const ev = (sessionId: string, name: GuestInteractionInput['name'], createdAt: Date, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: ENGINE, createdAt, ...extra });
    const guest = (at: Date, select: boolean) => {
      const s = `e0400000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
      return [
        ev(s, 'guest_session_started', at, { props: { source: 'qr', menuVersion: null } }),
        ev(s, 'recommendations_viewed', at, { dishId: dish, props: { wineIds: [wine], items: [{ wineId: wine, tier: 'engine' }], menuVersion: null } }),
        ...(select ? [ev(s, 'wine_selected', at, { dishId: dish, wineId: wine, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
      ];
    };
    const events = [
      ...Array.from({ length: 40 }, (_, i) => guest(inCurrent, i < 14)).flat(),
      ...Array.from({ length: 32 }, (_, i) => guest(inPrevious, i < 8)).flat(),
      // the waiter: a lookup without a guest session start
      ev('e0400000-0000-4000-8000-0000000000ff', 'staff_lookup', inCurrent, { dishId: dish, props: { source: 'staff', prefs: {}, wineIds: [wine], menuVersion: null } })
    ];
    const orm = await getOrm({ clientUrl: db, pool: { min: 0, max: 2 } });
    await seedUsageEvents(new PgGuestInteractionRepository({ em: orm.em.fork() }), restaurant, events);

    await browser.open(`${baseUrl()}/admin/halka`);
    const text = await browser.waitForPageText('Guest sessions');
    expect(text).toContain('Guest usage');
    expect(text).toMatch(/Guest sessions\s*40/);
    expect(text).toMatch(/▲\s*Up\s*25% vs previous 28 days/);   // 40 vs 32
    expect(text).toMatch(/Dish recommendations viewed\s*40/);
    expect(text).toMatch(/Recommendation → selection\s*35\.0%/);   // 14 of 40 vs 8 of 32 = 25.0%
    expect(text).toContain('14 of 40 sessions · dish recommendations only');
    expect(text).toMatch(/▲\s*Up\s*10\.0 pp vs previous 28 days/);
    expect(text).toMatch(/Waiter lookups\s*1/);
    expect(text).not.toContain('No guests have used Wine Match yet');
    expect(await browser.count('details[data-explain="usage"]')).toBe(1);
  });

  it('AC12: no horizontal page scroll at 390 px and 1440 px', async () => {
    await browser.run('set', 'viewport', '390', '844');
    await browser.open(`${baseUrl()}/admin/halka`);
    await browser.waitForPageText('Guest sessions');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await browser.run('set', 'viewport', '1440', '900');
    await browser.open(`${baseUrl()}/admin/halka`);
    await browser.waitForPageText('Guest sessions');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  });
});
