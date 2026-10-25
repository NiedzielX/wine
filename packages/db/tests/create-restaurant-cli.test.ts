import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInput, run } from '../scripts/restaurant-bootstrap';

const PASSWORD = 'correct horse battery staple';
const DATABASE_URL = 'postgres://operator:s3cret-db-pass@db.internal:5432/winematch';
const GOOD = ['--name', 'Bistro Nad Wisłą', '--slug', 'bistro-nad-wisla', '--address', 'ul. Wiślna 1', '--city', 'Kraków', '--wine-director', 'Anna Nowak', '--owner-email', 'Anna@Example.com', '--owner-name', 'Anna Nowak'];
const ENV = { USER_PASSWORD: PASSWORD, DATABASE_URL };

/** Replaces the value following `flag` (or removes the flag and its value when `value` is undefined). */
function with_(flag: string, value?: string): string[] {
  const args = [...GOOD];
  const i = args.indexOf(flag);
  if (value === undefined) args.splice(i, 2);
  else args[i + 1] = value;
  return args;
}

describe('restaurant:create without a database', () => {
  let out: string[];
  let err: string[];
  const openOrm = vi.fn(async () => { throw new Error(`connecting to ${DATABASE_URL} with ${PASSWORD}`); });

  beforeEach(() => {
    out = [];
    err = [];
    openOrm.mockClear();
    vi.spyOn(console, 'log').mockImplementation((...a) => { out.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a) => { err.push(a.join(' ')); });
  });
  afterEach(() => vi.restoreAllMocks());

  const output = () => [...out, ...err].join('\n');

  it('normalises the e-mail, trims fields and keeps the slug as given', () => {
    const { input, errors } = parseInput([...with_('--name', '  Bistro  '), '--allow-existing-account'], ENV);
    expect(errors).toEqual([]);
    expect(input).toMatchObject({ name: 'Bistro', slug: 'bistro-nad-wisla', ownerEmail: 'anna@example.com', allowExistingAccount: true });
  });

  it.each([
    ['upper case', 'Bistro'], ['a space', 'bistro nad'], ['reserved word', 'admin'], ['one character', 'a'], ['41 characters', 'a'.repeat(41)]
  ])('rejects a slug with %s and never opens the ORM', async (_label, slug) => {
    expect(await run(with_('--slug', slug), ENV, { openOrm })).toBe(1);
    expect(err.join('\n')).toContain('--slug');
    expect(openOrm).not.toHaveBeenCalled();
  });

  it('accepts slugs of exactly 2 and 40 characters', () => {
    expect(parseInput(with_('--slug', 'ab'), ENV).errors).toEqual([]);
    expect(parseInput(with_('--slug', 'a'.repeat(40)), ENV).errors).toEqual([]);
  });

  it('says "reserved" for a reserved slug and "invalid" for a malformed one', () => {
    expect(parseInput(with_('--slug', 'admin'), ENV).errors).toEqual(['--slug "admin" is reserved.']);
    expect(parseInput(with_('--slug', 'Admin'), ENV).errors).toEqual(['--slug must be 2–40 lower-case letters, digits and single hyphens.']);
  });

  it.each(['--name', '--address', '--city', '--wine-director', '--owner-name', '--owner-email'])('requires %s', async (flag) => {
    expect(await run(with_(flag), ENV, { openOrm })).toBe(1);
    expect(err.join('\n')).toContain(flag);
    expect(openOrm).not.toHaveBeenCalled();
  });

  it('rejects a name over 120 characters and a malformed e-mail', () => {
    expect(parseInput(with_('--name', 'x'.repeat(121)), ENV).errors).toEqual(['--name is required (max 120 characters).']);
    expect(parseInput(with_('--owner-email', 'not-an-email'), ENV).errors).toEqual(['--owner-email must be a valid e-mail address.']);
  });

  it('rejects an unknown flag and a value that looks like a flag', async () => {
    expect(await run([...GOOD, '--role', 'owner'], ENV, { openOrm })).toBe(1);
    expect(await run(with_('--city', '--oops'), ENV, { openOrm })).toBe(1);
    expect(openOrm).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('Usage:');
  });

  it('requires a password of at least 12 characters, without trimming it', () => {
    expect(parseInput(GOOD, { ...ENV, USER_PASSWORD: 'short' }).errors).toEqual(['Set USER_PASSWORD to a password of at least 12 characters.']);
    expect(parseInput(GOOD, { DATABASE_URL }).errors).toHaveLength(1);
    // 11 characters plus a trailing newline is 12 characters: used literally, so it passes
    expect(parseInput(GOOD, { ...ENV, USER_PASSWORD: '12345678901\n' }).errors).toEqual([]);
  });

  it('does not need USER_PASSWORD together with --allow-existing-account', () => {
    expect(parseInput([...GOOD, '--allow-existing-account'], { DATABASE_URL }).errors).toEqual([]);
  });

  it('reports every problem at once', async () => {
    const code = await run(['--slug', 'Bad Slug', '--bogus'], { USER_PASSWORD: 'short' }, { openOrm });
    expect(code).toBe(1);
    const text = err.join('\n');
    for (const needle of ['--slug', '--name is required', '--address', '--city', '--wine-director', '--owner-name', '--owner-email', 'USER_PASSWORD', 'DATABASE_URL is not set.']) {
      expect(text).toContain(needle);
    }
    expect(openOrm).not.toHaveBeenCalled();
  });

  it('fails with code 1 and a hint when DATABASE_URL is missing', async () => {
    expect(await run(GOOD, { USER_PASSWORD: PASSWORD }, { openOrm })).toBe(1);
    expect(err).toContain('Error: DATABASE_URL is not set.');
    expect(openOrm).not.toHaveBeenCalled();
  });

  it('never prints the password or DATABASE_URL, even when the driver error contains them', async () => {
    expect(await run(GOOD, ENV, { openOrm })).toBe(1);
    expect(openOrm).toHaveBeenCalledOnce();
    expect(output()).toContain('[redacted]');
    expect(output()).not.toContain(PASSWORD);
    expect(output()).not.toContain(DATABASE_URL);
    expect(output()).not.toContain('s3cret-db-pass');

    out = [];
    err = [];
    await run(with_('--slug', 'Bad'), { USER_PASSWORD: PASSWORD, DATABASE_URL }, { openOrm });
    expect(output()).not.toContain(PASSWORD);
    expect(output()).not.toContain(DATABASE_URL);
  });
});
