import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '../src/config/env';

const fails = (raw: Record<string, string | undefined>): string[] => {
  try {
    parseEnv(raw);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return (e as ConfigError).issues;
  }
  throw new Error('expected the configuration to be refused');
};

describe('development', () => {
  it('an empty environment is a working demo setup', () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: 'development', isProduction: false, dataSource: 'memory', databaseUrl: null, secureCookies: false, publicBaseUrl: 'http://localhost:3000',
      publicBaseUrlIsDefault: true, logLevel: 'debug', demoRestaurantSlug: 'halka'
    });
  });

  it('treats blank values as not set (a shell that exports FOO= is not a setting)', () => {
    expect(parseEnv({ DATA_SOURCE: '', AUTH_COOKIE_SECURE: '  ', PUBLIC_BASE_URL: '' }).dataSource).toBe('memory');
  });
});

describe('data source: a typo must not pick the demo data', () => {
  it('refuses an unknown value instead of falling back to memory', () => {
    expect(fails({ DATA_SOURCE: 'postgress' })[0]).toMatch(/DATA_SOURCE: must be "memory" or "postgres"/);
  });

  it('postgres needs a database address in the right form', () => {
    expect(fails({ DATA_SOURCE: 'postgres' })).toEqual(['DATABASE_URL: required when DATA_SOURCE=postgres.']);
    expect(fails({ DATA_SOURCE: 'postgres', DATABASE_URL: 'mysql://x' })[0]).toMatch(/DATABASE_URL: must start with postgres/);
    expect(parseEnv({ DATA_SOURCE: 'postgres', DATABASE_URL: 'postgresql://u:p@h:5432/db' }).databaseUrl).toBe('postgresql://u:p@h:5432/db');
  });
});

describe('production fails closed', () => {
  const prod = { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://u:p@h/db' };

  it('a complete production setup works and uses secure cookies and info logging by default', () => {
    expect(parseEnv(prod)).toMatchObject({ isProduction: true, dataSource: 'postgres', secureCookies: true, logLevel: 'info' });
  });

  it('refuses to start without an explicit data source, and says so once', () => {
    expect(fails({ NODE_ENV: 'production' })).toHaveLength(1);
    expect(fails({ NODE_ENV: 'production' })[0]).toMatch(/DATA_SOURCE: must be set in production/);
  });

  it('refuses demo data (public passwords) unless it is explicitly allowed', () => {
    expect(fails({ NODE_ENV: 'production', DATA_SOURCE: 'memory' })[0]).toMatch(/PUBLIC password/);
    expect(parseEnv({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true' }).dataSource).toBe('memory');
    expect(fails({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'yes' })[0]).toMatch(/ALLOW_DEMO_DATA: must be/);
  });

  it('reports every problem at once', () => {
    const issues = fails({ NODE_ENV: 'production', DATA_SOURCE: 'postgres', AUTH_COOKIE_SECURE: 'maybe', LOG_LEVEL: 'loud' });
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join(' ')).toMatch(/AUTH_COOKIE_SECURE/);
    expect(issues.join(' ')).toMatch(/LOG_LEVEL/);
  });

  it('the error message lists the problems', () => {
    expect(() => parseEnv({ DATA_SOURCE: 'x' })).toThrow(/Invalid configuration:\n {2}- DATA_SOURCE/);
  });
});

describe('cookies and the public address', () => {
  it('AUTH_COOKIE_SECURE overrides the default both ways', () => {
    expect(parseEnv({ AUTH_COOKIE_SECURE: 'true' }).secureCookies).toBe(true);
    expect(parseEnv({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', AUTH_COOKIE_SECURE: 'false' }).secureCookies).toBe(false);
  });

  it('PUBLIC_BASE_URL is normalised (no trailing slash, no path garbage) and must be http(s)', () => {
    expect(parseEnv({ PUBLIC_BASE_URL: 'https://wine.example.com/' })).toMatchObject({ publicBaseUrl: 'https://wine.example.com', publicBaseUrlIsDefault: false });
    expect(parseEnv({ PUBLIC_BASE_URL: 'https://example.com/app///' }).publicBaseUrl).toBe('https://example.com/app');
    expect(fails({ PUBLIC_BASE_URL: 'wine.example.com' })[0]).toMatch(/PUBLIC_BASE_URL/);
    expect(fails({ PUBLIC_BASE_URL: 'ftp://example.com' })[0]).toMatch(/PUBLIC_BASE_URL/);
  });

  it('the demo restaurant slug must look like an address name', () => {
    expect(parseEnv({ DEMO_RESTAURANT_SLUG: 'my-place' }).demoRestaurantSlug).toBe('my-place');
    expect(fails({ DEMO_RESTAURANT_SLUG: 'My Place' })[0]).toMatch(/DEMO_RESTAURANT_SLUG/);
  });
});
