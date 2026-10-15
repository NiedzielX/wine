import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the reusable UI pieces: the shared feedback components, the class helper and the package entry
 * point. They render to static markup, so no browser is needed. shadcn/ui primitives are copied third-party code
 * (added with `npx shadcn add`) and are not part of this gate.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/backend/**/*.{ts,tsx}', 'src/lib/**/*.ts', 'src/index.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 }
    }
  }
});
