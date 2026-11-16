import { CatalogService, DEFAULT_AUTH_CONFIG, DEMO_PASSWORD, DEMO_USERS, type MemoryStore } from '@wine-match/core';
import { NextRequest } from 'next/server';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleText } from '../../../../scripts/lib/visible-text.mjs';
import { login as loginAction, loginAsDemo } from '@/app/(admin)/admin/auth-actions';
import { AdminShell } from '@/app/(admin)/admin/_components/admin-shell';
import LoginPage, { generateMetadata as loginMetadata } from '@/app/(admin)/admin/login/page';
import GuestLayout, { generateMetadata as guestMetadata } from '@/app/(guest)/layout';
import Home from '@/app/(guest)/page';
import LandingPage from '@/app/(guest)/r/[slug]/page';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import StaffTablePage from '@/app/(guest)/r/[slug]/staff/table/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import RoiPage from '@/app/(showcase)/demo/roi/page';
import StartPage from '@/app/(showcase)/start/page';
import { createRequestScope } from '@/server/container';
import { demoAccounts, demoStartSlug, isInteractiveDemo } from '@/server/demo-entry';
import { proxy } from '@/proxy';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';

/**
 * Spec 2026-11-16-interactive-demo-entry: the interactive demo instance (`ALLOW_DEMO_DATA=true` and `SHOWCASE_MODE` other than `demo`).
 * R1 the one function, R2 `/start`, R3 the accounts that really exist, R5 `loginAsDemo`, R6 no hash and no password in the HTML,
 * R7 language, R8 the way back, R9 no AI wording. The configuration is simulated through the env module; the in-memory container is built
 * once, with the demo accounts (the way a memory instance without `SHOWCASE_MODE=demo` has them).
 */

interface Cfg { allowDemoData: boolean; showcaseMode: 'off' | 'calculator' | 'demo'; dataSource: 'memory' | 'postgres'; demoRestaurantSlug: string }
const cfg = vi.hoisted((): { value: Cfg } => ({ value: { allowDemoData: true, showcaseMode: 'calculator', dataSource: 'memory', demoRestaurantSlug: 'halka' } }));
// the rest of the configuration is the real one of this suite (setup.ts: the very high limits), only the demo switches are simulated
vi.mock('@/server/env', async () => {
  const { parseEnv } = await vi.importActual<typeof import('@wine-match/core')>('@wine-match/core');
  return { env: () => ({ ...parseEnv(process.env), ...cfg.value, logLevel: 'error' as const }) };
});
vi.mock('next/navigation', () => {
  const s = (globalThis as unknown as { __wmNext: { RedirectSignal: new (u: string) => Error; NotFoundSignal: new () => Error } }).__wmNext;
  return {
    redirect: (url: string) => { throw new s.RedirectSignal(url); },
    notFound: () => { throw new s.NotFoundSignal(); },
    usePathname: () => '/start',
    useSearchParams: () => new URLSearchParams()
  };
});

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Props = Record<string, unknown>;

