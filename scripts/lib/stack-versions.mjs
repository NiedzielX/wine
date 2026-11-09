/**
 * The stack table in AGENTS.md §1.1 compared with the package.json files (used by scripts/check-context.mjs).
 * Offline, no dependencies, deterministic.
 *
 * The table has a technology column and a version column. A version cell holds one or more segments separated by
 * ", ", " / " or " + ": a bare version (`16.4.3`) takes its name from the technology at the same position, a labelled
 * one (`MikroORM 7.2.5`, `PG ≥ 16`, `Node ≥ 22.17`) names itself. What is compared:
 *   - a known package with an exact version: the exact pins (`dependencies`, `devDependencies`,
 *     `optionalDependencies`) in the root and every packages/<name>/package.json; ranges there (peer ranges) are skipped;
 *   - npm and Node written as `≥ X`: the minimum in the root `engines`.
 * A range of something that is not a package (`PG ≥ 16`) and a non-version token (`new-york-v4`) are skipped quietly.
 * Anything else that cannot be compared is a finding with `unchecked: true` ("cell for X not checked: <reason>"): a
 * version-like token that is neither exact nor `≥` (`~7.0.2`, `^7.0.2`), a package written as a range, more bare
 * versions than technology names, an exact version of an unknown technology. So the table cannot silently stop being
 * guarded.
 */

// Table label (lower case) -> where its version lives.
const KNOWN = new Map([
  ['next.js', { packages: ['next'] }],
  ['react', { packages: ['react'] }],
  ['typescript', { packages: ['typescript'] }],
  ['mikroorm', { prefix: '@mikro-orm/' }],
  ['awilix', { packages: ['awilix'] }],
  ['tailwind css', { packages: ['tailwindcss'] }],
  ['vitest', { packages: ['vitest'] }],
  ['npm', { engine: 'npm' }],
  ['node', { engine: 'node' }]
]);

const SEPARATOR = /(\s*,\s*|\s+\/\s+|\s+\+\s+)/;
const SEGMENT = /^(?:(\p{L}[\p{L}\p{N}.-]*(?:\s+\p{L}[\p{L}\p{N}.-]*)*)\s+)?(≥|>=)?\s*v?(\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.]+)?)$/du;
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

function cellsOf(line) {
  const body = line.replace(/\r$/, '');
  if (!body.trimStart().startsWith('|')) return null;
  const parts = body.split('|');
  const cells = [];
  let offset = 0;
  parts.forEach((text, i) => {
    if (i > 0 && (i < parts.length - 1 || text.trim() !== '')) cells.push({ text, start: offset });
    offset += text.length + 1;
  });
  return cells;
}

