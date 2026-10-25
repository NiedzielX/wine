import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabase } from '@wine-match/testkit';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, inject, vi } from 'vitest';
import { run } from '../scripts/restaurant-bootstrap';
import { verifyPassword } from '../src/auth';
import { ormConfig } from '../src/config';
import { DemoSeeder } from '../src/seeders/DemoSeeder';

const baseUrl = inject('databaseUrl');
const PASSWORD = 'correct horse battery staple';
const migrationsPath = fileURLToPath(new URL('../src/migrations', import.meta.url));

const GOOD = ['--name', 'Bistro Nad Wisłą', '--slug', 'bistro-nad-wisla', '--address', 'ul. Wiślna 1', '--city', 'Kraków', '--wine-director', 'Anna Nowak', '--owner-email', 'anna@example.com', '--owner-name', 'Anna Nowak'];

function open(url: string): Promise<MikroORM> {
  return MikroORM.init(ormConfig({ clientUrl: url, extensions: [Migrator], migrations: { path: migrationsPath, transactional: true, allOrNothing: true, snapshot: false } }));
}

async function withOrm<T>(url: string, fn: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await open(url);
  try { return await fn(orm); } finally { await orm.close(true); }
}

const rows = (url: string, sql: string) => withOrm(url, (orm) => orm.em.getConnection().execute(sql) as Promise<Record<string, unknown>[]>);
const counts = async (url: string) => {
  const [r] = await rows(url, `select (select count(*) from restaurant)::int as restaurants, (select count(*) from app_user)::int as users, (select count(*) from membership)::int as memberships`);
  return r as { restaurants: number; users: number; memberships: number };
};

/** One database per scenario so the files-wide state stays predictable (migrated, optionally seeded). */
async function database(name: string, { seed = false, migrate = true } = {}): Promise<string> {
  const url = await createDatabase(baseUrl, name);
  if (migrate) await withOrm(url, async (orm) => { await orm.migrator.up(); if (seed) await new DemoSeeder().run(orm.em.fork()); });
  return url;
}

