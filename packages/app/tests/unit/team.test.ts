import { type MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as pairingsList } from '@/app/api/v1/restaurants/[slug]/pairings/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { GET as teamList } from '@/app/api/v1/restaurants/[slug]/team/route';
import { PATCH as teamPatch } from '@/app/api/v1/restaurants/[slug]/team/[membershipId]/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import TeamPage from '@/app/(admin)/admin/[slug]/team/page';
import { approvePairing } from '@/app/(admin)/admin/[slug]/actions';
import { changeMemberRole, deactivateMember, reactivateMember } from '@/app/(admin)/admin/[slug]/team-actions';
import { SESSION_COOKIE, requireAccess } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec E12 F1 on the memory data source, through the real doors: the team API, the team actions, the A15 page and the
 * layout check. Halka has a sommelier (Marta), a manager (Tomasz) and a waiter (Jan); the test adds an owner, and a
 * second restaurant with its own owner (the same rows `restaurant:create` writes).
 */
const URL0 = 'http://localhost:3000';
const params = (slug: string, membershipId?: string) => ({ params: Promise.resolve(membershipId ? { slug, membershipId } : { slug }) });
const state = () => (globalThis as unknown as { __wmNext: { cookies: Map<string, string>; headers: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string }; ForbiddenSignal: new () => Error } }).__wmNext;

const OTHER = 'bistro-nad-wisla';
const ids = {
  owner: '00000000-0000-4000-8000-0000000000e1', ownerMembership: '00000000-0000-4000-8000-0000000000e2',
  anna: '00000000-0000-4000-8000-0000000000e3', annaMembership: '00000000-0000-4000-8000-0000000000e4', otherRestaurant: '00000000-0000-4000-8000-0000000000e5',
  unknown: '00000000-0000-4000-8000-0000000000ff'
};
let owner = { cookie: '', token: '', csrf: '' };
let manager = { cookie: '', token: '', csrf: '' };
let sommelier = { cookie: '', token: '', csrf: '' };
let anna = { cookie: '', token: '', csrf: '' };
let membershipOf: Record<string, { id: string; userId: string }> = {};

