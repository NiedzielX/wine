import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabase } from '@wine-match/testkit';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, inject, vi } from 'vitest';
import { run } from '../scripts/restaurant-bootstrap';
import { ormConfig } from '../src/config';
import { DemoSeeder } from '../src/seeders/DemoSeeder';

/**
 * Spec 2026-10-15-production-deployment, R5 / AC8: the demo seeder (public passwords) refuses to write in production
 * unless a trial instance asks for it, and never on a database that already holds a real restaurant. "Used to be
 * possible, now refused": before this change `npm run db:seed` with NODE_ENV=production wrote the demo accounts.
 */
const baseUrl = inject('databaseUrl');
const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
const migrationsPath = fileURLToPath(new URL('../src/migrations', import.meta.url));

const open = (url: string) => MikroORM.init(ormConfig({ clientUrl: url, extensions: [Migrator], migrations: { path: migrationsPath, transactional: true, allOrNothing: true, snapshot: false } }));

async function withOrm<T>(url: string, fn: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await open(url);
  try { return await fn(orm); } finally { await orm.close(true); }
}

async function counts(url: string) {
  return withOrm(url, async (orm) => {
    const [r] = await orm.em.getConnection().execute(`select (select count(*) from restaurant)::int as restaurants, (select count(*) from app_user)::int as users, (select count(*) from membership)::int as memberships, (select count(*) from dish)::int as dishes`) as Array<Record<string, number>>;
    return r;
  });
}

async function migrated(name: string): Promise<string> {
  const url = await createDatabase(baseUrl, name);
  await withOrm(url, (orm) => orm.migrator.up());
  return url;
}

