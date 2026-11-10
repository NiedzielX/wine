#!/usr/bin/env node
/**
 * Every page, layout and server action of the dashboard checks access BEFORE it reads data (threat model T-29, lesson
 * 2026-11-08-page-reads-data-in-parallel-with-layout-check). Next.js renders a layout and its page in parallel, so the
 * `[slug]` layout's `requireAccess` does not protect the page: a page that reads first streams the restaurant's data into the
 * 403 or the sign-in redirect. A review missed it once; this is the deterministic check. It reads every server file under
 * `packages/app/src/app/(admin)/admin` as text (its own masking of comments, strings and regular expressions; no TypeScript
 * API) and fails with `file:line: message`. It fails CLOSED: what it cannot read is a problem, never a pass.
 *
 * Contract, per file (client files, `'use client'`, are skipped):
 *  1. `page`, `layout`, `template` and `default` files ("render files") have a default export written as
 *     `export default [async] function …`, and it calls the gate `requireAccess(`; a render file without such a default export
 *     fails;
 *  2. `'use server'` files ("action files"): every exported function calls `act(`, `perform(` or `authorizeAction(`; an inline
 *     server action (a function whose body starts with `'use server'`) in any server file is checked the same way;
 *  3. the gate is an UNCONDITIONAL top-level statement of the function body: `await gate(…);`, `const x = await gate(…);`,
 *     `const x = (await gate(…)).can(…);` or `return gate(…);` — not inside a block, a callback, a branch (`if (c) await gate()`,
 *     `else`, a loop), a ternary or `&&`/`||`. The gate name is imported by that name from its module (`requireAccess` and
 *     `authorizeAction` from `@/server/auth`, `act` and `perform` from `@/server/action-runner`) and not declared, assigned or
 *     shadowed anywhere else in the file;
 *  4. in every function the rules above apply to, and in every other exported function of a server file under the tree that
 *     reads: nothing reads data before the gate. A read is a call of a method on a `…Service` (`adminService.menu(`,
 *     `c.teamService.list(`), `createRequestScope(`, or an `await` of anything but `params`, `searchParams`, `getI18n()`,
 *     `getRequestScope()`, `headers()` or `cookies()`;
 *  5. the gate is never started together with reads: a gate inside the arguments of `Promise.all`, `allSettled`, `race` or
 *     `any` fails (a rejected gate rejects the batch, but the reads already ran);
 *  6. export forms this check cannot follow fail closed in render and action files: `export default` of anything but a function
 *     declaration (`export default async () => …`, `export default Page`), `export { … }` (also `{ x as default }`),
 *     `export … from` and `export * from`, and `export const x = async …` / arrow / function expression. `export type`, and an
 *     `export const` of a plain value (`export const dynamic = 'force-dynamic'`), are fine. A function body the scanner cannot
 *     delimit, and a directory it cannot read, fail too.
 * The allowlist `scripts/check-pages.allowlist.json` lists `file`, the exact `functions` (`default` for the default export) and a
 * written `reason`. A listed function is exempt from rules 1 to 4 ENTIRELY (it needs no gate and may read before one): it is for
 * doors that are public by design and read no restaurant chosen by the caller. Rules 5 and 6 have no allowlist. A stale entry
 * (file gone, function gone, function passes without it) fails, so the list cannot rot.
 *
 * Known limits (a text scan): a read hidden in a helper that does not name a `…Service` (e.g. `load(slug)` that reads inside)
 * is not seen unless it is awaited before the gate; a service held in a variable not named `…Service` is not seen; a gate
 * function that itself returns early without checking is trusted (it is `server/auth.ts`'s); JSX text containing `//` is read as
 * a comment (it can only make the scan fail closed). API routes are `check:routes`'s (handle() with a permission checks before
 * the handler runs).
 *
 * Usage: node scripts/check-pages.mjs [--root <dir>] [--allowlist <file>]
 */
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Characters after which a `/` starts a regular-expression literal (not `)`, `]`, `}`, `<` or `>`: division and JSX). */
const REGEX_AFTER = '(,=:[!&|?{;+-*%~^';

/**
 * Same-length copy of `src` with comments blanked and, when `strings` is true, the content of string, template and
 * regular-expression literals blanked too (quotes, newlines and `${…}` code stay), so offsets and line numbers match the
 * original. A `/` is a regular expression only after an operator or `return`/`typeof`/`case` (so `</Tag>` in JSX is not one).
 */
