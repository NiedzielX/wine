import { describe, expect, it, vi } from 'vitest';

/**
 * The PostgreSQL wiring of the container, in its own module graph: DATA_SOURCE=postgres is read once per
 * process, so this file cannot share the memory-based tests.
 */
describe('container: the PostgreSQL wiring', () => {
  it('with DATA_SOURCE=postgres the container takes its repositories and connection from the database package', async () => {
    // the real repository classes are kept; only the connection is replaced by a stand-in
    vi.doMock('@wine-match/db', async (importOriginal) => {
      const fakeOrm = { em: { fork: () => ({}) } };
      return { ...(await importOriginal<typeof import('@wine-match/db')>()), getOrm: async () => fakeOrm };
    });
    process.env.DATA_SOURCE = 'postgres';
    process.env.DATABASE_URL = 'postgres://u:p@h:5432/d';
    const { getContainer, createRequestScope } = await import('@/server/container');
    expect(await getContainer()).toBeDefined();
    const scope = await createRequestScope();
    // resolving the per-request EntityManager runs the scoped factory
    expect(scope.cradle.em).toBeDefined();
    await scope.dispose();
    vi.doUnmock('@wine-match/db');
  });
});
