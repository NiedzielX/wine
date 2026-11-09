import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkVersions, planSet } from '../../../scripts/release-version.mjs';

/**
 * Lesson 22 (release management): one version in the root package.json, every workspace package.json and the
 * workspace entries of package-lock.json. `--check` runs in the release checklist and the release workflow; `--set`
 * changes ONLY the packages' own `version` fields, never a dependency range. Internal `@wine-match/*` dependencies must be
 * `"*"`: npm 11 links the workspace for any range its version satisfies, but a fixed range stops matching after a bump
 * and npm then looks for the name in the public registry (verified with npm 11.20.0, .ai/runs/2026-11-09-workspace-testkit-range.md).
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/release-version.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const WORKSPACES = ['packages/core', 'packages/app', 'packages/testkit'];
const NOT_XYZ = 'is not X.Y.Z (digits only: no leading v, leading zeros, -prerelease or +build; docs/RELEASING.md §3)';

interface Fixture {
  version?: string;
  workspace?: Record<string, string>;
  lockRoot?: string;
  lockEmpty?: string;
  lockWorkspace?: Record<string, string>;
  appTestkitRange?: string;
  dropWorkspaceFile?: string;
}

/** A small monorepo shaped like ours: 2-space JSON, an escaped character in the root description, exact pins. */
function repo(f: Fixture = {}) {
  const root = mkdtempSync(join(tmpdir(), 'release version ł% '));
  roots.push(root);
  const v = f.version ?? '0.2.0';
  const ver = (ws: string) => f.workspace?.[ws] ?? v;
  writeFileSync(join(root, 'package.json'), [
    '{',
    '  "name": "wine-match",',
    '  "private": true,',
    `  "version": "${v}",`,
    '  "description": "Wine Match \\u2014 monorepo",',
    `  "workspaces": [${WORKSPACES.map((w) => `\n    "${w}"`).join(',')}\n  ],`,
    '  "devDependencies": {',
    '    "vitest": "5.0.5"',
    '  }',
    '}',
    ''
  ].join('\n'));
  const pkg: Record<string, string> = {
    'packages/core': `{\n  "name": "@wine-match/core",\n  "version": "${ver('packages/core')}",\n  "private": true,\n  "dependencies": {\n    "zod": "0.2.0"\n  }\n}\n`,
    'packages/app': `{\n  "name": "@wine-match/app",\n  "version": "${ver('packages/app')}",\n  "private": true,\n  "dependencies": {\n    "@wine-match/core": "*"\n  },\n  "devDependencies": {\n    "@wine-match/testkit": "${f.appTestkitRange ?? '*'}"\n  }\n}\n`,
    'packages/testkit': `{\n  "name": "@wine-match/testkit",\n  "version": "${ver('packages/testkit')}",\n  "private": true\n}\n`
  };
  for (const ws of WORKSPACES) {
    mkdirSync(join(root, ws), { recursive: true });
    if (f.dropWorkspaceFile !== ws) writeFileSync(join(root, ws, 'package.json'), pkg[ws]);
  }
  const lv = (ws: string) => f.lockWorkspace?.[ws] ?? ver(ws);
  writeFileSync(join(root, 'package-lock.json'), [
    '{',
    '  "name": "wine-match",',
    `  "version": "${f.lockRoot ?? v}",`,
    '  "lockfileVersion": 3,',
    '  "requires": true,',
    '  "packages": {',
    '    "": {',
    '      "name": "wine-match",',
    `      "version": "${f.lockEmpty ?? v}",`,
    '      "workspaces": [',
    WORKSPACES.map((w) => `        "${w}"`).join(',\n'),
    '      ]',
    '    },',
    '    "node_modules/zod": {',
    '      "version": "0.2.0",',
    '      "resolved": "https://registry.npmjs.org/zod/-/zod-0.2.0.tgz"',
    '    },',
    '    "packages/app": {',
    '      "name": "@wine-match/app",',
    `      "version": "${lv('packages/app')}",`,
    '      "dependencies": {',
    '        "@wine-match/core": "*"',
    '      },',
    '      "devDependencies": {',
    `        "@wine-match/testkit": "${f.appTestkitRange ?? '*'}"`,
    '      }',
    '    },',
    '    "packages/core": {',
    '      "name": "@wine-match/core",',
    `      "version": "${lv('packages/core')}",`,
    '      "dependencies": {',
    '        "zod": "0.2.0"',
    '      }',
    '    },',
    '    "packages/testkit": {',
    '      "name": "@wine-match/testkit",',
    `      "version": "${lv('packages/testkit')}"`,
    '    }',
    '  }',
    '}',
    ''
  ].join('\n'));
  return root;
}

const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8');

