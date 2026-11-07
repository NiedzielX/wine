import { DEMO_PASSWORD } from '@wine-match/core';
import { describe, expect, inject, it } from 'vitest';

/**
 * Lesson 16, script-level DAST (docs/security/threat-model.md T-14, T-15, T-16; coverage in docs/security/dast-coverage.md): the BUILT app
 * under `next start`, plain `fetch`, no browser. Security headers on every kind of answer, cookie flags, and error answers that
 * carry no stack trace, file path or library name. What it does not cover is listed in the coverage file, not here.
 */
const base = () => inject('e2e').baseUrl;
const origin = () => new URL(base()).origin;
const SAMPLES: Array<[string, string, number]> = [
  ['guest page', '/r/halka', 200],
  ['guest 404', '/r/halka/no-such-page', 404],
  ['unknown restaurant', '/r/no-such-restaurant-slug', 404],
  ['sign-in page', '/admin/login', 200],
  ['panel without a session (redirect)', '/admin/halka', 307],
  ['invitation page, dead link', '/admin/accept?token=not-a-token', 404],
  ['showcase', '/demo/roi', 200],
  ['public API', '/api/v1/public/restaurants/halka/menu', 200],
  ['API 401', '/api/v1/auth/me', 401],
  ['API 404', '/api/v1/no-such-route', 404],
  ['health', '/api/v1/health', 200]
];

describe('security headers and error answers on the built app', () => {
  it('every kind of answer (page, redirect, 404, JSON, error) carries the baseline security headers and no framework banner', async () => {
    for (const [name, path, status] of SAMPLES) {
      const res = await fetch(`${base()}${path}`, { redirect: 'manual' });
      expect(res.status, `${name} ${path}`).toBe(status);
      const h = res.headers;
      expect(h.get('x-content-type-options'), name).toBe('nosniff');
      expect(h.get('referrer-policy'), name).toMatch(/^(strict-origin-when-cross-origin|no-referrer)$/);
      expect(h.get('x-powered-by'), `${name}: X-Powered-By names the framework`).toBeNull();
      expect(h.get('x-frame-options'), name).toBe('DENY');
      const csp = h.get('content-security-policy') ?? '';
      for (const directive of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) expect(csp, `${name}: ${directive}`).toContain(directive);
      expect(h.get('permissions-policy') ?? '', name).toContain('camera=()');
    }
  });

  it('the invitation page keeps its stricter policy and every panel page is never cached', async () => {
    const accept = await fetch(`${base()}/admin/accept?token=x`, { redirect: 'manual' });
    expect(accept.headers.get('referrer-policy')).toBe('no-referrer');
    expect(accept.headers.get('cache-control')).toContain('no-store');
    const login = await fetch(`${base()}/admin/login`);
    expect(login.headers.get('cache-control')).toContain('no-store');
  });

  it('the session cookie is HttpOnly, SameSite=Lax and path-wide; Secure is the production default (config) and is switched off only by the e2e harness', async () => {
    const res = await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'marta@halka.pl', password: DEMO_PASSWORD }) });
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    const flags = cookies[0]!.split(';').map((p) => p.trim().toLowerCase());
    expect(flags[0]).toMatch(/^wm_session=.+/);
    expect(flags).toContain('httponly');
    expect(flags).toContain('samesite=lax');
    expect(flags).toContain('path=/');
    expect(flags.some((f) => f.startsWith('expires=') || f.startsWith('max-age='))).toBe(true);
    // the harness sets AUTH_COOKIE_SECURE=false for http; the default is asserted by packages/core/tests (secureCookies: isProduction)
    expect(res.headers.get('cache-control')).toContain('no-store');
    // the guest side sets no cookie at all
    expect((await fetch(`${base()}/r/halka`)).headers.getSetCookie()).toEqual([]);
  });

  it('error answers carry no stack trace, file path, library name or connection detail: a bad id, a malformed path, a broken body, a forged server action', async () => {
    const answers: Array<[string, Response]> = [
      ['malformed percent-encoding in a guest path', await fetch(`${base()}/r/%E0%A4%A`)],
      ['malformed percent-encoding in a panel path', await fetch(`${base()}/admin/%E0%A4%A`)],
      ['broken JSON', await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: '{bad' })],
      ['oversized body', await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'x'.repeat(3 * 1024 * 1024), password: 'y' }) })],
      ['forged server action id', await fetch(`${base()}/r/halka`, { method: 'POST', headers: { 'next-action': '00deadbeef', origin: origin() } })],
      ['guest dish that is not a UUID', await fetch(`${base()}/r/halka/dish/not-a-uuid/wines`)],
      ['not found API route', await fetch(`${base()}/api/v1/pairings/not-a-uuid?restaurant=halka`, { method: 'PATCH', headers: { origin: origin() } })]
    ];
    for (const [name, res] of answers) {
      expect(res.status, name).toBeLessThan(600);
      const text = await res.text();
      expect(text, name).not.toMatch(/\bat\s+\S+\s+\(|node_modules|\.tsx?:\d+|\/Users\/|\/home\/|TypeError|ReferenceError|postgres(ql)?:\/\/|password authentication|ECONNREFUSED|MikroORM|stack/i);
      expect(res.headers.get('x-powered-by'), name).toBeNull();
    }
  });

  it('the metrics endpoint is closed without the token, and the health answer names nothing about the installation', async () => {
    const m = await fetch(`${base()}/api/v1/metrics`);
    expect(m.status).toBe(401);
    expect(m.headers.get('www-authenticate')).toBe('Bearer');
    const health = await (await fetch(`${base()}/api/v1/health`)).text();
    expect(health).not.toMatch(/postgres|version|host|password|localhost|127\.0\.0\.1/i);
  });
});
