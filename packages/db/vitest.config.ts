import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the data package: everything that runs WITHOUT a database (auth hashing and tokens, file parsers,
 * row mapping, configuration). Repositories, entities, migrations and seeders need PostgreSQL: they are covered by
 * vitest.integration.config.ts, not by this gate. Each excluded file is listed here with its reason.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/auth/**/*.ts', 'src/import/**/*.ts', 'src/mappers.ts', 'src/config.ts'],
      reporter: ['text', 'lcov']
    }
  }
});
