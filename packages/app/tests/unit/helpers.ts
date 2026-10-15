import { NextRequest } from 'next/server';
import { expect } from 'vitest';
import { POST as login } from '@/app/api/v1/auth/login/route';

/** A request with headers (and an optional JSON body). */
export function req(url: string, headers: Record<string, string> = {}, method = 'GET'): NextRequest {
  return new NextRequest(url, { method, headers: { host: 'localhost:3000', ...headers } });
}

export function jsonReq(url: string, body: unknown, method = 'POST', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { method, headers: { 'content-type': 'application/json', host: 'localhost:3000', ...headers }, body: JSON.stringify(body) });
}

/**
 * Signs in through the real sign-in route and returns the session cookie, its token and the CSRF token that
 * a dashboard request must send back.
 */
export async function loginAs(email: string, password = 'demo-halka-2026'): Promise<{ cookie: string; token: string; csrf: string }> {
  const res = await login(jsonReq('http://localhost:3000/api/v1/auth/login', { email, password }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { csrfToken: string };
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = /wm_session=([^;]+)/.exec(setCookie)?.[1] ?? '';
  return { cookie: `wm_session=${token}`, token, csrf: body.csrfToken };
}
