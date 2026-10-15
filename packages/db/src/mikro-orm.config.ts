import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ormConfig } from './config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// One .env for the whole monorepo (repo root). Variables already set in the environment win.
if (existsSync(here('../../../.env'))) process.loadEnvFile(here('../../../.env'));

/** CLI configuration: `npm run migration:create | migration:up | seed` in packages/db. */
export default ormConfig({
  extensions: [Migrator, SeedManager],
  migrations: {
    path: here('./migrations'),
    pathTs: here('./migrations'),
    emit: 'ts',
    transactional: true,
    allOrNothing: true
  },
  seeder: {
    path: here('./seeders'),
    pathTs: here('./seeders'),
    defaultSeeder: 'DemoSeeder',
    emit: 'ts'
  }
});
