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
 * Connection strings are built from fragments so that `npm run secrets:scan` does not mistake the fixtures for secrets.
 */
const pg = (userinfo: string, rest: string) => ['postgres', '://', userinfo, userinfo ? '@' : '', rest].join('');
const SECRET = 's3cret-db-pass';
const INVALID = '(DATABASE_URL is not a valid URL)';
const rootDir = fileURLToPath(new URL('../../..', import.meta.url));

describe('describeDbTarget', () => {
  it.each([
    [pg(`operator:${SECRET}`, 'db.internal:5439/winematch'), 'db.internal:5439/winematch'],
    [['postgresql', '://', 'u:p', '@localhost/winematch_test'].join(''), 'localhost:5432/winematch_test'],
    [pg('u:p', '[::1]:5380/w'), '[::1]:5380/w'],
    [pg('u:p%40ss', `host:5432/my%20db?sslmode=require&password=${SECRET}`), 'host:5432/my db'],
    [pg('', 'host:5432'), 'host:5432/(no database name)'],
    [pg('u:p', 'host:5432/db?email=a@b.c'), 'host:5432/db']
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
    expect(describeDbTarget(pg('', `user:${SECRET}/not-a-url`))).toBe(INVALID);
    expect(describeDbTarget(`${SECRET} garbage`)).toBe(INVALID);
  });

  // WHATWG URL parses these "user as host, password as port": the password digits must not reach the output
  it.each([
    [pg('', 'admin:12345/abc@host/db')],
    [pg('', 'admin:1234?x@host:5432/db')],
    [pg('', 'admin:1234#x@host:5432/db')],
    [pg('', 'admin:12345@/abc@host/db')],
    [pg('admin', 'host name:5432/db')]
  ])('prints only the invalid message for the ambiguous %s', (url) => {
    const text = describeDbTarget(url);
    expect(text).toBe(INVALID);
    for (const leak of ['12345', '1234', 'admin', 'abc']) expect(text).not.toContain(leak);
  });

  it('does not invent port 5432 for a unix socket host', () => {
    const text = describeDbTarget(pg('u:p', '%2Fvar%2Frun%2Fpg/db'));
    expect(text).toBe('unix socket /var/run/pg/db');
    expect(text).not.toContain('5432');
    expect(describeDbTarget(pg('u:p', '%2Ftmp:5381/db'))).toBe('unix socket /tmp (port 5381)/db');
  });

  it('says there is no host when the authority has none', () => {
    expect(describeDbTarget(pg('u:p', '/db'))).toBe('(DATABASE_URL has no host)');
  });
});

describe('parseDotenvValue', () => {
  const text = [
    '# a comment',
    'DB_POOL_MAX=10',
    `DATABASE_URL=${pg('a:b', 'one:1/x')}`,
    'export OTHER="quoted value"  # trailing',
    "SINGLE='single'",
    'PLAIN=value # inline comment',
    `DATABASE_URL = ${pg('a:b', 'two:2/y')}`,
    ''
  ].join('\n');

  it('reads plain, exported and quoted values, drops inline comments, last assignment wins', () => {
    expect(parseDotenvValue(text, 'DATABASE_URL')).toBe(pg('a:b', 'two:2/y'));
    expect(parseDotenvValue(text, 'OTHER')).toBe('quoted value');
    expect(parseDotenvValue(text, 'SINGLE')).toBe('single');
    expect(parseDotenvValue(text, 'PLAIN')).toBe('value');
  });

  it('handles backtick quotes, \\n escapes in double quotes and multi-line quoted values like Node', () => {
    expect(parseDotenvValue('A=`back tick`\n', 'A')).toBe('back tick');
    expect(parseDotenvValue('A="one\\ntwo"\n', 'A')).toBe('one\ntwo');
    expect(parseDotenvValue("A='one\\ntwo'\n", 'A')).toBe('one\\ntwo');
    expect(parseDotenvValue('A="line 1\nline 2"\nB=next\n', 'A')).toBe('line 1\nline 2');
    expect(parseDotenvValue('A="line 1\nline 2"\nB=next\n', 'B')).toBe('next');
    expect(parseDotenvValue('A=\r\nB=x\r\n', 'B')).toBe('x');
  });

  it('returns undefined for a missing key and does not match a longer name', () => {
    expect(parseDotenvValue(text, 'MISSING')).toBeUndefined();
    expect(parseDotenvValue('MY_DATABASE_URL=x', 'DATABASE_URL')).toBeUndefined();
  });
});

