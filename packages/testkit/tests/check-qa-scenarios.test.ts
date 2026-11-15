import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** `scripts/check-qa-scenarios.mjs` on temporary trees: the QA knowledge base (`.ai/qa/knowledge/`) is notes, not an area of scenarios. */
const SCRIPT = fileURLToPath(new URL('../../../scripts/check-qa-scenarios.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

let dir: string;
let counter = 0;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'check-qa-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

function run(files: Record<string, string>) {
  const root = join(dir, `t${counter++}`);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout + result.stderr };
}

describe('check-qa-scenarios and the knowledge base', () => {
  it('ignores .ai/qa/knowledge (README and session entries are not scenarios)', () => {
    const { code, out } = run({
      '.ai/qa/INDEX.md': '# Index\n',
      '.ai/qa/knowledge/README.md': '# Knowledge\n',
      '.ai/qa/knowledge/2026-11-08-seed-security.md': '# entry\n'
    });
    expect(out).toContain('0 scenarios');
    expect(code).toBe(0);
  });

  it('still rejects a badly named file in a real area folder', () => {
    const { code, out } = run({ '.ai/qa/INDEX.md': '# Index\n', '.ai/qa/guest/notes.md': '# x\n' });
    expect(code).toBe(1);
    expect(out).toContain('name must be {area}-{NNN}-{slug}.md');
  });

  it('rejects two scenarios with the same number in one area (parallel branches picked the same next id)', () => {
    const scenario = (id: string, title: string) => `---\nid: ${id}\narea: guest\ntitle: "x"\nstatus: automated\ntest:\n  file: packages/app/tests/e2e/a.e2e.test.ts\n  it: "${title}"\n---\n# ${id}\n`;
    const { code, out } = run({
      'packages/app/tests/e2e/a.e2e.test.ts': "it('one', () => {});\nit('two', () => {});\n",
      '.ai/qa/INDEX.md': '| [guest-001-first](guest/guest-001-first.md) |\n| [guest-001-second](guest/guest-001-second.md) |\n',
      '.ai/qa/guest/guest-001-first.md': scenario('guest-001-first', 'one'),
      '.ai/qa/guest/guest-001-second.md': scenario('guest-001-second', 'two')
    });
    expect(code).toBe(1);
    expect(out).toContain('number 001 is already used in area "guest" by guest-001-first');
  });

  it('passes on this repository, knowledge base included', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '--root', REPO], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
