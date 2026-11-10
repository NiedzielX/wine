import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { queryDatabase, startBuiltApp, type RunningApp } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * Spec E21 F3 (R7–R9, AC5–AC8) on the BUILT app and PostgreSQL: the request limits per route class, the trusted proxy hop and what
 * the counter table holds. A second app on the shared e2e database, with low limits, one trusted proxy hop and a test-only secret;
 * every case uses its own client address (TEST-NET-3, sent the way the proxy would). Plain HTTP, no browser. The counter rows it
 * writes are deleted at the end: the table is left exactly as found (checked).
 */
const appDir = fileURLToPath(new URL('../..', import.meta.url));
const dbUrl = () => inject('e2e').databaseUrl;
const SECRET = 'e2e-rate-limit-secret-0123456789abcdef';
const LIMITS = 'public-api=3/60,login=2/600,code-lookup=1/600';

let n = 0;
const used: string[] = [];
/** A client address no other case uses. */
const ip = () => { const a = `203.0.113.${++n}`; used.push(a); return a; };

/** The key the app stores for `address` on `day` (an independent copy of `server/client-key.ts`, so a change there shows here). */
const keyOf = (address: string, day: string) => {
  const dayKey = createHmac('sha256', SECRET).update(`wine-match rate limit ${day}`).digest();
  return createHmac('sha256', dayKey).update(address).digest('hex').slice(0, 32);
};
const tableRows = () => queryDatabase<{ key: string; rule: string; window_start: Date; count: number }>(dbUrl(), 'select key, rule, window_start, count from rate_limit_bucket order by key, rule, window_start');

describe('request limits on the built app (PostgreSQL)', () => {
  let app: RunningApp;
  let before: Awaited<ReturnType<typeof tableRows>>;
  const days = new Set<string>();

  beforeAll(async () => {
    before = await tableRows();
    days.add(new Date().toISOString().slice(0, 10));
    app = await startBuiltApp({
      cwd: appDir,
      readyPath: '/api/v1/health',
      logFile: `${appDir}/test-results/e2e-rate-limits-app.log`,
      env: {
        NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: dbUrl(), AUTH_COOKIE_SECURE: 'false', ALLOW_LOCAL_BASE_URL: 'true', LOG_LEVEL: 'info',
        TRUSTED_PROXY_HOPS: '1', RATE_LIMIT_SECRET: SECRET, RATE_LIMITS: LIMITS
      }
    });
  });

  afterAll(async () => {
    await app?.stop();
    days.add(new Date().toISOString().slice(0, 10));
    const keys = used.flatMap((a) => [...days].map((d) => keyOf(a, d)));
    await queryDatabase(dbUrl(), 'delete from rate_limit_bucket where key = any($1::text[])', [keys]);
    expect(await tableRows()).toEqual(before);
  });

  const menu = (client: string) => fetch(`${app.url}/api/v1/public/restaurants/halka/menu`, { headers: { 'x-forwarded-for': client } });

  it('public API: below the limit passes, over it 429 with Retry-After and no-store; another client and the health check are not affected', async () => {
    const client = ip();
    for (let i = 0; i < 3; i++) expect((await menu(client)).status).toBe(200);
    const refused = await menu(client);
    expect(refused.status).toBe(429);
    const retry = Number(refused.headers.get('retry-after'));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    expect(refused.headers.get('cache-control')).toBe('no-store');
    expect(await refused.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Try again later.' } });
    expect((await menu(ip())).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await fetch(`${app.url}/api/v1/health`, { headers: { 'x-forwarded-for': client } })).status).toBe(200);
  });

  it('sign-in has its own counter: a client over the public-API limit signs in, and over the login limit gets 429', async () => {
    const client = ip();
    for (let i = 0; i < 4; i++) await menu(client);
    // an empty body is refused by the schema (422) before any account is looked up, so nothing but the counter is written
    const attempt = () => fetch(`${app.url}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': client }, body: '{}' });
    expect((await attempt()).status).toBe(422);
    expect((await attempt()).status).toBe(422);
    const refused = await attempt();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('only the address appended by the trusted proxy counts: addresses a client writes in front of it do not give a new counter', async () => {
    const real = ip();
    for (let i = 0; i < 3; i++) expect((await menu(`198.18.0.${i}, ${real}`)).status).toBe(200);
    expect((await menu(`198.18.9.9, ${real}`)).status).toBe(429);
  });

  it('the staff view answers "too many attempts" over the code-lookup limit, also for traffic marked synthetic', async () => {
    const client = ip();
    const g9 = async () => (await fetch(`${app.url}/r/halka/staff?code=ZZZ&lang=en`, { headers: { 'x-forwarded-for': client, 'x-wine-match-synthetic': '1' } })).text();
    const first = await g9();
    expect(first).toContain('There is no code ZZZ today');
    const second = await g9();
    expect(second).toContain('Too many attempts from this network');
    expect(second).not.toContain('There is no code');
  });

  it('the counter table holds keyed hashes only: no client address, one row per client, rule and window', async () => {
    const rows = (await tableRows()).filter((r) => !before.some((b) => b.key === r.key && b.rule === r.rule && String(b.window_start) === String(r.window_start)));
    expect(rows.length).toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    const ours = new Set(used.map((a) => keyOf(a, today)));
    for (const r of rows) {
      expect(r.key).toMatch(/^[0-9a-f]{32}$/);
      expect(ours.has(r.key)).toBe(true);
      for (const a of used) expect(r.key).not.toContain(a.replace(/\./g, ''));
    }
    const menuRow = rows.find((r) => r.key === keyOf(used[0], today) && r.rule === 'public-api');
    expect(menuRow?.count).toBe(4);
  });
});
