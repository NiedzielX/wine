import { defineConfig } from 'vitest/config';

/**
 * The harness's pure logic (command building, output reading, database source choice) is unit-tested here.
 * The processes it starts (PostgreSQL containers, the app server, the browser) are exercised by the suites that
 * use it, so they are not part of this gate.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/command-line.ts', 'src/postgres.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
});