const stripNotes = (text) => text.replace(/\([^)]*\)/g, ' ').replace(/`/g, '');
const names = (techCell) => stripNotes(techCell).split(SEPARATOR).filter((_, i) => i % 2 === 0).map((s) => s.trim());

/** Version entries of the §1.1 table, or null when there is no §1.1 heading. Lines are 1-based, columns 0-based. */
export function parseStackTable(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#{2,4}\s+1\.1[.\s]/.test(l));
  if (start === -1) return null;
  const entries = [];
  const skipped = [];
  let header = null;
  let inTable = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) break;
    const cells = cellsOf(line);
    if (!cells) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    if (!header) {
      const h = cells.map((c) => c.text.trim().toLowerCase());
      const version = h.findIndex((x) => /wersja|version/.test(x));
      const tech = h.findIndex((x) => /technolog/.test(x));
      header = { version: version === -1 ? h.length - 1 : version, tech: tech === -1 ? h.length - 2 : tech };
      continue;
    }
    if (cells.every((c) => /^[\s:-]*$/.test(c.text))) continue; // separator row
    const versionCell = cells[header.version];
    if (!versionCell) continue;
    const techNames = names(cells[header.tech]?.text ?? '');
    const pieces = versionCell.text.split(SEPARATOR);
    const segmentCount = Math.ceil(pieces.length / 2);
    let offset = versionCell.start;
    let countReported = false;
    pieces.forEach((part, p) => {
      const partStart = offset;
      offset += part.length;
      if (p % 2 === 1) return;
      const lead = part.length - part.trimStart().length;
      const segment = part.trim();
      const m = SEGMENT.exec(segment);
      const position = p / 2;
      const positional = techNames.length === segmentCount ? techNames[position] : null;
      if (!m) {
        // `new-york-v4` is not a version; `~7.0.2`, `^7.0.2`, `7.0.x` look like one and must not pass silently.
        if (/\d+\.\d+/.test(segment)) skipped.push({ line: i + 1, label: positional ?? segment, reason: `"${segment}" is neither an exact version nor a ≥ range` });
        return;
      }
      const label = m[1] ?? positional;
      if (!label) {
        if (countReported) return; // once per cell
        countReported = true;
        skipped.push({ line: i + 1, label: techNames.join(', ') || segment, reason: `${segmentCount} versions for ${techNames.length} technology name(s); label each version (e.g. "React 19.3.1")` });
        return;
      }
      const key = label.toLowerCase();
      entries.push({
        line: i + 1,
        column: partStart + lead + m.indices[3][0],
        label,
        key: KNOWN.has(key) ? key : null,
        kind: m[2] ? 'range' : EXACT.test(m[3]) ? 'exact' : 'range',
        operator: m[2] ?? null,
        token: m[3]
      });
    });
  }
  return { entries, skipped };
}

function exactPins(packages, match) {
  const pins = [];
  for (const { file, json } of packages) {
    if (!json || typeof json !== 'object') continue;
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(json[field] ?? {})) {
        if (match(name) && typeof version === 'string' && EXACT.test(version)) pins.push({ name, version, file });
      }
    }
  }
  return pins;
}

const components = (v) => {
  const p = v.split('.').map(Number);
  while (p.length < 3) p.push(0);
  return p;
};
const sameVersion = (a, b) => components(a).join('.') === components(b).join('.');
/** The engine minimum written with at least as many components as the cell had (`22.18.0` into `22.17` -> `22.18`). */
function inPrecisionOf(version, documented) {
  const p = version.split('.');
  const keep = documented.split('.').length;
  while (p.length > keep && p[p.length - 1] === '0') p.pop();
  return p.join('.');
}

/**
 * Drift between the table and the package.json files. `packages`: the root package.json first, then the workspaces.
 * Each finding has a fix (one token at one position) when the right value is unambiguous, otherwise `fix: null`.
 */
export function checkStackVersions(text, packages) {
  const parsed = parseStackTable(text);
  if (!parsed) return [];
  const rootJson = packages[0]?.json && typeof packages[0].json === 'object' ? packages[0].json : {};
  const findings = [];
  const notChecked = (line, label, reason, documented = null) =>
    findings.push({ line, label, documented, actual: null, unchecked: true, message: `cell for ${label} not checked: ${reason}`, fix: null });
  for (const s of parsed.skipped) notChecked(s.line, s.label, s.reason);
  for (const e of parsed.entries) {
    const target = e.key ? KNOWN.get(e.key) : null;
    if (!target) {
      // A range of something that is not a package (`PG ≥ 16`) is fine; an exact version nobody compares is not.
      if (e.kind === 'exact') notChecked(e.line, e.label, `no package mapping for "${e.label}"; add it to KNOWN in scripts/lib/stack-versions.mjs`, e.token);
      continue;
    }
    const shown = `${e.label} ${e.operator ? `${e.operator} ` : ''}${e.token}`;
    const at = (to, message) => findings.push({ line: e.line, label: e.label, documented: e.token, actual: to, unchecked: false, message, fix: to ? { line: e.line, column: e.column, from: e.token, to } : null });
    if (target.engine) {
      if (e.kind !== 'range' || e.operator === null) {
        notChecked(e.line, e.label, `"${shown}": ${e.label} is compared as a ≥ range with package.json engines`, e.token);
        continue;
      }
      const declared = rootJson.engines?.[target.engine];
      const m = typeof declared === 'string' ? /^>=\s*v?(\d+(?:\.\d+){0,2})$/.exec(declared.trim()) : null;
      if (!m) at(null, `${shown}: package.json engines.${target.engine} is ${declared === undefined ? 'missing' : `"${declared}", not a >= range`}`);
      else if (!sameVersion(m[1], e.token)) at(inPrecisionOf(m[1], e.token), `${shown}, package.json engines.${target.engine} is ${declared}`);
      continue;
    }
    if (e.kind !== 'exact') {
      notChecked(e.line, e.label, `"${shown}" is a range; write the exact pin from package.json`, e.token);
      continue;
    }
    const pins = exactPins(packages, (name) => (target.prefix ? name.startsWith(target.prefix) : target.packages.includes(name)));
    const what = target.prefix ? `${target.prefix}*` : target.packages.join(', ');
    const distinct = [...new Set(pins.map((p) => p.version))];
    if (distinct.length === 0) at(null, `${shown}: no exact pin of ${what} in any package.json`);
    else if (distinct.length > 1) at(null, `${shown}: package.json pins of ${what} differ (${pins.map((p) => `${p.name} ${p.version} in ${p.file}`).join(', ')}); align them first`);
    else if (distinct[0] !== e.token) at(distinct[0], `${shown}, package.json pins ${distinct[0]} (${[...new Set(pins.map((p) => `${p.name} in ${p.file}`))].join(', ')})`);
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** Replaces each `from` token at its line and column with `to`; nothing else in the text changes. */
export function applyStackFixes(text, fixes) {
  const lines = text.split('\n');
  const ordered = [...fixes].sort((a, b) => a.line - b.line || b.column - a.column);
  for (const f of ordered) {
    const line = lines[f.line - 1] ?? '';
    if (line.slice(f.column, f.column + f.from.length) !== f.from) throw new Error(`line ${f.line}: expected ${f.from} at column ${f.column}`);
    lines[f.line - 1] = line.slice(0, f.column) + f.to + line.slice(f.column + f.from.length);
  }
  return lines.join('\n');
}
