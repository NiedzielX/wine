#!/usr/bin/env node
/**
 * PreToolUse hook for Edit, Write and MultiEdit: AGENTS.md §3, "`status: approved` is set only by a human".
 *
 * Rule: an agent edit of a file under `.ai/specs/` (not `implemented/`, not `archive/`) is refused when the RESULT of the edit has
 * `status: approved` and the file on disk does not (a new file, draft -> approved, in-progress -> approved). Everything else passes:
 * approved -> in-progress, a body edit of an approved spec, any other status, any path outside `.ai/specs/` or in the two lifecycle
 * directories. For a file under `.ai/specs/` the hook fails closed: a header it cannot read, an edit it cannot apply or a file it cannot
 * open is refused. For other paths it never reads the disk, so it cannot fail for them.
 *
 * Claude Code passes the tool call as JSON on stdin; exit code 2 blocks and sends stderr to the model, 0 lets it through. Any other
 * non-zero code only lets the call run, so every failure path ends in 2.
 *
 * It is a guardrail, not a boundary: it sees Edit, Write and MultiEdit, not Bash (`sed -i`, `echo >`, `git checkout`), so a model
 * can still change a spec through the shell (security-notes.md §4).
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOCKED = (reason) => `Zablokowane przez politykę zespołu: ${reason}. Nie próbuj obejść tej blokady innymi komendami.`;
const TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const LIFECYCLE_DIRS = new Set(['implemented', 'archive']);
const APPROVED = 'approved';

/** Is this (absolute) path a file the rule covers: under `.ai/specs/`, outside `implemented/` and `archive/`? Letter case of `.ai/specs` is ignored (macOS). */
function isGuarded(absPath) {
  const parts = absPath.replace(/\\/g, '/').split('/').filter(Boolean);
  for (let i = 0; i + 2 < parts.length; i++) {
    if (parts[i].toLowerCase() !== '.ai' || parts[i + 1].toLowerCase() !== 'specs') continue;
    const rest = parts.slice(i + 2);
    if (!(LIFECYCLE_DIRS.has(rest[0]) && rest.length > 1)) return true;
  }
  return false;
}

/** The real path of a file that may not exist yet: the real path of its nearest existing ancestor plus the rest. */
function realPath(path) {
  const tail = [];
  let cur = path;
  for (;;) {
    if (existsSync(cur)) return join(realpathSync(cur), ...tail.reverse());
    const parent = dirname(cur);
    if (parent === cur) return path;
    tail.push(basename(cur));
    cur = parent;
  }
}

const defaultDeps = {
  real: realPath,
  read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
};