async function addPeople() {
  const scope = await createRequestScope();
  try {
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;     // the demo hash: the demo password
    const halka = store.memberships.find((m) => m.restaurantSlug === 'halka')!;
    store.restaurants.push({ ...store.restaurants[0], id: ids.otherRestaurant, slug: OTHER, name: 'Bistro Nad Wisłą' });
    store.users.push({ ...template, id: ids.owner, email: 'olga@halka.test', name: 'Olga Owner' }, { ...template, id: ids.anna, email: 'anna@bistro.test', name: 'Anna Nowak' });
    const base = { status: 'active' as const, version: 1, createdAt: '2026-10-01T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null };
    store.memberships.push(
      { ...base, userId: ids.owner, membershipId: ids.ownerMembership, restaurantId: halka.restaurantId, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner' },
      { ...base, userId: ids.anna, membershipId: ids.annaMembership, restaurantId: ids.otherRestaurant, restaurantSlug: OTHER, restaurantName: 'Bistro Nad Wisłą', role: 'owner' }
    );
    membershipOf = Object.fromEntries(store.memberships.filter((m) => m.restaurantSlug === 'halka').map((m) => [store.users.find((u) => u.id === m.userId)!.email, { id: m.membershipId, userId: m.userId }]));
  } finally {
    await scope.dispose();
  }
}

beforeAll(async () => {
  await addPeople();
  owner = await loginAs('olga@halka.test');
  manager = await loginAs('tomasz@halka.pl');
  sommelier = await loginAs('marta@halka.pl');
  anna = await loginAs('anna@bistro.test');
});

const as = (s: { token: string }) => state().cookies.set(SESSION_COOKIE, s.token);
const patch = (s: { cookie: string; csrf: string }, slug: string, membershipId: string, body: unknown, version: number | null = 1, headers: Record<string, string> = {}) =>
  teamPatch(jsonReq(`${URL0}/x`, body, 'PATCH', { cookie: s.cookie, 'x-csrf-token': s.csrf, ...(version === null ? {} : { 'if-match': `"${version}"` }), ...headers }), params(slug, membershipId));
const list = (s: { cookie: string }, slug = 'halka') => teamList(req(`${URL0}/x`, { cookie: s.cookie }), params(slug));
const mid = (email: string) => membershipOf[email].id;
const version = async (s: { cookie: string }, email: string) => ((await (await list(s)).json()) as { members: Array<{ email: string; version: number }> }).members.find((m) => m.email === email)!.version;

describe('GET /api/v1/restaurants/{slug}/team', () => {
  it('lists everyone, active or not, with the version, for an owner and for a manager, and never a password hash', async () => {
    for (const s of [owner, manager]) {
      const res = await list(s);
      expect(res.status).toBe(200);
      const { members } = (await res.json()) as { members: Array<Record<string, unknown>> };
      expect(members.map((m) => m.email).sort()).toEqual(['kelner@halka.pl', 'marta@halka.pl', 'olga@halka.test', 'tomasz@halka.pl']);
      expect(members.find((m) => m.email === 'marta@halka.pl')).toMatchObject({ role: 'sommelier', status: 'active', version: 1, name: 'Marta Wierzbicka' });
      expect(JSON.stringify(members)).not.toMatch(/scrypt|passwordHash|password_hash/);
    }
  });

  it('is closed to a sommelier (403), to nobody signed in (401), and to the owner of another restaurant (403)', async () => {
    expect((await list(sommelier)).status).toBe(403);
    expect((await teamList(req(`${URL0}/x`), params('halka'))).status).toBe(401);
    expect((await list(anna)).status).toBe(403);
    expect((await list(anna, OTHER)).status).toBe(200);
    const own = (await (await list(anna, OTHER)).json()) as { members: Array<{ email: string }> };
    expect(own.members.map((m) => m.email)).toEqual(['anna@bistro.test']);
  });
});

describe('PATCH /api/v1/restaurants/{slug}/team/{membershipId}', () => {
  it('needs If-Match (428), a valid one (400), the CSRF token (403) and a body with a change (422)', async () => {
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), { role: 'sommelier' }, null)).status).toBe(428);
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), { role: 'sommelier' }, 1, { 'if-match': 'abc' })).status).toBe(400);
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), { role: 'sommelier' }, 1, { 'x-csrf-token': 'wrong' })).status).toBe(403);
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), {})).status).toBe(422);
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), { role: 'admin' })).status).toBe(422);
    expect((await patch(manager, 'halka', mid('kelner@halka.pl'), { role: 'sommelier', extra: 1 })).status).toBe(422);
    expect(await version(manager, 'kelner@halka.pl')).toBe(1);
  });

  it('a manager moves the waiter to sommelier and back: the version rises and comes back in ETag; a stale version is a conflict (AC4)', async () => {
    const id = mid('kelner@halka.pl');
    const res = await patch(manager, 'halka', id, { role: 'sommelier' });
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"2"');
    expect(await res.json()).toMatchObject({ role: 'sommelier', version: 2, status: 'active' });
    const stale = await patch(manager, 'halka', id, { role: 'waiter' }, 1);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe('version_conflict');
    expect((await patch(manager, 'halka', id, { role: 'waiter' }, 2)).status).toBe(200);
  });

  it('answers 403 team_hierarchy to a manager who touches an owner or grants owner or manager (AC3), and 422 self_change for oneself', async () => {
    const hierarchy = async (res: Response) => { expect(res.status).toBe(403); expect(((await res.json()) as { error: { code: string } }).error.code).toBe('team_hierarchy'); };
    await hierarchy(await patch(manager, 'halka', mid('olga@halka.test'), { role: 'sommelier' }));
    await hierarchy(await patch(manager, 'halka', mid('olga@halka.test'), { status: 'deactivated' }));
    await hierarchy(await patch(manager, 'halka', mid('marta@halka.pl'), { role: 'owner' }));
    await hierarchy(await patch(manager, 'halka', mid('marta@halka.pl'), { role: 'manager' }));
    const self = await patch(manager, 'halka', mid('tomasz@halka.pl'), { status: 'deactivated' });
    expect(self.status).toBe(422);
    expect(((await self.json()) as { error: { code: string } }).error.code).toBe('self_change');
    expect((await patch(owner, 'halka', mid('olga@halka.test'), { role: 'manager' })).status).toBe(422);
    expect(await version(manager, 'olga@halka.test')).toBe(1);
  });

  it('is closed to a sommelier (403) and to the owner of another restaurant, for Halka and for a member of Halka addressed through their own slug (AC6)', async () => {
    expect((await patch(sommelier, 'halka', mid('kelner@halka.pl'), { role: 'manager' })).status).toBe(403);
    expect((await patch(anna, 'halka', mid('kelner@halka.pl'), { status: 'deactivated' })).status).toBe(403);
    // her own slug, but Jan's membership id: it is not in her restaurant
    expect((await patch(anna, OTHER, mid('kelner@halka.pl'), { status: 'deactivated' })).status).toBe(404);
    expect((await patch(anna, OTHER, 'abc', { status: 'deactivated' })).status).toBe(404);
    expect((await patch(owner, 'halka', ids.unknown, { status: 'deactivated' })).status).toBe(404);
    expect(await version(owner, 'kelner@halka.pl')).toBe(3);
  });
});