/** The real operator command: `npm run seed -w @wine-match/db`, as the migrator image runs it. */
function npmSeed(url: string, env: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile('npm', ['run', 'seed', '-w', '@wine-match/db'], { cwd: rootDir, env: { ...process.env, NODE_ENV: '', ALLOW_DEMO_DATA: '', ...env, DATABASE_URL: url } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` });
    });
  });
}

const warnings: string[] = [];
const runSeeder = (url: string, env: Record<string, string | undefined>) => withOrm(url, (orm) => new DemoSeeder(env, (m) => { warnings.push(m); }).run(orm.em.fork()));

async function addPilotRestaurant(url: string): Promise<void> {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const code = await run(['--name', 'Pilot', '--slug', 'pilot', '--address', 'ul. Wiślna 1', '--city', 'Kraków', '--wine-director', 'Anna Nowak', '--owner-email', 'anna@example.com', '--owner-name', 'Anna Nowak'],
    { USER_PASSWORD: 'correct horse battery staple', DATABASE_URL: url }, { openOrm: () => open(url) });
  vi.restoreAllMocks();
  expect(code).toBe(0);
}

describe('npm run db:seed in production (AC8)', () => {
  let url: string;
  beforeAll(async () => { url = await migrated('winematch_seed_cli'); });

  it('NODE_ENV=production without ALLOW_DEMO_DATA fails and writes nothing', async () => {
    const { code, output } = await npmSeed(url, { NODE_ENV: 'production' });
    expect(code).not.toBe(0);
    expect(output).toMatch(/ALLOW_DEMO_DATA/);
    expect(await counts(url)).toEqual({ restaurants: 0, users: 0, memberships: 0, dishes: 0 });
  });

  it('NODE_ENV=production with ALLOW_DEMO_DATA=true seeds an empty database (a trial instance)', async () => {
    const { code, output } = await npmSeed(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' });
    expect(output).not.toMatch(/Refusing/);
    expect(code).toBe(0);
    expect((await counts(url)).restaurants).toBe(1);
  });
});

describe('npm run db:seed by environment name (review of PR #120)', () => {
  it.each(['Production', 'PRODUCTION', ' production ', 'prod', 'staging', 'prodution'])('NODE_ENV=%j without ALLOW_DEMO_DATA fails and writes nothing', async (name) => {
    const url = await migrated('winematch_seed_name');
    const { code, output } = await npmSeed(url, { NODE_ENV: name });
    expect(code).not.toBe(0);
    expect(output).toMatch(/Refusing/);
    expect(await counts(url)).toEqual({ restaurants: 0, users: 0, memberships: 0, dishes: 0 });
  });

  it.each(['staging', 'Production'])('NODE_ENV=%s with ALLOW_DEMO_DATA=true still refuses a database with another restaurant', async (name) => {
    const url = await migrated('winematch_seed_name_pilot');
    await addPilotRestaurant(url);
    const before = await counts(url);
    const { code, output } = await npmSeed(url, { NODE_ENV: name, ALLOW_DEMO_DATA: 'true' });
    expect(code).not.toBe(0);
    expect(output).toMatch(/real installation/);
    expect(await counts(url)).toEqual(before);
  });

  it.each(['development', 'test'])('NODE_ENV=%s is allowed, silently, next to another restaurant', async (name) => {
    const url = await migrated('winematch_seed_name_dev');
    await addPilotRestaurant(url);
    const { code, output } = await npmSeed(url, { NODE_ENV: name });
    expect(code).toBe(0);
    expect(output).not.toMatch(/Warning: NODE_ENV/);
    expect((await counts(url)).restaurants).toBe(2);
  });

  it('NODE_ENV unset is allowed but warns that the guard cannot tell the environment', async () => {
    const url = await migrated('winematch_seed_unset');
    const { code, output } = await npmSeed(url, {});
    expect(code).toBe(0);
    expect(output).toMatch(/Warning: NODE_ENV is not set/);
    expect((await counts(url)).restaurants).toBe(1);
  });
});

describe('DemoSeeder guard', () => {
  it('refuses in production without ALLOW_DEMO_DATA, before any write', async () => {
    const url = await migrated('winematch_seed_prod');
    await expect(runSeeder(url, { NODE_ENV: 'production' })).rejects.toThrow(/ALLOW_DEMO_DATA/);
    expect(await counts(url)).toEqual({ restaurants: 0, users: 0, memberships: 0, dishes: 0 });
  });

  it('ALLOW_DEMO_DATA means exactly "true" and blank means not set', async () => {
    const url = await migrated('winematch_seed_exact');
    for (const allow of ['TRUE', 'yes', '1', ' ', '']) await expect(runSeeder(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: allow })).rejects.toThrow(/Refusing/);
    expect((await counts(url)).restaurants).toBe(0);
    warnings.length = 0;
    await runSeeder(url, { NODE_ENV: ' ', ALLOW_DEMO_DATA: '' });   // a blank NODE_ENV: allowed, with a warning
    expect(warnings).toHaveLength(1);
    expect((await counts(url)).restaurants).toBe(1);
  });

  it('with ALLOW_DEMO_DATA=true a repeated seed of the demo database still works', async () => {
    const url = await migrated('winematch_seed_again');
    await runSeeder(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' });
    const before = await counts(url);
    await runSeeder(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' });
    expect(await counts(url)).toEqual(before);
  });

  it('refuses on a database with another restaurant even with ALLOW_DEMO_DATA=true, and changes nothing', async () => {
    const url = await migrated('winematch_seed_pilot');
    await addPilotRestaurant(url);
    const before = await counts(url);
    expect(before.restaurants).toBe(1);
    await expect(runSeeder(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' })).rejects.toThrow(/real installation/);
    expect(await counts(url)).toEqual(before);
    const { code, output } = await npmSeed(url, { NODE_ENV: 'production', ALLOW_DEMO_DATA: 'true' });
    expect(code).not.toBe(0);
    expect(output).toMatch(/real installation/);
    expect(await counts(url)).toEqual(before);
  });

  it('outside production nothing is restricted: the demo can be added next to another restaurant', async () => {
    const url = await migrated('winematch_seed_dev');
    await addPilotRestaurant(url);
    await runSeeder(url, { NODE_ENV: 'development' });
    expect((await counts(url)).restaurants).toBe(2);
  });
});