describe('checkVersions', () => {
  it('accepts one version everywhere and reports it', () => {
    expect(checkVersions(repo())).toEqual({ version: '0.2.0', problems: [] });
  });

  it('accepts the expected version and refuses another one', () => {
    expect(checkVersions(repo(), '0.2.0').problems).toEqual([]);
    expect(checkVersions(repo(), '0.3.0').problems).toEqual(['package.json: version is 0.2.0, expected 0.3.0']);
  });

  it('names a workspace package.json with another version', () => {
    const { problems } = checkVersions(repo({ workspace: { 'packages/app': '0.2.1' } }));
    expect(problems).toContain('packages/app/package.json: version is 0.2.1, root package.json has 0.2.0');
  });

  it('names a package-lock.json workspace entry with another version', () => {
    const { problems } = checkVersions(repo({ lockWorkspace: { 'packages/core': '0.1.0' } }));
    expect(problems).toEqual(['package-lock.json packages["packages/core"].version: 0.1.0, root package.json has 0.2.0']);
  });

  it('names the lockfile root and its "" entry', () => {
    const { problems } = checkVersions(repo({ lockRoot: '0.1.0', lockEmpty: '0.1.1' }));
    expect(problems).toEqual([
      'package-lock.json version: 0.1.0, root package.json has 0.2.0',
      'package-lock.json packages[""].version: 0.1.1, root package.json has 0.2.0'
    ]);
  });

  it('refuses a version that is not semver', () => {
    expect(checkVersions(repo({ version: '1.0' })).problems[0]).toBe(`package.json: version "1.0" ${NOT_XYZ}`);
    expect(checkVersions(repo(), 'v0.2.0').problems).toEqual([`--expect "v0.2.0" ${NOT_XYZ}`]);
  });

  it('refuses prerelease, build metadata and leading zeros everywhere (releases are plain X.Y.Z)', () => {
    for (const v of ['1.0.0-rc.1', '1.0.0-01', '1.0.0+build', '01.0.0', '0.02.0']) {
      expect(checkVersions(repo(), v).problems).toEqual([`--expect "${v}" ${NOT_XYZ}`]);
      expect(checkVersions(repo({ version: v })).problems[0]).toBe(`package.json: version "${v}" ${NOT_XYZ}`);
      expect(planSet(repo(), v).problems).toEqual([`version "${v}" ${NOT_XYZ}`]);
    }
  });

  it('reports a malformed package.json or lockfile as a problem, without throwing', () => {
    const root = repo();
    writeFileSync(join(root, 'packages/app/package.json'), '{ "name": "@wine-match/app", }');
    expect(checkVersions(root).problems).toContain('packages/app/package.json: not valid JSON');
    writeFileSync(join(root, 'package-lock.json'), '{');
    expect(checkVersions(root).problems).toContain('package-lock.json: not valid JSON');
    expect(planSet(root, '0.3.0').problems).toContain('package-lock.json: not valid JSON');
  });

  it('refuses a missing workspace package.json', () => {
    expect(checkVersions(repo({ dropWorkspaceFile: 'packages/testkit' })).problems).toContain('packages/testkit/package.json: missing');
  });

  it('flags an exact internal pin that the workspace version does not satisfy (npm would go to the registry)', () => {
    const { problems } = checkVersions(repo({ appTestkitRange: '0.1.0' }));
    expect(problems).toEqual([
      'packages/app/package.json devDependencies["@wine-match/testkit"]: "0.1.0" does not match the workspace version 0.2.0; npm would look for it in the registry (dependency confusion). Change the range to "*" in a reviewed PR',
      'package-lock.json packages["packages/app"].devDependencies["@wine-match/testkit"]: "0.1.0" does not match the workspace version 0.2.0; npm would look for it in the registry (dependency confusion). Change the range to "*" in a reviewed PR'
    ]);
  });

  it('flags an internal range other than "*" even when it matches today (the next bump would send npm to the registry)', () => {
    const today = (range: string) => `"${range}" matches the workspace version 0.2.0 today, but not after a version bump (npm would then look for it in the registry: dependency confusion). Internal packages use "*"; change it in a reviewed PR`;
    for (const range of ['0.2.0', '^0.2.0', '~0.2.0', '']) {
      expect(checkVersions(repo({ appTestkitRange: range })).problems, range).toEqual([
        `packages/app/package.json devDependencies["@wine-match/testkit"]: ${today(range)}`,
        `package-lock.json packages["packages/app"].devDependencies["@wine-match/testkit"]: ${today(range)}`
      ]);
    }
  });

  it('flags a range npm does not resolve to the workspace, or one this check does not understand', () => {
    for (const range of ['workspace:*', 'file:../testkit', '>=0.2.0']) {
      expect(checkVersions(repo({ appTestkitRange: range })).problems[0], range).toBe(
        `packages/app/package.json devDependencies["@wine-match/testkit"]: range "${range}" is not one this check understands (use "*")`
      );
    }
  });

  it('passes on this repository', () => {
    const result = checkVersions(REPO);
    expect(result.problems).toEqual([]);
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('planSet', () => {
  it('changes only the version fields and keeps every byte around them', () => {
    const root = repo({ appTestkitRange: '*' });
    const before = Object.fromEntries(['package.json', 'package-lock.json', ...WORKSPACES.map((w) => `${w}/package.json`)].map((f) => [f, read(root, f)]));
    const plan = planSet(root, '0.3.0');
    expect(plan.problems).toEqual([]);
    expect(plan.changes).toHaveLength(9); // root + 3 workspaces + lock root + lock "" + 3 lock workspaces
    for (const [file, text] of Object.entries(plan.files)) {
      const old = before[file] as string;
      expect(text.length).toBe(old.length); // 0.2.0 -> 0.3.0: same length, so nothing else moved
      expect(text.replaceAll('0.3.0', '0.2.0')).toBe(old.replaceAll('0.3.0', '0.2.0'));
    }
    // dependency ranges untouched, including an external dependency pinned to the same string as the old version
    expect(plan.files['packages/core/package.json']).toContain('"zod": "0.2.0"');
    expect(plan.files['package-lock.json']).toContain('"zod": "0.2.0"');
    expect(plan.files['package-lock.json']).toContain('"node_modules/zod": {\n      "version": "0.2.0"');
    expect(plan.files['package.json']).toContain('\\u2014');
  });

  it('refuses while an internal dependency is pinned exactly, and writes nothing', () => {
    const root = repo({ appTestkitRange: '0.2.0' });
    const plan = planSet(root, '0.3.0');
    expect(plan.changes).toEqual([]);
    expect(plan.files).toEqual({});
    expect(plan.problems[0]).toContain('packages/app/package.json devDependencies["@wine-match/testkit"]: "0.2.0" matches the workspace version 0.2.0 today, but not after a version bump');
    const cli = run(['--set', '0.3.0', '--write', '--root', root]);
    expect(cli.status).toBe(1);
    expect(read(root, 'packages/app/package.json')).toContain('"version": "0.2.0"');
  });

  it('accepts "*" for internal dependencies and leaves it as it is', () => {
    const plan = planSet(repo(), '1.0.0');
    expect(plan.problems).toEqual([]);
    expect(plan.files['packages/app/package.json']).toContain('"@wine-match/testkit": "*"');
    expect(plan.files['package-lock.json']).toContain('"@wine-match/testkit": "*"');
  });

  it('refuses a non-semver target and an inconsistent starting point', () => {
    expect(planSet(repo(), '0.3').problems).toEqual([`version "0.3" ${NOT_XYZ}`]);
    expect(planSet(repo({ workspace: { 'packages/app': '0.1.0' } }), '0.3.0').problems[0]).toContain('packages/app/package.json: version is 0.1.0');
  });
});

describe('release-version CLI', () => {
  it('--check exits 0 with the version, 1 with the problems', () => {
    const ok = run(['--check', '--root', repo()]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('release:version OK: 0.2.0 in 9 places');
    const bad = run(['--check', '--root', repo({ workspace: { 'packages/core': '9.9.9' } })]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('packages/core/package.json: version is 9.9.9');
  });

  it('--set is a dry run by default and writes only with --write', () => {
    const root = repo();
    const dry = run(['--set', '0.3.0', '--root', root]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('dry run');
    expect(read(root, 'package.json')).toContain('"version": "0.2.0"');
    const wet = run(['--set', '0.3.0', '--write', '--root', root]);
    expect(wet.status).toBe(0);
    expect(checkVersions(root, '0.3.0').problems).toEqual([]);
  });

  it('usage errors exit 2, including conflicting modes', () => {
    expect(run(['--set']).status).toBe(2);
    expect(run(['--bogus']).status).toBe(2);
    const root = repo();
    for (const args of [['--set', '0.3.0', '--check'], ['--check', '--set', '0.3.0'], ['--set', '0.3.0', '--expect', '0.3.0'], ['--check', '--write'], ['--set', '0.3.0', '--set', '0.4.0']]) {
      const r = run([...args, '--root', root]);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toContain('usage:');
    }
    expect(read(root, 'package.json')).toContain('"version": "0.2.0"');
  });

  it('a malformed JSON file gives a clean message and exit 1, not a stack trace', () => {
    const root = repo();
    writeFileSync(join(root, 'package.json'), '{ "version": ');
    const r = run(['--check', '--root', root]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('package.json: not valid JSON');
    expect(r.stderr).not.toMatch(/SyntaxError|\n\s+at /);
  });
});
