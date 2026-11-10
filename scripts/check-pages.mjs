#!/usr/bin/env node
/**
 * Every page, layout and server action of the dashboard checks access BEFORE it reads data (threat model T-29, lesson
 * 2026-11-08-page-reads-data-in-parallel-with-layout-check). Next.js renders a layout and its page in parallel, so the
 * `[slug]` layout's `requireAccess` does not protect the page: a page that reads first streams the restaurant's data into the
 * 403 or the sign-in redirect. A review missed it once; this is the deterministic check. It reads every server file under
 * `packages/app/src/app/(admin)/admin` as text (the masking of `check-routes.mjs`, no TypeScript API) and fails with
 * `file:line: message`.
 *
 * Contract, per file (client files, `'use client'`, are skipped):
 *  1. `page`, `layout`, `template` and `default` files: the default export calls `requireAccess(` at the top level of its body
 *     (not in a block or callback), awaited (`await requireAccess(slug)` or `(await requireAccess(slug)).can(...)`);
 *  2. `'use server'` files: every exported function calls `act(`, `perform(` or `authorizeAction(` at the top level, awaited
 *     or returned;
 *  3. in every exported function of any server file under the tree: nothing reads data before that gate. A read is a call of a
 *     method on a `…Service` (`adminService.menu(`, `c.teamService.list(`), `createRequestScope(`, or an `await` of anything
 *     but `params`, `searchParams`, `getI18n()`, `getRequestScope()`, `headers()` or `cookies()`. A file that is not a page,
 *     layout or action needs a gate only when it reads;
 *  4. the gate is never started together with reads: `requireAccess(` (or another gate) inside the arguments of
 *     `Promise.all`, `allSettled`, `race` or `any` fails (a rejected gate rejects the batch, but the reads already ran);
 *  5. only `export [default] [async] function` is understood; `export const x = async …` and a default export that is not a
 *     function declaration fail closed in the files of rules 1 and 2.
 * A file may skip rules 1 to 3 only through `scripts/check-pages.allowlist.json` (`file`, the exact exported `functions`
 * the entry covers, `default` for the default export, and a written `reason`); a stale entry (file gone, function gone, or the
 * function now passes) fails, so the list cannot rot. Rule 4 has no allowlist.
 *
 * Known limits (a text scan): a read hidden in a helper that does not name a `…Service` (e.g. `load(slug)` that reads inside) is
 * not seen unless it is awaited before the gate; a gate called on a path that may not run (`cond && await requireAccess(…)`)
 * passes; a service held in a variable not named `…Service` is not seen. API routes are `check:routes`'s (handle() with a
 * permission checks before the handler runs).
 *
 * Usage: node scripts/check-pages.mjs [--root <dir>] [--allowlist <file>]
 */
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Same-length copy of `src` with comments blanked and, when `strings` is true, the content of string and template literals
 * blanked too (quotes, newlines and `${…}` code stay), so offsets and line numbers match the original. Unlike the masker of
 * `check-routes.mjs` it does not guess regular-expression literals: pages are JSX, and `</Tag>` would read as one.
 */
export function mask(src, strings) {
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
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
        i = j + 1; continue;
      }
      if (ch === '`') { i = template(i + 1); continue; }
      if (ch === '{') depth++;
      if (ch === '}') { if (inExpr && depth === 0) return i + 1; depth--; }
      i++;
    }
    return i;
  }
  code(0, false);
  return out.join('');
}

