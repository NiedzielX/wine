import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, DEMO_USERS } from '@wine-match/core';
import { NodeSessionTokens, ScryptPasswordHasher, hashPassword, needsRehash, verifyPassword } from '../src/auth';

describe('scrypt passwords', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', h)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('uses a new salt every time and keeps the parameters in the hash', async () => {
    const [a, b] = [await hashPassword('same'), await hashPassword('same')];
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);   // OWASP equal-strength: N=2^15, r=8, p=3
  });

  it('treats unicode the same however it is typed (NFKC)', async () => {
    const h = await hashPassword('Zażółć gęślą jaźń');
    expect(await verifyPassword('Zażółć gęślą jaźń'.normalize('NFD'), h)).toBe(true);
  });

  it('rejects malformed or foreign hashes without throwing', async () => {
    for (const bad of ['', 'plain:x', 'scrypt$1$2', 'bcrypt$10$abc$def$ghi$jkl']) expect(await verifyPassword('x', bad)).toBe(false);
  });

  it('the demo accounts accept the demo password', async () => {
    for (const u of DEMO_USERS) {
      expect(await verifyPassword(DEMO_PASSWORD, u.passwordHash)).toBe(true);
      expect(await verifyPassword('wrong', u.passwordHash)).toBe(false);
    }
  });

  it('the hasher offers a dummy hash for unknown accounts, which no password matches', async () => {
    const hasher = await ScryptPasswordHasher.create();
    expect(hasher.dummyHash).toMatch(/^scrypt\$/);
    expect(await hasher.verify(DEMO_PASSWORD, hasher.dummyHash)).toBe(false);
  });
});

describe('upgrading old hashes', () => {
  it('a hash made with the previous, weaker parameters (p=1) still verifies but is flagged for an upgrade', async () => {
    const old = await hashPassword('correct horse battery', { N: 32768, r: 8, p: 1 });
    expect(old).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('correct horse battery', old)).toBe(true);
    expect(needsRehash(old)).toBe(true);
  });

  it('a hash with today\'s parameters, or stronger, is left alone', async () => {
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    expect(needsRehash(await hashPassword('x', { N: 65536, r: 8, p: 3 }))).toBe(false);
  });

  it('weaker N or r, an unknown algorithm and garbage all need an upgrade', () => {
    expect(needsRehash('scrypt$16384$8$3$c2FsdA==$aGFzaA==')).toBe(true);
    expect(needsRehash('scrypt$32768$4$3$c2FsdA==$aGFzaA==')).toBe(true);
    expect(needsRehash('bcrypt$10$abc')).toBe(true);
    expect(needsRehash('')).toBe(true);
  });
});

describe('session tokens', () => {
  const t = new NodeSessionTokens();
  it('are long, unique and only their hash is derivable', () => {
    const a = t.generate();
    const b = t.generate();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(t.hash(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
});
