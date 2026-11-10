import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runAudit } from '../../../scripts/process-audit.mjs';

/**
 * `npm run audit:process` (.ai/docs/process-playbook.md): the executor's gap finder and progress meter. It checks only
 * what the repository itself proves, offline; GitHub settings are MANUAL items with a read-only `gh` command. The
 * checks are not tuned to the real repository: a FAIL there is a finding, so the tests below use fixtures.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/process-audit.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const SHA = 'a'.repeat(40);
const checkout = `      - uses: actions/checkout@${SHA} # v7.0.1\n        with:\n          persist-credentials: false\n`;
const job = (name: string, body = '') => `  ${name}:\n    runs-on: ubuntu-24.04\n    steps:\n${checkout}${body}`;
const PROMPT = '<!-- start-prompt:start -->\n```\nPrzeczytaj .ai/docs/process-playbook.md i wykonaj go.\n```\n<!-- start-prompt:end -->\n';

/** A small repository that satisfies every automatic check. Tests change one thing and expect one finding. */
function good(): Record<string, string> {
  return {
    'AGENTS.md': '# AGENTS\n<!-- routing:start -->\n| Zadanie | Czytaj |\n|---|---|\n| start | `.ai/lessons.md` |\n<!-- routing:end -->\n\n- W każdym przebiegu agenta musi brakować jednej z trzech nóg: dostępu do danych prywatnych, kontaktu z niezaufaną treścią albo wyjścia na zewnątrz.\n',
    'CLAUDE.md': '# CLAUDE.md\n\n@AGENTS.md\n',
    'SDLC.md': 'Labels: review, changes-requested, merge-queue, needs-qa, qa-approved, risk-high, do-not-merge.\n',
    'CODE_REVIEW.md': '# Review\n',
    'CONTRIBUTING.md': '- Proces: [docs/PROCES_I_KURS.md](docs/PROCES_I_KURS.md), wykonawca: [.ai/docs/process-playbook.md](.ai/docs/process-playbook.md)\n',
    'BACKWARD_COMPATIBILITY.md': '# BC\n',
    'UPGRADE_NOTES.md': '# Upgrade\n',
    'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n',
    'security-notes.md': '# Notes\n\n## 1. Which leg of the *lethal trifecta* we cut\n',
    'README.md': '# Readme\n',
    'LICENSE': 'MIT\n',
    'SECURITY.md': '# Security policy\n',
    '.npmrc': 'save-exact=true\nignore-scripts=true\n',
    '.env.example': 'DATABASE_URL=\n',
    '.dockerignore': 'node_modules\n',
    'Dockerfile': 'ARG NODE_IMAGE=node:22-slim@sha256:' + 'b'.repeat(64) + '\nFROM ${NODE_IMAGE} AS base\nFROM base AS runtime\n',
    'docker-compose.yml': 'services: {}\n',
    'package.json': JSON.stringify({ name: 'x', scripts: Object.fromEntries(['test', 'test:db', 'test:e2e', 'engine:matrix', 'smoke', 'boot:check',
      'verify:regression', 'review:pack', 'review:validate', 'release:version', 'release:notes', 'secrets:scan', 'audit:gate', 'check:context',
      'check:qa', 'check:routes', 'check:boundaries', 'audit:process', 'size'].map((s) => [s, 'node x'])), devDependencies: { 'size-limit': '11.0.0' } }, null, 2),
    'packages/ui/package.json': JSON.stringify({ name: '@x/ui', scripts: { 'test:a11y': 'vitest' } }),
    'packages/app/AGENTS.md': '# app\n',
    'packages/app/CLAUDE.md': '@AGENTS.md\n',
    'packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts': '',
    'packages/app/tests/e2e/tenant-isolation.e2e.test.ts': '',
    'packages/app/tests/e2e/api-fuzz.e2e.test.ts': "import { it } from 'vitest';\nit('rejects junk', async () => { await fetch(`${base}/api/v1/menu`, { method: 'POST', body: junk }); });\n",
    'packages/testkit/tests/spec-status-guard.test.ts': '', 'packages/testkit/tests/agent-guardrails.test.ts': '',
    '.ai/specs/2026-01-02-doing-thing.md': '---\nstatus: in-progress\n---\n',
    '.ai/runs/2026-01-03-doing-thing-f1.md': '---\nstarted: 2026-01-03 10:00\noutcome: partial\nspec: .ai/specs/2026-01-02-doing-thing.md\n---\n',
    'packages/db/tests/concurrency.integration.test.ts': '',
    'packages/db/tests/migrations-roundtrip.integration.test.ts': '',
    'packages/ui/tests/a11y.test.tsx': '',
    'stryker.config.json': '{}\n',
    'scripts/review-pack.mjs': '', 'scripts/review-validate.mjs': '', 'scripts/verify-regression.mjs': '',
    'scripts/release-version.mjs': '', 'scripts/release-notes.mjs': '', 'scripts/secret-scan.mjs': '', 'scripts/process-audit.mjs': '',
    'scripts/secret-scan.allowlist.json': JSON.stringify({ entries: [{ file: 'a.md', pattern: 'p', valueSha256: 'c'.repeat(64), reason: 'example' }] }),
    '.ai/agentic.config.json': '{}\n',
    '.ai/lessons.md': '# Lekcje\n\nFormat: `- [YYYY-MM-DD] [tytuł](lessons/YYYY-MM-DD-slug.md) — reguła`\n\n- [2026-01-01] [A](lessons/2026-01-01-a-rule.md) — reguła\n',
    '.ai/lessons/2026-01-01-a-rule.md': '# A\n',
    '.ai/runs/2026-01-01-first-run.md': '---\nstarted: 2026-01-01 10:00\noutcome: success\n---\n',
    '.ai/runs/2026-01-02-recovery-drill.md': '---\nstarted: 2026-01-02 10:00\noutcome: success\n---\n',
    '.ai/specs/product-brief.md': '# Brief\n',
    '.ai/specs/backlog.md': '# Backlog\n',
    '.ai/specs/2026-01-01-active-thing.md': '---\nstatus: draft\n---\n',
    '.ai/specs/implemented/2026-01-01-done-thing.md': '---\nstatus: implemented\n---\n',
    '.ai/specs/archive/2026-01-01-old-thing.md': '---\nstatus: superseded\nsuperseded_by: x\n---\n',
    '.ai/docs/process-templates.md': '# T\n', '.ai/docs/review-protocol.md': '# R\n', '.ai/docs/review-checklists.md': '# C\n',
    '.ai/docs/fix-verification.md': '# F\n', '.ai/docs/nightly-review-routine.md': '# N\n', '.ai/docs/qa-protocol.md': '# Q\n',
    '.ai/docs/process-playbook.md': `# Playbook\n\n${PROMPT}\nPętla: \`npm run audit:process\`, protokół \`.ai/docs/review-protocol.md\`, katalog \`.ai/runs/\`.\n`,
    '.ai/schemas/review-input.schema.json': '{}', '.ai/schemas/review-output.schema.json': '{}',
    '.ai/qa/README.md': '# QA\n', '.ai/qa/INDEX.md': '# Index\n',
    'docs/PROCES_I_KURS.md': `# Proces\n\n${PROMPT}\nZobacz [playbook](../.ai/docs/process-playbook.md) i \`SDLC.md\`.\n`,
    'docs/RELEASING.md': '# R\n', 'docs/OPERATIONS.md': '# O\n', 'docs/CONTINUITY.md': '# C\n', 'docs/PRODUCT_CONCEPT.md': '# P\n',
    'docs/DEPLOYMENT.md': '# D\n\n## 10. ROLLBACK (wycofanie)\n',
    'docs/security/threat-model.md': '# T\n', 'docs/security/dast-coverage.md': '# D\n',
    '.github/CODEOWNERS': ['/.claude/', '/.mcp.json', '/.agents/', '/skills-lock.json', '/AGENTS.md', '/CLAUDE.md', '/.github/', '/scripts/', '/security-notes.md']
      .map((p) => `${p} @owner`).join('\n') + '\n',
    '.github/pull_request_template.md': '## Cel\n',
    '.github/dependabot.yml': 'version: 2\nupdates:\n  - package-ecosystem: npm\n    cooldown:\n      default-days: 14\n  - package-ecosystem: github-actions\n    cooldown:\n      default-days: 14\n',
    '.github/workflows/ci.yml': 'on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n'
      + job('lint', ['check:boundaries', 'check:qa', 'check:routes', 'audit:gate', 'check:context'].map((s) => `      - run: npm run ${s}\n`).join('') + '      - run: npm run typecheck\n')
      + ['secrets', 'design', 'unit', 'a11y', 'build', 'database', 'e2e'].map((j) => job(j)).join('')
      + job('image', `      - run: docker run --rm hadolint/hadolint:v2.12.0@sha256:${'d'.repeat(64)} hadolint -\n`),
    '.github/workflows/codeql.yml': 'on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n' + job('analyze', `      - uses: github/codeql-action/init@${SHA} # v4.39.1\n`),
    '.github/workflows/release.yml': 'on:\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n' + job('verify') + '  release:\n    environment: release\n    runs-on: ubuntu-24.04\n    steps:\n' + checkout,
    '.github/workflows/secrets-history.yml': 'on:\n  schedule:\n    - cron: "0 3 * * 1"\npermissions:\n  contents: read\njobs:\n' + job('history'),
    '.claude/hooks/pre-tool-use.mjs': '', '.claude/hooks/spec-status-guard.mjs': '',
    '.claude/settings.json': JSON.stringify({
      permissions: { ask: ['Bash(gh pr merge)', 'Bash(gh pr merge *)'], deny: ['Read(**/.env)', 'Read(~/.ssh/**)'] },
      hooks: { PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-tool-use.mjs' }] },
        { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/spec-status-guard.mjs' }] }
      ] }
    }, null, 2)
  };
}

