import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFiles, loadSchemas, validate } from '../../../scripts/review-validate.mjs';

/**
 * Lesson 21: the reviewer input package and the reviewer output have JSON contracts (`.ai/schemas/`). The input has
 * no place for the author's rationale; every finding carries evidence; all answers of a round refer to the same input.
 */
const SCRIPT = fileURLToPath(new URL('../../../scripts/review-validate.mjs', import.meta.url));
const SCHEMAS = loadSchemas();

const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });
function dir() {
  const root = mkdtempSync(join(tmpdir(), 'review validate ł% '));
  roots.push(root);
  return root;
}

const input = (o: Record<string, unknown> = {}) => ({
  schemaVersion: 1, kind: 'review-input', subject: 'code', round: 1, risk: 'risk-medium',
  spec: '## Wymagania\nR1 kwota bez liter', acceptanceCriteria: ['AC1 litera w polu kwoty jest odrzucona'],
  rules: ['AGENTS.md §7', '.ai/docs/review-checklists.md#general'], diff: 'diff --git a/x b/x\n+1\n',
  findingsRequested: { min: 7, max: 9 }, ...o
});
const finding = (o: Record<string, unknown> = {}) => ({
  id: 'F1', severity: 'major', location: 'packages/app/src/x.ts:12', claim: 'Comma is not normalised',
  evidence: 'input "12,50" gives NaN; AC1 requires 12.50', suggestion: 'normalise before parse', ...o
});
const output = (digest: string, o: Record<string, unknown> = {}) => ({
  schemaVersion: 1, kind: 'review-output', inputDigest: digest, round: 1,
  reviewer: { family: 'anthropic', model: 'claude-opus-5-5' }, verdict: 'remarks',
  findings: [finding()], notChecked: ['did not run e2e'], ...o
});
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('validate (schema subset)', () => {
  it('accepts a complete input package and output', () => {
    expect(validate(SCHEMAS.input, input())).toEqual([]);
    expect(validate(SCHEMAS.output, output('a'.repeat(64)))).toEqual([]);
  });

  it('rejects the author rationale or a PR description in the input package (no such field)', () => {
    const errors = validate(SCHEMAS.input, input({ authorRationale: 'This is safe, I checked it', prDescription: 'LGTM' }));
    expect(errors).toEqual(expect.arrayContaining(['/authorRationale: unknown property', '/prDescription: unknown property']));
  });

  it('caps review at three rounds', () => {
    expect(validate(SCHEMAS.input, input({ round: 4 }))).toContain('/round: must be <= 3');
    expect(validate(SCHEMAS.output, output('a'.repeat(64), { round: 0 }))).toContain('/round: must be >= 1');
  });

  it('requires evidence on every finding', () => {
    const noEvidence = { ...finding() } as Record<string, unknown>;
    delete noEvidence.evidence;
    expect(validate(SCHEMAS.output, output('a'.repeat(64), { findings: [noEvidence] }))).toContain('/findings/0: missing required property "evidence"');
    expect(validate(SCHEMAS.output, output('a'.repeat(64), { findings: [finding({ evidence: 're-check' })] }))).toContain('/findings/0/evidence: shorter than 10 characters');
  });

  it('reports wrong types, enums and patterns with a JSON pointer', () => {
    const errors = validate(SCHEMAS.output, output('XYZ', { verdict: 'approve', reviewer: { family: 'Open AI', model: 'x' }, findings: 'none' }));
    expect(errors).toEqual(expect.arrayContaining([
      '/inputDigest: does not match ^[0-9a-f]{64}$',
      '/verdict: must be one of "ok-for-owner", "remarks", "changes-required", "cannot-assess"',
      '/reviewer/family: does not match ^[a-z0-9][a-z0-9-]{0,31}$',
      '/findings: must be array'
    ]));
  });

  it('does not let __proto__ or constructor keys slip through as known properties', () => {
    const value = JSON.parse('{"schemaVersion":1,"kind":"review-input","__proto__":{"x":1}}');
    expect(validate(SCHEMAS.input, value)).toContain('/__proto__: unknown property');
  });

  it('fails closed on a schema keyword it does not implement', () => {
    expect(() => validate({ type: 'object', oneOf: [] }, {})).toThrow(/unsupported schema keyword "oneOf"/);
  });
});

