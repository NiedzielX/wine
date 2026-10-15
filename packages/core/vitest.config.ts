import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the domain core. Every file of src/ counts (`all: true`), and every line, branch, function and
 * statement must be covered: `npm test` fails below 100%. Type-only declaration files have nothing to cover.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // shared contract suites: they run inside the memory and PostgreSQL test suites, they are not production code
      exclude: ['src/**/*.d.ts', 'src/testing/**'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
});
