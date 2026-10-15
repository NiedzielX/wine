import { startTestDatabase } from '@wine-match/testkit';
import type { TestProject } from 'vitest/node';

/**
 * Starts ONE PostgreSQL server for the whole integration run (a testcontainers container in CI, or the
 * server named by TEST_DATABASE_URL) and hands its address to the test files. Each file then creates
 * its own database on it, so files never share data.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const db = await startTestDatabase();
  project.provide('databaseUrl', db.url);
  return async () => {
    await db.stop();
  };
}