function repo(files: Record<string, string | null>) {
  const root = mkdtempSync(join(tmpdir(), 'process audit ł% '));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

type Result = { id: string; status: string; evidence: string; command?: string; severity: string; area: string; actor: string };
const audit = (files: Record<string, string | null>) => runAudit(repo(files)).results as Result[];
const byId = (results: Result[], id: string) => {
  const r = results.find((x) => x.id === id);
  if (!r) throw new Error(`no check ${id}`);
  return r;
};
const with_ = (changes: Record<string, string | null>) => ({ ...good(), ...changes });
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('process-audit on a repository that meets every rule', () => {
  it('passes every automatic check and lists GitHub settings as MANUAL with a read-only gh command', () => {
    const results = audit(good());
    const notPassing = results.filter((r) => r.status !== 'PASS' && r.status !== 'MANUAL').map((r) => `${r.id}: ${r.status} ${r.evidence}`);
    expect(notPassing).toEqual([]);
    const manual = results.filter((r) => r.status === 'MANUAL');
    expect(manual.length).toBeGreaterThanOrEqual(8);
    for (const m of manual) {
      expect(m.command, m.id).toMatch(/^gh /);
      expect(m.command, m.id).not.toMatch(/\s(-X|--method|-f|-F|--field|--raw-field|--input)\s/);
    }
  });

  it('gives every check a unique id, an area, a severity and an actor', () => {
    const results = audit(good());
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length);
    for (const r of results) {
      expect(['PASS', 'FAIL', 'PARTIAL', 'MANUAL']).toContain(r.status);
      expect(['high', 'medium', 'low']).toContain(r.severity);
      expect(['agent', 'owner']).toContain(r.actor);
      expect(r.area).toMatch(/^[A-Z]+$/);
    }
  });
});