describe('checkFiles (cross-file rules)', () => {
  it('passes one input and two answers that carry its digest and round', () => {
    const root = dir();
    const text = JSON.stringify(input());
    writeFileSync(join(root, 'in.json'), text);
    writeFileSync(join(root, 'a.json'), JSON.stringify(output(sha(text))));
    writeFileSync(join(root, 'b.json'), JSON.stringify(output(sha(text), { reviewer: { family: 'openai', model: 'gpt-x' } })));
    const result = checkFiles([join(root, 'in.json'), join(root, 'a.json'), join(root, 'b.json')]);
    expect(result.problems).toEqual([]);
    expect(result).toMatchObject({ checked: 3, answers: 2, families: 2 });
  });

  it('rejects an answer to a different input, another round and duplicate finding ids', () => {
    const root = dir();
    const text = JSON.stringify(input());
    writeFileSync(join(root, 'in.json'), text);
    writeFileSync(join(root, 'a.json'), JSON.stringify(output('b'.repeat(64), { round: 2, findings: [finding(), finding()] })));
    const problems = checkFiles([join(root, 'in.json'), join(root, 'a.json')]).problems.map((p: { file: string; message: string }) => p.message);
    expect(problems).toEqual(expect.arrayContaining([
      'inputDigest does not match the SHA-256 of the input file',
      'round 2 differs from the input round 1',
      '/findings/1/id: duplicate finding id "F1"'
    ]));
  });

  it('rejects an input whose findingsRequested min is greater than max', () => {
    const root = dir();
    writeFileSync(join(root, 'in.json'), JSON.stringify(input({ findingsRequested: { min: 9, max: 7 } })));
    expect(checkFiles([join(root, 'in.json')]).problems.map((p: { message: string }) => p.message)).toContain('/findingsRequested: min (9) is greater than max (7)');
  });

  describe('answers need exactly one valid input (review of PR 140)', () => {
    const NEED_ONE = /needs exactly one valid review-input among the files \(found \d+\)/;
    it('fails an answer given alone, even with a made-up inputDigest', () => {
      const root = dir();
      writeFileSync(join(root, 'o.json'), JSON.stringify(output('c'.repeat(64))));
      const problems = checkFiles([join(root, 'o.json')]).problems.map((p: { message: string }) => p.message);
      expect(problems.some((m: string) => NEED_ONE.test(m))).toBe(true);
    });

    it('fails answers next to two inputs', () => {
      const root = dir();
      const text = JSON.stringify(input());
      writeFileSync(join(root, 'in1.json'), text);
      writeFileSync(join(root, 'in2.json'), JSON.stringify(input({ round: 2 })));
      writeFileSync(join(root, 'o.json'), JSON.stringify(output(sha(text))));
      const problems = checkFiles([join(root, 'in1.json'), join(root, 'in2.json'), join(root, 'o.json')]).problems.map((p: { message: string }) => p.message);
      expect(problems.some((m: string) => NEED_ONE.test(m))).toBe(true);
    });

    it('fails answers when the input does not parse or is invalid', () => {
      const root = dir();
      writeFileSync(join(root, 'in.json'), '{"kind":"review-input",');
      writeFileSync(join(root, 'bad-in.json'), JSON.stringify(input({ round: 9 })));
      writeFileSync(join(root, 'o.json'), JSON.stringify(output('d'.repeat(64))));
      for (const inp of ['in.json', 'bad-in.json']) {
        const problems = checkFiles([join(root, inp), join(root, 'o.json')]).problems;
        expect(problems.some((p: { file: string; message: string }) => p.file.endsWith('o.json') && NEED_ONE.test(p.message)), inp).toBe(true);
      }
    });
  });

  it('rejects two answers from the same reviewer and the same answer file passed twice, and counts families', () => {
    const root = dir();
    const text = JSON.stringify(input());
    writeFileSync(join(root, 'in.json'), text);
    writeFileSync(join(root, 'a.json'), JSON.stringify(output(sha(text))));
    writeFileSync(join(root, 'b.json'), JSON.stringify(output(sha(text), { verdict: 'ok-for-owner' })));
    const result = checkFiles([join(root, 'in.json'), join(root, 'a.json'), join(root, 'b.json'), join(root, 'a.json')]);
    const messages = result.problems.map((p: { message: string }) => p.message);
    expect(messages.filter((m: string) => /same reviewer \(anthropic\/claude-opus-5-5\) as /.test(m))).toHaveLength(2);
    expect(messages.some((m: string) => /same file content as /.test(m))).toBe(true);
    expect(result.families).toBe(1);
  });

  it('rejects a file without a known kind and unreadable JSON, without quoting the file content', () => {
    const root = dir();
    writeFileSync(join(root, 'x.json'), '{"kind":"review-verdict"}');
    writeFileSync(join(root, 'y.json'), 'PRIVATE-KEY-abc123 {not json');
    const problems = checkFiles([join(root, 'x.json'), join(root, 'y.json')]).problems.map((p: { message: string }) => p.message);
    expect(problems[0]).toMatch(/kind must be "review-input" or "review-output"/);
    expect(problems[1]).toMatch(/^not valid JSON( at position \d+)?$/);
    expect(problems.join('\n')).not.toContain('PRIVATE-KEY');
  });
});

