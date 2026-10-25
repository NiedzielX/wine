import { kpiWindow } from '@wine-match/core';
import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 2 (#21, AC4, AC5, AC12): A1 "Sales" on the built app and PostgreSQL. POS lines
 * go in with SQL under one confirmed import job, with business days in both KPI windows (the import itself is E03's
 * and is tested there). A1 lives in `(lists)` (streams): JavaScript on. The rows are removed at the end, so the other
 * suites see no sales.
 */

const JOB = 'e0420000-0000-4000-8000-000000000001';

async function signIn(b: AgentBrowser, base: string) {
  await b.open(`${base}/admin/login`);
  await b.waitForPageText('Work e-mail');
  await b.fill('input[name=email]', 'marta@halka.pl');
  await b.fill('input[name=password]', 'demo-halka-2026');
  await b.clickRole('button', 'Sign in');
  await b.waitForUrl('/admin/halka');
}

describe('A1 sales (PostgreSQL)', () => {
  const { browser, baseUrl } = e2eSuite('kpi-sales');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;
  const db = () => inject('e2e').databaseUrl;

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    await signIn(browser, baseUrl());
  });

  afterAll(async () => {
    await queryDatabase(db(), 'delete from sales_record where import_job_id = $1', [JOB]);
    await queryDatabase(db(), 'delete from import_job where id = $1', [JOB]);
    await browser.close();
  });

  it('AC5: without POS sales in the window, the empty state with "Import sales" — not zeros', async () => {
    await browser.open(`${baseUrl()}/admin/halka`);
    const text = await browser.waitForPageText('Upload a POS export to see attach rate');
    expect(text).toContain('Sales');
    expect(text).not.toContain('checks with food');
    expect(await browser.count('a[href="/admin/halka/import/sales"]')).toBeGreaterThan(0);
  });

  it('AC4 + Q3: the highlighted attach rate with N of M checks and the pp change, the amounts in %, and "Sales data through"', async () => {
    const [{ id: restaurant }] = await queryDatabase<{ id: string }>(db(), "select id::text from restaurant where slug = 'halka'");
    await queryDatabase(db(),
      `insert into import_job (id, restaurant_id, kind, file_name, file_type, file_size, status, created_by, created_at, confirmed_at)
       values ($1, $2, 'sales', 'e2e-sales.csv', 'csv', 1, 'confirmed', 'e2e', now(), now())`, [JOB, restaurant]);
    const w = kpiWindow(new Date());
    const rows: Array<[string, string, string, number, number]> = [];
    for (let i = 1; i <= 30; i++) {
      rows.push([w.current.from, `C${i}`, 'food', 1, 100]);
      if (i <= 12) rows.push([w.current.from, `C${i}`, 'wine_bottle', 1, 150]);
      rows.push([w.previous.to, `P${i}`, 'food', 1, 100]);
      if (i <= 9) rows.push([w.previous.to, `P${i}`, 'wine_bottle', 1, 150]);
    }
    const values = rows.map((_, i) => `(gen_random_uuid(), $1, $2, $${3 + i * 5}::date, $${4 + i * 5}, 2, $${5 + i * 5}, $${6 + i * 5}, $${7 + i * 5}, now())`).join(', ');
    await queryDatabase(db(),
      `insert into sales_record (id, restaurant_id, import_job_id, business_date, check_id, covers, item_type, quantity, net_amount, created_at) values ${values}`,
      [restaurant, JOB, ...rows.flat()]);

    await browser.open(`${baseUrl()}/admin/halka`);
    const text = await browser.waitForPageText('checks with food');
    expect(text).toMatch(/Wine attach rate\s*40\.0%/);   // 12 of 30 vs 9 of 30 = 30.0%
    expect(text).toContain('12 of 30 checks with food');
    expect(text).toMatch(/▲\s*Up\s*10\.0 pp vs previous 28 days/);
    expect(text).toMatch(/Wine revenue per table\s*60 zł/);   // 1800 / 30 vs 1350 / 30 = 45
    expect(text).toMatch(/▲\s*Up\s*33% vs previous 28 days/);
    expect(text).toMatch(/Average bottle\s*150 zł/);
    expect(text).toContain('Sales data through');   // the data ends on the first day of the window
    expect(text).not.toContain('Upload a POS export to see attach rate');
    expect(await browser.count('details[data-explain="sales-kpis"]')).toBe(1);
  });

  it('AC12: no horizontal page scroll at 390 px and 1440 px with the sales tiles', async () => {
    await browser.run('set', 'viewport', '390', '844');
    await browser.open(`${baseUrl()}/admin/halka`);
    await browser.waitForPageText('checks with food');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await browser.run('set', 'viewport', '1440', '900');
    await browser.open(`${baseUrl()}/admin/halka`);
    await browser.waitForPageText('checks with food');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
  });
});
