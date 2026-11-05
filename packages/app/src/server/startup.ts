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
    if (e.isProduction) {
      // production only passes parseEnv with a public https address, unless the operator opted out on purpose (R4); say so on every start
      if (e.allowLocalBaseUrl) logger.warn('ALLOW_LOCAL_BASE_URL=true: the public address is not checked. Never print a QR code from this installation.', { publicBaseUrl: e.publicBaseUrl });
      if (e.publicBaseUrlIsDefault) logger.warn('PUBLIC_BASE_URL is not set: QR codes point to localhost. Set it before printing any code.');
      if (!e.secureCookies) logger.warn('AUTH_COOKIE_SECURE=false: the session cookie has no Secure flag. Only for a local run or a test.');
    }
  } catch (error) {
    logger.error('invalid configuration: the server will not start', { err: error });
    process.exit(1);
  }
}
