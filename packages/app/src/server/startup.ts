import { env } from './env';
import { logger } from './logger';

/**
 * The checks done once when the server starts (see ../instrumentation.ts). A wrong configuration is
 * reported with every problem named and the process EXITS (code 1): a half-configured server that
 * answers 500 to everything is harder for a supervisor to notice than one that stops.
 */
export function checkStartup(): void {
  try {
    const e = env();
    logger.info('server starting', { dataSource: e.dataSource, production: e.isProduction, secureCookies: e.secureCookies, publicBaseUrl: e.publicBaseUrl });
    if (e.isProduction && e.publicBaseUrlIsDefault) logger.warn('PUBLIC_BASE_URL is not set: QR codes point to localhost. Set it before printing any code.');
  } catch (error) {
    logger.error('invalid configuration: the server will not start', { err: error });
    process.exit(1);
  }
}
