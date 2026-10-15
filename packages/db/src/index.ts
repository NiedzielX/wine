/**
 * @wine-match/db — PostgreSQL data layer.
 * Exports entities (for this package and migrations), the ORM factory and repositories that
 * implement @wine-match/core ports. Application code depends on the ports, not on entities.
 */
export * from './entities';
export { ormConfig } from './config';
export { getOrm, closeOrm } from './orm';
export * from './mappers';
export * from './repositories';
export { PgAuthRepository } from './repositories/auth';
export { PgImportRepository } from './repositories/import';

import type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
/** What @wine-match/db adds to the DI container when DATA_SOURCE=postgres. */
export interface DbCradle {
  orm: MikroORM;
  /** request-scoped fork of the identity map */
  em: EntityManager;
}
