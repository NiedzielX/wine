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
