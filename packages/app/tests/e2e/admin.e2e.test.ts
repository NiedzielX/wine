import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentBrowser } from '@wine-match/testkit';
import { e2eSuite } from './support';

/** The restaurant side: the dashboard is closed until sign-in, then the sommelier works in it. */
describe('admin panel', () => {
  const { browser, baseUrl } = e2eSuite('admin');

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
  });
  afterAll(async () => {
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
