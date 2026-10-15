import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** the running built app of this e2e run */
    e2e: { baseUrl: string; appLogs: string };
  }
}