describe('shadowWarning', () => {
  const dotenv = pg(`operator:${SECRET}`, 'localhost:5432/winematch');

  it('is silent when there is no .env value, the variable is not in the process, or they are equal', () => {
    expect(shadowWarning(dotenv, undefined)).toBeNull();
    expect(shadowWarning(undefined, dotenv)).toBeNull();
    expect(shadowWarning(dotenv, dotenv)).toBeNull();
  });

  it('warns loudly, names both targets, says which one wins and leaks no credentials', () => {
    const text = shadowWarning(pg('other:another-pass', 'prod.example.com:5432/customers'), dotenv)!;
    expect(text).toMatch(/^WARNING/);
    expect(text).toContain('prod.example.com:5432/customers');
    expect(text).toContain('localhost:5432/winematch');
    expect(text).toContain('unset DATABASE_URL');
    for (const leak of [SECRET, 'another-pass', 'operator', 'other:']) expect(text).not.toContain(leak);
  });

  it('still warns when only the credentials differ (same target)', () => {
    const text = shadowWarning(pg('operator:different', 'localhost:5432/winematch'), dotenv)!;
    expect(text).toContain('same database');
    expect(text).not.toContain('different@');
  });

  // process.loadEnvFile does not override a variable that is set, even to the empty string
  it.each(['', '   '])('warns when the process value is blank (%j) while .env has one', (blank) => {
    const text = shadowWarning(blank, dotenv)!;
    expect(text).toMatch(/^WARNING/);
    expect(text).toContain('localhost:5432/winematch');
    expect(text).toContain('empty');
    expect(text).not.toContain(SECRET);
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
    announceDbTarget({ command: 'db:seed', environment: { DATABASE_URL: pg(`u:${SECRET}`, 'db.internal:5390/winematch') }, dotenvPath, write });
    expect(lines).toEqual(['db:seed: database target db.internal:5390/winematch (DATABASE_URL from the process environment)']);
  });

  it('says the value comes from .env when both agree, and does not warn', () => {
    const url = pg('u:p', 'localhost:5380/winematch');
    writeFileSync(dotenvPath, `DATABASE_URL=${url}\n`);
    announceDbTarget({ command: 'user:create', environment: { DATABASE_URL: url }, dotenvPath, write });
    expect(lines).toEqual(['user:create: database target localhost:5380/winematch (DATABASE_URL from .env)']);
  });

  it('warns when the process value differs from .env, after the target line, without credentials', () => {
    writeFileSync(dotenvPath, `DATABASE_URL=${pg(`u:${SECRET}`, 'localhost:5380/winematch')}\n`);
    announceDbTarget({ command: 'restaurant:create', environment: { DATABASE_URL: pg('x:y', 'elsewhere:5432/other') }, dotenvPath, write });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('elsewhere:5432/other');
    expect(lines[1]).toMatch(/^WARNING/);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('warns when DATABASE_URL is exported as an empty string while .env has a value', () => {
    writeFileSync(dotenvPath, `DATABASE_URL=${pg('u:p', 'localhost:5380/winematch')}\n`);
    announceDbTarget({ command: 'db:seed', environment: { DATABASE_URL: '' }, dotenvPath, write });
    expect(lines[0]).toContain('(DATABASE_URL is not set)');
    expect(lines[1]).toMatch(/^WARNING/);
  });

  it('announces a missing DATABASE_URL instead of staying silent', () => {
    announceDbTarget({ command: 'db:seed', environment: {}, dotenvPath, write });
    expect(lines[0]).toContain('(DATABASE_URL is not set)');
  });

  it('prints only once per process (a command may reach two entry points)', () => {
    announceDbTarget({ command: 'a', environment: { DATABASE_URL: pg('u:p', 'h:1/d') }, dotenvPath, write });
    announceDbTarget({ command: 'b', environment: { DATABASE_URL: pg('u:p', 'h:1/d') }, dotenvPath, write });
    expect(lines).toHaveLength(1);
  });

  it('survives an unreadable .env path', () => {
    expect(() => announceDbTarget({ command: 'a', environment: { DATABASE_URL: pg('u:p', 'h:1/d') }, dotenvPath: dir, write })).not.toThrow();
    expect(lines).toHaveLength(1);
  });

  it('takes the .env path from DB_TARGET_DOTENV when no path is given (tests keep a real .env out of the comparison)', () => {
    writeFileSync(dotenvPath, `DATABASE_URL=${pg('u:p', 'localhost:5380/winematch')}\n`);
    announceDbTarget({ command: 'a', environment: { DATABASE_URL: pg('u:p', 'h:1/d'), DB_TARGET_DOTENV: dotenvPath }, write });
    expect(lines[1]).toMatch(/^WARNING/);
  });
});

/** The real entry points: the target is on stderr BEFORE anything is validated or written, and the password is nowhere. */
describe('operator commands print the database target', () => {
  const url = pg(`operator:${SECRET}`, 'db.target.example:5390/winematch_target');
  // DB_TARGET_DOTENV points at a missing file: these runs never compare against (or read, for the comparison) a real repository .env
  const runScript = (script: string) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile('npx', ['tsx', script], { cwd: rootDir, env: { ...process.env, DATABASE_URL: url, USER_PASSWORD: '', NODE_ENV: 'test', DB_TARGET_DOTENV: join(tmpdir(), 'db-target-no-such.env') } }, (error, stdout, stderr) => {
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
