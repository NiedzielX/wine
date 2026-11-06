import { redactText } from '@wine-match/core';

const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * An error as log fields, without any e-mail address. The shared redactor removes secret shapes (hashes, tokens, passwords) from text but
 * keeps addresses on purpose; a database driver error repeats the failed statement with its bound values, which on the invitation and
 * account paths are an address and a password hash. Only name, code, message and stack are kept.
 */
export function scrubbedError(e: unknown): Record<string, unknown> {
  const scrub = (text: string) => redactText(text).replace(ADDRESS, '[address]');
  if (!(e instanceof Error)) return { message: scrub(String(e)) };
  const { code } = e as Error & { code?: unknown };
  return { name: e.name, ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}), message: scrub(e.message), ...(e.stack ? { stack: scrub(e.stack) } : {}) };
}