export function mask(src, strings) {
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let prev = '';
  let prevWord = '';
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
        i = j + 1; prev = ch; prevWord = ''; continue;
      }
      if (ch === '`') { i = template(i + 1); prev = '`'; prevWord = ''; continue; }
      if (ch === '/' && (prev === '' || REGEX_AFTER.includes(prev) || ['return', 'typeof', 'case'].includes(prevWord))) {
        let j = i + 1; let inClass = false;
        while (j < n && src[j] !== '\n' && (inClass || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false; j++; }
        if (strings) blank(i + 1, j);
        i = j + 1; prev = '/'; prevWord = ''; continue;
      }
      if (ch === '{') depth++;
      if (ch === '}') { if (inExpr && depth === 0) return i + 1; depth--; }
      if (/[\w$]/.test(ch)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; prevWord = src.slice(i, j); prev = src[j - 1]; i = j; continue; }
      if (!/\s/.test(ch)) { prev = ch; prevWord = ''; }
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
const GATE_MODULE = { requireAccess: '@/server/auth', authorizeAction: '@/server/auth', act: '@/server/action-runner', perform: '@/server/action-runner' };
/** What may stand between the start of a statement and the gate call (rule 3). */
const GATE_STATEMENT = /^(?:(?:const|let|var)\s+[\w$\s{},:[\]]+?=\s*)?(?:\(\s*)?(?:await\s*\(?\s*|return\s+(?:await\s+)?)$/;

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
  if (text[k] !== ':') return text[k] === '{' ? k : -1;
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

function serverFiles(dir, problems, root) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d).sort(); } catch (e) {
      problems.push({ file: relative(root, d).split(sep).join('/') || d, line: 1, message: `cannot read this directory (${e instanceof Error ? e.message : e}); the check fails closed` });
      return;
    }
    for (const e of entries) {
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch (err) { problems.push({ file: relative(root, p).split(sep).join('/'), line: 1, message: `cannot read this entry (${err instanceof Error ? err.message : err}); the check fails closed` }); continue; }
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx|ts|jsx|js|mts|mjs)$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
    }
  };
  if (!existsSync(dir)) return out;
  walk(dir);
  return out;
}

