import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { NEW_RESTAURANT, NEW_RESTAURANT_TEAM } from './new-restaurant';

/**
 * Spec E12 F2 (invitations) on PostgreSQL, through the built app with plain `fetch`: the API with real sessions, and the two
 * screens as a browser WITHOUT JavaScript uses them (the page as HTML, the form posted as multipart with its hidden fields, the
 * server action id among them, and the site's own `Origin`). No browser tool is used. Everyone invited here gets an
 * `@invite-e2e.example` address (or is Tomasz of Halka, whose membership is removed again), and `afterAll` removes them, so the other files
 * see Bistro E2E as `global-setup.ts` made it.
 */
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const base = () => inject('e2e').baseUrl;
const origin = () => new URL(base()).origin;
const db = () => inject('e2e').databaseUrl;
const slug = NEW_RESTAURANT.slug;
const DOMAIN = 'invite-e2e.example';
const PASSWORD = 'e2e-invited-passphrase-2026';
const APP_LOG = fileURLToPath(new URL('../../test-results/e2e-app.log', import.meta.url));

type Session = { cookie: string; csrf: string };
async function signIn(email: string, password: string): Promise<Session> {
  const res = await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email, password }) });
  expect(res.status, `sign in ${email}`).toBe(200);
  const token = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  return { cookie: `wm_session=${token}`, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
}
const owner = () => signIn(NEW_RESTAURANT.ownerEmail, NEW_RESTAURANT.password);
const manager = () => signIn(NEW_RESTAURANT_TEAM.manager.email, NEW_RESTAURANT_TEAM.password);

