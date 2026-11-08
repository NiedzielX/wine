import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { announceDbTarget, describeDbTarget, parseDotenvValue, resetDbTargetAnnouncement, shadowWarning } from '../src/db-target';

/**
 * Lesson 18 (QA with AI): an exported DATABASE_URL pointed the seeder at an unrelated database and nobody saw it. Operator commands now
 * say WHICH database they act on (host:port/dbname, never credentials) and shout when the process environment overrides `.env`.
 */
const SECRET = 's3cret-db-pass';
const rootDir = fileURLToPath(new URL('../../..', import.meta.url));

describe('describeDbTarget', () => {
  it.each([
    ['postgres://operator:s3cret-db-pass@db.internal:5439/winematch', 'db.internal:5439/winematch'],
    ['postgresql://u:p@localhost/winematch_test', 'localhost:5432/winematch_test'],
    ['postgres://u:p@[::1]:5380/w', '[::1]:5380/w'],
    ['postgres://u:p%40ss@host:5432/my%20db?sslmode=require&password=s3cret-db-pass', 'host:5432/my db'],
    ['postgres://host:5432', 'host:5432/(no database name)']
  ])('shows only host:port/dbname of %s', (url, expected) => {
    const text = describeDbTarget(url);
    expect(text).toBe(expected);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('operator');
  });

  it.each([undefined, '', '   '])('says it is not set for %j', (url) => {
    expect(describeDbTarget(url)).toBe('(DATABASE_URL is not set)');
  });

  it('never echoes an unparseable value, which may still hold a password', () => {
    const text = describeDbTarget(`postgres://user:${SECRET}/not-a-url`);
    expect(text).toBe('(DATABASE_URL is not a valid URL)');
    expect(describeDbTarget(`${SECRET} garbage`)).not.toContain(SECRET);
  });
});

describe('parseDotenvValue', () => {
  const text = [
    '# a comment',
    'DB_POOL_MAX=10',
    'DATABASE_URL=postgres://a:b@one:1/x',
    'export OTHER="quoted value"  # trailing',
    "SINGLE='single'",
    'PLAIN=value # inline comment',
    'DATABASE_URL = postgres://a:b@two:2/y',
    ''
  ].join('\n');

  it('reads plain, exported and quoted values, drops inline comments, last assignment wins', () => {
    expect(parseDotenvValue(text, 'DATABASE_URL')).toBe('postgres://a:b@two:2/y');
    expect(parseDotenvValue(text, 'OTHER')).toBe('quoted value');
    expect(parseDotenvValue(text, 'SINGLE')).toBe('single');
    expect(parseDotenvValue(text, 'PLAIN')).toBe('value');
  });

  it('returns undefined for a missing key and does not match a longer name', () => {
    expect(parseDotenvValue(text, 'MISSING')).toBeUndefined();
    expect(parseDotenvValue('MY_DATABASE_URL=x', 'DATABASE_URL')).toBeUndefined();
  });
});

describe('shadowWarning', () => {
  const dotenv = `postgres://operator:${SECRET}@localhost:5432/winematch`;

  it('is silent when there is no .env value, no process value, or they are equal', () => {
    expect(shadowWarning(dotenv, undefined)).toBeNull();
    expect(shadowWarning(undefined, dotenv)).toBeNull();
    expect(shadowWarning(dotenv, dotenv)).toBeNull();
  });

  it('warns loudly, names both targets, says which one wins and leaks no credentials', () => {
    const text = shadowWarning('postgres://other:another-pass@prod.example.com:5432/customers', dotenv)!;
    expect(text).toMatch(/^WARNING/);
    expect(text).toContain('prod.example.com:5432/customers');
    expect(text).toContain('localhost:5432/winematch');
    expect(text).toContain('unset DATABASE_URL');
    for (const leak of [SECRET, 'another-pass', 'operator', 'other:']) expect(text).not.toContain(leak);
  });

  it('still warns when only the credentials differ (same target)', () => {
    const text = shadowWarning('postgres://operator:different@localhost:5432/winematch', dotenv)!;
    expect(text).toContain('same database');
    expect(text).not.toContain('different@');
  });
});

describe('announceDbTarget', () => {
  let dir: string;
  let dotenvPath: string;
  let lines: string[];
  const write = (line: string) => { lines.push(line); };
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'db-target-')); dotenvPath = join(dir, '.env'); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
  beforeEach(() => { lines = []; resetDbTargetAnnouncement(); rmSync(dotenvPath, { force: true }); });

  it('prints one target line naming the command and the source, with no credentials', () => {
    announceDbTarget({ command: 'db:seed', environment: { DATABASE_URL: `postgres://u:${SECRET}@db.internal:5390/winematch` }, dotenvPath, write });
    expect(lines).toEqual(['db:seed: database target db.internal:5390/winematch (DATABASE_URL from the process environment)']);
  });

  it('says the value comes from .env when both agree, and does not warn', () => {
    const url = 'postgres://u:p@localhost:5380/winematch';
    writeFileSync(dotenvPath, `DATABASE_URL=${url}\n`);
    announceDbTarget({ command: 'user:create', environment: { DATABASE_URL: url }, dotenvPath, write });
    expect(lines).toEqual(['user:create: database target localhost:5380/winematch (DATABASE_URL from .env)']);
  });

  it('warns when the process value differs from .env, after the target line, without credentials', () => {
    writeFileSync(dotenvPath, `DATABASE_URL=postgres://u:${SECRET}@localhost:5380/winematch\n`);
    announceDbTarget({ command: 'restaurant:create', environment: { DATABASE_URL: 'postgres://x:y@elsewhere:5432/other' }, dotenvPath, write });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('elsewhere:5432/other');
    expect(lines[1]).toMatch(/^WARNING/);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('announces a missing DATABASE_URL instead of staying silent', () => {
    announceDbTarget({ command: 'db:seed', environment: {}, dotenvPath, write });
    expect(lines[0]).toContain('(DATABASE_URL is not set)');
  });

  it('prints only once per process (a command may reach two entry points)', () => {
    announceDbTarget({ command: 'a', environment: { DATABASE_URL: 'postgres://u:p@h:1/d' }, dotenvPath, write });
    announceDbTarget({ command: 'b', environment: { DATABASE_URL: 'postgres://u:p@h:1/d' }, dotenvPath, write });
    expect(lines).toHaveLength(1);
  });

  it('survives an unreadable .env path', () => {
    expect(() => announceDbTarget({ command: 'a', environment: { DATABASE_URL: 'postgres://u:p@h:1/d' }, dotenvPath: dir, write })).not.toThrow();
    expect(lines).toHaveLength(1);
  });
});

/** The real entry points: the target is on stderr BEFORE anything is validated or written, and the password is nowhere. */
describe('operator commands print the database target', () => {
  const url = `postgres://operator:${SECRET}@db.target.example:5390/winematch_target`;
  const runScript = (script: string) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile('npx', ['tsx', script], { cwd: rootDir, env: { ...process.env, DATABASE_URL: url, USER_PASSWORD: '', NODE_ENV: 'test' } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
    });
  });

  it.each([
    ['packages/db/scripts/create-restaurant.ts', 'restaurant:create'],
    ['packages/db/scripts/create-user.ts', 'user:create'],
    ['scripts/user-invite.ts', 'user:invite']
  ])('%s announces the target even when its arguments are wrong', async (script, command) => {
    const { code, stdout, stderr } = await runScript(script);
    expect(code).toBe(1);
    expect(stderr).toContain(`${command}: database target db.target.example:5390/winematch_target`);
    expect(stdout + stderr).not.toContain(SECRET);
  }, 60_000);
});
