import { DEMO_PASSWORD, DEMO_USERS } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleText } from '../../../../scripts/lib/visible-text.mjs';
import { jsonReq } from './helpers';
import { login as loginAction } from '@/app/(admin)/admin/auth-actions';
import LoginPage from '@/app/(admin)/admin/login/page';
import GuestLayout from '@/app/(guest)/layout';
import DemoHubPage from '@/app/(showcase)/demo/page';
import TourPage from '@/app/(showcase)/demo/tour/page';
import MenuPage from '@/app/(guest)/r/[slug]/menu/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import StaffTablePage from '@/app/(guest)/r/[slug]/staff/table/page';
import { POST as loginPost } from '@/app/api/v1/auth/login/route';
import { createRequestScope } from '@/server/container';
import { hubSteps, pickShowcaseDish } from '@/server/showcase-hub';
import { shouldRecord } from '@/server/usage-events';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';

/**
 * Spec 2026-11-04-sales-demo-and-roi-calculator, phase F2: the `demo` mode. The gate of the new pages (R1, AC2), the guide DM0 (R6, AC9),
 * the tour DM1 (R10, AC14), the ribbon on guest pages (AC9), and the read-only guarantees (R9, AC13): no accounts, no sign-in, no guest
 * events. `SHOWCASE_MODE=demo` is simulated through the env module; the container then builds its in-memory store the way a demo instance does.
 */

const mode = vi.hoisted(() => ({ value: 'demo' as 'off' | 'calculator' | 'demo' }));
vi.mock('@/server/env', () => ({
  env: () => ({ showcaseMode: mode.value, dataSource: 'memory', demoRestaurantSlug: 'halka', logLevel: 'error' })
}));

// the sign-in page holds the client language switch, which reads the router
vi.mock('next/navigation', () => {
  const s = (globalThis as unknown as { __wmNext: { RedirectSignal: new (u: string) => Error; NotFoundSignal: new () => Error } }).__wmNext;
  return {
    redirect: (url: string) => { throw new s.RedirectSignal(url); },
    notFound: () => { throw new s.NotFoundSignal(); },
    usePathname: () => '/admin/login',
    useSearchParams: () => new URLSearchParams()
  };
});

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>>; cookies: Map<string, string> } }).__wmNext;
type Props = Record<string, unknown>;

