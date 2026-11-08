import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkRoutes, escapeRegExp, expectedRoute, main, mask } from '../../../scripts/check-routes.mjs';

/**
 * `scripts/check-routes.mjs`: every API route handler goes through handle()/handlePublic()/handleUnscoped() with a
 * unique, literal `route` (E21 F1). Fixture route trees are written to a temporary directory whose name has a space.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/check-routes.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const API = 'packages/app/src/app/api';
const IMPORT = "import { handle, handlePublic, handleUnscoped } from '@/server/api-auth';\n";

const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

type Allowlist = { publicRoutes?: { file?: string; helper?: string; methods?: string[]; reason?: string }[]; exceptions?: { file?: string; methods?: string[]; reason?: string }[]; earlyReturns?: { file: string; methods?: string[]; reason?: string }[] };

/** Writes `{ 'v1/x/route.ts': source }` under a fresh root and checks it. */
function check(files: Record<string, string>, allowlist: Allowlist = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check routes '));
  roots.push(root);
  for (const [rel, src] of Object.entries(files)) {
    const abs = join(root, API, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, src);
  }
  const result = checkRoutes({ root, allowlist: { publicRoutes: [], exceptions: [], ...allowlist } });
  return { ...result, root, messages: result.problems.map((p: { file: string; line: number; message: string }) => `${p.file}:${p.line}: ${p.message}`) };
}

const good = (route: string, method = 'GET', write = 'false') =>
  `${IMPORT}export async function ${method}(req) {\n  return handle(req, { route: '${route}', write: ${write}, slug: 's', permission: 'panel.view' }, async () => ok());\n}\n`;

