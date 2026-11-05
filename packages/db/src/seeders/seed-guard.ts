import type { EntityManager } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../entities';

/** The demo seeder refused to write (spec 2026-10-15-production-deployment, R5). Nothing was written. */
export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefusedError';
  }
}

type Environment = Record<string, string | undefined>;

/** A blank value counts as "not set", like in the application's own configuration (core/src/config/env.ts). */
const setTo = (environment: Environment, key: string, value: string) => environment[key]?.trim() === value;

/**
 * Production is not where the Halka demo goes: its accounts have a PUBLIC password (core/src/demo/users.ts). The seeder
 * writes only when this passes, and it runs BEFORE the first write, so a refusal leaves the database as it was.
 *  - NODE_ENV=production needs ALLOW_DEMO_DATA=true (a trial instance on purpose), exactly as the application demands for
 *    DATA_SOURCE=memory;
 *  - and even then not when the database already holds a restaurant that is not the demo one: that is a real installation.
 * Outside production the seeder is unrestricted (development, tests, the e2e suite).
 */
export async function assertSeedAllowed(em: EntityManager, demoSlug: string, environment: Environment = process.env): Promise<void> {
  if (!setTo(environment, 'NODE_ENV', 'production')) return;
  if (!setTo(environment, 'ALLOW_DEMO_DATA', 'true')) {
    throw new SeedRefusedError('Refusing to load the demo restaurant with NODE_ENV=production: it creates accounts with a PUBLIC password. Nothing was written. Set ALLOW_DEMO_DATA=true only on a trial instance.');
  }
  if (await em.count(RestaurantEntity, { slug: { $ne: demoSlug } })) {
    throw new SeedRefusedError('Refusing to load the demo restaurant: this database already holds a restaurant that is not the demo one, so it is a real installation. Nothing was written.');
  }
}
