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
export { PgSystemHealth, HEALTH_TIMEOUT_MS } from './repositories/system-health';
export { PgRateLimiter, RATE_LIMIT_ROW_TTL_MS } from './repositories/rate-limiter';
export { PgAuthRepository } from './repositories/auth';
export { PgImportRepository } from './repositories/import';
export { PgAuthAuditRepository, PgTeamRepository } from './repositories/team';
export { PgInvitationRepository } from './repositories/invitations';
export { SeedRefusedError, assertInviteCommandAllowed } from './seeders/seed-guard';

import type { EntityManager, MikroORM } from '@mikro-orm/postgresql';
/** What @wine-match/db adds to the DI container when DATA_SOURCE=postgres. */
export interface DbCradle {
  orm: MikroORM;
  /** request-scoped fork of the identity map */
  em: EntityManager;
}
