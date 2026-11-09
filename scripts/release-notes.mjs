#!/usr/bin/env node
/**
 * Release notes from CHANGELOG.md and UPGRADE_NOTES.md (lesson 22, docs/RELEASING.md). Deterministic, offline, no
 * dependencies. Format: Keep a Changelog, `## [Unreleased]` on top, then `## [X.Y.Z] - YYYY-MM-DD`, newest first
 * (the historical `## [0.2.0]` has no date and is accepted). Headings inside ``` fences are ignored (examples).
 *
 *   npm run release:notes -- check                         [Unreleased] is non-empty and well-formed; upgrade notes complete
 *   npm run release:notes -- render X.Y.Z [--out <file>]   GitHub Release body for X.Y.Z (stdout or file)
 *   npm run release:notes -- promote X.Y.Z [--date YYYY-MM-DD] [--write]
 *                                                          [Unreleased] -> `## [X.Y.Z] - date` in both files; DRY RUN
 *                                                          unless --write (date: today in Europe/Warsaw)
 *   (--root <dir> reads the two files from another directory; tests use it)
 *
 * Well-formed [Unreleased]: only `### group` headings, `- entry` lines under a group, indented continuation lines and
 * blank lines; every group has an entry. An UPGRADE_NOTES.md entry is a `### title` with the four fields
 * **Kogo dotyczy:**, **Co się zmienia:**, **Co zrobić:**, **Wycofanie:**; an empty [Unreleased] there means "nothing
 * breaking". Exit 0: ok; 1: a problem; 2: usage.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const VERSION_HEADING = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/;
const UPGRADE_FIELDS = ['**Kogo dotyczy:**', '**Co się zmienia:**', '**Co zrobić:**', '**Wycofanie:**'];
const FOOTER = 'Full history: CHANGELOG.md. Rollback: docs/DEPLOYMENT.md §10.';

const isSemver = (v) => SEMVER.test(v);
const core = (v) => SEMVER.exec(v).slice(1, 4).map(Number);
const newer = (a, b) => { const x = core(a); const y = core(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

export function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
}

/** Sections that start with `## [` outside code fences. `start` is the heading's 0-based line, `end` is exclusive. */
export function parseSections(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const heads = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('```')) fence = !fence;
    else if (!fence && line.startsWith('## ')) heads.push(i);
  });
  const sections = heads.map((start, k) => {
    const heading = lines[start];
    const m = VERSION_HEADING.exec(heading);
    const name = m ? m[1] : null;
    return { start, end: heads[k + 1] ?? lines.length, heading, name, date: m?.[2] ?? null,
      unreleased: name === 'Unreleased' && !m[2], valid: Boolean(m) && (name === 'Unreleased' ? !m[2] : isSemver(name ?? '')) };
  });
  return { lines, sections };
}

const body = (lines, s) => lines.slice(s.start + 1, s.end);
const hasEntries = (ls) => ls.some((l) => l.startsWith('- '));

/** Strict shape of an [Unreleased] changelog body; `offset` is the 0-based line of the first body line. */
function checkGroups(ls, offset, file) {
  const problems = [];
  let group = null;
  let prev = 'blank';
  const closeGroup = () => { if (group && !group.entries) problems.push(`${file}:${group.line}: "${group.text}" has no entries`); };
  ls.forEach((line, i) => {
    const n = offset + i + 1;
    if (line.trim() === '') { prev = prev === 'entry' ? 'entry-gap' : 'blank'; return; }
    if (line.startsWith('### ')) { closeGroup(); group = { text: line, line: n, entries: 0 }; prev = 'group'; return; }
    if (line.startsWith('- ')) {
      if (!group) problems.push(`${file}:${n}: entry before any "### group" heading`);
      else group.entries += 1;
      prev = 'entry';
      return;
    }
    if (/^ {2,}\S/.test(line) && prev === 'entry') return;
    problems.push(`${file}:${n}: unexpected line in [Unreleased] (only "### group", "- entry" and indented continuation lines)`);
    prev = 'other';
  });
  closeGroup();
  return problems;
}

