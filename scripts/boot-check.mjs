#!/usr/bin/env node
/**
 * Start-up behaviour of the BUILT app (run `npm run build` first), with no database reachable:
 *   - a wrong or missing configuration stops the server (exit code 1) and names the problem
 *   - demo data is served only when it is asked for explicitly
 *   - with the database down, a request ends in a generic 500: no stack trace, no secret in the log
 *
 *   npm run boot:check
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../packages/app', import.meta.url));
const PORT = process.env.BOOT_PORT ?? '3510';
const MENU = `http://localhost:${PORT}/api/v1/public/restaurants/halka/menu`;

/**
 * Every variable the app reads, set to EMPTY unless a case sets it. next.config.ts fills in what is MISSING
 * from the repository's .env, so without this the result would depend on whoever runs the script.
 * (An empty value counts as "not set" for the app and is not overridden by the .env loader.)
 */
const BLANK = Object.fromEntries(['NODE_ENV', 'DATA_SOURCE', 'DATABASE_URL', 'AUTH_COOKIE_SECURE', 'PUBLIC_BASE_URL', 'ALLOW_DEMO_DATA', 'LOG_LEVEL', 'DEMO_RESTAURANT_SLUG', 'DB_POOL_MIN', 'DB_POOL_MAX', 'DB_DEBUG'].map((k) => [k, '']));
let failures = 0;

function expect(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       ${detail}`}`);
  if (!ok) failures++;
}

/** Starts the server with exactly these variables and reports how it behaves. */
async function run(env, { probe = true } = {}) {
  const child = spawn('npx', ['next', 'start', '-p', PORT], {
    cwd: app, env: { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1', ...BLANK, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  let exitCode = null;
  child.on('exit', (code) => { exitCode = code; });

  let response = null;
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && exitCode === null && !response) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(MENU, { signal: AbortSignal.timeout(4000) });
      if (probe) response = { status: res.status, body: await res.text() };
      else if (res.status > 0) response = { status: res.status, body: '' };
    } catch {
      /* not listening yet */
    }
  }
  await new Promise((r) => setTimeout(r, 600));   // a server that is going to exit on a bad configuration does it right after start
  const stillRunning = exitCode === null;
  try { process.kill(-child.pid); } catch { /* already gone */ }
  await new Promise((r) => setTimeout(r, 800));
  return { exitCode, stillRunning, response, log };
}

const a = await run({});
expect('production with no configuration at all: the server stops (exit 1)', !a.stillRunning && a.exitCode === 1, `exit ${a.exitCode}, running ${a.stillRunning}`);
expect('…and says what to set, once', /DATA_SOURCE: must be set in production/.test(a.log) && !/PUBLIC password/.test(a.log), a.log.slice(-400));

const b = await run({ DATA_SOURCE: 'postgress' });
expect('a typo in DATA_SOURCE does not silently pick the demo data', !b.stillRunning && b.exitCode === 1 && /DATA_SOURCE: must be/.test(b.log), `exit ${b.exitCode}\n${b.log.slice(-300)}`);

const c = await run({ DATA_SOURCE: 'memory' });
expect('demo data in production needs ALLOW_DEMO_DATA=true', !c.stillRunning && c.exitCode === 1 && /PUBLIC password/.test(c.log), `exit ${c.exitCode}\n${c.log.slice(-300)}`);

const d = await run({ DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', AUTH_COOKIE_SECURE: 'false' });
expect('demo mode on purpose starts with no database and serves the demo menu', d.stillRunning && d.response?.status === 200 && d.response.body.includes('"Halka"'), `${d.response?.status} ${d.log.slice(-200)}`);
expect('the start is logged as one JSON line', /"msg":"server starting"/.test(d.log), d.log.slice(-300));

// port 1 is closed: the database is "down"; the password in the URL must never reach the log or the client
const e = await run({ DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://wine:TopSecretPw9@127.0.0.1:1/winematch', AUTH_COOKIE_SECURE: 'false' });
expect('configured for postgres with the database down: the server still starts', e.stillRunning && e.response !== null, `exit ${e.exitCode}\n${e.log.slice(-300)}`);
expect('…a request fails with a generic 500', e.response?.status === 500 && /"code":"unexpected"/.test(e.response.body), `${e.response?.status} ${e.response?.body}`);
expect('…the client gets no stack trace and no connection details', !/ at |node_modules|127\.0\.0\.1|TopSecretPw9/.test(e.response?.body ?? ''), e.response?.body);
expect('…the failure is logged, with the password redacted', /"msg":"api request failed"/.test(e.log) && !e.log.includes('TopSecretPw9'), `password in log: ${e.log.includes('TopSecretPw9')}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll boot checks passed');
process.exit(failures ? 1 : 0);
