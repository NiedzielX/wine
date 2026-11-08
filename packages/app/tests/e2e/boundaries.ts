import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, inject } from 'vitest';
import { NEW_RESTAURANT, NEW_RESTAURANT_TEAM } from './new-restaurant';

/** Shared by the access-boundary e2e files (.ai/docs/engineering-standards.md §10): sessions, plain fetch helpers, whole payloads, table digest. */
export const HALKA = 'halka';
export const BISTRO = NEW_RESTAURANT.slug;
export const base = () => inject('e2e').baseUrl;
export const origin = () => new URL(base()).origin;
export const db = () => inject('e2e').databaseUrl;

export type Session = { cookie: string; csrf: string };
export async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email, password }) });
  expect(res.status, `sign in ${email}`).toBe(200);
  const token = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  return { cookie: `wm_session=${token}`, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
}
export const halkaSommelier = () => signIn('marta@halka.pl', DEMO_PASSWORD);
export const halkaManager = () => signIn('tomasz@halka.pl', DEMO_PASSWORD);
export const bistroOwner = () => signIn(NEW_RESTAURANT.ownerEmail, NEW_RESTAURANT.password);
export const bistroManager = () => signIn(NEW_RESTAURANT_TEAM.manager.email, NEW_RESTAURANT_TEAM.password);
export const bistroSommelier = () => signIn(NEW_RESTAURANT_TEAM.sommelier.email, NEW_RESTAURANT_TEAM.password);

export const get = (s: Session, path: string) => fetch(`${base()}${path}`, { headers: { cookie: s.cookie }, redirect: 'manual' });
export const send = (s: Session, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, {
    method,
    headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, origin: origin(), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
export const errorCode = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

/** A GET answer as text: the whole payload, so "nothing changed" compares everything, not a count. */
export async function payload(s: Session, path: string): Promise<string> {
  const res = await get(s, path);
  expect(res.status, path).toBe(200);
  return res.text();
}

/** One digest per table the attempts could touch: md5 over every row's text, ordered. Equal before and after means no row changed. */
export const TABLES = ['restaurant', 'dish', 'wine', 'pairing', 'sommelier_decision', 'membership', 'app_user', 'auth_token', 'auth_event', 'published_version', 'import_job', 'recommendation_code', 'sales_record', 'opportunity_dismissal'];
export async function digest(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of TABLES) {
    const rows = await queryDatabase<{ d: string }>(db(), `select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') as d from ${t} x`, []);
    out[t] = rows[0]!.d;
  }
  return out;
}

export async function sampleCsv(kind: string): Promise<string> {
  const res = await fetch(`${base()}/api/v1/import-samples/${kind}`);
  expect(res.status).toBe(200);
  return res.text();
}
export async function stageImport(s: Session, slug: string, kind: 'wines' | 'menu'): Promise<{ id: string; fileName: string }> {
  const form = new FormData();
  form.append('file', new File([await sampleCsv(kind)], `${slug}-${kind}-staged.csv`, { type: 'text/csv' }));
  const res = await fetch(`${base()}/api/v1/imports/${kind}?restaurant=${slug}`, { method: 'POST', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, origin: origin() }, body: form });
  expect(res.status, `stage ${kind} import for ${slug}`).toBe(201);
  return (await res.json()) as { id: string; fileName: string };
}

export type Member = { membershipId: string; email: string; role: string; status: string; version: number };
export const members = async (s: Session, slug: string) => ((await (await get(s, `/api/v1/restaurants/${slug}/team`)).json()) as { members: Member[] }).members;


/** The panels that host the server actions: Next.js answers 409 "Server Action unavailable" when a form is posted to a page that does not reference the action. */
const ACTION_HOSTS = ['/setup', '/publish', '/review', '/opportunities', '/wines', '/import/wines', '/team'];

/**
 * A server action of the panel, sent the way a browser without JavaScript sends its form: multipart POST with the action id from the
 * build's own manifest as `$ACTION_ID_<id>`, the session cookie and a same-origin `Origin`, to a page of `slug` that hosts it.
 * Returns the redirect target (`?saved=` / `?error=`).
 */
export async function runAction(s: Session, exportedName: string, slug: string, fields: Record<string, string>): Promise<{ status: number; location: string }> {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../.next/server/server-reference-manifest.json', import.meta.url)), 'utf8')) as { node: Record<string, { exportedName: string }> };
  const id = Object.entries(manifest.node).find(([, v]) => v.exportedName === exportedName)?.[0];
  if (!id) throw new Error(`no server action named ${exportedName} in the build`);
  for (const host of ACTION_HOSTS) {
    const form = new FormData();
    form.set(`$ACTION_ID_${id}`, '');
    for (const [k, v] of Object.entries({ slug, back: `/admin/${slug}`, ...fields })) form.set(k, v);
    const res = await fetch(`${base()}/admin/${slug}${host}`, { method: 'POST', body: form, redirect: 'manual', headers: { cookie: s.cookie, origin: origin() } });
    const text = await res.text();
    if (res.status === 409 && text.includes('Server Action unavailable')) continue;
    return { status: res.status, location: res.headers.get('location') ?? '' };
  }
  throw new Error(`no page hosts the action ${exportedName}`);
}