function structure(text, file) {
  const { lines, sections } = parseSections(text);
  const problems = [];
  const unreleased = sections.filter((s) => s.unreleased);
  if (unreleased.length === 0) problems.push(`${file}: no "## [Unreleased]" section`);
  if (unreleased.length > 1) problems.push(`${file}: "## [Unreleased]" appears ${unreleased.length} times`);
  let last = null;
  for (const s of sections) {
    if (!s.valid) { problems.push(`${file}:${s.start + 1}: version heading must be "## [X.Y.Z] - YYYY-MM-DD" (or "## [Unreleased]")`); continue; }
    if (s.unreleased) { if (last) problems.push(`${file}:${s.start + 1}: [Unreleased] must come before every version`); continue; }
    if (s.date && !validDate(s.date)) problems.push(`${file}:${s.start + 1}: date ${s.date} is not a valid YYYY-MM-DD`);
    if (last && newer(s.name, last) >= 0) problems.push(`${file}:${s.start + 1}: [${s.name}] is listed after [${last}]: newest version first`);
    last = s.name;
  }
  return { lines, sections, problems, unreleased: unreleased[0] ?? null, latest: sections.find((s) => s.valid && !s.unreleased)?.name ?? null };
}

/** CHANGELOG.md: structure, and a non-empty, well-formed [Unreleased]. */
export function checkChangelog(text) {
  const file = 'CHANGELOG.md';
  const { lines, problems, unreleased } = structure(text, file);
  if (unreleased) {
    const ls = body(lines, unreleased);
    problems.push(...checkGroups(ls, unreleased.start + 1, file));
    if (!hasEntries(ls)) problems.push(`${file}: [Unreleased] has no entries ("- …" lines)`);
  }
  return problems;
}

function entries(lines, s) {
  const out = [];
  for (let i = s.start + 1; i < s.end; i += 1) {
    if (lines[i].startsWith('### ')) out.push({ line: i, title: lines[i], text: [] });
    else if (out.length > 0) out[out.length - 1].text.push(lines[i]);
  }
  return out;
}

/** UPGRADE_NOTES.md: structure, and every entry in every section has the four fields. */
export function checkUpgradeNotes(text) {
  const file = 'UPGRADE_NOTES.md';
  const { lines, sections, problems } = structure(text, file);
  for (const s of sections.filter((x) => x.valid)) {
    for (const e of entries(lines, s)) {
      const joined = e.text.join('\n');
      const missing = UPGRADE_FIELDS.filter((f) => !joined.includes(f));
      if (missing.length > 0) problems.push(`${file}:${e.line + 1}: "${e.title}" lacks ${missing.join(', ')}`);
    }
  }
  return problems;
}

const trimBlank = (ls) => {
  let a = 0;
  let b = ls.length;
  while (a < b && ls[a].trim() === '') a += 1;
  while (b > a && ls[b - 1].trim() === '') b -= 1;
  return ls.slice(a, b);
};

/** The GitHub Release body for `version`: its changelog section, its upgrade notes (or "None"), a footer. */
export function renderRelease(changelogText, version, upgradeText = '') {
  if (!isSemver(version)) return { body: '', problems: [`version "${version}" is not semver X.Y.Z (no leading v)`] };
  const c = parseSections(changelogText);
  const section = c.sections.find((s) => s.valid && s.name === version);
  if (!section) return { body: '', problems: [`CHANGELOG.md: no "## [${version}] - YYYY-MM-DD" section (promote [Unreleased] first)`] };
  const changes = trimBlank(body(c.lines, section));
  if (!hasEntries(changes)) return { body: '', problems: [`CHANGELOG.md: [${version}] has no entries`] };
  const problems = upgradeText ? checkUpgradeNotes(upgradeText) : [];
  const u = parseSections(upgradeText);
  const us = u.sections.find((s) => s.valid && s.name === version);
  const notes = us && entries(u.lines, us).length > 0 ? trimBlank(body(u.lines, us)).join('\n')
    : 'None: this release is backward compatible (BACKWARD_COMPATIBILITY.md).';
  return { body: `${changes.join('\n')}\n\n## Upgrade notes\n\n${notes}\n\n${FOOTER}\n`, problems };
}

/** [Unreleased] body -> a new `## [version] - date` section right below an empty [Unreleased]. */
function moveUnreleased(lines, s, version, date) {
  const moved = body(lines, s);
  let a = 0;
  while (a < moved.length && moved[a].trim() === '') a += 1;
  const rest = moved.slice(a);
  if (s.end < lines.length && (rest.length === 0 || rest[rest.length - 1].trim() !== '')) rest.push('');
  return [...lines.slice(0, s.start + 1), '', `## [${version}] - ${date}`, '', ...rest, ...lines.slice(s.end)].join('\n');
}

