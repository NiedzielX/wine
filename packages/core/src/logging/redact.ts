/**
 * Keeps secrets out of logs. Two layers, because both leak in practice:
 *  1. by KEY: a field called password, token, cookie, authorization, … is replaced whatever its value;
 *  2. by VALUE inside text: error messages carry things the key rule cannot see (a database error repeats
 *     the failed SQL with its parameters, a header dump contains a cookie), so known secret shapes are cut
 *     out of every string.
 */
export const REDACTED = '[redacted]';

const SENSITIVE_KEY = /(pass(word|wd|phrase)?|secret|token|authorization|cookie|csrf|session|hash|api[-_]?key|private[-_]?key|credential|signature)/i;

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_STRING = 2000;

const TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+/g, `scrypt$${REDACTED}`],
  [/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, REDACTED],                                            // a JWT
  [/\bBearer\s+[\w.~+/-]+=*/gi, `Bearer ${REDACTED}`],
  [/\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([^:@\s/]+):([^@\s]+)@/gi, `$1://$2:${REDACTED}@`],   // user:password in a connection string
  [/\b(wm_session|session|token|csrf[-_]?token|password|authorization|api[-_]?key)=([^;&\s"']+)/gi, `$1=${REDACTED}`],
  [/\b[0-9a-f]{64}\b/g, REDACTED]                                                              // a SHA-256 (session token hash)
];

export function redactText(text: string): string {
  let out = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…[truncated]` : text;
  for (const [pattern, replacement] of TEXT_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

export function serializeError(error: Error, depth = 0): Record<string, unknown> {
  const { code, cause } = error as Error & { code?: unknown; cause?: unknown };
  return {
    name: error.name,
    message: redactText(error.message),
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    ...(error.stack ? { stack: redactText(error.stack) } : {}),
    ...(cause !== undefined && depth < 2 ? { cause: cause instanceof Error ? serializeError(cause, depth + 1) : redact(cause, depth + 1) } : {})
  };
}

/** A JSON-safe copy of `value` with sensitive keys and secret-shaped text removed. Never mutates the input. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) return serializeError(value, depth);
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[too deep]';
  seen.add(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1, seen));
    return value.length > MAX_ARRAY ? [...items, `…${value.length - MAX_ARRAY} more`] : items;
  }
  // Object.fromEntries creates own properties even for keys like "__proto__" (assignment would drop them)
  // a true/false cannot carry a secret, and hiding it (`secureCookies: true`) only makes the log less useful
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEY.test(key) && typeof v !== 'boolean' ? REDACTED : redact(v, depth + 1, seen)]));
}
