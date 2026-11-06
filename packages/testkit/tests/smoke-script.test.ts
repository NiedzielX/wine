import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SYNTHETIC_HEADER, syntheticFetch } from '../../../scripts/lib/synthetic-fetch.mjs';

/**
 * Spec 2026-10-15-production-deployment, R6 and R7: `scripts/smoke.mjs --production` against a stand-in server that
 * records what it receives, and the fetch that both smoke modes use.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/smoke.mjs', import.meta.url));

interface Seen { method: string; url: string; synthetic: string | undefined }

type Handler = (req: IncomingMessage, res: ServerResponse) => boolean;

/** A healthy production instance of restaurant "pilot", with an optional override per request. */
function installation(override: Handler = () => false): { server: Server; seen: Seen[]; start(): Promise<string> } {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', synthetic: req.headers[SYNTHETIC_HEADER] as string | undefined });
    if (override(req, res)) return;
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
    const html = (status: number, body: string, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'text/html', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', ...headers }); res.end(body); };
    switch (req.url) {
      case '/api/v1/health': return json(200, { status: 'ok', dataSource: 'postgres', checks: { database: 'ok' } }, { 'cache-control': 'no-store' });
      case '/': res.writeHead(307, { location: '/r/pilot' }); return void res.end();
      case '/r/pilot': return html(200, '<html><body>the menu is being updated</body></html>');
      case '/api/v1/public/restaurants/pilot/menu': return json(200, { restaurant: { slug: 'pilot', name: 'Pilot' }, categories: [] });
      case '/admin/login': return html(200, '<html><form></form></html>', { 'cache-control': 'private, no-store', 'x-frame-options': 'DENY' });
      case '/api/v1/auth/me': return json(401, { error: { code: 'unauthenticated', message: 'Sign in first.' } });
      default: return json(404, { error: { code: 'not_found', message: 'Not found.' } });
    }
  });
  return { server, seen, start: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`))) };
}

function smoke(args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH ?? '' } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` });
    });
  });
}

let running: Server | undefined;
afterEach(async () => { await new Promise<void>((resolve) => (running ? running.close(() => resolve()) : resolve())); running = undefined; });

describe('smoke --production', () => {
  it('passes on a healthy installation with GET requests only, every one synthetic, and no sign-in', async () => {
    const { server, seen, start } = installation();
    running = server;
    const url = await start();
    const { code, output } = await smoke(['--production', url, 'pilot']);
    expect(output).toContain('All production smoke checks passed');
    expect(code).toBe(0);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.every((r) => r.method === 'GET')).toBe(true);
    expect(seen.every((r) => r.synthetic === '1')).toBe(true);
    expect(seen.map((r) => r.url)).not.toContain('/api/v1/auth/login');
  });

  it('does not depend on the menu: a restaurant with dishes passes too', async () => {
    const { server, start } = installation((req, res) => {
      if (req.url !== '/api/v1/public/restaurants/pilot/menu') return false;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ restaurant: { slug: 'pilot', name: 'Pilot' }, categories: [{ name: 'Mains', dishes: [{ id: 'x', name: 'Anything', price: 12.5 }] }] }));
      return true;
    });
    running = server;
    expect((await smoke(['--production', await start(), 'pilot'])).code).toBe(0);
  });

  it.each([
    ['the health check is 503', '/api/v1/health', (res: ServerResponse) => { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"status":"unavailable"}'); }],
    ['the root page does not reach the restaurant (DEMO_RESTAURANT_SLUG is wrong)', '/', (res: ServerResponse) => { res.writeHead(307, { location: '/r/halka' }); res.end(); }],
    ['the restaurant page is missing', '/r/pilot', (res: ServerResponse) => { res.writeHead(404); res.end('no'); }],
    ['the menu API has the wrong shape', '/api/v1/public/restaurants/pilot/menu', (res: ServerResponse) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"restaurant":{"slug":"pilot"},"categories":[{"name":"x"}]}'); }],
    ['the sign-in page is missing', '/admin/login', (res: ServerResponse) => { res.writeHead(500); res.end('boom'); }],
    ['a route that needs a session is open', '/api/v1/auth/me', (res: ServerResponse) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"user":{}}'); }],
    ['the security headers are gone', '/r/pilot', (res: ServerResponse) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html></html>'); }]
  ])('fails (exit 1) when %s', async (_label, path, answer) => {
    const { server, start } = installation((req, res) => { if (req.url !== path) return false; answer(res); return true; });
    running = server;
    const { code, output } = await smoke(['--production', await start(), 'pilot']);
    expect(output).toContain('FAIL');
    expect(code).toBe(1);
  });

  it('fails (exit 1) when nothing answers, without a stack trace', async () => {
    const { code, output } = await smoke(['--production', 'http://127.0.0.1:1', 'pilot']);
    expect(code).toBe(1);
    expect(output).toMatch(/FAIL/);
    expect(output).not.toMatch(/\n\s+at /);
  });

  it.each(['../admin', 'a/b', 'Pilot', 'a b', 'a?x=1', ''])('refuses the slug %j before any request is made (exit 2)', async (badSlug) => {
    const { server, seen, start } = installation();
    running = server;
    const { code, output } = await smoke(['--production', await start(), badSlug]);
    expect(code).toBe(2);
    expect(output).toContain('is not a restaurant slug');
    expect(seen).toHaveLength(0);
  });

  it('refuses an option it does not know (exit 2)', async () => {
    const { code, output } = await smoke(['--prod', 'http://127.0.0.1:1', 'pilot']);
    expect(code).toBe(2);
    expect(output).toContain('Unknown option');
  });
});

