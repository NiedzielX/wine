import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDatabase, startBuiltApp, startTestDatabase } from '@wine-match/testkit';
import type { TestProject } from 'vitest/node';

const appDir = fileURLToPath(new URL('../..', import.meta.url));
const rootDir = fileURLToPath(new URL('../../../..', import.meta.url));

/** Runs an npm script of the db package against the e2e database (migrations, demo data). */
function dbScript(script: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('npm', ['run', script, '-w', '@wine-match/db'], { cwd: rootDir, env: { ...process.env, DATABASE_URL: databaseUrl }, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
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
