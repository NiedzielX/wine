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
    expect(page).toContain('Pair a bottle for the table');
    expect(page).toContain('Duck breast');
  });

  it('the menu lists the dishes by section', async () => {
    await browser.open(`${baseUrl()}/r/halka/menu`);
    const page = await browser.waitForPageText('Duck breast');
    expect(page).toContain('Starters');
  });

  it('one tap on a dish shows its wines and the quick preferences', async () => {
    await browser.clickRole('link', 'Duck breast');
    expect(await browser.waitForUrl('/wines')).toContain('/wines');
    const page = await browser.waitForPageText('Sommelier recommendation');
    expect(page).toContain('By the glass');
  });
});
