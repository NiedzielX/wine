import { z } from 'zod';
import type { LogLevel } from '../logging/logger';

/**
 * The application's configuration, read once from the environment and checked. A wrong or missing
 * setting stops the start with a message that names every problem, instead of running half-configured.
 * Settings that decide who can see what FAIL CLOSED: a typo must never silently pick the demo data.
 */
/**
 * The public sales showcase (spec 2026-11-04-sales-demo-and-roi-calculator, R1): `off` serves nothing under `/demo`,
 * `calculator` serves the return calculator (it reads no data, so it may run next to real restaurants), `demo` adds the guided
 * read-only demo of the invented restaurant (F2): it needs `DATA_SOURCE=memory` AND `ALLOW_DEMO_DATA=true`, never real data.
 */
export type ShowcaseMode = 'off' | 'calculator' | 'demo';

export interface AppEnv {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  dataSource: 'memory' | 'postgres';
  databaseUrl: string | null;
  /** the session cookie carries the Secure flag */
  secureCookies: boolean;
  /** the public address of this installation; QR codes point to `<publicBaseUrl>/r/<slug>` */
  publicBaseUrl: string;
  /** true when PUBLIC_BASE_URL was not set (QR codes would point to localhost) */
  publicBaseUrlIsDefault: boolean;
  /** ALLOW_LOCAL_BASE_URL=true: production may run on a non-public address (local runs, CI, e2e); logs a warning at start */
  allowLocalBaseUrl: boolean;
  logLevel: LogLevel;
  demoRestaurantSlug: string;
  /** bearer token for GET /api/v1/metrics; null = the endpoint is disabled (404) */
  metricsToken: string | null;
  /** SHOWCASE_MODE; unset = `off`, so the `/demo` pages answer 404 */
  showcaseMode: ShowcaseMode;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

const schema = z.object({
  NODE_ENV: optional(z.enum(['development', 'test', 'production'])),
  DATA_SOURCE: optional(z.enum(['memory', 'postgres'], { error: 'must be "memory" or "postgres"' })),
  DATABASE_URL: optional(z.string().regex(/^postgres(ql)?:\/\//, { error: 'must start with postgres:// or postgresql://' })),
  AUTH_COOKIE_SECURE: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
  PUBLIC_BASE_URL: optional(z.url({ protocol: /^https?$/, error: 'must be an http(s) address such as https://wine.example.com' })),
  ALLOW_LOCAL_BASE_URL: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
  ALLOW_DEMO_DATA: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
  LOG_LEVEL: optional(z.enum(['debug', 'info', 'warn', 'error'], { error: 'must be debug, info, warn or error' })),
  SHOWCASE_MODE: optional(z.string()),
  METRICS_TOKEN: optional(z.string().min(32, { error: 'must be at least 32 characters (or leave it unset to disable GET /api/v1/metrics)' })),
  DEMO_RESTAURANT_SLUG: optional(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be a lower-case address name' }))
});

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.invalid', '.localdomain', '.intranet', '.corp'];

interface ParsedBase {
  /** protocol + host (no trailing dot, default port dropped) + path without a trailing slash: the ONLY form that is ever stored */
  base: string;
  protocol: string;
  host: string;
}

/**
 * PUBLIC_BASE_URL through the URL parser, once. Everything that is checked AND everything that is stored comes from this
 * parsed form, never from the raw text: `new URL` lowercases the scheme, maps fullwidth dots, reads `\` as `/`, so a check on one
 * thing and a value taken from another can disagree. Text that could be read two ways (a `@`, a backslash, white space or a
 * control character anywhere) is refused outright.
 */
function parseBase(value: string): ParsedBase | string {
  if (/[\\@\s]/.test(value) || [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return 'must not contain credentials, a backslash, white space or control characters';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'is not a valid address';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'must be an http(s) address';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return 'has no host';
  return { base: `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '')}`, protocol: url.protocol, host };
}

/**
 * Why this PUBLIC_BASE_URL cannot go on a printed QR code in production (spec 2026-10-15-production-deployment, R4), or null.
 * A QR code printed with a private or local address is an irreversible mistake (BACKWARD_COMPATIBILITY.md section 1).
 */
function publicBaseUrlProblem(parsed: ParsedBase | string | undefined): string | null {
  if (parsed === undefined) return 'is not set';
  if (typeof parsed === 'string') return parsed;
  const { host } = parsed;
  if (parsed.protocol !== 'https:') return 'must start with https://';
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return `has an IP address as its host (${host}), not a public domain name`;
  if (!host.includes('.')) return `has a single-label host (${host}), not a public domain name`;
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return `has a local host (${host}), not a public domain name`;
  return null;
}

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  const e = parsed.data;
  const issues: string[] = [];

  const nodeEnv = e.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  if (isProduction && e.DATA_SOURCE === undefined) issues.push('DATA_SOURCE: must be set in production ("postgres"). Without it the app would start on demo data with public demo passwords.');
  const dataSource = e.DATA_SOURCE ?? 'memory';
  if (dataSource === 'postgres' && !e.DATABASE_URL) issues.push('DATABASE_URL: required when DATA_SOURCE=postgres.');
  // an unset data source was reported above: do not say the same thing twice
  if (isProduction && e.DATA_SOURCE === 'memory' && e.ALLOW_DEMO_DATA !== 'true') {
    issues.push('DATA_SOURCE=memory in production serves demo data and demo accounts with a PUBLIC password. Use postgres, or set ALLOW_DEMO_DATA=true if this really is a demo.');
  }
  const allowLocalBaseUrl = e.ALLOW_LOCAL_BASE_URL === 'true';
  const parsedBase = e.PUBLIC_BASE_URL === undefined ? undefined : parseBase(e.PUBLIC_BASE_URL);
  // text that can be read two ways is refused in every environment, with or without the escape hatch
  if (typeof parsedBase === 'string') issues.push(`PUBLIC_BASE_URL: ${parsedBase}.`);
  else if (isProduction && !allowLocalBaseUrl) {
    const problem = publicBaseUrlProblem(parsedBase);
    if (problem) issues.push(`PUBLIC_BASE_URL: ${problem}. In production it must be the public https:// address of this installation, because QR codes printed with a wrong address cannot be fixed. Only for a local run or a test, set ALLOW_LOCAL_BASE_URL=true.`);
  }
  // fails closed: a typo must not switch a public section on, and `demo` must never run next to real restaurants (Q2, R1)
  const showcase = e.SHOWCASE_MODE ?? 'off';
  if (showcase !== 'off' && showcase !== 'calculator' && showcase !== 'demo') {
    issues.push('SHOWCASE_MODE: must be "off", "calculator" or "demo" (or leave it unset for "off").');
  } else if (showcase === 'demo') {
    if (dataSource !== 'memory') issues.push('SHOWCASE_MODE=demo: requires DATA_SOURCE=memory. The demo is a separate instance with invented data and must never read or write real restaurants.');
    if (e.ALLOW_DEMO_DATA !== 'true') issues.push('SHOWCASE_MODE=demo: requires ALLOW_DEMO_DATA=true (the demo serves the invented restaurant Halka from memory).');
  }
  if (issues.length) throw new ConfigError(issues);

  // the stored address is the PARSED and checked one (origin and path, no query, fragment or trailing slash), never the raw text
  const base = typeof parsedBase === 'object' ? parsedBase : null;
  return {
    nodeEnv,
    isProduction,
    dataSource,
    databaseUrl: e.DATABASE_URL ?? null,
    secureCookies: e.AUTH_COOKIE_SECURE ? e.AUTH_COOKIE_SECURE === 'true' : isProduction,
    publicBaseUrl: base ? base.base : 'http://localhost:3000',
    publicBaseUrlIsDefault: !base,
    allowLocalBaseUrl,
    logLevel: e.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    demoRestaurantSlug: e.DEMO_RESTAURANT_SLUG ?? 'halka',
    metricsToken: e.METRICS_TOKEN ?? null,
    showcaseMode: showcase as ShowcaseMode
  };
}
