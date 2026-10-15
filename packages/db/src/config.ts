import { defineConfig, type Options } from '@mikro-orm/postgresql';
import { ENTITIES } from './entities';

const int = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * Runtime ORM configuration (used by the app and tests). Migrations and seeding are configured
 * on top of this in mikro-orm.config.ts, so the web bundle never pulls the migrator in.
 */
export function ormConfig(overrides: Partial<Options> = {}): Options {
  return defineConfig({
    entities: ENTITIES,
    clientUrl: process.env.DATABASE_URL,
    pool: { min: int(process.env.DB_POOL_MIN, 2), max: int(process.env.DB_POOL_MAX, 10) },
    debug: process.env.DB_DEBUG === 'true',
    // Entities are defined with defineEntity: no reflection or decorators needed.
    discovery: { warnWhenNoEntities: true },
    ...overrides
  });
}
