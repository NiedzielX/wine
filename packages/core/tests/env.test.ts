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
      publicBaseUrlIsDefault: true, allowLocalBaseUrl: false, logLevel: 'debug', demoRestaurantSlug: 'halka', metricsToken: null, showcaseMode: 'off'
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
  const base = { PUBLIC_BASE_URL: 'https://wine.example.com' };
  const prod = { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://u:p@h/db', ...base };

  it('a complete production setup works and uses secure cookies and info logging by default', () => {
    expect(parseEnv(prod)).toMatchObject({ isProduction: true, dataSource: 'postgres', secureCookies: true, logLevel: 'info' });
  });

  it('refuses to start without an explicit data source, and says so once', () => {
    expect(fails({ NODE_ENV: 'production', ...base })).toHaveLength(1);
    expect(fails({ NODE_ENV: 'production', ...base })[0]).toMatch(/DATA_SOURCE: must be set in production/);
  });

  it('refuses demo data (public passwords) unless it is explicitly allowed', () => {
    expect(fails({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ...base })[0]).toMatch(/PUBLIC password/);
    expect(parseEnv({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', ...base }).dataSource).toBe('memory');
    expect(fails({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'yes', ...base })[0]).toMatch(/ALLOW_DEMO_DATA: must be/);
  });

  it('reports every problem at once', () => {
    const issues = fails({ NODE_ENV: 'production', DATA_SOURCE: 'postgres', AUTH_COOKIE_SECURE: 'maybe', LOG_LEVEL: 'loud' });
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.join(' ')).toMatch(/AUTH_COOKIE_SECURE/);
    expect(issues.join(' ')).toMatch(/LOG_LEVEL/);
  });

  describe('PUBLIC_BASE_URL (spec 2026-10-15-production-deployment, R4, AC4)', () => {
    const withUrl = (url: string | undefined, extra: Record<string, string> = {}) => ({ ...prod, PUBLIC_BASE_URL: url, ...extra });

    it.each([
      ['not set', undefined],
      ['empty', ''],
      ['http instead of https', 'http://wine.example.com'],
      ['localhost', 'https://localhost'],
      ['localhost with a trailing dot', 'https://localhost./'],
      ['an IPv4 address', 'https://127.0.0.1'],
      ['a private IPv4 address', 'https://192.168.1.10'],
      ['the unspecified address', 'https://0.0.0.0'],
      ['an IPv6 address', 'https://[::1]'],
      ['a single-label host', 'https://app'],
      ['a .local host', 'https://pilot.local'],
      ['a .localhost host', 'https://wine.localhost'],
      ['a .internal host', 'https://wine.internal'],
      ['a .lan host', 'https://wine.lan'],
      ['a .home.arpa host', 'https://wine.home.arpa']
    ])('production refuses %s', (_label, url) => {
      const issues = fails(withUrl(url));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatch(/PUBLIC_BASE_URL/);
      expect(issues[0]).toMatch(/ALLOW_LOCAL_BASE_URL/);
    });

    it('production accepts a public https address', () => {
      expect(parseEnv(withUrl('https://wine.example.com'))).toMatchObject({ publicBaseUrl: 'https://wine.example.com', allowLocalBaseUrl: false });
      expect(parseEnv(withUrl('https://wine.example.com:8443/app/'))).toMatchObject({ publicBaseUrl: 'https://wine.example.com:8443/app' });
    });

    it('applies to every data source, including demo mode', () => {
      expect(fails({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true' })[0]).toMatch(/PUBLIC_BASE_URL: is not set/);
    });

    it('ALLOW_LOCAL_BASE_URL=true lets a local address through and is reported', () => {
      expect(parseEnv(withUrl('http://localhost:3000', { ALLOW_LOCAL_BASE_URL: 'true' }))).toMatchObject({ publicBaseUrl: 'http://localhost:3000', allowLocalBaseUrl: true });
      expect(parseEnv(withUrl(undefined, { ALLOW_LOCAL_BASE_URL: 'true' }))).toMatchObject({ publicBaseUrl: 'http://localhost:3000', publicBaseUrlIsDefault: true });
      expect(fails(withUrl('http://localhost:3000', { ALLOW_LOCAL_BASE_URL: 'yes' }))[0]).toMatch(/ALLOW_LOCAL_BASE_URL: must be/);
    });

    it('AUTH_COOKIE_SECURE=false does not excuse a local address', () => {
      expect(fails(withUrl('http://localhost:3000', { AUTH_COOKIE_SECURE: 'false' }))[0]).toMatch(/PUBLIC_BASE_URL/);
    });

    it('development is not restricted', () => {
      expect(parseEnv({ PUBLIC_BASE_URL: 'http://localhost:3000' }).allowLocalBaseUrl).toBe(false);
    });

    it('is reported together with the other problems', () => {
      expect(fails({ NODE_ENV: 'production' }).join(' ')).toMatch(/DATA_SOURCE.*PUBLIC_BASE_URL/);
    });
  });

  it('the error message lists the problems', () => {
    expect(() => parseEnv({ DATA_SOURCE: 'x' })).toThrow(/Invalid configuration:\n {2}- DATA_SOURCE/);
  });
});

describe('cookies and the public address', () => {
  it('AUTH_COOKIE_SECURE overrides the default both ways', () => {
    expect(parseEnv({ AUTH_COOKIE_SECURE: 'true' }).secureCookies).toBe(true);
    expect(parseEnv({ NODE_ENV: 'production', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true', AUTH_COOKIE_SECURE: 'false', PUBLIC_BASE_URL: 'https://wine.example.com' }).secureCookies).toBe(false);
  });

  it('PUBLIC_BASE_URL is normalised (no trailing slash, no path garbage) and must be http(s)', () => {
    expect(parseEnv({ PUBLIC_BASE_URL: 'https://wine.example.com/' })).toMatchObject({ publicBaseUrl: 'https://wine.example.com', publicBaseUrlIsDefault: false });
    expect(parseEnv({ PUBLIC_BASE_URL: 'https://example.com/app///' }).publicBaseUrl).toBe('https://example.com/app');
    expect(fails({ PUBLIC_BASE_URL: 'wine.example.com' })[0]).toMatch(/PUBLIC_BASE_URL/);
    expect(fails({ PUBLIC_BASE_URL: 'ftp://example.com' })[0]).toMatch(/PUBLIC_BASE_URL/);
  });

  describe('the stored address is the parsed, checked one (review of PR #120)', () => {
    const prod = { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgres://u:p@h/db' };

    it.each([
      ['HTTPS://wine.example.com', 'https://wine.example.com'],
      ['Https://Wine.Example.COM/', 'https://wine.example.com'],
      ['https://wine。example。com', 'https://wine.example.com'],
      ['https://wine.example.com./app//', 'https://wine.example.com/app'],
      ['https://wine.example.com:443/', 'https://wine.example.com'],
      ['https://wine.example.com:8443/x?a=1#f', 'https://wine.example.com:8443/x']
    ])('production stores %s as %s and it is not the default address', (raw, stored) => {
      expect(parseEnv({ ...prod, PUBLIC_BASE_URL: raw })).toMatchObject({ publicBaseUrl: stored, publicBaseUrlIsDefault: false });
    });

    it.each([
      ['userinfo', 'https://user:pw@wine.example.com'],
      ['userinfo without a password', 'https://user@wine.example.com'],
      ['a backslash that the parser reads as a slash', 'https://wine.example.com\\@localhost'],
      ['a backslash alone', 'https://wine.example.com\\path'],
      ['white space', 'https://wine.example.com/ a'],
      ['an @ in the path', 'https://wine.example.com/@x']
    ])('refuses %s in every environment, even with ALLOW_LOCAL_BASE_URL', (_label, raw) => {
      for (const extra of [prod, { ...prod, ALLOW_LOCAL_BASE_URL: 'true' }, {}]) expect(fails({ ...extra, PUBLIC_BASE_URL: raw })[0]).toMatch(/PUBLIC_BASE_URL/);
    });

    it.each(['.invalid', '.localdomain', '.intranet', '.corp', '.local', '.localhost'])('production refuses a %s host', (suffix) => {
      expect(fails({ ...prod, PUBLIC_BASE_URL: `https://wine${suffix}` })[0]).toMatch(/local host/);
    });

    it('.test stays allowed: the spec and the e2e suite use https://wine.example.test as a public address', () => {
      expect(parseEnv({ ...prod, PUBLIC_BASE_URL: 'https://wine.example.test' }).publicBaseUrl).toBe('https://wine.example.test');
    });
  });

  it('the demo restaurant slug must look like an address name', () => {
    expect(parseEnv({ DEMO_RESTAURANT_SLUG: 'my-place' }).demoRestaurantSlug).toBe('my-place');
    expect(fails({ DEMO_RESTAURANT_SLUG: 'My Place' })[0]).toMatch(/DEMO_RESTAURANT_SLUG/);
  });
});

describe('metrics token', () => {
  it('is optional (null = endpoint disabled), blank counts as unset, and a short token is refused', () => {
    expect(parseEnv({}).metricsToken).toBeNull();
    expect(parseEnv({ METRICS_TOKEN: '  ' }).metricsToken).toBeNull();
    expect(parseEnv({ METRICS_TOKEN: 'x'.repeat(32) }).metricsToken).toBe('x'.repeat(32));
    expect(fails({ METRICS_TOKEN: 'short' })[0]).toMatch(/METRICS_TOKEN: must be at least 32 characters/);
  });
});

describe('SHOWCASE_MODE (spec 2026-11-04-sales-demo-and-roi-calculator, R1, AC1)', () => {
  const postgres = { DATA_SOURCE: 'postgres', DATABASE_URL: 'postgresql://u:p@h:5432/db' };
  const production = { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://wine.example.com' };

  it('unset or blank is off, so the /demo pages answer 404', () => {
    expect(parseEnv({}).showcaseMode).toBe('off');
    expect(parseEnv({ SHOWCASE_MODE: '' }).showcaseMode).toBe('off');
    expect(parseEnv({ SHOWCASE_MODE: '   ' }).showcaseMode).toBe('off');
    expect(parseEnv({ SHOWCASE_MODE: 'off' }).showcaseMode).toBe('off');
  });

  it('calculator is accepted on postgres, and in production on a real installation: it reads no data', () => {
    expect(parseEnv({ SHOWCASE_MODE: 'calculator' }).showcaseMode).toBe('calculator');
    expect(parseEnv({ SHOWCASE_MODE: 'calculator', ...postgres }).showcaseMode).toBe('calculator');
    expect(parseEnv({ SHOWCASE_MODE: 'calculator', ...postgres, ...production }).showcaseMode).toBe('calculator');
  });

  it('a value outside the list is refused with the name of the variable, not read as off or as calculator', () => {
    for (const bad of ['calculater', 'Calculator', 'ON', 'true', '1', 'calculator ', 'off,calculator']) {
      expect(fails({ SHOWCASE_MODE: bad })[0], bad).toMatch(/^SHOWCASE_MODE: must be "off", "calculator" or "demo"/);
    }
  });

  it('demo needs DATA_SOURCE=memory and ALLOW_DEMO_DATA=true, each refusal names its variable', () => {
    expect(parseEnv({ SHOWCASE_MODE: 'demo', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true' }).showcaseMode).toBe('demo');
    expect(parseEnv({ SHOWCASE_MODE: 'demo', ALLOW_DEMO_DATA: 'true' }).showcaseMode).toBe('demo');
    expect(fails({ SHOWCASE_MODE: 'demo' })).toEqual([expect.stringMatching(/^SHOWCASE_MODE=demo: requires ALLOW_DEMO_DATA=true/)]);
    expect(fails({ SHOWCASE_MODE: 'demo', ALLOW_DEMO_DATA: 'false' })[0]).toMatch(/ALLOW_DEMO_DATA=true/);
    const onPostgres = fails({ SHOWCASE_MODE: 'demo', ALLOW_DEMO_DATA: 'true', ...postgres });
    expect(onPostgres).toEqual([expect.stringMatching(/^SHOWCASE_MODE=demo: requires DATA_SOURCE=memory/)]);
    // postgres without the flag: both reasons, in one error
    expect(fails({ SHOWCASE_MODE: 'demo', ...postgres })).toHaveLength(2);
  });

  it('demo in production still obeys the https rule of PUBLIC_BASE_URL and the memory rule', () => {
    const demo = { SHOWCASE_MODE: 'demo', DATA_SOURCE: 'memory', ALLOW_DEMO_DATA: 'true' };
    expect(parseEnv({ ...demo, ...production }).showcaseMode).toBe('demo');
    expect(fails({ ...demo, NODE_ENV: 'production', PUBLIC_BASE_URL: 'http://wine.example.com' })[0]).toMatch(/PUBLIC_BASE_URL: must start with https/);
    expect(fails({ ...demo, NODE_ENV: 'production' })[0]).toMatch(/PUBLIC_BASE_URL: is not set/);
    expect(fails({ SHOWCASE_MODE: 'demo', ALLOW_DEMO_DATA: 'true', ...postgres, ...production })[0]).toMatch(/DATA_SOURCE=memory/);
  });

  it('a wrong value is reported together with the other problems, in one error', () => {
    const issues = fails({ SHOWCASE_MODE: 'nope', DATA_SOURCE: 'postgres' });
    expect(issues).toHaveLength(2);
    expect(issues.join('\n')).toMatch(/DATABASE_URL/);
    expect(issues.join('\n')).toMatch(/SHOWCASE_MODE/);
  });
});
