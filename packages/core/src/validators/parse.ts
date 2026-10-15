import type { z } from 'zod';
import { ValidationError } from '../errors';

/**
 * The one way input enters the application: parsed through a schema into an explicitly typed value.
 * Nothing spreads a raw request body into a service, so a client cannot smuggle in fields it must not set.
 * Failures become a ValidationError whose `fields` name each problem with a short code:
 * required, invalid, too_long, too_short, too_many, too_few, unknown_field, or the refinement's own code.
 */

interface IssueLike {
  code: string;
  input?: unknown;
  origin?: string;
}

/** The short code of a schema issue (used as the issue message, so `fields` can carry it as it is). */
function issueCode(issue: IssueLike): string {
  switch (issue.code) {
    case 'invalid_type': return issue.input === undefined ? 'required' : 'invalid';
    case 'too_small': return issue.origin === 'string' ? 'required' : issue.origin === 'array' ? 'too_few' : 'invalid';
    case 'too_big': return issue.origin === 'array' ? 'too_many' : issue.origin === 'string' ? 'too_long' : 'invalid';
    default: return 'invalid';
  }
}

function fieldsOf(error: z.ZodError): Record<string, string> {
  // A Map, not a plain object: a client chooses these keys, and on an object "constructor" already
  // exists and "__proto__" is silently ignored, so exactly the keys an attacker sends would be lost.
  const fields = new Map<string, string>();
  const note = (key: string, code: string) => { if (!fields.has(key)) fields.set(key, code); };
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) note(key, 'unknown_field');
      continue;
    }
    note(issue.path.length ? issue.path.map(String).join('.') : 'body', issue.message);
  }
  return Object.fromEntries(fields);
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown, message = 'The request is not valid.'): z.output<S> {
  const result = schema.safeParse(input, { error: (issue) => issueCode(issue as IssueLike) });
  if (result.success) return result.data;
  throw new ValidationError('validation_failed', message, fieldsOf(result.error));
}
