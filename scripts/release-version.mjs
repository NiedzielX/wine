#!/usr/bin/env node
/**
 * One version for the whole monorepo (lesson 22, docs/RELEASING.md). Deterministic, offline, no dependencies.
 *
 *   npm run release:version                         same as --check
 *   npm run release:version -- --check [--expect X.Y.Z]
 *   npm run release:version -- --set X.Y.Z [--write]
 *   (--root <dir> runs on another tree; tests use it)
 *
 * --check: the root package.json, every workspace package.json and package-lock.json (`version`, `packages[""]`,
 *   `packages["<workspace>"]`) carry the same plain X.Y.Z version (no prerelease, no +build, no leading zeros) and equal
 *   --expect when given; malformed JSON is reported as "<file>: not valid JSON". An internal dependency
 *   (`@wine-match/*` in any dependency block) whose range the workspace version does not satisfy is a problem too: npm
 *   would fetch that name from the registry instead of linking the workspace (dependency confusion).
 * --set: changes ONLY those `version` fields, by editing the text in place (formatting, key order and escapes stay as
 *   they are), and proves it by parsing the result and comparing it with the expected objects. It never touches a
 *   dependency range: when an exact internal pin would stop matching, it refuses and says which one to change by hand.
 *   Without --write it prints the plan and writes nothing.
 * Exit 0: consistent (or plan applied / printed); 1: a problem; 2: usage (also --check with --set, --expect with --set,
 * --write without --set, a flag given twice).
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const REPO = fileURLToPath(new URL('..', import.meta.url));
// Releases are plain X.Y.Z (docs/RELEASING.md §3): no prerelease, no build metadata, no leading zeros. Rejecting them
// everywhere keeps ordering trivial (numeric X, Y, Z) and the same in release-notes.mjs.
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NOT_XYZ = 'is not X.Y.Z (digits only: no leading v, leading zeros, -prerelease or +build; docs/RELEASING.md §3)';
const DEP_BLOCKS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const INTERNAL = '@wine-match/';

export const isSemver = (v) => typeof v === 'string' && SEMVER.test(v);

function parseCore(v) {
  const m = SEMVER.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** `*`, an exact version, `^x.y.z` and `~x.y.z` (npm semantics, including 0.x); anything else is "unsupported". */
export function satisfies(version, range) {
  const r = range.trim();
  if (r === '*' || r === '') return true;
  const v = parseCore(version);
  if (!v) return false;
  if (isSemver(r)) return r === version;
  const m = /^([\^~])(.+)$/.exec(r);
  const base = m ? parseCore(m[2]) : null;
  if (!m || !base || !isSemver(m[2])) return 'unsupported';
  if (cmp(v, base) < 0) return false;
  if (m[1] === '~') return v[0] === base[0] && v[1] === base[1];
  if (base[0] > 0) return v[0] === base[0];
  if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
  return v[0] === 0 && v[1] === 0 && v[2] === base[2];
}

function readJson(root, file) {
  const path = join(root, file);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // Read directly and handle ENOENT: an existence check before the read is a check-then-use race (CodeQL js/file-system-race).
    if (error && error.code === 'ENOENT') return { text: null, json: null };
    throw error;
  }
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    // reported as "<file>: not valid JSON" (no parser message: newer V8 quotes the file content in it)
    return { text, json: null, invalid: true };
  }
}

/** Everything the version lives in, read once. Unparsable JSON is marked `invalid`, never thrown. */
export function readTree(root) {
  const pkg = readJson(root, 'package.json');
  const lock = readJson(root, 'package-lock.json');
  const workspaces = Array.isArray(pkg.json?.workspaces) ? pkg.json.workspaces : [];
  const ws = workspaces.map((dir) => ({ dir, file: `${dir}/package.json`, ...readJson(root, `${dir}/package.json`) }));
  return { pkg, lock, ws };
}

