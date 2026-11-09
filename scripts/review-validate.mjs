#!/usr/bin/env node
/**
 * Validates reviewer input packages and reviewer outputs against `.ai/schemas/review-input.schema.json` and
 * `.ai/schemas/review-output.schema.json` (lesson 21, `.ai/docs/review-protocol.md` §9). Deterministic, offline, no
 * dependencies: it reads only the files it is given and the two schemas.
 *
 *   npm run review:validate -- <file.json> [<file.json> ...]
 *
 * The kind of each file comes from its `kind` field. Beyond the schema:
 *  - input: `findingsRequested.min` <= `max`;
 *  - output: finding ids are unique;
 *  - outputs need exactly one input among the files, and it must be valid (none, an unparsable one, an invalid one or
 *    two fail every output); each output's `inputDigest` is the SHA-256 of that input file's bytes and its `round`
 *    equals the input's (all reviewers of a round answered the same package);
 *  - outputs come from distinct reviewers (`reviewer.family` + `reviewer.model` unique) and no output file is passed
 *    twice (same bytes). The summary line gives the number of model families.
 * It does NOT know how many reviewers were asked, so it cannot tell whether every answer arrived.
 * Exit 0: all valid; 1: a problem (`<path as given>: /pointer: message` on stderr; parse errors give only a position,
 * never file content); 2: usage or an unreadable schema.
 *
 * The schema interpreter supports only the keywords the two schemas use and throws on any other one (fail closed: an
 * unsupported keyword must not be silently ignored).
 */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_DIR = new URL('../.ai/schemas/', import.meta.url);
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description']);
const KEYWORDS = new Set(['type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);

export function loadSchemas() {
  const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`${name}.schema.json`, SCHEMA_DIR)), 'utf8'));
  return { input: read('review-input'), output: read('review-output') };
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

const matchesType = (v, t) => typeOf(v) === t || (t === 'number' && typeof v === 'number');

/** Returns `"/pointer: message"` strings; an empty array means valid. */
export function validate(schema, value, path = '') {
  const errors = [];
  const at = path || '/';
  for (const k of Object.keys(schema)) {
    if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) throw new Error(`unsupported schema keyword "${k}" at ${at}`);
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${at}: must be ${types.join(' or ')}`);
      return errors;
    }
  }
  if (typeof value === 'string') {
    const len = [...value].length;
    if (schema.minLength !== undefined && len < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && len > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: must be <= ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: allows at most ${schema.maxItems} item(s)`);
    if (schema.items) value.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}/${i}`)));
  }
  if (typeOf(value) === 'object') {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${at}: missing required property "${key}"`);
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(props, key)) errors.push(...validate(props[key], value[key], `${path}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}/${key}: unknown property`);
    }
  }
  return errors;
}

/** Validates files and the cross-file rules from the header comment. */
export function checkFiles(paths, schemas = loadSchemas()) {
  const problems = [];
  const docs = [];
  for (const file of paths) {
    let bytes;
    let value;
    try {
      bytes = readFileSync(file);
      value = JSON.parse(bytes.toString('utf8'));
    } catch (e) {
      // Never echo the parser's message: V8 quotes the first bytes of the file, which may be anything (a secret).
      const pos = e instanceof SyntaxError ? /position (\d+)/.exec(e.message)?.[1] : undefined;
      problems.push({ file, message: e instanceof SyntaxError ? `not valid JSON${pos ? ` at position ${pos}` : ''}` : 'cannot read the file' });
      continue;
    }
    const kind = typeOf(value) === 'object' ? value.kind : undefined;
    if (kind !== 'review-input' && kind !== 'review-output') {
      problems.push({ file, message: 'kind must be "review-input" or "review-output"' });
      continue;
    }
    const errors = validate(kind === 'review-input' ? schemas.input : schemas.output, value);
    if (kind === 'review-input') {
      const fr = value.findingsRequested;
      if (fr && Number.isInteger(fr.min) && Number.isInteger(fr.max) && fr.min > fr.max) errors.push(`/findingsRequested: min (${fr.min}) is greater than max (${fr.max})`);
    } else if (Array.isArray(value.findings)) {
      const seen = new Set();
      value.findings.forEach((f, i) => {
        const id = f && typeof f === 'object' ? f.id : undefined;
        if (typeof id !== 'string') return;
        if (seen.has(id)) errors.push(`/findings/${i}/id: duplicate finding id ${JSON.stringify(id)}`);
        seen.add(id);
      });
    }
    for (const message of errors) problems.push({ file, message });
    docs.push({ file, kind, value, valid: errors.length === 0, digest: createHash('sha256').update(bytes).digest('hex') });
  }
  const answers = docs.filter((d) => d.kind === 'review-output');
  const allInputs = docs.filter((d) => d.kind === 'review-input');
  const validInputs = allInputs.filter((d) => d.valid);
  // Answers are only meaningful against ONE valid input: with none (missing, unparsable, invalid) or several, a made-up
  // inputDigest would otherwise pass unchecked. An unparsable file has no kind, so it never counts as a valid input.
  const oneInput = allInputs.length === 1 && validInputs.length === 1;
  const families = new Set();
  const byContent = new Map();
  const byReviewer = new Map();
  for (const d of answers) {
    if (!oneInput) problems.push({ file: d.file, message: `answer needs exactly one valid review-input among the files (found ${validInputs.length})` });
    else {
      const [inp] = validInputs;
      if (d.value.inputDigest !== inp.digest) problems.push({ file: d.file, message: 'inputDigest does not match the SHA-256 of the input file' });
      if (d.value.round !== inp.value.round) problems.push({ file: d.file, message: `round ${d.value.round} differs from the input round ${inp.value.round}` });
    }
    if (byContent.has(d.digest)) problems.push({ file: d.file, message: `same file content as ${byContent.get(d.digest)}` });
    else byContent.set(d.digest, d.file);
    const r = d.value.reviewer;
    if (r && typeof r.family === 'string' && typeof r.model === 'string') {
      families.add(r.family);
      const key = `${r.family}/${r.model}`;
      if (byReviewer.has(key)) problems.push({ file: d.file, message: `same reviewer (${key}) as ${byReviewer.get(key)}: answers must come from distinct reviewers` });
      else byReviewer.set(key, d.file);
    }
  }
  return { problems, checked: docs.length, inputs: docs.length - answers.length, answers: answers.length, families: families.size };
}

export function main(argv = process.argv.slice(2), out = console) {
  const files = argv.filter((a) => a !== '--');
  if (files.length === 0 || files.some((f) => f.startsWith('--'))) {
    out.error('usage: npm run review:validate -- <file.json> [<file.json> ...]');
    return 2;
  }
  let schemas;
  try {
    schemas = loadSchemas();
  } catch (e) {
    out.error(`cannot read the schemas in .ai/schemas: ${e instanceof Error ? e.message : e}`);
    return 2;
  }
  const { problems, inputs, answers, families } = checkFiles(files, schemas);
  if (problems.length > 0) {
    for (const p of problems) out.error(`${p.file}: ${p.message}`);
    out.error(`\nreview:validate FAILED: ${problems.length} problem(s). Contract: .ai/schemas/, protocol: .ai/docs/review-protocol.md §9.`);
    return 1;
  }
  out.log(`review:validate OK: ${files.length} file(s): ${inputs} input, ${answers} answer(s) from ${families} model family(ies).`);
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
