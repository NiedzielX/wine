#!/usr/bin/env node
/**
 * Size and consistency checks for the files an agent loads (spec 2026-10-25-context-engineering, R4–R5). No dependencies.
 *
 * Usage:
 *   node scripts/check-context.mjs                run on this repository
 *   node scripts/check-context.mjs --root <dir>   run on another tree (tests)
 *
 * Exit code 1 on any error, 0 with warnings only. Sizes are bytes (Buffer.byteLength); lines are counted like `wc -l`
 * plus a last line without a newline. Token counts are an estimate (bytes / 3.5), informational only: `/context all`
 * in a fresh session is the measurement.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

// Budgets in bytes and lines. Changing one changes spec 2026-10-25-context-engineering (R5).
const BUDGETS = {
  rootAgents: { warnBytes: 23_552, errorBytes: 27_648, warnLines: 250, errorLines: 280 },
  nestedAgents: { warnBytes: 8_192, errorBytes: 12_288 },
  // Codex loads the root and the package AGENTS.md on the path and drops what is over 32 KiB.
  codexChain: { warnBytes: 30_720, errorBytes: 32_768 },
  // Claude Code warns when a CLAUDE.md is over 40 000 characters.
  claudeFile: { warnBytes: 40_000 },
  lessonsIndex: { warnBytes: 12_288, errorBytes: 16_384 },
  routedDoc: { errorBytes: 24_576 },
  activeSpec: { warnBytes: 40_960 },
  skill: { descriptionChars: 1_024, warnLines: 400, errorLines: 500 }
};

const out = (text) => process.stdout.write(`${text}\n`);
const tokens = (bytes) => Math.ceil(bytes / 3.5);

function rootDir(argv) {
  const i = argv.indexOf('--root');
  return i === -1 ? REPO : resolve(argv[i + 1] ?? '');
}

const root = rootDir(process.argv.slice(2));
const rel = (p) => relative(root, p).split('\\').join('/');
const findings = [];
const error = (file, message) => findings.push({ level: 'error', file, message });
const warn = (file, message) => findings.push({ level: 'warning', file, message });

const normalize = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
function read(path) {
  return existsSync(path) && statSync(path).isFile() ? normalize(readFileSync(path, 'utf8')) : null;
}
function listDir(path, filter = () => true) {
  return existsSync(path) && statSync(path).isDirectory() ? readdirSync(path).filter(filter).sort() : [];
}
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const nonEmpty = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

const measured = [];
function measure(path) {
  const text = read(path);
  if (text === null) return null;
  const bytes = Buffer.byteLength(text);
  measured.push({ file: rel(path), bytes, lines: lineCount(text), tokens: tokens(bytes) });
  return { text, bytes, lines: lineCount(text) };
}

// 1. Root AGENTS.md and CLAUDE.md
const rootAgents = measure(join(root, 'AGENTS.md'));
if (!rootAgents) error('AGENTS.md', 'missing');
else {
  const b = BUDGETS.rootAgents;
  if (rootAgents.bytes > b.errorBytes) error('AGENTS.md', `${rootAgents.bytes} B exceeds the ${b.errorBytes} B limit`);
  else if (rootAgents.bytes > b.warnBytes) warn('AGENTS.md', `${rootAgents.bytes} B is over ${b.warnBytes} B; it is loaded in every session`);
  if (rootAgents.lines > b.errorLines) error('AGENTS.md', `${rootAgents.lines} lines exceed the ${b.errorLines} line limit`);
  else if (rootAgents.lines > b.warnLines) warn('AGENTS.md', `${rootAgents.lines} lines are over ${b.warnLines}`);
}

const claude = measure(join(root, 'CLAUDE.md'));
if (!claude) error('CLAUDE.md', 'missing');
else {
  if (nonEmpty(claude.text).filter((l) => !l.startsWith('#'))[0] !== '@AGENTS.md') error('CLAUDE.md', 'must start with the @AGENTS.md import (after the heading)');
  const total = (rootAgents?.bytes ?? 0) + claude.bytes;
  if (total > BUDGETS.claudeFile.warnBytes) warn('CLAUDE.md', `root AGENTS.md and CLAUDE.md together are ${total} B, over the ${BUDGETS.claudeFile.warnBytes} B Claude Code warning`);
}

// 2. Package AGENTS.md and CLAUDE.md, and the chain Codex loads for each package
const chains = [];
for (const name of listDir(join(root, 'packages'))) {
  const dir = join(root, 'packages', name);
  if (!statSync(dir).isDirectory()) continue;
  const agents = measure(join(dir, 'AGENTS.md'));
  const claudeMd = read(join(dir, 'CLAUDE.md'));
  if (agents) {
    const b = BUDGETS.nestedAgents;
    const file = `packages/${name}/AGENTS.md`;
    if (agents.bytes > b.errorBytes) error(file, `${agents.bytes} B exceeds the ${b.errorBytes} B limit`);
    else if (agents.bytes > b.warnBytes) warn(file, `${agents.bytes} B is over ${b.warnBytes} B`);
    const chain = (rootAgents?.bytes ?? 0) + agents.bytes;
    chains.push({ label: `Codex: root + packages/${name}`, bytes: chain });
    if (chain > BUDGETS.codexChain.errorBytes) error(file, `root AGENTS.md and this file are ${chain} B, over the ${BUDGETS.codexChain.errorBytes} B Codex limit: the rest is dropped`);
    else if (chain > BUDGETS.codexChain.warnBytes) warn(file, `root AGENTS.md and this file are ${chain} B, close to the ${BUDGETS.codexChain.errorBytes} B Codex limit`);
    if (claudeMd === null) error(`packages/${name}/CLAUDE.md`, 'missing: Claude Code loads nested CLAUDE.md, not AGENTS.md');
  }
  if (claudeMd !== null) {
    const body = nonEmpty(claudeMd).filter((l) => !l.startsWith('#'));
    if (body.length !== 1 || body[0] !== '@AGENTS.md') error(`packages/${name}/CLAUDE.md`, 'must contain only the @AGENTS.md import');
  }
}

// 3. Routing block in the root AGENTS.md: every path in the "Read" column must exist (the size per row is only reported)
const START = '<!-- routing:start -->';
const END = '<!-- routing:end -->';
// Product documents, specifications and lesson files are read by section, so they do not count into a row.
const READ_BY_SECTION = ['docs/', '.ai/specs/', '.ai/lessons/'];
function routingPaths(cell) {
  const paths = [];
  for (const m of cell.matchAll(/`([^`]+)`/g)) {
    const token = m[1].replace(/[#:]\S*$/, '');
    const looksLikePath = (token.includes('/') || token.endsWith('.md')) && !/[\s<*…]/.test(token) && !/^(npm|node)\b/.test(token);
    if (looksLikePath && !token.startsWith('.env')) paths.push(token);
  }
  return paths;
}
if (rootAgents) {
  const t = rootAgents.text;
  const starts = t.split(START).length - 1;
  const ends = t.split(END).length - 1;
  const s = t.indexOf(START);
  const e = t.indexOf(END);
  if (starts !== 1 || ends !== 1 || e < s) error('AGENTS.md', `routing block missing or duplicated: exactly one table between ${START} and ${END}`);
  else {
    const rows = t.slice(s + START.length, e).split('\n').filter((l) => l.trim().startsWith('|'));
    let checked = 0;
    rows.forEach((row, index) => {
      const cells = row.split('|').map((c) => c.trim());
      if (index === 0 || /^[-: ]+$/.test(cells[1] ?? '')) return; // header and separator
      const label = (cells[1] ?? '').slice(0, 40);
      let bytes = (rootAgents?.bytes ?? 0) + (claude?.bytes ?? 0);
      for (const p of routingPaths(cells[2] ?? '')) {
        const abs = join(root, p.replace(/\/$/, ''));
        checked += 1;
        if (!existsSync(abs)) error('AGENTS.md', `routing row "${label}": path not found: ${p}`);
        else if (p.endsWith('/') && !statSync(abs).isDirectory()) error('AGENTS.md', `routing row "${label}": ${p} is not a directory`);
        else if (statSync(abs).isFile() && !READ_BY_SECTION.some((prefix) => p.startsWith(prefix))) bytes += Buffer.byteLength(read(abs) ?? '');
      }
      chains.push({ label: `row: ${label}`, bytes });
    });
    if (checked === 0) error('AGENTS.md', 'routing block has no paths to check');
  }
}

// 4. Routed documents under .ai/docs
for (const name of listDir(join(root, '.ai', 'docs'), (n) => n.endsWith('.md'))) {
  const doc = measure(join(root, '.ai', 'docs', name));
  if (doc && doc.bytes > BUDGETS.routedDoc.errorBytes) error(`.ai/docs/${name}`, `${doc.bytes} B exceeds the ${BUDGETS.routedDoc.errorBytes} B limit`);
}

// 5. Lessons index (links are relative to .ai/) and files
const FILE_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.md$/;
const lessons = measure(join(root, '.ai', 'lessons.md'));
if (lessons) {
  const b = BUDGETS.lessonsIndex;
  if (lessons.bytes > b.errorBytes) error('.ai/lessons.md', `${lessons.bytes} B exceeds the ${b.errorBytes} B limit: mark outdated lessons obsolete or promote them to AGENTS.md`);
  else if (lessons.bytes > b.warnBytes) warn('.ai/lessons.md', `${lessons.bytes} B is over ${b.warnBytes} B`);
  const entries = lessons.text.split('\n').filter((l) => /^- \[\d{4}-\d{2}-\d{2}\]/.test(l));
  const linked = new Set();
  for (const line of entries) {
    for (const m of line.matchAll(/\]\(lessons\/([^)\s]+\.md)\)/g)) {
      if (linked.has(m[1])) error('.ai/lessons.md', `lesson listed twice: lessons/${m[1]}`);
      linked.add(m[1]);
      if (!existsSync(join(root, '.ai', 'lessons', m[1]))) error('.ai/lessons.md', `link to a missing lesson: lessons/${m[1]}`);
    }
  }
  for (const f of listDir(join(root, '.ai', 'lessons'), (n) => n.endsWith('.md'))) {
    if (!linked.has(f)) error(`.ai/lessons/${f}`, 'not in the index .ai/lessons.md');
  }
}

// 6. File names in .ai (YYYY-MM-DD-slug.md, ASCII) and active specifications
const NOT_SPECS = new Set(['product-brief.md', 'backlog.md']);
for (const [dirName, skip] of [['lessons', new Set()], ['runs', new Set()], ['specs', NOT_SPECS], ['specs/implemented', new Set()], ['specs/archive', new Set()]]) {
  for (const name of listDir(join(root, '.ai', dirName), (n) => n.endsWith('.md') && !skip.has(n))) {
    if (!FILE_NAME.test(name)) error(`.ai/${dirName}/${name}`, 'name must be YYYY-MM-DD-slug.md (lowercase ASCII, digits, hyphens)');
  }
}
for (const name of listDir(join(root, '.ai', 'specs'), (n) => n.endsWith('.md') && !NOT_SPECS.has(n))) {
  const bytes = statSync(join(root, '.ai', 'specs', name)).size;
  if (bytes > BUDGETS.activeSpec.warnBytes) warn(`.ai/specs/${name}`, `${bytes} B is over ${BUDGETS.activeSpec.warnBytes} B: split it so an agent reads less`);
}

// 7. References to AGENTS.md sections must resolve to a heading of the root AGENTS.md
if (rootAgents) {
  const headings = new Set();
  for (const l of rootAgents.text.split('\n')) {
    const m = /^#{2,3}\s+(\d+(?:\.\d+)?)[.\s]/.exec(l);
    if (m) headings.add(m[1]);
  }
  const files = ['CLAUDE.md', ...listDir(join(root, 'packages')).map((n) => `packages/${n}/AGENTS.md`),
    ...listDir(join(root, '.ai', 'docs'), (n) => n.endsWith('.md')).map((n) => `.ai/docs/${n}`),
    ...listDir(join(root, '.ai', 'lessons'), (n) => n.endsWith('.md')).map((n) => `.ai/lessons/${n}`)];
  for (const f of files) {
    const text = read(join(root, f));
    if (text === null) continue;
    for (const line of text.split('\n')) {
      if (!/AGENTS/.test(line)) continue;
      for (const m of line.matchAll(/§\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+(?:\.\d+)?))?/g)) {
        for (const num of [m[1], m[2]].filter(Boolean)) {
          if (!headings.has(num)) error(f, `refers to AGENTS.md §${num}, which is not a heading of AGENTS.md`);
        }
      }
    }
  }
}

// 8. `npm run <script>` in the instruction files must name a script that exists in a package.json
function scriptNames() {
  const names = new Set();
  const files = [join(root, 'package.json'), ...listDir(join(root, 'packages')).map((n) => join(root, 'packages', n, 'package.json'))];
  let found = false;
  for (const f of files) {
    const text = read(f);
    if (text === null) continue;
    found = true;
    try {
      for (const k of Object.keys(JSON.parse(text).scripts ?? {})) names.add(k);
    } catch {
      error(rel(f), 'is not valid JSON');
    }
  }
  return found ? names : null;
}
const scripts = scriptNames();
if (scripts) {
  const files = ['AGENTS.md', 'CLAUDE.md', ...listDir(join(root, 'packages')).map((n) => `packages/${n}/AGENTS.md`),
    ...listDir(join(root, '.ai', 'docs'), (n) => n.endsWith('.md')).map((n) => `.ai/docs/${n}`)];
  for (const f of files) {
    const text = read(join(root, f));
    if (text === null) continue;
    const seen = new Set();
    for (const m of text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) {
      if (!scripts.has(m[1]) && !seen.has(m[1])) {
        seen.add(m[1]);
        error(f, `mentions \`npm run ${m[1]}\`, which is not a script in any package.json`);
      }
    }
  }
}

// 9. Skills: description at most 1024 characters, body within the line budget. .claude/skills holds symlinks to
// .agents/skills, so symlinks are skipped and each skill is counted once.
function description(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const lines = m[1].split('\n');
  const i = lines.findIndex((l) => l.startsWith('description:'));
  if (i === -1) return '';
  let value = lines[i].slice('description:'.length).trim();
  const block = /^[>|][+-]?$/.test(value);
  const continuation = [];
  for (const l of lines.slice(i + 1)) {
    if (!/^\s+\S/.test(l)) break;
    continuation.push(l.trim());
  }
  value = block ? continuation.join(' ') : [value, ...continuation].join(' ');
  return value.replace(/^(['"])([\s\S]*)\1$/, '$2');
}
let skillCount = 0;
for (const base of ['.agents/skills', '.claude/skills']) {
  for (const name of listDir(join(root, base))) {
    const dir = join(root, base, name);
    if (lstatSync(dir).isSymbolicLink()) continue;
    if (!statSync(dir).isDirectory()) continue;
    const path = join(dir, 'SKILL.md');
    const text = read(path);
    const file = rel(path);
    if (text === null) {
      error(file, 'missing SKILL.md');
      continue;
    }
    skillCount += 1;
    const desc = description(text);
    if (desc === null) error(file, 'missing frontmatter');
    else if (desc === '') error(file, 'missing description');
    else if ([...desc].length > BUDGETS.skill.descriptionChars) error(file, `description has ${[...desc].length} characters, the limit is ${BUDGETS.skill.descriptionChars}`);
    const lines = lineCount(text);
    if (lines > BUDGETS.skill.errorLines) error(file, `${lines} lines exceed ${BUDGETS.skill.errorLines}`);
    else if (lines > BUDGETS.skill.warnLines) warn(file, `${lines} lines are over ${BUDGETS.skill.warnLines}`);
  }
}

// Report
out('Context files (tokens are an estimate: bytes / 3.5):');
for (const m of measured.filter((x) => !x.file.startsWith('.ai/lessons/'))) {
  out(`  ${m.file.padEnd(44)} ${String(m.bytes).padStart(7)} B  ${String(m.lines).padStart(4)} lines  ~${m.tokens} tokens`);
}
out(`  skills checked: ${skillCount}`);
if (chains.length) {
  out('Chains (Codex: root + package AGENTS.md; row: root + CLAUDE.md + instruction files of the routing row):');
  for (const c of chains) out(`  ${c.label.padEnd(44)} ${String(c.bytes).padStart(7)} B  ~${tokens(c.bytes)} tokens`);
}
for (const f of findings) out(`${f.level === 'error' ? 'ERROR' : 'warning'}  ${f.file}: ${f.message}`);
const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
out(`check-context: ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
