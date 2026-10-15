import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the application's server side: request handling, the API routes (with the in-memory data
 * source), server actions, the proxy and start-up. Pages and components are React Server Components and client
 * components: they are exercised by the end-to-end suite (tests/e2e), not counted here.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'node',
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/server/**/*.ts',
        'src/proxy.ts',
        'src/instrumentation.ts',
        'src/app/api/**/route.ts',
        'src/app/**/actions.ts',
        'src/app/**/auth-actions.ts',
        'src/app/**/import-actions.ts',
        'src/app/**/format.ts',
        'src/app/**/messages.ts',
        'src/app/**/language-actions.ts'
      ],
      exclude: ['src/server/**/*.d.ts'],
      reporter: ['text', 'lcov']
    }
  }
});
