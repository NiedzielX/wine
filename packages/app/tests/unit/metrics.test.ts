import { parseEnv } from '@wine-match/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as metricsGet } from '@/app/api/v1/metrics/route';
import { GET as menuGet } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { GET as meGet } from '@/app/api/v1/auth/me/route';
import { logger } from '@/server/logger';
import { countCodeIssue, labelValue, observeDbHealthCheck, recordHttpRequest, renderMetrics, resetMetrics, statusClass } from '@/server/metrics';
import { onRequestError, register } from '@/instrumentation';
import { registerProcessHandlers, reportProcessError } from '@/server/request-errors';
import { req } from './helpers';

/** Spec E21 F1: AC1 (metrics endpoint), AC2 (one request log line, onRequestError with redaction, generic 500). */

const TOKEN = 'm'.repeat(40);
const URL0 = 'http://localhost:3000';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// env() caches; the token is changed per test, so read the environment afresh
const state = { token: undefined as string | undefined };
vi.mock('@/server/env', () => ({ env: () => parseEnv({ ...process.env, METRICS_TOKEN: state.token }) }));

const get = (headers: Record<string, string> = {}) => metricsGet(req(`${URL0}/api/v1/metrics`, headers));
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  resetMetrics();
  state.token = undefined;
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/v1/metrics (AC1)', () => {
  it('is 404 without METRICS_TOKEN, even when a token is sent', async () => {
    expect((await get()).status).toBe(404);
    expect((await get({ authorization: `Bearer ${TOKEN}` })).status).toBe(404);
  });

  it('is 401 without a header, with another scheme or with a wrong token', async () => {
    state.token = TOKEN;
    const none = await get();
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    expect((await get({ authorization: `Basic ${TOKEN}` })).status).toBe(401);
    expect((await get({ authorization: `Bearer ${TOKEN}x` })).status).toBe(401);
    expect((await get({ authorization: 'Bearer short' })).status).toBe(401);
  });

  it('is 200 with the token: text format, no-store, every metric of R1 named', async () => {
    state.token = TOKEN;
    const res = await get({ authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    for (const name of ['http_requests_total', 'http_request_duration_seconds', 'guest_code_issue_total', 'usage_event_write_failed_total', 'rate_limit_denied_total', 'db_health_check_duration_seconds']) {
      expect(text).toContain(`# TYPE ${name} `);
    }
  });

  it('counts API requests by route pattern and status class, with no slug or id in any label', async () => {
    state.token = TOKEN;
    await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu?x=1`), params({ slug: 'halka' }));
    await menuGet(req(`${URL0}/api/v1/public/restaurants/nope/menu`), params({ slug: 'nope' }));
    await meGet(req(`${URL0}/api/v1/auth/me`));
    const text = await (await get({ authorization: `Bearer ${TOKEN}` })).text();
    expect(text).toContain('http_requests_total{group="/api/v1/public/restaurants/{slug}/menu",status_class="2xx"} 1');
    expect(text).toContain('http_requests_total{group="/api/v1/public/restaurants/{slug}/menu",status_class="4xx"} 1');
    expect(text).toContain('http_requests_total{group="/api/v1/auth/me",status_class="4xx"} 1');
    expect(text).toContain('http_request_duration_seconds_count{group="/api/v1/auth/me"} 1');
    expect(text).not.toContain('halka');
    expect(text).not.toContain('nope');
    expect(text).not.toMatch(UUID_RE);
  });
});

describe('metric helpers', () => {
  it('labels never carry a UUID or unusual characters, and are bounded', () => {
    expect(labelValue('/api/v1/x/7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe('/api/v1/x/{id}');
    expect(labelValue('a"b\nc')).toBe('a_b_c');
    expect(labelValue('x'.repeat(300))).toHaveLength(100);
    expect(labelValue('')).toBe('unknown');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(503)).toBe('5xx');
    expect(statusClass(0)).toBe('other');
  });

  it('a histogram has cumulative buckets, +Inf, sum and count; a counter increments per result', () => {
    recordHttpRequest('/api/v1/a', 200, 0.03);
    recordHttpRequest('/api/v1/a', 500, 3);
    observeDbHealthCheck(0.2);
    countCodeIssue('issued');
    countCodeIssue('issued');
    countCodeIssue('timeout');
    const text = renderMetrics();
    expect(text).toContain('http_request_duration_seconds_bucket{group="/api/v1/a",le="0.05"} 1');
    expect(text).toContain('http_request_duration_seconds_bucket{group="/api/v1/a",le="5"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{group="/api/v1/a",le="+Inf"} 2');
    expect(text).toContain('http_request_duration_seconds_sum{group="/api/v1/a"} 3.03');
    expect(text).toContain('db_health_check_duration_seconds_bucket{le="0.25"} 1');
    expect(text).toContain('db_health_check_duration_seconds_count 1');
    expect(text).toContain('guest_code_issue_total{result="issued"} 2');
    expect(text).toContain('guest_code_issue_total{result="timeout"} 1');
    expect(text).toContain('http_requests_total{group="/api/v1/a",status_class="5xx"} 1');
  });
});

describe('request log line and error hooks (AC2)', () => {
  it('an API request logs exactly one line with method, route pattern, status and duration: no query, headers or IP', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu?sid=7c9e6679&diet=vegan`, { cookie: 'wm_session=abc', 'x-forwarded-for': '203.0.113.7' }), params({ slug: 'halka' }));
    expect(info).toHaveBeenCalledTimes(1);
    const [message, fields] = info.mock.calls[0];
    expect(message).toBe('api request');
    expect(Object.keys(fields!).sort()).toEqual(['durationMs', 'method', 'route', 'status']);
    expect(fields).toMatchObject({ method: 'GET', route: '/api/v1/public/restaurants/{slug}/menu', status: 200 });
    expect(typeof fields!.durationMs).toBe('number');
  });

  it('an unexpected failure is a generic 500 without a stack, logged redacted, and counted', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => { lines.push(line); });
    const { createRequestScope } = await import('@/server/container');
    const scope = await createRequestScope();
    vi.spyOn(scope.cradle.catalogService, 'publishedMenu').mockRejectedValueOnce(new Error('connect failed postgres://u:haslo@h/db'));
    await scope.dispose();
    const container = await import('@/server/container');
    vi.spyOn(container, 'createRequestScope').mockResolvedValueOnce({
      cradle: { catalogService: { publishedMenu: () => Promise.reject(new Error('connect failed postgres://u:haslo@h/db')) } },
      dispose: async () => undefined
    } as never);
    const res = await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu`), params({ slug: 'halka' }));
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain('unexpected');
    expect(body).not.toMatch(/haslo|stack|\bat /);
    expect(lines.join('\n')).not.toContain('haslo');
    expect(lines.join('\n')).toContain('api request failed');
    expect(renderMetrics()).toContain('http_requests_total{group="/api/v1/public/restaurants/{slug}/menu",status_class="5xx"} 1');
    expect(renderMetrics()).toContain('unhandled_errors_total{source="route"} 1');
  });

  it('onRequestError redacts secrets, drops the query string and headers, and counts by source', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => { lines.push(line); });
    const err = Object.assign(new Error('boom postgres://u:haslo@h/db'), { digest: 'd123' });
    await onRequestError(err, { path: '/r/halka/menu?sid=7c9e6679&diet=vegan', method: 'GET', headers: { cookie: 'wm_session=secrettoken' } }, {
      routerKind: 'App Router', routePath: '/r/[slug]/menu', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined, renderType: 'dynamic'
    });
    const out = lines.join('\n');
    expect(out).toContain('request error');
    expect(out).toContain('"digest":"d123"');
    expect(out).toContain('"path":"/r/halka/menu"');
    expect(out).toContain('"route":"/r/[slug]/menu"');
    expect(out).not.toMatch(/haslo|sid=|diet=|secrettoken|cookie/);
    expect(renderMetrics()).toContain('unhandled_errors_total{source="render"} 1');
  });

  it('process errors are logged redacted and counted; the handlers are registered once and do not exit', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => { lines.push(line); });
    const on = vi.spyOn(process, 'on');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    registerProcessHandlers();
    registerProcessHandlers();
    const registered = on.mock.calls.map((c) => c[0]).filter((e) => e === 'unhandledRejection' || e === 'uncaughtException');
    expect(registered.length).toBeLessThanOrEqual(2);
    reportProcessError('unhandledRejection', new Error('Bearer abc.def.ghi password=hunter2'));
    expect(lines.join('\n')).not.toContain('hunter2');
    expect(renderMetrics()).toContain('unhandled_errors_total{source="unhandledRejection"} 1');
    expect(exit).not.toHaveBeenCalled();
  });

  it('register() does nothing outside the Node.js runtime and onRequestError is a no-op there', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => { lines.push(line); });
    const before = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = 'edge';
    try {
      await register();
      await onRequestError(new Error('x'), { path: '/', method: 'GET', headers: {} }, { routerKind: 'App Router', routePath: '/', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined, renderType: 'dynamic' });
    } finally {
      if (before === undefined) delete process.env.NEXT_RUNTIME;
      else process.env.NEXT_RUNTIME = before;
    }
    expect(lines).toEqual([]);
  });
});
