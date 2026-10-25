#!/usr/bin/env node
/**
 * Secret scan of the files tracked by git (spec 2026-10-25-agent-security-hardening, R7). No dependencies.
 *
 * Usage:
 *   node scripts/secret-scan.mjs                       scan `git ls-files` of this repository
 *   node scripts/secret-scan.mjs --root <dir>          scan every file under <dir> (tests; skips node_modules and .git)
 *   node scripts/secret-scan.mjs --allowlist <file>    use another allowlist than scripts/secret-scan.allowlist.json
 *   node scripts/secret-scan.mjs --print-allowlist     print allowlist entries (hashes only) for what the scan found
 *
 * The scan covers the files as they are now, not the history: a secret in an old commit needs a separate scan and a
 * rotation. It never prints a value: findings are file, line and pattern name; allowlist entries are keyed by file,
 * pattern and the SHA-256 of the value, so a changed value is a new finding.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const MAX_BYTES = 1_000_000;
const SKIPPED_FILES = new Set(['package-lock.json']);
const SKIPPED_DIRS = new Set(['node_modules', '.git']);

const PATTERNS = [
  { name: 'postgres-url', re: /postgres(?:ql)?:\/\/[^:/\s"'`]+:[^@\s"'`]+@[^\s"'`/]+/g },
  { name: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'github-token', re: /\bgh[pos]_[A-Za-z0-9]{30,}/g },
  { name: 'github-fine-grained-token', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'aws-access-key', re: /\bAKIA[A-Z2-7]{16}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g }
];

const out = (text) => process.stdout.write(`${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function options(argv) {
  const o = { root: null, allowlist: null, print: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') o.root = resolve(argv[++i] ?? '');
    else if (argv[i] === '--allowlist') o.allowlist = resolve(argv[++i] ?? '');
    else if (argv[i] === '--print-allowlist') o.print = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return o;
}

function walk(dir, base, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { if (!SKIPPED_DIRS.has(entry.name)) walk(join(dir, entry.name), base, files); continue; }
    if (entry.isFile()) files.push(relative(base, join(dir, entry.name)));
  }
}

function listFiles(root) {
  if (root) { const files = []; walk(root, root, files); return { base: root, files }; }
  const raw = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { base: REPO, files: raw.split('\0').filter(Boolean) };
}

/** Text files only: not a symlink, not too big, no NUL byte in the first 8 KB. */
function readText(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.size > MAX_BYTES) return null;
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(Math.min(8192, stat.size));
    readSync(fd, head, 0, head.length, 0);
    if (head.includes(0)) return null;
  } finally { closeSync(fd); }
  return readFileSync(path, 'utf8');
}

function scanFiles({ base, files }) {
  const findings = [];
  for (const file of files) {
    if (SKIPPED_FILES.has(file.slice(file.lastIndexOf('/') + 1))) continue;
    const text = readText(join(base, file));
    if (text === null) continue;
    text.split('\n').forEach((line, index) => {
      for (const { name, re } of PATTERNS) {
        for (const match of line.matchAll(re)) findings.push({ file, line: index + 1, pattern: name, hash: sha256(match[0]) });
      }
    });
  }
  return findings;
}

function readAllowlist(path) {
  if (!path) return [];
  const entries = JSON.parse(readFileSync(path, 'utf8')).entries ?? [];
  for (const e of entries) {
    if (!e.file || !e.pattern || !/^[0-9a-f]{64}$/.test(e.valueSha256 ?? '') || !String(e.reason ?? '').trim())
      throw new Error(`allowlist entry needs file, pattern, valueSha256 and a reason: ${JSON.stringify({ file: e.file, pattern: e.pattern })}`);
  }
  return entries;
}

function main() {
  const o = options(process.argv.slice(2));
  const allowlistPath = o.allowlist ?? (o.root ? null : join(REPO, 'scripts', 'secret-scan.allowlist.json'));
  const findings = scanFiles(listFiles(o.root));

  if (o.print) {
    const unique = new Map(findings.map((f) => [`${f.file}|${f.pattern}|${f.hash}`, f]));
    out(JSON.stringify({ entries: [...unique.values()].map((f) => ({ file: f.file, pattern: f.pattern, valueSha256: f.hash, reason: 'TODO: why this is not a secret' })) }, null, 2));
    return 0;
  }

  const entries = readAllowlist(allowlistPath);
  const key = (e) => `${e.file}|${e.pattern}|${e.valueSha256 ?? e.hash}`;
  const allowed = new Set(entries.map(key));
  const used = new Set();
  const open = findings.filter((f) => { const k = key(f); if (allowed.has(k)) { used.add(k); return false; } return true; });
  const unused = entries.filter((e) => !used.has(key(e)));

  for (const f of open) err(`${f.file}:${f.line}  ${f.pattern}`);
  for (const e of unused) err(`${e.file}  allowlist entry for ${e.pattern} matches nothing: remove it`);
  if (open.length || unused.length) {
    err(`secret-scan: ${open.length} finding(s), ${unused.length} unused allowlist entr${unused.length === 1 ? 'y' : 'ies'}. Values are never printed.`);
    return 1;
  }
  out(`secret-scan: ${findings.length} match(es), all on the allowlist (${allowed.size} entr${allowed.size === 1 ? 'y' : 'ies'}); no other secret patterns found.`);
  return 0;
}

try {
  process.exit(main());
} catch (e) {
  err(`secret-scan: ${e instanceof Error ? e.message : 'failed'}`);
  process.exit(1);
}
