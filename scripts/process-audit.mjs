#!/usr/bin/env node
/**
 * Process audit: what the course "AI Tech Leaders" (lessons 1–22) and the owner's decisions require of this repository,
 * checked from the files alone. It is the gap finder and progress meter of the executor in
 * .ai/docs/process-playbook.md; the human summary is docs/PROCES_I_KURS.md.
 *
 * Usage:
 *   node scripts/process-audit.mjs                        table for this repository
 *   node scripts/process-audit.mjs --json                 the same as JSON ({ summary, results })
 *   node scripts/process-audit.mjs --root <dir>           another tree (tests)
 *   node scripts/process-audit.mjs --repo <owner/name>    repository name used in the MANUAL gh commands
 *
 * Deterministic and offline: no network, no git, no child processes, no environment variables, never prints file
 * contents beyond names and counts. Checks that need GitHub are MANUAL and carry a read-only `gh` command.
 * Exit code: 1 when any check FAILs, 0 otherwise (PARTIAL and MANUAL do not fail), 2 on bad usage.
 * Files are read directly and "not there" (ENOENT, ENOTDIR, EISDIR) is null: no exists-then-read race (CodeQL
 * js/file-system-race).
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, normalize as normalizePath, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_SLUG = 'NiedzielX/wine';

// Budgets mirror scripts/check-context.mjs (spec 2026-10-25-context-engineering, R5).
const BUDGET = { agentsWarn: 23_552, agentsError: 27_648, agentsWarnLines: 250, codexWarn: 30_720, codexError: 32_768,
  lessonsWarn: 12_288, lessonsError: 16_384, routedDoc: 24_576, activeSpec: 40_960 };

const MISSING = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);
function orNull(fn) {
  try {
    return fn();
  } catch (e) {
    if (MISSING.has(e?.code)) return null;
    throw e;
  }
}

function makeFs(root) {
  const abs = (p) => join(root, p);
  const read = (p) => {
    const t = orNull(() => readFileSync(abs(p), 'utf8'));
    return t === null ? null : t.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  };
  const list = (p) => (orNull(() => readdirSync(abs(p), { withFileTypes: true })) ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const files = (p, filter = () => true) => list(p).filter((d) => d.isFile() && filter(d.name)).map((d) => d.name);
  const dirs = (p) => list(p).filter((d) => d.isDirectory()).map((d) => d.name);
  const isDir = (p) => orNull(() => statSync(abs(p)))?.isDirectory() === true;
  const exists = (p) => orNull(() => statSync(abs(p))) !== null;
  const json = (p) => {
    const t = read(p);
    if (t === null) return { missing: true };
    try {
      return { value: JSON.parse(t) };
    } catch {
      return { invalid: true };
    }
  };
  function walk(p, depth) {
    const out = [];
    for (const d of list(p)) {
      const child = `${p}/${d.name}`;
      if (d.isFile()) out.push(child);
      else if (d.isDirectory() && depth > 0 && d.name !== 'node_modules') out.push(...walk(child, depth - 1));
    }
    return out;
  }
  return { read, files, dirs, isDir, exists, json, walk };
}

const bytes = (t) => Buffer.byteLength(t);
const lines = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0);
function short(items, n = 6) {
  return items.length <= n ? items.join(', ') : `${items.slice(0, n).join(', ')} (+${items.length - n} more)`;
}
const pass = (evidence) => ({ status: 'PASS', evidence });
const fail = (evidence) => ({ status: 'FAIL', evidence });
const partial = (evidence) => ({ status: 'PARTIAL', evidence });
function missingFiles(fs, paths) {
  return paths.filter((p) => (p.endsWith('/') ? !fs.isDir(p) : fs.read(p) === null));
}
function needFiles(fs, paths) {
  const miss = missingFiles(fs, paths);
  return miss.length ? fail(`missing: ${short(miss)}`) : pass(`${paths.length} present`);
}
function scriptsOf(fs) {
  const names = new Set();
  const root = fs.json('package.json').value;
  for (const k of Object.keys(root?.scripts ?? {})) names.add(k);
  for (const p of fs.dirs('packages')) for (const k of Object.keys(fs.json(`packages/${p}/package.json`).value?.scripts ?? {})) names.add(k);
  return { root: new Set(Object.keys(root?.scripts ?? {})), any: names, pkg: root };
}
function needScripts(fs, names, files = []) {
  const { root } = scriptsOf(fs);
  const miss = names.filter((n) => !root.has(n)).map((n) => `npm run ${n}`);
  miss.push(...missingFiles(fs, files));
  return miss.length ? fail(`missing: ${short(miss)}`) : pass(`${names.length} scripts and ${files.length} files present`);
}
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text ?? '');
  return m ? m[1] : null;
}
const statusOf = (text) => /^status:\s*([A-Za-z-]+)/m.exec(frontmatter(text) ?? '')?.[1] ?? null;
const codeLines = (text) => (text ?? '').split('\n').map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => !l.trim().startsWith('#'));

function jobIds(text) {
  const ids = [];
  let inJobs = false;
  for (const l of (text ?? '').split('\n')) {
    if (/^jobs:\s*$/.test(l)) inJobs = true;
    else if (/^\S/.test(l)) inJobs = false;
    else if (inJobs) {
      const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(l);
      if (m) ids.push(m[1]);
    }
  }
  return ids;
}
function jobBlock(text, id) {
  const ls = (text ?? '').split('\n');
  const start = ls.findIndex((l) => l === `  ${id}:`);
  if (start === -1) return '';
  let end = ls.length;
  for (let i = start + 1; i < ls.length; i++) if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(ls[i]) || /^\S/.test(ls[i])) { end = i; break; }
  return ls.slice(start, end).join('\n');
}
function triggers(text) {
  const ls = (text ?? '').split('\n');
  const start = ls.findIndex((l) => /^(on|"on"|'on'):\s*$/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < ls.length && !/^\S/.test(ls[i]); i++) {
    const m = /^ {2}([A-Za-z_]+):/.exec(ls[i]);
    if (m) out.push(m[1]);
  }
  return out;
}

const PATH_TOKEN = /^(?:[\w.-]+\/)*[\w.-]+\.(?:md|mjs|cjs|js|ts|tsx|yml|yaml|json|sh|mmd)$|^(?:\.?[\w-]+\/)+$/;
function referencedPaths(text, docPath) {
  const found = new Set();
  for (const m of (text ?? '').matchAll(/`([^`\s]+)`/g)) {
    const t = m[1];
    if (/[*<>{}$~…]|YYYY|^\//.test(t) || !PATH_TOKEN.test(t)) continue;
    found.add(t);
  }
  for (const m of (text ?? '').matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
    const t = m[1];
    if (/^[a-z]+:/i.test(t)) continue;
    found.add(normalizePath(join(dirname(docPath), t)).split('\\').join('/'));
  }
  return [...found];
}

const PROMPT = /<!-- start-prompt:start -->\n([\s\S]*?)<!-- start-prompt:end -->/g;
const PLAYBOOK = '.ai/docs/process-playbook.md';
const HUMAN_DOC = 'docs/PROCES_I_KURS.md';

/** Each check: id, area, severity, actor (who can close the gap), title, fix (where the fix belongs), run(fs). */
function checks() {
  return [
    // --- PROC: spec-driven process, run logs, lessons (lessons 2, 5, 11; AGENTS.md §3–§6)
    { id: 'PROC-01', area: 'PROC', severity: 'high', actor: 'agent', title: 'Process documents exist', fix: 'root',
      run: (fs) => needFiles(fs, ['AGENTS.md', 'CLAUDE.md', 'SDLC.md', 'CODE_REVIEW.md', 'CONTRIBUTING.md', 'BACKWARD_COMPATIBILITY.md', 'UPGRADE_NOTES.md', 'CHANGELOG.md', 'security-notes.md']) },
    { id: 'PROC-02', area: 'PROC', severity: 'high', actor: 'agent', title: '.ai/ structure (specs, runs, lessons, brief, backlog, pipeline config)', fix: '.ai/',
      run: (fs) => needFiles(fs, ['.ai/specs/', '.ai/specs/implemented/', '.ai/specs/archive/', '.ai/runs/', '.ai/lessons/', '.ai/lessons.md',
        '.ai/specs/product-brief.md', '.ai/specs/backlog.md', '.ai/agentic.config.json', '.ai/docs/process-templates.md']) },
    { id: 'PROC-03', area: 'PROC', severity: 'high', actor: 'agent', title: 'Spec status matches its folder (approved is set by a human only)', fix: '.ai/specs/',
      run: (fs) => {
        const bad = [];
        const allowed = [['.ai/specs', ['draft', 'approved', 'in-progress']], ['.ai/specs/implemented', ['implemented']], ['.ai/specs/archive', ['superseded', 'abandoned']]];
        let n = 0;
        for (const [dir, ok] of allowed) {
          for (const f of fs.files(dir, (x) => x.endsWith('.md') && !['product-brief.md', 'backlog.md'].includes(x))) {
            n++;
            const s = statusOf(fs.read(`${dir}/${f}`));
            if (!ok.includes(s)) bad.push(`${dir}/${f} (${s ?? 'no status'})`);
          }
        }
        return bad.length ? fail(`status does not fit the folder: ${short(bad)}`) : pass(`${n} specs, statuses fit their folders`);
      } },
    { id: 'PROC-04', area: 'PROC', severity: 'high', actor: 'agent', title: 'Hook guards spec status (agent cannot set approved)', fix: '.claude/settings.json, .claude/hooks/ (review path)',
      run: (fs) => hookCheck(fs, (m) => /Edit/.test(m) && /Write/.test(m), 'spec-status-guard.mjs') },
    { id: 'PROC-05', area: 'PROC', severity: 'low', actor: 'agent', title: 'Run logs carry started/outcome frontmatter', fix: '.ai/runs/ (new logs only; old logs are not edited)',
      run: (fs) => {
        const logs = fs.files('.ai/runs', (x) => x.endsWith('.md'));
        if (!logs.length) return fail('no run logs in .ai/runs/');
        const bad = logs.filter((f) => {
          const fm = frontmatter(fs.read(`.ai/runs/${f}`));
          return !fm || !/^started:/m.test(fm) || !/^outcome:/m.test(fm);
        });
        return bad.length ? partial(`${bad.length}/${logs.length} without started/outcome: ${short(bad)}`) : pass(`${logs.length} run logs`);
      } },
    { id: 'PROC-06', area: 'PROC', severity: 'low', actor: 'owner', title: 'Draft specs waiting for the owner (one batched question)', fix: 'owner: set approved',
      run: (fs) => {
        const drafts = fs.files('.ai/specs', (x) => x.endsWith('.md')).filter((f) => statusOf(fs.read(`.ai/specs/${f}`)) === 'draft');
        return pass(drafts.length ? `${drafts.length} draft(s) await approval: ${short(drafts)}` : 'no drafts');
      } },
    { id: 'PROC-07', area: 'PROC', severity: 'medium', actor: 'agent', title: 'Executor playbook and human doc exist with the same START PROMPT', fix: `${PLAYBOOK}, ${HUMAN_DOC}`,
      run: (fs) => {
        const a = fs.read(PLAYBOOK);
        const b = fs.read(HUMAN_DOC);
        if (a === null || b === null) return fail(`missing: ${short([a === null && PLAYBOOK, b === null && HUMAN_DOC].filter(Boolean))}`);
        const pa = [...a.matchAll(PROMPT)].map((m) => m[1]);
        const pb = [...b.matchAll(PROMPT)].map((m) => m[1]);
        if (pa.length !== 1 || pb.length !== 1) return fail('each file needs exactly one <!-- start-prompt:start/end --> block');
        return pa[0] === pb[0] ? pass('one START PROMPT, identical in both') : fail('START PROMPT differs between the playbook and the human doc');
      } },

    // --- REV: review and acceptance (lessons 8, 14, 17, 21)
    { id: 'REV-01', area: 'REV', severity: 'high', actor: 'agent', title: 'Review protocol documents', fix: '.ai/docs/',
      run: (fs) => needFiles(fs, ['CODE_REVIEW.md', '.ai/docs/review-protocol.md', '.ai/docs/review-checklists.md', '.ai/docs/fix-verification.md', '.ai/docs/nightly-review-routine.md']) },
    { id: 'REV-02', area: 'REV', severity: 'medium', actor: 'agent', title: 'Reviewer pack, review contract and regression proof scripts', fix: 'scripts/, package.json',
      run: (fs) => needScripts(fs, ['review:pack', 'review:validate', 'verify:regression'],
        ['scripts/review-pack.mjs', 'scripts/review-validate.mjs', 'scripts/verify-regression.mjs', '.ai/schemas/review-input.schema.json', '.ai/schemas/review-output.schema.json']) },
    { id: 'REV-03', area: 'REV', severity: 'medium', actor: 'agent', title: 'SDLC label vocabulary (risk-high, needs-qa, qa-approved, merge-queue …)', fix: 'SDLC.md',
      run: (fs) => {
        const t = fs.read('SDLC.md');
        if (t === null) return fail('SDLC.md missing');
        const miss = ['review', 'changes-requested', 'merge-queue', 'needs-qa', 'qa-approved', 'risk-high', 'do-not-merge'].filter((l) => !t.includes(l));
        return miss.length ? fail(`labels not described: ${short(miss)}`) : pass('7 labels described');
      } },
    { id: 'REV-04', area: 'REV', severity: 'low', actor: 'agent', title: 'Pull request template', fix: '.github/pull_request_template.md',
      run: (fs) => needFiles(fs, ['.github/pull_request_template.md']) },
    { id: 'REV-05', area: 'REV', severity: 'high', actor: 'agent', title: 'Merge needs the owner: gh pr merge is an ask permission', fix: '.claude/settings.json (review path)',
      run: (fs) => {
        const s = fs.json('.claude/settings.json');
        if (!s.value) return fail('.claude/settings.json missing or not JSON');
        const ask = s.value.permissions?.ask ?? [];
        const miss = ['Bash(gh pr merge)', 'Bash(gh pr merge *)'].filter((x) => !ask.includes(x));
        return miss.length ? fail(`permissions.ask lacks ${short(miss)}`) : pass('gh pr merge asks the human');
      } },

    // --- CI: safety net and supply chain (lessons 2, 9, 12, 14, 17, 18)
    { id: 'CI-01', area: 'CI', severity: 'high', actor: 'agent', title: 'CI jobs: lint, secrets, design, unit, a11y, build, database, e2e, image', fix: '.github/workflows/ci.yml (review path)',
      run: (fs) => {
        const ids = jobIds(fs.read('.github/workflows/ci.yml'));
        const miss = ['lint', 'secrets', 'design', 'unit', 'a11y', 'build', 'database', 'e2e', 'image'].filter((j) => !ids.includes(j));
        return miss.length ? fail(`missing job(s): ${short(miss)}`) : pass(`jobs: ${ids.join(', ')}`);
      } },
    { id: 'CI-02', area: 'CI', severity: 'high', actor: 'agent', title: 'lint job runs the deterministic gates', fix: '.github/workflows/ci.yml (review path)',
      run: (fs) => {
        const block = jobBlock(fs.read('.github/workflows/ci.yml'), 'lint');
        const miss = ['check:boundaries', 'check:qa', 'check:routes', 'typecheck', 'audit:gate', 'check:context'].filter((s) => !block.includes(`npm run ${s}`));
        return miss.length ? fail(`lint job does not run: ${short(miss)}`) : pass('6 gates in the lint job');
      } },
    { id: 'CI-03', area: 'CI', severity: 'medium', actor: 'agent', title: 'CodeQL on pull requests', fix: '.github/workflows/codeql.yml',
      run: (fs) => {
        const t = fs.read('.github/workflows/codeql.yml');
        if (t === null) return fail('codeql.yml missing');
        return jobIds(t).includes('analyze') && triggers(t).includes('pull_request') ? pass('job analyze on pull_request') : fail('codeql.yml needs job analyze and a pull_request trigger');
      } },
    { id: 'CI-04', area: 'CI', severity: 'high', actor: 'agent', title: 'Every action pinned by full SHA with # vX.Y.Z', fix: '.github/workflows/ (review path)',
      run: (fs) => {
        const bad = [];
        let n = 0;
        for (const f of fs.files('.github/workflows', (x) => /\.ya?ml$/.test(x))) {
          for (const { l, n: line } of codeLines(fs.read(`.github/workflows/${f}`))) {
            const m = /^\s*-?\s*uses:\s*(\S+)(.*)$/.exec(l);
            if (!m || m[1].startsWith('./')) continue;
            n++;
            const ok = m[1].startsWith('docker://') ? m[1].includes('@sha256:') : /@[0-9a-f]{40}$/.test(m[1]) && /#\s*v\d/.test(m[2]);
            if (!ok) bad.push(`${f}:${line}`);
          }
        }
        return bad.length ? fail(`not pinned: ${short(bad)}`) : pass(`${n} uses pinned`);
      } },
    { id: 'CI-05', area: 'CI', severity: 'high', actor: 'agent', title: 'Every workflow declares top-level permissions', fix: '.github/workflows/ (review path)',
      run: (fs) => {
        const wf = fs.files('.github/workflows', (x) => /\.ya?ml$/.test(x));
        if (!wf.length) return fail('no workflows');
        const bad = wf.filter((f) => !/^permissions:/m.test(fs.read(`.github/workflows/${f}`)));
        return bad.length ? fail(`no permissions: ${short(bad)}`) : pass(`${wf.length} workflows`);
      } },
    { id: 'CI-06', area: 'CI', severity: 'medium', actor: 'agent', title: 'Checkouts do not persist the token', fix: '.github/workflows/ (review path)',
      run: (fs) => {
        const bad = [];
        for (const f of fs.files('.github/workflows', (x) => /\.ya?ml$/.test(x))) {
          const ls = codeLines(fs.read(`.github/workflows/${f}`));
          const c = ls.filter(({ l }) => /uses:\s*actions\/checkout@/.test(l)).length;
          const p = ls.filter(({ l }) => /persist-credentials:\s*false/.test(l)).length;
          if (p < c) bad.push(`${f} (${c} checkouts, ${p} persist-credentials: false)`);
        }
        return bad.length ? fail(short(bad)) : pass('every checkout has persist-credentials: false');
      } },
    { id: 'CI-07', area: 'CI', severity: 'medium', actor: 'agent', title: 'Dependabot for npm and actions with cooldown', fix: '.github/dependabot.yml',
      run: (fs) => {
        const t = fs.read('.github/dependabot.yml');
        if (t === null) return fail('dependabot.yml missing');
        const miss = ['npm', 'github-actions'].filter((e) => !new RegExp(`package-ecosystem:\\s*["']?${e}["']?\\s*$`, 'm').test(t));
        if ((t.match(/^\s*cooldown:/gm) ?? []).length < 2) miss.push('cooldown on both');
        return miss.length ? fail(`missing: ${short(miss)}`) : pass('npm and github-actions, both with cooldown');
      } },
    { id: 'CI-08', area: 'CI', severity: 'high', actor: 'agent', title: '.npmrc: ignore-scripts and save-exact', fix: '.npmrc',
      run: (fs) => {
        const t = fs.read('.npmrc');
        if (t === null) return fail('.npmrc missing');
        const miss = ['ignore-scripts=true', 'save-exact=true'].filter((k) => !t.split('\n').map((l) => l.trim()).includes(k));
        return miss.length ? fail(`missing: ${short(miss)}`) : pass('both set');
      } },
    { id: 'CI-09', area: 'CI', severity: 'low', actor: 'agent', title: 'Scheduled secret scan of the whole history', fix: '.github/workflows/secrets-history.yml',
      run: (fs) => {
        const t = fs.read('.github/workflows/secrets-history.yml');
        return t !== null && triggers(t).includes('schedule') ? pass('scheduled') : fail('secrets-history.yml missing or not scheduled');
      } },

    // --- TEST: test pyramid (lessons 2, 12, 14, 16, 17, 18)
    { id: 'TEST-01', area: 'TEST', severity: 'high', actor: 'agent', title: 'Test commands: unit, db, e2e, a11y, engine matrix, smoke, boot, regression', fix: 'package.json',
      run: (fs) => {
        const s = scriptsOf(fs);
        const miss = ['test', 'test:db', 'test:e2e', 'engine:matrix', 'smoke', 'boot:check', 'verify:regression'].filter((n) => !s.root.has(n));
        if (!s.any.has('test:a11y')) miss.push('test:a11y (a package)');
        return miss.length ? fail(`missing: ${short(miss)}`) : pass('8 test commands');
      } },
    { id: 'TEST-02', area: 'TEST', severity: 'high', actor: 'agent', title: 'Access-boundary matrix, tenant isolation, concurrency, migration round-trip, a11y tests', fix: 'packages/*/tests',
      run: (fs) => needFiles(fs, ['packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts', 'packages/app/tests/e2e/tenant-isolation.e2e.test.ts',
        'packages/db/tests/concurrency.integration.test.ts', 'packages/db/tests/migrations-roundtrip.integration.test.ts', 'packages/ui/tests/a11y.test.tsx']) },
    { id: 'TEST-03', area: 'TEST', severity: 'medium', actor: 'agent', title: 'QA protocol, scenarios index and check:qa', fix: '.ai/qa/, .ai/docs/qa-protocol.md',
      run: (fs) => needScripts(fs, ['check:qa'], ['.ai/qa/README.md', '.ai/qa/INDEX.md', '.ai/docs/qa-protocol.md']) },
    { id: 'TEST-04', area: 'TEST', severity: 'medium', actor: 'agent', title: 'API robustness (fuzz) test', fix: 'packages/app/tests (branch test/api-robustness-fuzz, owner decision on limits)',
      run: (fs) => {
        const hits = fs.dirs('packages').flatMap((p) => fs.walk(`packages/${p}/tests`, 4)).filter((f) => /fuzz|robustness/i.test(f.split('/').pop()));
        return hits.length ? pass(short(hits)) : fail('no test file named *fuzz* or *robustness* under packages/*/tests');
      } },
    { id: 'TEST-05', area: 'TEST', severity: 'low', actor: 'owner', title: 'Mutation testing configured (StrykerJS, lesson 17)', fix: 'spec needs owner approval, then stryker config',
      run: (fs) => {
        const places = ['.', ...fs.dirs('packages').map((p) => `packages/${p}`)];
        const hits = places.flatMap((d) => fs.files(d, (x) => /^stryker\.(conf|config)\./.test(x)).map((x) => `${d}/${x}`));
        return hits.length ? pass(short(hits)) : fail('no stryker.conf.* / stryker.config.*');
      } },
    { id: 'TEST-06', area: 'TEST', severity: 'low', actor: 'agent', title: 'Bundle-size gate (size-limit, lesson 17)', fix: 'package.json, CI',
      run: (fs) => {
        const pkg = scriptsOf(fs).pkg ?? {};
        const dep = { ...pkg.dependencies, ...pkg.devDependencies }['size-limit'];
        const file = ['.', 'packages/app'].flatMap((d) => fs.files(d, (x) => /^\.size-limit\.(json|js|cjs|mjs)$/.test(x)));
        return dep || file.length ? pass(dep ? 'size-limit in package.json' : short(file)) : fail('no size-limit dependency or .size-limit file');
      } },

    // --- SEC: agent and product security (lessons 9, 16, 18)
    { id: 'SEC-01', area: 'SEC', severity: 'high', actor: 'agent', title: 'Deny reading .env and ~/.ssh', fix: '.claude/settings.json (review path)',
      run: (fs) => {
        const s = fs.json('.claude/settings.json');
        if (!s.value) return fail('.claude/settings.json missing or not JSON');
        const deny = (s.value.permissions?.deny ?? []).join(' ');
        const miss = ['.env', '~/.ssh'].filter((x) => !deny.includes(x));
        return miss.length ? fail(`deny lacks ${short(miss)}`) : pass(`${(s.value.permissions?.deny ?? []).length} deny rules`);
      } },
    { id: 'SEC-02', area: 'SEC', severity: 'high', actor: 'agent', title: 'PreToolUse hook on Bash', fix: '.claude/hooks/pre-tool-use.mjs (review path)',
      run: (fs) => hookCheck(fs, (m) => /Bash/.test(m), 'pre-tool-use.mjs') },
    { id: 'SEC-03', area: 'SEC', severity: 'high', actor: 'agent', title: 'CODEOWNERS covers agent and process configuration', fix: '.github/CODEOWNERS (review path)',
      run: (fs) => {
        const t = fs.read('.github/CODEOWNERS');
        if (t === null) return fail('.github/CODEOWNERS missing');
        const owned = new Set(t.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]));
        const miss = ['/.claude/', '/.mcp.json', '/.agents/', '/skills-lock.json', '/AGENTS.md', '/CLAUDE.md', '/.github/', '/scripts/', '/security-notes.md'].filter((p) => !owned.has(p));
        return miss.length ? fail(`not covered: ${short(miss)}`) : pass('9 paths covered');
      } },
    { id: 'SEC-04', area: 'SEC', severity: 'high', actor: 'agent', title: 'enableAllProjectMcpServers is not on', fix: '.claude/settings.json',
      run: (fs) => {
        const s = fs.json('.claude/settings.json');
        if (!s.value) return fail('.claude/settings.json missing or not JSON');
        return s.value.enableAllProjectMcpServers === true ? fail('enableAllProjectMcpServers: true') : pass('off');
      } },
    { id: 'SEC-05', area: 'SEC', severity: 'high', actor: 'agent', title: 'Secret scan with a justified, hash-only allowlist', fix: 'scripts/secret-scan.allowlist.json',
      run: (fs) => {
        const base = needScripts(fs, ['secrets:scan'], ['scripts/secret-scan.mjs']);
        if (base.status === 'FAIL') return base;
        const a = fs.json('scripts/secret-scan.allowlist.json');
        if (!a.value) return fail('scripts/secret-scan.allowlist.json missing or not JSON');
        const entries = Array.isArray(a.value.entries) ? a.value.entries : [];
        const bad = entries.map((e, i) => ({ e, i })).filter(({ e }) => !e || typeof e.reason !== 'string' || !e.reason.trim()
          || !/^[0-9a-f]{64}$/.test(e.valueSha256 ?? '') || 'value' in e).map(({ i }) => `entries[${i}]`);
        return bad.length ? fail(`entry without reason/valueSha256 or with a raw value: ${short(bad)}`) : pass(`${entries.length} allowlist entries, each with reason and hash`);
      } },
    { id: 'SEC-06', area: 'SEC', severity: 'medium', actor: 'agent', title: 'Product threat model and DAST coverage', fix: 'docs/security/',
      run: (fs) => needFiles(fs, ['docs/security/threat-model.md', 'docs/security/dast-coverage.md']) },
    { id: 'SEC-07', area: 'SEC', severity: 'medium', actor: 'agent', title: 'Three-legs rule written down', fix: 'AGENTS.md §9, security-notes.md',
      run: (fs) => {
        const miss = [];
        if (!/trzech nóg|three legs/i.test(fs.read('AGENTS.md') ?? '')) miss.push('AGENTS.md');
        if (!/lethal trifecta/i.test(fs.read('security-notes.md') ?? '')) miss.push('security-notes.md');
        return miss.length ? fail(`rule missing in ${short(miss)}`) : pass('AGENTS.md and security-notes.md');
      } },
    { id: 'SEC-08', area: 'SEC', severity: 'medium', actor: 'owner', title: 'Vulnerability reporting policy (SECURITY.md)', fix: 'owner decision, then SECURITY.md',
      run: (fs) => (['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'].some((p) => fs.read(p) !== null) ? pass('present') : fail('no SECURITY.md')) },

    // --- CTX: agents know what to do and do not burn context (lesson 10)
    { id: 'CTX-01', area: 'CTX', severity: 'high', actor: 'agent', title: 'AGENTS.md within budget', fix: 'AGENTS.md (move detail to .ai/docs)',
      run: (fs) => {
        const t = fs.read('AGENTS.md');
        if (t === null) return fail('AGENTS.md missing');
        const b = bytes(t);
        const msg = `${b} B, ${lines(t)} lines (warn ${BUDGET.agentsWarn} B / ${BUDGET.agentsWarnLines} lines, error ${BUDGET.agentsError} B)`;
        if (b > BUDGET.agentsError) return fail(msg);
        return b > BUDGET.agentsWarn || lines(t) > BUDGET.agentsWarnLines ? partial(msg) : pass(msg);
      } },
    { id: 'CTX-02', area: 'CTX', severity: 'high', actor: 'agent', title: 'Routing table: one block, every path exists', fix: 'AGENTS.md routing block',
      run: (fs) => {
        const t = fs.read('AGENTS.md') ?? '';
        const s = t.split('<!-- routing:start -->');
        if (s.length !== 2 || s[1].split('<!-- routing:end -->').length !== 2) return fail('need exactly one routing:start/routing:end block');
        const paths = referencedPaths(s[1].split('<!-- routing:end -->')[0], 'AGENTS.md');
        const miss = paths.filter((p) => !fs.exists(p));
        if (!paths.length) return fail('routing block names no paths');
        return miss.length ? fail(`missing: ${short(miss)}`) : pass(`${paths.length} paths resolve`);
      } },
    { id: 'CTX-03', area: 'CTX', severity: 'high', actor: 'agent', title: 'Lessons index: complete, no dead links, within budget', fix: '.ai/lessons.md',
      run: (fs) => {
        const t = fs.read('.ai/lessons.md');
        if (t === null) return fail('.ai/lessons.md missing');
        // Only index entries count (same rule as check:context); the format example in the header is not a link.
        const entries = t.split('\n').filter((l) => /^- \[\d{4}-\d{2}-\d{2}\]/.test(l)).join('\n');
        const linked = new Set([...entries.matchAll(/\]\(lessons\/([^)\s]+\.md)\)/g)].map((m) => m[1]));
        const filesIn = fs.files('.ai/lessons', (x) => x.endsWith('.md'));
        const problems = [...filesIn.filter((f) => !linked.has(f)).map((f) => `not indexed: ${f}`),
          ...[...linked].filter((f) => !filesIn.includes(f)).map((f) => `dead link: ${f}`)];
        const b = bytes(t);
        if (b > BUDGET.lessonsError) problems.push(`${b} B over ${BUDGET.lessonsError} B`);
        if (problems.length) return fail(short(problems));
        const msg = `${filesIn.length} lessons indexed, ${b} B (warn ${BUDGET.lessonsWarn}, error ${BUDGET.lessonsError})`;
        return b > BUDGET.lessonsWarn ? partial(msg) : pass(msg);
      } },
    { id: 'CTX-04', area: 'CTX', severity: 'high', actor: 'agent', title: 'Codex chain (root + package AGENTS.md) under 32 KiB', fix: 'packages/*/AGENTS.md',
      run: (fs) => {
        const root = fs.read('AGENTS.md');
        if (root === null) return fail('AGENTS.md missing');
        let worst = { name: 'AGENTS.md', b: bytes(root) };
        for (const p of fs.dirs('packages')) {
          const t = fs.read(`packages/${p}/AGENTS.md`);
          if (t !== null && bytes(root) + bytes(t) > worst.b) worst = { name: `packages/${p}/AGENTS.md`, b: bytes(root) + bytes(t) };
        }
        const msg = `largest chain ${worst.name}: ${worst.b} B (warn ${BUDGET.codexWarn}, error ${BUDGET.codexError})`;
        if (worst.b > BUDGET.codexError) return fail(msg);
        return worst.b > BUDGET.codexWarn ? partial(msg) : pass(msg);
      } },
    { id: 'CTX-05', area: 'CTX', severity: 'medium', actor: 'agent', title: 'CLAUDE.md only imports AGENTS.md (root and packages)', fix: 'CLAUDE.md files',
      run: (fs) => {
        const bad = [];
        if (!(fs.read('CLAUDE.md') ?? '').includes('@AGENTS.md')) bad.push('CLAUDE.md');
        for (const p of fs.dirs('packages')) {
          if (fs.read(`packages/${p}/AGENTS.md`) !== null && !(fs.read(`packages/${p}/CLAUDE.md`) ?? '').includes('@AGENTS.md')) bad.push(`packages/${p}/CLAUDE.md`);
        }
        return bad.length ? fail(`no @AGENTS.md import: ${short(bad)}`) : pass('all import AGENTS.md');
      } },
    { id: 'CTX-06', area: 'CTX', severity: 'medium', actor: 'agent', title: '.ai/docs files under 24 KiB', fix: '.ai/docs/',
      run: (fs) => {
        const docs = fs.files('.ai/docs', (x) => x.endsWith('.md'));
        const big = docs.map((f) => ({ f, b: bytes(fs.read(`.ai/docs/${f}`) ?? '') })).filter((d) => d.b > BUDGET.routedDoc).map((d) => `${d.f} ${d.b} B`);
        return big.length ? fail(`over ${BUDGET.routedDoc} B: ${short(big)}`) : pass(`${docs.length} docs within budget`);
      } },
    { id: 'CTX-07', area: 'CTX', severity: 'medium', actor: 'agent', title: 'Playbook is routed from CONTRIBUTING, not loaded every session', fix: 'CONTRIBUTING.md, AGENTS.md',
      run: (fs) => {
        const bad = ['AGENTS.md', 'CLAUDE.md'].filter((f) => (fs.read(f) ?? '').includes('process-playbook'));
        if (!(fs.read('CONTRIBUTING.md') ?? '').includes(PLAYBOOK)) bad.push(`CONTRIBUTING.md does not route to ${PLAYBOOK}`);
        return bad.length ? fail(short(bad)) : pass('routed from CONTRIBUTING.md only');
      } },
    { id: 'CTX-08', area: 'CTX', severity: 'low', actor: 'agent', title: 'Active specs small enough to read (split oversized ones)', fix: '.ai/specs/ (split into phase specs)',
      run: (fs) => {
        const specs = fs.files('.ai/specs', (x) => x.endsWith('.md') && !['product-brief.md', 'backlog.md'].includes(x));
        const big = specs.map((f) => ({ f, b: bytes(fs.read(`.ai/specs/${f}`) ?? '') })).filter((d) => d.b > BUDGET.activeSpec).map((d) => `${d.f} ${d.b} B`);
        return big.length ? partial(`${big.length} over ${BUDGET.activeSpec} B: ${short(big)}`) : pass(`${specs.length} active specs within budget`);
      } },
    { id: 'CTX-09', area: 'CTX', severity: 'medium', actor: 'agent', title: 'Paths named in the playbook and the human doc exist', fix: `${PLAYBOOK}, ${HUMAN_DOC}`,
      run: (fs) => {
        const miss = [];
        let n = 0;
        for (const doc of [PLAYBOOK, HUMAN_DOC]) {
          const t = fs.read(doc);
          if (t === null) continue;
          for (const p of referencedPaths(t, doc)) {
            n++;
            if (!fs.exists(p)) miss.push(`${doc} -> ${p}`);
          }
        }
        return miss.length ? fail(`missing: ${short(miss)}`) : pass(`${n} references resolve`);
      } },

    // --- REL: release management (lesson 22)
    { id: 'REL-01', area: 'REL', severity: 'medium', actor: 'agent', title: 'Release docs: RELEASING, CHANGELOG [Unreleased], UPGRADE_NOTES', fix: 'docs/RELEASING.md, CHANGELOG.md',
      run: (fs) => {
        const r = needFiles(fs, ['docs/RELEASING.md', 'UPGRADE_NOTES.md']);
        if (r.status === 'FAIL') return r;
        return (fs.read('CHANGELOG.md') ?? '').includes('## [Unreleased]') ? pass('present') : fail('CHANGELOG.md has no ## [Unreleased]');
      } },
    { id: 'REL-02', area: 'REL', severity: 'medium', actor: 'agent', title: 'Release scripts', fix: 'scripts/, package.json',
      run: (fs) => needScripts(fs, ['release:version', 'release:notes'], ['scripts/release-version.mjs', 'scripts/release-notes.mjs']) },
    { id: 'REL-03', area: 'REL', severity: 'high', actor: 'agent', title: 'release.yml: manual only, in the release environment', fix: '.github/workflows/release.yml (review path)',
      run: (fs) => {
        const t = fs.read('.github/workflows/release.yml');
        if (t === null) return fail('release.yml missing');
        const on = triggers(t);
        const bad = [];
        if (!on.includes('workflow_dispatch')) bad.push('no workflow_dispatch');
        const auto = on.filter((x) => x !== 'workflow_dispatch');
        if (auto.length) bad.push(`automatic trigger(s): ${auto.join(', ')}`);
        if (!/^\s+environment:\s*release\s*$/m.test(t)) bad.push('no environment: release');
        return bad.length ? fail(short(bad)) : pass('workflow_dispatch only, environment release');
      } },
    { id: 'REL-04', area: 'REL', severity: 'medium', actor: 'owner', title: 'Recovery drill from a tag recorded', fix: 'owner: trial instance, then .ai/runs/<date>-recovery-drill.md (docs/RELEASING.md §12)',
      run: (fs) => {
        const hits = fs.files('.ai/runs', (x) => /recovery-drill/.test(x));
        return hits.length ? pass(short(hits)) : fail('no .ai/runs/*recovery-drill*.md');
      } },

    // --- OPS: deployment and continuity (lessons 11, 22; E11)
    { id: 'OPS-01', area: 'OPS', severity: 'high', actor: 'agent', title: 'Container build and compose', fix: 'Dockerfile, docker-compose.yml',
      run: (fs) => needFiles(fs, ['Dockerfile', 'docker-compose.yml', '.dockerignore', '.env.example']) },
    { id: 'OPS-02', area: 'OPS', severity: 'medium', actor: 'agent', title: 'Base images pinned by digest', fix: 'Dockerfile',
      run: (fs) => {
        const t = fs.read('Dockerfile');
        if (t === null) return fail('Dockerfile missing');
        const args = new Map([...t.matchAll(/^ARG\s+(\w+)=(\S+)/gm)].map((m) => [m[1], m[2]]));
        const stages = new Set();
        const bad = [];
        for (const m of t.matchAll(/^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/gim)) {
          const ref = m[1].replace(/^\$\{?(\w+)\}?$/, (_, n) => args.get(n) ?? m[1]);
          if (!stages.has(m[1]) && !ref.includes('@sha256:')) bad.push(m[1]);
          if (m[2]) stages.add(m[2]);
        }
        return bad.length ? fail(`not pinned: ${short(bad)}`) : pass('all external bases pinned');
      } },
    { id: 'OPS-03', area: 'OPS', severity: 'high', actor: 'agent', title: 'Deployment runbook with rollback, operations, continuity', fix: 'docs/',
      run: (fs) => {
        const r = needFiles(fs, ['docs/DEPLOYMENT.md', 'docs/OPERATIONS.md', 'docs/CONTINUITY.md']);
        if (r.status === 'FAIL') return r;
        return /^#{2,3} .*(ROLLBACK|wycofanie)/im.test(fs.read('docs/DEPLOYMENT.md')) ? pass('rollback section present') : fail('docs/DEPLOYMENT.md has no rollback section');
      } },

    // --- PROD: product basics (course final-project checklist)
    { id: 'PROD-01', area: 'PROD', severity: 'medium', actor: 'agent', title: 'README, product concept, brief, backlog', fix: 'README.md, docs/, .ai/specs/',
      run: (fs) => needFiles(fs, ['README.md', 'docs/PRODUCT_CONCEPT.md', '.ai/specs/product-brief.md', '.ai/specs/backlog.md']) },
    { id: 'PROD-02', area: 'PROD', severity: 'medium', actor: 'owner', title: 'LICENSE chosen', fix: 'owner decision (CONTRIBUTING.md)',
      run: (fs) => (['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'].some((p) => fs.read(p) !== null) ? pass('present') : fail('no LICENSE file')) }
  ];
}

