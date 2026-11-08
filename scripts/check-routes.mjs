#!/usr/bin/env node
/**
 * Every API route handler goes through the shared, instrumented wrapper (E21 F1): one `api request` log line and one
 * `http_requests_total` sample per request, labelled with the route PATTERN. A handler that skips the wrapper (or
 * passes no `route`) is invisible to the logs and the metrics, and a review has to catch that by hand. This is the
 * deterministic check: it reads every `route.ts` under `packages/app/src/app/api` as text (no TypeScript API needed)
 * and fails with `file:line: message`.
 *
 * Contract, per exported HTTP method (GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE):
 *  1. exactly one `handle()`, `handlePublic()` or `handleUnscoped()` call, imported by that name from
 *     `@/server/api-auth`, at the top level of the function body and RETURNED (`return handle(...)`);
 *  2. the helper is `handle` (session, CSRF, permission) unless the file is listed under `publicRoutes` in the
 *     allowlist with a reason: a public or unscoped door is a decision, not a default;
 *  3. the options carry `route: '<literal>'`: non-empty, a plain string literal, equal to the pattern derived from the
 *     file path (`api/v1/pairings/[id]/route.ts` -> `/api/v1/pairings/{id}`), and not used by any other file;
 *  4. `handle()` has a literal `write`: `true` for POST/PUT/PATCH/DELETE, `false` for GET/HEAD/OPTIONS (a write
 *     declared as a read skips the CSRF check);
 *  5. only `export function METHOD` is understood; `export const GET = ...` or `export { GET }` fails closed.
 * A file may skip all of this only through `scripts/check-routes.allowlist.json` (`exceptions`, one written reason
 * each). Allowlist entries that no longer match reality (file gone, wrapper now used) fail too, so it cannot rot.
 *
 * Not checked: early `return`s before the wrapper (parameter validation) are not logged; server actions are not
 * route handlers (they use `authorizeAction`, see `.ai/docs/engineering-standards.md`).
 *
 * Usage: node scripts/check-routes.mjs [--root <dir>] [--allowlist <file>]
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API_DIR = 'packages/app/src/app/api';
export const DEFAULT_ALLOWLIST = 'scripts/check-routes.allowlist.json';
const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HELPERS = ['handle', 'handlePublic', 'handleUnscoped'];
const WRAPPER_MODULE = '@/server/api-auth';
const MIN_REASON = 15;

/**
 * Same-length copy of `src` with comments blanked and, when `strings` is true, the content of string and template
 * literals blanked too (quotes stay, newlines stay), so offsets and line numbers match the original.
 */
export function mask(src, strings) {
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let prev = '';

  function template(i) {
    while (i < n) {
      if (src[i] === '\\') { if (strings) blank(i, i + 2); i += 2; continue; }
      if (src[i] === '`') return i + 1;
      if (src[i] === '$' && src[i + 1] === '{') { i = code(i + 2, true); continue; }
      if (strings) blank(i, i + 1);
      i++;
    }
    return i;
  }

  function code(i, inExpr) {
    let depth = 0;
    while (i < n) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === '/' && next === '/') { let j = src.indexOf('\n', i); if (j < 0) j = n; blank(i, j); i = j; continue; }
      if (ch === '/' && next === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
      if (ch === '\'' || ch === '"') {
        let j = i + 1;
        while (j < n && src[j] !== ch && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
        if (strings) blank(i + 1, j);
        i = j + 1; prev = ch; continue;
      }
      if (ch === '`') { i = template(i + 1); prev = '`'; continue; }
      if (ch === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
        let j = i + 1; let inClass = false;
        while (j < n && src[j] !== '\n' && (inClass || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false; j++; }
        blank(i, j + 1); i = j + 1; prev = '/'; continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') { if (inExpr && depth === 0) return i + 1; depth--; }
      if (!/\s/.test(ch)) prev = ch;
      i++;
    }
    return i;
  }

  code(0, false);
  return out.join('');
}

const lineOf = (src, offset) => src.slice(0, offset).split('\n').length;

/** Index just after the bracket that closes the one at `i` (`(`, `[` or `{`), or -1. Works on masked text. */
function skipBalanced(text, i) {
  let depth = 0;
  for (let k = i; k < text.length; k++) {
    const c = text[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return k + 1; }
  }
  return -1;
}

/** Split `text[from, to)` at top-level commas; returns [start, end) pairs. */
function splitTopLevel(text, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let k = from; k < to; k++) {
    const c = text[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push([start, k]); start = k + 1; }
  }
  if (text.slice(start, to).trim() !== '') parts.push([start, to]);
  return parts;
}

/** `api/v1/pairings/[id]/route.ts` -> `/api/v1/pairings/{id}` (route groups `(x)` do not appear in a URL). */
export function expectedRoute(apiDirRelativeFile) {
  const segments = apiDirRelativeFile.split(/[\\/]/).slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => s.replace(/^\[(\[?\.\.\.)?(.+?)\]?\]$/, (_m, dots, name) => `{${dots ? '...' : ''}${name}}`));
  return `/api${segments.length ? `/${segments.join('/')}` : ''}`;
}

