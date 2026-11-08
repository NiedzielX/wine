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
 * Header forms that are judged: a plain `status: value` at column 0 (plain or quoted scalar). Refused as unverifiable (exit 2): an
 * indented `status`, any line that starts with `{` or `[`, a `status` key inside a flow map, YAML anchors and aliases (`&x`, `*x`), a value
 * on the next line, block scalars, tags, two `status` keys, a header without its closing `---`, a line that starts with `?` or `:`, a
 * double-quoted key with a backslash, a quoted `status` value that is not closed on its line or (in double quotes) has a backslash.
 * Only `---` closes a header; `...` is not accepted (a header closed that way is read as unclosed and refused). Known gaps: an Edit whose old_string only
 * matches through the editing tool's own quote normalisation is judged by its new_string alone (unverified); symlink loops are not
 * followed past 8 links (the path is then judged as written).
 *
 * Claude Code passes the tool call as JSON on stdin; exit code 2 blocks and sends stderr to the model, 0 lets it through. Any other
 * non-zero code only lets the call run, so every failure path ends in 2.
 *
 * It is a guardrail, not a boundary: it sees Edit, Write and MultiEdit, not Bash (`sed -i`, `echo >`, `git checkout`), so a model
 * can still change a spec through the shell (security-notes.md §4).
 */
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
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

/**
 * The real path of a file that may not exist yet: the real path of its nearest existing ancestor plus the rest. A dangling symlink
 * (`x.md -> ../.ai/specs/ghost.md`, target not created yet) is followed through `readlink`, because a Write through it creates the target.
 */
function realPath(path, depth = 0) {
  const tail = [];
  let cur = path;
  for (;;) {
    if (existsSync(cur)) return join(realpathSync(cur), ...tail.reverse());
    let link = null;
    try { link = lstatSync(cur).isSymbolicLink() ? readlinkSync(cur) : null; } catch { link = null; }
    if (link !== null) {
      if (depth > 8) throw new Error('za dużo dowiązań symbolicznych');
      return realPath(join(resolve(dirname(cur), link), ...tail.reverse()), depth + 1);
    }
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

const unix = (text) => text.replace(/\r\n?/g, '\n');
const normalize = (text) => unix(text.replace(/^﻿/, ''));
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
    // forms a YAML parser reads but this line scan does not follow: refuse instead of guessing
    if (/^[ \t]*[{[]/.test(line)) throw new Error('nagłówek zawiera mapę lub listę zapisaną w nawiasach (flow)');
    if (/(^|[\s:,[{])[&*][A-Za-z0-9_-]+/.test(line)) throw new Error('nagłówek zawiera kotwicę lub alias YAML (&, *)');
    if (/[{[].*["']?status["']?[ \t]*:/.test(line)) throw new Error('pole status wewnątrz mapy w nawiasach');
    if (/^[ \t]*[?:]/.test(line)) throw new Error('linia zaczyna się od ? lub : (klucz złożony)');
    if (/^[ \t]*"[^"]*\\/.test(line)) throw new Error('klucz w cudzysłowie z ukośnikiem (ucieczka znaku)');
    const m = /^([ \t]*)["']?status["']?[ \t]*:(.*)$/.exec(line);
    if (!m) return;
    if (m[1] !== '') throw new Error('pole status z wcięciem (zagnieżdżone lub przesunięte)');
    found.push({ raw: m[2], next: header[i + 1] });
  });
  if (found.length === 0) return null;
  if (found.length > 1) throw new Error('nagłówek ma dwa pola status');
  const raw = found[0].raw.trim();
  if (raw === '' || raw.startsWith('#')) {
    if (found[0].next !== undefined && /^\s+\S/.test(found[0].next)) throw new Error('wartość status w osobnej linii');
    return null;
  }
  if (raw[0] === '"' || raw[0] === "'") {
    // a quoted scalar must close on the same line and, in double quotes, carry no escape (`"\x61pproved"`, a folded `"appr\<newline>oved"`)
    const closed = (raw[0] === '"' ? /^"([^"\\]*)"[ \t]*(?:#.*)?$/ : /^'([^']*)'[ \t]*(?:#.*)?$/).exec(raw);
    if (!closed) throw new Error('wartość status w cudzysłowie niezamknięta w tej samej linii lub z ucieczką znaku');
    return closed[1].trim().toLowerCase();
  }
  const value = raw.replace(/[ \t]+#.*$/, '').trim();
  if (UNPARSEABLE_START.test(value)) throw new Error('wartość status w formie, której hook nie rozumie');
  return value.toLowerCase();
}

function applyEdit(content, edit) {
  if (!edit || typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string') throw new Error('edycja bez old_string i new_string');
  // the file text is normalised to \n, so the edit must be too, or a CRLF old_string never matches and a legitimate edit is judged as unmatched
  const replace = (text, from, to) => {
    const at = text.indexOf(from);
    if (at === -1) return null;
    return edit.replace_all === true ? text.split(from).join(to) : text.slice(0, at) + to + text.slice(at + from.length);
  };
  if (edit.old_string === '') return content === null || content === '' ? { text: edit.new_string, matched: true } : { text: content, matched: false };
  if (content === null) return { text: '', matched: false };
  // First the bytes the tool was given against the bytes on disk: that is what the tool does, and normalising only one side lets a lone \r
  // at the edge of old_string swallow a line break (`status: draft\r` -> `status: approved` leaves `approved`). Only the RESULT is normalised
  // later, for the header scan. Second, with both sides normalised, for an edit the tool may still match through its own normalisation.
  const exact = replace(content, edit.old_string, edit.new_string);
  if (exact !== null) return { text: exact, matched: true };
  const loose = replace(unix(content), unix(edit.old_string), unix(edit.new_string));
  if (loose !== null) return { text: loose, matched: true };
  return { text: content, matched: false };
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
    if (!r.matched) unmatched.push(unix(edit.new_string));
    text = r.text;
  }
  return { text: text ?? '', unmatched };
}

// `[ \t]*`, not `\s*`: with `\s*` many blank lines make the match quadratic and the hook slow enough to time out (a timeout does not block)
const NEW_APPROVED = /^[ \t]*["']?status["']?[ \t]*:[ \t]*["']?approved/im;

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
  let real = abs;
  try { real = deps.real(abs); } catch { real = abs; } // a symlink loop must not make a harmless path fail; the path as written is still judged
  if (!isGuarded(abs) && !isGuarded(real)) return null;

  const current = deps.read(abs);
  const { text, unmatched } = outcome(name, input, current); // raw text: specStatus() normalises the result
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