function hookCheck(fs, matcherOk, script) {
  const s = fs.json('.claude/settings.json');
  if (!s.value) return fail('.claude/settings.json missing or not JSON');
  const wired = (s.value.hooks?.PreToolUse ?? []).some((h) => matcherOk(h.matcher ?? '') && (h.hooks ?? []).some((x) => String(x.command ?? '').includes(script)));
  const file = fs.read(`.claude/hooks/${script}`) !== null;
  if (wired && file) return pass(`${script} wired in PreToolUse`);
  return fail([!wired && `${script} not wired in PreToolUse`, !file && `.claude/hooks/${script} missing`].filter(Boolean).join('; '));
}

/** GitHub-side checks: the executor or the owner runs the command (all GET) and compares with `expect`. */
function manualChecks(slug) {
  const api = (p) => `gh api repos/${slug}${p}`;
  return [
    { id: 'GH-01', area: 'GH', severity: 'high', actor: 'owner', title: 'Branch protection: required checks on main', command: `${api('/branches/main/protection')} --jq '.required_status_checks.contexts'`,
      expect: 'includes lint, unit, build, database, e2e, secrets; analyze (CodeQL) and image after the owner decides' },
    { id: 'GH-02', area: 'GH', severity: 'high', actor: 'owner', title: 'Branch protection: admins, conversations, force-push, deletion', command: `${api('/branches/main/protection')} --jq '{admins: .enforce_admins.enabled, conversations: .required_conversation_resolution.enabled, force: .allow_force_pushes.enabled, deletions: .allow_deletions.enabled}'`,
      expect: 'admins true, conversations true, force false, deletions false' },
    { id: 'GH-03', area: 'GH', severity: 'high', actor: 'owner', title: 'Secret scanning and push protection', command: `${api('')} --jq '.security_and_analysis'`,
      expect: 'secret_scanning and secret_scanning_push_protection status "enabled"' },
    { id: 'GH-04', area: 'GH', severity: 'medium', actor: 'owner', title: 'Dependabot alerts', command: `${api('/vulnerability-alerts')} --silent`,
      expect: 'exit 0 (HTTP 204) = enabled; HTTP 404 = disabled' },
    { id: 'GH-05', area: 'GH', severity: 'medium', actor: 'owner', title: 'Private vulnerability reporting', command: `${api('/private-vulnerability-reporting')} --jq '.enabled'`,
      expect: 'true' },
    { id: 'GH-06', area: 'GH', severity: 'medium', actor: 'owner', title: 'Environment release exists (branch rule main)', command: `${api('/environments')} --jq '[.environments[].name]'`,
      expect: 'contains "release" with a deployment branch policy for main' },
    { id: 'GH-07', area: 'GH', severity: 'high', actor: 'agent', title: 'No open code-scanning alerts', command: `gh api 'repos/${slug}/code-scanning/alerts?state=open&per_page=100' --jq 'length'`,
      expect: '0 (each alert: fix red-first or dismiss with a reason the owner accepts)' },
    { id: 'GH-08', area: 'GH', severity: 'high', actor: 'agent', title: 'WIP limit: at most 3 open non-draft PRs', command: `gh pr list --repo ${slug} --state open --json number,isDraft --jq 'map(select(.isDraft | not)) | length'`,
      expect: '<= 3 (default); a waiver is temporary and counts only when the owner granted it explicitly in the current conversation' },
    { id: 'GH-09', area: 'GH', severity: 'high', actor: 'agent', title: 'Latest CI on main is green', command: `gh run list --repo ${slug} --branch main --limit 10 --json workflowName,conclusion,headSha`,
      expect: 'conclusion "success" for CI and CodeQL on the newest headSha' },
    { id: 'GH-10', area: 'GH', severity: 'low', actor: 'owner', title: 'Releases and tags', command: `gh release list --repo ${slug} --limit 5`,
      expect: 'a release exists once the owner decides on the first version (docs/RELEASING.md §11)' }
  ];
}

