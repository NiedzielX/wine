import { MemoryRateLimiter, RateLimitGuard, parseEnv, type RateLimiter } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login as loginAction } from '@/app/(admin)/admin/auth-actions';
import { markCode } from '@/app/(guest)/r/[slug]/staff/actions';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { GET as healthGet } from '@/app/api/v1/health/route';
import { GET as metricsGet } from '@/app/api/v1/metrics/route';
import { GET as menuGet } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { clientAddress, clientKey, countingUnit } from '@/server/client-key';
import { createRequestScope } from '@/server/container';
import { renderMetrics, resetMetrics } from '@/server/metrics';
import { issueCodeForPage } from '@/server/recommendation-code';
import { jsonReq, req } from './helpers';

/**
 * Spec E21 F3: R8 (client key, trusted proxy hops), R9 and AC7/AC8 per route class: public API, sign-in (route and form), code
 * issue (G8/G11), code lookup and "Ordered" (G9). In memory, with low limits set through the configuration, a fake clock for the
 * window and a unique client address per case (the limiter of the process is shared by the whole file).
 */

const state = { hops: '1', limits: 'public-api=3/60,login=3/600,code-issue=2/600,code-lookup=1/600,code-mark=1/600', metrics: undefined as string | undefined };
vi.mock('@/server/env', () => ({ env: () => parseEnv({ ...process.env, TRUSTED_PROXY_HOPS: state.hops, RATE_LIMITS: state.limits, METRICS_TOKEN: state.metrics }) }));

