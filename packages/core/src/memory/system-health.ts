import type { DatabaseHealth, SystemHealth } from '../ports/runtime';

/** The in-memory data source has no database to ask. */
export class MemorySystemHealth implements SystemHealth {
  async database(): Promise<DatabaseHealth> {
    return 'skipped';
  }
}
