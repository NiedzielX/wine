import { MIN_PASSWORD_LENGTH, type MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import { DELETE as invitationDelete } from '@/app/api/v1/restaurants/[slug]/invitations/[invitationId]/route';
import { GET as invitationList, POST as invitationCreate } from '@/app/api/v1/restaurants/[slug]/invitations/route';
import TeamPage from '@/app/(admin)/admin/[slug]/team/page';
import { inviteMember, revokeInvitation, type InviteState } from '@/app/(admin)/admin/[slug]/team-actions';
import AcceptPage from '@/app/(admin)/admin/accept/page';
import { acceptInvitation } from '@/app/(admin)/admin/accept-actions';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec E12 F2 on the memory data source, through the real doors: the invitation API, the A15 actions and page, the A17 page and
 * its action. Halka has a sommelier (Marta), a manager (Tomasz) and a waiter (Jan); the test adds an owner (Olga), another manager
 * (Mia) and a second restaurant with its own owner (Anna), the same people as `team.test.ts`.
 */
const URL0 = 'http://localhost:3000';
const params = (slug: string, invitationId?: string) => ({ params: Promise.resolve(invitationId ? { slug, invitationId } : { slug }) });
type NextState = { cookies: Map<string, string>; headers: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string }; ForbiddenSignal: new () => Error; NotFoundSignal: new () => Error };
const state = () => (globalThis as unknown as { __wmNext: NextState }).__wmNext;

const OTHER = 'bistro-nad-wisla';
const ids = {
  mia: '00000000-0000-4000-8000-0000000000e6', miaMembership: '00000000-0000-4000-8000-0000000000e7',
  owner: '00000000-0000-4000-8000-0000000000e1', ownerMembership: '00000000-0000-4000-8000-0000000000e2',
  anna: '00000000-0000-4000-8000-0000000000e3', annaMembership: '00000000-0000-4000-8000-0000000000e4', otherRestaurant: '00000000-0000-4000-8000-0000000000e5'
};
type Session = { cookie: string; token: string; csrf: string };
let owner: Session, manager: Session, sommelier: Session, anna: Session, mia: Session;
let store: MemoryStore;

beforeAll(async () => {
  const scope = await createRequestScope();
  try {
    store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;
    const halka = store.memberships.find((m) => m.restaurantSlug === 'halka')!;
    store.restaurants.push({ ...store.restaurants[0], id: ids.otherRestaurant, slug: OTHER, name: 'Bistro Nad Wisłą' });
    store.users.push({ ...template, id: ids.mia, email: 'mia@halka.test', name: 'Mia Manager' }, { ...template, id: ids.owner, email: 'olga@halka.test', name: 'Olga Owner' }, { ...template, id: ids.anna, email: 'anna@bistro.test', name: 'Anna Nowak' });
    const base = { status: 'active' as const, version: 1, createdAt: '2026-10-01T07:00:00.000Z', deactivatedAt: null, deactivatedBy: null };
    store.memberships.push(
      { ...base, userId: ids.mia, membershipId: ids.miaMembership, restaurantId: halka.restaurantId, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'manager', createdAt: '2026-10-01T07:30:00.000Z' },
      { ...base, userId: ids.owner, membershipId: ids.ownerMembership, restaurantId: halka.restaurantId, restaurantSlug: 'halka', restaurantName: 'Halka', role: 'owner' },
      { ...base, userId: ids.anna, membershipId: ids.annaMembership, restaurantId: ids.otherRestaurant, restaurantSlug: OTHER, restaurantName: 'Bistro Nad Wisłą', role: 'owner' }
    );
  } finally {
    await scope.dispose();
  }
  [owner, manager, sommelier, anna, mia] = await Promise.all(['olga@halka.test', 'tomasz@halka.pl', 'marta@halka.pl', 'anna@bistro.test', 'mia@halka.test'].map((e) => loginAs(e)));
});