/** The leading directive of a file (`'use client'` / `'use server'`), read from the text with comments blanked. */
function directive(noComments) {
  const m = /^\s*(['"])use (client|server)\1/.exec(noComments);
  return m ? m[2] : null;
}

/** A function declared at `m.index` whose parameter list opens at `open`: its body range, or null. */
function bodyOf(masked, open) {
  const after = skipBalanced(masked, open);
  const brace = after < 0 ? -1 : bodyBrace(masked, after);
  const end = brace < 0 ? -1 : skipBalanced(masked, brace);
  return end < 0 ? null : [brace + 1, end - 1];
}

/** Exported functions `{ name, offset, body }` (`default` for the default export) and the export forms this check cannot follow. */
function exportedFunctions(masked) {
  const fns = [];
  const unsupported = [];
  const declared = new Set();
  for (const m of masked.matchAll(/\bexport\s+(default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const name = m[1] ? 'default' : m[2];
    if (!name) continue;
    declared.add(m.index);
    const body = bodyOf(masked, m.index + m[0].length - 1);
    if (!body) unsupported.push({ offset: m.index, always: true, what: `cannot find the body of ${name === 'default' ? 'the default export' : name}; this check fails closed` });
    else fns.push({ name, offset: m.index, body });
  }
  for (const m of masked.matchAll(/\bexport\s+default\b/g)) {
    if (/^export\s+default\s+(?:async\s+)?function\b/.test(masked.slice(m.index))) continue;
    unsupported.push({ offset: m.index, what: 'the default export is not a function declaration (`export default async () => …`, `export default Page`); this check cannot see its access check: write `export default async function Page(...)`' });
  }
  for (const m of masked.matchAll(/\bexport\s+(?!type\b)(\{[^}]*\}|\*)(\s*from\b)?/g)) {
    unsupported.push({ offset: m.index, what: `\`export ${m[1].startsWith('{') ? '{ … }' : '*'}${m[2] ? ' from …' : ''}\` is not understood by this check (a function exported this way is not checked); export the function where it is declared: \`export async function name(...)\`` });
  }
  for (const m of masked.matchAll(/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\b|\(|function\b|[A-Za-z_$][\w$]*\s*=>)/g)) {
    unsupported.push({ offset: m.index, what: `\`export const ${m[1]} = …\` is not understood by this check; write \`export async function ${m[1]}\`` });
  }
  return { fns, unsupported };
}

/** Inline server actions: functions whose body starts with the `'use server'` directive. */
function inlineActions(noComments, masked) {
  const out = [];
  for (const m of noComments.matchAll(/(['"])use server\1/g)) {
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(noComments[k])) k--;
    if (k < 0) continue; // the file's own directive
    if (noComments[k] !== '{') { out.push({ offset: m.index, name: 'inline action', body: null }); continue; }
    const end = skipBalanced(masked, k);
    const name = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)[^;{]*$/.exec(masked.slice(Math.max(0, k - 300), k));
    out.push({ offset: m.index, name: name ? (name[1] ?? name[2]) : 'inline action', body: end < 0 ? null : [k + 1, end - 1] });
  }
  return out;
}

/** Brace depth of `at` relative to the body start (parentheses do not count: `(await requireAccess(s)).can(...)` is top level). */
function braceDepth(masked, from, at) {
  let depth = 0;
  for (let k = from; k < at; k++) { if (masked[k] === '{') depth++; else if (masked[k] === '}') depth--; }
  return depth;
}

function parallelRanges(masked, [start, end]) {
  const out = [];
  for (const m of masked.slice(start, end).matchAll(PARALLEL)) {
    const open = start + m.index + m[0].length - 1;
    const close = skipBalanced(masked, open);
    out.push({ at: start + m.index, kind: m[1], range: [open, close < 0 ? end : close] });
  }
  return out;
}

/** The text of the statement that contains `at`, from the previous `;`, `{` or `}` (or the body start) up to `at`. */
function statementBefore(masked, start, at) {
  let k = at - 1;
  while (k >= start && !';{}'.includes(masked[k])) k--;
  return masked.slice(k + 1, at).replace(/^\s+/, "");
}

function analyse(masked, original, body, gates) {
  const [start, end] = body;
  const text = masked.slice(start, end);
  const notes = [];
  const parallel = parallelRanges(masked, body);
  let gate = -1;
  const gateRe = new RegExp(`(?<![\\w$.])(${gates.join('|')})\\s*\\(`, 'g');
  for (const m of text.matchAll(gateRe)) {
    const at = start + m.index;
    const inParallel = parallel.find((p) => at > p.range[0] && at < p.range[1]);
    if (inParallel) { notes.push({ offset: at, message: `${m[1]}() is started inside Promise.${inParallel.kind}(...) together with other work: the reads run before the check rejects; await ${m[1]}() on its own line first` }); continue; }
    if (gate >= 0 || braceDepth(masked, start, at) !== 0) continue;
    if (!GATE_STATEMENT.test(statementBefore(masked, start, at))) continue;
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
    if (new RegExp(`^\\(?\\s*(${gates.join('|')})\\s*\\(`).test(rest)) continue;
    const shown = original.slice(at, at + m[0].length + 40).split('\n')[0].trim();
    reads.push({ offset: at, what: `\`${shown}\`` });
  }
  reads.sort((a, b) => a.offset - b.offset);
  const seen = new Set();
  const unique = reads.filter((r) => { const l = lineOf(original, r.offset); if (seen.has(l)) return false; seen.add(l); return true; });
  return { gate, reads: unique, notes };
}

/** Problems with the gate names of a file: not imported by that name from their module, or declared/assigned/shadowed in it. */
function gateNameProblems(masked, noComments, gates) {
  const problems = [];
  for (const g of gates) {
    const uses = [...masked.matchAll(new RegExp(`(?<![\\w$.])${g}(?![\\w$])`, 'g'))];
    if (uses.length === 0) continue;
    const mod = GATE_MODULE[g];
    const imp = [...noComments.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g)].find((m) => m[1].split(',').map((s) => s.trim()).includes(g) && m[3] === mod);
    if (!imp) { problems.push({ offset: uses[0].index, message: `${g} is not imported by that name from '${mod}'; this check only trusts the real gate` }); continue; }
    for (const u of uses) {
      if (u.index >= imp.index && u.index < imp.index + imp[0].length) continue;
      if (/^\s*\(/.test(masked.slice(u.index + g.length))) continue; // a call
      problems.push({ offset: u.index, message: `${g} is declared, assigned, passed or shadowed here; the gate name must only be called (this check cannot tell a local ${g} from the real one)` });
    }
  }
  return problems;
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
  const files = serverFiles(join(root, adminDir), problems, root);
  if (!files.some((f) => RENDER_FILES.test(basename(f)))) problems.push({ file: adminDir, line: 1, message: `no page or layout found under ${adminDir} (wrong --root?)` });
  const used = new Map();
  const relFiles = new Set();

  for (const abs of files) {
    const file = relative(root, abs).split(sep).join('/');
    relFiles.add(file);
    let original;
    try { original = readFileSync(abs, 'utf8'); } catch (e) { problems.push({ file, line: 1, message: `cannot read this file (${e instanceof Error ? e.message : e}); the check fails closed` }); continue; }
    const noComments = mask(original, false);
    const kind = directive(noComments);
    if (kind === 'client') continue;
    const masked = mask(original, true);
    const isRender = RENDER_FILES.test(basename(abs));
    const isAction = kind === 'server';
    const entry = entries.get(file);
    const exempt = (name) => entry?.functions.includes(name);
    const problem = (offset, message) => problems.push({ file, line: lineOf(original, offset), message });
    const { fns, unsupported } = exportedFunctions(masked);
    for (const u of unsupported) if (u.always || isRender || isAction) problem(u.offset, u.what);
    if (isRender && !fns.some((f) => f.name === 'default') && !unsupported.some((u) => u.always)) problem(0, 'a page/layout/template/default file without `export default [async] function …`: this check cannot see its access check');

    const targets = fns.map((fn) => ({ ...fn, gates: isAction ? ACTION_GATES : PAGE_GATES, mandatory: isAction || (isRender && fn.name === 'default') }));
    for (const ia of inlineActions(noComments, masked)) {
      if (isAction && ia.body === null) continue;
      if (!ia.body) { problem(ia.offset, `a 'use server' directive that is not the first statement of a function body; this check cannot follow it`); continue; }
      targets.push({ name: ia.name, offset: ia.offset, body: ia.body, gates: ACTION_GATES, mandatory: true, inline: true });
    }
    const gatesHere = new Set();
    for (const t of targets) {
      const { gate, reads, notes } = analyse(masked, original, t.body, t.gates);
      const label = t.inline ? `the inline server action ${t.name}()` : t.name === 'default' ? 'the default export' : `${t.name}()`;
      for (const n of notes) problem(n.offset, `${label}: ${n.message}`);
      const mustGate = t.mandatory || reads.length > 0 || gate >= 0;
      if (!mustGate) continue;
      for (const g of t.gates) gatesHere.add(g);
      const failures = [];
      if (gate < 0) failures.push({ offset: t.offset, message: `${label} does not call ${t.gates.join('(), ')}() as an unconditional top-level statement of its body (\`await ${t.gates[0]}(…);\`, \`const x = await ${t.gates[0]}(…);\`${t.gates === ACTION_GATES ? `, \`return ${t.gates[0]}(…);\`` : ''}): not in a branch, a ternary, \`&&\`, a block or a callback` });
      for (const r of reads) failures.push({ offset: r.offset, message: `${label} reads data before the access check: ${r.what} runs before ${t.gates[0]}()${gate < 0 ? ' (there is none)' : ''}; call ${t.gates[0]}() first` });
      checked.push({ file, fn: t.name, gate: gate >= 0 });
      if (failures.length === 0) continue;
      if (!t.inline && exempt(t.name)) { if (!used.has(file)) used.set(file, new Set()); used.get(file).add(t.name); continue; }
      for (const f of failures) problem(f.offset, f.message);
    }
    for (const p of gateNameProblems(masked, noComments, [...gatesHere])) problem(p.offset, p.message);
    if (!entry) continue;
    for (const name of entry.functions) {
      if (!fns.some((f) => f.name === name)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file} lists ${name}, which the file does not export; remove it` });
      else if (!used.get(file)?.has(name)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file} lists ${name}, which passes the check without it; remove the stale entry` });
    }
  }
  for (const file of entries.keys()) {
    if (existsSync(join(root, file)) && !relFiles.has(file)) problems.push({ file: allowlistName, line: 1, message: `entry for ${file}: the file is not a server file under ${adminDir}; remove it` });
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
