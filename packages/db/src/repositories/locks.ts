import type { EntityManager } from '@mikro-orm/postgresql';

/**
 * The advisory lock of a restaurant's catalog (spec 2026-11-16-catalog-field-editing, W3, N1). Taken FIRST in every
 * transaction that writes dish or wine fields or decides their uniqueness (`PgCatalogWriteRepository` and
 * `PgImportRepository.confirm` of a catalog import, which takes it after the job row), then the rows: one fixed order,
 * so no lock cycle. The prefix differs from `sales_record:`. `em.execute`, not `getConnection().execute`, so it runs in
 * the transaction (lesson pg-execute-inside-transaction).
 */
export async function lockCatalog(em: EntityManager, restaurantId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('catalog:' || ?::text))`, [restaurantId]);
}

/**
 * The advisory lock of a restaurant's launch day log (spec 2026-11-18-owner-proof-report, R5): the check of the current
 * entry and the insert of the next one happen under it, so two writers cannot both pass the check. The prefix differs
 * from `catalog:` and `sales_record:`.
 */
export async function lockProofLaunch(em: EntityManager, restaurantId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('proof_launch:' || ?::text))`, [restaurantId]);
}
