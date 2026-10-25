import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, startBuiltApp, startTestDatabase } from '@wine-match/testkit';
import type { TestProject } from 'vitest/node';
import { NEW_RESTAURANT } from './new-restaurant';

const appDir = fileURLToPath(new URL('../..', import.meta.url));
const rootDir = fileURLToPath(new URL('../../../..', import.meta.url));

/** Runs an npm script of the db package against the e2e database (migrations, demo data, operator commands). */
function dbScript(script: string, databaseUrl: string, args: string[] = [], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('npm', ['run', script, '-w', '@wine-match/db', ...(args.length ? ['--', ...args] : [])], { cwd: rootDir, env: { ...process.env, ...env, DATABASE_URL: databaseUrl }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`npm run ${script} failed:\n${stdout}${stderr}`));
      else resolve();
    });
  });
}

/**
 * Starts the whole stack once for the e2e files: a PostgreSQL server, a fresh database with the real
 * migrations and the demo restaurant, and the built app pointed at it.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  if (!existsSync(`${appDir}/.next/BUILD_ID`)) {
    throw new Error('The e2e suite runs the BUILT app: run `npm run build` first.');
  }
  const server = await startTestDatabase();
  const databaseUrl = await createDatabase(server.url, 'winematch_e2e');
  await dbScript('migration:up', databaseUrl);
  await dbScript('seed', databaseUrl);
  // a second restaurant with its own owner, made by the real operator command (spec E05-S01, AC2)
  await dbScript('restaurant:create', databaseUrl, [
    '--name', NEW_RESTAURANT.name, '--slug', NEW_RESTAURANT.slug, '--address', NEW_RESTAURANT.address, '--city', NEW_RESTAURANT.city,
    '--wine-director', NEW_RESTAURANT.wineDirector, '--owner-email', NEW_RESTAURANT.ownerEmail, '--owner-name', NEW_RESTAURANT.ownerName
  ], { USER_PASSWORD: NEW_RESTAURANT.password });

  const app = await startBuiltApp({
    cwd: appDir,
    readyPath: '/api/v1/public/restaurants/halka/menu',
    logFile: `${appDir}/test-results/e2e-app.log`,
    env: { NODE_ENV: 'production', DATA_SOURCE: 'postgres', DATABASE_URL: databaseUrl, AUTH_COOKIE_SECURE: 'false', LOG_LEVEL: 'info' }
  });
  project.provide('e2e', { baseUrl: app.url, appLogs: '', databaseUrl });

  return async () => {
    await app.stop();
    await server.stop();
  };
}
