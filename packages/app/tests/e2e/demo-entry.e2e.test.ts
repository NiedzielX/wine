import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_PASSWORD } from '@wine-match/core';
import { startBuiltApp, queryDatabase, type RunningApp } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { visibleText } from '../../../../scripts/lib/visible-text.mjs';
import { snapshotDatabase } from './boundaries';

/**
 * Spec 2026-11-16-interactive-demo-entry (AC1, AC2, AC3, AC5, AC7): the interactive demo instance, as built. Two extra instances next to
 * the shared one (which has no ALLOW_DEMO_DATA and so is the negative control): PostgreSQL after `db:seed` with the flag and
 * `SHOWCASE_MODE=calculator`, and memory with the flag and no showcase mode. Plain HTTP: the start page, the card and "Sign in as …" are
 * forms and links that work without JavaScript, and the action is posted the way a browser without a script posts it.
 */
const appDir = fileURLToPath(new URL('../..', import.meta.url));
const RATE_LIMITS = 'public-api=1000000/1,login=1000000/1,code-issue=1000000/1,code-lookup=1000000/1,code-mark=1000000/1,pin-login=1000000/1';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const NO_AI = /\bAI\b|sztuczn/i;
const pgEnv = () => ({ NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: inject('e2e').databaseUrl, AUTH_COOKIE_SECURE: 'false', ALLOW_LOCAL_BASE_URL: 'true', ALLOW_DEMO_DATA: 'true', SHOWCASE_MODE: 'calculator', LOG_LEVEL: 'info', RATE_LIMITS });
const memEnv = { NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', PUBLIC_BASE_URL: 'https://demo.wine-match.example.com', AUTH_COOKIE_SECURE: 'false', LOG_LEVEL: 'info', RATE_LIMITS };

const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const get = async (root: string, path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${root}${path}`, { redirect: 'manual', headers: { 'user-agent': PHONE, ...headers } });
  return { res, html: (await res.text()).replace(/<!-- -->/g, '') };
};
/** A server action posted as a form without JavaScript, from the build's own manifest. */
async function action(root: string, path: string, exportedName: string, fields: Record<string, string>) {
  const manifest = JSON.parse(readFileSync(`${appDir}/.next/server/server-reference-manifest.json`, 'utf8')) as { node: Record<string, { exportedName: string }> };
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === exportedName)?.[0];
  if (!id) throw new Error(`no server action named ${exportedName} in the build`);
  const form = new FormData();
  form.set(`$ACTION_ID_${id}`, '');
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await fetch(`${root}${path}`, { method: 'POST', body: form, redirect: 'manual', headers: { 'user-agent': PHONE, origin: root } });
  await res.arrayBuffer();
  return { status: res.status, location: res.headers.get('location') ?? '', setCookie: res.headers.get('set-cookie') ?? '' };
}

let pg: RunningApp;
let mem: RunningApp;
let restore: (() => Promise<void>) | undefined;
beforeAll(async () => {
  restore = await snapshotDatabase();
  pg = await startBuiltApp({ cwd: appDir, readyPath: '/api/v1/public/restaurants/halka/menu', logFile: `${appDir}/test-results/e2e-demo-entry-pg.log`, env: pgEnv() });
  mem = await startBuiltApp({ cwd: appDir, readyPath: '/api/v1/public/restaurants/halka/menu', logFile: `${appDir}/test-results/e2e-demo-entry-mem.log`, env: memEnv });
});
afterAll(async () => {
  await pg?.stop();
  await mem?.stop();
  await restore?.();
});

describe('the interactive demo instance: the start page (AC2, AC5, AC7)', () => {
  it('/start opens every view of the seeded PostgreSQL demo in Polish and English, is never cached or indexed, and the way back leads to it', async () => {
    for (const lang of ['pl', 'en'] as const) {
      const start = await get(pg.url, `/start?lang=${lang}`);
      expect(start.res.status).toBe(200);
      expect(start.res.headers.get('cache-control')).toBe('private, no-store');
      expect(start.res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(start.res.headers.getSetCookie()).toEqual([]);
      expect(start.html).toContain('<meta name="robots" content="noindex, nofollow"/>');
      expect(visibleText(start.html)).not.toMatch(NO_AI);
      expect(visibleText(start.html)).toContain(lang === 'pl' ? 'Dane demonstracyjne' : 'Demonstration data');
      const links = hrefs(start.html).filter((h) => h.startsWith('/r/') || h.startsWith('/demo') || h.startsWith('/admin'));
      expect(links).toEqual([`/r/halka?lang=${lang}`, `/r/halka/table?lang=${lang}`, `/r/halka/staff?lang=${lang}`, `/r/halka/staff/table?lang=${lang}`, `/demo/roi?lang=${lang}`]);
      for (const link of links) expect((await get(pg.url, link)).res.status, link).toBe(200);
    }
    // the language follows the browser when no ?lang is given, and is English otherwise
    expect(visibleText((await get(pg.url, '/start', { 'accept-language': 'pl-PL' })).html)).toContain('Dane demonstracyjne');
    expect(visibleText((await get(pg.url, '/start')).html)).toContain('Demonstration data');
    // the QR page needs a session: without one it goes to the sign-in page, and /start does not link it
    const qr = await get(pg.url, '/admin/halka/qr');
    expect([302, 303, 307, 308]).toContain(qr.res.status);
    expect(qr.res.headers.get('location')).toContain('/admin/login');
    // owner's review 2026-11-16: the bare address is the guest view again; the guest pages carry a button to /start and say do not index
    const root = await get(pg.url, '/');
    expect(root.res.status).toBe(307);
    expect(root.res.headers.get('location')).toBe('/r/halka');
    const guest = await get(pg.url, '/r/halka?lang=pl');
    expect(guest.html).toContain('data-demo-ribbon="start"');
    expect(guest.html).toContain('data-demo-start-button');
    expect(visibleText(guest.html)).toContain('Demo: wybierz widok');
    expect(hrefs(guest.html)).toContain('/start?lang=pl');
    expect(guest.html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    // negative control: the shared instance has no flag, so /start is a 404 with the same headers, the bare address goes to the restaurant, no ribbon
    const base = inject('e2e').baseUrl;
    const plain = await get(base, '/start');
    expect(plain.res.status).toBe(404);
    expect(plain.res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect((await get(base, '/')).res.headers.get('location')).toBe('/r/halka');
    expect((await get(base, '/r/halka')).html).not.toContain('data-demo-ribbon');
  });

  it('on a memory instance without SHOWCASE_MODE the page works too, hides the calculator and answers 404 for its address', async () => {
    const start = await get(mem.url, '/start?lang=en');
    expect(start.res.status).toBe(200);
    expect(hrefs(start.html).some((h) => h.startsWith('/demo'))).toBe(false);
    expect((await get(mem.url, '/demo/roi')).res.status).toBe(404);
    for (const link of hrefs(start.html).filter((h) => h.startsWith('/r/'))) expect((await get(mem.url, link)).res.status, link).toBe(200);
    expect([...start.html.matchAll(/name="key" value="(\w+)"/g)].map((m) => m[1])).toEqual(['marta', 'tomasz']);
    // signing in works on memory as well
    const signed = await action(mem.url, '/start', 'loginAsDemo', { key: 'marta', lang: 'en' });
    expect(signed.status).toBe(303);
    expect(signed.location).toBe('/admin/halka');
    expect(signed.setCookie).toMatch(/wm_session=/);
  });
});

describe('the interactive demo instance: signing in as a demo account (AC1, AC3)', () => {
  const sessionCookie = (setCookie: string) => `wm_session=${/wm_session=([^;]+)/.exec(setCookie)![1]}`;
  const email = (k: string) => `${k}@halka.pl`;

  it('the card offers Marta and Tomasz with their e-mail and the public password, "Sign in as Tomasz" lands in his dashboard with a way back to /start, and no hash is in any page', async () => {
    const login = await get(pg.url, '/admin/login?lang=en');
    expect(login.html).toContain('data-demo-accounts');
    expect([...login.html.matchAll(/name="key" value="(\w+)"/g)].map((m) => m[1])).toEqual(['marta', 'tomasz']);
    expect(visibleText(login.html)).toContain('Sign in as Tomasz Lis (General Manager)');
    expect(login.html).not.toContain('kelner');
    // owner's review 2026-11-16: the account data are text on the card and on /start; the hash is never in a page; the guest pages carry none
    for (const root of [pg.url, mem.url]) {
      for (const path of ['/start?lang=pl', '/start?lang=en', '/admin/login?lang=pl', '/admin/login?lang=en']) {
        const text = visibleText((await get(root, path)).html);
        for (const e of ['marta@halka.pl', 'tomasz@halka.pl', DEMO_PASSWORD]) expect(text, `${root}${path}`).toContain(e);
      }
      for (const path of ['/start?lang=pl', '/admin/login?lang=pl', '/r/halka', '/r/halka/staff']) expect((await get(root, path)).html, path).not.toContain('scrypt$');
      for (const path of ['/r/halka', '/r/halka/staff']) expect((await get(root, path)).html, path).not.toContain(DEMO_PASSWORD);
    }
    // negative control: the shared instance has no flag, so the password is on no page
    for (const path of ['/start', '/admin/login', '/r/halka']) expect((await get(inject('e2e').baseUrl, path)).html, path).not.toContain(DEMO_PASSWORD);
    const signed = await action(pg.url, '/admin/login', 'loginAsDemo', { key: 'tomasz', lang: 'en' });
    expect(signed.status).toBe(303);
    expect(signed.location).toBe('/admin/halka');
    const cookie = sessionCookie(signed.setCookie);
    const me = await fetch(`${pg.url}/api/v1/auth/me`, { headers: { cookie } });
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email('tomasz'));
    const panel = await get(pg.url, '/admin/halka', { cookie });
    expect(panel.res.status).toBe(200);
    expect(hrefs(panel.html)).toContain('/start?lang=en');
    const sessions = await queryDatabase<{ n: string }>(inject('e2e').databaseUrl, `select count(*)::text as n from session s join app_user u on u.id = s.user_id where u.email = $1`, [email('tomasz')]);
    expect(Number(sessions[0]!.n)).toBeGreaterThan(0);
  });

  it('a waiter, an unknown key and a planted e-mail or password get no session; a wrong password in the ordinary form still counts, and after 5 the lock refuses the button too', async () => {
    for (const key of ['kelner', 'nobody', '']) {
      const r = await action(pg.url, '/admin/login', 'loginAsDemo', { key, email: email('tomasz'), password: DEMO_PASSWORD });
      expect(r.location, key).toBe('/admin/login?error=invalid_credentials');
      expect(r.setCookie, key).not.toMatch(/wm_session=[^;]/);
    }
    // the key decides, not the planted e-mail: this is Marta's session
    const asMarta = await action(pg.url, '/admin/login', 'loginAsDemo', { key: 'marta', email: email('tomasz'), password: 'x' });
    expect(asMarta.location).toBe('/admin/halka');
    const me = await fetch(`${pg.url}/api/v1/auth/me`, { headers: { cookie: sessionCookie(asMarta.setCookie) } });
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email('marta'));
    for (let i = 0; i < 5; i++) {
      expect((await action(pg.url, '/admin/login', 'login', { email: email('marta'), password: `wrong-password-${i}` })).location).toBe('/admin/login?error=invalid_credentials');
    }
    const locked = await action(pg.url, '/admin/login', 'loginAsDemo', { key: 'marta' });
    expect(locked.location).toBe('/admin/login?error=invalid_credentials');
    expect(locked.setCookie).not.toMatch(/wm_session=[^;]/);
    // the lock is per account: Tomasz still gets in
    expect((await action(pg.url, '/admin/login', 'loginAsDemo', { key: 'tomasz' })).location).toBe('/admin/halka');
    await queryDatabase(inject('e2e').databaseUrl, 'update app_user set failed_attempts = 0, locked_until = null where email = $1', [email('marta')]);
  });
});