describe('deactivation cuts access on the next request, on the same session (AC2)', () => {
  const pairings = (s: { cookie: string }) => pairingsList(req(`${URL0}/x`, { cookie: s.cookie }), params('halka'));
  const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
  async function redirectOf(run: () => Promise<unknown>): Promise<string> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    throw new Error('expected a redirect');
  }

  it('the API, the layout and a server action refuse the deactivated sommelier, and everything works again after reactivation', async () => {
    const id = mid('marta@halka.pl');
    as(sommelier);
    expect((await pairings(sommelier)).status).toBe(200);
    expect((await requireAccess('halka')).membership.role).toBe('sommelier');
    const v = await version(owner, 'marta@halka.pl');

    expect((await patch(owner, 'halka', id, { status: 'deactivated' }, v)).status).toBe(200);
    // same session cookie, no new sign-in
    expect((await pairings(sommelier)).status).toBe(403);
    expect((await publishPost(req(`${URL0}/x`, { cookie: sommelier.cookie, 'x-csrf-token': sommelier.csrf }, 'POST'), params('halka'))).status).toBe(403);
    await expect(requireAccess('halka')).rejects.toBeInstanceOf(state().ForbiddenSignal);
    expect(await redirectOf(() => approvePairing(form({ slug: 'halka', back: '/admin/halka/review', pairingId: ids.unknown, version: '1' })))).toBe('/admin/halka/review?error=forbidden');
    // the session itself is alive, but the account has no restaurant any more
    const who = (await (await me(req(`${URL0}/x`, { cookie: sommelier.cookie }))).json()) as { memberships?: unknown[] };
    expect(who.memberships ?? []).toEqual([]);

    expect((await patch(owner, 'halka', id, { status: 'active' }, v + 1)).status).toBe(200);
    expect((await pairings(sommelier)).status).toBe(200);
    expect((await requireAccess('halka')).membership.role).toBe('sommelier');
  });

  it('a deactivated manager cannot use the team API or the team actions any more (the service re-checks the stored membership)', async () => {
    const id = mid('tomasz@halka.pl');
    const v = await version(owner, 'tomasz@halka.pl');
    expect((await patch(owner, 'halka', id, { status: 'deactivated' }, v)).status).toBe(200);
    expect((await list(manager)).status).toBe(403);
    as(manager);
    expect(await redirectOf(() => deactivateMember(form({ slug: 'halka', back: '/admin/halka/team', membershipId: mid('kelner@halka.pl'), version: '3' })))).toBe('/admin/halka/team?error=forbidden');
    expect((await patch(owner, 'halka', id, { status: 'active' }, v + 1)).status).toBe(200);
    expect((await list(manager)).status).toBe(200);
  });
});