/** Runs every check on `root`. Never throws on missing or unreadable-as-file paths. */
export function runAudit(root = REPO, { repo = DEFAULT_SLUG } = {}) {
  const fs = makeFs(resolve(root));
  const results = [];
  for (const c of checks()) {
    const { run, ...meta } = c;
    results.push({ ...meta, ...run(fs) });
  }
  for (const m of manualChecks(repo)) results.push({ ...m, status: 'MANUAL', evidence: `run the command; expected: ${m.expect}` });
  const summary = { PASS: 0, FAIL: 0, PARTIAL: 0, MANUAL: 0 };
  for (const r of results) summary[r.status]++;
  return { summary, results };
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function formatTable({ summary, results }) {
  const out = ['| ID      | Status  | Sev    | Actor | Check | Evidence |', '|---|---|---|---|---|---|'];
  for (const r of results.filter((x) => x.status !== 'MANUAL')) {
    out.push(`| ${r.id.padEnd(7)} | ${r.status.padEnd(7)} | ${r.severity.padEnd(6)} | ${r.actor} | ${cell(r.title)} | ${cell(r.evidence)} |`);
  }
  out.push('', 'MANUAL (read-only commands; the result is evidence for the report):');
  for (const r of results.filter((x) => x.status === 'MANUAL')) out.push(`- ${r.id} ${r.title}\n    ${r.command}\n    expected: ${r.expect}`);
  out.push('', `process-audit: PASS ${summary.PASS}, FAIL ${summary.FAIL}, PARTIAL ${summary.PARTIAL}, MANUAL ${summary.MANUAL}`);
  return out.join('\n');
}

const USAGE = 'usage: node scripts/process-audit.mjs [--json] [--root <dir>] [--repo <owner/name>]';
export function main(argv = process.argv.slice(2), out = console) {
  let root = REPO;
  let repo = DEFAULT_SLUG;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--root' || a === '--repo') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) {
        out.error(USAGE);
        return 2;
      }
      if (a === '--root') root = resolve(v);
      else repo = v;
    } else {
      out.error(USAGE);
      return 2;
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    out.error(`${USAGE}\n--repo must be owner/name`);
    return 2;
  }
  const report = runAudit(root, { repo });
  out.log(json ? JSON.stringify({ root: relative(process.cwd(), root) || '.', ...report }, null, 2) : formatTable(report));
  return report.summary.FAIL > 0 ? 1 : 0;
}

/** Fail closed (lesson 2026-11-05-script-main-guard-vs-paths): on any doubt about how we were started, run main(). */
function startedDirectly() {
  try {
    return !process.argv[1] || import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return true;
  }
}

if (startedDirectly()) process.exitCode = main();
