import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DomainError, InvalidCredentialsError, NoPanelAccessError, NotFoundError, ValidationError, VersionConflictError, InvariantError, ForbiddenError, buildDemoDataset } from '@wine-match/core';
import { TableNeedsTwoDishesError } from '@wine-match/core';
import { apiError, PUBLIC_CACHE, publicWine } from '@/server/api';
import { fromDomainError, handle, handlePublic, ifMatch, importJson, pairingJson, parseBody, readUpload, isCrossSite } from '@/server/api-auth';
import { domainError, isDomainError } from '@/server/domain-errors';
import { env } from '@/server/env';
import { logger } from '@/server/logger';
import { checkStartup } from '@/server/startup';
import { clampSize, guestUrl, qrPng, qrSvg, QR_SIZES } from '@/server/qr';
import { dataSource, createRequestScope, getContainer } from '@/server/container';
import { getRequestScope } from '@/server/request-scope';
import { guestContext, hrefWith } from '@/server/guest-page';
import { SESSION_COOKIE, safeNext, secureCookies, sessionCookieOptions, toActor, authorizeAction, requireAccess, getPrincipal } from '@/server/auth';
import { proxy, config as proxyConfig } from '@/proxy';
import { register } from '@/instrumentation';
import { loginAs, req, jsonReq } from './helpers';

const DEMO = buildDemoDataset({ ids: 'uuid' });

describe('errors: recognised by name and code, never by class', () => {
  it('a domain error carries its name and code; anything else is not one', () => {
    expect(domainError(new NotFoundError('Dish'))).toMatchObject({ name: 'NotFoundError', code: 'not_found' });
    expect(domainError(new ValidationError('x', 'bad', { a: 'b' }))).toMatchObject({ fields: { a: 'b' } });
    expect(domainError(new Error('plain'))).toBeNull();
    expect(domainError('nope')).toBeNull();
    expect(domainError(Object.assign(new Error('x'), { name: 'NotFoundError' }))).toBeNull();   // no code
    expect(domainError(Object.assign(new Error('x'), { name: 'SomethingElse', code: 'c' }))).toBeNull();
    expect(isDomainError(new NotFoundError('x'), 'not_found')).toBe(true);
    expect(isDomainError(new NotFoundError('x'), 'other')).toBe(false);
    expect(isDomainError(new NotFoundError('x'))).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
  });

  it('the API maps each domain error to its status; an unknown kind is a 400', async () => {
    const status = (e: unknown) => fromDomainError(e)!.status;
    expect(status(new InvalidCredentialsError())).toBe(401);
    expect(status(new NoPanelAccessError())).toBe(403);
    expect(status(new ForbiddenError())).toBe(403);
    expect(status(new NotFoundError('x'))).toBe(404);
    expect(status(new VersionConflictError())).toBe(409);
    expect(status(new InvariantError('c', 'm'))).toBe(409);
    expect(status(new ValidationError('c', 'm'))).toBe(422);
    expect(status(new TableNeedsTwoDishesError())).toBe(422);
    expect(status(new DomainError('c', 'm'))).toBe(400);
    expect(fromDomainError(new Error('plain'))).toBeNull();
    const body = await fromDomainError(new ValidationError('validation_failed', 'bad', { a: 'x' }))!.json();
    expect(body).toEqual({ error: { code: 'validation_failed', message: 'bad', fields: { a: 'x' } } });
  });

  it('the envelope helpers: an error body, the public cache policy, and a wine without a list number', () => {
    expect(apiError(418, 'teapot', 'no', { f: 'x' }).status).toBe(418);
    expect(PUBLIC_CACHE['Cache-Control']).toMatch(/s-maxage/);
    const wine = DEMO.wines[0];
    expect(publicWine({ ...wine, listNumber: undefined })).toMatchObject({ listNumber: null });
    expect(publicWine(wine)).toMatchObject({ glassPourMl: wine.glassPour });
  });
});

