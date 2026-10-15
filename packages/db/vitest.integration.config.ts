import { defineConfig } from 'vitest/config';

/**
 * PostgreSQL integration tests. The server comes from tests/support/global-setup.ts: a throwaway
 * testcontainers container, or the server named by TEST_DATABASE_URL (see packages/testkit).
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false
  }
});
