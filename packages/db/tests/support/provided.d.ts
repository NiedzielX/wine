import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** connection string to the PostgreSQL server of this run (see tests/support/global-setup.ts) */
    databaseUrl: string;
  }
}
