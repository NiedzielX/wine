import { describe, expect, it } from 'vitest';
import { createLogger, memorySink } from '../src/logging/logger';
import { REDACTED, redact, redactText } from '../src/logging/redact';

const log = (fields: Record<string, unknown>, level: 'debug' | 'info' | 'warn' | 'error' = 'info') => {
  const { sink, lines } = memorySink();
  createLogger(sink, { level: 'debug', now: () => new Date('2026-10-15T10:00:00.000Z') })[level]('something happened', fields);
  return { line: lines[0], json: JSON.parse(lines[0]) as Record<string, unknown> };
};

describe('redaction by key', () => {
  it.each(['password', 'newPassword', 'passwd', 'token', 'csrfToken', 'authorization', 'Authorization', 'cookie', 'set-cookie', 'sessionId', 'passwordHash', 'tokenHash', 'secret', 'apiKey', 'api_key', 'privateKey', 'credentials', 'signature'])('hides "%s" whatever its value', (key) => {
    expect(log({ [key]: 'hunter2-the-real-value' }).line).not.toContain('hunter2');
    expect(log({ [key]: 'x' }).json[key]).toBe(REDACTED);
  });

  it('does not hide a true/false just because its key sounds sensitive (it cannot hold a secret)', () => {
    expect(log({ secureCookies: true, hasPassword: false, passwordLength: 12 }).json).toMatchObject({ secureCookies: true, hasPassword: false, passwordLength: REDACTED });
  });

  it('keeps ordinary fields', () => {
    expect(log({ restaurant: 'halka', count: 3, ok: true, nothing: null }).json).toMatchObject({ restaurant: 'halka', count: 3, ok: true, nothing: null });
  });

  it('works at any depth, inside arrays and objects', () => {
    const out = log({ request: { headers: [{ name: 'a', cookie: 'wm_session=abc' }], body: { user: { email: 'a@b.pl', password: 'nope-nope' } } } });
    expect(out.line).not.toContain('nope-nope');
    expect(out.line).not.toContain('wm_session=abc');
    expect(JSON.stringify(out.json)).toContain('a@b.pl');
  });

  it('keeps a "__proto__" key as plain data instead of dropping it or touching the prototype', () => {
    const out = log({ payload: JSON.parse('{"__proto__":{"admin":true},"ok":1}') });
    expect(out.line).toContain('"__proto__"');
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });

  it('does not change the object it was given', () => {
    const input = { password: 'x', nested: { token: 'y' } };
    log(input);
    expect(input).toEqual({ password: 'x', nested: { token: 'y' } });
  });

  it('survives circular references, huge arrays, functions, bigint and invalid dates', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    const out = log({ loop, big: Array.from({ length: 500 }, (_, i) => i), fn: () => 1, n: 10n, bad: new Date('nope'), ok: new Date('2026-01-01T00:00:00Z') });
    expect(out.json.loop).toEqual({ name: 'loop', self: '[circular]' });
    expect((out.json.big as unknown[]).length).toBe(51);
    expect(out.json.fn).toBeUndefined();
    expect(out.json.n).toBe('10');
    expect(out.json.bad).toBeNull();
    expect(out.json.ok).toBe('2026-01-01T00:00:00.000Z');
  });

  it('stops at a sensible depth', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 12; i++) deep = { child: deep };
    expect(JSON.stringify(log({ deep }).json)).toContain('[too deep]');
  });
});

