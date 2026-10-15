import { createHash, randomBytes } from 'node:crypto';
import type { SessionTokens } from '@wine-match/core';

/** Session tokens: 32 random bytes; only the SHA-256 of the token is stored, so a leaked database cannot be replayed. */
export class NodeSessionTokens implements SessionTokens {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
