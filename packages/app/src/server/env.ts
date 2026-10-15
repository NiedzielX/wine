import { parseEnv, type AppEnv } from '@wine-match/core';

let cached: AppEnv | undefined;

/**
 * The validated configuration. Read lazily, never at import time: `next build` must work with no
 * environment and no database. `src/instrumentation.ts` calls this when the server STARTS, so a wrong
 * setting stops the start with a clear message instead of failing the first request.
 */
export function env(): AppEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
