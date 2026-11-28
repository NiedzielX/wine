import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { snapshotDatabase } from './boundaries';
import { LAUNCH, seedSales } from './proof-seed';
import { e2eSuite } from './support';

/**
 * A33 "Results report", AC14 (spec 2026-11-18-owner-proof-report): the screen fits the page width on a phone and on a desktop in the
 * states with a result, with "not enough data" and with an error message. The database is recorded first and put back at the end:
 * Halka gets a launch day and POS lines with the numbers of H2 of the specification.
 */
describe('A33 results report layout (PostgreSQL)', () => {
  const { browser, baseUrl } = e2eSuite('proof-layout');
  const db = () => inject('e2e').databaseUrl;
  let restore: (() => Promise<void>) | undefined;
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    restore = await snapshotDatabase();
    await queryDatabase(db(), 'delete from proof_launch_day', []);
    await queryDatabase(db(), `delete from sales_record where restaurant_id = (select id from restaurant where slug = 'halka')`, []);
    await queryDatabase(db(), `insert into proof_launch_day (id, restaurant_id, seq, launch_day, reason, set_by_role, set_by_membership_id, set_at) select gen_random_uuid(), id, 1, $1::date, null, 'manager', null, now() from restaurant where slug = 'halka'`, [LAUNCH]);
    await seedSales('halka', 'HALKA', [120, 42], [130, 65]);
    await browser.open(`${baseUrl()}/admin/login`);
    await browser.waitForPageText('Work e-mail');
    await browser.fill('input[name=email]', 'tomasz@halka.pl');
    await browser.fill('input[name=password]', 'demo-halka-2026');
    await browser.clickRole('button', 'Sign in');
    await browser.waitForUrl('/admin/halka');
  }, 120_000);

  afterAll(async () => {
    await restore?.();
    await browser.close();
  });

  it('AC14: no horizontal page scroll at 390 px and 1440 px with the result, with not enough data and with the error message', async () => {
    for (const [width, height] of [['390', '844'], ['1440', '900']] as const) {
      await browser.run('set', 'viewport', width, height);
      for (const [query, marker] of [['?window=1', 'Window 1:'], ['?window=2', 'Not enough data to show a change'], ['?window=99', 'This window does not exist']] as const) {
        await browser.open(`${baseUrl()}/admin/halka/proof${query}`);
        await browser.waitForPageText(marker);
        expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth'), `${width}px ${query}`).toBe(true);
      }
    }
  });
});
