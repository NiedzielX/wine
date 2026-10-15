import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite: the BUILT app runs against a PostgreSQL server (testcontainers in CI, or
 * TEST_DATABASE_URL) and the tests drive it through the agent-browser CLI. Run `npm run build` first.
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 240_000
  }
});