const as = (s: { token: string } | null) => { if (s) state().cookies.set(SESSION_COOKIE, s.token); else state().cookies.delete(SESSION_COOKIE); };
const headersOf = (s: Session, extra: Record<string, string> = {}) => ({ cookie: s.cookie, 'x-csrf-token': s.csrf, ...extra });
const create = (s: Session, slug: string, body: unknown, extra: Record<string, string> = {}) => invitationCreate(jsonReq(`${URL0}/x`, body, 'POST', headersOf(s, extra)), params(slug));
const list = (s: Session, slug = 'halka') => invitationList(req(`${URL0}/x`, { cookie: s.cookie }), params(slug));
const del = (s: Session, slug: string, id: string, extra: Record<string, string> = {}) => invitationDelete(req(`${URL0}/x`, headersOf(s, extra), 'DELETE'), params(slug, id));
type Created = { id: string; email: string; role: string; link: string; expiresAt: string };
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;
const issue = async (s: Session, email: string, role = 'sommelier', slug = 'halka'): Promise<Created> => {
  const res = await create(s, slug, { email, role });
  expect(res.status, email).toBe(201);
  return (await res.json()) as Created;
};
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const pending = async (s: Session, slug = 'halka') => ((await (await list(s, slug)).json()) as { invitations: Array<{ id: string; email: string; role: string }> }).invitations;
const PASSWORD = 'a-long-enough-passphrase';

