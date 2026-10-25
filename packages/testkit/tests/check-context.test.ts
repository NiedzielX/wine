import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Spec 2026-10-25-context-engineering, R4–R5 and R9. Every check runs on a temporary tree, never on the repository,
 * with one test for the repository itself at the end.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/check-context.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

type Files = Record<string, string>;

const ROUTING = (rows: string) => `<!-- routing:start -->\n| Task | Read |\n|---|---|\n${rows}\n<!-- routing:end -->`;
const DEFAULT_ROW = '| every task | `.ai/lessons.md`, `.ai/docs/commands.md` |';

function validTree(): Files {
  return {
    'AGENTS.md': `# AGENTS\n\n${ROUTING(DEFAULT_ROW)}\n`,
    'CLAUDE.md': '# CLAUDE.md\n\n@AGENTS.md\n\nClaude-specific.\n',
    'packages/core/AGENTS.md': '# core\n',
    'packages/core/CLAUDE.md': '# CLAUDE.md\n\n@AGENTS.md\n',
    '.ai/lessons.md': '# Lessons\n\n- [2026-01-01] [A](lessons/2026-01-01-a.md) — rule.\n',
    '.ai/lessons/2026-01-01-a.md': '# A\n',
    '.ai/docs/commands.md': '# Commands\n',
    '.claude/skills/demo/SKILL.md': '---\nname: demo\ndescription: Use when the demo is needed.\n---\n\n# Demo\n'
  };
}

let dir: string;
let counter = 0;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'check-context-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