describe('the request guard: sessions, CSRF, cross-site, permissions, bodies', () => {
  beforeEach(() => { globalThis.__wmNext.cookies.clear(); });

  it('a cross-site request is refused, by the browser header or by a foreign origin', () => {
    expect(isCrossSite(req('http://localhost:3000/x', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSite(req('http://localhost:3000/x', { origin: 'https://evil.example', host: 'localhost:3000' }))).toBe(true);
    expect(isCrossSite(req('http://localhost:3000/x', { origin: 'not a url', host: 'localhost:3000' }))).toBe(true);
    expect(isCrossSite(req('http://localhost:3000/x', { origin: 'http://localhost:3000' }))).toBe(false);
    expect(isCrossSite(req('http://localhost:3000/x', {}))).toBe(false);
  });

  it('a public route answers a cross-site write with 403 and runs a read normally; a thrown error becomes its status or a generic 500', async () => {
    const blocked = await handlePublic(req('http://localhost/x', { 'sec-fetch-site': 'cross-site' }), { write: true }, async () => new Response('never') as never);
    expect(blocked.status).toBe(403);
    const ok = await handlePublic(req('http://localhost/x'), {}, async () => apiError(200, 'ok', 'fine'));
    expect(ok.status).toBe(200);
    const mapped = await handlePublic(req('http://localhost/x'), {}, async () => { throw new NotFoundError('Dish'); });
    expect(mapped.status).toBe(404);
    const boom = await handlePublic(req('http://localhost/x'), {}, async () => { throw new Error('secret=abc database down'); });
    expect(boom.status).toBe(500);
    const text = await boom.text();
    expect(text).not.toContain('secret');
  });

  it('a protected route: no session is 401; a wrong CSRF token is 403; a missing role is 403; a good request runs', async () => {
    const anon = await handle(req('http://localhost/x'), { write: false }, async () => apiError(200, 'ok', 'x'));
    expect(anon.status).toBe(401);
    const session = await loginAs('marta@halka.pl');
    const wrongCsrf = await handle(jsonReq('http://localhost/x', {}, 'POST', { cookie: session.cookie, 'x-csrf-token': 'nope' }), { write: true }, async () => apiError(200, 'ok', 'x'));
    expect(wrongCsrf.status).toBe(403);
    const noRole = await handle(req('http://localhost/x', { cookie: session.cookie }), { write: false, slug: 'halka', permission: 'pairings.decide' }, async () => apiError(200, 'ok', 'x'));
    expect(noRole.status).toBe(200);
    const gm = await loginAs('tomasz@halka.pl');
    const forbidden = await handle(req('http://localhost/x', { cookie: gm.cookie }), { write: false, slug: 'halka', permission: 'pairings.decide' }, async () => apiError(200, 'ok', 'x'));
    expect(forbidden.status).toBe(403);
    const good = await handle(jsonReq('http://localhost/x', {}, 'POST', { cookie: session.cookie, 'x-csrf-token': session.csrf }), { write: true, slug: 'halka', permission: 'pairings.decide' }, async ({ actor, principal }) => apiError(200, 'ok', `${actor.name}|${principal.user.email}`));
    expect(good.status).toBe(200);
    expect(await good.text()).toContain('Marta Wierzbicka|marta@halka.pl');
    const cross = await handle(req('http://localhost/x', { cookie: session.cookie, 'sec-fetch-site': 'cross-site' }), { write: true }, async () => apiError(200, 'ok', 'x'));
    expect(cross.status).toBe(403);
  });

  it('reads the If-Match version: absent, a quoted or weak number, a malformed one', () => {
    expect(ifMatch(req('http://x'))).toBeUndefined();
    expect(ifMatch(req('http://x', { 'if-match': '"3"' }))).toBe(3);
    expect(ifMatch(req('http://x', { 'if-match': 'W/"4"' }))).toBe(4);
    expect(ifMatch(req('http://x', { 'if-match': '0' }))).toBeNull();
    expect(ifMatch(req('http://x', { 'if-match': 'banana' }))).toBeNull();
  });

  it('a body is parsed through a schema: an empty body, a missing body, invalid JSON, a body that is too large, a valid one', async () => {
    const { z } = await import('zod');
    const schema = z.strictObject({ n: z.number() });
    await expect(parseBody(req('http://x', {}, 'POST'), schema)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(parseBody(new NextRequest('http://x', { method: 'POST', body: '   ' }), schema, { optional: true })).rejects.toBeInstanceOf(ValidationError);
    await expect(parseBody(new NextRequest('http://x', { method: 'POST', body: '{nope' }), schema)).rejects.toMatchObject({ code: 'invalid_json' });
    await expect(parseBody(new NextRequest('http://x', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) }), schema)).rejects.toMatchObject({ code: 'payload_too_large' });
    expect(await parseBody(new NextRequest('http://x', { method: 'POST', body: '{"n":3}' }), schema)).toEqual({ n: 3 });
  });

  it('an upload needs a file field, a real file, and no more than the limit', async () => {
    const withFile = new FormData();
    withFile.append('file', new File(['a,b\n1,2'], 'menu.csv', { type: 'text/csv' }));
    const ok = await readUpload(new NextRequest('http://x', { method: 'POST', body: withFile }), 1024);
    expect(ok.name).toBe('menu.csv');
    expect(new TextDecoder().decode(ok.bytes)).toContain('1,2');
    const small = new FormData();
    small.append('file', new File(['x'.repeat(50)], 'big.csv'));
    await expect(readUpload(new NextRequest('http://x', { method: 'POST', body: small }), 10)).rejects.toMatchObject({ code: 'file_too_large' });
    const noFile = new FormData();
    noFile.append('file', 'just text');
    await expect(readUpload(new NextRequest('http://x', { method: 'POST', body: noFile }), 10)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(readUpload(new NextRequest('http://x', { method: 'POST', body: 'not form data', headers: { 'content-type': 'text/plain' } }), 10)).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('the JSON shapes for a pairing and an import preview: the summary counts errors and updates', () => {
    const p = pairingJson({ id: 'p', dishId: 'd', wineId: 'w', status: 'approved', role: 'primary', rank: 1, comment: null, modelScore: 80, source: 'engine', dirty: false, updatedBy: 'M', updatedAt: '2026-10-14T10:00:00.000Z' });
    expect(p).toMatchObject({ version: null, role: 'primary' });
    const job = importJson({
      id: 'j', kind: 'menu', status: 'preview_ready', fileName: 'm.csv', fileType: 'csv', fileSize: 1, parser: 'csv', notes: [], createdBy: 'M', createdAt: 'x', confirmedAt: null, result: null,
      rows: [
        { rowNumber: 1, fields: {}, include: true, action: 'create', matchId: null, issues: [] },
        { rowNumber: 2, fields: {}, include: false, action: 'update', matchId: 'd', issues: [{ level: 'error', message: 'x' }] }
      ]
    } as never);
    expect(job.summary).toEqual({ total: 2, included: 1, withErrors: 1, updates: 1 });
    expect(job.rows).toHaveLength(2);
  });
});

describe('start-up and the logger', () => {
  it('the logger writes one line per entry: errors and warnings to stderr, the rest to stdout', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.debug('quiet', { a: 1 });
    logger.info('hello');
    logger.warn('careful');
    logger.error('broken', { password: 'x' });
    logger.child({ restaurant: 'halka' }).info('bound');
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).not.toContain('"password":"x"');
    out.mockRestore();
    err.mockRestore();
  });

  it('the configuration is read once, and a copy of the data source and the address is available', () => {
    expect(env().dataSource).toBe('memory');
    expect(env()).toBe(env());
    expect(dataSource()).toBe('memory');
    expect(guestUrl('halka')).toBe('http://localhost:3000/r/halka');
  });

  it('start-up logs the configuration; a broken configuration stops the process with code 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    checkStartup();
    expect(exit).not.toHaveBeenCalled();
    vi.resetModules();
    process.env.DATA_SOURCE = 'postgress';
    const { checkStartup: again } = await import('@/server/startup');
    again();
    expect(exit).toHaveBeenCalledWith(1);
    process.env.DATA_SOURCE = 'memory';
    exit.mockRestore();
  });

  it('the instrumentation hook runs the start-up check only in the Node.js runtime', async () => {
    const before = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = 'edge';
    await expect(register()).resolves.toBeUndefined();
    process.env.NEXT_RUNTIME = 'nodejs';
    await expect(register()).resolves.toBeUndefined();
    process.env.NEXT_RUNTIME = before;
  });

  it('the proxy passes the requested path on to the layouts, and is limited to the dashboard', async () => {
    const res = proxy(new NextRequest('http://localhost:3000/admin/halka/menu?page=2'));
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/admin/halka/menu?page=2');
    expect(proxyConfig.matcher).toEqual(['/admin/:path*']);
  });
});

describe('QR codes: the address and the image sizes', () => {
  it('the size is clamped to the limits, a bad size is the default', () => {
    expect(clampSize(null)).toBe(QR_SIZES.default);
    expect(clampSize('abc')).toBe(QR_SIZES.default);
    expect(clampSize('0')).toBe(QR_SIZES.default);
    expect(clampSize('10')).toBe(QR_SIZES.min);
    expect(clampSize('99999')).toBe(QR_SIZES.max);
    expect(clampSize('512.4')).toBe(512);
  });

  it('an SVG and a PNG are produced for the guest address', async () => {
    expect(await qrSvg('http://localhost:3000/r/halka', 200)).toContain('<svg');
    const png = await qrPng('http://localhost:3000/r/halka', 200);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('containers, scopes and guest page helpers', () => {
  it('a request scope gives the services; the container is the same across calls; the React cache shares one scope', async () => {
    const scope = await createRequestScope();
    expect(scope.cradle.recommendationService).toBeDefined();
    await scope.dispose();
    expect(getContainer()).toBe(getContainer());
    expect(await getRequestScope()).toBeDefined();
  });

  it('a guest page reads its preferences and builds links with them', async () => {
    const ctx = await guestContext(Promise.resolve({ serving: 'glass', styles: ['red'] }));
    expect(ctx.prefs.serving).toBe('glass');
    expect(hrefWith('/r/halka/menu', ctx.prefs, { dish: 'd1' })).toContain('dish=d1');
    expect(hrefWith('/r/halka/menu', ctx.prefs)).toContain('serving=glass');
  });
});

describe('sessions and access checks', () => {
  beforeEach(() => { globalThis.__wmNext.cookies.clear(); globalThis.__wmNext.headers.clear(); });

  it('the session cookie is httpOnly, path-scoped and dated; Secure follows the configuration', () => {
    const d = new Date('2030-01-01T00:00:00Z');
    expect(sessionCookieOptions(d)).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/', expires: d });
    expect(secureCookies()).toBe(false);
    expect(SESSION_COOKIE).toBe('wm_session');
  });

  it('a "next" address is kept only inside the dashboard', () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext('https://evil.example/admin')).toBeNull();
    expect(safeNext('/admin/login?next=x')).toBeNull();
    expect(safeNext('/admin//x')).toBeNull();
    expect(safeNext('/admin/halka/menu?page=2')).toBe('/admin/halka/menu?page=2');
    expect(safeNext('/admin')).toBe('/admin');
  });

  it('there is no principal without a cookie or with a forged one', async () => {
    expect(await getPrincipal()).toBeNull();
    globalThis.__wmNext.cookies.set(SESSION_COOKIE, 'forged');
    expect(await getPrincipal()).toBeNull();
  });

  it('a page without a session goes to sign-in and remembers where it was going', async () => {
    globalThis.__wmNext.headers.set('x-pathname', '/admin/halka/review');
    await expect(requireAccess('halka')).rejects.toMatchObject({ url: '/admin/login?next=%2Fadmin%2Fhalka%2Freview' });
  });

  it('a page without a session and without a remembered path goes to the restaurant dashboard afterwards', async () => {
    await expect(requireAccess('halka')).rejects.toMatchObject({ url: '/admin/login?next=%2Fadmin%2Fhalka' });
  });

  it('a signed-in user without access to a restaurant gets 403; with access, the page knows the role', async () => {
    const s = await loginAs('tomasz@halka.pl');
    globalThis.__wmNext.cookies.set(SESSION_COOKIE, s.token);
    const access = await requireAccess('halka');
    expect(access.can('pairings.decide')).toBe(false);
    expect(access.can('publish')).toBe(true);
    expect(access.membership.role).toBe('manager');
    expect(toActor(access.principal)).toEqual({ id: access.principal.user.id, name: 'Tomasz Lis' });
    await expect(requireAccess('nope')).rejects.toBeInstanceOf(globalThis.__wmNext.ForbiddenSignal);
  });

  it('an action without a session says so; with one, a missing role is a refusal', async () => {
    expect(await authorizeAction('halka', 'panel.view')).toEqual({ signedOut: true });
    const s = await loginAs('kelner@halka.pl').catch(() => null);
    expect(s).toBeNull();                                  // the waiter has no dashboard session at all
    const gm = await loginAs('tomasz@halka.pl');
    globalThis.__wmNext.cookies.set(SESSION_COOKIE, gm.token);
    await expect(authorizeAction('halka', 'pairings.decide')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await authorizeAction('halka', 'publish')).toMatchObject({ actor: { name: 'Tomasz Lis' } });
  });
});
