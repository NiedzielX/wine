import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import type { PasswordHasher } from '@wine-match/core';

/**
 * Password hashing with scrypt (Node built-in, no native dependency).
 * Stored format: `scrypt$N$r$p$<salt base64>$<hash base64>` — the parameters travel with the hash,
 * so they can be raised later without invalidating existing passwords.
 */
/**
 * OWASP's equal-strength scrypt settings for passwords: N=2^15, r=8, p=3 (32 MiB, three passes). The earlier
 * p=1 with N=2^15 was BELOW that floor (p=1 needs N=2^17, 128 MiB, which is heavy for a login burst).
 * Raise the numbers here only together with `needsRehash`: old hashes are then upgraded at the next login.
 */
const DEFAULTS = { N: 32768, r: 8, p: 3, keyLength: 32, saltLength: 16 } as const;
const MAX_MEM = 128 * 1024 * 1024; // N=2^15, r=8 needs 32 MiB; room for a future increase to 2^16

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: ScryptOptions) => Promise<Buffer>;

function derive(password: string, salt: Buffer, N: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return scryptAsync(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: MAX_MEM });
}

/** `params` exists for tests (to make an OLD hash); production code always uses the defaults. */
export async function hashPassword(password: string, params: { N: number; r: number; p: number } = DEFAULTS): Promise<string> {
  const salt = randomBytes(DEFAULTS.saltLength);
  const key = await derive(password, salt, params.N, params.r, params.p, DEFAULTS.keyLength);
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** True for a hash in another format, or one made with weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const [alg, n, r, p] = stored.split('$');
  return alg !== 'scrypt' || Number(n) < DEFAULTS.N || Number(r) < DEFAULTS.r || Number(p) < DEFAULTS.p;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** `dummyHash` is verified against when the account does not exist, so the response time does not reveal it. */
export class ScryptPasswordHasher implements PasswordHasher {
  readonly dummyHash: string;
  private constructor(dummyHash: string) { this.dummyHash = dummyHash; }

  static async create(): Promise<ScryptPasswordHasher> {
    return new ScryptPasswordHasher(await hashPassword(randomBytes(18).toString('base64')));
  }

  hash(password: string) { return hashPassword(password); }
  verify(password: string, hash: string) { return verifyPassword(password, hash); }
  needsRehash(hash: string) { return needsRehash(hash); }
}
