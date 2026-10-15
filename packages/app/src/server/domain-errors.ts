/**
 * Recognises domain errors by their `name` and `code`, never by `instanceof`.
 *
 * Next.js bundles @wine-match/core separately for pages, server actions and route handlers, while the
 * DI container (and the services inside it) is created once and shared. An error thrown by a service
 * is then an instance of a *different copy* of the class than the one the route handler imports, so
 * `instanceof` silently fails and the request ends as a 500. See lesson `nextjs-duplicate-module-instanceof`.
 */
const NAMES = new Set([
  'DomainError', 'NotFoundError', 'ValidationError', 'VersionConflictError', 'InvariantError', 'ForbiddenError',
  'InvalidCredentialsError', 'NoPanelAccessError', 'TableNeedsTwoDishesError'
]);

export interface DomainErrorInfo {
  name: string;
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export function domainError(e: unknown): DomainErrorInfo | null {
  if (!(e instanceof Error)) return null;
  const { code, fields } = e as Error & { code?: unknown; fields?: unknown };
  if (typeof code !== 'string' || !NAMES.has(e.name)) return null;
  return { name: e.name, code, message: e.message, fields: fields as Record<string, string> | undefined };
}

export const isDomainError = (e: unknown, code?: string): boolean => {
  const d = domainError(e);
  return !!d && (code === undefined || d.code === code);
};