function* routeFiles(dir) {
  let entries = [];
  try { entries = readdirSync(dir).sort(); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* routeFiles(p);
    else if (/^route\.(ts|tsx|js|jsx|mjs)$/.test(e)) yield p;
  }
}

/** The exported handlers of one file, found on masked text: `{ method, offset, body: [start, end) }` or an unsupported form. */
function exportedHandlers(masked) {
  const handlers = [];
  const unsupported = [];
  const fn = new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s*\\*?\\s*(${METHODS.join('|')})\\b`, 'g');
  for (const m of masked.matchAll(fn)) {
    const open = masked.indexOf('(', m.index + m[0].length);
    const afterParams = open < 0 ? -1 : skipBalanced(masked, open);
    const brace = afterParams < 0 ? -1 : masked.indexOf('{', afterParams);
    const end = brace < 0 ? -1 : skipBalanced(masked, brace);
    if (end < 0) unsupported.push({ offset: m.index, what: `cannot find the body of ${m[1]}` });
    else handlers.push({ method: m[1], offset: m.index, body: [brace + 1, end - 1] });
  }
  const decl = new RegExp(`\\bexport\\s+(?:const|let|var)\\s+(${METHODS.join('|')})\\b`, 'g');
  for (const m of masked.matchAll(decl)) unsupported.push({ offset: m.index, what: `\`export const ${m[1]}\` is not understood by this check; write \`export async function ${m[1]}\`` });
  for (const m of masked.matchAll(/\bexport\s*(\*|\{[^}]*\})/g)) {
    if (m[1] === '*' || METHODS.some((x) => new RegExp(`\\b${x}\\b`).test(m[1]))) unsupported.push({ offset: m.index, what: 're-exporting handlers is not understood by this check; define the handler in this file' });
  }
  return { handlers, unsupported };
}

/** Escapes every regular-expression metacharacter (backslash included), so the text matches literally. */
export function escapeRegExp(text) {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, (ch) => `\\${ch}`);
}

/** Names imported (without `as`) from the wrapper module, and the names imported under an alias. */
function wrapperImports(noComments) {
  const names = new Set();
  const aliased = new Set();
  const re = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegExp(WRAPPER_MODULE)}['"]`, 'g');
  for (const m of noComments.matchAll(re)) {
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      if (/\bas\b/.test(part)) aliased.add(part.split(/\s+as\s+/)[0].trim());
      else names.add(part.replace(/^type\s+/, ''));
    }
  }
  return { names, aliased };
}

function validateAllowlist(allowlist, rootDir, problems, allowlistName) {
  const entries = { publicRoutes: new Map(), exceptions: new Map() };
  const add = (list, kind, helperRequired) => {
    for (const [i, e] of (Array.isArray(list) ? list : []).entries()) {
      const where = `${allowlistName}: ${kind}[${i}]`;
      if (!e || typeof e.file !== 'string' || e.file === '') { problems.push({ file: allowlistName, line: 1, message: `${where} has no \`file\`` }); continue; }
      if (typeof e.reason !== 'string' || e.reason.trim().length < MIN_REASON) problems.push({ file: allowlistName, line: 1, message: `${where} (${e.file}) needs a written \`reason\` (at least ${MIN_REASON} characters): no silent skips` });
      if (helperRequired && !['handlePublic', 'handleUnscoped'].includes(e.helper)) problems.push({ file: allowlistName, line: 1, message: `${where} (${e.file}) needs \`helper\`: "handlePublic" or "handleUnscoped"` });
      if (entries[kind].has(e.file)) problems.push({ file: allowlistName, line: 1, message: `${where}: ${e.file} is listed twice` });
      if (!existsSync(join(rootDir, e.file))) problems.push({ file: allowlistName, line: 1, message: `${where}: ${e.file} does not exist; remove the entry` });
      entries[kind].set(e.file, e);
    }
  };
  add(allowlist.publicRoutes, 'publicRoutes', true);
  add(allowlist.exceptions, 'exceptions', false);
  for (const f of entries.exceptions.keys()) if (entries.publicRoutes.has(f)) problems.push({ file: allowlistName, line: 1, message: `${f} is both an exception and a public route` });
  return entries;
}