function run(files: Files) {
  const root = join(dir, `t${counter++}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const r = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-context', () => {
  it('passes a valid tree', () => {
    const r = run(validTree());
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 error(s)');
  });

  it('passes with warnings only (over the warning size, under the error size)', () => {
    const files = validTree();
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(DEFAULT_ROW)}\n${'x'.repeat(11_000)}\n`;
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toContain('warning  AGENTS.md');
  });

  it('fails when the root AGENTS.md is over the byte budget', () => {
    const files = validTree();
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(DEFAULT_ROW)}\n${'x'.repeat(13_000)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/ERROR {2}AGENTS\.md: \d+ B exceeds/);
  });

  it('fails when the root AGENTS.md has too many lines', () => {
    const files = validTree();
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(DEFAULT_ROW)}\n${'a\n'.repeat(210)}`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/lines exceed the 200 line limit/);
  });

  it('fails when a routing path does not exist', () => {
    const files = validTree();
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(`${DEFAULT_ROW}\n| engine | \`docs/NOPE.md\` |`)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('path not found: docs/NOPE.md');
  });

  it('ignores commands, globs and placeholders in routing cells', () => {
    const files = validTree();
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(`${DEFAULT_ROW}\n| run | \`npm run lint\`, \`packages/*/AGENTS.md\`, \`.ai/specs/<slug>.md\` |`)}\n`;
    expect(run(files).code).toBe(0);
  });

  it('fails when the routing block is missing or empty', () => {
    const missing = validTree();
    missing['AGENTS.md'] = '# AGENTS\n';
    expect(run(missing).out).toContain('routing block missing');
    const empty = validTree();
    empty['AGENTS.md'] = `# AGENTS\n\n${ROUTING('')}\n`;
    const r = run(empty);
    expect(r.code).toBe(1);
    expect(r.out).toContain('routing block has no rows');
  });

  it('fails when the chain of a routing row is over 32 KB', () => {
    const files = validTree();
    files['.ai/docs/big.md'] = 'x'.repeat(24_000);
    files['.ai/docs/big2.md'] = 'x'.repeat(10_000);
    files['AGENTS.md'] = `# AGENTS\n\n${ROUTING(`${DEFAULT_ROW}\n| big | \`.ai/docs/big.md\`, \`.ai/docs/big2.md\` |`)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/routing row "big": chain of \d+ B exceeds 32768 B/);
  });

  it('fails when a routed document is over its budget', () => {
    const files = validTree();
    files['.ai/docs/huge.md'] = 'x'.repeat(25_000);
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('.ai/docs/huge.md');
  });

  it('fails when CLAUDE.md does not start with the import', () => {
    const files = validTree();
    files['CLAUDE.md'] = '# CLAUDE.md\n\nSome rule first.\n\n@AGENTS.md\n';
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('CLAUDE.md: must start with the @AGENTS.md import');
  });

  it('fails when a package CLAUDE.md holds more than the import, or is missing', () => {
    const extra = validTree();
    extra['packages/core/CLAUDE.md'] = '# CLAUDE.md\n\n@AGENTS.md\n\nDuplicated rule.\n';
    expect(run(extra).out).toContain('packages/core/CLAUDE.md: must contain only the @AGENTS.md import');
    const missing = validTree();
    delete missing['packages/core/CLAUDE.md'];
    const r = run(missing);
    expect(r.code).toBe(1);
    expect(r.out).toContain('packages/core/CLAUDE.md: missing');
  });

  it('fails when a lesson link is broken or a lesson file is not in the index', () => {
    const broken = validTree();
    broken['.ai/lessons.md'] += '- [2026-01-02] [B](lessons/2026-01-02-b.md) — rule.\n';
    const r1 = run(broken);
    expect(r1.code).toBe(1);
    expect(r1.out).toContain('link to a missing lesson: lessons/2026-01-02-b.md');
    const orphan = validTree();
    orphan['.ai/lessons/2026-01-03-c.md'] = '# C\n';
    const r2 = run(orphan);
    expect(r2.code).toBe(1);
    expect(r2.out).toContain('.ai/lessons/2026-01-03-c.md: not in the index');
  });

  it('ignores the placeholder link in the lessons index format line', () => {
    const files = validTree();
    files['.ai/lessons.md'] += '\nFormat: `- [YYYY-MM-DD] [Title](lessons/YYYY-MM-DD-slug.md) — rule`\n';
    expect(run(files).code).toBe(0);
  });

  it('fails when the lessons index is over its budget', () => {
    const files = validTree();
    files['.ai/lessons.md'] += `${'x'.repeat(17_000)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('.ai/lessons.md');
  });

  it('checks skills: long description, long body, missing frontmatter, folded description', () => {
    const long = validTree();
    long['.claude/skills/demo/SKILL.md'] = `---\nname: demo\ndescription: ${'d'.repeat(1_030)}\n---\n`;
    const r1 = run(long);
    expect(r1.code).toBe(1);
    expect(r1.out).toContain('description has 1030 characters');

    const body = validTree();
    body['.agents/skills/demo/SKILL.md'] = `---\nname: demo\ndescription: ok\n---\n${'line\n'.repeat(510)}`;
    expect(run(body).out).toMatch(/\.agents\/skills\/demo\/SKILL\.md: \d+ lines exceed 500/);

    const none = validTree();
    none['.claude/skills/demo/SKILL.md'] = '# No frontmatter\n';
    expect(run(none).out).toContain('missing frontmatter');

    const folded = validTree();
    folded['.claude/skills/demo/SKILL.md'] = `---\nname: demo\ndescription: >\n  ${'a '.repeat(300)}\n  ${'b '.repeat(300)}\n---\n`;
    expect(run(folded).out).toContain('description has');
  });

  it('warns about a large active specification but not an implemented one', () => {
    const files = validTree();
    files['.ai/specs/2026-01-01-big.md'] = 'x'.repeat(41_000);
    files['.ai/specs/implemented/2026-01-01-old.md'] = 'x'.repeat(80_000);
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toContain('.ai/specs/2026-01-01-big.md');
    expect(r.out).not.toContain('2026-01-01-old.md');
  });

  it('passes on this repository', () => {
    const r = spawnSync('node', [SCRIPT, '--root', REPO], { encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).toContain('check-context:');
    expect(r.status).toBe(0);
  });
});
