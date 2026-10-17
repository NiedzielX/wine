import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentBrowser } from '@wine-match/testkit';
import { e2eSuite } from './support';

/** The guest path: the bare address, the landing page, the dish list, one dish. */
describe('home page and the guest path', () => {
  const { browser, baseUrl } = e2eSuite('home');

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('the bare address opens the demo restaurant', async () => {
    await browser.open(`${baseUrl()}/`);
    expect(await browser.waitForUrl('/r/halka')).toMatch(/\/r\/halka$/);
  });

  it('the landing page names the restaurant and shows the menu right away', async () => {
    await browser.open(`${baseUrl()}/r/halka`);
    expect(await browser.text('h1')).toBe('Halka');
    const page = await browser.waitForPageText('Pick your dish');
    // spec 2026-10-16-whole-table-waiter-path, R8: the "Whole table" card above the menu, the header button gone
    expect(page).toContain('Several dishes on the table?');
    expect(page).toContain('Find a bottle for the table');
    expect(page).not.toContain('Pair a bottle for the table');
    expect(page).toContain('Duck breast');
  });

  it('the table result relaxes a budget no bottle meets: a notice and the closest bottles, with "n of m" (whole-table spec, AC15)', async () => {
    const menu = (await (await fetch(`${baseUrl()}/api/v1/public/restaurants/halka/menu`)).json()) as { categories: Array<{ dishes: Array<{ id: string; name: string }> }> };
    const id = (name: string) => menu.categories.flatMap((c) => c.dishes).find((d) => d.name === name)!.id;
    const dishes = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast', 'Pike-perch'].map(id).join(',');
    await browser.open(`${baseUrl()}/r/halka/table/result?dishes=${dishes}&styles=red&maxPrice=200`);
    const page = await browser.waitForPageText('Nothing matches under 200 zł');
    expect(page).not.toContain('No bottle fits these filters');
    expect(page).toMatch(/Works with|Not a strong match/);
    expect(await browser.count('details[data-explain="tableResult"]')).toBe(1);
  });

  it('the menu lists the dishes by section', async () => {
    await browser.open(`${baseUrl()}/r/halka/menu`);
    const page = await browser.waitForPageText('Duck breast');
    expect(page).toContain('Starters');
  });

  it('one tap on a dish shows its wines and the quick preferences', async () => {
    await browser.clickRole('link', 'Duck breast');
    expect(await browser.waitForUrl('/wines')).toContain('/wines');
    const page = await browser.waitForPageText('Sommelier’s pairing');
    expect(page).toContain('By the glass');
  });

  it('one closed "Why these wines?" above the wines; a tap opens it (spec 2026-10-16-how-it-works-explanations, AC2)', async () => {
    expect(await browser.count('details[data-explain]')).toBe(1);
    expect(await browser.count('details[data-explain="wines"][open]')).toBe(0);
    expect(await browser.count('a details, button details, p details')).toBe(0);
    await browser.click('details[data-explain="wines"] summary');
    expect(await browser.count('details[data-explain="wines"][open]')).toBe(1);
    expect(await browser.waitForPageText('price never raises it')).toContain('Sommelier’s pairing: chosen for this dish by Marta Wierzbicka');
  });
});
