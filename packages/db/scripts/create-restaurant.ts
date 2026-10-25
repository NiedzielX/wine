/**
 * Creates a restaurant and its first owner (account with the `owner` role) in one transaction.
 *
 *   USER_PASSWORD='a long passphrase' npm run restaurant:create -- \
 *     --name "Bistro Nad Wisłą" --slug bistro-nad-wisla --address "ul. Wiślna 1" --city Kraków \
 *     --wine-director "Anna Nowak" --owner-email anna@example.com --owner-name "Anna Nowak"
 *
 * Needs DATABASE_URL and an already migrated database (npm run db:migrate); loads no demo data.
 * The password is read from USER_PASSWORD only (never from the command line). Add
 * --allow-existing-account to give an existing account the owner role instead of creating one.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MikroORM } from '@mikro-orm/postgresql';
import { run } from './restaurant-bootstrap';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

run(process.argv.slice(2), process.env, {
  // The CLI configuration carries the Migrator; the runtime configuration does not.
  openOrm: async () => MikroORM.init((await import('../src/mikro-orm.config')).default)
}).then(
  (code) => { process.exitCode = code; },
  (e) => { console.error(`Error: ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
);
