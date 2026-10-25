import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Spec 2026-10-25-context-engineering, R4–R5 and R9. Every check runs on a temporary tree, never on the repository,
 * with one test for the repository itself and one that pins the rules that must not be lost when AGENTS.md is cut.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/check-context.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

type Files = Record<string, string>;

const ROUTING = (rows: string) => `<!-- routing:start -->\n| Task | Read |\n|---|---|\n${rows}\n<!-- routing:end -->`;
const DEFAULT_ROW = '| every task | `.ai/lessons.md`, `.ai/docs/commands.md` |';
const agents = (rows = DEFAULT_ROW, extra = '') => `# AGENTS\n\n${ROUTING(rows)}\n\n## 1. Project\n\n### 1.2 Packages\n\n## 7. Rules\n${extra}\n`;

function validTree(): Files {
  return {
    'AGENTS.md': agents(),
    'CLAUDE.md': '# CLAUDE.md\n\n@AGENTS.md\n\nClaude-specific.\n',
    'packages/core/AGENTS.md': '# core\n',
    'packages/core/CLAUDE.md': '# CLAUDE.md\n\n@AGENTS.md\n',
    '.ai/lessons.md': '# Lessons\n\n- [2026-01-01] [A](lessons/2026-01-01-a.md) — rule.\n',
    '.ai/lessons/2026-01-01-a.md': '# A\n',
    '.ai/docs/commands.md': '# Commands\n',
    '.agents/skills/demo/SKILL.md': '---\nname: demo\ndescription: Use when the demo is needed.\n---\n\n# Demo\n'
  };
}

let dir: string;
let counter = 0;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'check-context-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

function run(files: Files, links: Record<string, string> = {}) {
  const root = join(dir, `t${counter++}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  const r = spawnSync('node', [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-context: sizes', () => {
  it('passes a valid tree', () => {
    const r = run(validTree());
    expect(r.code).toBe(0);
    expect(r.out).toContain('0 error(s)');
  });

  it('passes with warnings only (over the warning size, under the error size)', () => {
    const files = validTree();
    files['AGENTS.md'] = agents(DEFAULT_ROW, 'x'.repeat(24_000));
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toContain('warning  AGENTS.md');
  });

  it('fails when the root AGENTS.md is over the byte budget or has too many lines', () => {
    const big = validTree();
    big['AGENTS.md'] = agents(DEFAULT_ROW, 'x'.repeat(28_000));
    const r1 = run(big);
    expect(r1.code).toBe(1);
    expect(r1.out).toMatch(/ERROR {2}AGENTS\.md: \d+ B exceeds/);
    const long = validTree();
    long['AGENTS.md'] = agents(DEFAULT_ROW, 'a\n'.repeat(290));
    const r2 = run(long);
    expect(r2.code).toBe(1);
    expect(r2.out).toMatch(/lines exceed the 280 line limit/);
  });

  it('fails when a package AGENTS.md is over its budget', () => {
    const files = validTree();
    files['packages/core/AGENTS.md'] = `# core\n${'x'.repeat(13_000)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('packages/core/AGENTS.md');
  });

  it('fails when the root plus a package AGENTS.md is over the 32 KiB Codex limit', () => {
    const files = validTree();
    files['AGENTS.md'] = agents(DEFAULT_ROW, 'x'.repeat(23_000));
    files['packages/core/AGENTS.md'] = `# core\n${'y'.repeat(10_500)}\n`;
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/packages\/core\/AGENTS\.md: root AGENTS\.md and this file are \d+ B, over the 32768 B Codex limit/);
  });

  it('fails when a routed document is over its budget', () => {
    const files = validTree();
    files['.ai/docs/huge.md'] = 'x'.repeat(25_000);
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('.ai/docs/huge.md');
  });

  it('counts bytes, not characters, and reads CRLF files like LF files', () => {
    const files = validTree();
    files['AGENTS.md'] = agents(DEFAULT_ROW, 'ł'.repeat(12_000)).replace(/\n/g, '\r\n');
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/warning {2}AGENTS\.md: 24\d{3} B is over/);
  });

  it('warns about a large active specification but not an implemented one or the product files', () => {
    const files = validTree();
    files['.ai/specs/2026-01-01-big.md'] = 'x'.repeat(41_000);
    files['.ai/specs/implemented/2026-01-01-old.md'] = 'x'.repeat(80_000);
    files['.ai/specs/product-brief.md'] = 'x'.repeat(50_000);
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toContain('.ai/specs/2026-01-01-big.md');
    expect(r.out).not.toContain('2026-01-01-old.md');
    expect(r.out).not.toContain('product-brief.md');
  });
});

