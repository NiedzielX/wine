import { z } from 'zod';
import type { LogLevel } from '../logging/logger';

/**
 * The application's configuration, read once from the environment and checked. A wrong or missing
 * setting stops the start with a message that names every problem, instead of running half-configured.
 * Settings that decide who can see what FAIL CLOSED: a typo must never silently pick the demo data.
 */
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
  logLevel: LogLevel;
  demoRestaurantSlug: string;
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
  ALLOW_DEMO_DATA: optional(z.enum(['true', 'false'], { error: 'must be "true" or "false"' })),
  LOG_LEVEL: optional(z.enum(['debug', 'info', 'warn', 'error'], { error: 'must be debug, info, warn or error' })),
  DEMO_RESTAURANT_SLUG: optional(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: 'must be a lower-case address name' }))
});

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
  if (issues.length) throw new ConfigError(issues);

  // zod has already checked this is an http(s) address; keep the origin and the path, drop query and fragment
  const base = e.PUBLIC_BASE_URL ? /^(https?:\/\/[^/?#]+)([^?#]*)/.exec(e.PUBLIC_BASE_URL) : null;
  return {
    nodeEnv,
    isProduction,
    dataSource,
    databaseUrl: e.DATABASE_URL ?? null,
    secureCookies: e.AUTH_COOKIE_SECURE ? e.AUTH_COOKIE_SECURE === 'true' : isProduction,
    publicBaseUrl: base ? `${base[1].toLowerCase()}${base[2].replace(/\/+$/, '')}` : 'http://localhost:3000',
    publicBaseUrlIsDefault: !base,
    logLevel: e.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    demoRestaurantSlug: e.DEMO_RESTAURANT_SLUG ?? 'halka'
  };
}
