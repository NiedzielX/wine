import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkRoutes, escapeRegExp, expectedRoute, mask } from '../../../scripts/check-routes.mjs';

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

type Allowlist = { publicRoutes?: { file: string; helper: string; reason: string }[]; exceptions?: { file: string; reason: string }[] };

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
    const pub = `${IMPORT}export async function GET(req) {\n  return handlePublic(req, { route: '/api/v1/open' }, async () => ok());\n}\n`;
    const file = `${API}/v1/open/route.ts`;
    const bad = check({ 'v1/open/route.ts': pub });
    expect(bad.messages).toHaveLength(1);
    expect(bad.messages[0]).toContain('opens a door without a session');
    const listed = check({ 'v1/open/route.ts': pub }, { publicRoutes: [{ file, helper: 'handlePublic', reason: 'Guest API, public by product design.' }] });
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
    const entry = (reason: string) => ({ exceptions: [{ file, reason }] });
    expect(check({ 'v1/static/route.ts': bare }, entry('Static public CSV, nothing to log at runtime.')).messages).toEqual([]);
    expect(check({ 'v1/static/route.ts': bare }, entry('')).messages.join('\n')).toContain('needs a written `reason`');
    expect(check({ 'v1/static/route.ts': good('/api/v1/static') }, entry('Static public CSV, nothing to log at runtime.')).messages.join('\n')).toContain('remove the stale exception');
    expect(check({ 'v1/other/route.ts': good('/api/v1/other') }, entry('Static public CSV, nothing to log at runtime.')).messages.join('\n')).toContain('does not exist; remove the entry');
    expect(check({ 'v1/static/route.ts': bare }, { exceptions: [] }).messages).toHaveLength(1);
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