describe('check-context: routing', () => {
  it('fails when a routing path does not exist', () => {
    const files = validTree();
    files['AGENTS.md'] = agents(`${DEFAULT_ROW}\n| engine | \`docs/NOPE.md\` |`);
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('path not found: docs/NOPE.md');
  });

  it('ignores commands, globs, placeholders and env files, and strips anchors and line numbers', () => {
    const files = validTree();
    files['AGENTS.md'] = agents(`${DEFAULT_ROW}\n| run | \`npm run lint\`, \`packages/*/AGENTS.md\`, \`.ai/specs/<slug>.md\`, \`.env\`, \`.ai/docs/commands.md#polecenia\`, \`.ai/docs/commands.md:3\` |`);
    expect(run(files).code).toBe(0);
  });

  it('accepts a directory with a trailing slash and rejects a file written as a directory', () => {
    const ok = validTree();
    ok['AGENTS.md'] = agents(`${DEFAULT_ROW}\n| lessons | \`.ai/lessons/\` |`);
    expect(run(ok).code).toBe(0);
    const bad = validTree();
    bad['AGENTS.md'] = agents(`${DEFAULT_ROW}\n| lessons | \`.ai/lessons.md/\` |`);
    expect(run(bad).code).toBe(1);
  });

  it('fails when the routing block is missing, duplicated, reversed or has no paths', () => {
    const missing = validTree();
    missing['AGENTS.md'] = '# AGENTS\n';
    expect(run(missing).out).toContain('routing block missing or duplicated');
    const twice = validTree();
    twice['AGENTS.md'] = `${agents()}\n${ROUTING(DEFAULT_ROW)}\n`;
    expect(run(twice).code).toBe(1);
    const reversed = validTree();
    reversed['AGENTS.md'] = '# AGENTS\n<!-- routing:end -->\n<!-- routing:start -->\n';
    expect(run(reversed).code).toBe(1);
    const empty = validTree();
    empty['AGENTS.md'] = agents('| nothing | no paths here |');
    const r = run(empty);
    expect(r.code).toBe(1);
    expect(r.out).toContain('routing block has no paths to check');
  });
});

describe('check-context: CLAUDE.md', () => {
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
});

describe('check-context: section references', () => {
  it('passes a reference to an existing heading and fails one to a missing heading', () => {
    const ok = validTree();
    ok['packages/core/AGENTS.md'] = '# core\n\nGeneral rules: `../../AGENTS.md` (§1.2 and §7).\n';
    expect(run(ok).code).toBe(0);
    const bad = validTree();
    bad['packages/core/AGENTS.md'] = '# core\n\nGeneral rules: `../../AGENTS.md` (§1.3).\n';
    const r = run(bad);
    expect(r.code).toBe(1);
    expect(r.out).toContain('refers to AGENTS.md §1.3');
  });

  it('ignores a section sign on a line that does not mention AGENTS', () => {
    const files = validTree();
    files['packages/core/AGENTS.md'] = '# core\n\nSee BACKWARD_COMPATIBILITY.md §9.\n';
    expect(run(files).code).toBe(0);
  });
});

