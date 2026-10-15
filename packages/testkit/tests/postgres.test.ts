import { beforeEach, describe, expect, it, vi } from 'vitest';

const sql: string[] = [];
let stopped = false;

vi.mock('@testcontainers/postgresql', () => ({
  POSTGRES_IMAGE: 'x',
  PostgreSqlContainer: class {
    withDatabase() { return this; }
    withUsername() { return this; }
    withPassword() { return this; }
    async start() {
      return { getConnectionUri: () => 'postgres://wm:secret@127.0.0.1:55555/wine_match_admin', stop: async () => { stopped = true; } };
    }
  }
}));

vi.mock('pg', () => ({
  default: {
    Client: class {
      async connect() { /* connected */ }
      async query(text: string) { sql.push(text); }
      async end() { /* closed */ }
    }
  }
}));

import { chooseDatabaseSource, createDatabase, POSTGRES_IMAGE, startTestDatabase } from '../src/postgres';

beforeEach(() => { sql.length = 0; stopped = false; });

describe('which PostgreSQL a run uses', () => {
  it('an explicit TEST_DATABASE_URL wins; blank counts as not set; otherwise a container', () => {
    expect(chooseDatabaseSource({ TEST_DATABASE_URL: 'postgres://local' })).toBe('env');
    expect(chooseDatabaseSource({ TEST_DATABASE_URL: '   ' })).toBe('container');
    expect(chooseDatabaseSource({})).toBe('container');
    expect(POSTGRES_IMAGE).toBe('postgres:16-alpine');
  });

  it('with an explicit server, that address is used and stopping it does nothing', async () => {
    const db = await startTestDatabase({ TEST_DATABASE_URL: ' postgres://me@localhost:5432/postgres ' });
    expect(db).toMatchObject({ url: 'postgres://me@localhost:5432/postgres', source: 'env' });
    await db.stop();
    expect(stopped).toBe(false);
  });

  it('without one, a container is started and stopped with the run', async () => {
    const db = await startTestDatabase({});
    expect(db.source).toBe('container');
    expect(db.url).toContain('55555');
    await db.stop();
    expect(stopped).toBe(true);
  });
});

describe('creating a database for one test file', () => {
  it('drops and recreates it on the server and returns an address to it', async () => {
    const url = await createDatabase('postgres://wm:secret@127.0.0.1:55555/wine_match_admin', 'winematch_db_test');
    expect(url).toBe('postgres://wm:secret@127.0.0.1:55555/winematch_db_test');
    expect(sql).toEqual(['drop database if exists "winematch_db_test" with (force)', 'create database "winematch_db_test"']);
  });

  it('a database name that could inject SQL is refused before anything is sent', async () => {
    await expect(createDatabase('postgres://x', 'a"; drop table x; --')).rejects.toThrow(/Refusing unusual database name/);
    await expect(createDatabase('postgres://x', 'Upper')).rejects.toThrow();
    expect(sql).toEqual([]);
  });
});