async function render(page: unknown, props: Props = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', 'Mozilla/5.0 (iPhone) Safari');
  const { prelude } = await prerender(createElement(page as FunctionComponent<Props>, { searchParams: Promise.resolve({}), ...props }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const search = (href: string) => Promise.resolve(Object.fromEntries(new URL(href, 'http://x').searchParams));
const NO_AI = /\bAI\b|sztuczn/i;
const setCfg = (patch: Partial<Cfg>) => { cfg.value = { allowDemoData: true, showcaseMode: 'calculator', dataSource: 'memory', demoRestaurantSlug: 'halka', ...patch }; };

const storeOf = async () => (await createRequestScope()).cradle.authRepository as unknown as { store: MemoryStore };
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };

beforeEach(() => { setCfg({}); next().cookies.clear(); });
afterEach(() => vi.restoreAllMocks());

describe('R1 the interactive mode is one function', () => {
  it('needs the flag and any mode but demo; the start slug additionally needs the Halka demo restaurant', () => {
    const e = (allowDemoData: boolean, showcaseMode: Cfg['showcaseMode'], demoRestaurantSlug = 'halka') => ({ allowDemoData, showcaseMode, demoRestaurantSlug });
    expect(isInteractiveDemo(e(true, 'off'))).toBe(true);
    expect(isInteractiveDemo(e(true, 'calculator'))).toBe(true);
    expect(isInteractiveDemo(e(true, 'demo'))).toBe(false);
    expect(isInteractiveDemo(e(false, 'off'))).toBe(false);
    expect(isInteractiveDemo(e(false, 'calculator'))).toBe(false);
    // an env without the field (the mock of another suite) is not interactive
    expect(isInteractiveDemo({ showcaseMode: 'off' } as never)).toBe(false);
    expect(demoStartSlug(e(true, 'off'))).toBe('halka');
    expect(demoStartSlug(e(true, 'off', 'pilot'))).toBeNull();
    expect(demoStartSlug(e(false, 'off'))).toBeNull();
    expect(demoStartSlug(e(true, 'demo'))).toBeNull();
  });
});

describe('R3, R6 demoAccounts: only existing accounts with dashboard access, never a hash', () => {
  it('memory + flag: Marta and Tomasz, no waiter, with key, name, role, e-mail and the public password and nothing else', async () => {
    const accounts = await demoAccounts((await createRequestScope()).cradle.authService);
    expect(accounts.map((a) => a.key)).toEqual(['marta', 'tomasz']);
    expect(accounts.map((a) => Object.keys(a).sort())).toEqual([['email', 'key', 'name', 'password', 'role'], ['email', 'key', 'name', 'password', 'role']]);
    expect(accounts.every((a) => a.password === DEMO_PASSWORD)).toBe(true);
    expect(JSON.stringify(accounts)).not.toMatch(/scrypt\$|passwordHash/);
  });

  it('postgres + flag on an installation WITHOUT the demo accounts: nothing is offered (the flag alone is not enough)', async () => {
    setCfg({ dataSource: 'postgres' });
    const store = (await storeOf()).store;
    const saved = store.users.splice(0);
    try {
      expect(await demoAccounts((await createRequestScope()).cradle.authService)).toEqual([]);
    } finally {
      store.users.push(...saved);
    }
  });

  it('asks the service, and offers nothing when the instance is not interactive', async () => {
    const asked = vi.fn(async () => new Set(['marta@halka.pl']));
    expect((await demoAccounts({ panelAccountsAmong: asked }, { allowDemoData: true, showcaseMode: 'off', demoRestaurantSlug: 'halka' })).map((a) => a.key)).toEqual(['marta']);
    expect(asked).toHaveBeenCalledWith(['marta@halka.pl', 'tomasz@halka.pl']);
    asked.mockClear();
    for (const e of [{ allowDemoData: false, showcaseMode: 'off' as const }, { allowDemoData: true, showcaseMode: 'demo' as const }, { allowDemoData: true, showcaseMode: 'off' as const, demoRestaurantSlug: 'pilot' }]) {
      expect(await demoAccounts({ panelAccountsAmong: asked }, { demoRestaurantSlug: 'halka', ...e })).toEqual([]);
    }
    expect(asked).not.toHaveBeenCalled();
  });
});

describe('R2 /start (AC2, AC7)', () => {
  it('links every view with the language, and each target page renders (no 404), in Polish and English', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const html = await render(StartPage, {}, lang);
      const links = hrefs(html).filter((h) => h.startsWith('/r/') || h.startsWith('/demo') || h.startsWith('/admin'));
      expect(links).toEqual([`/r/halka?lang=${lang}`, `/r/halka/table?lang=${lang}`, `/r/halka/staff?lang=${lang}`, `/r/halka/staff/table?lang=${lang}`, `/demo/roi?lang=${lang}`]);
      const q = { slug: 'halka' };
      const pages: Array<[unknown, string]> = [[LandingPage, links[0]], [TablePage, links[1]], [StaffPage, links[2]], [StaffTablePage, links[3]]];
      for (const [page, href] of pages) expect(await render(page, { params: Promise.resolve(q), searchParams: search(href) }, lang), href).toContain('<main');
      expect(await render(RoiPage, { searchParams: search(links[4]) }, lang)).toContain('<h1');
      expect(html.match(/<h1/g)).toHaveLength(1);
    }
  });

  it('the waiter has links but no sign-in button; the dashboard has one button per account with dashboard access', async () => {
    const html = await render(StartPage);
    expect([...html.matchAll(/name="key" value="(\w+)"/g)].map((m) => m[1])).toEqual(['marta', 'tomasz']);
    const text = visibleText(html);
    expect(text).toContain('Sign in as Marta Wierzbicka (Wine Director)');
    expect(text).toContain('Sign in as Tomasz Lis (General Manager)');
    expect(text).not.toContain('kelner');
    // owner's review 2026-11-16: the e-mail and the public password are text to copy, next to each button
    for (const u of DEMO_USERS.filter((d) => d.key === 'marta' || d.key === 'tomasz')) expect(text).toContain(u.email);
    expect(text).toContain(DEMO_PASSWORD);
    expect(html).not.toContain('scrypt$');
    // the QR page needs a session: it is not linked from a page without one
    expect(hrefs(html).some((h) => h.includes('/qr'))).toBe(false);
  });

  it('the calculator link is there only with SHOWCASE_MODE=calculator (and then its page is served, otherwise a 404)', async () => {
    for (const mode of ['off'] as const) {
      setCfg({ showcaseMode: mode });
      expect(hrefs(await render(StartPage)).some((h) => h.startsWith('/demo'))).toBe(false);
      await expect(render(RoiPage)).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('is a 404 without the flag (production), in the read-only demo mode and for a demo restaurant other than halka', async () => {
    for (const patch of [{ allowDemoData: false }, { allowDemoData: false, showcaseMode: 'off' as const }, { showcaseMode: 'demo' as const }, { demoRestaurantSlug: 'pilot' }]) {
      setCfg(patch);
      await expect(render(StartPage), JSON.stringify(patch)).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('when the menu of the demo restaurant is not published it says so and links no guest or waiter view', async () => {
    vi.spyOn(CatalogService.prototype, 'publishedMenu').mockResolvedValue(null);
    const html = await render(StartPage);
    expect(html).toContain('data-not-published');
    expect(hrefs(html).some((h) => h.startsWith('/r/'))).toBe(false);
    expect(visibleText(html)).toContain('not published yet');
    // the dashboard sign-in does not depend on the guest menu
    expect(html).toContain('name="key" value="marta"');
  });

  it('postgres + flag without the demo accounts: the page still opens, with no sign-in button', async () => {
    setCfg({ dataSource: 'postgres' });
    const store = (await storeOf()).store;
    const saved = store.users.splice(0);
    try {
      const html = await render(StartPage);
      expect(html).not.toContain('name="key"');
      expect(html).toContain('data-view="guest"');
    } finally {
      store.users.push(...saved);
    }
  });

  it('writes nothing: no cookie, no session id in a link', async () => {
    const html = await render(StartPage);
    expect(html).not.toContain('sid=');
    expect(next().cookies.size).toBe(0);
  });
});

describe('R4, R9 the warning and the wording (AC4, AC6)', () => {
  it('/start and the sign-in card say the data are demonstration data and that the lock concerns every visitor, 5 attempts and 15 minutes', async () => {
    expect(DEFAULT_AUTH_CONFIG).toMatchObject({ maxFailedAttempts: 5, lockMinutes: 15 });
    const start = { en: visibleText(await render(StartPage, {}, 'en')), pl: visibleText(await render(StartPage, {}, 'pl')) };
    expect(start.en).toContain('Demonstration data');
    expect(start.en).toContain('locked for every visitor');
    expect(start.en).toMatch(/5 wrong attempts.*15 minutes/);
    expect(start.pl).toContain('Dane demonstracyjne');
    expect(start.pl).toContain('dla każdego odwiedzającego');
    expect(start.pl).toMatch(/5 błędnych próbach.*15 minut/);
    const card = { en: visibleText(await render(LoginPage, {}, 'en')), pl: visibleText(await render(LoginPage, {}, 'pl')) };
    expect(card.en).toContain('Demonstration data');
    expect(card.en).toMatch(/5 wrong attempts.*15 minutes/);
    expect(card.pl).toContain('Dane demonstracyjne');
    expect(card.pl).toMatch(/5 błędnych próbach.*15 minut/);
  });

  it('N02: no text of /start, the ribbon or the card says AI, with the functions called on sample values', () => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
      else if (typeof v === 'function') out.push(String((v as (...a: unknown[]) => unknown)('Name', 'Role')));
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    for (const d of [en, pl]) { walk(d.showcase.start); walk(d.showcase.ribbon); walk(d.admin.login.demo); walk(d.admin.common.demoStart); }
    expect(out.length).toBeGreaterThan(25);
    for (const s of out) expect(s).not.toMatch(NO_AI);
  });

  it('the HTML of /start in both languages has no AI wording', async () => {
    for (const lang of ['pl', 'en'] as const) expect(visibleText(await render(StartPage, {}, lang))).not.toMatch(NO_AI);
  });
});

describe('R6 the HTML holds no hash ever and the public password only on an interactive instance (AC3, owner\'s review 2026-11-16)', () => {
  it('start, sign-in page, guest pages and the layout, for every configuration', async () => {
    const configs: Array<Partial<Cfg>> = [{}, { showcaseMode: 'off' }, { allowDemoData: false }, { allowDemoData: false, showcaseMode: 'off' }, { dataSource: 'postgres' }, { showcaseMode: 'demo' }, { demoRestaurantSlug: 'pilot' }];
    for (const patch of configs) {
      setCfg(patch);
      const interactive = cfg.value.allowDemoData && cfg.value.showcaseMode !== 'demo' && cfg.value.demoRestaurantSlug === 'halka';
      for (const page of [StartPage, LoginPage, Home]) {
        let html = '';
        try { html = await render(page); } catch { continue; /* a 404 or a redirect has no body */ }
        const where = `${page.name} ${JSON.stringify(patch)}`;
        expect(html, where).not.toContain('scrypt$');
        if (page === LoginPage || page === StartPage) {
          // the accounts exist in this suite's store, so an interactive instance shows the password; every other one never does
          if (interactive) expect(html, where).toContain(DEMO_PASSWORD);
          else expect(html, where).not.toContain(DEMO_PASSWORD);
        }
      }
      const guest = await render(GuestLayout, { children: createElement('main', null, 'x') });
      expect(guest).not.toContain(DEMO_PASSWORD);
      expect(guest).not.toContain('scrypt$');
    }
  });

  it('interactive on PostgreSQL without the demo accounts: no password anywhere', async () => {
    setCfg({ dataSource: 'postgres' });
    const store = (await storeOf()).store;
    const saved = store.users.splice(0);
    try {
      for (const page of [StartPage, LoginPage]) expect(await render(page)).not.toContain(DEMO_PASSWORD);
    } finally {
      store.users.push(...saved);
    }
  });
});

describe('the sign-in card (AC1, AC3)', () => {
  it('interactive: a card with two forms (Marta, Tomasz), a hidden key and language, the e-mail and the public password as text beside them, next to the ordinary form', async () => {
    const html = await render(LoginPage, {}, 'pl');
    expect(html).toContain('data-demo-accounts');
    expect([...html.matchAll(/name="key" value="(\w+)"/g)].map((m) => m[1])).toEqual(['marta', 'tomasz']);
    expect(html).toContain('name="lang" value="pl"');
    expect(html).toContain('type="password"');
    expect(visibleText(html)).toContain('Zaloguj jako Tomasz Lis (General Manager)');
    // the e-mail and the password are plain text for a person to copy, never a field value of the demo forms
    expect([...html.matchAll(/data-demo-email[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(['marta@halka.pl', 'tomasz@halka.pl']);
    expect([...html.matchAll(/data-demo-password[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual([DEMO_PASSWORD, DEMO_PASSWORD]);
    expect(html).not.toContain(`value="${DEMO_PASSWORD}"`);
    expect(html).not.toContain('scrypt$');
    expect(html).not.toContain('kelner');
    expect(hrefs(html)).toContain('/start?lang=pl');
  });

  it('no card in mode demo, without the flag, on postgres without the demo accounts, or for another demo restaurant', async () => {
    for (const patch of [{ showcaseMode: 'demo' as const }, { allowDemoData: false }, { demoRestaurantSlug: 'pilot' }]) {
      setCfg(patch);
      expect(await render(LoginPage), JSON.stringify(patch)).not.toContain('data-demo-accounts');
    }
    setCfg({ dataSource: 'postgres' });
    const store = (await storeOf()).store;
    const saved = store.users.splice(0);
    try {
      expect(await render(LoginPage)).not.toContain('data-demo-accounts');
    } finally {
      store.users.push(...saved);
    }
  });

  it('noindex on the sign-in page and the guest pages of an interactive instance, and none on a real one', async () => {
    const robots = async (meta: () => Promise<{ robots?: unknown }>) => { next().headers.clear(); return (await meta()).robots; };
    expect(await robots(loginMetadata)).toEqual({ index: false, follow: false });
    expect(await robots(guestMetadata)).toEqual({ index: false, follow: false });
    setCfg({ allowDemoData: false });
    expect(await robots(loginMetadata)).toBeUndefined();
    expect(await robots(guestMetadata)).toBeUndefined();
  });
});

describe('R5 loginAsDemo (AC1, AC3)', () => {
  const refused = (key: string) => expect(loginAsDemo(form({ key }))).rejects.toMatchObject({ url: '/admin/login?error=invalid_credentials' });

  it('signs Tomasz in with a 303 target of the demo dashboard and a session of tomasz@halka.pl', async () => {
    await expect(loginAsDemo(form({ key: 'tomasz' }))).rejects.toMatchObject({ url: '/admin/halka' });
    const token = next().cookies.get('wm_session')!;
    expect(token).toBeTruthy();
    expect((await (await createRequestScope()).cradle.authService.authenticate(token))?.user.email).toBe('tomasz@halka.pl');
  });

  it('takes only the key: an e-mail, a password, a restaurant or a next address in the form change nothing', async () => {
    await expect(loginAsDemo(form({ key: 'marta', email: 'tomasz@halka.pl', password: 'x', slug: 'other', next: '/admin/other' }))).rejects.toMatchObject({ url: '/admin/halka' });
    expect((await (await createRequestScope()).cradle.authService.authenticate(next().cookies.get('wm_session')!))?.user.email).toBe('marta@halka.pl');
  });

  it('refuses an unknown key, a key of a waiter, an inherited name and no key, without a session', async () => {
    for (const key of ['nobody', 'kelner', 'constructor', '__proto__', '']) await refused(key);
    expect(next().cookies.has('wm_session')).toBe(false);
  });

  it('refuses without the flag like a wrong password, and in mode demo with showcase_read_only; no session in either', async () => {
    setCfg({ allowDemoData: false });
    await refused('marta');
    setCfg({ showcaseMode: 'demo' });
    await expect(loginAsDemo(form({ key: 'marta' }))).rejects.toMatchObject({ url: '/admin/login?error=showcase_read_only' });
    setCfg({ demoRestaurantSlug: 'pilot' });
    await refused('marta');
    expect(next().cookies.has('wm_session')).toBe(false);
  });

  it('refuses when the account does not exist here (postgres + flag, no demo accounts)', async () => {
    setCfg({ dataSource: 'postgres' });
    const store = (await storeOf()).store;
    const saved = store.users.splice(0);
    try {
      await refused('marta');
    } finally {
      store.users.push(...saved);
    }
    expect(next().cookies.has('wm_session')).toBe(false);
  });

  it('stores the language of /start for the dashboard, only pl or en', async () => {
    await expect(loginAsDemo(form({ key: 'marta', lang: 'pl' }))).rejects.toMatchObject({ url: '/admin/halka' });
    expect(next().cookies.get('wm_lang')).toBe('pl');
    next().cookies.clear();
    await expect(loginAsDemo(form({ key: 'marta', lang: 'xx' }))).rejects.toMatchObject({ url: '/admin/halka' });
    expect(next().cookies.has('wm_lang')).toBe(false);
  });

  it('shares the lock with the ordinary form: after 5 wrong passwords the account is refused, also for the button, and it counts for everybody', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(loginAction(form({ email: 'marta@halka.pl', password: `wrong-${i}` }))).rejects.toMatchObject({ url: '/admin/login?error=invalid_credentials' });
    }
    await refused('marta');
    expect(next().cookies.has('wm_session')).toBe(false);
    // Tomasz is another account: the lock does not reach him
    await expect(loginAsDemo(form({ key: 'tomasz' }))).rejects.toMatchObject({ url: '/admin/halka' });
    const user = (await storeOf()).store.users.find((u) => u.email === 'marta@halka.pl')!;
    user.failedAttempts = 0;
    user.lockedUntil = null;
  });

  it('the ordinary form still refuses a wrong password', async () => {
    await expect(loginAction(form({ email: 'tomasz@halka.pl', password: 'nope' }))).rejects.toMatchObject({ url: '/admin/login?error=invalid_credentials' });
    expect(next().cookies.has('wm_session')).toBe(false);
  });
});

describe('R8 the way back (AC2)', () => {
  const layout = (lang: 'en' | 'pl' = 'en') => render(GuestLayout, { children: createElement('main', null, 'x') }, lang);

  it('interactive: a strip "Demonstration data" with a link to /start that carries lang only; the guide strip is not shown', async () => {
    const html = await layout('pl');
    expect(html).toContain('data-demo-ribbon="start"');
    expect(visibleText(html)).toContain('Dane demonstracyjne');
    expect(hrefs(html)).toContain('/start?lang=pl');
    expect(html).not.toContain('sid=');
    expect(html.match(/data-demo-ribbon/g)).toHaveLength(1);
    // owner's review 2026-11-16: a solid button, not a thin link
    expect(html).toMatch(/<a href="\/start\?lang=pl" data-demo-start-button[^>]*>Demo: wybierz widok<\/a>/);
    expect(visibleText(await layout('en'))).toContain('Demo: choose a view');
  });

  it('a real installation shows no strip; the read-only demo shows the guide strip, not this one', async () => {
    setCfg({ allowDemoData: false, showcaseMode: 'off' });
    expect(await layout()).not.toContain('data-demo-ribbon');
    setCfg({ showcaseMode: 'demo' });
    const demo = await layout();
    expect(demo).toContain('data-demo-ribbon="guide"');
    expect(hrefs(demo)).toContain('/demo?lang=en');
  });

  it('/ is the guest view of the demo restaurant on every instance, the interactive one included (owner\'s review 2026-11-16)', async () => {
    await expect(Promise.resolve().then(() => Home())).rejects.toMatchObject({ url: '/r/halka' });
    for (const patch of [{ allowDemoData: false }, { showcaseMode: 'demo' as const }, { demoRestaurantSlug: 'pilot' }]) {
      setCfg(patch);
      await expect(Promise.resolve().then(() => Home()), JSON.stringify(patch)).rejects.toMatchObject({ url: `/r/${cfg.value.demoRestaurantSlug}` });
    }
  });

  it('the dashboard frame links to /start only when asked', async () => {
    const restaurant = { slug: 'halka', name: 'Halka', address: 'ul. A 1', city: 'Gdansk' } as never;
    const frame = (demoStart: boolean) => render(AdminShell, { restaurant, reviewCount: 0, publishCount: 0, user: { name: 'T', role: 'GM' }, locale: 'pl', t: pl, back: '/admin/halka', demoStart, children: 'x' });
    const on = await frame(true);
    expect(hrefs(on).filter((h) => h.startsWith('/start'))).toEqual(['/start?lang=pl', '/start?lang=pl']);
    expect(visibleText(on)).toContain('Start dema');
    expect(hrefs(await frame(false)).some((h) => h.startsWith('/start'))).toBe(false);
  });
});

describe('R7 language of /start (AC5)', () => {
  const lang = (url: string, headers: Record<string, string> = {}) => proxy(new NextRequest(url, { headers })).headers.get('x-middleware-request-x-wine-lang');

  it('?lang, then Accept-Language, then English', () => {
    expect(lang('http://x/start?lang=pl')).toBe('pl');
    expect(lang('http://x/start', { 'accept-language': 'pl-PL' })).toBe('pl');
    expect(lang('http://x/start?lang=en', { 'accept-language': 'pl-PL' })).toBe('en');
    expect(lang('http://x/start')).toBe('en');
  });
});