type Next = { headers: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } };
const next = () => (globalThis as unknown as { __wmNext: Next }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let n = 0;
/** A client address no other case uses (documentation range 198.51.100.0/24 and beyond). */
const ip = () => `198.51.${100 + Math.floor(++n / 250)}.${n % 250}`;
const URL0 = 'http://localhost:3000';
const menu = (client: string, extra: Record<string, string> = {}) => menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu`, { 'x-forwarded-for': client, ...extra }), { params: Promise.resolve({ slug: 'halka' }) });
const signIn = (client: string, password: string) => loginRoute(jsonReq(`${URL0}/api/v1/auth/login`, { email: 'marta@halka.pl', password }, 'POST', { 'x-forwarded-for': client }));
const setHeaders = (h: Record<string, string>) => { next().headers.clear(); for (const [k, v] of Object.entries(h)) next().headers.set(k, v); };
const redirected = async (run: () => Promise<unknown>) => {
  try { await run(); } catch (e) { if (e instanceof next().RedirectSignal) return e.url; throw e; }
  throw new Error('expected a redirect');
};
const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:05.000Z'));
  state.hops = '1';
  state.metrics = undefined;
  resetMetrics();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('client key (R8)', () => {
  const at = new Date('2026-11-10T12:00:00.000Z');
  const h = (xff?: string) => ({ get: (name: string) => (name === 'x-forwarded-for' ? xff ?? null : null) });

  it('ignores X-Forwarded-For entirely by default (0 trusted proxies): every client is the one unidentified client', () => {
    expect(clientAddress(h('203.0.113.7'), 0)).toBeNull();
    const a = clientKey(h('203.0.113.7'), { hops: 0, secret: 's'.repeat(32) }, at);
    const b = clientKey(h('203.0.113.8'), { hops: 0, secret: 's'.repeat(32) }, at);
    expect(a).toEqual({ key: b.key, identified: false });
  });

  it('with N trusted proxies reads the N-th address from the right; what the client wrote to the left is ignored', () => {
    expect(clientAddress(h('1.1.1.1, 9.9.9.9, 203.0.113.7'), 1)).toBe('203.0.113.7');
    expect(clientAddress(h('1.1.1.1, 9.9.9.9, 203.0.113.7'), 2)).toBe('9.9.9.9');
    const cfg = { hops: 1, secret: 's'.repeat(32) };
    expect(clientKey(h('6.6.6.6, 203.0.113.7'), cfg, at).key).toBe(clientKey(h('7.7.7.7, 203.0.113.7'), cfg, at).key);
  });

  it('a missing, short or malformed header is the unidentified client, never "no limit"', () => {
    for (const bad of [undefined, '', 'not-an-ip', '203.0.113.7:443', '203.0.113.300', ' , ']) expect(clientAddress(h(bad), 1)).toBeNull();
    expect(clientAddress(h('203.0.113.7'), 2)).toBeNull();
    expect(clientKey(h('garbage'), { hops: 1, secret: null }, at).identified).toBe(false);
  });

  it('counts IPv6 per /64 and IPv4-mapped IPv6 as IPv4', () => {
    expect(countingUnit('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(countingUnit('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(countingUnit('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(countingUnit('::1')).toBe('0:0:0:0::/64');
  });

  it('is a 128-bit keyed hash: no address in it, another key on another day and with another secret', () => {
    const cfg = { hops: 1, secret: 's'.repeat(32) };
    const today = clientKey(h('203.0.113.7'), cfg, at);
    expect(today.key).toMatch(/^[0-9a-f]{32}$/);
    expect(today.key).not.toContain('203');
    expect(clientKey(h('203.0.113.7'), cfg, new Date('2026-11-11T00:00:00.000Z')).key).not.toBe(today.key);
    expect(clientKey(h('203.0.113.7'), { ...cfg, secret: 't'.repeat(32) }, at).key).not.toBe(today.key);
    expect(clientKey(h('203.0.113.7'), cfg, new Date('2026-11-10T23:59:59.000Z')).key).toBe(today.key);
  });
});

describe('public API (public-api, AC7)', () => {
  it('passes below the limit, answers 429 with Retry-After over it, and lets the next window through', async () => {
    const client = ip();
    for (let i = 0; i < 3; i++) expect((await menu(client)).status).toBe(200);
    const refused = await menu(client);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('55');
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(await refused.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Try again later.' } });
    expect(renderMetrics()).toContain('rate_limit_denied_total{rule="public-api"} 1');
    // another client is not affected
    expect((await menu(ip())).status).toBe(200);
    vi.setSystemTime(new Date('2026-11-10T12:01:00.000Z'));
    expect((await menu(client)).status).toBe(200);
  });

  it('AC7 with the default limits: the 121st menu request in a minute and the 21st sign-in in ten minutes get 429', async () => {
    state.limits = '';
    try {
      const client = ip();
      for (let i = 0; i < 120; i++) expect((await menu(client)).status).toBe(200);
      expect((await menu(client)).status).toBe(429);
      const other = ip();
      for (let i = 0; i < 20; i++) expect((await signIn(other, 'demo-halka-2026')).status).toBe(200);
      expect((await signIn(other, 'demo-halka-2026')).status).toBe(429);
    } finally {
      state.limits = 'public-api=3/60,login=3/600,code-issue=2/600,code-lookup=1/600,code-mark=1/600';
    }
  });

  it('ignores a spoofed X-Forwarded-For by default: with 0 trusted proxies every address is one shared counter', async () => {
    state.hops = '0';
    // the unidentified client has half the limit: 2 of 3 (rounded up)
    expect((await menu(ip())).status).toBe(200);
    expect((await menu(ip())).status).toBe(200);
    expect((await menu(ip())).status).toBe(429);
  });

  it('honours X-Forwarded-For only from the configured proxy: a new address on the left does not give a new counter', async () => {
    const real = ip();
    for (let i = 0; i < 3; i++) expect((await menu(`10.0.0.${i}, ${real}`)).status).toBe(200);
    expect((await menu(`10.9.9.9, ${real}`)).status).toBe(429);
  });

  it('does not limit the health check or the metrics endpoint, also for a client that is over every limit', async () => {
    state.metrics = 'm'.repeat(40);
    const client = ip();
    for (let i = 0; i < 4; i++) await menu(client);
    expect((await menu(client)).status).toBe(429);
    for (let i = 0; i < 10; i++) {
      expect((await healthGet(req(`${URL0}/api/v1/health`, { 'x-forwarded-for': client }))).status).toBe(200);
      expect((await metricsGet(req(`${URL0}/api/v1/metrics`, { 'x-forwarded-for': client, authorization: `Bearer ${'m'.repeat(40)}` }))).status).toBe(200);
    }
  });
});

describe('sign-in (login, AC7)', () => {
  it('has its own counter: a client over the public-API limit can still sign in', async () => {
    const client = ip();
    for (let i = 0; i < 4; i++) await menu(client);
    expect((await menu(client)).status).toBe(429);
    expect((await signIn(client, 'demo-halka-2026')).status).toBe(200);
  });

  it('refuses the attempt over the limit with 429 before the account is touched: the lockout state does not change', async () => {
    const client = ip();
    // three wrong passwords count on the account (5 lock it) AND on the client's login limit (3)
    for (let i = 0; i < 3; i++) expect((await signIn(client, 'wrong-password')).status).toBe(401);
    for (let i = 0; i < 5; i++) {
      const refused = await signIn(client, 'wrong-password');
      expect(refused.status).toBe(429);
      expect(Number(refused.headers.get('retry-after'))).toBe(595);
    }
    // after the window: had the five refused attempts reached the account, it would now be locked (8 failures ≥ 5)
    vi.setSystemTime(new Date('2026-11-10T12:10:00.000Z'));
    expect((await signIn(client, 'demo-halka-2026')).status).toBe(200);
  });

  it('the sign-in form counts against the same limit and says "too many attempts", not "wrong password"', async () => {
    const client = ip();
    setHeaders({ 'x-forwarded-for': client });
    for (let i = 0; i < 3; i++) expect(await redirected(() => loginAction(form({ email: 'marta@halka.pl', password: 'wrong-password' })))).toBe('/admin/login?error=invalid_credentials');
    expect(await redirected(() => loginAction(form({ email: 'marta@halka.pl', password: 'demo-halka-2026' })))).toBe('/admin/login?error=rate_limited');
    // the route shares the counter with the form
    expect((await signIn(client, 'demo-halka-2026')).status).toBe(429);
  });
});

describe('recommendation code (code-issue, code-lookup, code-mark: AC8)', () => {
  const issueInput = async () => {
    const scope = await createRequestScope();
    const c = scope.cradle;
    const menuData = (await c.catalogService.publishedMenu('halka'))!;
    const dish = menuData.dishes[0];
    const wineId = (await c.recommendationService.forDish('halka', dish.id, { serving: 'any', styles: [], maxPrice: null, weight: 'any', mood: 'any' }))!.result.items[0].wine.id;
    const session = c.usageEventService.session({}, 'guest');
    return { c, restaurant: menuData.restaurant, input: { session, source: 'guest' as const, wineId, serving: 'bottle' as const, dishIds: [dish.id], tier: null } };
  };

  it('G8 over the code-issue limit: no code, nothing written, counted as rate_limited', async () => {
    const { c, restaurant, input } = await issueInput();
    setHeaders({ 'user-agent': SAFARI, 'x-forwarded-for': ip() });
    const issue = vi.spyOn(c.recommendationCodeService, 'issue');
    expect(await issueCodeForPage(c, restaurant, input)).not.toBeNull();
    expect(await issueCodeForPage(c, restaurant, { ...input, session: c.usageEventService.session({}, 'guest') })).not.toBeNull();
    expect(await issueCodeForPage(c, restaurant, { ...input, session: c.usageEventService.session({}, 'guest') })).toBeNull();
    expect(issue).toHaveBeenCalledTimes(2);
    expect(renderMetrics()).toContain('guest_code_issue_total{result="rate_limited"} 1');
  });

  it('G8 when the limiter store fails: the code is issued as before (the failure lets the request through)', async () => {
    const { c, restaurant, input } = await issueInput();
    setHeaders({ 'user-agent': SAFARI, 'x-forwarded-for': ip() });
    const failing: RateLimiter = { hit: async () => { throw new Error('store down'); } };
    const guard = new RateLimitGuard({ rateLimiter: failing, clock: c.clock, logger: c.logger, rateLimitRules: c.rateLimitRules });
    for (let i = 0; i < 4; i++) expect(await issueCodeForPage({ ...c, rateLimitGuard: guard }, restaurant, { ...input, session: c.usageEventService.session({}, 'guest') })).not.toBeNull();
  });

  it('G9 lookup over the code-lookup limit says "too many attempts", never "not found", and looks nothing up', async () => {
    const client = ip();
    const render = async () => {
      setHeaders({ 'x-wine-lang': 'en', 'user-agent': SAFARI, 'x-forwarded-for': client });
      const { prelude } = await prerender(createElement(StaffPage as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve({ code: 'ZZZ' }) }));
      return (await new Response(prelude).text()).replace(/<!-- -->/g, '').replace(/&#x27;/g, '\'').replace(/&#8217;|’/g, '\'');
    };
    expect(await render()).toContain('There is no code ZZZ today');
    const second = await render();
    expect(second).toContain('Too many attempts from this network');
    expect(second).not.toContain('There is no code');
  });

  it('G9 "Ordered" over the code-mark limit redirects with codeError=rate_limited and does not change the code', async () => {
    const client = ip();
    const scope = await createRequestScope();
    const confirm = vi.spyOn(scope.cradle.recommendationCodeService.constructor.prototype, 'confirm');
    const post = () => { setHeaders({ 'x-forwarded-for': client }); return redirected(() => markCode(form({ slug: 'halka', code: 'ZZZ', intent: 'confirm' }))); };
    expect(await post()).toContain('codeError=not_found');
    expect(await post()).toContain('codeError=rate_limited');
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('memory bound of the in-memory limiter', () => {
  it('holds at most its maximum of counters under a flood of distinct clients', async () => {
    const limiter = new MemoryRateLimiter(100);
    const rule = { name: 'public-api' as const, limit: 1, windowSeconds: 60 };
    for (let i = 0; i < 5000; i++) await limiter.hit(rule, `k${i}`, new Date());
    expect(limiter.size).toBe(100);
  });
});
