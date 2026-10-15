import { ValidationError, authorize, parseWith, type Actor, type Permission, type Principal } from '@wine-match/core';
import type { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError } from './api';
import { SESSION_COOKIE, toActor } from './auth';
import { createRequestScope, type Cradle } from './container';
import { domainError } from './domain-errors';
import { logger } from './logger';

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
    case 'ForbiddenError': return apiError(403, d.code, d.message);
    case 'NotFoundError': return apiError(404, d.code, d.message);
    case 'VersionConflictError':
    case 'InvariantError': return apiError(409, d.code, d.message);
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
 * Runs a route's work inside a request scope and is the ONLY place that turns a failure into a response:
 * a domain error becomes its HTTP status and the standard error body, anything else is logged (with the
 * secrets redacted) and answered with a generic 500: never a stack trace. No route writes its own try/catch.
 */
async function guarded(req: NextRequest, work: (scope: Scope) => Promise<NextResponse>): Promise<NextResponse> {
  const scope = await createRequestScope();
  try {
    return await work(scope);
  } catch (e) {
    const mapped = fromDomainError(e);
    if (mapped) return mapped;
    logger.error('api request failed', { err: e, method: req.method, path: req.nextUrl.pathname });
    return apiError(500, 'unexpected', 'The request could not be processed.');
  } finally {
    await scope.dispose();
  }
}

/**
 * For routes that need no session (the guest API, sign-in). `write: true` still refuses cross-site requests.
 */
export async function handlePublic(req: NextRequest, opts: { write?: boolean }, handler: (ctx: { c: Cradle; req: NextRequest }) => Promise<NextResponse>): Promise<NextResponse> {
  if (opts.write && isCrossSite(req)) return apiError(403, 'csrf', 'Cross-site requests are not allowed.');
  return guarded(req, (scope) => handler({ c: scope.cradle, req }));
}

/**
 * For routes of the dashboard: a signed-in caller.
 *  - 401 without a valid session
 *  - changes (`write`): 403 for cross-site requests and for a missing or wrong `X-CSRF-Token`
 *  - 403 when the caller's role in `slug` lacks `permission` (a failed check always means "no")
 */
export async function handle(req: NextRequest, opts: { write: boolean; slug?: string; permission?: Permission }, handler: (ctx: ApiContext) => Promise<NextResponse>): Promise<NextResponse> {
  if (opts.write && isCrossSite(req)) return apiError(403, 'csrf', 'Cross-site requests are not allowed.');
  return guarded(req, async (scope) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const principal = token ? await scope.cradle.authService.authenticate(token) : null;
    if (!principal) return apiError(401, 'unauthenticated', 'Sign in first.');
    if (opts.write && !sameToken(req.headers.get('x-csrf-token') ?? '', principal.session.csrfToken)) {
      return apiError(403, 'csrf', 'The X-CSRF-Token header is missing or wrong. Read it from GET /api/v1/auth/me.');
    }
    if (opts.slug && opts.permission) authorize(principal, opts.slug, opts.permission);
    return handler({ principal, actor: toActor(principal), c: scope.cradle, req });
  });
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
