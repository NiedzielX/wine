import { ShowcaseReadOnlyError, ValidationError, authorize, parseWith, type Actor, type Permission, type Principal, type RateLimitRuleName } from '@wine-match/core';
import type { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from './api';
import { SESSION_COOKIE, toActor } from './auth';
import { createRequestScope, type Cradle } from './container';
import { domainError } from './domain-errors';
import { env } from './env';
import { logger } from './logger';
import { countUnhandledError, recordHttpRequest } from './metrics';
import { checkRateLimit, tooManyRequests } from './rate-limit';

/**
 * Door of the REST API for the dashboard: session cookie → principal, CSRF for changes, permission
 * check, domain errors → HTTP status. Every write route goes through `handle()`; there is no other way in.
 */

/** Browsers tell us when a request comes from another site; refuse those, and a foreign Origin. */
function isCrossSite(req: NextRequest): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers.get('host') ?? req.nextUrl.host);
  } catch {
    return true;
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function fromDomainError(e: unknown): NextResponse | null {
  const d = domainError(e);
  if (!d) return null;
  switch (d.name) {
    case 'InvalidCredentialsError': return apiError(401, d.code, d.message);
    case 'NoPanelAccessError':
    case 'ShowcaseReadOnlyError':
    case 'TeamHierarchyError':
    case 'ForbiddenError': return apiError(403, d.code, d.message);
    case 'InvalidTokenError':
    case 'NotFoundError': return apiError(404, d.code, d.message);
    case 'VersionConflictError':
    case 'LastOwnerError':
    case 'AlreadyMemberError':
    case 'InvariantError': return apiError(409, d.code, d.message);
    case 'SelfChangeError':
    case 'ValidationError':
    case 'TableNeedsTwoDishesError': return apiError(422, d.code, d.message, d.fields);
    default: return apiError(400, d.code, d.message);
  }
}

export interface ApiContext {
  principal: Principal;
  actor: Actor;
  c: Cradle;
  req: NextRequest;
}

type Scope = Awaited<ReturnType<typeof createRequestScope>>;

/**
 * Turns whatever a route does into a response and is the ONLY place that maps a failure: a domain error becomes its
 * HTTP status and the standard error body, anything else is answered with a generic 500 (never a stack trace). Every
 * response path, including the early 401/403 and a failure to open the request scope (database down), leaves exactly
 * ONE `api request` log line (`error` level with the redacted `err` on an unexpected failure, so there is no second
 * line) and ONE `http_requests_total` sample. The route PATTERN is logged, never the URL, query, headers, body or IP.
 */
async function instrumented(req: NextRequest, route: string, run: () => Promise<NextResponse>): Promise<NextResponse> {
  const started = performance.now();
  let res: NextResponse;
  let failure: unknown;
  try {
    res = await run();
  } catch (e) {
    const mapped = fromDomainError(e);
    if (mapped) {
      res = mapped;
    } else {
      failure = e;
      countUnhandledError('route');
      res = apiError(500, 'unexpected', 'The request could not be processed.');
    }
  }
  const seconds = (performance.now() - started) / 1000;
  const line = { method: req.method, route, status: res.status, durationMs: Math.round(seconds * 1000) };
  if (failure === undefined) logger.info('api request', line);
  else logger.error('api request', { ...line, err: failure });
  recordHttpRequest(route, res.status, seconds);
  return res;
}

async function withScope(work: (scope: Scope) => Promise<NextResponse>): Promise<NextResponse> {
  const scope = await createRequestScope();
  try {
    return await work(scope);
  } finally {
    await scope.dispose();
  }
}

/**
 * For routes that need no session (the guest API, sign-in). `route` is the route's PATTERN (`/api/v1/pairings/{id}`), used for the
 * request log line and the metrics label: pass a literal, never the URL. `write: true` still refuses cross-site requests.
 * `rateLimit` names the request limit of this route class (spec E21 F3, R9): every request counts, before the body is read and
 * whatever the outcome; over the limit the answer is 429 with `Retry-After` and the handler does not run.
 */
export async function handlePublic(req: NextRequest, opts: { write?: boolean; route: string; rateLimit: RateLimitRuleName }, handler: (ctx: { c: Cradle; req: NextRequest }) => Promise<NextResponse>): Promise<NextResponse> {
  return instrumented(req, opts.route, async () => {
    if (opts.write && isCrossSite(req)) return apiError(403, 'csrf', 'Cross-site requests are not allowed.');
    return withScope(async (scope) => {
      const decision = await checkRateLimit(scope.cradle, opts.rateLimit, req.headers);
      if (!decision.allowed) return tooManyRequests(decision);
      return handler({ c: scope.cradle, req });
    });
  });
}

/**
 * For the one route that must not need a request scope: the health check. Opening a scope builds the container and with it
 * the database pool, and a failure there is exactly what the check has to report as 503 instead of a generic 500. Same log
 * line and metrics sample as every other API request; the handler must not throw (a failure it cannot answer is a 500).
 */
export async function handleUnscoped(req: NextRequest, opts: { route: string }, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  return instrumented(req, opts.route, handler);
}

/**
 * For routes of the dashboard: a signed-in caller.
 *  - 401 without a valid session
 *  - changes (`write`): 403 for cross-site requests and for a missing or wrong `X-CSRF-Token`
 *  - 403 when the caller's role in `slug` lacks `permission` (a failed check always means "no")
 */
export async function handle(req: NextRequest, opts: { write: boolean; route: string; slug?: string; permission?: Permission }, handler: (ctx: ApiContext) => Promise<NextResponse>): Promise<NextResponse> {
  return instrumented(req, opts.route, async () => {
    // the public demo is read-only (E22 R9): every dashboard write is refused before anything else, so this holds even if an account existed
    if (opts.write && env().showcaseMode === 'demo') throw new ShowcaseReadOnlyError();
    if (opts.write && isCrossSite(req)) return apiError(403, 'csrf', 'Cross-site requests are not allowed.');
    return withScope((scope) => authenticated(scope));
  });
  async function authenticated(scope: Scope): Promise<NextResponse> {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const principal = token ? await scope.cradle.authService.authenticate(token) : null;
    if (!principal) return apiError(401, 'unauthenticated', 'Sign in first.');
    if (opts.write && !sameToken(req.headers.get('x-csrf-token') ?? '', principal.session.csrfToken)) {
      return apiError(403, 'csrf', 'The X-CSRF-Token header is missing or wrong. Read it from GET /api/v1/auth/me.');
    }
    if (opts.slug && opts.permission) authorize(principal, opts.slug, opts.permission);
    return handler({ principal, actor: toActor(principal), c: scope.cradle, req });
  }
}

export { isCrossSite };

/** `If-Match: "3"` or `3` → 3; undefined when absent; null when malformed. */
export function ifMatch(req: NextRequest): number | undefined | null {
  const raw = req.headers.get('if-match');
  if (raw === null) return undefined;
  const n = Number(raw.replace(/^W\//, '').replace(/"/g, '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The largest JSON body any route accepts. A row-edit batch of 2000 rows is well below this. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * The request body parsed through a schema: the only way a body reaches a service. Invalid JSON, a body
 * that is too large and any schema failure all end as a ValidationError (422 with `fields`). With
 * `optional`, an empty body is read as `{}`.
 */
export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S, opts: { optional?: boolean } = {}): Promise<z.output<S>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ValidationError('payload_too_large', 'The request body is too large.');
  if (text.trim() === '') {
    if (opts.optional) return parseWith(schema, {});
    throw new ValidationError('validation_failed', 'The request needs a JSON body.', { body: 'required' });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ValidationError('invalid_json', 'The request body must be valid JSON.');
  }
  return parseWith(schema, json);
}

/** The `file` of a multipart upload. Anything else is a ValidationError; the type and content are checked by the import itself. */
export async function readUpload(req: NextRequest, maxBytes: number): Promise<{ name: string; bytes: Uint8Array }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ValidationError('validation_failed', 'Send multipart/form-data with a "file" field.', { file: 'required' });
  }
  const file = form.get('file');
  if (!(file instanceof File) || !file.name) throw new ValidationError('validation_failed', 'Send multipart/form-data with a "file" field.', { file: 'required' });
  if (file.size > maxBytes) throw new ValidationError('file_too_large', `The file is larger than ${maxBytes / 1024 / 1024} MB.`, { file: 'too_large' });
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export const pairingJson = (p: { id: string; dishId: string; wineId: string; status: string; role: string | null; rank: number | null; comment: string | null; modelScore: number; source: string; dirty: boolean; version?: number; updatedBy: string; updatedAt: string }) => ({
  id: p.id, dishId: p.dishId, wineId: p.wineId, status: p.status, role: p.role, rank: p.rank, comment: p.comment, modelScore: p.modelScore,
  source: p.source, dirty: p.dirty, version: p.version ?? null, updatedBy: p.updatedBy, updatedAt: p.updatedAt
});

/** The JSON shape of a team member in the API (spec E12 R3). Never a password hash, a PIN or a token. */
export const teamMemberJson = (m: import('@wine-match/core').TeamMember) => ({
  membershipId: m.membershipId, userId: m.userId, name: m.name, email: m.email, role: m.role, status: m.status, version: m.version,
  lastLoginAt: m.lastLoginAt, createdAt: m.createdAt, deactivatedAt: m.deactivatedAt, deactivatedBy: m.deactivatedBy
});

/** The JSON shape of an import job in the API (the file itself is never stored or returned). */
export function importJson(job: import('@wine-match/core').ImportJob) {
  const errors = job.rows.filter((r) => r.issues.some((i) => i.level === 'error')).length;
  return {
    id: job.id, kind: job.kind, status: job.status, fileName: job.fileName, fileType: job.fileType, fileSize: job.fileSize, parser: job.parser,
    notes: job.notes, createdBy: job.createdBy, createdAt: job.createdAt, confirmedAt: job.confirmedAt, result: job.result,
    summary: { total: job.rows.length, included: job.rows.filter((r) => r.include).length, withErrors: errors, updates: job.rows.filter((r) => r.action === 'update').length },
    rows: job.rows.map((r) => ({ rowNumber: r.rowNumber, fields: r.fields, include: r.include, action: r.action, issues: r.issues }))
  };
}
