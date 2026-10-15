import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the domain core. Every file of src/ counts (`all: true`). Coverage is reported, not enforced:
 * there is no threshold. Type-only declaration files have nothing to cover.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // shared contract suites: they run inside the memory and PostgreSQL test suites, they are not production code
      exclude: ['src/**/*.d.ts', 'src/testing/**'],
      reporter: ['text', 'lcov']
    }
  }
});
