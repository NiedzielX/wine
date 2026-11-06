import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startBuiltApp } from '@wine-match/testkit';
import { visibleText } from '../../../../scripts/lib/visible-text.mjs';
import { describe, expect, inject, it } from 'vitest';

/**
 * Spec 2026-11-04-sales-demo-and-roi-calculator, phase F1 (AC1, AC2, AC7, AC15, AC16 as far as plain HTTP reaches): the built app
 * on PostgreSQL with SHOWCASE_MODE=calculator (global setup) and a second one with the mode unset. No browser: the calculator is
 * plain HTML, and a form without JavaScript is a GET whose address this test builds from the form's own fields.
 */
const appDir = fileURLToPath(new URL('../..', import.meta.url));
const base = () => inject('e2e').baseUrl;
const appLog = () => readFileSync(`${appDir}/test-results/e2e-app.log`, 'utf8');
const showcaseViews = () => appLog().split('\n').filter((l) => l.includes('"msg":"showcase_view"'));
/** The words a person reads (a character-level reader, not a regular expression on markup). */
const textOf = visibleText;
const get = async (path: string, init?: RequestInit, root: string = base()) => {
  const res = await fetch(`${root}${path}`, init);
  return { res, html: (await res.text()).replace(/<!-- -->/g, '') };
};
const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
/** What the public demo instance runs with: memory, the flag that allows it, a public https address, production mode. */
const demoEnv = { NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', SHOWCASE_MODE: 'demo', PUBLIC_BASE_URL: 'https://demo.wine-match.example.com', AUTH_COOKIE_SECURE: 'false', LOG_LEVEL: 'info' };
const NO_AI = /\bAI\b|sztuczn/i;
const DEMO_PASSWORD = 'demo-halka-2026';

describe('the showcase in calculator mode', () => {
  it('serves the calculator and the summary, and answers 404 for the pages of the later phases', async () => {
    for (const path of ['/demo/roi', '/demo/roi/summary', '/demo/tour']) expect((await get(path)).res.status, path).toBe(200);
    for (const path of ['/demo', '/demo/panel', '/demo/kpi']) expect((await get(path)).res.status, path).toBe(404);
  });

  it('answers 404 on every /demo page while SHOWCASE_MODE is unset, and refuses to start with a wrong value', async () => {
    const env = { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: inject('e2e').databaseUrl, AUTH_COOKIE_SECURE: 'false', ALLOW_LOCAL_BASE_URL: 'true', LOG_LEVEL: 'info' };
    const off = await startBuiltApp({ cwd: appDir, readyPath: '/api/v1/public/restaurants/halka/menu', logFile: `${appDir}/test-results/e2e-showcase-off.log`, env });
    try {
      for (const path of ['/demo/roi', '/demo/roi/summary', '/demo/roi?customers=2000', '/demo', '/demo/tour', '/demo/panel', '/demo/kpi']) {
        const res = await fetch(`${off.url}${path}`);
        await res.arrayBuffer();
        expect(res.status, path).toBe(404);
      }
      expect((await fetch(`${off.url}/r/halka`)).status).toBe(200);
    } finally {
      await off.stop();
    }
    await expect(
      startBuiltApp({ cwd: appDir, readyPath: '/api/v1/health', logFile: `${appDir}/test-results/e2e-showcase-bad.log`, env: { ...env, SHOWCASE_MODE: 'calculater' } })
    ).rejects.toThrow(/exited with code 1[^]*invalid configuration[^]*SHOWCASE_MODE: must be \\+"off\\+", \\+"calculator\\+" or \\+"demo\\+"/);
  });

  it('keeps the numbers in the address: the same link gives the same figures, and a form sent without JavaScript changes the result', async () => {
    const link = '/demo/roi?lang=en&customers=2400&attachRate=41%2C5&wineSpend=210&margin=55&attachChange=-3&spendChange=4&planPrice=390';
    const first = await get(link);
    const again = await get(link);
    expect(first.html).toBe(again.html);
    // 2400 x (38.5% - 41.5%) x 210 + 2400 x 38.5% x 4 = -15 120 + 3 696 = -11 424 revenue; x 55% = -6 283.2; - 390 = -6 673.2
    const text = textOf(first.html);
    expect(text).toContain('-6,673 zł');
    expect(text).toContain('The value is negative');
    expect(text).toContain('2,400 × (38.5% − 41.5%) × 210 zł');

    // the form of the default page: read its fields and its action, fill one, and send it the way a browser does without a script
    const page = (await get('/demo/roi?lang=en')).html;
    const form = /<form[^>]*>/.exec(page)![0];
    expect(form).toContain('method="get"');
    const action = /action="([^"]*)"/.exec(form)![1];
    const fields = [...page.matchAll(/<input[^>]*>/g)].map((m) => m[0]).filter((tag) => /name="/.test(tag) && !/type="hidden"/.test(tag));
    expect(fields.length).toBe(7);
    for (const tag of fields) {
      const id = /id="([^"]+)"/.exec(tag)![1];
      expect(page, `label for ${id}`).toContain(`for="${id}"`);
    }
    const query = new URLSearchParams(fields.map((tag) => [/name="([^"]+)"/.exec(tag)![1], /value="([^"]*)"/.exec(tag)![1]]));
    expect(textOf(page)).toContain('9,110 zł');
    query.set('customers', '3000');
    const sent = await get(`${action.split('#')[0]}?${query.toString()}`);
    // the default case doubled: 3000 guests -> 22 500 attach + 10 500 spend = 33 000 revenue, 19 800 margin, 19 010 after the fee
    expect(textOf(sent.html)).toContain('19,010 zł');
    expect(textOf(sent.html)).not.toContain('9,110 zł');
  });

  it('falls back to the defaults for unusable values and names them, and never shows NaN or Infinity', async () => {
    const { res, html } = await get('/demo/roi?lang=en&customers=1e9&margin=-4&attachRate=abc&planPrice=&__proto__=x&wineSpend=1&wineSpend=2');
    expect(res.status).toBe(200);
    const text = textOf(html);
    expect(text).toContain('We used the default instead of these values');
    expect(text).toContain('9,110 zł');
    expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
    const summary = await get('/demo/roi/summary?lang=en&customers=-1&d=not-a-date');
    expect(summary.res.status).toBe(200);
    expect(textOf(summary.html)).toContain('Date: not set');
  });

  it('is never cached or indexed, sets no cookie, loads nothing from another host and logs one counter line without the numbers', async () => {
    const before = showcaseViews().length;
    const { res, html } = await get('/demo/roi?lang=pl&customers=31337');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(res.headers.getSetCookie()).toEqual([]);
    const own = new URL(base());
    const urls = [...html.matchAll(/(?:src|href|action)="([^"#]+)/g)].map((m) => m[1]).filter((u) => /^(https?:)?\/\//.test(u));
    expect(urls.filter((u) => new URL(u, base()).host !== own.host)).toEqual([]);
    expect(html).not.toMatch(/fonts\.googleapis|gstatic|cdn\./);
    // the stylesheets the page loads are ours too, and no font is fetched from outside
    for (const css of [...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1])) {
      const body = await (await fetch(`${base()}${css}`)).text();
      expect(body, css).not.toMatch(/url\(\s*["']?https?:/);
    }
    await new Promise((r) => setTimeout(r, 500));
    const lines = showcaseViews();
    expect(lines.length).toBe(before + 1);
    const entry = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['level', 'msg', 'page', 'time']);
    expect(entry.page).toBe('roi');
    expect(appLog()).not.toContain('31337');
  });

  it('prints through the browser’s own print path: the summary carries the print rules and the date given, not the clock’s', async () => {
    const { res, html } = await get('/demo/roi/summary?lang=en&d=2031-05-17');
    expect(res.status).toBe(200);
    expect(textOf(html)).toContain('Date: 17/05/2031');
    expect(html).not.toContain('data-print-button');
    expect(textOf(html)).toContain('Use Ctrl/Cmd+P to print or save as PDF.');
    expect(/<header[^>]*class="[^"]*print:hidden/.test(html)).toBe(true);
    const css = (await Promise.all([...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map(async (m) => (await fetch(`${base()}${m[1]}`)).text()))).join('\n');
    expect(css).toMatch(/@media print\{[^]*\.print\\:hidden\{display:none\}/);
    expect(css).toMatch(/@page\{size:A4/);
  });
});

describe('the showcase in demo mode (F2)', () => {
  it('serves the guide with working links, the tour and the ribbon on guest pages; the panel and KPI pages are not built yet', async () => {
    const demo = await startBuiltApp({ cwd: appDir, readyPath: '/demo', logFile: `${appDir}/test-results/e2e-showcase-demo.log`, env: demoEnv });
    try {
      const hub = await get('/demo?lang=pl', undefined, demo.url);
      expect(hub.res.status).toBe(200);
      expect(textOf(hub.html)).toContain('Demo: fikcyjna restauracja Halka');
      expect(textOf(hub.html)).not.toMatch(NO_AI);
      expect(hub.res.headers.get('cache-control')).toBe('private, no-store');
      expect(hub.res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(hub.res.headers.getSetCookie()).toEqual([]);
      const steps = hrefs(hub.html).filter((h) => h.startsWith('/r/'));
      expect(steps).toHaveLength(3);
      for (const step of steps) {
        const page = await get(step, undefined, demo.url);
        expect(page.res.status, step).toBe(200);
        expect(new URL(step, 'http://x').searchParams.has('sid'), step).toBe(false);
        // the ribbon of the demo, with the way back that carries the language only
        expect(page.html, step).toContain('data-demo-ribbon');
        expect(hrefs(page.html), step).toContain('/demo?lang=pl');
      }
      const first = await get(steps[0], undefined, demo.url);
      expect(textOf(first.html)).toContain('Para sommeliera');
      for (const path of ['/demo/panel', '/demo/kpi']) expect((await get(path, undefined, demo.url)).res.status, path).toBe(404);

      const tour = await get('/demo/tour?lang=en', undefined, demo.url);
      expect(tour.res.status).toBe(200);
      expect([...tour.html.matchAll(/data-section="(\w+)"/g)]).toHaveLength(5);
      expect(hrefs(tour.html)).toContain('/r/halka/how-it-works?lang=en');
      expect(textOf(tour.html)).not.toMatch(NO_AI);
      expect((await get('/demo/roi', undefined, demo.url)).res.status).toBe(200);
      // the main instance (calculator mode) shows no ribbon on its guest pages
      expect((await get('/r/halka')).html).not.toContain('data-demo-ribbon');
    } finally {
      await demo.stop();
    }
  });

  it('is read-only: no account exists, sign-in is refused with the demo password too, and the password is nowhere in a page', async () => {
    const demo = await startBuiltApp({ cwd: appDir, readyPath: '/demo', logFile: `${appDir}/test-results/e2e-showcase-demo-ro.log`, env: demoEnv });
    try {
      const login = await fetch(`${demo.url}/api/v1/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'marta@halka.pl', password: DEMO_PASSWORD })
      });
      const body = await login.text();
      expect(login.status).toBe(403);
      expect(JSON.parse(body)).toMatchObject({ error: { code: 'showcase_read_only' } });
      expect(body).not.toContain(DEMO_PASSWORD);
      expect(login.headers.getSetCookie()).toEqual([]);

      const page = await get('/admin/login?lang=en', undefined, demo.url);
      expect(page.res.status).toBe(200);
      expect(textOf(page.html)).toContain('read-only');
      expect(page.html).not.toContain('type="password"');
      expect(page.html).toContain('href="/demo"');
      for (const path of ['/demo', '/demo/tour', '/admin/login', '/r/halka']) {
        const { html } = await get(path, undefined, demo.url);
        expect(html, path).not.toContain(DEMO_PASSWORD);
        expect(textOf(html), path).not.toMatch(NO_AI);
      }
      // the panel needs a session and there is no way to get one
      const panel = await fetch(`${demo.url}/admin/halka`, { redirect: 'manual' });
      await panel.arrayBuffer();
      expect([302, 307, 308]).toContain(panel.status);
      expect(panel.headers.get('location')).toContain('/admin/login');
    } finally {
      await demo.stop();
    }
  });

  it('refuses to start in demo mode on PostgreSQL or without ALLOW_DEMO_DATA, naming the variable', async () => {
    const pg = { ...demoEnv, DATA_SOURCE: 'postgres', DATABASE_URL: inject('e2e').databaseUrl, ALLOW_LOCAL_BASE_URL: 'true' };
    await expect(startBuiltApp({ cwd: appDir, readyPath: '/api/v1/health', logFile: `${appDir}/test-results/e2e-showcase-demo-pg.log`, env: pg })).rejects.toThrow(/exited with code 1[^]*SHOWCASE_MODE=demo: requires DATA_SOURCE=memory/);
    const { ALLOW_DEMO_DATA: _flag, ...noFlag } = { ...demoEnv, NODE_ENV: 'development' } as Record<string, string>;
    await expect(startBuiltApp({ cwd: appDir, readyPath: '/api/v1/health', logFile: `${appDir}/test-results/e2e-showcase-demo-flag.log`, env: noFlag })).rejects.toThrow(/exited with code 1[^]*SHOWCASE_MODE=demo: requires ALLOW_DEMO_DATA=true/);
  });
});
