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
      // request limits (spec E21 F3): both settings are optional, but without them the limits are coarser; say so on every start
      if (e.trustedProxyHops === 0) logger.warn('TRUSTED_PROXY_HOPS=0: X-Forwarded-For is not read, so every client shares ONE request-limit counter (half limits). Behind the reverse proxy set TRUSTED_PROXY_HOPS=1 (docs/DEPLOYMENT.md, section 6).');
      if (!e.rateLimitSecret) logger.warn('RATE_LIMIT_SECRET is not set: request-limit counters use a random key of this process (they restart with it, and several instances do not count together).');
    }
  } catch (error) {
    logger.error('invalid configuration: the server will not start', { err: error });
    process.exit(1);
  }
}