describe('process-audit finds one gap at a time', () => {
  it('flags an action that is not pinned by a full SHA, with file and line', () => {
    const files = good();
    files['.github/workflows/codeql.yml'] = files['.github/workflows/codeql.yml'].replace(`init@${SHA} # v4.39.1`, 'init@v4');
    const r = byId(audit(files), 'CI-04');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toMatch(/codeql\.yml:\d+/);
  });

  it('flags a missing CI job by name', () => {
    const files = good();
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace('  e2e:\n', '  e2e-later:\n');
    const r = byId(audit(files), 'CI-01');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('e2e');
  });

  it('flags a CODEOWNERS file that does not cover scripts/', () => {
    const files = good();
    files['.github/CODEOWNERS'] = files['.github/CODEOWNERS'].replace('/scripts/ @owner\n', '');
    const r = byId(audit(files), 'SEC-03');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('/scripts/');
  });

  it('flags a lesson that is not in the index and an index link to a missing lesson', () => {
    const r = byId(audit(with_({ '.ai/lessons/2026-01-02-b-rule.md': '# B\n', '.ai/lessons.md': '- [2026-01-01] [A](lessons/2026-01-01-a-rule.md) — x\n- [2026-01-03] [C](lessons/2026-01-03-c-rule.md) — y\n' })), 'CTX-03');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('2026-01-02-b-rule.md');
    expect(r.evidence).toContain('2026-01-03-c-rule.md');
  });

  it('flags a specification whose status does not match its folder', () => {
    const r = byId(audit(with_({ '.ai/specs/implemented/2026-01-02-not-done.md': '---\nstatus: approved\n---\n' })), 'PROC-03');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('2026-01-02-not-done.md');
  });

  it('fails when AGENTS.md routes to the playbook (it must not be loaded in every session)', () => {
    const files = good();
    files['AGENTS.md'] += 'Proces: `.ai/docs/process-playbook.md`.\n';
    expect(byId(audit(files), 'CTX-07').status).toBe('FAIL');
  });

  it('fails when the playbook or the human document names a path that does not exist', () => {
    const files = good();
    files['.ai/docs/process-playbook.md'] += 'Zobacz `scripts/does-not-exist.mjs` i [x](../../docs/MISSING.md).\n';
    const r = byId(audit(files), 'CTX-09');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('scripts/does-not-exist.mjs');
    expect(r.evidence).toContain('docs/MISSING.md');
  });

  it('fails when the START PROMPT in the playbook and in the human document differ', () => {
    const files = good();
    files['docs/PROCES_I_KURS.md'] = files['docs/PROCES_I_KURS.md'].replace('wykonaj go', 'zrób coś innego');
    expect(byId(audit(files), 'PROC-07').status).toBe('FAIL');
  });

  it('marks AGENTS.md over the warning budget PARTIAL and over the error budget FAIL', () => {
    const pad = (n: number) => good()['AGENTS.md'] + 'x'.repeat(n) + '\n';
    expect(byId(audit(with_({ 'AGENTS.md': pad(24_000) })), 'CTX-01').status).toBe('PARTIAL');
    expect(byId(audit(with_({ 'AGENTS.md': pad(28_000) })), 'CTX-01').status).toBe('FAIL');
  });

  it('marks an oversized active specification PARTIAL (split it), not FAIL', () => {
    const r = byId(audit(with_({ '.ai/specs/2026-01-03-huge-thing.md': '---\nstatus: approved\n---\n' + 'y'.repeat(41_000) })), 'CTX-08');
    expect(r.status).toBe('PARTIAL');
    expect(r.evidence).toContain('2026-01-03-huge-thing.md');
  });

  it('flags missing owner-only artefacts as FAIL with actor owner', () => {
    const r = byId(audit(with_({ LICENSE: null })), 'PROD-02');
    expect(r.status).toBe('FAIL');
    expect(r.actor).toBe('owner');
  });

  it('treats a directory where a file is expected as missing, without throwing', () => {
    const files = with_({ LICENSE: null });
    const root = repo(files);
    mkdirSync(join(root, 'LICENSE'));
    expect(byId(runAudit(root).results as Result[], 'PROD-02').status).toBe('FAIL');
  });

  it('flags a release workflow that can run on push', () => {
    const files = good();
    files['.github/workflows/release.yml'] = files['.github/workflows/release.yml'].replace('on:\n  workflow_dispatch:\n', 'on:\n  workflow_dispatch:\n  push:\n');
    expect(byId(audit(files), 'REL-03').status).toBe('FAIL');
  });

  it('CI-02 ignores a commented-out gate', () => {
    const files = good();
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace('      - run: npm run audit:gate\n', '      # - run: npm run audit:gate\n');
    const r = byId(audit(files), 'CI-02');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('audit:gate');
  });

  it('CI-02 does not count a gate that runs in another job', () => {
    const files = good();
    const ci = files['.github/workflows/ci.yml'].replace('      - run: npm run check:routes\n', '');
    files['.github/workflows/ci.yml'] = ci.replace('  secrets:\n    runs-on: ubuntu-24.04\n    steps:\n', '  secrets:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm run check:routes\n');
    const r = byId(audit(files), 'CI-02');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('check:routes');
  });

  it('CI-06 checks each checkout step, not a count of persist-credentials lines', () => {
    const files = good();
    const bare = `      - uses: actions/checkout@${SHA} # v7.0.1\n`;
    // the second checkout has no `with:`; a stray persist-credentials line elsewhere keeps the counts equal
    files['.github/workflows/secrets-history.yml'] += bare + '      - run: echo x\n        env:\n          persist-credentials: false\n';
    const r = byId(audit(files), 'CI-06');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toMatch(/secrets-history\.yml:\d+/);
  });

  it('TEST-04 does not pass on an empty file whose name contains fuzz', () => {
    const r = byId(audit(with_({ 'packages/app/tests/e2e/api-fuzz.e2e.test.ts': '' })), 'TEST-04');
    expect(r.status).toBe('FAIL');
  });

  it('SEC-07 needs the three legs named in one AGENTS.md rule and a lethal trifecta heading', () => {
    const files = good();
    files['AGENTS.md'] = files['AGENTS.md'].replace(': dostępu do danych prywatnych, kontaktu z niezaufaną treścią albo wyjścia na zewnątrz', '');
    expect(byId(audit(files), 'SEC-07').status).toBe('FAIL');
    expect(byId(audit(with_({ 'security-notes.md': 'We mention the lethal trifecta in passing.\n' })), 'SEC-07').status).toBe('FAIL');
  });

  it('PROC-06 fails for an in-progress spec that no run log names', () => {
    const r = byId(audit(with_({ '.ai/specs/2026-01-04-orphan-work.md': '---\nstatus: in-progress\n---\n' })), 'PROC-06');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toContain('2026-01-04-orphan-work.md');
  });

  it('PROC-04 and SEC-02 need the hook test as well as the wiring', () => {
    expect(byId(audit(with_({ 'packages/testkit/tests/spec-status-guard.test.ts': null })), 'PROC-04').status).toBe('FAIL');
    expect(byId(audit(with_({ 'packages/testkit/tests/agent-guardrails.test.ts': null })), 'SEC-02').status).toBe('FAIL');
  });

  it('GH-08 counts open PRs the way parallel-work.md §1 does: non-draft, without type-M dependency PRs', () => {
    const r = byId(audit(good()), 'GH-08');
    expect(r.command).toContain('isDraft');
    expect(r.command).toContain('dependencies');
  });

  it('flags a secret-scan allowlist entry without a reason or with the raw value', () => {
    const r = byId(audit(with_({ 'scripts/secret-scan.allowlist.json': JSON.stringify({ entries: [{ file: 'a', pattern: 'p', value: 'hunter2' }] }) })), 'SEC-05');
    expect(r.status).toBe('FAIL');
    expect(r.evidence).not.toContain('hunter2');
  });
});

