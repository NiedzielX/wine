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

const blank = (value: string | undefined) => value === undefined || value.trim() === '';

/**
 * Protected = anything that is not clearly a developer's machine: NODE_ENV set to a value other than `development` or `test`
 * (`production`, `Production`, `prod`, `staging`, a typo...). Fail closed: an unknown name is treated like production.
 */
export function isProtectedEnvironment(environment: Environment): boolean {
  const name = environment.NODE_ENV;
  return !blank(name) && !['development', 'test'].includes(name!.trim());
}

/**
 * Production is not where the Halka demo goes: its accounts have a PUBLIC password (core/src/demo/users.ts). The seeder
 * writes only when this passes, and it runs BEFORE the first write, so a refusal leaves the database as it was.
 *  - in a protected environment (see above) it needs ALLOW_DEMO_DATA=true (a trial instance on purpose), exactly as the
 *    application demands for DATA_SOURCE=memory;
 *  - and even then not when the database already holds a restaurant that is not the demo one: that is a real installation
 *    (decided 2026-11-05: this second rule applies to the same protected environments only, so that locally
 *    `restaurant:create` followed by `db:seed` keeps working).
 * With NODE_ENV unset the seeder cannot tell where it runs: it is allowed (development, the spec's behaviour) and says so.
 */
export async function assertSeedAllowed(em: EntityManager, demoSlug: string, environment: Environment = process.env, warn: (message: string) => void = (m) => { process.stderr.write(`${m}\n`); }): Promise<void> {
  if (blank(environment.NODE_ENV)) {
    warn('Warning: NODE_ENV is not set, so the demo seeder cannot tell whether this is production. It runs as in development. On a real installation set NODE_ENV=production: the seeder then refuses.');
    return;
  }
  if (!isProtectedEnvironment(environment)) return;
  if (environment.ALLOW_DEMO_DATA?.trim() !== 'true') {
    throw new SeedRefusedError(`Refusing to load the demo restaurant with NODE_ENV=${environment.NODE_ENV!.trim()}: it creates accounts with a PUBLIC password. Nothing was written. Set ALLOW_DEMO_DATA=true only on a trial instance.`);
  }
  if (await em.count(RestaurantEntity, { slug: { $ne: demoSlug } })) {
    throw new SeedRefusedError('Refusing to load the demo restaurant: this database already holds a restaurant that is not the demo one, so it is a real installation. Nothing was written.');
  }
}