describe('check-routes', () => {
  it('passes a clean tree (handle, several methods in one file, a dynamic segment)', () => {
    const r = check({
      'v1/things/route.ts': good('/api/v1/things'),
      'v1/things/[id]/route.ts': `${good('/api/v1/things/{id}', 'PATCH', 'true')}${good('/api/v1/things/{id}', 'DELETE', 'true').replace(IMPORT, '')}`
    });
    expect(r.messages).toEqual([]);
    expect(r.routes).toHaveLength(3);
  });

  it('fails a handler that skips the wrapper, with file:line', () => {
    const r = check({ 'v1/bare/route.ts': `${IMPORT}\nexport async function GET(req) {\n  return NextResponse.json({});\n}\n` });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toMatch(/^packages\/app\/src\/app\/api\/v1\/bare\/route\.ts:3: GET does not go through handle\(\)/);
  });

  it('fails a wrapper call without `route`', () => {
    const r = check({ 'v1/team/route.ts': `${IMPORT}export async function GET(req) {\n  return handle(req, { write: false, slug: 's', permission: 'team.manage' }, async () => ok());\n}\n` });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]).toContain('route.ts:3: ');
    expect(r.messages[0]).toContain('have no `route`');
  });

  it('fails an empty route, a computed route and a route that does not match the file path', () => {
    expect(check({ 'v1/a/route.ts': good('') }).messages.join('\n')).toContain('`route` is empty');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace("'/api/v1/a'", 'pathOf(req)') }).messages.join('\n')).toContain('plain string literal');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace("'/api/v1/a'", '`/api/v1/${x}`') }).messages.join('\n')).toContain('plain string literal');
    expect(check({ 'v1/a/route.ts': good('/api/v1/b') }).messages.join('\n')).toContain("is '/api/v1/b' but the file path gives '/api/v1/a'");
  });

  it('fails a route label used by two files and names the first one', () => {
    const r = check({ 'v1/a/route.ts': good('/api/v1/a'), 'v1/(group)/a/route.ts': good('/api/v1/a') });
    expect(r.messages.some((m) => m.includes("'/api/v1/a' is already used by packages/app/src/app/api/v1/"))).toBe(true);
  });

  it('fails handlePublic/handleUnscoped on a route that is not listed as public, passes once it is listed', () => {
    const pub = `${IMPORT}export async function GET(req) {\n  return handlePublic(req, { route: '/api/v1/open', write: false }, async () => ok());\n}\n`;
    const file = `${API}/v1/open/route.ts`;
    const bad = check({ 'v1/open/route.ts': pub });
    expect(bad.messages).toHaveLength(1);
    expect(bad.messages[0]).toContain('opens a door without a session');
    const listed = check({ 'v1/open/route.ts': pub }, { publicRoutes: [{ file, helper: 'handlePublic', methods: ['GET'], reason: 'Guest API, public by product design.' }] });
    expect(listed.messages).toEqual([]);
  });

  it('fails a write declared as a read (CSRF skipped) and a read declared as a write', () => {
    expect(check({ 'v1/a/route.ts': good('/api/v1/a', 'POST', 'false') }).messages.join('\n')).toContain('POST is a change but handle() says write: false (the CSRF check would be skipped)');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a', 'GET', 'true') }).messages.join('\n')).toContain('GET is a read but handle() says write: true');
  });

  it('fails unsupported export forms and a wrapper that is not returned, nested, aliased or doubled', () => {
    expect(check({ 'v1/a/route.ts': `${IMPORT}export const GET = (req) => handle(req, { route: '/api/v1/a', write: false }, run);\n` }).messages.join('\n')).toContain('`export const GET` is not understood');
    expect(check({ 'v1/a/route.ts': `${IMPORT}export { GET } from './impl';\n` }).messages.join('\n')).toContain('re-exporting handlers');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace('return handle', 'handle') }).messages.join('\n')).toContain('result is not returned directly');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace('  return handle(req, { route: \'/api/v1/a\', write: false, slug: \'s\', permission: \'panel.view\' }, async () => ok());', "  if (x) {\n    return handle(req, { route: '/api/v1/a', write: false }, async () => ok());\n  }\n  return NextResponse.json({});") }).messages.join('\n')).toContain('top level');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace('{ handle, handlePublic, handleUnscoped }', '{ handle as h }') }).messages.join('\n')).toContain('an alias hides it');
    expect(check({ 'v1/a/route.ts': good('/api/v1/a').replace('async () => ok());', 'async () => handle(req, { route: \'/api/v1/a\', write: false }, run));') }).messages.join('\n')).toContain('calls 2 wrappers');
  });

  it('ignores wrapper names and `route:` inside comments and strings', () => {
    const src = `${IMPORT}// return handle(req, { route: '/api/v1/z' })\nconst note = "handle(req, { route: '/api/v1/z' })";\nexport async function GET(req) {\n  /* handle(x) */\n  return NextResponse.json(note);\n}\n`;
    expect(check({ 'v1/a/route.ts': src }).messages.join('\n')).toContain('GET does not go through');
    expect(mask("const a = 'x';// c\n`t${1}`", true)).toHaveLength("const a = 'x';// c\n`t${1}`".length);
  });

  it('lets an allowlisted exception skip the wrapper, and fails a stale, reasonless or dangling entry', () => {
    const bare = `export async function GET() {\n  return new Response('csv');\n}\n`;
    const file = `${API}/v1/static/route.ts`;
    const entry = (reason: string) => ({ exceptions: [{ file, methods: ['GET'], reason }] });
    expect(check({ 'v1/static/route.ts': bare }, entry('Static public CSV, nothing to log at runtime.')).messages).toEqual([]);
    expect(check({ 'v1/static/route.ts': bare }, entry('')).messages.join('\n')).toContain('needs a written `reason`');
    expect(check({ 'v1/static/route.ts': good('/api/v1/static') }, entry('Static public CSV, nothing to log at runtime.')).messages.join('\n')).toContain('remove the stale exception');
    expect(check({ 'v1/other/route.ts': good('/api/v1/other') }, entry('Static public CSV, nothing to log at runtime.')).messages.join('\n')).toContain('does not exist; remove the entry');
    expect(check({ 'v1/static/route.ts': bare }, { exceptions: [] }).messages).toHaveLength(1);
  });

  describe('allowlist entries are per method', () => {
    const file = `${API}/v1/static/route.ts`;
    const bare = (methods: string[]) => methods.map((m) => `export async function ${m}() {\n  return new Response('x');\n}\n`).join('');
    const exc = (methods?: string[]) => ({ exceptions: [{ file, ...(methods ? { methods } : {}), reason: 'Static public CSV, nothing to log at runtime.' }] });
    const pub = (m: string) => `export async function ${m}(req) {\n  return handlePublic(req, { route: '/api/v1/static', write: false }, async () => ok());\n}\n`;
    const pubEntry = (methods?: string[]) => ({ publicRoutes: [{ file, helper: 'handlePublic', ...(methods ? { methods } : {}), reason: 'Guest API, public by product design.' }] });

    it('passes when the exported methods are exactly the listed ones', () => {
      expect(check({ 'v1/static/route.ts': bare(['GET']) }, exc(['GET'])).messages).toEqual([]);
      expect(check({ 'v1/static/route.ts': `${IMPORT}${pub('GET')}` }, pubEntry(['GET'])).messages).toEqual([]);
    });

    it('fails a method added later to an allowlisted exception file', () => {
      const m = check({ 'v1/static/route.ts': bare(['GET', 'POST']) }, exc(['GET'])).messages.join('\n');
      expect(m).toContain('v1/static/route.ts:4: POST is exported by an allowlisted file but not listed in its "methods"');
    });

    it('fails a method added later to a public-route file', () => {
      const src = `${IMPORT}${pub('GET')}${good('/api/v1/static', 'POST', 'true').replace(IMPORT, '')}`;
      expect(check({ 'v1/static/route.ts': src }, pubEntry(['GET'])).messages.join('\n')).toContain('POST is exported by an allowlisted file but not listed in its "methods"');
    });

    it('fails a listed method the file no longer exports', () => {
      expect(check({ 'v1/static/route.ts': bare(['GET']) }, exc(['GET', 'HEAD'])).messages.join('\n')).toContain('lists HEAD but the file does not export it');
      expect(check({ 'v1/static/route.ts': `${IMPORT}${pub('GET')}` }, pubEntry(['GET', 'POST'])).messages.join('\n')).toContain('lists POST but the file does not export it');
    });

    it('requires a valid `methods` array on every entry', () => {
      expect(check({ 'v1/static/route.ts': bare(['GET']) }, exc()).messages.join('\n')).toContain('needs `methods`');
      expect(check({ 'v1/static/route.ts': bare(['GET']) }, exc([])).messages.join('\n')).toContain('needs `methods`');
      expect(check({ 'v1/static/route.ts': bare(['GET']) }, exc(['FETCH'])).messages.join('\n')).toContain('unknown method FETCH');
      expect(check({ 'v1/static/route.ts': `${IMPORT}${pub('GET')}` }, pubEntry()).messages.join('\n')).toContain('needs `methods`');
    });
  });

  describe('early code before the wrapper', () => {
    const file = `${API}/v1/e/route.ts`;
    const early = (guard: string) => `${IMPORT}export async function GET(req) {\n  ${guard}\n  return handle(req, { route: '/api/v1/e', write: false }, async () => ok());\n}\n`;
    const entry = (methods = ['GET']) => ({ earlyReturns: [{ file, methods, reason: 'tracked: fixed by refuseEarly() in the api-robustness branch (K3); remove when that lands' }] });

    it('fails a validation return before the wrapper', () => {
      const r = check({ 'v1/e/route.ts': early('if (!req.slug) { return apiError(422); }') });
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0]).toContain('GET has `if` before handle()');
    });
    it('fails a throw and a braceless `if (x) return handle(...)`', () => {
      expect(check({ 'v1/e/route.ts': early('throw new Error("x");') }).messages.join('\n')).toContain('has `throw` before handle()');
      const braceless = `${IMPORT}export async function GET(req) {\n  if (x) return handle(req, { route: '/api/v1/e', write: false }, async () => ok());\n  return NextResponse.json({});\n}\n`;
      expect(check({ 'v1/e/route.ts': braceless }).messages.join('\n')).toContain('before handle()');
    });
    it('allows plain statements (destructuring params) before the wrapper', () => {
      expect(check({ 'v1/e/route.ts': early('const { slug } = await req.params;') }).messages).toEqual([]);
    });
    it('passes an allowlisted early return, fails a stale entry and an unlisted method', () => {
      expect(check({ 'v1/e/route.ts': early('if (!x) return apiError(422);') }, entry()).messages).toEqual([]);
      expect(check({ 'v1/e/route.ts': early('const a = 1;') }, entry()).messages.join('\n')).toContain('no code before the wrapper any more; remove the stale entry');
      const two = `${early('if (!x) return apiError(422);')}${early('if (!x) return apiError(422);').replace(IMPORT, '').replace('GET', 'DELETE').replace('write: false', 'write: true')}`;
      expect(check({ 'v1/e/route.ts': two }, entry()).messages.join('\n')).toContain('DELETE has `if` before handle()');
    });
  });

  describe('write literal on public routes, scope and parsing details', () => {
    const pubSrc = (opts: string) => `${IMPORT}export async function POST(req) {\n  return handlePublic(req, { route: '/api/v1/p'${opts} }, async () => ok());\n}\n`;
    const pubAllow = { publicRoutes: [{ file: `${API}/v1/p/route.ts`, helper: 'handlePublic', methods: ['POST'], reason: 'Guest API: read-only POST, public by product design.' }] };

    it('requires an explicit write literal for handlePublic, true or false', () => {
      expect(check({ 'v1/p/route.ts': pubSrc('') }, pubAllow).messages.join('\n')).toContain('handlePublic() needs `write: true` or `write: false` as a literal');
      expect(check({ 'v1/p/route.ts': pubSrc(', write: flag') }, pubAllow).messages.join('\n')).toContain('needs `write: true` or `write: false`');
      expect(check({ 'v1/p/route.ts': pubSrc(', write: false') }, pubAllow).messages).toEqual([]);
      expect(check({ 'v1/p/route.ts': pubSrc(', write: true') }, pubAllow).messages).toEqual([]);
    });

    it('fails a route file outside api/ (any extension) unless it is an exception', () => {
      const root = mkdtempSync(join(tmpdir(), 'check routes '));
      roots.push(root);
      const write = (rel: string, src: string) => { const abs = join(root, 'packages/app/src/app', rel); mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, src); };
      write('api/v1/a/route.ts', good('/api/v1/a'));
      write('(showcase)/demo/route.mts', `export async function GET() {\n  return new Response('x');\n}\n`);
      const strays = checkRoutes({ root, allowlist: { publicRoutes: [], exceptions: [] } }).problems.map((p: { file: string; message: string }) => `${p.file}: ${p.message}`);
      expect(strays.join('\n')).toContain('(showcase)/demo/route.mts: route handler outside packages/app/src/app/api');
      const listed = checkRoutes({ root, allowlist: { publicRoutes: [], exceptions: [{ file: 'packages/app/src/app/(showcase)/demo/route.mts', methods: ['GET'], reason: 'Static demo redirect, no data, nothing to log.' }] } });
      expect(listed.problems).toEqual([]);
    });

    it('reads a return type with braces and `route: ... as const`', () => {
      const src = `${IMPORT}export async function GET(req): Promise<{ a: 1 } | Response> {\n  return handle(req, { route: '/api/v1/a' as const, write: false }, async () => ok());\n}\n`;
      expect(check({ 'v1/a/route.ts': src }).messages).toEqual([]);
    });
  });

  describe('every rule goes red when its trigger appears', () => {
    const one = (opts: string, header = IMPORT) => `${header}export async function GET(req) {\n  return handle(req, ${opts}, async () => ok());\n}\n`;
    const msgs = (files: Record<string, string>, a: Allowlist = {}) => check(files, a).messages.join('\n');
    const reason = 'A written reason that is long enough.';

    it('options: spread, non-literal second argument, missing second argument', () => {
      expect(msgs({ 'v1/a/route.ts': one("{ ...base, route: '/api/v1/a', write: false }") })).toContain('options contain a spread');
      expect(msgs({ 'v1/a/route.ts': one('opts') })).toContain('needs an options object literal as its second argument');
      expect(msgs({ 'v1/a/route.ts': `${IMPORT}export async function GET(req) {\n  return handle(req);\n}\n` })).toContain('needs an options object literal');
    });

    it('write: missing or not a literal', () => {
      expect(msgs({ 'v1/a/route.ts': one("{ route: '/api/v1/a' }") })).toContain('handle() needs `write: true` or `write: false` as a literal');
      expect(msgs({ 'v1/a/route.ts': one("{ route: '/api/v1/a', write: isWrite }") })).toContain('needs `write: true` or `write: false`');
    });

    it('helper not imported by that name (no alias, no import at all)', () => {
      expect(msgs({ 'v1/a/route.ts': one("{ route: '/api/v1/a', write: false }", '') })).toContain("handle() is not imported by that name from '@/server/api-auth'");
      expect(msgs({ 'v1/a/route.ts': one("{ route: '/api/v1/a', write: false }", "import { handle } from './local-api';\n") })).toContain('is not imported by that name');
    });

    it('cannot find the body of a handler', () => {
      expect(msgs({ 'v1/a/route.ts': 'export async function GET(req)' })).toContain('cannot find the body of GET');
    });

    it('allowlist entries: missing file or helper, listed twice, exception and public at once, stale public entry', () => {
      const f = `${API}/v1/a/route.ts`;
      const src = { 'v1/a/route.ts': one("{ route: '/api/v1/a', write: false }") };
      expect(msgs(src, { exceptions: [{ methods: ['GET'], reason }] })).toContain('has no `file`');
      expect(msgs(src, { publicRoutes: [{ file: f, methods: ['GET'], reason }] })).toContain('needs `helper`: "handlePublic" or "handleUnscoped"');
      expect(msgs(src, { exceptions: [{ file: f, methods: ['GET'], reason }, { file: f, methods: ['GET'], reason }] })).toContain('is listed twice');
      expect(msgs(src, { exceptions: [{ file: f, methods: ['GET'], reason }], publicRoutes: [{ file: f, helper: 'handlePublic', methods: ['GET'], reason }] })).toContain('is both an exception and a public route');
      expect(msgs(src, { publicRoutes: [{ file: f, helper: 'handlePublic', methods: ['GET'], reason }] })).toContain('is listed under publicRoutes but uses no handlePublic()');
      const pub = `${IMPORT}export async function GET(req) {\n  return handlePublic(req, { route: '/api/v1/a', write: false }, async () => ok());\n}\n`;
      expect(msgs({ 'v1/a/route.ts': pub }, { publicRoutes: [{ file: f, helper: 'handleUnscoped', methods: ['GET'], reason }] })).toContain('but scripts/check-routes.allowlist.json lists');
      expect(msgs(src, { exceptions: [{ file: f, methods: ['GET', 'GET'], reason }] })).toContain('a method is listed twice');
    });
  });

  describe('mutation guards: each rule has its own red test', () => {
    const wrap = "return handle(req, { route: '/api/v1/m', write: false }, async () => ok());";
    const withPrelude = (prelude: string) => `${IMPORT}export async function GET(req) {\n  ${prelude}\n  ${wrap}\n}\n`;
    const msgs = (files: Record<string, string>, a: Allowlist = {}) => check(files, a).messages.join('\n');

    it.each([
      ['return', 'const f = () => { return 1; };'],
      ['throw', 'const f = () => { throw 1; };'],
      ['else', 'else { }'],
      ['for', 'for (const a of b) { }'],
      ['while', 'while (x) { }'],
      ['switch', 'switch (x) { }'],
      ['do', 'do { } while (x);'],
      ['try', 'try { } catch { }']
    ])('fails `%s` before the wrapper', (keyword, prelude) => {
      expect(msgs({ 'v1/m/route.ts': withPrelude(prelude) })).toContain(`GET has \`${keyword}\` before handle()`);
    });

    it('does not read keyword-like words or property names as control flow', () => {
      expect(msgs({ 'v1/m/route.ts': withPrelude('const a = obj.return + obj.if + format + doIt + tryOut + elsewhere;') })).toBe('');
    });

    it('fails `export const POST` inside an exceptions file', () => {
      const src = `export async function GET() {\n  return new Response('x');\n}\nexport const POST = async () => new Response('y');\n`;
      const entry = { exceptions: [{ file: `${API}/v1/m/route.ts`, methods: ['GET'], reason: 'Static public CSV, nothing to log at runtime.' }] };
      expect(msgs({ 'v1/m/route.ts': src }, entry)).toContain('`export const POST` is not understood');
    });

    it('ignores keywords, wrapper names and `route:` inside strings, templates and regex literals', () => {
      const prelude = [
        'const s = "return throw if handle(x) route: \'/api/v1/zzz\'";',
        'const t = `else for while handle(y) route: \'/api/v1/zzz\'`;',
        'const r = /switch|try|do|handle\\(z\\)|route: \'x\'/;'
      ].join('\n  ');
      expect(msgs({ 'v1/m/route.ts': withPrelude(prelude) })).toBe('');
      const noRoute = `${IMPORT}export async function GET(req) {\n  return handle(req, { write: false, label: "route: '/api/v1/m'" }, async () => ok());\n}\n`;
      expect(msgs({ 'v1/m/route.ts': noRoute })).toContain('have no `route`');
      expect(mask('a("x"); /* c */ // d\nb', true)).not.toMatch(/x|\bc\b|\bd\b/);
    });

    it('accepts `return await handle(...)`', () => {
      const src = `${IMPORT}export async function GET(req) {\n  return await handle(req, { route: '/api/v1/m', write: false }, async () => ok());\n}\n`;
      expect(msgs({ 'v1/m/route.ts': src })).toBe('');
    });

    it('does not treat `.handle(` or `$handle(` as the wrapper', () => {
      for (const callee of ['other.handle', '$handle']) {
        const src = `${IMPORT}export async function GET(req) {\n  return ${callee}(req, { route: '/api/v1/m', write: false }, async () => ok());\n}\n`;
        expect(msgs({ 'v1/m/route.ts': src })).toContain('GET does not go through handle()');
      }
    });

    it('main(): 0 on the real tree, 1 with file:line on a bad one, 2 on a bad argument or allowlist', () => {
      const lines: string[] = [];
      const out = { log: (m: string) => lines.push(`log ${m}`), error: (m: string) => lines.push(`err ${m}`) };
      expect(main(['--root', REPO], out)).toBe(0);
      expect(lines.join('\n')).toContain('log check:routes OK');
      lines.length = 0;
      const bad = check({ 'v1/bare/route.ts': 'export async function GET() {\n  return null;\n}\n' });
      const allowlist = join(bad.root, 'al.json');
      writeFileSync(allowlist, JSON.stringify({}));
      expect(main(['--root', bad.root, '--allowlist', allowlist], out)).toBe(1);
      expect(lines.join('\n')).toContain('v1/bare/route.ts:1: GET does not go through');
      expect(main(['--bogus', 'x'], out)).toBe(2);
      expect(main(['--root', bad.root, '--allowlist', join(bad.root, 'missing.json')], out)).toBe(2);
    });
  });

  it('fails a route file that exports no HTTP method, and an empty tree', () => {
    expect(check({ 'v1/a/route.ts': 'export const dynamic = "force-dynamic";\n' }).messages.join('\n')).toContain('exports no HTTP method handler');
    expect(check({}).messages.join('\n')).toContain('no route files found');
  });

  it('derives the route pattern from the file path', () => {
    expect(expectedRoute('v1/pairings/[id]/route.ts')).toBe('/api/v1/pairings/{id}');
    expect(expectedRoute('v1/(g)/x/[a]/y/route.ts')).toBe('/api/v1/x/{a}/y');
    expect(expectedRoute('route.ts')).toBe('/api');
  });

  it('CLI: exit 0 and a summary on the real tree, exit 1 with file:line on a broken copy (path with a space)', () => {
    const ok = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('check:routes OK');
    const r = check({ 'v1/bare/route.ts': `export async function GET() {\n  return null;\n}\n` });
    const allowlist = join(r.root, 'allowlist.json');
    writeFileSync(allowlist, JSON.stringify({ publicRoutes: [], exceptions: [] }));
    const bad = spawnSync(process.execPath, [SCRIPT, '--root', r.root, '--allowlist', allowlist], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('v1/bare/route.ts:1: GET does not go through');
    expect(bad.stderr).toContain('check:routes FAILED');
    const missing = spawnSync(process.execPath, [SCRIPT, '--root', r.root, '--allowlist', join(r.root, 'nope.json')], { encoding: 'utf8' });
    expect(missing.status).toBe(2);
  });

  it('the real allowlist is consistent with the real tree (no stale entry, every reason written)', () => {
    expect(() => execFileSync(process.execPath, [SCRIPT, '--root', REPO], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('escapeRegExp (CodeQL js/incomplete-sanitization: backslash must be escaped too)', () => {
  const tricky = ['@/server/api-auth', 'a\\b', 'a\\/b', '\\', '\\\\', 'a.b*c+d?e', '(x|y)[z]{1,2}^$', '/', 'x\\.y'];

  it.each(tricky)('matches the text %j literally and nothing else', (text) => {
    const re = new RegExp(`^${escapeRegExp(text)}$`);
    expect(re.test(text)).toBe(true);
    expect(re.test(`${text}x`)).toBe(false);
    expect(re.test(`x${text}`)).toBe(false);
  });

  it('escapes the backslash before it can swallow the next escape (the exact CodeQL finding)', () => {
    // A slash-only escape turns `a\/b` into `a\\/b`, i.e. an escaped backslash followed by an unescaped slash.
    expect(escapeRegExp('a\\/b')).toBe('a\\\\\\/b');
    expect(new RegExp(escapeRegExp('a\\/b')).test('a\\/b')).toBe(true);
  });
});
