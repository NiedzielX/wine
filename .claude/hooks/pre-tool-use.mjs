#!/usr/bin/env node
/**
 * PreToolUse hook for the Bash tool (spec 2026-10-25-agent-security-hardening, R3).
 *
 * Claude Code passes the tool call as JSON on stdin. Exit code 2 blocks the call and sends stderr to the model; exit 0
 * lets it through. Any other non-zero code is only a hook error that lets the call run, so every failure path below
 * ends in 2 (fail closed).
 *
 * The hook reads the text of a command, not the intent behind it: a model can still reach a secret through `python -c`,
 * `perl` or a script it wrote itself. It is one layer, next to `permissions.deny` and the sandbox (security-notes.md).
 */
import { readFileSync } from 'node:fs';

const BLOCKED = (reason) => `Zablokowane przez politykę zespołu: ${reason}. Nie próbuj obejść tej blokady innymi komendami.`;

const WRAPPERS = new Set(['sudo', 'doas', 'command', 'env', 'nohup', 'time', 'nice', 'exec', 'builtin', 'xargs']);
const WRAPPER_FLAGS_WITH_VALUE = new Set(['-u', '-g', '-n', '-I', '-P', '-L']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const INTERPRETERS = /^(sh|bash|zsh|dash|ksh|fish|python[\d.]*|node|perl|ruby|php)$/;
const FETCHERS = new Set(['curl', 'wget']);
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'awk', 'sed', 'cp', 'mv', 'base64', 'xxd', 'od', 'strings', 'source', '.', 'bat', 'nl', 'tac', 'cut', 'sort', 'diff']);
const PROGRAM_FIRST = new Set(['grep', 'egrep', 'fgrep', 'rg', 'awk', 'sed']); // first positional is a pattern or a program, not a path
const MESSAGE_FLAG = /^(-m|--message|--body|-b|--title|-t|--notes|-[a-zA-Z]*m)$/;
const SAFE_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'test-results', 'storybook-static']);
const HOME_DIR = String.raw`(?:~[A-Za-z0-9_-]*|\$\{?HOME\}?|/root|/home/[^/]+)`;
const SECRET_DIRS = new RegExp(String.raw`${HOME_DIR}/(?:\.ssh|\.aws|\.config/gh)(?:/|$)`);

const isAssignment = (t) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(t);
const baseName = (t) => t.slice(t.lastIndexOf('/') + 1);

/** `.env` or `.env.<suffix>`, except exactly `.env.example` and `.env.template` (which hold no secrets). */
function isSecretEnv(path) {
  const name = baseName(path);
  if (!/^\.env(\.[A-Za-z0-9_.-]+)?$/.test(name)) return false;
  return name !== '.env.example' && name !== '.env.template';
}

/** Splits a command line into pipelines of simple commands of tokens; quotes are removed, `$(`, backticks and `(` start a new command. */
function parse(input) {
  const pipelines = [];
  let pipeline = [];
  let tokens = [];
  let cur = '';
  let has = false;
  let quote = null;
  const word = () => { if (has) tokens.push(cur); cur = ''; has = false; };
  const command = () => { word(); if (tokens.length) pipeline.push(tokens); tokens = []; };
  const line = () => { command(); if (pipeline.length) pipelines.push(pipeline); pipeline = []; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote === "'") { if (c === "'") quote = null; else cur += c; continue; }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < input.length && '"\\$`'.includes(input[i + 1])) cur += input[++i];
      else cur += c;
      continue;
    }
    if (c === '\\') { if (i + 1 < input.length) { cur += input[++i]; has = true; } continue; }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (/\s/.test(c) && c !== '\n') { word(); continue; }
    if (c === '\n' || c === ';') { line(); continue; }
    if (c === '&') { if (input[i + 1] === '&') i++; line(); continue; }
    if (c === '|') { if (input[i + 1] === '|') { i++; line(); } else command(); continue; }
    if (c === '(' && cur.endsWith('$')) { cur = cur.slice(0, -1); has = cur.length > 0; line(); continue; }
    if (c === '`' || c === '(' || c === ')') { line(); continue; }
    if (c === '<' || c === '>') { word(); tokens.push(c); continue; }
    cur += c;
    has = true;
  }
  line();
  return pipelines;
}

/** Drops the wrappers in front of the real command: sudo, env, nohup, xargs, `VAR=x`, a path to the binary. */
function normalize(tokens) {
  const t = [...tokens];
  for (;;) {
    while (t.length && isAssignment(t[0])) t.shift();
    if (!t.length) return { cmd: '', args: [], bare: false };
    const name = baseName(t[0]);
    if (!WRAPPERS.has(name)) return { cmd: name, args: t.slice(1), bare: false };
    t.shift();
    while (t.length && t[0].startsWith('-')) { const flag = t.shift(); if (WRAPPER_FLAGS_WITH_VALUE.has(flag) && t.length) t.shift(); }
    if (name === 'env') while (t.length && isAssignment(t[0])) t.shift();
    if (!t.length) return { cmd: name, args: [], bare: true };
  }
}

/** A commit message, PR title or body is text, not a command. */
function withoutMessages(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (MESSAGE_FLAG.test(args[i])) { i++; continue; }
    if (/^--(message|body|title|notes)=/.test(args[i])) continue;
    out.push(args[i]);
  }
  return out;
}