function internalPins(tree, versionOf) {
  const problems = [];
  const report = (where, block, name, range) => {
    const target = versionOf.get(name);
    if (target === undefined) return;
    const ok = satisfies(target, range);
    if (ok === true) return;
    problems.push(ok === 'unsupported'
      ? `${where}${block}["${name}"]: range "${range}" is not one this check understands (use "*")`
      : `${where}${block}["${name}"]: "${range}" does not match the workspace version ${target}; npm would look for it in the registry (dependency confusion). Change the range to "*" in a reviewed PR`);
  };
  const scan = (where, obj) => {
    for (const block of DEP_BLOCKS) {
      for (const [name, range] of Object.entries(obj?.[block] ?? {})) {
        if (name.startsWith(INTERNAL) && typeof range === 'string') report(where, block, name, range);
      }
    }
  };
  for (const w of ws(tree)) scan(`${w.file} `, w.json);
  for (const w of ws(tree)) scan(`package-lock.json packages["${w.dir}"].`, tree.lock.json?.packages?.[w.dir]);
  return problems;
}
const ws = (tree) => tree.ws.filter((w) => w.json);

/** Every place that must carry `version`, compared with the root package.json. */
function consistency(tree, version) {
  const problems = [];
  const differs = (v) => v !== version;
  const has = `root package.json has ${version}`;
  for (const w of tree.ws) {
    if (!w.json) problems.push(`${w.file}: ${w.invalid ? 'not valid JSON' : 'missing'}`);
    else if (differs(w.json.version)) problems.push(`${w.file}: version is ${w.json.version}, ${has}`);
  }
  const lock = tree.lock.json;
  if (!lock) return [...problems, `package-lock.json: ${tree.lock.invalid ? 'not valid JSON' : 'missing'}`];
  if (differs(lock.version)) problems.push(`package-lock.json version: ${lock.version}, ${has}`);
  if (differs(lock.packages?.['']?.version)) problems.push(`package-lock.json packages[""].version: ${lock.packages?.['']?.version}, ${has}`);
  for (const w of tree.ws) {
    const entry = lock.packages?.[w.dir];
    if (!entry) problems.push(`package-lock.json packages["${w.dir}"]: missing (run npm install)`);
    else if (differs(entry.version)) problems.push(`package-lock.json packages["${w.dir}"].version: ${entry.version}, ${has}`);
  }
  return problems;
}

const versionMap = (tree, version) => new Map(ws(tree).map((w) => [w.json.name, version]));

/** `{ version, problems }`: version is the root package.json's; `expect` (optional) must equal it. */
export function checkVersions(root, expect) {
  if (expect !== undefined && !isSemver(expect)) return { version: null, problems: [`--expect "${expect}" ${NOT_XYZ}`] };
  const tree = readTree(root);
  if (!tree.pkg.json) return { version: null, problems: [`package.json: ${tree.pkg.invalid ? 'not valid JSON' : 'missing'}`] };
  const version = tree.pkg.json.version;
  const problems = [];
  if (!isSemver(version)) problems.push(`package.json: version ${JSON.stringify(version)} ${NOT_XYZ}`);
  else if (expect !== undefined && expect !== version) problems.push(`package.json: version is ${version}, expected ${expect}`);
  problems.push(...consistency(tree, version));
  if (isSemver(version)) problems.push(...internalPins(tree, versionMap(tree, version)));
  return { version: version ?? null, problems };
}