/** A stand-in for an instance with SHOWCASE_MODE=calculator (or demo, phase F2): the words the smoke test asks for, with one flaw selectable per test. */
function showcaseInstance(flaw: 'none' | 'ai' | 'cookie' | 'indexable' = 'none', mode: 'calculator' | 'demo' = 'calculator') {
  const seen: Seen[] = [];
  const NBSP = '\u00a0';
  const server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', synthetic: req.headers[SYNTHETIC_HEADER] as string | undefined });
    const url = new URL(req.url ?? '/', 'http://x');
    const headers: Record<string, string | string[]> = { 'content-type': 'text/html', 'cache-control': 'private, no-store', ...(flaw === 'indexable' ? {} : { 'x-robots-tag': 'noindex, nofollow' }), ...(flaw === 'cookie' ? { 'set-cookie': 'a=b' } : {}) };
    const page = (body: string) => { res.writeHead(200, headers); res.end(`<html><head><meta name="robots" content="noindex, nofollow"/></head><body><main>${body}${flaw === 'ai' ? ' Powered by AI' : ''}</main></body></html>`); };
    if (url.pathname === '/demo/roi') {
      const lang = url.searchParams.get('lang');
      if (url.searchParams.get('customers') === '1e9') return page('We used the default instead of these values 9,110 zł');
      if (url.searchParams.has('customers')) return page('value="2000" assumption: your value (default 1,500 guests) 12,000 zł');
      return page(lang === 'pl'
        ? `Kalkulator zwrotu założenie zespołu Czym to jest 9${NBSP}110${NBSP}zł Dodatkowa marża po opłacie za plan (założenie) <form method="get"></form>`
        : 'Return calculator team assumption What this is 9,110 zł Extra margin after the plan fee (assumption)');
    }
    if (url.pathname === '/demo/roi/summary') return page('Podsumowanie założeń: kalkulator zwrotu Wine Match 06.11.2026 Użyj Ctrl/Cmd+P To założenia, nie pomiary print:hidden');
    if (url.pathname === '/demo/tour') return page('Sommelier ma ostatnie słowo Czego nie robimy');
    if (mode === 'demo' && url.pathname === '/demo') return page('Demo: the invented restaurant Halka <li data-step="guest"></li> <a href="/r/halka/table?lang=en">Open</a>');
    if (mode === 'demo' && url.pathname === '/r/halka/table') return page('<div data-demo-ribbon></div> Whole table');
    if (mode === 'demo' && url.pathname === '/admin/login') return page('This demo is read-only: signing in is switched off');
    res.writeHead(404); res.end();
  });
  return { server, seen, start: () => new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`))) };
}

describe('smoke --showcase (spec 2026-11-04-sales-demo-and-roi-calculator, phases F1 and F2)', () => {
  it('passes on a calculator instance, sending GET requests only, every one synthetic', async () => {
    const { server, seen, start } = showcaseInstance();
    running = server;
    const { code, output } = await smoke(['--showcase', await start()]);
    expect(output).toContain('All showcase smoke checks passed');
    expect(output).not.toContain('FAIL');
    expect(code).toBe(0);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.every((r) => r.method === 'GET' && r.synthetic === '1')).toBe(true);
  });

  it('passes on a demo instance too: the guide, its links with the ribbon, and the switched-off sign-in', async () => {
    const { server, seen, start } = showcaseInstance('none', 'demo');
    running = server;
    const { code, output } = await smoke(['--showcase', await start()]);
    expect(output).toContain('All showcase smoke checks passed');
    expect(output).toContain('DM0 guide (demo mode)');
    expect(output).toContain('guide link /r/halka/table?lang=en');
    expect(code).toBe(0);
    expect(seen.every((r) => r.method === 'GET' && r.synthetic === '1')).toBe(true);
  });

  it.each([['ai', /no "AI" wording/], ['cookie', /sets no cookie/], ['indexable', /never indexed/]] as const)('fails when the page has the flaw "%s"', async (flaw, message) => {
    const { server, start } = showcaseInstance(flaw);
    running = server;
    const { code, output } = await smoke(['--showcase', await start()]);
    expect(code).toBe(1);
    expect(output).toMatch(/FAIL/);
    expect(output).toMatch(message);
  });

  it('fails on an instance where the showcase is off (404)', async () => {
    const { server, seen, start } = installation();
    running = server;
    const { code, output } = await smoke(['--showcase', await start()]);
    expect(code).toBe(1);
    expect(output).toContain('FAIL');
    expect(seen.every((r) => r.method === 'GET')).toBe(true);
  });

  it('cannot be combined with --production (exit 2)', async () => {
    const { code, output } = await smoke(['--showcase', '--production', 'http://127.0.0.1:1']);
    expect(code).toBe(2);
    expect(output).toContain('cannot be combined');
  });
});

describe('the smoke test fetch (both modes)', () => {
  const recorder = () => {
    const calls: Array<{ url: string; headers: Record<string, string>; method?: string }> = [];
    const baseFetch = (async (url: string, init: { headers: Record<string, string>; method?: string }) => { calls.push({ url, headers: init.headers, method: init.method }); return new Response('ok'); }) as unknown as typeof fetch;
    return { calls, baseFetch };
  };

  it('adds X-Wine-Match-Synthetic: 1 to every request, keeping the caller\'s headers, and the caller cannot change it', async () => {
    const { calls, baseFetch } = recorder();
    const f = syntheticFetch({ baseFetch });
    await f('http://x/a');
    await f('http://x/b', { method: 'POST', headers: { cookie: 'a=b', 'content-type': 'application/json' } });
    await f('http://x/c', { headers: new Headers({ authorization: 'x' }) });
    await f('http://x/d', { headers: { 'x-wine-match-synthetic': '0' } });
    expect(calls.map((c) => c.headers[SYNTHETIC_HEADER])).toEqual(['1', '1', '1', '1']);
    expect(calls[1].headers).toMatchObject({ cookie: 'a=b', 'content-type': 'application/json' });
    expect(calls[2].headers).toMatchObject({ authorization: 'x' });
  });

  it('in getOnly mode refuses every method but GET before anything is sent', async () => {
    const { calls, baseFetch } = recorder();
    const sent: Array<{ method: string; url: string }> = [];
    const f = syntheticFetch({ baseFetch, getOnly: true, sent });
    await f('http://x/a');
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'post']) await expect(f('http://x/b', { method })).rejects.toThrow(/GET only/);
    expect(calls).toHaveLength(1);
    expect(sent).toEqual([{ method: 'GET', url: 'http://x/a' }]);
  });
});
