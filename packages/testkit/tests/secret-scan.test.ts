import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Spec 2026-10-25-agent-security-hardening, R7. The samples are built from pieces so that this file does not hold a
 * string the scanner would report, and the scanner is pointed at a temporary directory, never at the repository.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/secret-scan.mjs', import.meta.url));

const SAMPLES = {
  'postgres-url': `postgres://${'app'}:${'hunter2'}@${'db.example.test'}:5432/wine`,
  'anthropic-key': `sk-ant-${'b'.repeat(30)}`,
  'github-token': `${'gh'}p_${'a'.repeat(36)}`,
  'github-fine-grained-token': `${'github'}_pat_${'c'.repeat(30)}`,
  'aws-access-key': `${'AKIA'}${'A'.repeat(16)}`,
  jwt: `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(12)}`,
  'private-key': `-----BEGIN ${'RSA '}PRIVATE KEY-----`
} as const;

type AllowEntry = { file: string; pattern: string; valueSha256: string; reason?: string };

function scan(args: string[]) {
  const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout };
}

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'secret-scan-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

function fresh(name: string) {
  const d = join(dir, name);
  mkdirSync(d, { recursive: true });
  return d;
}

describe('secret-scan: what it finds', () => {
  for (const [pattern, sample] of Object.entries(SAMPLES)) {
    it(`reports ${pattern} with file, line and pattern name, and never the value`, () => {
      const d = fresh(`find-${pattern}`);
      writeFileSync(join(d, 'notes.txt'), `first line\nvalue: ${sample}\n`);
      const r = scan(['--root', d]);
      expect(r.code).toBe(1);
      expect(r.out).toContain('notes.txt:2');
      expect(r.out).toContain(pattern);
      expect(r.out).not.toContain(sample);
    });
  }

  it('finds nothing in a clean directory and in look-alikes below the minimum length', () => {
    const d = fresh('clean');
    writeFileSync(join(d, 'a.md'), `ghp_short, sk-ant-short, AKIA123, eyJ.eyJ.x, postgres://localhost:5432/db\n`);
    expect(scan(['--root', d]).code).toBe(0);
  });
});

describe('secret-scan: what it skips', () => {
  it('skips binary files, files over 1 MB, symlinks and the dependency directories', () => {
    const d = fresh('skips');
    writeFileSync(join(d, 'binary.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(SAMPLES['github-token'])]));
    writeFileSync(join(d, 'big.txt'), `${SAMPLES['github-token']}\n${'x'.repeat(1_100_000)}`);
    writeFileSync(join(dir, 'outside.txt'), SAMPLES['github-token']);
    symlinkSync(join(dir, 'outside.txt'), join(d, 'link.txt'));
    mkdirSync(join(d, 'node_modules'), { recursive: true });
    writeFileSync(join(d, 'node_modules', 'dep.js'), SAMPLES['github-token']);
    expect(scan(['--root', d]).code).toBe(0);
  });
});

describe('secret-scan: the allowlist', () => {
  it('lets a listed value through by file, pattern and hash, and reports an entry nobody uses', () => {
    const d = fresh('allow');
    writeFileSync(join(d, 'example.md'), `${SAMPLES['postgres-url']}\n`);
    const printed = scan(['--root', d, '--print-allowlist']);
    expect(printed.code).toBe(0);
    expect(printed.stdout).not.toContain(SAMPLES['postgres-url']);
    const entries = (JSON.parse(printed.stdout) as { entries: AllowEntry[] }).entries
      .map((e) => ({ ...e, reason: 'placeholder in a test' }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ file: 'example.md', pattern: 'postgres-url' });
    expect(entries[0].valueSha256).toMatch(/^[0-9a-f]{64}$/);

    const list = join(d, '..', 'allow-list.json');
    writeFileSync(list, JSON.stringify({ entries }));
    expect(scan(['--root', d, '--allowlist', list]).code).toBe(0);

    writeFileSync(list, JSON.stringify({ entries: [...entries, { file: 'gone.md', pattern: 'postgres-url', valueSha256: 'a'.repeat(64), reason: 'old' }] }));
    const unused = scan(['--root', d, '--allowlist', list]);
    expect(unused.code).toBe(1);
    expect(unused.out).toContain('gone.md');
  });

  it('an entry without a reason is refused', () => {
    const d = fresh('no-reason');
    writeFileSync(join(d, 'a.txt'), 'nothing here\n');
    const list = join(d, '..', 'no-reason.json');
    writeFileSync(list, JSON.stringify({ entries: [{ file: 'a.txt', pattern: 'jwt', valueSha256: 'a'.repeat(64) }] }));
    expect(scan(['--root', d, '--allowlist', list]).code).toBe(1);
  });
});