describe('redaction of secrets inside text', () => {
  const secrets = {
    scrypt: 'scrypt$32768$8$3$3yYKv6eogNH/H3BZ8JBD9Q==$eVkuDVOGX5kegu0AEmMaNBcgisnhwcPasgudo+OGAv0=',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    sha: 'a'.repeat(32) + 'b'.repeat(32)
  };

  it('cuts a password hash out of a database error that repeats the failed SQL', () => {
    const e = new Error(`insert into "app_user" ("email", "password_hash") values ('jan@example.com', '${secrets.scrypt}') - duplicate key value`);
    const line = log({ err: e }).line;
    expect(line).not.toContain('3yYKv6eogNH');
    expect(line).toContain('jan@example.com');
    expect(line).toContain('duplicate key value');
  });

  it.each([
    ['a JWT', `token was ${secrets.jwt} here`, 'eyJhbGci'],
    ['a bearer header', 'Authorization: Bearer abc.def-ghi_jkl', 'abc.def-ghi'],
    ['a session cookie', 'cookie: theme=dark; wm_session=Zk3j9s0QwErTyUiOp; other=1', 'Zk3j9s0Q'],
    ['a query string', 'GET /x?csrf_token=SECRETVALUE123&page=2', 'SECRETVALUE123'],
    ['a SHA-256 token hash', `lookup ${secrets.sha}`, 'aaaaaaaaaaaaaaaaaaaaaaaa'],
    ['a password in a query', 'POST /login?password=hunter2&next=/admin', 'hunter2'],
    ['a database connection string', 'connect failed: postgres://wine:S3cr3t-Pa55@db.internal:5432/winematch', 'S3cr3t-Pa55']
  ])('removes %s from a message', (_name, text, secret) => {
    const out = redactText(text);
    expect(out).not.toContain(secret);
    expect(out).toContain(REDACTED);
  });

  it('keeps the host and user of a connection string, so the error stays useful', () => {
    expect(redactText('postgres://wine:S3cr3t@db.internal:5432/winematch')).toBe('postgres://wine:[redacted]@db.internal:5432/winematch');
  });

  it('keeps the harmless parts of the text readable', () => {
    expect(redactText('Pairing not found for dish 7f3a in restaurant halka')).toBe('Pairing not found for dish 7f3a in restaurant halka');
  });

  it('shortens very long text', () => {
    expect(redactText('x'.repeat(5000)).length).toBeLessThan(2100);
  });

  it('also cleans the message of the log line itself', () => {
    const { sink, lines } = memorySink();
    createLogger(sink).info(`reset link /r?token=ABCDEF123456 sent`);
    expect(lines[0]).not.toContain('ABCDEF123456');
  });
});

describe('errors', () => {
  it('are written with name, message, code and stack, and their cause', () => {
    const cause = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    const e = Object.assign(new Error('Query failed', { cause }), { code: 'ECONNREFUSED' });
    const j = log({ err: e }).json.err as Record<string, unknown>;
    expect(j).toMatchObject({ name: 'Error', message: 'Query failed', code: 'ECONNREFUSED' });
    expect(String(j.stack)).toContain('Query failed');
    expect((j.cause as Record<string, unknown>).message).toBe('connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('a field called "error" or "err" is serialised, not flattened to {}', () => {
    expect(JSON.stringify(redact({ error: new Error('boom') }))).toContain('boom');
  });
});

describe('the logger', () => {
  it('writes one JSON object per line with level, time and message', () => {
    const { line, json } = log({ a: 1 }, 'warn');
    expect(line).not.toContain('\n');
    expect(json).toEqual({ level: 'warn', time: '2026-10-15T10:00:00.000Z', msg: 'something happened', a: 1 });
  });

  it('skips lines below the configured level', () => {
    const { sink, lines } = memorySink();
    const l = createLogger(sink, { level: 'warn' });
    l.debug('d'); l.info('i'); l.warn('w'); l.error('e');
    expect(lines.map((x) => (JSON.parse(x) as { level: string }).level)).toEqual(['warn', 'error']);
  });

  it('a child logger adds its bindings to every line, and bindings are redacted too', () => {
    const { sink, lines } = memorySink();
    createLogger(sink).child({ restaurant: 'halka', sessionId: 'abc' }).info('hi', { n: 1 });
    expect(JSON.parse(lines[0])).toMatchObject({ restaurant: 'halka', sessionId: REDACTED, n: 1 });
  });

  it('a call field wins over a binding with the same name', () => {
    const { sink, lines } = memorySink();
    createLogger(sink).child({ a: 1 }).info('x', { a: 2 });
    expect((JSON.parse(lines[0]) as { a: number }).a).toBe(2);
  });
});