function pathArguments(cmd, args) {
  const values = [];
  let skipProgram = PROGRAM_FIRST.has(cmd);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '<') { if (args[i + 1] !== undefined) values.push(args[i + 1]); i++; continue; }
    if (a.startsWith('-') && a.length > 1) {
      if (/^(-e|-f|--regexp|--file)$/.test(a)) { skipProgram = false; if (a === '-e' || a === '--regexp') i++; continue; }
      if (a.includes('=')) values.push(a.slice(a.lastIndexOf('=') + 1));
      continue;
    }
    if (skipProgram) { skipProgram = false; continue; }
    values.push(a);
  }
  return values;
}

function recursiveRemoval(args) {
  let recursive = false;
  const targets = [];
  let endOfFlags = false;
  for (const a of args) {
    if (!endOfFlags && a === '--') { endOfFlags = true; continue; }
    if (!endOfFlags && a.startsWith('--')) { if (a === '--recursive') recursive = true; continue; }
    if (!endOfFlags && a.startsWith('-') && a.length > 1) { if (/[rR]/.test(a)) recursive = true; continue; }
    targets.push(a);
  }
  if (!recursive) return false;
  const safe = (target) => {
    if (!target || target.startsWith('/') || target.startsWith('~') || /[*?[\]$`{}]/.test(target)) return false;
    const parts = target.replace(/^(\.\/)+/, '').split('/').filter(Boolean);
    if (parts.includes('..') || parts.includes('.')) return false;
    const at = parts.findIndex((p) => SAFE_DIRS.has(p));
    return at !== -1;
  };
  return targets.length === 0 || !targets.every(safe);
}

function subcommand(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-C' || args[i] === '-c') { i++; continue; }
    if (!args[i].startsWith('-')) return { name: args[i], rest: args.slice(i + 1) };
  }
  return { name: '', rest: [] };
}

function inspect({ cmd, args, bare }, depth) {
  const own = cmd === 'git' || cmd === 'gh' ? withoutMessages(args) : args;

  for (const token of own) {
    const sub = token.indexOf('$(') !== -1 ? token.slice(token.indexOf('$(') + 2, token.lastIndexOf(')') > 0 ? token.lastIndexOf(')') : undefined)
      : token.includes('`') ? token.replace(/`/g, ' ') : null;
    if (sub !== null && depth < 2) { const reason = decide(sub, depth + 1); if (reason) return reason; }
    if (SECRET_DIRS.test(token)) return 'dostęp do kluczy i poświadczeń (~/.ssh, ~/.aws, ~/.config/gh)';
  }

  if (SHELLS.has(cmd)) {
    const at = own.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
    if (at !== -1 && own[at + 1] !== undefined) {
      const body = own[at + 1];
      if (/\$\(\s*(curl|wget)\b|`\s*(curl|wget)\b/.test(body)) return 'pobieranie skryptu prosto do powłoki';
      if (depth < 2) { const reason = decide(body, depth + 1); if (reason) return reason; }
    }
  }
  if (cmd === 'eval' && depth < 2) { const reason = decide(own.join(' '), depth + 1); if (reason) return reason; }

  if (cmd === 'printenv' || (cmd === 'env' && bare)) return 'zrzut zmiennych środowiskowych (mogą zawierać sekrety)';
  if (cmd === 'rm' && recursiveRemoval(own)) return 'rekursywne usuwanie (rm -r)';

  if (READERS.has(cmd) || own.includes('<')) {
    if (pathArguments(cmd, own).some(isSecretEnv)) return 'odczyt pliku .env (poza .env.example i .env.template)';
  }

  if (cmd === 'git') {
    const { name, rest } = subcommand(own);
    if (name === 'push' && rest.some((a) => a === '--force' || a === '--mirror' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+/.test(a)))
      return 'wymuszony push (użyj --force-with-lease)';
  }
  if (cmd === 'gh') {
    const words = own.filter((a) => !a.startsWith('-'));
    if (words.some((w, i) => w === 'repo' && words[i + 1] === 'delete')) return 'usuwanie repozytorium (gh repo delete)';
  }
  return null;
}

/** The reason a command is blocked, or null. `depth` limits how deep quoted bodies (`bash -c`, `eval`, `$(…)`) are read. */
export function decide(command, depth = 0) {
  if (/(^|[\s;&|(])(bash|sh|zsh|dash|ksh|source|\.)\s+<\(\s*(curl|wget)\b/.test(command)) return 'pobieranie skryptu prosto do powłoki';
  for (const pipeline of parse(command)) {
    const parts = pipeline.map(normalize);
    for (let i = 0; i < parts.length; i++) {
      const reason = inspect(parts[i], depth);
      if (reason) return reason;
      if (FETCHERS.has(parts[i].cmd) && parts.slice(i + 1).some((p) => INTERPRETERS.test(p.cmd))) return 'pobieranie skryptu prosto do powłoki';
    }
  }
  return null;
}

function main() {
  let command;
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    command = input?.tool_input?.command;
    if (typeof command !== 'string') throw new Error('brak komendy w tool_input.command');
  } catch (e) {
    process.stderr.write(`Hook nie przeczytał wejścia (${e instanceof Error ? e.message : 'błąd'}); odmowa. Nie próbuj obejść tej blokady innymi komendami.\n`);
    return 2;
  }
  try {
    const reason = decide(command);
    if (reason) { process.stderr.write(`${BLOCKED(reason)}\n`); return 2; }
    return 0;
  } catch (e) {
    process.stderr.write(`Hook zawiódł (${e instanceof Error ? e.message : 'błąd'}); odmowa. Nie próbuj obejść tej blokady innymi komendami.\n`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