function replaceField(text, regex, to) {
  let hits = 0;
  const all = new RegExp(regex.source, `${regex.flags}g`);
  const out = text.replace(all,(_m, head, _old, tail) => { hits += 1; return `${head}${to}${tail}`; });
  return hits === 1 ? out : null;
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The new file contents for `version`, or problems. Nothing is written here. */
export function planSet(root, version) {
  if (!isSemver(version)) return { changes: [], files: {}, problems: [`version "${version}" ${NOT_XYZ}`] };
  const tree = readTree(root);
  const start = checkVersions(root);
  if (start.problems.length > 0) return { changes: [], files: {}, problems: start.problems };
  const pins = internalPins(tree, versionMap(tree, version));
  if (pins.length > 0) return { changes: [], files: {}, problems: pins };

  const from = start.version;
  const changes = [];
  const files = {};
  const problems = [];
  const TOP = /^(  "version": ")([^"]*)(")/m;
  const edit = (file, text, json, mutate, regexes) => {
    let next = text;
    for (const [label, regex] of regexes) {
      const r = replaceField(next, regex, version);
      if (r === null) { problems.push(`${file}: could not find exactly one ${label} field to change`); return; }
      next = r;
      changes.push({ file, field: label, from, to: version });
    }
    const expected = structuredClone(json);
    mutate(expected);
    if (!isDeepStrictEqual(JSON.parse(next), expected)) { problems.push(`${file}: the edit changed more than the version fields; nothing written`); return; }
    files[file] = next;
  };
  edit('package.json', tree.pkg.text, tree.pkg.json, (j) => { j.version = version; }, [['version', TOP]]);
  for (const w of tree.ws) edit(w.file, w.text, w.json, (j) => { j.version = version; }, [['version', TOP]]);
  const block = (key) => new RegExp(`("${escape(key)}": \\{\\n(?:      [^\\n]*\\n)*?      "version": ")([^"]*)(")`);
  edit('package-lock.json', tree.lock.text, tree.lock.json, (j) => {
    j.version = version;
    j.packages[''].version = version;
    for (const w of tree.ws) j.packages[w.dir].version = version;
  }, [['version', TOP], ['packages[""].version', block('')], ...tree.ws.map((w) => [`packages["${w.dir}"].version`, block(w.dir)])]);
  return problems.length > 0 ? { changes: [], files: {}, problems } : { changes, files, problems };
}

function usage(out) {
  out.error('usage: npm run release:version -- [--check [--expect X.Y.Z] | --set X.Y.Z [--write]] [--root <dir>]');
  return 2;
}

export function main(argv = process.argv.slice(2), out = console) {
  const args = argv.filter((a) => a !== '--');
  const seen = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (seen.has(a)) return usage(out); // a flag given twice is ambiguous
    if (a === '--check' || a === '--write') seen.set(a, true);
    else if (a === '--set' || a === '--expect' || a === '--root') {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) return usage(out);
      seen.set(a, v);
      i += 1;
    } else return usage(out);
  }
  // --check and --set are two modes; --expect belongs to --check, --write to --set: any other mix is refused
  if (seen.has('--set') && (seen.has('--check') || seen.has('--expect'))) return usage(out);
  if (seen.has('--write') && !seen.has('--set')) return usage(out);
  const mode = seen.has('--set') ? 'set' : 'check';
  const value = seen.get('--set');
  const expect = seen.get('--expect');
  const write = seen.has('--write');
  const root = seen.has('--root') ? resolve(seen.get('--root')) : REPO;
  if (mode === 'check') {
    const { version, problems } = checkVersions(root, expect);
    if (problems.length > 0) {
      for (const p of problems) out.error(p);
      out.error(`\nrelease:version FAILED: ${problems.length} problem(s). Process: docs/RELEASING.md.`);
      return 1;
    }
    const tree = readTree(root);
    const places = 1 + tree.ws.length + 2 + tree.ws.length;
    out.log(`release:version OK: ${version} in ${places} places (package.json, ${tree.ws.length} workspaces, package-lock.json).`);
    return 0;
  }
  const plan = planSet(root, value);
  if (plan.problems.length > 0) {
    for (const p of plan.problems) out.error(p);
    out.error('\nrelease:version --set refused; nothing written.');
    return 1;
  }
  for (const c of plan.changes) out.log(`${c.file} ${c.field}: ${c.from} -> ${c.to}`);
  if (!write) {
    out.log(`\ndry run: ${plan.changes.length} field(s) would change; add --write to apply, then run npm run release:version -- --check --expect ${value}.`);
    return 0;
  }
  for (const [file, text] of Object.entries(plan.files)) writeFileSync(join(root, file), text);
  out.log(`\nwritten: ${Object.keys(plan.files).length} file(s).`);
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
