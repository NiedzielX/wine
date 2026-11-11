#!/usr/bin/env node
/**
 * QA scenario guard (lesson 12): every `it` of an `*.e2e.test.ts` has a Markdown scenario in `.ai/qa/`, linked both ways.
 * No dependencies. Usage:
 *   node scripts/check-qa-scenarios.mjs                run on this repository
 *   node scripts/check-qa-scenarios.mjs --root <dir>   run on another tree (tests)
 *
 * Fails (exit 1) with a list of problems when:
 *  (a) a scenario's `test.file` or `test.it` does not exist in the referenced e2e file;
 *  (b) a scenario file name does not match {area}-{NNN}-{slug}.md in its area folder, or its `id` differs from the name;
 *  (c) an `it` in an `*.e2e.test.ts` file has no scenario that references it;
 *  (d) `.ai/qa/INDEX.md` has no row for a scenario;
 *  (e) two scenarios of one area share a number (`security-018-a` and `security-018-b`: two branches took the same next id).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const rootArg = argv.indexOf('--root');
const root = rootArg === -1 ? REPO : resolve(argv[rootArg + 1] ?? '');
const E2E_DIR = 'packages/app/tests/e2e';
const NOT_AREAS = new Set(['knowledge']);
const NAME = /^([a-z]+)-(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

const problems = [];
const problem = (file, message) => problems.push(`${file}: ${message}`);
const rel = (p) => relative(root, p).split('\\').join('/');
const normalize = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const listDir = (dir) => (existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir).sort() : []);

/** The titles of the `it(...)` calls of one test file, unescaped like the JavaScript string they are. */
function itTitles(file) {
  const text = normalize(readFileSync(file, 'utf8'));
  return [...text.matchAll(/^\s*it\((['"`])((?:\\.|(?!\1).)*)\1/gm)].map((m) => m[2].replace(/\\(.)/g, '$1'));
}

/** Front matter of a scenario: flat keys and one level of nested keys; values are JSON strings, JSON arrays or plain text. */
function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!m) return null;
  const data = {};
  let parent = null;
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const nested = /^ {2}([a-z]+):\s*(.*)$/.exec(line);
    const top = /^([a-z]+):\s*(.*)$/.exec(line);
    if (nested && parent) data[parent][nested[1]] = value(nested[2]);
    else if (top) {
      if (top[2] === '') { parent = top[1]; data[parent] = {}; } else { parent = null; data[top[1]] = value(top[2]); }
    }
  }
  return data;
}
function value(raw) {
  const v = raw.replace(/\s+#.*$/, '').trim();
  if (v.startsWith('"') || v.startsWith('[')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

const qaDir = join(root, '.ai', 'qa');
const scenarios = [];
/** `{area}-{NNN}` → the first scenario id that uses it (e) */
const numbers = new Map();
for (const area of listDir(qaDir)) {
  const dir = join(qaDir, area);
  // only lowercase-letter folders are areas; tooling folders such as test-env.lock are not scenarios
  // `knowledge` is the QA knowledge base (session entries, .ai/qa/knowledge/README.md), not an area of scenarios
  if (!statSync(dir).isDirectory() || !/^[a-z]+$/.test(area) || NOT_AREAS.has(area)) continue;
  for (const name of listDir(dir)) {
    if (name === '.gitkeep') continue;
    const path = join(dir, name);
    const where = rel(path);
    if (!name.endsWith('.md')) { problem(where, 'only .md scenario files belong here'); continue; }
    const m = NAME.exec(name);
    if (!m) problem(where, 'name must be {area}-{NNN}-{slug}.md (lowercase ASCII words joined by hyphens, NNN three digits)');
    else if (m[1] !== area) problem(where, `the name starts with area "${m[1]}" but the file is in the folder "${area}"`);
    else {
      const first = numbers.get(`${area}-${m[2]}`);
      if (first) problem(where, `number ${m[2]} is already used in area "${area}" by ${first}: take the next free number`);
      else numbers.set(`${area}-${m[2]}`, name.replace(/\.md$/, ''));
    }
    const fm = frontMatter(normalize(readFileSync(path, 'utf8')));
    if (!fm) { problem(where, 'missing front matter (--- block at the top)'); continue; }
    const id = name.replace(/\.md$/, '');
    if (fm.id !== id) problem(where, `id "${fm.id ?? ''}" must equal the file name "${id}"`);
    if (fm.area !== area) problem(where, `area "${fm.area ?? ''}" must equal the folder "${area}"`);
    scenarios.push({ where, id, test: fm.test ?? {} });
  }
}

// (a) the referenced test and `it` exist
const cache = new Map();
const titlesOf = (file) => {
  if (!cache.has(file)) {
    const abs = join(root, file);
    cache.set(file, existsSync(abs) && statSync(abs).isFile() ? itTitles(abs) : null);
  }
  return cache.get(file);
};
const referenced = new Set();
for (const s of scenarios) {
  const { file, it } = s.test;
  if (typeof file !== 'string' || typeof it !== 'string' || !file || !it) { problem(s.where, 'front matter needs test.file and test.it'); continue; }
  if (!file.startsWith(`${E2E_DIR}/`) || !file.endsWith('.e2e.test.ts')) { problem(s.where, `test.file "${file}" must be an *.e2e.test.ts under ${E2E_DIR}/`); continue; }
  const titles = titlesOf(file);
  if (titles === null) problem(s.where, `test file "${file}" does not exist`);
  else if (!titles.includes(it)) problem(s.where, `no it("${it}") in ${file}`);
  else {
    const key = `${file}\u0000${it}`;
    if (referenced.has(key)) problem(s.where, `a second scenario for the same it("${it}") of ${file}`);
    referenced.add(key);
  }
}

// (c) every `it` of every e2e file has a scenario
for (const name of listDir(join(root, E2E_DIR)).filter((n) => n.endsWith('.e2e.test.ts'))) {
  const file = `${E2E_DIR}/${name}`;
  for (const title of titlesOf(file) ?? []) {
    if (!referenced.has(`${file}\u0000${title}`)) problem(file, `no scenario in .ai/qa/ for it("${title}")`);
  }
}

// (d) INDEX.md lists every scenario
const indexPath = join(qaDir, 'INDEX.md');
if (!existsSync(indexPath)) problem('.ai/qa/INDEX.md', 'missing');
else {
  const index = normalize(readFileSync(indexPath, 'utf8'));
  for (const s of scenarios) {
    if (!index.split('\n').some((line) => line.startsWith('|') && line.includes(`${s.id}.md`))) problem('.ai/qa/INDEX.md', `no row for scenario ${s.id}`);
  }
}

if (problems.length) {
  process.stderr.write(`check-qa-scenarios: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`check-qa-scenarios: ${scenarios.length} scenarios, all linked to an existing it and listed in INDEX.md\n`);
