import { Migrator } from '@mikro-orm/migrations';
import { MikroORM } from '@mikro-orm/postgresql';
import { createDatabase } from '@wine-match/testkit';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, inject } from 'vitest';
import { ormConfig } from '../src/config';
import { DemoSeeder } from '../src/seeders/DemoSeeder';

/**
 * `npm run user:invite` as an operator runs it (the real script, the real container, PostgreSQL): the link on stdout carries the
 * token whose SHA-256 is the only thing stored, nothing but the link is on stdout, the token is nowhere else, and a protected
 * NODE_ENV writes nothing.
 */
const baseUrl = inject('databaseUrl');
const rootDir = fileURLToPath(new URL('../../..', import.meta.url));
const migrationsPath = fileURLToPath(new URL('../src/migrations', import.meta.url));
let url: string;

const open = (u: string) => MikroORM.init(ormConfig({ clientUrl: u, extensions: [Migrator], migrations: { path: migrationsPath, transactional: true, allOrNothing: true, snapshot: false } }));
async function withOrm<T>(fn: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await open(url);
  try { return await fn(orm); } finally { await orm.close(true); }
}
const tokens = () => withOrm(async (orm) => (await orm.em.getConnection().execute(`select lower(email) as email, role, token_hash, platform from auth_token order by created_at`)) as Array<{ email: string; role: string; token_hash: string; platform: boolean }>);

function invite(args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('npx', ['tsx', 'scripts/user-invite.ts', ...args], { cwd: rootDir, env: { ...process.env, NODE_ENV: 'test', ALLOW_DEMO_DATA: '', DATA_SOURCE: 'postgres', DATABASE_URL: url, PUBLIC_BASE_URL: 'http://localhost:3000', LOG_LEVEL: 'error', ...env } }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  url = await createDatabase(baseUrl, 'user_invite');
  await withOrm(async (orm) => { await orm.migrator.up(); await new DemoSeeder({ NODE_ENV: 'test' }).run(orm.em.fork()); });
}, 120_000);

const as = (email: string, who = 'tomasz@halka.pl') => ['--restaurant', 'halka', '--email', email, '--role', 'sommelier', '--as', who];

describe('user:invite on PostgreSQL', () => {
  it('stores only the hash of the token it prints in the link', async () => {
    const r = await invite(as('Fresh.Sommelier@Example.com'), {});
    expect(r.code, r.stderr).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const link = new URL(lines[0]);
    expect(`${link.origin}${link.pathname}`).toBe('http://localhost:3000/admin/accept');
    const token = link.searchParams.get('token')!;
    expect(r.stderr).not.toContain(token);
    const rows = await tokens();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'fresh.sommelier@example.com', role: 'sommelier', platform: false });
    expect(rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(rows)).not.toContain(token);
  }, 60_000);

  it('refuses a protected NODE_ENV and writes nothing; ALLOW_DEMO_DATA=true lets it through', async () => {
    const before = (await tokens()).length;
    const production = { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://wine.example.com' };
    const refused = await invite(as('blocked@example.com'), production);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe('');
    expect(refused.stderr).toContain('Refusing to issue an invitation');
    expect(await tokens()).toHaveLength(before);
    const allowed = await invite(as('trial@example.com'), { ...production, ALLOW_DEMO_DATA: 'true' });
    expect(allowed.code, allowed.stderr).toBe(0);
    expect(allowed.stdout.startsWith('https://wine.example.com/admin/accept?token=')).toBe(true);
  }, 60_000);

  it('lets the service refuse an inviter without the right: exit 1, no link, no row', async () => {
    const before = (await tokens()).length;
    const r = await invite(as('nope@example.com', 'marta@halka.pl'), {});
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(await tokens()).toHaveLength(before);
  }, 60_000);
});