describe('CLI', () => {
  it('exits 0 on valid files, 1 on invalid ones, 2 without arguments, from a path with a space and non-ASCII', () => {
    const root = dir();
    const text = JSON.stringify(input());
    writeFileSync(join(root, 'in.json'), text);
    writeFileSync(join(root, 'bad.json'), JSON.stringify(output(sha(text), { verdict: 'approve' })));
    const ok = spawnSync(process.execPath, [SCRIPT, join(root, 'in.json')], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/review:validate OK: 1 file/);
    const bad = spawnSync(process.execPath, [SCRIPT, join(root, 'in.json'), join(root, 'bad.json')], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('bad.json: /verdict: must be one of');
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2);
  });

  it('names files by the path given (two same-named files stay distinguishable) and reports the family count', () => {
    const root = dir();
    const text = JSON.stringify(input());
    mkdirSync(join(root, 'r1'));
    mkdirSync(join(root, 'r2'));
    writeFileSync(join(root, 'in.json'), text);
    writeFileSync(join(root, 'r1', 'answer.json'), JSON.stringify(output(sha(text))));
    writeFileSync(join(root, 'r2', 'answer.json'), JSON.stringify(output(sha(text), { verdict: 'approve', reviewer: { family: 'openai', model: 'gpt-x' } })));
    const bad = spawnSync(process.execPath, [SCRIPT, join(root, 'in.json'), join(root, 'r1', 'answer.json'), join(root, 'r2', 'answer.json')], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain(`${join(root, 'r2', 'answer.json')}: /verdict: must be one of`);
    writeFileSync(join(root, 'r2', 'answer.json'), JSON.stringify(output(sha(text), { reviewer: { family: 'openai', model: 'gpt-x' } })));
    const ok = spawnSync(process.execPath, [SCRIPT, join(root, 'in.json'), join(root, 'r1', 'answer.json'), join(root, 'r2', 'answer.json')], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('review:validate OK: 3 file(s): 1 input, 2 answer(s) from 2 model family(ies).');
  });

  it('ships schemas that are valid JSON and name the protocol section', () => {
    for (const name of ['review-input', 'review-output']) {
      const schema = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../.ai/schemas/${name}.schema.json`, import.meta.url)), 'utf8'));
      expect(schema.description).toContain('review-protocol.md');
      expect(schema.additionalProperties).toBe(false);
    }
  });
});