describe('process-audit command line', () => {
  it('on an empty directory: FAILs instead of throwing and exits 1', () => {
    const root = repo({});
    const res = run('--root', root);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('PROC-01');
    expect(res.stderr).toBe('');
  });

  it('exits 0 on a good repository and prints a table with a summary line', () => {
    const res = run('--root', repo(good()));
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/\| ID +\| Status/);
    expect(res.stdout).toMatch(/PASS \d+, FAIL 0, PARTIAL 0, MANUAL \d+/);
  });

  it('--json prints machine-readable results with the same exit code', () => {
    const res = run('--root', repo(with_({ LICENSE: null })), '--json');
    expect(res.status).toBe(1);
    const data = JSON.parse(res.stdout);
    expect(data.summary.FAIL).toBeGreaterThanOrEqual(1);
    expect(data.results.find((r: Result) => r.id === 'PROD-02').status).toBe('FAIL');
  });

  it('rejects unknown flags and a --root without a value with exit 2', () => {
    expect(run('--bogus').status).toBe(2);
    expect(run('--root').status).toBe(2);
  });

  it('runs on this repository: every result is well formed and the exit code follows FAIL', () => {
    const res = run('--root', REPO, '--json');
    const data = JSON.parse(res.stdout);
    expect(data.results.length).toBeGreaterThan(40);
    expect(res.status).toBe(data.summary.FAIL > 0 ? 1 : 0);
    for (const r of data.results as Result[]) expect(r.evidence.length, r.id).toBeGreaterThan(0);
  });
});