describe('POST /api/v1/restaurants/{slug}/invitations (AC8, AC24)', () => {
  it('answers 201 with the invitation and its link, once: the list never shows a token, a hash or a link', async () => {
    const res = await create(owner, 'halka', { email: ' Newbie@Example.TEST ', role: 'manager' });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as Created & Record<string, unknown>;
    expect(body).toMatchObject({ email: 'newbie@example.test', role: 'manager', createdBy: ids.owner });
    expect(body.link).toMatch(/^http:\/\/localhost:3000\/admin\/accept\?token=[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(71.9 * 3_600_000);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThan(72.1 * 3_600_000);
    const listed = await (await list(owner)).text();
    expect(listed).toContain('newbie@example.test');
    expect(listed).not.toContain(tokenOf(body.link));
    expect(listed).not.toMatch(/token|link|hash/i);
    // the stored row carries a hash only, and the audit trail neither the token nor the address
    const row = store.invitations.find((i) => i.id === body.id)!;
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(store.invitations)).not.toContain(tokenOf(body.link));
    expect(JSON.stringify(store.authEvents)).not.toContain('example.test');
  });

  it('gives the same answer for an e-mail that has an account and for one that has none (AC8)', async () => {
    const shape = (c: Created) => ({ keys: Object.keys(c).sort(), role: c.role, linkShape: c.link.replace(/token=.+$/, 'token=T'), hours: Math.round((Date.parse(c.expiresAt) - Date.now()) / 3_600_000) });
    const withAccount = await issue(owner, 'anna@bistro.test', 'sommelier');          // Anna has an account (the owner of the other restaurant)
    const without = await issue(owner, 'nobody-has-this@example.test', 'sommelier');
    expect(shape(withAccount)).toEqual(shape(without));
    const listed = await pending(owner);
    const a = listed.find((i) => i.email === 'anna@bistro.test')!;
    const b = listed.find((i) => i.email === 'nobody-has-this@example.test')!;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  });

  it('names a person who is already in the team (409 already_member), whatever the letter case, and creates nothing', async () => {
    const before = (await pending(owner)).length;
    for (const email of ['marta@halka.pl', 'MARTA@Halka.PL', ' tomasz@halka.pl']) {
      const res = await create(owner, 'halka', { email, role: 'sommelier' });
      expect(res.status, email).toBe(409);
      expect(await code(res)).toBe('already_member');
    }
    expect((await pending(owner)).length).toBe(before);
  });

  it('a second invitation for the same e-mail replaces the first', async () => {
    const first = await issue(owner, 'twice@example.test', 'sommelier');
    const second = await issue(owner, 'twice@example.test', 'manager');
    const rows = (await pending(owner)).filter((i) => i.email === 'twice@example.test');
    expect(rows).toEqual([expect.objectContaining({ id: second.id, role: 'manager' })]);
    const scope = await createRequestScope();
    expect(await scope.cradle.invitationService.offer(tokenOf(first.link))).toBeNull();
    expect(await scope.cradle.invitationService.offer(tokenOf(second.link))).toMatchObject({ role: 'manager' });
    await scope.dispose();
  });

  it('builds the link from PUBLIC_BASE_URL, never from the Host header', async () => {
    const res = await create(owner, 'halka', { email: 'host-header@example.test', role: 'sommelier' }, { host: 'evil.example', 'x-forwarded-host': 'evil.example' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Created).link.startsWith('http://localhost:3000/admin/accept?token=')).toBe(true);
  });

  it('denied paths: no session, no CSRF token, a cross-site request, a sommelier, a manager inviting a manager or an owner, another restaurant', async () => {
    const body = { email: 'denied@example.test', role: 'sommelier' };
    expect((await invitationCreate(jsonReq(`${URL0}/x`, body), params('halka'))).status).toBe(401);
    expect((await invitationCreate(jsonReq(`${URL0}/x`, body, 'POST', { cookie: owner.cookie }), params('halka'))).status).toBe(403);
    expect((await invitationCreate(jsonReq(`${URL0}/x`, body, 'POST', { cookie: owner.cookie, 'x-csrf-token': 'wrong' }), params('halka'))).status).toBe(403);
    for (const extra of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) {
      const res = await create(owner, 'halka', body, extra);
      expect(res.status).toBe(403);
      expect(await code(res)).toBe('csrf');
    }
    expect((await create(sommelier, 'halka', body)).status).toBe(403);
    for (const role of ['owner', 'manager']) {
      const res = await create(manager, 'halka', { email: 'denied@example.test', role });
      expect(res.status, role).toBe(403);
      expect(await code(res)).toBe('team_hierarchy');
    }
    expect((await create(manager, 'halka', body)).status).toBe(201);                       // the allowed case works
    // Anna owns another restaurant: nothing in Halka, and her own restaurant is hers
    expect((await create(anna, 'halka', body)).status).toBe(403);
    expect((await list(anna, 'halka')).status).toBe(403);
    expect((await create(owner, OTHER, body)).status).toBe(403);
    expect((await pending(anna, OTHER)).map((i) => i.email)).not.toContain('denied@example.test');
    expect((await create(owner, 'no-such-restaurant', body)).status).toBe(403);
  });

  it('refuses bad bodies before anything is created: a waiter, an unknown role, a bad e-mail, extra fields, no body', async () => {
    const before = (await pending(owner)).length;
    for (const bad of [{ email: 'a@b.test', role: 'waiter' }, { email: 'a@b.test', role: 'janitor' }, { email: 'nope', role: 'owner' }, { email: 'a@b.test', role: 'owner', extra: true }, {}]) {
      const res = await create(owner, 'halka', bad);
      expect(res.status, JSON.stringify(bad)).toBe(422);
    }
    expect((await invitationCreate(req(`${URL0}/x`, headersOf(owner), 'POST'), params('halka'))).status).toBe(422);
    expect((await pending(owner)).length).toBe(before);
  });
});

describe('DELETE /api/v1/restaurants/{slug}/invitations/{id} (AC7, AC24)', () => {
  it('cancels a pending invitation: 204, the link is dead at once, a second delete and a stranger id are 404', async () => {
    const made = await issue(owner, 'cancel-me@example.test', 'sommelier');
    expect((await del(owner, 'halka', made.id)).status).toBe(204);
    const scope = await createRequestScope();
    expect(await scope.cradle.invitationService.offer(tokenOf(made.link))).toBeNull();
    await scope.dispose();
    expect((await pending(owner)).map((i) => i.id)).not.toContain(made.id);
    expect((await del(owner, 'halka', made.id)).status).toBe(404);
    expect((await del(owner, 'halka', 'not-a-uuid')).status).toBe(404);
    expect((await del(owner, 'halka', '00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
  });

  it('denied paths: no session, no CSRF token, cross-site, a sommelier, another restaurant (also through its own slug), a manager on an owner invitation', async () => {
    const made = await issue(owner, 'keep-me@example.test', 'owner');
    const target = (s: Session | null, slug: string, extra: Record<string, string> = {}) => invitationDelete(req(`${URL0}/x`, s ? headersOf(s, extra) : {}, 'DELETE'), params(slug, made.id));
    expect((await target(null, 'halka')).status).toBe(401);
    expect((await invitationDelete(req(`${URL0}/x`, { cookie: owner.cookie }, 'DELETE'), params('halka', made.id))).status).toBe(403);
    expect((await target(owner, 'halka', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await target(sommelier, 'halka')).status).toBe(403);
    expect((await target(anna, 'halka')).status).toBe(403);
    // Anna through her own restaurant's slug cannot reach Halka's invitation: not found, still pending
    expect((await target(anna, OTHER)).status).toBe(404);
    // a manager may not cancel an owner's invitation
    const res = await target(manager, 'halka');
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('team_hierarchy');
    expect((await pending(owner)).map((i) => i.id)).toContain(made.id);
    expect((await target(owner, 'halka')).status).toBe(204);
  });
});

describe('inviteMember and revokeInvitation actions (A15)', () => {
  const back = '/admin/halka/team';
  const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
  const invite = (fields: Record<string, string>) => inviteMember({ status: 'idle' }, form({ slug: 'halka', back, ...fields }));
  async function redirectOf(run: () => Promise<unknown>): Promise<string> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    throw new Error('expected a redirect');
  }

  it('returns the link as the state of the form and nowhere else; the same errors as the API', async () => {
    as(owner);
    const made = await invite({ email: 'form@example.test', role: 'sommelier' });
    expect(made).toMatchObject({ status: 'created', email: 'form@example.test', role: 'sommelier' });
    expect((made as Extract<InviteState, { status: 'created' }>).link).toMatch(/^http:\/\/localhost:3000\/admin\/accept\?token=/);
    expect(await invite({ email: 'marta@halka.pl', role: 'sommelier' })).toEqual({ status: 'error', error: 'already_member' });
    expect(await invite({ email: 'bad', role: 'sommelier' })).toEqual({ status: 'error', error: 'validation_failed' });
    expect(await invite({ email: 'x@example.test', role: 'waiter' })).toEqual({ status: 'error', error: 'validation_failed' });
    as(manager);
    expect(await invite({ email: 'x@example.test', role: 'owner' })).toEqual({ status: 'error', error: 'team_hierarchy' });
    as(sommelier);
    expect(await invite({ email: 'x@example.test', role: 'sommelier' })).toEqual({ status: 'error', error: 'forbidden' });
    as(anna);
    expect(await invite({ email: 'x@example.test', role: 'sommelier' })).toEqual({ status: 'error', error: 'forbidden' });
    as(null);
    expect(await redirectOf(() => invite({ email: 'x@example.test', role: 'sommelier' }))).toBe(`/admin/login?next=${encodeURIComponent(back)}`);
    as(owner);
  });

  it('cancels with its flash; a manager is refused for an owner invitation; a stranger id is "not found"', async () => {
    as(owner);
    const mine = await issue(owner, 'flash-cancel@example.test', 'owner');
    as(manager);
    expect(await redirectOf(() => revokeInvitation(form({ slug: 'halka', back, invitationId: mine.id })))).toBe(`${back}?error=team_hierarchy`);
    as(sommelier);
    expect(await redirectOf(() => revokeInvitation(form({ slug: 'halka', back, invitationId: mine.id })))).toBe(`${back}?error=forbidden`);
    as(owner);
    expect(await redirectOf(() => revokeInvitation(form({ slug: 'halka', back, invitationId: mine.id })))).toBe(`${back}?saved=invitation_revoked`);
    expect(await redirectOf(() => revokeInvitation(form({ slug: 'halka', back, invitationId: mine.id })))).toBe(`${back}?error=not_found`);
    expect(await redirectOf(() => revokeInvitation(form({ slug: 'halka', back, invitationId: 'abc' })))).toBe(`${back}?error=not_found`);
  });
});

describe('A17: opening and accepting a link', () => {
  type Page = FunctionComponent<{ searchParams: Promise<Record<string, string>> }>;
  async function render(search: Record<string, string>, lang: 'en' | 'pl' = 'en'): Promise<string> {
    state().headers.clear();
    state().headers.set('x-wine-lang', lang);
    const { prelude } = await prerender(createElement(AcceptPage as unknown as Page, { searchParams: Promise.resolve(search) }));
    return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
  }
  const form = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
  async function redirectOf(run: () => Promise<unknown>): Promise<string> {
    try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
    throw new Error('expected a redirect');
  }
  const accept = (token: string, fields: Record<string, string> = {}) => redirectOf(() => acceptInvitation(form({ token, ...fields })));
  const offerOf = async (token: string) => { const scope = await createRequestScope(); try { return await scope.cradle.invitationService.offer(token); } finally { await scope.dispose(); } };

  it('a new person: the page is only a form (GET changes nothing), the post makes the account, signs in and goes to the restaurant with the invited role (AC9)', async () => {
    const made = await issue(owner, 'brand-new@example.test', 'manager');
    const token = tokenOf(made.link);
    as(null);
    const html = await render({ token });
    expect(html).toContain('Join the team');
    expect(html).toContain('brand-new@example.test');
    expect(html).toContain(`<input type="hidden" name="token" value="${token}"/>`);
    expect(html).toMatch(/name="name"[^>]*required|required[^>]*name="name"/);
    expect(html).toMatch(/type="password"/);
    expect(html).toContain(`minLength="${MIN_PASSWORD_LENGTH}"`);
    expect(html).not.toMatch(/<script[^>]*>[^<]*token/i);
    // reading the page again, any number of times, does not use the link
    await render({ token });
    expect(await offerOf(token)).not.toBeNull();

    expect(await accept(token, { name: 'Brand New', password: PASSWORD })).toBe('/admin/halka');
    const jar = state().cookies.get(SESSION_COOKIE);
    expect(jar).toBeTruthy();
    const scope = await createRequestScope();
    const principal = (await scope.cradle.authService.authenticate(jar!))!;
    expect(principal.user).toMatchObject({ email: 'brand-new@example.test', name: 'Brand New' });
    expect(principal.memberships).toEqual([expect.objectContaining({ restaurantSlug: 'halka', role: 'manager' })]);
    // the password is the one chosen (stored as a scrypt hash, not as text), and it signs in on its own
    const stored = store.users.find((u) => u.email === 'brand-new@example.test')!.passwordHash;
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain(PASSWORD);
    expect((await scope.cradle.authService.login('brand-new@example.test', PASSWORD)).principal.user.email).toBe('brand-new@example.test');
    await scope.dispose();
    // the link is spent: the same answer as for any dead link, and the page is a 404
    expect(await accept(token, { name: 'Again', password: PASSWORD })).toBe('/admin/accept?error=invalid_token');
    await expect(render({ token })).rejects.toBeInstanceOf(state().NotFoundSignal);
    as(null);
  });

  it('every kind of dead link gives the 404 page and the same redirect from the action: unknown, empty, cancelled, expired, used (AC7)', async () => {
    const cancelled = await issue(owner, 'dead1@example.test');
    await del(owner, 'halka', cancelled.id);
    const expired = await issue(owner, 'dead2@example.test');
    store.invitations.find((i) => i.id === expired.id)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    const used = await issue(owner, 'dead3@example.test');
    as(null);
    await accept(tokenOf(used.link), { name: 'U', password: PASSWORD });
    as(null);
    for (const token of [tokenOf(cancelled.link), tokenOf(expired.link), tokenOf(used.link), 'x'.repeat(43), '']) {
      await expect(render(token ? { token } : {}), token).rejects.toBeInstanceOf(state().NotFoundSignal);
      expect(await accept(token || 'x'.repeat(20), { name: 'Z', password: PASSWORD }), token).toBe('/admin/accept?error=invalid_token');
    }
    expect(store.users.some((u) => u.email === 'dead1@example.test' || u.email === 'dead2@example.test')).toBe(false);
  });

  it('a weak password or a missing name is refused with a reason and the link stays usable', async () => {
    const made = await issue(owner, 'weak@example.test');
    const token = tokenOf(made.link);
    as(null);
    expect(await accept(token, { name: 'W', password: 'short' })).toBe(`/admin/accept?token=${token}&error=password_too_short`);
    expect(await accept(token, { name: ' ', password: PASSWORD })).toBe(`/admin/accept?token=${token}&error=name_required`);
    expect(await accept(token, { name: 'W', password: 'x'.repeat(200) })).toBe(`/admin/accept?token=${token}&error=password_too_long`);
    expect(await offerOf(token)).not.toBeNull();
    const html = await render({ token, error: 'password_too_short' });
    expect(html).toContain(`needs at least ${MIN_PASSWORD_LENGTH} characters`);
    expect(await render({ token, error: '<script>alert(1)</script>' })).not.toContain('<script>alert');
  });

  it('an existing account: not signed in it is sent to sign in and the link keeps working; another account is refused; its own session joins without touching the password (AC8)', async () => {
    const made = await issue(owner, 'anna@bistro.test', 'sommelier');       // Anna has an account (owner of the other restaurant)
    const token = tokenOf(made.link);
    as(null);
    const signedOut = await render({ token });
    expect(signedOut).toContain('already has an account');
    expect(signedOut).toContain(`/admin/login?next=${encodeURIComponent(`/admin/accept?token=${token}`)}`.replace(/&/g, '&amp;'));
    expect(signedOut).not.toContain('type="password"');
    // a password in a forged post for an existing account is ignored; without a session the post is refused
    expect(await accept(token, { name: 'Mallory', password: 'mallory-chosen-passphrase' })).toBe(`/admin/accept?token=${token}&error=sign_in_required`);
    as(sommelier);
    const wrong = await render({ token });
    expect(wrong).toContain('You are signed in with another account');
    expect(await accept(token)).toBe(`/admin/accept?token=${token}&error=wrong_account`);
    expect(await offerOf(token)).not.toBeNull();

    as(anna);
    const own = await render({ token });
    expect(own).toContain('does not change');
    expect(own).not.toContain('type="password"');
    const hashBefore = store.users.find((u) => u.email === 'anna@bistro.test')!.passwordHash;
    expect(await accept(token, { name: 'Ignored', password: 'ignored-new-passphrase-1' })).toBe('/admin/halka');
    expect(store.users.find((u) => u.email === 'anna@bistro.test')!.passwordHash).toBe(hashBefore);
    const scope = await createRequestScope();
    expect((await scope.cradle.authService.login('anna@bistro.test', 'demo-halka-2026')).principal.memberships.map((m) => m.restaurantSlug).sort()).toEqual([OTHER, 'halka']);
    await scope.dispose();
    as(null);
  });

  it('renders in Polish and never prints a hash', async () => {
    const made = await issue(owner, 'polish@example.test');
    as(null);
    const html = await render({ token: tokenOf(made.link) }, 'pl');
    expect(html).toContain('Dołącz do zespołu');
    expect(html).toContain('Załóż konto i dołącz');
    expect(html).not.toMatch(/scrypt|token_hash/);
  });

  it('an inviter deactivated after inviting takes the link with them: page 404, post refused', async () => {
    const made = await issue(mia, 'orphan@example.test');
    const token = tokenOf(made.link);
    expect(await offerOf(token)).not.toBeNull();
    // the owner removes Mia's access
    const scope = await createRequestScope();
    await scope.cradle.teamService.deactivate('halka', ids.miaMembership, { id: ids.owner, name: 'Olga Owner' }, 1);
    await scope.dispose();
    as(null);
    await expect(render({ token })).rejects.toBeInstanceOf(state().NotFoundSignal);
    expect(await accept(token, { name: 'O', password: PASSWORD })).toBe('/admin/accept?error=invalid_token');
    expect(store.users.some((u) => u.email === 'orphan@example.test')).toBe(false);
  });
});

describe('A15 page with invitations', () => {
  type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
  async function render(lang: 'en' | 'pl' = 'en'): Promise<string> {
    state().headers.clear();
    state().headers.set('x-wine-lang', lang);
    const { prelude } = await prerender(createElement(TeamPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve({}) }));
    return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
  }

  it('an owner sees the invite form with every invitable role and the pending list with cancel buttons; no token, hash or link of a pending invitation is in the page', async () => {
    const made = await issue(owner, 'listed@example.test', 'manager');
    as(owner);
    const html = await render();
    expect(html).toContain('Invite someone');
    expect(html).toContain('name="email"');
    const select = /<select[^>]*name="role"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    for (const r of ['owner', 'manager', 'sommelier']) expect(select).toContain(`value="${r}"`);
    expect(select).not.toContain('value="waiter"');
    const row = html.split(`data-invitation="${made.id}"`)[1].split('</li>')[0];
    expect(row).toContain('listed@example.test');
    expect(row).toContain('Cancel invitation');
    expect(row).toContain('Invited by Olga Owner');
    expect(html).not.toContain(tokenOf(made.link));
    expect(html).not.toMatch(/accept\?token=/);
  });

  it('a manager is offered only the Wine Director role and cannot cancel an owner invitation; Polish renders', async () => {
    const ownerMade = await issue(owner, 'owner-made@example.test', 'owner');
    as(manager);
    const html = await render();
    const select = /<select[^>]*name="role"[\s\S]*?<\/select>/.exec(html)?.[0] ?? '';
    expect(select).toContain('value="sommelier"');
    expect(select).not.toContain('value="owner"');
    expect(select).not.toContain('value="manager"');
    const row = html.split(`data-invitation="${ownerMade.id}"`)[1].split('</li>')[0];
    expect(row).not.toContain('Cancel invitation');
    expect(row).toContain('Only an owner can cancel this invitation.');
    as(owner);
    const pl = await render('pl');
    expect(pl).toContain('Zaproś osobę');
    expect(pl).toContain('Anuluj zaproszenie');
  });

  it('is a 403 for a sommelier and for the owner of another restaurant', async () => {
    as(sommelier);
    await expect(render()).rejects.toBeInstanceOf(state().ForbiddenSignal);
    as(anna);
    await expect(render()).rejects.toBeInstanceOf(state().ForbiddenSignal);
    as(owner);
  });
});
