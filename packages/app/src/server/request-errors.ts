import { countUnhandledError, type UnhandledSource } from './metrics';
import { logger } from './logger';

/**
 * Error hooks for `instrumentation.ts` (spec E21 F1, R3). They log through `logger` (secrets redacted) and count; they
 * never make a network call. The `request` Next.js hands to `onRequestError` carries the full path with the query
 * string (`sid`, diet and allergen parameters) and all headers (cookies): only the method, the path WITHOUT its query
 * and the route pattern are logged.
 */

export interface RequestErrorInfo {
  path: string;
  method: string;
  headers?: unknown;
}
export interface RequestErrorContext {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
}

const SOURCES: ReadonlySet<string> = new Set(['render', 'route', 'action', 'proxy']);

export function reportRequestError(error: unknown, request: RequestErrorInfo, context: RequestErrorContext): void {
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest: unknown }).digest) : undefined;
  const source: UnhandledSource = context.routeType && SOURCES.has(context.routeType) ? (context.routeType as UnhandledSource) : 'unknown';
  countUnhandledError(source);
  logger.error('request error', {
    err: error, digest, method: request.method, path: request.path.split('?')[0], route: context.routePath, routeType: context.routeType
  });
}

export function reportProcessError(source: 'unhandledRejection' | 'uncaughtException', error: unknown): void {
  countUnhandledError(source);
  logger.error(source, { err: error });
}

const g = globalThis as unknown as { __wineMatchProcessHandlers?: boolean };

/**
 * Registers the process-level handlers once. Like Next.js' own `uncaughtException` handler they only log and count: they
 * do not exit, so the process behaves as before for exceptions. NOTE: after an `uncaughtException` the state of the
 * process is undefined; the runbook (docs/OPERATIONS.md) restarts replicas after such an alert. NOTE 2: a listener for
 * `unhandledRejection` replaces Node's default of crashing on an unhandled rejection with log-and-continue (intended:
 * a guest page must not go down for a stray rejection; the counter and the alert make it visible).
 */
export function registerProcessHandlers(): void {
  if (g.__wineMatchProcessHandlers) return;
  g.__wineMatchProcessHandlers = true;
  process.on('unhandledRejection', (reason) => reportProcessError('unhandledRejection', reason));
  process.on('uncaughtException', (error) => reportProcessError('uncaughtException', error));
}
