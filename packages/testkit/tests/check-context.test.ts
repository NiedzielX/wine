import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyStackFixes, checkStackVersions, parseStackTable, type PackageFile } from '../../../scripts/lib/stack-versions.mjs';

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

function write(files: Files, links: Record<string, string> = {}) {
  const root = join(dir, `t${counter++}`);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    symlinkSync(target, join(root, path));
  }
  return root;
}
function runAt(root: string, args: string[] = []) {
  const r = spawnSync('node', [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
function run(files: Files, links: Record<string, string> = {}) {
  return runAt(write(files, links));
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

  it('prints the headroom before the warning and error limits, negative when over', () => {
    const ok = run(validTree());
    expect(ok.out).toMatch(/Headroom \(bytes left before warning \/ error\):/);
    expect(ok.out).toMatch(/ {2}AGENTS\.md +\d+ B \/ +\d+ B/);
    expect(ok.out).toMatch(/Codex: root \+ packages\/core \(largest\) +\d+ B \/ +\d+ B/);
    expect(ok.out).toMatch(/\.ai\/lessons\.md +\d+ B \/ +\d+ B/);
    const files = validTree();
    files['.ai/lessons.md'] += `${'x'.repeat(13_000)}\n`;
    expect(run(files).out).toMatch(/\.ai\/lessons\.md +-\d+ B \/ +\d+ B/);
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

describe('check-context: npm scripts', () => {
  const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'x', scripts });

  it('passes a mentioned script that exists in the root or a package package.json', () => {
    const files = validTree();
    files['package.json'] = pkg({ lint: 'x' });
    files['packages/core/package.json'] = pkg({ 'db:migrate': 'x' });
    files['.ai/docs/commands.md'] = '# Commands\n\nRun `npm run lint` and `npm run db:migrate`.\n';
    expect(run(files).code).toBe(0);
  });

  it('fails on a mentioned script that does not exist, once per file', () => {
    const files = validTree();
    files['package.json'] = pkg({ lint: 'x' });
    files['.ai/docs/commands.md'] = '# Commands\n\n`npm run gone` and again `npm run gone`.\n';
    const r = run(files);
    expect(r.code).toBe(1);
    expect(r.out.match(/npm run gone/g)?.length).toBe(1);
    expect(r.out).toContain('.ai/docs/commands.md: mentions `npm run gone`');
  });

  it('skips the check when the tree has no package.json', () => {
    const files = validTree();
    files['.ai/docs/commands.md'] = '# Commands\n\n`npm run anything`.\n';
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

describe('check-context: stack versions (AGENTS.md §1.1)', () => {
  // The shape of the real table: Polish prose, two packages in one cell, labelled ranges, a non-version token.
  const TABLE = [
    '### 1.1 Stos technologiczny',
    '',
    '| Obszar | Technologia | Wersja |',
    '|---|---|---|',
    '| Aplikacja | Next.js (App Router, Turbopack), React | 16.4.3, 19.3.1 |',
    '| Język | TypeScript (natywny kompilator) | 7.0.2 |',
    '| Baza danych | PostgreSQL + MikroORM (migracje, seedery, pula połączeń) | PG ≥ 16, MikroORM 7.2.5 |',
    '| Dependency Injection | Awilix (tryb `PROXY`) | 13.0.5 |',
    '| CSS | Tailwind CSS (strony gościa) / shadcn/ui na Tailwind (panel) | 4.3.3 / new-york-v4 |',
    '| Testy | Vitest | 5.0.5 |',
    '| Monorepo | npm workspaces | npm ≥ 11.6, Node ≥ 22.17 |',
    '',
    '**MUSISZ** trzymać się tego stosu. Wersja 1.2.3 w prozie nie jest częścią tabeli.',
    ''
  ].join('\n');
  const DOC = `# AGENTS\n\n## 1. Projekt\n\n${TABLE}\n### 1.2 Pakiety\n\n| Pakiet | Wersja |\n|---|---|\n| x | 9.9.9 |\n`;
  const ROOT_PKG = { name: 'root', packageManager: 'npm@11.20.0', engines: { node: '>=22.17.0', npm: '>=11.6.0' }, devDependencies: { typescript: '7.0.2', vitest: '5.0.5' } };
  const APP_PKG = { name: 'app', dependencies: { next: '16.4.3', react: '19.3.1', awilix: '13.0.5', tailwindcss: '4.3.3' } };
  const DB_PKG = { name: 'db', dependencies: { '@mikro-orm/core': '7.2.5', '@mikro-orm/postgresql': '7.2.5' } };
  const UI_PKG = { name: 'ui', peerDependencies: { react: '^19.0.0' }, devDependencies: { react: '19.3.1' } };
  const pkgs = (over: { root?: object; app?: object; db?: object; ui?: object } = {}): PackageFile[] => [
    { file: 'package.json', json: { ...ROOT_PKG, ...over.root } },
    { file: 'packages/app/package.json', json: { ...APP_PKG, ...over.app } },
    { file: 'packages/db/package.json', json: { ...DB_PKG, ...over.db } },
    { file: 'packages/ui/package.json', json: { ...UI_PKG, ...over.ui } }
  ];

  it('parses the table: labels from the technology column by position, labelled segments, exact pins and ranges', () => {
    const parsed = parseStackTable(DOC);
    expect(parsed).not.toBeNull();
    const view = parsed!.entries.map((e) => `${e.label}|${e.key ?? '-'}|${e.kind}|${e.token}`);
    expect(view).toEqual([
      'Next.js|next.js|exact|16.4.3',
      'React|react|exact|19.3.1',
      'TypeScript|typescript|exact|7.0.2',
      'PG|-|range|16',
      'MikroORM|mikroorm|exact|7.2.5',
      'Awilix|awilix|exact|13.0.5',
      'Tailwind CSS|tailwind css|exact|4.3.3',
      'Vitest|vitest|exact|5.0.5',
      'npm|npm|range|11.6',
      'Node|node|range|22.17'
    ]);
    const next = parsed!.entries[0]!;
    const line = DOC.split('\n')[next.line - 1]!;
    expect(line.slice(next.column, next.column + next.token.length)).toBe('16.4.3');
    expect(parseStackTable('# AGENTS\n\n## 1. Projekt\n')).toBeNull();
  });

  it('reports nothing when the table matches the exact pins and the engines', () => {
    expect(checkStackVersions(DOC, pkgs())).toEqual([]);
  });

  it('reports an exact pin that differs, with a fix for that token only', () => {
    const findings = checkStackVersions(DOC, pkgs({ app: { dependencies: { ...APP_PKG.dependencies, next: '16.4.4' } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('Next.js 16.4.3');
    expect(findings[0]!.message).toContain('16.4.4');
    expect(findings[0]!.fix).toMatchObject({ from: '16.4.3', to: '16.4.4' });
  });

  it('checks every @mikro-orm/* pin for MikroORM and does not guess when pins disagree or are missing', () => {
    const split = checkStackVersions(DOC, pkgs({ db: { dependencies: { '@mikro-orm/core': '7.2.6', '@mikro-orm/postgresql': '7.2.5' } } }));
    expect(split).toHaveLength(1);
    expect(split[0]!.message).toMatch(/MikroORM/);
    expect(split[0]!.fix).toBeNull();
    const missing = checkStackVersions(DOC, pkgs({ app: { dependencies: { next: '16.4.3', react: '19.3.1', tailwindcss: '4.3.3' } } }));
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).toMatch(/Awilix.*no exact pin/);
    expect(missing[0]!.fix).toBeNull();
  });

  it('quietly skips PG ≥ 16, new-york-v4 and peer ranges; a package written as a range is "not checked", never compared', () => {
    expect(parseStackTable(DOC)!.skipped).toEqual([]);
    const doc = DOC.replace('| 16.4.3, 19.3.1 |', '| 16.4.3, ≥ 19 |');
    const findings = checkStackVersions(doc, pkgs({ app: { dependencies: { ...APP_PKG.dependencies, react: '19.4.0' } }, ui: { devDependencies: { react: '19.4.0' } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ label: 'React', unchecked: true, fix: null });
    expect(findings[0]!.message).toMatch(/^cell for React not checked: "React ≥ 19" is a range/);
  });

  it('reports ~ and ^ ranges as "not checked" instead of dropping them', () => {
    for (const range of ['~7.0.2', '^7.0.2', '7.0.x']) {
      const findings = checkStackVersions(DOC.replace('| 7.0.2 |', `| ${range} |`), pkgs());
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ label: 'TypeScript', unchecked: true, fix: null });
      expect(findings[0]!.message).toContain(`cell for TypeScript not checked: "${range}" is neither an exact version nor a ≥ range`);
    }
  });

  it('reports more bare versions than technology names, and an exact version of an unknown technology, as "not checked"', () => {
    const count = checkStackVersions(DOC.replace('| Next.js (App Router, Turbopack), React |', '| Next.js |'), pkgs());
    expect(count).toHaveLength(1);
    expect(count[0]).toMatchObject({ unchecked: true, fix: null });
    expect(count[0]!.message).toMatch(/^cell for Next\.js not checked: 2 versions for 1 technology name\(s\); label each version/);
    const unknown = checkStackVersions(DOC.replace('| Awilix (tryb `PROXY`) | 13.0.5 |', '| Awilix (tryb `PROXY`), Prisma | 13.0.5, Prisma 6.1.0 |'), pkgs());
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.message).toMatch(/^cell for Prisma not checked: no package mapping for "Prisma"/);
    const exactNode = checkStackVersions(DOC.replace('Node ≥ 22.17', 'Node 22.17.0'), pkgs());
    expect(exactNode[0]!.message).toMatch(/^cell for Node not checked/);
  });

  it('compares npm and Node with the minimum in engines and keeps the precision of the cell', () => {
    const findings = checkStackVersions(DOC, pkgs({ root: { engines: { node: '>=22.18.0', npm: '>=11.6.0' } } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.fix).toMatchObject({ from: '22.17', to: '22.18' });
    const patch = checkStackVersions(DOC, pkgs({ root: { engines: { node: '>=22.17.2', npm: '>=11.6.0' } } }));
    expect(patch[0]!.fix).toMatchObject({ from: '22.17', to: '22.17.2' });
  });

  it('fixes only the version tokens, nothing else, keeps CRLF, and is idempotent', () => {
    const drifted = pkgs({
      root: { engines: { node: '>=24.1.0', npm: '>=11.6.0' }, devDependencies: { typescript: '7.0.3', vitest: '5.1.0' } },
      app: { dependencies: { next: '16.5.0', react: '19.3.1', awilix: '13.0.5', tailwindcss: '4.3.3' } },
      db: { dependencies: { '@mikro-orm/core': '7.3.0', '@mikro-orm/postgresql': '7.3.0' } }
    });
    const findings = checkStackVersions(DOC, drifted);
    expect(findings.map((f) => `${f.fix?.from}->${f.fix?.to}`)).toEqual(['16.4.3->16.5.0', '7.0.2->7.0.3', '7.2.5->7.3.0', '5.0.5->5.1.0', '22.17->24.1']);
    const fixed = applyStackFixes(DOC, findings.map((f) => f.fix!));
    const before = DOC.split('\n');
    const after = fixed.split('\n');
    expect(after).toHaveLength(before.length);
    const changed = before.map((l, i) => [l, after[i]] as const).filter(([a, b]) => a !== b);
    expect(changed.map(([, b]) => b)).toEqual([
      '| Aplikacja | Next.js (App Router, Turbopack), React | 16.5.0, 19.3.1 |',
      '| Język | TypeScript (natywny kompilator) | 7.0.3 |',
      '| Baza danych | PostgreSQL + MikroORM (migracje, seedery, pula połączeń) | PG ≥ 16, MikroORM 7.3.0 |',
      '| Testy | Vitest | 5.1.0 |',
      '| Monorepo | npm workspaces | npm ≥ 11.6, Node ≥ 24.1 |'
    ]);
    expect(checkStackVersions(fixed, drifted)).toEqual([]);
    expect(applyStackFixes(fixed, checkStackVersions(fixed, drifted).map((f) => f.fix!))).toBe(fixed);
    const crlf = DOC.replace(/\n/g, '\r\n');
    const fixedCrlf = applyStackFixes(crlf, checkStackVersions(crlf, drifted).map((f) => f.fix!));
    expect(fixedCrlf).toBe(fixed.replace(/\n/g, '\r\n'));
    expect(() => applyStackFixes(fixed, [findings[0]!.fix!])).toThrow(/expected 16\.4\.3/);
  });

  const tree = (next: string): Files => ({
    ...validTree(),
    'AGENTS.md': agents(DEFAULT_ROW, `\n${TABLE}`),
    'package.json': JSON.stringify(ROOT_PKG, null, 2),
    'packages/app/package.json': JSON.stringify({ ...APP_PKG, dependencies: { ...APP_PKG.dependencies, next } }, null, 2),
    'packages/db/package.json': JSON.stringify(DB_PKG, null, 2)
  });

  it('warns (exit 0) on drift and names the fix command; silent when the table matches', () => {
    const r = run(tree('16.4.4'));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/warning {2}AGENTS\.md: §1\.1 line \d+: Next\.js 16\.4\.3/);
    expect(r.out).toContain('npm run check:context -- --fix-versions --write');
    expect(run(tree('16.4.3')).out).not.toMatch(/AGENTS\.md: §1\.1/);
  });

  it('warns (exit 0) about a cell it cannot check, in the "§1.1: cell for X not checked" form', () => {
    const files = tree('16.4.3');
    files['AGENTS.md'] = files['AGENTS.md']!.replace('| 7.0.2 |', '| ^7.0.2 |');
    const r = run(files);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/warning {2}AGENTS\.md: §1\.1: cell for TypeScript not checked: "\^7\.0\.2" is neither/);
  });

  it('--fix-versions is a dry run; --write applies it; a second run has nothing to change', () => {
    const root = write(tree('16.4.4'));
    const original = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    const dry = runAt(root, ['--fix-versions']);
    expect(dry.code).toBe(0);
    expect(dry.out).toMatch(/AGENTS\.md:\d+ +16\.4\.3 -> 16\.4\.4 +\(Next\.js\)/);
    expect(dry.out).toContain('dry run');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(original);
    const wet = runAt(root, ['--fix-versions', '--write']);
    expect(wet.code).toBe(0);
    const updated = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(updated).toBe(original.replace('| 16.4.3, 19.3.1 |', '| 16.4.4, 19.3.1 |'));
    const again = runAt(root, ['--fix-versions', '--write']);
    expect(again.code).toBe(0);
    expect(again.out).toContain('nothing to change');
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(updated);
    expect(runAt(root).out).not.toMatch(/AGENTS\.md: §1\.1/);
  });

  it('--fix-versions exits 1 when a drift cannot be fixed, and --write alone is a usage error', () => {
    const files = tree('16.4.3');
    files['packages/db/package.json'] = JSON.stringify({ dependencies: { '@mikro-orm/core': '7.2.6', '@mikro-orm/cli': '7.2.5' } });
    const r = runAt(write(files), ['--fix-versions']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('cannot fix');
    expect(runAt(write(tree('16.4.3')), ['--write']).code).toBe(2);
  });
});

describe('check-context: this repository', () => {
  it('passes on the repository', () => {
    const r = spawnSync('node', [SCRIPT, '--root', REPO], { encoding: 'utf8' });
    expect(`${r.stdout}${r.stderr}`).toContain('check-context:');
    expect(r.status).toBe(0);
  });

  // Parser coverage only, never drift: a Dependabot bump cannot edit AGENTS.md and must stay green (drift is tested on
  // synthetic trees above). Nothing here reads package.json versions.
  it('still parses the AGENTS.md §1.1 table: at least 9 versions guarded, no cell skipped', () => {
    const r = spawnSync('node', [SCRIPT, '--root', REPO], { encoding: 'utf8' });
    const count = Number(/stack versions checked: (\d+)/.exec(r.stdout)?.[1] ?? 0);
    expect(count).toBeGreaterThanOrEqual(9);
    const parsed = parseStackTable(readFileSync(join(REPO, 'AGENTS.md'), 'utf8'));
    expect(parsed?.skipped).toEqual([]);
    expect(parsed?.entries.filter((e) => !e.key && e.kind === 'exact')).toEqual([]);
    expect(parsed?.entries.filter((e) => e.key && e.kind === 'range' && !['npm', 'node'].includes(e.key))).toEqual([]);
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