export const ADMIN_DIR = 'packages/app/src/app/(admin)/admin';
export const DEFAULT_ALLOWLIST = 'scripts/check-pages.allowlist.json';
const MIN_REASON = 15;
const RENDER_FILES = /^(page|layout|template|default)\.(tsx|ts|jsx|js)$/;
const SAFE_AWAIT = /^\(?\s*(params|searchParams|props\s*\.\s*params|props\s*\.\s*searchParams|getI18n\s*\(\s*\)|getRequestScope\s*\(\s*\)|headers\s*\(\s*\)|cookies\s*\(\s*\))(?![\w$])/;
const SERVICE_CALL = /(?<![\w$])([A-Za-z_$][\w$]*Service)\s*\.\s*[A-Za-z_$][\w$]*\s*\(/g;
const SCOPE_CALL = /(?<![\w$.])createRequestScope\s*\(/g;
const PARALLEL = /(?<![\w$])Promise\s*\.\s*(all|allSettled|race|any)\s*\(/g;
const PAGE_GATES = ['requireAccess'];
const ACTION_GATES = ['act', 'perform', 'authorizeAction'];

const lineOf = (src, offset) => src.slice(0, offset).split('\n').length;

function skipBalanced(text, i) {
  let depth = 0;
  for (let k = i; k < text.length; k++) {
    const c = text[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return k + 1; }
  }
  return -1;
}

/** Index of the `{` that opens a function body after its parameters, skipping a return type annotation. */
function bodyBrace(text, i) {
  let k = i;
  while (k < text.length && /\s/.test(text[k])) k++;
  if (text[k] !== ':') return text.indexOf('{', i);
  let angle = 0;
  let paren = 0;
  for (k += 1; k < text.length; k++) {
    const c = text[k];
    if (c === '<') angle++;
    else if (c === '>' && text[k - 1] !== '=') angle--;
    else if (c === '(' || c === '[') paren++;
    else if (c === ')' || c === ']') paren--;
    else if (c === '{') {
      if (angle === 0 && paren === 0) return k;
      const end = skipBalanced(text, k);
      if (end < 0) return -1;
      k = end - 1;
    }
  }
  return -1;
}

function* serverFiles(dir) {
  let entries = [];
  try { entries = readdirSync(dir).sort(); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* serverFiles(p);
    else if (/\.(tsx|ts|jsx|js|mts|mjs)$/.test(e) && !/\.d\.ts$/.test(e)) yield p;
  }
}

/** The leading directive of a file (`'use client'` / `'use server'`), read from the text with comments blanked. */
function directive(noComments) {
  const m = /^\s*(['"])use (client|server)\1/.exec(noComments);
  return m ? m[2] : null;
}

/** Exported functions: `{ name, offset, body: [start, end) }`; `default` for the default export. Unsupported forms separately. */
function exportedFunctions(masked) {
  const fns = [];
  const unsupported = [];
  for (const m of masked.matchAll(/\bexport\s+(default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const name = m[1] ? 'default' : m[2];
    if (!name) continue;
    const open = m.index + m[0].length - 1;
    const after = skipBalanced(masked, open);
    const brace = after < 0 ? -1 : bodyBrace(masked, after);
    const end = brace < 0 ? -1 : skipBalanced(masked, brace);
    if (end < 0) unsupported.push({ offset: m.index, name, always: true, what: `cannot find the body of ${name === 'default' ? 'the default export' : name}; this check fails closed` });
    else fns.push({ name, offset: m.index, body: [brace + 1, end - 1] });
  }
  for (const m of masked.matchAll(/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\b|\(|function\b)/g)) {
    unsupported.push({ offset: m.index, name: m[1], what: `\`export const ${m[1]} = …\` is not understood by this check; write \`export async function ${m[1]}\`` });
  }
  for (const m of masked.matchAll(/\bexport\s+default\s+(?!async\b|function\b)/g)) unsupported.push({ offset: m.index, name: 'default', what: 'the default export is not a function declaration; this check cannot see its access check (write `export default async function Page(...)`)' });
  return { fns, unsupported };
}

/** Brace depth of `at` relative to the body start (parentheses do not count: `(await requireAccess(s)).can(...)` is top level). */
function braceDepth(masked, from, at) {
  let depth = 0;
  for (let k = from; k < at; k++) { if (masked[k] === '{') depth++; else if (masked[k] === '}') depth--; }
  return depth;
}

/** [start, end) of the arguments of every Promise.all/allSettled/race/any call in the range. */
function parallelRanges(masked, [start, end]) {
  const out = [];
  for (const m of masked.slice(start, end).matchAll(PARALLEL)) {
    const open = start + m.index + m[0].length - 1;
    const close = skipBalanced(masked, open);
    out.push({ at: start + m.index, kind: m[1], range: [open, close < 0 ? end : close] });
  }
  return out;
}

/**
 * Analyses one function body. Returns `{ gate, reads, parallel, problems }`: `gate` the offset of the first valid gate call (or
 * -1), `reads` the offsets of reads before it.
 */
function analyse(masked, original, fn, gates) {
  const [start, end] = fn.body;
  const text = masked.slice(start, end);
  const notes = [];
  const parallel = parallelRanges(masked, fn.body);
  let gate = -1;
  const gateRe = new RegExp(`(?<![\\w$.])(${gates.join('|')})\\s*\\(`, 'g');
  for (const m of text.matchAll(gateRe)) {
    const at = start + m.index;
    const inParallel = parallel.find((p) => at > p.range[0] && at < p.range[1]);
    if (inParallel) { notes.push({ offset: at, kind: 'parallel', message: `${m[1]}() is started inside Promise.${inParallel.kind}(...) together with other work: the reads run before the check rejects; await ${m[1]}() on its own line first` }); continue; }
    if (gate >= 0 || braceDepth(masked, start, at) !== 0) continue;
    const before = masked.slice(start, at).replace(/\s+$/, '');
    if (!/(?:^|[^\w$])(await\s*\(?|return)$/.test(before)) continue;
    gate = at;
  }
  const limit = gate < 0 ? end : gate;
  const reads = [];
  for (const m of masked.slice(start, limit).matchAll(SERVICE_CALL)) reads.push({ offset: start + m.index, what: `${original.slice(start + m.index, start + m.index + m[0].length).replace(/\s+/g, '')}…)` });
  for (const m of masked.slice(start, limit).matchAll(SCOPE_CALL)) reads.push({ offset: start + m.index, what: 'createRequestScope()' });
  for (const m of masked.slice(start, limit).matchAll(/(?<![\w$])await(?![\w$])\s*/g)) {
    const at = start + m.index;
    const rest = masked.slice(at + m[0].length, limit + 200);
    if (SAFE_AWAIT.test(rest)) continue;
    // the gate itself (`await requireAccess(`, `await perform(`) is not a read; a gate inside Promise.all is reported above
    if (new RegExp(`^\\(?\\s*(${gates.join('|')})\\s*\\(`).test(rest)) continue;
    const shown = original.slice(at, at + m[0].length + 40).split('\n')[0].trim();
    reads.push({ offset: at, what: `\`${shown}\`` });
  }
  reads.sort((a, b) => a.offset - b.offset);
  // one report per line (`await scope.cradle.xService.y(` is one read, not two)
  const seen = new Set();
  const unique = reads.filter((r) => { const l = lineOf(original, r.offset); if (seen.has(l)) return false; seen.add(l); return true; });
  return { gate, reads: unique, notes };
}

function validateAllowlist(allowlist, rootDir, problems, allowlistName) {
  const entries = new Map();
  for (const [i, e] of (Array.isArray(allowlist.entries) ? allowlist.entries : []).entries()) {
    const where = `${allowlistName}: entries[${i}]`;
    if (!e || typeof e.file !== 'string' || e.file === '') { problems.push({ file: allowlistName, line: 1, message: `${where} has no \`file\`` }); continue; }
    if (typeof e.reason !== 'string' || e.reason.trim().length < MIN_REASON) problems.push({ file: allowlistName, line: 1, message: `${where} (${e.file}) needs a written \`reason\` (at least ${MIN_REASON} characters): no silent skips` });
    if (!Array.isArray(e.functions) || e.functions.length === 0 || e.functions.some((f) => typeof f !== 'string')) problems.push({ file: allowlistName, line: 1, message: `${where} (${e.file}) needs \`functions\`: the exported functions it covers ("default" for the default export)` });
    if (entries.has(e.file)) problems.push({ file: allowlistName, line: 1, message: `${where}: ${e.file} is listed twice` });
    if (!existsSync(join(rootDir, e.file))) problems.push({ file: allowlistName, line: 1, message: `${where}: ${e.file} does not exist; remove the entry` });
    entries.set(e.file, { ...e, functions: Array.isArray(e.functions) ? e.functions : [] });
  }
  return entries;
}

/**
 * Checks every server file under `<root>/<adminDir>`. Returns `{ problems, checked }`; a problem is `{ file, line, message }`
 * with `file` relative to `root`. `checked` lists `{ file, fn, gate }` for every function that has to gate.
 */
export function checkPages({ root, adminDir = ADMIN_DIR, allowlist = { entries: [] }, allowlistName = DEFAULT_ALLOWLIST }) {
  const problems = [];
  const checked = [];
  const entries = validateAllowlist(allowlist, root, problems, allowlistName);
  const files = [...serverFiles(join(root, adminDir))];
  if (!files.some((f) => RENDER_FILES.test(basename(f)))) problems.push({ file: adminDir, line: 1, message: `no page or layout found under ${adminDir} (wrong --root?)` });
  const used = new Map(); // file -> Set of allowlisted functions that were needed

  for (const abs of files) {
    const file = relative(root, abs).split(sep).join('/');
    const original = readFileSync(abs, 'utf8');
    const noComments = mask(original, false);
    const kind = directive(noComments);
    if (kind === 'client') continue;
    const masked = mask(original, true);
    const isRender = RENDER_FILES.test(basename(abs));
    const isAction = kind === 'server';
    const gates = isAction ? ACTION_GATES : PAGE_GATES;
    const entry = entries.get(file);
    const exempt = (name) => entry?.functions.includes(name);
    const problem = (offset, message) => problems.push({ file, line: lineOf(original, offset), message });
    const { fns, unsupported } = exportedFunctions(masked);
    for (const u of unsupported) if (u.always || (isRender && u.name === 'default') || isAction) problem(u.offset, u.what);

    for (const fn of fns) {
      const { gate, reads, notes } = analyse(masked, original, fn, gates);
      for (const n of notes) problem(n.offset, `${fn.name === 'default' ? 'the default export' : fn.name}: ${n.message}`);
      const mustGate = isAction || (isRender && fn.name === 'default') || reads.length > 0 || gate >= 0;
      if (!mustGate) continue;
      const label = fn.name === 'default' ? 'the default export' : `${fn.name}()`;
      const failures = [];
      if (gate < 0) failures.push({ offset: fn.offset, message: `${label} does not call ${gates.join('(), ')}() at the top level of its body, awaited${isAction ? ' or returned' : ''}: every ${isAction ? 'server action' : 'page and layout'} checks access itself (the layout's check runs in parallel with the page)` });
      for (const r of reads) failures.push({ offset: r.offset, message: `${label} reads data before the access check: ${r.what} runs before ${gates[0]}()${gate < 0 ? ' (there is none)' : ''}; call ${gates[0]}() first` });
      checked.push({ file, fn: fn.name, gate: gate >= 0 });
      if (failures.length === 0) continue;
      if (exempt(fn.name)) { if (!used.has(file)) used.set(file, new Set()); used.get(file).add(fn.name); continue; }
      for (const f of failures) problem(f.offset, f.message);
    }
    if (!entry) continue;
    for (const name of entry.functions) {
      if (!fns.some((f) => f.name === name)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file} lists ${name}, which the file does not export; remove it` });
      else if (!used.get(file)?.has(name)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file} lists ${name}, which passes the check without it; remove the stale entry` });
    }
  }
  for (const file of entries.keys()) {
    if (existsSync(join(root, file)) && !files.some((f) => relative(root, f).split(sep).join('/') === file)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file}: the file is not a server file under ${adminDir}; remove it` });
  }
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { problems, checked };
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
  const { problems, checked } = checkPages({ root, allowlist, allowlistName: relative(root, allowlistPath).split(sep).join('/') || DEFAULT_ALLOWLIST });
  if (problems.length > 0) {
    for (const p of problems) out.error(formatProblem(p));
    out.error(`\ncheck:pages FAILED: ${problems.length} problem(s). Contract: scripts/check-pages.mjs (header comment).`);
    return 1;
  }
  out.log(`check:pages OK: ${checked.filter((c) => c.gate).length} functions check access before data in ${new Set(checked.map((c) => c.file)).size} files, ${checked.filter((c) => !c.gate).length} allowlisted.`);
  return 0;
}

function startedDirectly() {
  try {
    return !process.argv[1] || import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return true;
  }
}

if (startedDirectly()) process.exit(main());