const normalize = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const UNPARSEABLE_START = /^[|>&*![{?%@`]/;

/**
 * The `status` of a Markdown file's frontmatter, lower-cased: null when there is no frontmatter or no status. Throws when the header
 * cannot be trusted (no closing line, two status keys, a value written in a YAML form that is not a plain or quoted scalar).
 */
export function specStatus(text) {
  const lines = normalize(text).split('\n');
  if (lines[0].trimEnd() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end === -1) throw new Error('nagłówek nie ma zamykającej linii ---');
  const header = lines.slice(1, end);
  const found = [];
  header.forEach((line, i) => {
    const m = /^["']?status["']?\s*:(.*)$/.exec(line);
    if (m) found.push({ raw: m[1], next: header[i + 1] });
  });
  if (found.length === 0) return null;
  if (found.length > 1) throw new Error('nagłówek ma dwa pola status');
  let value = found[0].raw.replace(/\s+#.*$/, '').trim();
  if (value === '') {
    if (found[0].next !== undefined && /^\s+\S/.test(found[0].next)) throw new Error('wartość status w osobnej linii');
    return null;
  }
  if (UNPARSEABLE_START.test(value)) throw new Error('wartość status w formie, której hook nie rozumie');
  const quoted = /^(["'])(.*)\1$/.exec(value);
  if (quoted) value = quoted[2].trim();
  return value.toLowerCase();
}

function applyEdit(content, edit) {
  if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') throw new Error('edycja bez old_string i new_string');
  const { old_string: from, new_string: to } = edit;
  if (from === '') return content === null || content === '' ? { text: to, matched: true } : { text: content, matched: false };
  if (content === null) return { text: '', matched: false };
  const at = content.indexOf(from);
  if (at === -1) return { text: content, matched: false };
  const text = edit.replace_all === true ? content.split(from).join(to) : content.slice(0, at) + to + content.slice(at + from.length);
  return { text, matched: true };
}

/** The text a tool call would leave in the file, and the new text of every edit that did not match (the tool will reject those itself). */
function outcome(name, input, current) {
  if (name === 'Write') {
    if (typeof input.content !== 'string') throw new Error('Write bez content');
    return { text: input.content, unmatched: [] };
  }
  const edits = name === 'MultiEdit' ? input.edits : [input];
  if (!Array.isArray(edits) || edits.length === 0) throw new Error('MultiEdit bez edits');
  let text = current;
  const unmatched = [];
  for (const edit of edits) {
    const r = applyEdit(text, edit);
    if (!r.matched) unmatched.push(edit.new_string);
    text = r.text;
  }
  return { text: text ?? '', unmatched };
}

const NEW_APPROVED = /^\s*["']?status["']?\s*:\s*["']?approved/im;

/**
 * The reason a tool call is blocked, or null. `payload` is what Claude Code sends (`tool_name`, `tool_input`, `cwd`). Throws when a call
 * under `.ai/specs/` cannot be judged (missing or wrong-typed input, unreadable file): the caller treats a throw as a block.
 */
export function decide(payload, deps = defaultDeps) {
  const name = payload?.tool_name;
  if (!TOOLS.has(name)) return null;
  const input = payload.tool_input;
  const file = input?.file_path;
  if (typeof file !== 'string' || file === '') throw new Error('brak tool_input.file_path');
  const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd();
  const abs = resolve(cwd, file);
  if (!isGuarded(abs) && !isGuarded(deps.real(abs))) return null;

  const current = deps.read(abs);
  const { text, unmatched } = outcome(name, input, current === null ? null : normalize(current));
  let currentApproved = false;
  if (current !== null) {
    try { currentApproved = specStatus(current) === APPROVED; } catch { currentApproved = false; }
  }

  let status;
  try {
    status = specStatus(text);
  } catch (e) {
    return `nie mogę odczytać nagłówka specyfikacji ${file} (${e instanceof Error ? e.message : 'błąd'}), więc nie sprawdzę statusu; popraw nagłówek (--- status: draft ---)`;
  }
  const approves = status === APPROVED || unmatched.some((t) => NEW_APPROVED.test(t));
  if (approves && !currentApproved) {
    return `status: approved w ${file} ustawia tylko człowiek (AGENTS.md §3). Zapisz specyfikację jako draft i poproś właściciela o akceptację; po niej wolno zmienić approved na in-progress`;
  }
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
    if (payload === null || typeof payload !== 'object') throw new Error('wejście nie jest obiektem');
  } catch (e) {
    process.stderr.write(`Hook nie przeczytał wejścia (${e instanceof Error ? e.message : 'błąd'}); odmowa. Nie próbuj obejść tej blokady innymi komendami.\n`);
    return 2;
  }
  try {
    const reason = decide(payload);
    if (reason) { process.stderr.write(`${BLOCKED(reason)}\n`); return 2; }
    return 0;
  } catch (e) {
    process.stderr.write(`Hook zawiódł (${e instanceof Error ? e.message : 'błąd'}); odmowa. Nie próbuj obejść tej blokady innymi komendami.\n`);
    return 2;
  }
}

// Is this file the entry point and not imported? Same reasoning as pre-tool-use.mjs: import.meta.url is a percent-encoded URL of the REAL
// path, so compare with the URL of the real argv[1]; any doubt (no argv[1], an unresolvable path) means yes, because a guard that
// silently does nothing is the dangerous mistake.
function isEntryPoint() {
  try {
    const entry = process.argv[1];
    if (!entry) return true;
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return true;
  }
}

if (isEntryPoint()) process.exit(main());