describe('check-context: lessons and file names', () => {
  it('fails when a lesson link is broken, listed twice, or a lesson file is not in the index', () => {
    const broken = validTree();
    broken['.ai/lessons.md'] += '- [2026-01-02] [B](lessons/2026-01-02-b.md) — rule.\n';
    const r1 = run(broken);
    expect(r1.code).toBe(1);
    expect(r1.out).toContain('link to a missing lesson: lessons/2026-01-02-b.md');
    const twice = validTree();
    twice['.ai/lessons.md'] += '- [2026-01-01] [A again](lessons/2026-01-01-a.md) — rule.\n';
    expect(run(twice).out).toContain('lesson listed twice');
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

  it('fails on a file name that is not YYYY-MM-DD-slug.md', () => {
    const files = validTree();
    files['.ai/runs/notes.md'] = '# x\n';
    files['.ai/specs/implemented/2026-01-01-zażółć.md'] = '# x\n';
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out).toContain('.ai/runs/notes.md: name must be YYYY-MM-DD-slug.md');
    expect(r.out).toContain('zażółć.md: name must be');
  });
});

describe('check-context: skills', () => {
  const skill = (frontmatter: string, body = '# Demo\n') => `---\nname: demo\n${frontmatter}\n---\n${body}`;

  it('fails on a description over 1024 characters, counting characters and not bytes', () => {
    const long = validTree();
    long['.agents/skills/demo/SKILL.md'] = skill(`description: ${'d'.repeat(1_030)}`);
    const r = run(long);
    expect(r.code).toBe(1);
    expect(r.out).toContain('description has 1030 characters');
    const polish = validTree();
    polish['.agents/skills/demo/SKILL.md'] = skill(`description: ${'ł'.repeat(1_000)}`);
    expect(run(polish).code).toBe(0);
  });

  it('reads folded and plain multi-line descriptions', () => {
    const folded = validTree();
    folded['.agents/skills/demo/SKILL.md'] = skill(`description: >\n  ${'a '.repeat(300)}\n  ${'b '.repeat(300)}`);
    expect(run(folded).out).toContain('description has');
    const plain = validTree();
    plain['.agents/skills/demo/SKILL.md'] = skill(`description: ${'a '.repeat(300)}\n  ${'b '.repeat(300)}`);
    expect(run(plain).out).toContain('description has');
  });

  it('fails on a body over 500 lines, a missing frontmatter, a missing description and a skill without SKILL.md', () => {
    const body = validTree();
    body['.agents/skills/demo/SKILL.md'] = skill('description: ok', 'line\n'.repeat(510));
    expect(run(body).out).toMatch(/\.agents\/skills\/demo\/SKILL\.md: \d+ lines exceed 500/);
    const none = validTree();
    none['.agents/skills/demo/SKILL.md'] = '# No frontmatter\n';
    expect(run(none).out).toContain('missing frontmatter');
    const noDescription = validTree();
    noDescription['.agents/skills/demo/SKILL.md'] = skill('license: MIT');
    expect(run(noDescription).out).toContain('missing description');
    const empty = validTree();
    empty['.agents/skills/other/notes.md'] = '# x\n';
    expect(run(empty).out).toContain('.agents/skills/other/SKILL.md: missing SKILL.md');
  });

  it('counts a skill once when .claude/skills links to .agents/skills', () => {
    const r = run(validTree(), { '.claude/skills/demo': '../../.agents/skills/demo' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('skills checked: 1');
  });
});

describe('check-context: this repository', () => {
  it('passes on the repository', () => {
    const r = spawnSync('node', [SCRIPT, '--root', REPO], { encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).toContain('check-context:');
    expect(r.status).toBe(0);
  });

  it('keeps the rules that must not be lost when AGENTS.md is cut (each is in the root or in .ai/docs)', () => {
    const docs = readdirSync(join(REPO, '.ai/docs')).filter((n) => n.endsWith('.md')).map((n) => readFileSync(join(REPO, '.ai/docs', n), 'utf8'));
    const text = [readFileSync(join(REPO, 'AGENTS.md'), 'utf8'), ...docs].join('\n').replace(/\*\*/g, '').replace(/\s+/g, ' ');
    const anchors = [
      'NIE WOLNO implementować specyfikacji w statusie `draft`',
      'MUSISZ trzymać się tego stosu',
      'nie edytuj logów innych przebiegów',
      'NIE WOLNO używać `next/font/google`',
      'NIE używaj bashizmów',
      'każda metoda repozytorium poza wyszukaniem restauracji po slugu przyjmuje `restaurantId`',
      'Serwisy rozwiązuj z zakresu żądania',
      'Każde drzwi sprawdzają same',
      'nigdy `instanceof`',
      'Zastosowanych migracji nie edytuj',
      'Silnik jest deterministyczny',
      'Sommelier ponad modelem',
      'Bez „AI” w interfejsie gościa',
      'Bez zewnętrznych zasobów w runtime',
      'Dokumentacja idzie razem z kodem',
      'W każdym przebiegu agenta musi brakować jednej z trzech nóg',
      'NIE WOLNO włączać `enableAllProjectMcpServers`',
      'Praca nie jest skończona, dopóki jej działania nie udowodnisz',
      'Klucze wybierane przez klienta nie trafiają do zwykłego obiektu jako słownika'
    ];
    const missing = anchors.filter((a) => !text.includes(a.replace(/\*\*/g, '')));
    expect(missing).toEqual([]);
  });
});