export function promote(changelogText, version, date, upgradeText = '') {
  const fail = (problems) => ({ changelog: changelogText, upgradeNotes: upgradeText, problems });
  if (!isSemver(version)) return fail([`version "${version}" is not semver X.Y.Z (no leading v)`]);
  if (!validDate(date)) return fail([`date "${date}" is not a valid YYYY-MM-DD`]);
  const problems = [...checkChangelog(changelogText), ...checkUpgradeNotes(upgradeText)];
  if (problems.length > 0) return fail(problems);
  const c = structure(changelogText, 'CHANGELOG.md');
  if (c.latest && newer(version, c.latest) <= 0) return fail([`version ${version} is not newer than the latest released ${c.latest}`]);
  const u = structure(upgradeText, 'UPGRADE_NOTES.md');
  if (u.sections.some((s) => s.valid && s.name === version)) return fail([`UPGRADE_NOTES.md: [${version}] already exists`]);
  const changelog = moveUnreleased(c.lines, c.unreleased, version, date);
  const upgradeNotes = entries(u.lines, u.unreleased).length > 0 ? moveUnreleased(u.lines, u.unreleased, version, date) : upgradeText;
  return { changelog, upgradeNotes, problems: [] };
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function usage(out) {
  out.error('usage: npm run release:notes -- check | render X.Y.Z [--out <file>] | promote X.Y.Z [--date YYYY-MM-DD] [--write]   [--root <dir>]');
  return 2;
}

export function main(argv = process.argv.slice(2), out = console, stdout = (s) => process.stdout.write(s)) {
  const args = argv.filter((a) => a !== '--');
  const positional = [];
  const opts = { root: REPO, write: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--write') opts.write = true;
    else if (a === '--root' || a === '--date' || a === '--out') {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return usage(out);
      opts[a.slice(2)] = v;
      i += 1;
    } else if (a.startsWith('--')) return usage(out);
    else positional.push(a);
  }
  const [command, version] = positional;
  const needsVersion = command === 'render' || command === 'promote';
  if (!['check', 'render', 'promote'].includes(command) || (needsVersion && !version) || positional.length > (needsVersion ? 2 : 1)) return usage(out);
  const root = resolve(opts.root);
  const changelogPath = join(root, 'CHANGELOG.md');
  const upgradePath = join(root, 'UPGRADE_NOTES.md');
  if (!existsSync(changelogPath)) { out.error(`${changelogPath}: missing`); return 1; }
  const changelog = readFileSync(changelogPath, 'utf8');
  const upgrade = existsSync(upgradePath) ? readFileSync(upgradePath, 'utf8') : null;
  const failed = (problems) => {
    for (const p of problems) out.error(p);
    out.error(`\nrelease:notes ${command} FAILED: ${problems.length} problem(s). Process: docs/RELEASING.md.`);
    return 1;
  };
  if (upgrade === null) return failed(['UPGRADE_NOTES.md: missing']);

  if (command === 'check') {
    const problems = [...checkChangelog(changelog), ...checkUpgradeNotes(upgrade)];
    if (problems.length > 0) return failed(problems);
    out.log('release:notes OK: [Unreleased] in CHANGELOG.md has entries and is well-formed; UPGRADE_NOTES.md entries are complete.');
    return 0;
  }
  if (command === 'render') {
    const { body: text, problems } = renderRelease(changelog, version, upgrade);
    if (problems.length > 0) return failed(problems);
    if (opts.out) writeFileSync(resolve(opts.out), text);
    stdout(text);
    return 0;
  }
  const date = opts.date ?? today();
  const r = promote(changelog, version, date, upgrade);
  if (r.problems.length > 0) return failed(r.problems);
  const preview = renderRelease(r.changelog, version, r.upgradeNotes).body;
  out.log(`CHANGELOG.md: [Unreleased] -> ## [${version}] - ${date}`);
  out.log(`UPGRADE_NOTES.md: ${r.upgradeNotes === upgrade ? 'no entries in [Unreleased], unchanged' : `[Unreleased] -> ## [${version}] - ${date}`}`);
  out.log(`\nRelease body:\n\n${preview}`);
  if (!opts.write) {
    out.log('dry run: nothing written; add --write to apply.');
    return 0;
  }
  writeFileSync(changelogPath, r.changelog);
  if (r.upgradeNotes !== upgrade) writeFileSync(upgradePath, r.upgradeNotes);
  out.log('written.');
  return 0;
}

/** Fail closed (lesson 2026-11-05-script-main-guard-vs-paths): on any doubt about how we were started, run main(). */
function startedDirectly() {
  try {
    return !process.argv[1] || import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return true;
  }
}

if (startedDirectly()) process.exit(main());
