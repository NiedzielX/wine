import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentBrowser } from '@wine-match/testkit';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-16-how-it-works-explanations, phase 2 (AC2, AC12, R10): the explanations on G0, G1, G5, G6 and G9 and the
 * "How we pick your wine" page (G12) WITHOUT JavaScript — every script request of the session is aborted before the
 * first page (lesson e2e-without-javascript), so the disclosures and the links work as plain HTML.
 */
describe('"How it works" on the guest screens and G12, without JavaScript', () => {
  const { browser, baseUrl } = e2eSuite('how-it-works');
  let dishes: Array<{ id: string; name: string }> = [];
  const id = (name: string) => dishes.find((d) => d.name === name)!.id;

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    const menu = (await (await fetch(`${baseUrl()}/api/v1/public/restaurants/halka/menu`)).json()) as { categories: Array<{ dishes: Array<{ id: string; name: string }> }> };
    dishes = menu.categories.flatMap((c) => c.dishes);
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
  });
  afterAll(async () => {
    await browser.close();
  });

  it('G0: no script runs; one closed "How do we pick your wine?" opens with a tap', async () => {
    await browser.open(`${baseUrl()}/r/halka`);
    await browser.waitForPageText('Pick your dish');
    expect((await browser.run('eval', 'typeof window.next === "object" && !!window.next?.router')).trim()).toBe('false');
    expect(await browser.count('details[data-explain]')).toBe(1);
    expect(await browser.count('details[data-explain="landing"][open]')).toBe(0);
    expect(await browser.count('a details, button details, p details')).toBe(0);
    await browser.click('details[data-explain="landing"] summary');
    expect(await browser.count('details[data-explain="landing"][open]')).toBe(1);
    expect(await browser.waitForPageText('No producer pays to be listed.')).toContain('recommended by Marta Wierzbicka');
  });

  it('G0 links to G12; G12 has the heading, the sections and the way back with the session', async () => {
    const href = (await browser.run('eval', 'document.querySelector(\'a[href^="/r/halka/how-it-works"]\').getAttribute("href")')).trim();
    expect(href).toMatch(/^"\/r\/halka\/how-it-works\?sid=[0-9a-f-]{36}"$/);
    const sid = /sid=([0-9a-f-]{36})/.exec(href)![1];
    await browser.run('eval', 'document.querySelector(\'a[href^="/r/halka/how-it-works"]\').click()');
    await browser.waitForUrl('/how-it-works');
    expect(await browser.text('h1')).toBe('How we pick your wine');
    const page = await browser.waitForPageText('The sommelier has the last word');
    expect(page).toContain('pinot noir with duck');
    expect(page).toContain('No producer pays to be listed.');
    expect(await browser.count('section[data-section]')).toBe(7);
    expect(await browser.count(`a[href="/r/halka?sid=${sid}"]`)).toBe(2);
  });

  it('G12 in Polish, and a 404 for an unknown restaurant', async () => {
    await browser.open(`${baseUrl()}/r/halka/how-it-works?lang=pl`);
    expect(await browser.text('h1')).toBe('Jak dobieramy wino');
    expect(await browser.count('a[href^="/r/halka?lang=pl&sid="]')).toBe(2);
    await browser.open(`${baseUrl()}/r/no-such-place/how-it-works`);
    expect(await browser.waitForPageText('This menu isn’t available')).toBeTruthy();
  });

  it('G1, G5, G6 and G9: exactly one explanation each, closed, never inside a link', async () => {
    const table = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast'].map(id).join(',');
    for (const [path, explain] of [
      ['/r/halka/menu', 'menu'],
      ['/r/halka/table', 'table'],
      [`/r/halka/table/result?dishes=${table}`, 'tableResult'],
      [`/r/halka/staff?dish=${id('Duck breast')}`, 'staff']
    ] as const) {
      await browser.open(`${baseUrl()}${path}`);
      await browser.waitForPageText(path.includes('staff') ? 'Pairing lookup' : 'Halka');
      expect(await browser.count('details[data-explain]'), path).toBe(1);
      expect(await browser.count(`details[data-explain="${explain}"]:not([open])`), path).toBe(1);
      expect(await browser.count('a details, button details, p details'), path).toBe(0);
    }
    // G6: the card header carries no seal (AC11); open the explanation without a script
    await browser.open(`${baseUrl()}/r/halka/table/result?dishes=${table}`);
    await browser.click('details[data-explain="tableResult"] summary');
    expect(await browser.waitForPageText('we also suggest a glass for each dish')).toContain('Works with');
    expect(await browser.count('a[href^="/r/halka/wine/"] > p svg')).toBe(0);
  });
});
