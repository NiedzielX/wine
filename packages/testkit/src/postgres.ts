import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

/** The image the application runs on in production (docs: PostgreSQL ≥ 16). */
export const POSTGRES_IMAGE = 'postgres:16-alpine';

export type DatabaseSource = 'env' | 'container';

/**
 * Which PostgreSQL a test run uses. An explicit TEST_DATABASE_URL wins, so a developer can point the suite
 * at a local server; otherwise a throwaway container is started (CI, and anyone with Docker).
 */
export function chooseDatabaseSource(env: Record<string, string | undefined>): DatabaseSource {
  return env.TEST_DATABASE_URL?.trim() ? 'env' : 'container';
}

export interface TestDatabase {
  /** a connection string to the server; tests create their own databases on it */
  url: string;
  source: DatabaseSource;
  stop(): Promise<void>;
}

export async function startTestDatabase(env: Record<string, string | undefined> = process.env): Promise<TestDatabase> {
  const explicit = env.TEST_DATABASE_URL?.trim();
  if (explicit) return { url: explicit, source: 'env', stop: async () => undefined };
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase('wine_match_admin')
    .withUsername('wm')
    .withPassword('wm-test-only')
    .start();
  return { url: container.getConnectionUri(), source: 'container', stop: async () => { await container.stop(); } };
}

const DB_NAME = /^[a-z][a-z0-9_]{0,50}$/;

/**
 * Runs one parameterised query on a database and returns its rows — for tests that check what the running app
 * wrote (e.g. the usage events of an end-to-end run). One short-lived connection per call.
 */
export async function queryDatabase<T = Record<string, unknown>>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Drops and recreates a database on the server, and returns a connection string to it. */
export async function createDatabase(baseUrl: string, name: string): Promise<string> {
  if (!DB_NAME.test(name)) throw new Error(`Refusing unusual database name: "${name}"`);
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
