#!/usr/bin/env node
/**
 * verify:regression — proof that a bug fix is a real fix (lesson 14: "a fix is a hypothesis").
 *
 * The test(s) of a fix must be RED on the code before the fix and GREEN on the code after it. This script runs the
 * same test files twice on the current branch:
 *   1. BEFORE: the non-test files the branch changed are put back to their state at the base ref (files the branch
 *      added are removed), the tests stay as they are: they must FAIL;
 *   2. AFTER: the branch is restored exactly (`git checkout HEAD -- …`): the same tests must PASS.
 * Exit 0 only when BEFORE failed and AFTER passed. A test that is green before the fix does not guard the bug.
 *
 * Usage:
 *   npm run verify:regression -- <test file> [<test file> …] [--base origin/main] [--markdown]
 *
 * Needs: a clean working tree (everything committed), the fix and its tests committed on the branch, and the usual
 * dev dependencies. Unit and integration tests run this way (vitest in the package of each test file; integration
 * tests need PostgreSQL as for `npm run test:db`). End-to-end tests are proven with the Markdown scenario and
 * `om-auto-qa-pr` instead. Run it from the checkout (worktree) that holds the fix.
 * Safe by design: the working tree is restored in a `finally` block; if the process is killed, `git status` shows
 * exactly which files to restore with `git checkout HEAD -- <file>`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// the checkout the command runs in (works from any worktree)
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const args = process.argv.slice(2);
const markdown = args.includes('--markdown');
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : 'origin/main';
const tests = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--base');

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const fail = (message) => {
  process.stderr.write(`verify:regression: ${message}\n`);
  process.exit(2);
};

if (tests.length === 0) fail('give at least one test file, e.g. npm run verify:regression -- packages/core/tests/foo.test.ts');
if (git('status', '--porcelain') !== '') fail('the working tree is not clean: commit the fix and its tests first');
let mergeBase;
try {
  mergeBase = git('merge-base', base, 'HEAD');
} catch {
  fail(`cannot find the base ref "${base}" (run: git fetch origin)`);
}
if (mergeBase === git('rev-parse', 'HEAD')) fail(`HEAD is the base (${base}): there is no fix on this branch`);

const testRels = tests.map((t) => relative(root, resolve(root, t)));
for (const t of testRels) if (!existsSync(join(root, t))) fail(`test file not found: ${t}`);
// tests and test support (the shared repository contract lives in core/src/testing and is run by the tests of both packages)
const isTest = (f) => /(^|\/)tests?\//.test(f) || /\/src\/testing\//.test(f) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);

// what the branch changed since the base: A added, M modified, D deleted, R renamed (taken as D + A)
const changed = git('diff', '--name-status', '--no-renames', `${mergeBase}...HEAD`)
  .split('\n')
  .filter(Boolean)
  .map((l) => {
    const [status, ...rest] = l.split('\t');
    return { status, file: rest.join('\t') };
  });
const fixFiles = changed.filter((c) => !isTest(c.file));
if (fixFiles.length === 0) fail('the branch changes only tests: there is no fix to take away');
if (!changed.some((c) => isTest(c.file))) {
  process.stderr.write('verify:regression: note: the branch changes no test or test support: the tests must already guard the bug on the base\n');
}

function runTests() {
  // one vitest run per package, from that package's directory, without coverage
  const byPackage = new Map();
  for (const t of testRels) {
    const m = /^(packages\/[^/]+)\/(.*)$/.exec(t);
    if (!m) fail(`not a test of a package: ${t}`);
    byPackage.set(m[1], [...(byPackage.get(m[1]) ?? []), m[2]]);
  }
  let output = '';
  let ok = true;
  for (const [pkg, files] of byPackage) {
    // *.integration.test.ts need PostgreSQL (TEST_DATABASE_URL or Docker, as in npm run test:db) and their own config
    const groups = [files.filter((x) => !x.endsWith('.integration.test.ts')), files.filter((x) => x.endsWith('.integration.test.ts'))];
    for (const [i, group] of groups.entries()) {
      if (group.length === 0) continue;
      const config = i === 1 ? ['--config', 'vitest.integration.config.ts'] : [];
      const r = spawnSync('npx', ['vitest', 'run', ...config, '--coverage.enabled=false', ...group], { cwd: join(root, pkg), encoding: 'utf8' });
      output += `${r.stdout ?? ''}${r.stderr ?? ''}`;
      if (r.status !== 0) ok = false;
    }
  }
  return { ok, output };
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const excerpt = (output) => {
  const lines = output.split('\n').map((l) => l.replace(ANSI, ''));
  const failed = lines.filter((l) => /^\s*(FAIL|×|AssertionError|Error:|expected|Expected|Received|.*→ )/.test(l)).slice(0, 8);
  const summary = lines.filter((l) => /^\s*(Tests|Test Files)\s/.test(l));
  return [...failed, ...summary].map((l) => l.trim()).filter(Boolean).join('\n');
};

let before;
try {
  // BEFORE: fix files back to the base (added files removed), tests untouched
  for (const { status, file } of fixFiles) {
    if (status === 'A') rmSync(join(root, file), { force: true });
    else git('checkout', mergeBase, '--', file);
  }
  before = runTests();
} finally {
  // restore the branch exactly, whatever happened above
  for (const { status, file } of fixFiles) {
    if (status === 'D') rmSync(join(root, file), { force: true });
    else git('checkout', 'HEAD', '--', file);
  }
}
const after = runTests();
const clean = git('status', '--porcelain') === '';

const verdict = !before.ok && after.ok;
const lines = [
  `base:   ${base} (${mergeBase.slice(0, 9)})`,
  `tests:  ${testRels.join(', ')}`,
  `fix:    ${fixFiles.map((c) => c.file).join(', ')}`,
  `BEFORE the fix: ${before.ok ? 'PASS  <-- the test does not catch the bug' : 'FAIL (expected)'}`,
  `AFTER the fix:  ${after.ok ? 'PASS (expected)' : 'FAIL  <-- the fix does not make the test pass'}`,
  `working tree restored: ${clean ? 'yes' : 'NO, check git status'}`,
  `verdict: ${verdict && clean ? 'OK, the test fails without the fix and passes with it' : 'NOT PROVEN'}`
];
const report = lines.join('\n');
if (markdown) {
  process.stdout.write(
    ['### Regression proof (`npm run verify:regression`)', '', '```', report, '```', '', 'Before the fix:', '', '```', excerpt(before.output) || '(no output)', '```', '', 'After the fix:', '', '```', excerpt(after.output) || '(no output)', '```', ''].join('\n')
  );
} else {
  process.stdout.write(`${report}\n\n--- before the fix ---\n${excerpt(before.output)}\n\n--- after the fix ---\n${excerpt(after.output)}\n`);
}
process.exit(verdict && clean ? 0 : 1);
