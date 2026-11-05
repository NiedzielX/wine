import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, inject, it } from 'vitest';
import { E2E_METRICS_TOKEN } from './observability';

/**
 * Spec E21 F1 (AC1, AC2): the metrics endpoint of the built app and the one-line request log. Plain HTTP; the log is
 * the file the test harness captures from the app's stdout/stderr.
 */

const base = () => inject('e2e').baseUrl;
const LOG = fileURLToPath(new URL('../../test-results/e2e-app.log', import.meta.url));
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('metrics endpoint and request log', () => {
  it('serves metrics only with the bearer token and exposes no slug or id', async () => {
    expect((await fetch(`${base()}/api/v1/metrics`)).status).toBe(401);
    expect((await fetch(`${base()}/api/v1/metrics`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    await fetch(`${base()}/api/v1/public/restaurants/halka/menu`);
    const res = await fetch(`${base()}/api/v1/metrics`, { headers: { authorization: `Bearer ${E2E_METRICS_TOKEN}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('http_requests_total{group="/api/v1/public/restaurants/{slug}/menu",status_class="2xx"}');
    expect(text).not.toContain('halka');
    expect(text).not.toMatch(UUID_RE);
  });

  it('logs one line per API request with the route pattern and no query string or headers', async () => {
    const requestLines = () => readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('"api request"') && l.includes('/api/v1/public/restaurants/{slug}/menu'));
    const before = requestLines().length;
    const marker = `marker${Date.now()}`;
    const res = await fetch(`${base()}/api/v1/public/restaurants/halka/menu?sid=${marker}&diet=vegan`, { headers: { cookie: 'wm_session=cookie-secret', 'x-forwarded-for': '203.0.113.9' } });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300)); // the app's output reaches the file asynchronously
    const log = readFileSync(LOG, 'utf8');
    expect(log).not.toContain(marker);
    expect(log).not.toContain('cookie-secret');
    expect(log).not.toContain('203.0.113.9');
    const lines = requestLines();
    expect(lines.length - before).toBe(1);
    const entry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    expect(entry).toMatchObject({ method: 'GET', route: '/api/v1/public/restaurants/{slug}/menu', status: 200 });
    expect(typeof entry.durationMs).toBe('number');
  });
});