/**
 * Checks every route file under `<root>/<apiDir>`. Returns `{ problems, routes }`; a problem is `{ file, line, message }`
 * with `file` relative to `root` (slash-separated). Pure apart from reading files.
 */
export function checkRoutes({ root, apiDir = API_DIR, allowlist = { publicRoutes: [], exceptions: [] }, allowlistName = DEFAULT_ALLOWLIST }) {
  const problems = [];
  const routes = [];
  const entries = validateAllowlist(allowlist, root, problems, allowlistName);
  const base = join(root, apiDir);
  const files = [...routeFiles(base)];
  if (files.length === 0) problems.push({ file: apiDir, line: 1, message: `no route files found under ${apiDir} (wrong --root?)` });
  const seen = new Map(); // route -> first { file, line }
  const used = { publicRoutes: new Set(), exceptions: new Set() };

  for (const abs of files) {
    const file = relative(root, abs).split(sep).join('/');
    const original = readFileSync(abs, 'utf8');
    const noComments = mask(original, false);
    const masked = mask(original, true);
    const problem = (offset, message) => problems.push({ file, line: lineOf(original, offset), message });
    const calls = [...masked.matchAll(new RegExp(`(?<![.\\w$])(${HELPERS.join('|')})\\s*\\(`, 'g'))];

    if (entries.exceptions.has(file)) {
      used.exceptions.add(file);
      if (calls.length > 0) problem(calls[0].index, `${file} is listed under exceptions but calls ${calls[0][1]}(); remove the stale exception`);
      continue;
    }

    const { handlers, unsupported } = exportedHandlers(masked);
    for (const u of unsupported) problem(u.offset, u.what);
    if (handlers.length === 0 && unsupported.length === 0) problem(0, 'exports no HTTP method handler (GET, POST, ...); a route file must export one');
    const imports = wrapperImports(noComments);
    const publicEntry = entries.publicRoutes.get(file);
    const expected = expectedRoute(relative(base, abs));
    let publicSeen = false;

    for (const h of handlers) {
      const here = calls.filter((c) => c.index >= h.body[0] && c.index < h.body[1]);
      if (here.length === 0) { problem(h.offset, `${h.method} does not go through handle(), handlePublic() or handleUnscoped(): no request log line, no http_requests_total sample`); continue; }
      if (here.length > 1) { problem(here[1].index, `${h.method} calls ${here.length} wrappers; a handler goes through exactly one`); continue; }
      const call = here[0];
      const helper = call[1];
      const at = call.index;
      if (!imports.names.has(helper)) problem(at, `${helper}() is not imported by that name from '${WRAPPER_MODULE}'${imports.aliased.has(helper) ? ' (an alias hides it from this check)' : ''}`);
      const before = masked.slice(h.body[0], at).trimEnd();
      if (!/(?:^|[^\w$])return(?:\s+await)?$/.test(before)) problem(at, `${helper}() result is not returned directly (\`return ${helper}(...)\`)`);
      let depth = 0;
      for (let k = h.body[0]; k < at; k++) { if (masked[k] === '{') depth++; else if (masked[k] === '}') depth--; }
      if (depth !== 0) problem(at, `${helper}() must be called at the top level of ${h.method}, not inside a block or callback, or another path skips it`);

      if (helper !== 'handle') {
        publicSeen = true;
        if (!publicEntry) problem(at, `${helper}() opens a door without a session; ${file} must be listed under "publicRoutes" in ${allowlistName} with a reason, or use handle()`);
        else if (publicEntry.helper !== helper) problem(at, `${helper}() but ${allowlistName} lists ${file} with helper ${publicEntry.helper}`);
      }

      const open = masked.indexOf('(', at);
      const close = skipBalanced(masked, open) - 1;
      const args = splitTopLevel(masked, open + 1, close);
      const optsRange = args[1];
      const optsText = optsRange ? masked.slice(optsRange[0], optsRange[1]) : '';
      const brace = optsText.indexOf('{');
      if (!optsRange || optsText.slice(0, brace < 0 ? 0 : brace).trim() !== '' || brace < 0) { problem(at, `${helper}() needs an options object literal as its second argument, with route: '/api/...'`); continue; }
      const objStart = optsRange[0] + brace;
      const objEnd = skipBalanced(masked, objStart) - 1;
      const props = splitTopLevel(masked, objStart + 1, objEnd);
      const prop = (name) => props.find(([a, b]) => new RegExp(`^\\s*${name}\\s*(:|$)`).test(masked.slice(a, b)));
      if (props.some(([a, b]) => masked.slice(a, b).trim().startsWith('...'))) problem(objStart, `${helper}() options contain a spread; this check cannot see \`route\` through it, write the options out`);

      const routeProp = prop('route');
      if (!routeProp) problem(objStart, `${helper}() options have no \`route\`: the request log line and the metric get no route label`);
      else {
        const m = /^\s*route\s*:\s*(['"`])/.exec(masked.slice(routeProp[0], routeProp[1]));
        const valueStart = m ? routeProp[0] + m[0].length : -1;
        const valueEnd = m ? masked.indexOf(m[1], valueStart) : -1;
        const tail = m && valueEnd >= 0 ? masked.slice(valueEnd + 1, routeProp[1]).trim() : 'x';
        const value = m && valueEnd >= 0 ? original.slice(valueStart, valueEnd) : '';
        if (!m || valueEnd < 0 || tail !== '' || value.includes('${')) problem(routeProp[0], `\`route\` must be a plain string literal (the PATTERN, never the URL), not an expression`);
        else if (value.trim() === '') problem(routeProp[0], '`route` is empty');
        else {
          if (value !== expected) problem(routeProp[0], `\`route\` is '${value}' but the file path gives '${expected}'`);
          const first = seen.get(value);
          if (first && first.file !== file) problem(routeProp[0], `\`route\` '${value}' is already used by ${first.file}:${first.line}; every route has its own label`);
          else if (!first) seen.set(value, { file, line: lineOf(original, routeProp[0]) });
          routes.push({ file, method: h.method, helper, route: value });
        }
      }

      if (helper === 'handle') {
        const writeProp = prop('write');
        const w = writeProp ? /^\s*write\s*:\s*(true|false)\s*$/.exec(masked.slice(writeProp[0], writeProp[1])) : null;
        if (!w) problem(writeProp ? writeProp[0] : objStart, `handle() needs \`write: true\` or \`write: false\` as a literal`);
        else if ((w[1] === 'true') === SAFE_METHODS.has(h.method)) problem(writeProp[0], `${h.method} is ${SAFE_METHODS.has(h.method) ? 'a read' : 'a change'} but handle() says write: ${w[1]}${w[1] === 'false' ? ' (the CSRF check would be skipped)' : ''}`);
      }
    }
    if (publicEntry && !publicSeen) problems.push({ file: allowlistName, line: 1, message: `${file} is listed under publicRoutes but uses no ${publicEntry.helper}(); remove the stale entry` });
    if (publicEntry) used.publicRoutes.add(file);
  }

  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { problems, routes };
}

export function formatProblem(p) {
  return `${p.file}:${p.line}: ${p.message}`;
}

export function main(argv = process.argv.slice(2), out = console) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) args.set(argv[i], argv[i + 1]);
  for (const k of args.keys()) if (k !== '--root' && k !== '--allowlist') { out.error(`unknown argument ${k}`); return 2; }
  const root = args.get('--root') ?? fileURLToPath(new URL('..', import.meta.url));
  const allowlistPath = args.get('--allowlist') ?? join(root, DEFAULT_ALLOWLIST);
  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  } catch (e) {
    out.error(`cannot read the allowlist ${allowlistPath}: ${e instanceof Error ? e.message : e}`);
    return 2;
  }
  const { problems, routes } = checkRoutes({ root, allowlist, allowlistName: relative(root, allowlistPath).split(sep).join('/') || DEFAULT_ALLOWLIST });
  if (problems.length > 0) {
    for (const p of problems) out.error(formatProblem(p));
    out.error(`\ncheck:routes FAILED: ${problems.length} problem(s). Contract: scripts/check-routes.mjs (header comment).`);
    return 1;
  }
  out.log(`check:routes OK: ${routes.length} handlers in ${new Set(routes.map((r) => r.file)).size} route files, ${new Set(routes.map((r) => r.route)).size} unique routes.`);
  return 0;
}

/** Fail closed (lesson 2026-11-05-script-main-guard-vs-paths): on any doubt about how we were started, run main(). */
function startedDirectly() {
  try {
    return !process.argv[1] || import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return true;
  }
}

if (startedDirectly()) process.exit(main());
