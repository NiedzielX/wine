#!/usr/bin/env node
/**
 * Size and consistency checks for the files an agent loads (spec 2026-10-25-context-engineering, R4–R5). No dependencies.
 *
 * Usage:
 *   node scripts/check-context.mjs                run on this repository
 *   node scripts/check-context.mjs --root <dir>   run on another tree (tests)
 *
 * Exit code 1 on any error, 0 with warnings only. Token counts are an estimate (bytes / 3.5), not a measurement:
 * `/context all` in a fresh session is the measurement.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));

// Budgets in bytes and lines. Changing one changes spec 2026-10-25-context-engineering (R5).
const BUDGETS = {
  rootAgents: { warnBytes: 10_240, errorBytes: 12_288, warnLines: 170, errorLines: 200 },
  nestedAgents: { warnBytes: 8_192, errorBytes: 12_288 },
  lessonsIndex: { warnBytes: 12_288, errorBytes: 16_384 },
  routedDoc: { errorBytes: 24_576 },
  activeSpec: { warnBytes: 40_960 },
  chain: { errorBytes: 32_768 },
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

function read(path) {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, 'utf8') : null;
}
function listDir(path, filter) {
  return existsSync(path) && statSync(path).isDirectory() ? readdirSync(path).filter(filter).sort() : [];
}
const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
const sizeOf = (path) => statSync(path).size;
const nonEmpty = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

const measured = [];
function measure(path, label) {
  const text = read(path);
  if (text === null) return null;
  const bytes = Buffer.byteLength(text);
  measured.push({ file: label ?? rel(path), bytes, lines: lineCount(text), tokens: tokens(bytes) });
  return { text, bytes, lines: lineCount(text) };
}

// 1. Root AGENTS.md and CLAUDE.md
const rootAgentsPath = join(root, 'AGENTS.md');
const rootAgents = measure(rootAgentsPath);
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
else if (nonEmpty(claude.text).filter((l) => !l.startsWith('#'))[0] !== '@AGENTS.md') {
  error('CLAUDE.md', 'must start with the @AGENTS.md import (after the heading)');
}

// 2. Package AGENTS.md and CLAUDE.md
for (const name of listDir(join(root, 'packages'), () => true)) {
  const dir = join(root, 'packages', name);
  if (!statSync(dir).isDirectory()) continue;
  const agents = measure(join(dir, 'AGENTS.md'));
  const claudeMd = read(join(dir, 'CLAUDE.md'));
  if (agents) {
    const b = BUDGETS.nestedAgents;
    const file = `packages/${name}/AGENTS.md`;
    if (agents.bytes > b.errorBytes) error(file, `${agents.bytes} B exceeds the ${b.errorBytes} B limit`);
    else if (agents.bytes > b.warnBytes) warn(file, `${agents.bytes} B is over ${b.warnBytes} B`);
    if (claudeMd === null) error(`packages/${name}/CLAUDE.md`, 'missing: Claude Code loads nested CLAUDE.md, not AGENTS.md');
  }
  if (claudeMd !== null) {
    const body = nonEmpty(claudeMd).filter((l) => !l.startsWith('#'));
    if (body.length !== 1 || body[0] !== '@AGENTS.md') error(`packages/${name}/CLAUDE.md`, 'must contain only the @AGENTS.md import');
  }
}

// 3. Routing block in the root AGENTS.md: every path must exist, every chain must fit
const START = '<!-- routing:start -->';
const END = '<!-- routing:end -->';
const chains = [];
if (rootAgents) {
  const s = rootAgents.text.indexOf(START);
  const e = rootAgents.text.indexOf(END);
  if (s === -1 || e === -1 || e < s) error('AGENTS.md', `routing block missing: put the table between ${START} and ${END}`);
  else {
    const rows = rootAgents.text.slice(s + START.length, e).split('\n').filter((l) => l.trim().startsWith('|'));
    rows.forEach((row, index) => {
      const cells = row.split('|').map((c) => c.trim());
      if (/^[-: ]+$/.test(cells[1] ?? '') || index === 0) return; // header and separator
      const label = (cells[1] ?? '').slice(0, 40);
      const paths = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t) => (t.includes('/') || t.endsWith('.md')) && !/[\s<*…]/.test(t) && !t.startsWith('npm '));
      const files = new Set();
      for (const p of paths) {
        const abs = join(root, p);
        if (!existsSync(abs)) error('AGENTS.md', `routing row "${label}": path not found: ${p}`);
        else if (statSync(abs).isFile()) files.add(abs);
      }
      const base = (rootAgents?.bytes ?? 0) + (claude?.bytes ?? 0);
      const bytes = base + [...files].reduce((sum, f) => sum + sizeOf(f), 0);
      chains.push({ label, bytes, files: files.size });
      if (bytes > BUDGETS.chain.errorBytes) error('AGENTS.md', `routing row "${label}": chain of ${bytes} B exceeds ${BUDGETS.chain.errorBytes} B`);
    });
    if (chains.length === 0) error('AGENTS.md', 'routing block has no rows');
  }
}

// 4. Routed documents under .ai/docs
for (const name of listDir(join(root, '.ai', 'docs'), (n) => n.endsWith('.md'))) {
  const doc = measure(join(root, '.ai', 'docs', name));
  if (doc && doc.bytes > BUDGETS.routedDoc.errorBytes) error(`.ai/docs/${name}`, `${doc.bytes} B exceeds the ${BUDGETS.routedDoc.errorBytes} B limit`);
}

// 5. Lessons index and files
const lessons = measure(join(root, '.ai', 'lessons.md'));
if (lessons) {
  const b = BUDGETS.lessonsIndex;
  if (lessons.bytes > b.errorBytes) error('.ai/lessons.md', `${lessons.bytes} B exceeds the ${b.errorBytes} B limit: mark outdated lessons obsolete or promote them to AGENTS.md`);
  else if (lessons.bytes > b.warnBytes) warn('.ai/lessons.md', `${lessons.bytes} B is over ${b.warnBytes} B`);
  const linked = new Set([...lessons.text.matchAll(/\]\(lessons\/([^)\s]+\.md)\)/g)].map((m) => m[1]).filter((f) => !f.includes('YYYY')));
  for (const f of linked) if (!existsSync(join(root, '.ai', 'lessons', f))) error('.ai/lessons.md', `link to a missing lesson: lessons/${f}`);
  for (const f of listDir(join(root, '.ai', 'lessons'), (n) => n.endsWith('.md'))) {
    if (!linked.has(f)) error(`.ai/lessons/${f}`, 'not in the index .ai/lessons.md');
  }
}

// 6. Active specifications
for (const name of listDir(join(root, '.ai', 'specs'), (n) => n.endsWith('.md'))) {
  const bytes = sizeOf(join(root, '.ai', 'specs', name));
  if (bytes > BUDGETS.activeSpec.warnBytes) warn(`.ai/specs/${name}`, `${bytes} B is over ${BUDGETS.activeSpec.warnBytes} B: split it so an agent reads less`);
}

// 7. Skills: description at most 1024 characters, body within the line budget
function description(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return null;
  const lines = m[1].split('\n');
  const i = lines.findIndex((l) => l.startsWith('description:'));
  if (i === -1) return '';
  let value = lines[i].slice('description:'.length).trim();
  if (/^[>|][+-]?$/.test(value)) {
    const folded = [];
    for (const l of lines.slice(i + 1)) {
      if (!/^\s+/.test(l)) break;
      folded.push(l.trim());
    }
    value = folded.join(' ');
  }
  return value.replace(/^(['"])([\s\S]*)\1$/, '$2');
}
let skillCount = 0;
for (const base of ['.claude/skills', '.agents/skills']) {
  for (const name of listDir(join(root, base), () => true)) {
    const path = join(root, base, name, 'SKILL.md');
    const text = read(path);
    if (text === null) continue;
    skillCount += 1;
    const file = rel(path);
    const desc = description(text);
    if (desc === null) error(file, 'missing frontmatter');
    else if (desc.length > BUDGETS.skill.descriptionChars) error(file, `description has ${desc.length} characters, the limit is ${BUDGETS.skill.descriptionChars}`);
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
  out('Chain per task (root AGENTS.md + CLAUDE.md + files of the routing row):');
  for (const c of chains) out(`  ${c.label.padEnd(40)} ${String(c.bytes).padStart(7)} B  ~${tokens(c.bytes)} tokens`);
}
for (const f of findings) out(`${f.level === 'error' ? 'ERROR' : 'warning'}  ${f.file}: ${f.message}`);
const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
out(`check-context: ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors > 0 ? 1 : 0);