async function render(page: unknown, props: Props = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', 'Mozilla/5.0 (iPhone) Safari');
  const { prelude } = await prerender(createElement(page as FunctionComponent<Props>, { searchParams: Promise.resolve({}), ...props }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const hrefs = (html: string) => [...html.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const NO_AI = /\bAI\b|sztuczn/i;

beforeEach(() => {
  mode.value = 'demo';
});

describe('the gate of the new pages (R1, AC2)', () => {
  it('off: the guide and the tour are a 404', async () => {
    mode.value = 'off';
    await expect(render(DemoHubPage)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(TourPage)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calculator: the tour is served (it reads no data), the guide is a 404', async () => {
    mode.value = 'calculator';
    expect(await render(TourPage)).toContain('<h1');
    await expect(render(DemoHubPage)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('demo: both are served', async () => {
    expect(await render(DemoHubPage)).toContain('<h1');
    expect(await render(TourPage)).toContain('<h1');
  });
});

describe('DM0 the guide (R6, AC9)', () => {
  it('shows the five steps; the three that exist are links with lang and without sid, the other two say they are coming', async () => {
    const html = await render(DemoHubPage, {}, 'pl');
    const text = visibleText(html);
    expect(text).toContain('Demo: fikcyjna restauracja Halka');
    expect([...html.matchAll(/data-step="(\w+)"/g)].map((m) => m[1])).toEqual(['guest', 'table', 'waiter', 'panel', 'kpi']);
    const targets = hrefs(html).filter((h) => h.startsWith('/r/'));
    expect(targets).toHaveLength(3);
    for (const t of targets) {
      const url = new URL(t, 'http://x');
      expect(url.searchParams.get('lang'), t).toBe('pl');
      expect(url.searchParams.has('sid'), t).toBe(false);
    }
    expect(targets[0]).toMatch(/^\/r\/halka\/dish\/[^/]+\/wines\?lang=pl$/);
    expect(targets[1]).toBe('/r/halka/table?lang=pl');
    expect(targets[2]).toBe('/r/halka/staff/table?lang=pl');
    expect(html.match(/data-soon/g)).toHaveLength(2);
    // no link to a page that is not built yet (the panel and the KPI page are phase F3)
    expect(hrefs(html).some((h) => h.startsWith('/demo/panel') || h.startsWith('/demo/kpi') || h.startsWith('/admin'))).toBe(false);
    expect(text).toContain('Halka to fikcyjna restauracja');
    expect(text).toContain('nie oznaczają żadnego partnerstwa');
  });

  it('every link of the guide answers 200 (the pages render), and the dish of step 1 has an approved pairing', async () => {
    const html = await render(DemoHubPage);
    const [guest, table, waiter] = hrefs(html).filter((h) => h.startsWith('/r/'));
    const c = (await createRequestScope()).cradle;
    const menu = (await c.catalogService.publishedMenu('halka'))!;
    const dishId = /\/dish\/([^/]+)\/wines/.exec(guest)![1];
    expect(menu.dishes.some((d) => d.id === dishId)).toBe(true);
    expect((await c.catalogService.pairingCoverage(menu.restaurant.id)).get(dishId)).toMatchObject({ approved: expect.any(Number), hasPrimary: true });
    const q = { slug: 'halka' };
    const wines = await render(WinesPage, { params: Promise.resolve({ ...q, dishId }), searchParams: Promise.resolve({ lang: 'en' }) });
    expect(visibleText(wines)).toContain('Sommelier’s pairing');
    expect(await render(TablePage, { params: Promise.resolve(q), searchParams: Promise.resolve({ lang: 'en' }) })).toContain('id="table-form"');
    expect(await render(StaffTablePage, { params: Promise.resolve(q), searchParams: Promise.resolve({ lang: 'en' }) })).toContain('<main');
    expect([guest, table, waiter]).toHaveLength(3);
  });

  it('a new step is one entry: with the panel and KPI pages ready, every step is a link', () => {
    const steps = hubSteps({ slug: 'halka', dishId: null, locale: 'en', panelReady: true, kpiReady: true });
    expect(steps.map((s) => s.href)).toEqual(['/r/halka/menu?lang=en', '/r/halka/table?lang=en', '/r/halka/staff/table?lang=en', '/demo/panel?lang=en', '/demo/kpi?lang=en']);
  });

  it('pickShowcaseDish takes the first dish in menu order with an approved pairing and a primary, else none', () => {
    const dishes = [{ id: 'd', category: 'Desserts' }, { id: 'b', category: 'Mains' }, { id: 'a', category: 'Starters' }];
    const cov = new Map([['d', { approved: 1, hasPrimary: true }], ['b', { approved: 2, hasPrimary: true }], ['a', { approved: 0, hasPrimary: false }]]);
    expect(pickShowcaseDish(dishes, cov)).toBe('b');
    expect(pickShowcaseDish(dishes, new Map([['b', { approved: 1, hasPrimary: false }]]))).toBeNull();
    expect(pickShowcaseDish([], cov)).toBeNull();
  });

  it('does not write a session or any guest event (a visit to the guide is not a guest session)', async () => {
    const html = await render(DemoHubPage);
    expect(html).not.toContain('sid=');
    expect(next().cookies.size).toBe(0);
  });
});

describe('DM1 the tour (R10, AC14)', () => {
  it('has the five sections, a link to G12 only in demo, and no AI wording in Polish and English', async () => {
    for (const lang of ['pl', 'en'] as const) {
      const html = await render(TourPage, {}, lang);
      expect([...html.matchAll(/data-section="(\w+)"/g)].map((m) => m[1])).toEqual(['sommelier', 'guest', 'waiter', 'sales', 'not']);
      expect(hrefs(html)).toContain(`/r/halka/how-it-works?lang=${lang}`);
      expect(visibleText(html)).not.toMatch(NO_AI);
      expect(html.match(/<h1/g)).toHaveLength(1);
    }
    const pln = visibleText(await render(TourPage, {}, 'pl'));
    expect(pln).toContain('Sommelier ma ostatnie słowo');
    expect(pln.split(/\s+/).length).toBeLessThan(400);
    mode.value = 'calculator';
    expect(hrefs(await render(TourPage))).not.toContain('/r/halka/how-it-works?lang=en');
  });

  it('keeps the sommelier-first labels exact (the seal only for approved or modified pairs)', async () => {
    const en_ = visibleText(await render(TourPage));
    expect(en_).toContain('Sommelier’s pairing');
    expect(en_).toContain('Recommended for your dish');
  });

  it('the dictionaries of the showcase have no AI wording, with the functions called on sample values', () => {
    const out: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === 'string') out.push(v);
      else if (typeof v === 'function') {
        for (const args of [[['a', 'b']], [3, '3'], ['5 pp', '2 pp'], ['150 zł'], ['x']] as unknown[][]) {
          try { out.push(String((v as (...a: unknown[]) => unknown)(...args))); } catch { /* wrong kind of arguments for this function */ }
        }
      }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(en.showcase);
    walk(pl.showcase);
    walk(en.admin.login);
    walk(pl.admin.login);
    expect(out.length).toBeGreaterThan(50);
    for (const s of out) expect(s).not.toMatch(NO_AI);
  });
});

describe('the ribbon (Q3, R6, AC9)', () => {
  const layout = async (lang: 'en' | 'pl' = 'en') => render(GuestLayout, { children: createElement('main', null, 'x') }, lang);

  it('demo: a strip "Demonstration data" with a link back to the guide that carries lang only', async () => {
    const html = await layout('pl');
    expect(html).toContain('data-demo-ribbon');
    expect(visibleText(html)).toContain('Dane demonstracyjne');
    expect(hrefs(html)).toContain('/demo?lang=pl');
    expect(html).not.toContain('sid=');
  });

  it('off and calculator: no strip', async () => {
    for (const m of ['off', 'calculator'] as const) {
      mode.value = m;
      expect(await layout()).not.toContain('data-demo-ribbon');
    }
  });
});

describe('read-only (R9, Q5, AC13)', () => {
  it('the container of the demo instance has no account at all, not even the published demo ones', async () => {
    const c = (await createRequestScope()).cradle;
    expect(DEMO_USERS.length).toBeGreaterThan(0);
    for (const u of DEMO_USERS) expect(await c.authRepository.findUserByEmail(u.email)).toBeNull();
  });

  it('the sign-in route answers 403 showcase_read_only, also with the right demo credentials, and never repeats the password', async () => {
    const res = await loginPost(jsonReq('http://localhost:3000/api/v1/auth/login', { email: DEMO_USERS[0].email, password: DEMO_PASSWORD }));
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'showcase_read_only' } });
    expect(text).not.toContain(DEMO_PASSWORD);
    expect(res.headers.get('set-cookie')).toBeNull();
    // even a body that would be refused as invalid does not reach validation
    expect((await loginPost(jsonReq('http://localhost:3000/api/v1/auth/login', { nope: 1 }))).status).toBe(403);
  });

  it('the sign-in form action redirects back with showcase_read_only and sets no cookie', async () => {
    const form = new FormData();
    form.set('email', DEMO_USERS[0].email);
    form.set('password', DEMO_PASSWORD);
    await expect(loginAction(form)).rejects.toMatchObject({ url: '/admin/login?error=showcase_read_only' });
    expect(next().cookies.size).toBe(0);
  });

  it('the sign-in page has no e-mail or password field, only the message and the way back', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const html = await render(LoginPage, {}, lang);
      expect(html).not.toContain('type="password"');
      expect(html).not.toContain('name="email"');
      expect(html).not.toContain(DEMO_PASSWORD);
      expect(html).toContain('href="/demo"');
      expect(visibleText(html)).toContain(lang === 'en' ? 'read-only' : 'tylko do odczytu');
      expect(visibleText(html)).not.toMatch(NO_AI);
    }
  });

  it('the guide, the tour and the sign-in page never contain the demo password', async () => {
    for (const page of [DemoHubPage, TourPage, LoginPage]) expect(await render(page)).not.toContain(DEMO_PASSWORD);
  });

  it('records no guest event: the filter says no, and three page views leave the table of interactions as it was', async () => {
    const chrome = { get: (n: string) => ({ 'user-agent': 'Mozilla/5.0 (iPhone) Safari' })[n.toLowerCase()] ?? null };
    expect(shouldRecord(chrome)).toBe(false);
    mode.value = 'calculator';
    expect(shouldRecord(chrome)).toBe(true);
    mode.value = 'demo';

    const c = (await createRequestScope()).cradle;
    const menu = (await c.catalogService.publishedMenu('halka'))!;
    const sid = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    const count = async () => (await c.guestInteractionRepository.listBySession(menu.restaurant.id, sid)).length;
    const before = await count();
    for (let i = 0; i < 3; i++) await render(MenuPage, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve({ sid }) });
    await Promise.all(next().afterTasks.splice(0));
    expect(await count()).toBe(before);
    expect(before).toBe(0);
  });
});
