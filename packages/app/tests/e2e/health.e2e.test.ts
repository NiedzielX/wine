import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTcpRelay, queryDatabase, startBuiltApp } from '@wine-match/testkit';
import { describe, expect, inject, it } from 'vitest';

/**
 * Spec 2026-10-15-production-deployment, R3 and R6 (AC5, AC7 without the image): the health check of the built app on
 * PostgreSQL, including a database that goes away and comes back, and `smoke --production` against the running app.
 * Plain HTTP, no browser.
 */
const appDir = fileURLToPath(new URL('../..', import.meta.url));
const rootDir = fileURLToPath(new URL('../../../..', import.meta.url));
const base = () => inject('e2e').baseUrl;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

describe('health check', () => {
  it('answers 200 without a session, never cached, and says nothing about the installation', async () => {
    const res = await fetch(`${base()}/api/v1/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: 'ok', checks: { database: 'ok' } });
    expect(text).not.toMatch(/halka|winematch|127\.0\.0\.1|version|postgres|memory|dataSource/i);
  });

  it('answers 503 with no connection detail while the database is down and 200 again when it is back, without a restart', async () => {
    const real = new URL(inject('e2e').databaseUrl);
    const relay = await createTcpRelay({ host: real.hostname, port: Number(real.port || 5432) });
    const viaRelay = new URL(real);
    viaRelay.hostname = relay.host;
    viaRelay.port = String(relay.port);
    // a second built app on its own pool, reaching the database through the relay; a public https address passes the production check (R4)
    const app = await startBuiltApp({
      cwd: appDir,
      readyPath: '/api/v1/health',
      logFile: `${appDir}/test-results/e2e-health-app.log`,
      env: { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: viaRelay.toString(), AUTH_COOKIE_SECURE: 'false', PUBLIC_BASE_URL: 'https://wine.example.test', LOG_LEVEL: 'info' }
    });
    try {
      // the answer is reused for a short while (HEALTH_CACHE_MS = 2 s): wait it out after every change, so the test is deterministic
      const expire = () => new Promise((resolve) => setTimeout(resolve, 2_300));
      const health = async () => { const res = await fetch(`${app.url}/api/v1/health`); return { status: res.status, text: await res.text() }; };
      const before = await health();
      expect(before.status).toBe(200);

      await relay.stop();
      await expire();
      const down = await health();
      expect(down.status).toBe(503);
      expect(JSON.parse(down.text)).toEqual({ status: 'unavailable', checks: { database: 'unreachable' } });
      for (const secret of [relay.host, String(relay.port), real.username, real.pathname.slice(1), 'ECONNREFUSED', 'ECONNRESET', 'password']) {
        expect(down.text).not.toContain(secret);
      }
      expect(app.logs()).not.toContain(real.password || 'no-password-in-this-url');

      await relay.start();
      await expire();
      const back = await health();
      expect(back.status).toBe(200);
      expect(JSON.parse(back.text).checks.database).toBe('ok');
    } finally {
      await app.stop();
      await relay.stop();
    }
  });
});

describe('smoke --production', () => {
  const guestEvents = async () => Number((await queryDatabase<{ n: number }>(inject('e2e').databaseUrl, 'select count(*)::int as n from guest_interaction'))[0].n);

  it('passes against the running app, sends only GET requests and writes no guest events', async () => {
    // positive control: the same kind of request WITHOUT the synthetic header (the smoke test's own client, then a phone) IS counted,
    // so "no events" below is the header's doing and not a filter on the client
    const control = await guestEvents();
    expect((await fetch(`${base()}/r/halka`)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1_500));
    const afterPlain = await guestEvents();
    expect(afterPlain).toBeGreaterThan(control);
    expect((await fetch(`${base()}/r/halka`, { headers: { 'user-agent': SAFARI } })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1_500));
    const afterVisit = await guestEvents();
    expect(afterVisit).toBeGreaterThan(afterPlain);

    const { code, output } = await new Promise<{ code: number; output: string }>((resolve) => {
      execFile(process.execPath, ['scripts/smoke.mjs', '--production', base(), 'halka'], { cwd: rootDir, env: { PATH: process.env.PATH ?? '' } }, (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` });
      });
    });
    expect(output).toContain('All production smoke checks passed');
    expect(code).toBe(0);
    expect(output).not.toContain('FAIL');
    await new Promise((r) => setTimeout(r, 1_500));
    expect(await guestEvents()).toBe(afterVisit);
  });
});