describe('the team actions (A15 forms posted directly)', () => {
  const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
  async function redirectOf(run: () => Promise<unknown>): Promise<string> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    throw new Error('expected a redirect');
  }
  const back = '/admin/halka/team';
  const fields = (email: string, v: number, more: Record<string, string> = {}) => form({ slug: 'halka', back, membershipId: mid(email), version: String(v), ...more });

  it('change the role, deactivate and reactivate, each with its flash', async () => {
    as(manager);
    const v = await version(manager, 'kelner@halka.pl');
    expect(await redirectOf(() => changeMemberRole(fields('kelner@halka.pl', v, { role: 'sommelier' })))).toBe(`${back}?saved=member_role_changed`);
    expect(await redirectOf(() => deactivateMember(fields('kelner@halka.pl', v + 1)))).toBe(`${back}?saved=member_deactivated`);
    expect(await redirectOf(() => changeMemberRole(fields('kelner@halka.pl', v + 2, { role: 'waiter' })))).toBe(`${back}?error=member_deactivated`);
    expect(await redirectOf(() => reactivateMember(fields('kelner@halka.pl', v + 2)))).toBe(`${back}?saved=member_reactivated`);
    expect(await redirectOf(() => changeMemberRole(fields('kelner@halka.pl', v + 3, { role: 'waiter' })))).toBe(`${back}?saved=member_role_changed`);
  });

  it('refuse the hierarchy, oneself, a stale version, a missing version and a person who may not manage the team', async () => {
    as(manager);
    const marta0 = await version(owner, 'marta@halka.pl');
    expect(await redirectOf(() => deactivateMember(fields('olga@halka.test', 1)))).toBe(`${back}?error=team_hierarchy`);
    expect(await redirectOf(() => changeMemberRole(fields('marta@halka.pl', 1, { role: 'manager' })))).toBe(`${back}?error=team_hierarchy`);
    expect(await redirectOf(() => deactivateMember(fields('tomasz@halka.pl', 1)))).toBe(`${back}?error=self_change`);
    expect(await redirectOf(() => changeMemberRole(fields('marta@halka.pl', 999, { role: 'waiter' })))).toBe(`${back}?error=version_conflict`);
    expect(await redirectOf(() => changeMemberRole(form({ slug: 'halka', back, membershipId: mid('marta@halka.pl'), role: 'waiter' })))).toBe(`${back}?error=version_conflict`);
    as(sommelier);
    expect(await redirectOf(() => deactivateMember(fields('kelner@halka.pl', 1)))).toBe(`${back}?error=forbidden`);
    // the owner of another restaurant, through Halka's slug
    as(anna);
    expect(await redirectOf(() => deactivateMember(fields('kelner@halka.pl', 1)))).toBe(`${back}?error=forbidden`);
    as(owner);
    expect(await version(owner, 'marta@halka.pl')).toBe(marta0);
  });
});

describe('A15 Team page', () => {
  type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
  async function render(lang: 'en' | 'pl' = 'en', slug = 'halka'): Promise<string> {
    state().headers.clear();
    state().headers.set('x-wine-lang', lang);
    const { prelude } = await prerender(createElement(TeamPage as unknown as Page, { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }));
    return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
  }

  it('shows the team to a manager with controls only where the hierarchy allows them, with no script needed', async () => {
    as(manager);
    const html = await render();
    expect(html).toContain('<h1 class="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">Team</h1>');
    for (const name of ['Marta Wierzbicka', 'Tomasz Lis', 'Jan Kelner', 'Olga Owner']) expect(html).toContain(name);
    const row = (membershipId: string) => html.split(`data-member="${membershipId}"`)[1].split('</li>')[0];
    // Marta (a sommelier): a role select, save and remove-access buttons, all plain form posts
    expect(row(mid('marta@halka.pl'))).toContain('name="role"');
    expect(row(mid('marta@halka.pl'))).toContain('Remove access');
    // the owner: read-only for a manager, with the reason
    expect(row(mid('olga@halka.test'))).not.toContain('name="role"');
    expect(row(mid('olga@halka.test'))).not.toContain('Remove access');
    expect(row(mid('olga@halka.test'))).toContain('Only an owner can change an owner.');
    // oneself: read-only
    expect(row(mid('tomasz@halka.pl'))).not.toContain('Remove access');
    expect(row(mid('tomasz@halka.pl'))).toContain('You cannot change your own role or access.');
    // a manager is offered only the roles below manager: no owner, no manager in the select
    expect(row(mid('marta@halka.pl'))).not.toContain('value="owner"');
    expect(row(mid('marta@halka.pl'))).not.toContain('value="manager"');
    expect(row(mid('marta@halka.pl'))).toMatch(/value="sommelier" selected/);
    expect(html).not.toMatch(/password|scrypt|<script[^>]*>[^<]*team/i);
  });

  it('gives an owner every control but the one on themselves, and renders in Polish', async () => {
    as(owner);
    const html = await render('pl');
    expect(html).toContain('Zespół');
    const row = (membershipId: string) => html.split(`data-member="${membershipId}"`)[1].split('</li>')[0];
    expect(row(mid('tomasz@halka.pl'))).toContain('Odbierz dostęp');
    expect(row(mid('olga@halka.test'))).not.toContain('Odbierz dostęp');
    expect(row(mid('marta@halka.pl'))).toContain('value="owner"');
    expect(row(mid('marta@halka.pl'))).toContain('value="manager"');
  });

  it('is a 403 for a sommelier and for the owner of another restaurant, and shows the other restaurant only its own team', async () => {
    as(sommelier);
    await expect(render()).rejects.toBeInstanceOf(state().ForbiddenSignal);
    as(anna);
    await expect(render('en', 'halka')).rejects.toBeInstanceOf(state().ForbiddenSignal);
    const own = await render('en', OTHER);
    expect(own).toContain('Anna Nowak');
    expect(own).not.toContain('Marta Wierzbicka');
  });
});