const get = (path: string, s?: Session) => fetch(`${base()}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': 'en', ...(s ? { cookie: s.cookie } : {}) }, redirect: 'manual' });
const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const html = async (res: Response) => (await res.text()).replace(/<!-- -->/g, '');
/** The fields of the first form that contains `marker` (a field name), as the browser would send them: every input's name and value. */
function formFields(page: string, marker: string): Array<[string, string]> {
  const form = [...page.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(`name="${marker}"`));
  expect(form, `a form with a "${marker}" field`).toBeDefined();
  return [...form!.matchAll(/<input\b[^>]*>/g)].map((m) => {
    const attr = (n: string) => { const a = new RegExp(`\\s${n}="([^"]*)"`).exec(m[0]); return a ? unescape(a[1]) : undefined; };
    return [attr('name') ?? '', attr('value') ?? ''] as [string, string];
  }).filter(([n]) => n !== '');
}
const withField = (fields: Array<[string, string]>, name: string, value: string): Array<[string, string]> => (fields.some(([k]) => k === name) ? fields.map(([k, v]): [string, string] => [k, k === name ? value : v]) : [...fields, [name, value]]);
/** Posts a form the way a browser without JavaScript does; `extra` can make it a forged cross-site post. */
async function post(path: string, fields: Array<[string, string]>, extra: Record<string, string> = {}, s?: Session) {
  const body = new FormData();
  for (const [k, v] of fields) body.append(k, v);
  return fetch(`${base()}${path}`, { method: 'POST', body, redirect: 'manual', headers: { 'user-agent': SAFARI, origin: origin(), 'sec-fetch-site': 'same-origin', ...(s ? { cookie: s.cookie } : {}), ...extra } });
}
const api = (s: Session, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  fetch(`${base()}${path}`, { method, headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, origin: origin(), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
type Created = { id: string; email: string; role: string; link: string; expiresAt: string };
async function invite(s: Session, email: string, role = 'sommelier', forSlug = slug): Promise<Created> {
  const res = await api(s, 'POST', `/api/v1/restaurants/${forSlug}/invitations`, { email, role });
  expect(res.status, `invite ${email}`).toBe(201);
  return (await res.json()) as Created;
}
const mail = (n: string) => `${n}@${DOMAIN}`;
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;
/** The path and query of a link: the e2e talks to its own address, whatever PUBLIC_BASE_URL says. */
const pathOf = (link: string) => { const u = new URL(link); return `${u.pathname}${u.search}`; };
const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const sql = <T>(query: string, params: unknown[] = []) => queryDatabase<T>(db(), query, params);
const membersOf = (email: string) => sql<{ role: string; status: string }>(`select m.role, m.status from membership m join app_user u on u.id = m.user_id join restaurant r on r.id = m.restaurant_id where u.email = $1 and r.slug = $2`, [email, slug]);
const hashOf = async (email: string) => (await sql<{ password_hash: string }>('select password_hash from app_user where email = $1', [email]))[0]?.password_hash;

afterAll(async () => {
  await sql(`delete from membership where user_id in (select id from app_user where email like '%@${DOMAIN}')`);
  await sql(`delete from membership where user_id in (select id from app_user where email = 'tomasz@halka.pl') and restaurant_id in (select id from restaurant where slug = $1)`, [slug]);
  await sql(`delete from session where user_id in (select id from app_user where email like '%@${DOMAIN}')`);
  await sql(`delete from app_user where email like '%@${DOMAIN}'`);
  await sql(`delete from auth_token where email like '%@${DOMAIN}' or email = 'tomasz@halka.pl'`);
  await sql(`delete from auth_token where restaurant_id in (select id from restaurant where slug = 'halka') and kind = 'invite'`);
});

describe('invitations on PostgreSQL, without JavaScript', () => {
  it('the whole path: invite in A15, open the link (a plain form), set a password, land in the dashboard with the invited role; the link works once and only a hash is stored (AC7, AC9)', async () => {
    const o = await owner();
    // A15: the invite form is a plain form post; the link comes back in the response of the post and nowhere else
    const a15 = await html(await get(`/admin/${slug}/team`, o));
    const inviteFields = formFields(a15, 'email');
    expect(inviteFields.map(([k]) => k)).toEqual(expect.arrayContaining(['slug', 'back']));
    expect(inviteFields.some(([k]) => k.startsWith('$ACTION_'))).toBe(true);
    const made = await post(`/admin/${slug}/team`, withField(withField(inviteFields, 'email', mail('flow')), 'role', 'sommelier'), {}, o);
    expect(made.status).toBe(200);
    const madePage = await html(made);
    expect(madePage).toContain('data-invitation-link');
    const link = unescape(/id="invite-link"[^>]*value="([^"]+)"/.exec(madePage)?.[1] ?? '');
    expect(link).toMatch(/\/admin\/accept\?token=[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(link);
    // the link is shown once: the page loaded afterwards lists the invitation without it
    const again = await html(await get(`/admin/${slug}/team`, o));
    expect(again).toContain(mail('flow'));
    expect(again).toContain('Cancel invitation');
    expect(again).not.toContain(token);

    // only a hash in the table, in lower case, with the 72-hour expiry
    const row = (await sql<{ token_hash: string; email: string; role: string; used_at: Date | null; hours: string }>(`select token_hash, email, role, used_at, round(extract(epoch from expires_at - created_at) / 3600)::text as hours from auth_token where email = $1`, [mail('flow')]))[0];
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row).toMatchObject({ role: 'sommelier', used_at: null, hours: '72' });

    // A17: GET is only a form and says no to caches and referrers; opening it twice uses nothing up
    const open = await get(pathOf(link));
    expect(open.status).toBe(200);
    expect(open.headers.get('referrer-policy')).toBe('no-referrer');
    expect(open.headers.get('cache-control')).toMatch(/no-store/);
    expect(open.headers.get('set-cookie')).toBeNull();
    const accept = await html(open);
    expect(accept).toContain(mail('flow'));
    // the token is in the form (the holder's own link) and in no href or src the browser would fetch, so nothing passes it on
    expect(accept).not.toMatch(/(?:href|src)="[^"]*token=/);
    expect((await get(pathOf(link))).status).toBe(200);
    const fields = formFields(accept, 'password');
    expect(fields.find(([k]) => k === 'token')?.[1]).toBe(token);

    // the post sets the password, signs the person in and goes to the restaurant
    const done = await post('/admin/accept', withField(withField(fields, 'name', 'Flora Flow'), 'password', PASSWORD));
    expect(done.status).toBe(303);
    expect(done.headers.get('location')).toBe(`/admin/${slug}`);
    const cookie = /wm_session=([^;]+)/.exec(done.headers.get('set-cookie') ?? '')?.[1];
    expect(cookie).toBeTruthy();
    expect(done.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    const mine: Session = { cookie: `wm_session=${cookie}`, csrf: '' };
    expect((await get(`/admin/${slug}`, mine)).status).toBe(200);
    expect((await get(`/api/v1/restaurants/${slug}/pairings`, mine)).status).toBe(200);          // a Wine Director's right
    expect((await get(`/admin/${slug}/team`, mine)).status).toBe(403);                           // and not the team's
    expect(await membersOf(mail('flow'))).toEqual([{ role: 'sommelier', status: 'active' }]);
    // the password works on its own, and the hash is scrypt
    await signIn(mail('flow'), PASSWORD);
    expect(await hashOf(mail('flow'))).toMatch(/^scrypt\$/);

    // the same link again: one answer, in the page and in the post, and nothing new is made
    expect((await get(pathOf(link))).status).toBe(404);
    expect(await html(await get(pathOf(link)))).toContain('This link is not valid any more');
    const reuse = await post('/admin/accept', withField(withField(fields, 'name', 'Mallory'), 'password', 'another-long-passphrase-1'));
    expect(reuse.status).toBe(303);
    expect(reuse.headers.get('location')).toBe('/admin/accept?error=invalid_token');
    expect(reuse.headers.get('set-cookie')).toBeNull();
    expect(await sql('select 1 from app_user where email = $1', [mail('flow')])).toHaveLength(1);
    expect((await sql<{ used_at: Date | null }>('select used_at from auth_token where email = $1', [mail('flow')]))[0].used_at).not.toBeNull();

    // neither the token nor the address of the invited person is in the application's log
    const log = readFileSync(APP_LOG, 'utf8');
    expect(log).not.toContain(token);
    expect(log).not.toContain(mail('flow'));
  });

  it('an e-mail with an account and one without get the same answer from the inviter; the existing account must sign in, joins with the link and keeps its password (AC8)', async () => {
    const o = await owner();
    const shape = (c: Created) => ({ keys: Object.keys(c).sort(), role: c.role, link: c.link.replace(/token=.+$/, 'token=T').replace(/^https?:\/\/[^/]+/, ''), hours: Math.round((Date.parse(c.expiresAt) - Date.now()) / 3_600_000) });
    const known = await invite(o, 'tomasz@halka.pl');                            // Tomasz of Halka has an account
    const unknown = await invite(o, mail('unknown'));
    expect(shape(known)).toEqual(shape(unknown));
    const knownPage = await html(await get(pathOf(known.link)));
    expect(knownPage).toContain('already has an account');
    expect(knownPage).not.toContain('type="password"');

    // a forged post: the form of a new-account link with this token put in and a password to take over the account
    const newcomerPage = await html(await get(pathOf(unknown.link)));
    const forged = withField(withField(withField(formFields(newcomerPage, 'password'), 'token', tokenOf(known.link)), 'name', 'Mallory'), 'password', 'mallory-chosen-passphrase-1');
    const before = await hashOf('tomasz@halka.pl');
    const refused = await post('/admin/accept', forged);
    expect(refused.status).toBe(303);
    expect(refused.headers.get('location')).toBe(`/admin/accept?token=${tokenOf(known.link)}&error=sign_in_required`);
    expect(await hashOf('tomasz@halka.pl')).toBe(before);
    expect(await membersOf('tomasz@halka.pl')).toEqual([]);

    // signed in as Tomasz: the page offers a plain "join", the post adds the membership and nothing else
    const tomasz = await signIn('tomasz@halka.pl', DEMO_PASSWORD);
    const own = await html(await get(pathOf(known.link), tomasz));
    expect(own).toContain('does not change');
    expect(own).not.toContain('type="password"');
    const joined = await post('/admin/accept', withField(formFields(own, 'token'), 'password', 'ignored-new-passphrase-1'), {}, tomasz);
    expect(joined.status).toBe(303);
    expect(joined.headers.get('location')).toBe(`/admin/${slug}`);
    expect(joined.headers.get('set-cookie')).toBeNull();
    expect(await hashOf('tomasz@halka.pl')).toBe(before);
    expect(await membersOf('tomasz@halka.pl')).toEqual([{ role: 'sommelier', status: 'active' }]);
    await signIn('tomasz@halka.pl', DEMO_PASSWORD);                              // the old password still works
    // another signed-in account is told so and nothing changes
    const marek = await manager();
    const wrongPage = await html(await get(pathOf(unknown.link), marek));
    expect(wrongPage).not.toContain('You are signed in with another account');   // the invitee has no account: the form is for a new one
    expect((await sql('select 1 from app_user where email = $1', [mail('unknown')])).length).toBe(0);
  });

  it('dead links all look alike: cancelled, expired, an inviter who lost access, and a link of another restaurant; a cross-site forged post changes nothing (AC7, AC24)', async () => {
    const o = await owner();
    const m = await manager();
    // the fields of a real accept form (the action id among them), to post with another link's token
    const template = formFields(await html(await get(pathOf((await invite(o, mail('template'))).link))), 'password');
    const dead = async (link: string) => {
      expect((await get(pathOf(link))).status).toBe(404);
      const r = await post('/admin/accept', withField(withField(withField(template, 'token', tokenOf(link)), 'name', 'Z'), 'password', PASSWORD));
      expect(r.status).toBe(303);
      expect(r.headers.get('location')).toBe('/admin/accept?error=invalid_token');
    };
    // a pair of calls for an unknown token, to compare with
    await dead(`${base()}/admin/accept?token=${'x'.repeat(43)}`);

    const cancelled = await invite(o, mail('cancelled'));
    expect((await api(o, 'DELETE', `/api/v1/restaurants/${slug}/invitations/${cancelled.id}`)).status).toBe(204);
    await dead(cancelled.link);
    expect((await api(o, 'DELETE', `/api/v1/restaurants/${slug}/invitations/${cancelled.id}`)).status).toBe(404);

    const expired = await invite(o, mail('expired'));
    await sql(`update auth_token set expires_at = now() - interval '1 minute' where id = $1`, [expired.id]);
    await dead(expired.link);

    // an inviter who loses access takes the link with them, and gets it back with the access
    const byManager = await invite(m, mail('bymarek'));
    expect((await get(pathOf(byManager.link))).status).toBe(200);
    const team = ((await (await get(`/api/v1/restaurants/${slug}/team`, o)).json()) as { members: Array<{ membershipId: string; email: string; version: number }> }).members;
    const marek = team.find((x) => x.email === NEW_RESTAURANT_TEAM.manager.email)!;
    const patch = (version: number, status: string) => fetch(`${base()}/api/v1/restaurants/${slug}/team/${marek.membershipId}`, {
      method: 'PATCH', headers: { cookie: o.cookie, 'x-csrf-token': o.csrf, origin: origin(), 'content-type': 'application/json', 'if-match': `"${version}"` }, body: JSON.stringify({ status })
    });
    try {
      expect((await patch(marek.version, 'deactivated')).status).toBe(200);
      await dead(byManager.link);
    } finally {
      expect((await patch(marek.version + 1, 'active')).status).toBe(200);
    }
    expect(await sql('select 1 from app_user where email = $1', [mail('bymarek')])).toHaveLength(0);

    // a forged cross-site post of a valid form is refused and uses nothing up
    const valid = await invite(o, mail('forged'));
    const page = await html(await get(pathOf(valid.link)));
    const fields = withField(withField(formFields(page, 'password'), 'name', 'Forged'), 'password', PASSWORD);
    for (const extra of [{ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, { origin: 'https://evil.example' }]) {
      const forged = await post('/admin/accept', fields, extra);
      expect(forged.headers.get('location') ?? '').not.toContain(`/admin/${slug}`);
      expect(forged.headers.get('set-cookie')).toBeNull();
    }
    expect(await sql('select 1 from app_user where email = $1', [mail('forged')])).toHaveLength(0);
    expect((await get(pathOf(valid.link))).status).toBe(200);
    // ... and so is a forged post of the A15 invite form
    const a15 = await html(await get(`/admin/${slug}/team`, o));
    const inviteFields = withField(withField(formFields(a15, 'email'), 'email', mail('forged-invite')), 'role', 'sommelier');
    const forgedInvite = await post(`/admin/${slug}/team`, inviteFields, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, o);
    expect(forgedInvite.status).not.toBe(200);
    expect(await sql('select 1 from auth_token where email = $1', [mail('forged-invite')])).toHaveLength(0);
    // control: the same post from the site itself works
    expect((await post(`/admin/${slug}/team`, inviteFields, {}, o)).status).toBe(200);
    expect(await sql('select 1 from auth_token where email = $1', [mail('forged-invite')])).toHaveLength(1);

    // another restaurant's link (Halka's manager invites in Halka) is its own: it cannot be cancelled from here and no one here can invite there
    const t = await signIn('tomasz@halka.pl', DEMO_PASSWORD);
    const halka = await invite(t, mail('halka-guest'), 'sommelier', 'halka');
    expect((await api(o, 'DELETE', `/api/v1/restaurants/halka/invitations/${halka.id}`)).status).toBe(403);
    expect((await api(o, 'DELETE', `/api/v1/restaurants/${slug}/invitations/${halka.id}`)).status).toBe(404);
    expect((await api(o, 'POST', '/api/v1/restaurants/halka/invitations', { email: mail('x'), role: 'sommelier' })).status).toBe(403);
    expect((await api(t, 'POST', `/api/v1/restaurants/${slug}/invitations`, { email: mail('x'), role: 'sommelier' })).status).toBe(403);
    expect((await get(pathOf(halka.link))).status).toBe(200);
  });

  it('the invitation API refuses what the hierarchy and the team do: a manager inviting a manager, a person already in the team, a sommelier, no CSRF; the list never shows a link', async () => {
    const o = await owner();
    const m = await manager();
    const sommelier = await signIn(NEW_RESTAURANT_TEAM.sommelier.email, NEW_RESTAURANT_TEAM.password);
    const manage = async (s: Session, email: string, role: string) => api(s, 'POST', `/api/v1/restaurants/${slug}/invitations`, { email, role });
    for (const role of ['owner', 'manager']) {
      const r = await manage(m, mail('m-denied'), role);
      expect(r.status, role).toBe(403);
      expect(await code(r)).toBe('team_hierarchy');
    }
    expect((await manage(sommelier, mail('s-denied'), 'sommelier')).status).toBe(403);
    expect((await get(`/api/v1/restaurants/${slug}/invitations`, sommelier)).status).toBe(403);
    const taken = await manage(o, NEW_RESTAURANT_TEAM.sommelier.email.toUpperCase(), 'sommelier');
    expect(taken.status).toBe(409);
    expect(await code(taken)).toBe('already_member');
    expect((await manage(o, mail('waiter'), 'waiter')).status).toBe(422);
    expect((await fetch(`${base()}/api/v1/restaurants/${slug}/invitations`, { method: 'POST', headers: { cookie: o.cookie, origin: origin(), 'content-type': 'application/json' }, body: JSON.stringify({ email: mail('nocsrf'), role: 'sommelier' }) })).status).toBe(403);
    expect((await fetch(`${base()}/api/v1/restaurants/${slug}/invitations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect(await sql('select 1 from auth_token where email in ($1, $2, $3, $4)', [mail('m-denied'), mail('s-denied'), mail('waiter'), mail('nocsrf')])).toHaveLength(0);

    const made = await invite(o, mail('listed'), 'manager');
    const ownerList = await (await get(`/api/v1/restaurants/${slug}/invitations`, o)).text();
    expect(ownerList).toContain(mail('listed'));
    expect(ownerList).not.toContain(tokenOf(made.link));
    expect(ownerList).not.toMatch(/token|link/i);
    // a manager sees the invitation but may not cancel an owner's or a manager's
    const cancel = await api(m, 'DELETE', `/api/v1/restaurants/${slug}/invitations/${made.id}`);
    expect(cancel.status).toBe(403);
    expect(await code(cancel)).toBe('team_hierarchy');
    expect((await api(o, 'DELETE', `/api/v1/restaurants/${slug}/invitations/not-a-uuid`)).status).toBe(404);
    expect((await api(o, 'DELETE', `/api/v1/restaurants/${slug}/invitations/${made.id}`)).status).toBe(204);
  });

  it('two posts of one link at the same moment: one account and one membership, the other post gets the dead-link answer (AC24)', async () => {
    const o = await owner();
    const made = await invite(o, mail('race'), 'sommelier');
    const page = await html(await get(pathOf(made.link)));
    const fields = withField(withField(formFields(page, 'password'), 'name', 'Race Runner'), 'password', PASSWORD);
    const results = await Promise.all([post('/admin/accept', fields), post('/admin/accept', fields)]);
    const locations = results.map((r) => r.headers.get('location'));
    expect(locations.filter((l) => l === `/admin/${slug}`)).toHaveLength(1);
    expect(locations.filter((l) => l === '/admin/accept?error=invalid_token')).toHaveLength(1);
    expect(results.filter((r) => r.headers.get('set-cookie')?.includes('wm_session='))).toHaveLength(1);
    expect(await sql('select 1 from app_user where email = $1', [mail('race')])).toHaveLength(1);
    expect(await membersOf(mail('race'))).toHaveLength(1);
  });
});
