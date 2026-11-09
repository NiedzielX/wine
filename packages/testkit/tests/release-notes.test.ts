import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkChangelog, checkUpgradeNotes, promote, renderRelease } from '../../../scripts/release-notes.mjs';

/**
 * Lesson 22 (release management): the release body comes from CHANGELOG.md (Keep a Changelog, `## [Unreleased]`,
 * `## [X.Y.Z] - YYYY-MM-DD`) and, for anything not backward compatible, from UPGRADE_NOTES.md. Deterministic, offline.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/release-notes.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const HEAD = '# Changelog\n\nFormat wg Keep a Changelog.\n\n```md\n## [9.9.9] - 2000-01-01\nprzykład w bloku kodu, nie sekcja\n```\n\n';
const UNRELEASED = '## [Unreleased]\n\n### Konta i role (E12)\n- F1: status członkostwa (#118).\n- F2: zaproszenia,\n  link ważny 72 h (#123).\n\n### Bezpieczeństwo\n- Model zagrożeń (#127).\n\n';
const OLD = '## [0.2.0]\n\nPierwszy import monorepo; bez daty.\n';
const changelog = (unreleased = UNRELEASED, rest = OLD) => `${HEAD}${unreleased}${rest}`;

const UN_HEAD = '# Upgrade notes\n\nWzór wpisu:\n\n```md\n## [Unreleased]\n### przykład\n```\n\n';
const ENTRY = '### Nazwa ciasteczka sesji (#200)\n\n- **Kogo dotyczy:** każdego zalogowanego użytkownika panelu.\n- **Co się zmienia:** `wm_session` → `wm_sess`.\n- **Co zrobić:** nic; wszyscy logują się ponownie.\n- **Wycofanie:** poprzedni obraz, sesje znów wygasają.\n\n';
const upgrade = (unreleased = '', rest = '') => `${UN_HEAD}## [Unreleased]\n\n${unreleased}${rest}`;

function dir(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'release notes ł% '));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  return root;
}
const run = (args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('checkChangelog', () => {
  it('accepts a non-empty, well-formed [Unreleased] and ignores headings inside code fences', () => {
    expect(checkChangelog(changelog())).toEqual([]);
  });

  it('refuses a missing, duplicated or empty [Unreleased]', () => {
    expect(checkChangelog(`${HEAD}${OLD}`)).toEqual(['CHANGELOG.md: no "## [Unreleased]" section']);
    expect(checkChangelog(changelog(UNRELEASED + UNRELEASED))).toContain('CHANGELOG.md: "## [Unreleased]" appears 2 times');
    expect(checkChangelog(changelog('## [Unreleased]\n\n### Pusta grupa\n\n'))).toEqual([
      'CHANGELOG.md:12: "### Pusta grupa" has no entries',
      'CHANGELOG.md: [Unreleased] has no entries ("- …" lines)'
    ]);
  });

  it('refuses free text, deeper headings and a bullet outside a group, with the line number', () => {
    const text = changelog('## [Unreleased]\n\n- bez grupy\n\n### Grupa\n- wpis\nluźny akapit\n#### Za głęboko\n\n');
    expect(checkChangelog(text)).toEqual([
      'CHANGELOG.md:12: entry before any "### group" heading',
      'CHANGELOG.md:16: unexpected line in [Unreleased] (only "### group", "- entry" and indented continuation lines)',
      'CHANGELOG.md:17: unexpected line in [Unreleased] (only "### group", "- entry" and indented continuation lines)'
    ]);
  });

  it('refuses a malformed version heading and versions out of order', () => {
    expect(checkChangelog(changelog(UNRELEASED, '## [0.3.0] 2026-11-09\n- x\n'))).toEqual(['CHANGELOG.md:20: version heading must be "## [X.Y.Z] - YYYY-MM-DD" (or "## [Unreleased]")']);
    expect(checkChangelog(changelog(UNRELEASED, `## [0.1.0] - 2026-01-01\n### A\n- a\n\n${OLD}`))).toEqual(['CHANGELOG.md:24: [0.2.0] is listed after [0.1.0]: newest version first']);
  });

  it('passes on this repository', () => {
    expect(checkChangelog(readFileSync(join(REPO, 'CHANGELOG.md'), 'utf8'))).toEqual([]);
  });
});

describe('checkUpgradeNotes', () => {
  it('accepts an empty [Unreleased] (nothing breaking) and a complete entry', () => {
    expect(checkUpgradeNotes(upgrade())).toEqual([]);
    expect(checkUpgradeNotes(upgrade(ENTRY))).toEqual([]);
  });

  it('names every missing field of an entry', () => {
    const entry = '### Zmiana bez opisu (#201)\n\n- **Kogo dotyczy:** operatora.\n\n';
    expect(checkUpgradeNotes(upgrade(entry))).toEqual([
      'UPGRADE_NOTES.md:12: "### Zmiana bez opisu (#201)" lacks **Co się zmienia:**, **Co zrobić:**, **Wycofanie:**'
    ]);
  });

  it('passes on this repository', () => {
    expect(checkUpgradeNotes(readFileSync(join(REPO, 'UPGRADE_NOTES.md'), 'utf8'))).toEqual([]);
  });
});

describe('renderRelease', () => {
  const released = changelog('## [Unreleased]\n\n', `## [0.3.0] - 2026-11-09\n\n### Bezpieczeństwo\n- Model zagrożeń (#127).\n\n${OLD}`);

  it('renders the version section without its heading, plus the upgrade notes of that version', () => {
    const { body, problems } = renderRelease(released, '0.3.0', upgrade('', `## [0.3.0] - 2026-11-09\n\n${ENTRY}`));
    expect(problems).toEqual([]);
    expect(body).toBe([
      '### Bezpieczeństwo',
      '- Model zagrożeń (#127).',
      '',
      '## Upgrade notes',
      '',
      ENTRY.trim(),
      '',
      'Full history: CHANGELOG.md. Rollback: docs/DEPLOYMENT.md §10.',
      ''
    ].join('\n'));
  });

  it('says there are no upgrade notes when the version has none', () => {
    const { body } = renderRelease(released, '0.3.0', upgrade());
    expect(body).toContain('## Upgrade notes\n\nNone: this release is backward compatible (BACKWARD_COMPATIBILITY.md).');
  });

  it('refuses a version that is not in the changelog or has no entries', () => {
    expect(renderRelease(released, '0.4.0', upgrade()).problems).toEqual(['CHANGELOG.md: no "## [0.4.0] - YYYY-MM-DD" section (promote [Unreleased] first)']);
    expect(renderRelease(changelog('## [Unreleased]\n\n', '## [0.3.0] - 2026-11-09\n\n'), '0.3.0', upgrade()).problems).toEqual(['CHANGELOG.md: [0.3.0] has no entries']);
    expect(renderRelease(released, 'v0.3.0', upgrade()).problems).toEqual(['version "v0.3.0" is not semver X.Y.Z (no leading v)']);
  });
});

describe('promote', () => {
  it('moves [Unreleased] under a dated version heading and leaves an empty [Unreleased]', () => {
    const r = promote(changelog(), '0.3.0', '2026-11-09', upgrade(ENTRY));
    expect(r.problems).toEqual([]);
    expect(r.changelog).toBe(changelog('## [Unreleased]\n\n', `## [0.3.0] - 2026-11-09\n\n${UNRELEASED.slice('## [Unreleased]\n\n'.length)}${OLD}`));
    expect(r.upgradeNotes).toBe(upgrade('', `## [0.3.0] - 2026-11-09\n\n${ENTRY}`));
    expect(renderRelease(r.changelog, '0.3.0', r.upgradeNotes).problems).toEqual([]);
  });

  it('leaves UPGRADE_NOTES.md as it is when nothing breaking is listed', () => {
    const u = upgrade();
    expect(promote(changelog(), '0.3.0', '2026-11-09', u).upgradeNotes).toBe(u);
  });

  it('refuses an existing or older version, a bad date, an empty [Unreleased] and a broken upgrade note', () => {
    expect(promote(changelog(), '0.2.0', '2026-11-09', upgrade()).problems).toEqual(['version 0.2.0 is not newer than the latest released 0.2.0']);
    expect(promote(changelog(), '0.3.0', '2026-13-01', upgrade()).problems).toEqual(['date "2026-13-01" is not a valid YYYY-MM-DD']);
    expect(promote(changelog('## [Unreleased]\n\n'), '0.3.0', '2026-11-09', upgrade()).problems).toContain('CHANGELOG.md: [Unreleased] has no entries ("- …" lines)');
    expect(promote(changelog(), '0.3.0', '2026-11-09', upgrade('### Bez pól\n- x\n\n')).problems[0]).toContain('lacks **Kogo dotyczy:**');
  });
});

describe('release-notes CLI', () => {
  it('check exits 0 on a good changelog and 1 on an empty [Unreleased]', () => {
    expect(run(['check', '--root', dir({ 'CHANGELOG.md': changelog(), 'UPGRADE_NOTES.md': upgrade() })]).status).toBe(0);
    const bad = run(['check', '--root', dir({ 'CHANGELOG.md': changelog('## [Unreleased]\n\n'), 'UPGRADE_NOTES.md': upgrade() })]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('[Unreleased] has no entries');
  });

  it('promote is a dry run by default and writes both files only with --write', () => {
    const root = dir({ 'CHANGELOG.md': changelog(), 'UPGRADE_NOTES.md': upgrade(ENTRY) });
    const dry = run(['promote', '0.3.0', '--date', '2026-11-09', '--root', root]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain('dry run');
    expect(dry.stdout).toContain('## [0.3.0] - 2026-11-09');
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toBe(changelog());
    expect(run(['promote', '0.3.0', '--date', '2026-11-09', '--write', '--root', root]).status).toBe(0);
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain('## [0.3.0] - 2026-11-09');
    expect(readFileSync(join(root, 'UPGRADE_NOTES.md'), 'utf8')).toContain('## [0.3.0] - 2026-11-09');
  });

  it('render prints the body on stdout or writes it with --out', () => {
    const root = dir({ 'CHANGELOG.md': changelog('## [Unreleased]\n\n', `## [0.3.0] - 2026-11-09\n\n### A\n- a (#1).\n\n${OLD}`), 'UPGRADE_NOTES.md': upgrade() });
    const r = run(['render', '0.3.0', '--root', root]);
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith('### A\n- a (#1).\n')).toBe(true);
    const out = join(root, 'body.md');
    expect(run(['render', '0.3.0', '--root', root, '--out', out]).status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(r.stdout);
    expect(run(['render', '0.9.0', '--root', root]).status).toBe(1);
  });

  it('usage errors exit 2', () => {
    expect(run([]).status).toBe(2);
    expect(run(['render']).status).toBe(2);
    expect(run(['promote', '0.3.0', '--date']).status).toBe(2);
  });
});