describe('restaurant:create on PostgreSQL', () => {
  let out: string[];
  let err: string[];
  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => { out.push(a.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a) => { err.push(a.join(' ')); });
  });
  afterEach(() => vi.restoreAllMocks());

  const bootstrap = (url: string, args: string[], env: Record<string, string> = { USER_PASSWORD: PASSWORD }) =>
    run(args, { ...env, DATABASE_URL: url }, { openOrm: () => open(url) });
  /** AC7: nothing the command prints contains the password or the connection string. */
  const expectNoSecrets = (url: string) => {
    const all = [...out, ...err].join('\n');
    expect(all).not.toContain(PASSWORD);
    expect(all).not.toContain(url);
  };

  describe('on a migrated database without demo data', () => {
    let url: string;
    beforeAll(async () => { url = await database('winematch_bootstrap_fresh'); });

    it('creates an onboarding restaurant, an account with a verifiable hash and an owner membership (AC1)', async () => {
      expect(await bootstrap(url, GOOD)).toBe(0);
      expect(out).toEqual([
        'Created restaurant "Bistro Nad Wisłą" (slug: bistro-nad-wisla, status: onboarding).',
        'Created account anna@example.com as owner.',
        'Sign in at /admin/bistro-nad-wisla (on your PUBLIC_BASE_URL).',
        'Next: the owner imports the menu on the Setup screen.'
      ]);
      expectNoSecrets(url);
      const [r] = await rows(url, `select r.status, r.published_at, r.currency, r.address, r.city, r.wine_director, r.settings, u.email, u.name, u.password_hash, m.role from restaurant r join membership m on m.restaurant_id = r.id join app_user u on u.id = m.user_id where r.slug = 'bistro-nad-wisla'`);
      expect(r).toMatchObject({ status: 'onboarding', published_at: null, currency: 'PLN', address: 'ul. Wiślna 1', city: 'Kraków', wine_director: 'Anna Nowak', email: 'anna@example.com', name: 'Anna Nowak', role: 'owner', settings: { showUnreviewed: true, showScores: true } });
      expect(await verifyPassword(PASSWORD, r!.password_hash as string)).toBe(true);
      expect(await verifyPassword('another passphrase', r!.password_hash as string)).toBe(false);
      expect(await counts(url)).toEqual({ restaurants: 1, users: 1, memberships: 1 });
    });

    it('refuses a taken slug and a taken e-mail (other letter case) and changes nothing (AC3)', async () => {
      const before = await counts(url);
      const slugTaken = await bootstrap(url, GOOD.map((a) => (a === 'anna@example.com' ? 'other@example.com' : a)));
      expect(slugTaken).toBe(1);
      expect(err).toContain('Error: A restaurant with slug "bistro-nad-wisla" already exists. Nothing was saved.');

      err.length = 0;
      const emailTaken = await bootstrap(url, GOOD.map((a) => (a === 'bistro-nad-wisla' ? 'drugi-lokal' : a === 'anna@example.com' ? 'Anna@Example.com' : a)));
      expect(emailTaken).toBe(1);
      expect(err).toContain('Error: An account anna@example.com already exists. Nothing was saved. Use --allow-existing-account to make it the owner.');
      expect(await counts(url)).toEqual(before);
      expectNoSecrets(url);
    });

    it('with --allow-existing-account adds only the owner membership, no password needed, password unchanged (AC4)', async () => {
      const [{ password_hash: before }] = (await rows(url, `select password_hash from app_user where email = 'anna@example.com'`)) as [{ password_hash: string }];
      const args = ['--name', 'Drugi Lokal', '--slug', 'drugi-lokal', '--address', 'ul. Inna 2', '--city', 'Kraków', '--wine-director', 'Anna Nowak', '--owner-email', 'ANNA@example.com', '--owner-name', 'Anna Nowak', '--allow-existing-account'];
      out.length = 0;
      expect(await bootstrap(url, args, {})).toBe(0);
      expect(out[1]).toBe('Account anna@example.com already exists; its password is unchanged. Added as owner.');
      const [after] = (await rows(url, `select password_hash from app_user where email = 'anna@example.com'`)) as [{ password_hash: string }];
      expect(after.password_hash).toBe(before);
      const memberships = await rows(url, `select r.slug, m.role from membership m join restaurant r on r.id = m.restaurant_id join app_user u on u.id = m.user_id where u.email = 'anna@example.com' order by r.slug`);
      expect(memberships).toEqual([{ slug: 'bistro-nad-wisla', role: 'owner' }, { slug: 'drugi-lokal', role: 'owner' }]);
      expect(await counts(url)).toEqual({ restaurants: 2, users: 1, memberships: 2 });
      expectNoSecrets(url);
    });

    it('with --allow-existing-account but an unknown e-mail still needs the password and saves nothing without it', async () => {
      const before = await counts(url);
      const args = ['--name', 'Trzeci', '--slug', 'trzeci', '--address', 'a', '--city', 'c', '--wine-director', 'd', '--owner-email', 'nobody@example.com', '--owner-name', 'Nobody', '--allow-existing-account'];
      expect(await bootstrap(url, args, {})).toBe(1);
      expect(err.join('\n')).toContain('Set USER_PASSWORD to a password of at least 12 characters.');
      expect(await counts(url)).toEqual(before);
    });
  });

  it('keeps Halka\'s slug out of reach and leaves the demo data alone (AC3, slug "halka")', async () => {
    const url = await database('winematch_bootstrap_seeded', { seed: true });
    const before = await counts(url);
    expect(await bootstrap(url, GOOD.map((a) => (a === 'bistro-nad-wisla' ? 'halka' : a)))).toBe(1);
    expect(err).toContain('Error: A restaurant with slug "halka" already exists. Nothing was saved.');
    expect(await counts(url)).toEqual(before);
    // and a new restaurant next to Halka is created without touching it
    expect(await bootstrap(url, GOOD)).toBe(0);
    expect(await counts(url)).toEqual({ restaurants: before.restaurants + 1, users: before.users + 1, memberships: before.memberships + 1 });
    const [owner] = await rows(url, `select count(*)::int as n from membership m join restaurant r on r.id = m.restaurant_id join app_user u on u.id = m.user_id where u.email = 'anna@example.com'`);
    expect(owner).toEqual({ n: 1 });
  });

  it('lets exactly one of two parallel calls with the same slug win and leaves no orphan account (AC3)', async () => {
    const url = await database('winematch_bootstrap_race');
    const withEmail = (email: string) => GOOD.map((a) => (a === 'anna@example.com' ? email : a));
    const codes = await Promise.all([bootstrap(url, withEmail('one@example.com')), bootstrap(url, withEmail('two@example.com'))]);
    expect([...codes].sort()).toEqual([0, 1]);
    expect(await counts(url)).toEqual({ restaurants: 1, users: 1, memberships: 1 });
    expect(err.join('\n')).toContain('already exists. Nothing was saved.');
    expectNoSecrets(url);
  });

  it('lets exactly one of two parallel calls with the same slug and e-mail win (AC3)', async () => {
    const url = await database('winematch_bootstrap_race_email');
    const codes = await Promise.all([bootstrap(url, GOOD), bootstrap(url, GOOD)]);
    expect([...codes].sort()).toEqual([0, 1]);
    expect(await counts(url)).toEqual({ restaurants: 1, users: 1, memberships: 1 });
  });

  it('fails with a hint and creates nothing on a database without applied migrations (AC6)', async () => {
    const url = await database('winematch_bootstrap_unmigrated', { migrate: false });
    expect(await bootstrap(url, GOOD)).toBe(1);
    expect(err).toContain('Error: Pending migrations: run npm run db:migrate first.');
    const [t] = await rows(url, `select to_regclass('restaurant') as restaurant, to_regclass('app_user') as app_user, to_regclass('membership') as membership, to_regclass('mikro_orm_migrations') as bookkeeping`);
    expect(t).toEqual({ restaurant: null, app_user: null, membership: null, bookkeeping: null });
    expectNoSecrets(url);
  });

  it('also refuses when only some migrations are applied (AC6)', async () => {
    const url = await database('winematch_bootstrap_partial', { migrate: false });
    await withOrm(url, async (orm) => {
      const pending = await orm.migrator.getPending();
      expect(pending.length).toBeGreaterThan(1);
      await orm.migrator.up({ to: pending[0]!.name });
    });
    expect(await bootstrap(url, GOOD)).toBe(1);
    expect(err).toContain('Error: Pending migrations: run npm run db:migrate first.');
    expect((await rows(url, `select count(*)::int as n from restaurant`))[0]).toEqual({ n: 0 });
  });

  it('reports an unreachable database as one error line without the connection string (AC6, AC7)', async () => {
    const unreachable = 'postgres://postgres:hunter2-not-a-real-pass@127.0.0.1:1/nothing';
    const code = await run(GOOD, { USER_PASSWORD: PASSWORD, DATABASE_URL: unreachable }, { openOrm: () => open(unreachable) });
    expect(code).toBe(1);
    const all = [...out, ...err].join('\n');
    expect(all).not.toContain(unreachable);
    expect(all).not.toContain('hunter2-not-a-real-pass');
    expect(all).not.toContain(PASSWORD);
  });
});
