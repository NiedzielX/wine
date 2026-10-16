import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentBrowser } from '@wine-match/testkit';
import { e2eSuite } from './support';

/** The restaurant side: the dashboard is closed until sign-in, then the sommelier works in it. */
describe('admin panel', () => {
  const { browser, baseUrl } = e2eSuite('admin');

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
  });
  /** set while a test has guest settings changed, so a failure still leaves the restaurant as the other suites expect it */
  let restoreSettings: (() => Promise<void>) | undefined;
  afterAll(async () => {
    await restoreSettings?.().catch(() => undefined);
    await browser.close();
  });

  it('the dashboard sends a visitor who is not signed in to the sign-in page', async () => {
    await browser.open(`${baseUrl()}/admin`);
    expect(await browser.waitForUrl('/admin/login')).toContain('/admin/login');
    expect(await browser.waitForPageText('Work e-mail')).toContain('Work e-mail');
  });

  it('a wrong password gets one generic message and no access', async () => {
    await browser.fill('input[name=email]', 'marta@halka.pl');
    await browser.fill('input[name=password]', 'not-the-password-123');
    await browser.clickRole('button', 'Sign in');
    expect(await browser.waitForUrl('error=invalid_credentials')).toContain('/admin/login');
    expect(await browser.waitForPageText('incorrect, or the account is temporarily locked')).toContain('incorrect');
  });

  it('the sommelier signs in and lands on the restaurant dashboard', async () => {
    await browser.fill('input[name=email]', 'marta@halka.pl');
    await browser.fill('input[name=password]', 'demo-halka-2026');
    await browser.clickRole('button', 'Sign in');
    expect(await browser.waitForUrl('/admin/halka')).toMatch(/\/admin\/halka$/);
    const page = await browser.waitForPageText('Sommelier-led dishes');
    expect(page).toContain('Dashboard');
  });

  it('guest settings change what G3 and its explanation say (spec 2026-10-16-how-it-works-explanations, AC8, AC9)', async () => {
    const settings = async (on: boolean) => {
      await browser.open(`${baseUrl()}/admin/halka/publish`);
      await browser.waitForPageText('Guest settings');
      for (const name of ['showScores', 'showUnreviewed']) await browser.run(on ? 'check' : 'uncheck', `input[name=${name}]`);
      await browser.clickRole('button', 'Save settings');
      await browser.waitForUrl('saved=settings');
    };
    restoreSettings = () => settings(true);
    await settings(false);
    await browser.open(`${baseUrl()}/r/halka/menu`);
    await browser.waitForPageText('Duck breast');
    await browser.clickRole('link', 'Duck breast');
    await browser.waitForUrl('/wines');
    await browser.waitForPageText('Sommelier’s pairing');
    // no percentage and no number in the glass names; the explanation talks about the glass, not about engine picks
    expect(await browser.count('svg[role=img][aria-label^="Match "]')).toBe(0);
    expect(await browser.count('svg[role=img][aria-label="Match shown by how full the glass is"]')).toBeGreaterThan(0);
    await browser.click('details[data-explain="wines"] summary');
    const page = await browser.waitForPageText('A fuller glass means a better fit.');
    expect(page).not.toContain('Recommended for your dish');
    expect(page).not.toContain('pairing rules');
    expect(page).not.toMatch(/\d+%/);
    await settings(true);
    restoreSettings = undefined;
  });

  it('the menu opens from the sidebar with the seeded dishes', async () => {
    await browser.clickRole('link', 'Menu');
    expect(await browser.waitForUrl('/admin/halka/menu')).toContain('/admin/halka/menu');
    expect(await browser.waitForPageText('Beef tartare')).toContain('Beef tartare');
  });

  it('signing out ends the session', async () => {
    await browser.clickRole('button', 'Sign out');
    expect(await browser.waitForUrl('/admin/login')).toContain('/admin/login');
    await browser.open(`${baseUrl()}/admin/halka`);
    expect(await browser.waitForUrl('/admin/login')).toContain('/admin/login');
  });
});
