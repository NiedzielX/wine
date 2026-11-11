import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NEW_RESTAURANT } from './new-restaurant';
import { BISTRO, HALKA, assertTablesCovered, base, bistroOwner, bistroSommelier, callAction, db, digest, errorCode, get, halkaManager, halkaSommelier, members, origin, postForm, runAction, send, snapshotDatabase, stageImport, type Session } from './boundaries';

/**
 * Lesson 16 (security), docs/security/threat-model.md T-35 and T-36, part 3 of the access-boundary matrix.
 *  - T-35, mass assignment: every write route of `check:routes` and the panel's server actions get the fields a client must never set
 *    (`restaurantId`, `id`, `role`, `status`, `createdBy`, `version`, `published`, `approved` ...). A JSON body is refused whole by its
 *    `strictObject` schema (422, nothing written); a route without a body and a form action ignore what they do not read, and the row
 *    they change shows only the change they own (whole rows compared, the other tenant's tables by digest).
 *  - T-36, the remaining server actions: `inviteMember` (the `useActionState` action, called the way the client router calls it),
 *    `login` / `logout`, `setLanguage`, and `acceptInvitation` (another tenant's link while signed in to another account, an expired,
 *    a revoked and a used link, replay), each with positive controls, refusals and the state after.
 * The database is recorded first and put back at the end (the files share one database in sequence).
 */
const DOMAIN = 'bound-e2e.example';
const NIL = '00000000-0000-4000-8000-000000000000';
let marta: Session; let tomasz: Session; let anna: Session; let sonia: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
let bistroId: string; let halkaId: string;

/** The fields a client must never set, with values that would do harm if they were taken. */
const EXTRAS = (other: string) => ({ restaurantId: other, restaurant: BISTRO, id: NIL, role: 'owner', status: 'approved', createdBy: NIL, version: 99, published: true, approved: true, updatedBy: 'planted', platform: true, slug: BISTRO });
const extrasExcept = (other: string, keep: string[]) => Object.fromEntries(Object.entries(EXTRAS(other)).filter(([k]) => !keep.includes(k)));
/** Every table of the schema (sessions and usage events included; `assertTablesCovered()` in beforeAll proves none is missing). */
const state = digest;
const row = async (table: string, id: string) => (await queryDatabase<{ j: Record<string, unknown> }>(db(), `select to_jsonb(x) as j from ${table} x where id = $1`, [id]))[0]?.j;
/** The columns that differ between two whole rows. */
const changed = (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).sort();
const bistroTables = async () => (await queryDatabase<{ d: string }>(db(), `select md5(coalesce((select string_agg(x::text, '|' order by x::text) from dish x where restaurant_id = $1), '') || coalesce((select string_agg(x::text, '|' order by x::text) from wine x where restaurant_id = $1), '') || coalesce((select string_agg(x::text, '|' order by x::text) from pairing x where restaurant_id = $1), '') || coalesce((select string_agg(x::text, '|' order by x::text) from restaurant x where id = $1), '') || coalesce((select string_agg(x::text, '|' order by x::text) from published_version x where restaurant_id = $1), '')) as d`, [bistroId]))[0]!.d;
const sessionsOf = async (email: string) => (await queryDatabase<{ id: string }>(db(), `select s.id from session s join app_user u on u.id = s.user_id where u.email = $1 order by s.id`, [email])).map((r) => r.id);
type Pairing = { id: string; dishId: string; wineId: string; version: number; status: string; role: string | null };
const pairingsOf = async (s: Session, slug: string) => ((await (await get(s, `/api/v1/restaurants/${slug}/pairings`)).json()) as { data: Pairing[] }).data;

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [marta, tomasz, anna, sonia] = await Promise.all([halkaSommelier(), halkaManager(), bistroOwner(), bistroSommelier()]);
  const bistroDishes = await queryDatabase<{ n: string }>(db(), `select count(*)::text as n from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1`, [BISTRO]);
  if (bistroDishes[0]!.n === '0') {
    for (const kind of ['wines', 'menu'] as const) {
      const job = await stageImport(anna, BISTRO, kind);
      expect((await send(anna, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${BISTRO}`, {})).status).toBe(200);
    }
  }
  halkaId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [HALKA]))[0]!.id;
  bistroId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [BISTRO]))[0]!.id;
  await assertTablesCovered();
});
// a failed snapshot leaves `restoreDatabase` unset: the real error of beforeAll is the one reported
afterAll(async () => { if (restoreDatabase) await restoreDatabase(); });

describe('access boundaries, part 3: mass assignment (T-35), the remaining server actions (T-36)', () => {
  it('T-35: every JSON write route refuses fields outside its schema (422, top level and nested) and writes nothing; the same body without them works (positive control)', async () => {
    const wine = (await queryDatabase<{ id: string }>(db(), 'select id from wine where restaurant_id = $1 order by name limit 1', [halkaId]))[0]!.id;
    const ps = await pairingsOf(marta, HALKA);
    const p = ps.find((x) => x.status === 'suggested')!;
    const dishes = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and status = 'published' order by name limit 2`, [halkaId])).map((d) => d.id);
    const free = (await queryDatabase<{ d: string; w: string }>(db(), `select d.id as d, w.id as w from dish d cross join wine w where d.restaurant_id = $1 and w.restaurant_id = $1 and d.status = 'published' and w.active and not exists (select 1 from pairing p where p.dish_id = d.id and p.wine_id = w.id) limit 1`, [halkaId]))[0]!;
    const job = await stageImport(tomasz, HALKA, 'wines');
    const bMember = (await members(anna, BISTRO)).find((m) => m.role === 'sommelier')!;
    type Case = { name: string; who: Session; method: string; path: string; body: Record<string, unknown>; extras: Record<string, unknown>; nested?: (extra: Record<string, unknown>) => Record<string, unknown>; headers?: () => Promise<Record<string, string>>; ok: number[] };
    const cases: Case[] = [
      { name: 'PATCH wine', who: marta, method: 'PATCH', path: `/api/v1/wines/${wine}?restaurant=${HALKA}`, body: { active: true }, extras: EXTRAS(bistroId), ok: [200] },
      { name: 'POST pairing', who: marta, method: 'POST', path: `/api/v1/pairings?restaurant=${HALKA}`, body: { dishId: free.d, wineId: free.w, comment: 'mass assignment control' }, extras: EXTRAS(bistroId), ok: [201] },
      { name: 'PATCH pairing', who: marta, method: 'PATCH', path: `/api/v1/pairings/${p.id}?restaurant=${HALKA}`, body: { comment: 'mass assignment control' }, extras: extrasExcept(bistroId, ['role', 'status']), headers: async () => ({ 'if-match': `"${(await pairingsOf(marta, HALKA)).find((x) => x.id === p.id)!.version}"` }), ok: [200] },
      { name: 'POST bulk decision', who: marta, method: 'POST', path: `/api/v1/restaurants/${HALKA}/pairings/bulk-decision`, body: { action: 'approve_all', dishId: dishes[0] }, extras: EXTRAS(bistroId), ok: [200] },
      { name: 'POST invitation', who: tomasz, method: 'POST', path: `/api/v1/restaurants/${HALKA}/invitations`, body: { email: `mass@${DOMAIN}`, role: 'sommelier' }, extras: extrasExcept(bistroId, ['role']), ok: [201] },
      { name: 'PATCH member', who: anna, method: 'PATCH', path: `/api/v1/restaurants/${BISTRO}/team/${bMember.membershipId}`, body: { role: 'manager' }, extras: extrasExcept(halkaId, ['role', 'status', 'restaurant', 'slug']), headers: async () => ({ 'if-match': `"${(await members(anna, BISTRO)).find((m) => m.membershipId === bMember.membershipId)!.version}"` }), ok: [200] },
      { name: 'PATCH import rows', who: tomasz, method: 'PATCH', path: `/api/v1/imports/${job.id}/rows?restaurant=${HALKA}`, body: { rows: [{ rowNumber: 1, include: true }] }, extras: EXTRAS(bistroId), nested: (x) => ({ rows: [{ rowNumber: 1, include: true, ...x }] }), ok: [200] },
      { name: 'POST recommendations/table (public)', who: marta, method: 'POST', path: '/api/v1/recommendations/table', body: { restaurantSlug: HALKA, dishIds: dishes }, extras: extrasExcept(bistroId, []), nested: (x) => ({ restaurantSlug: HALKA, dishIds: dishes, preferences: { serving: 'bottle', ...x } }), ok: [200] },
      { name: 'POST import confirm', who: tomasz, method: 'POST', path: `/api/v1/imports/${job.id}/confirm?restaurant=${HALKA}`, body: {}, extras: EXTRAS(bistroId), nested: (x) => ({ rows: [{ rowNumber: 1, include: true, ...x }] }), ok: [200] }
    ];
    for (const c of cases) {
      const before = await state();
      const headers = c.headers ? await c.headers() : {};
      for (const [how, body] of [['top level', { ...c.body, ...c.extras }], ...(c.nested ? [['nested', c.nested(c.extras)]] : [])] as const) {
        const res = await send(c.who, c.method, c.path, body, headers);
        expect(res.status, `${c.name}, extra fields ${how}`).toBe(422);
        expect(await errorCode(res), `${c.name}, extra fields ${how}`).toBe('validation_failed');
      }
      // one field at a time, too: none of them slips through on its own
      for (const [k, v] of Object.entries(c.extras)) expect((await send(c.who, c.method, c.path, { ...c.body, [k]: v }, headers)).status, `${c.name} + ${k}`).toBe(422);
      expect(await state(), `${c.name}: nothing written`).toEqual(before);
      const res = await send(c.who, c.method, c.path, c.body, c.headers ? await c.headers() : {});
      expect(c.ok, `${c.name}: positive control ${await res.clone().text()}`).toContain(res.status);
    }
    // the member's role goes back (the later cases need Bistro's Wine Director)
    const back = (await members(anna, BISTRO)).find((m) => m.membershipId === bMember.membershipId)!;
    expect((await send(anna, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${back.membershipId}`, { role: 'sommelier' }, { 'if-match': `"${back.version}"` })).status).toBe(200);
    // sign-in: extra fields are refused before the password is checked; nothing is written (no session, no auth event)
    const before = await state();
    const login = await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'tomasz@halka.pl', password: DEMO_PASSWORD, role: 'owner', platform: true, restaurantId: bistroId }) });
    expect(login.status).toBe(422);
    expect(login.headers.get('set-cookie')).toBeNull();
    expect(await state()).toEqual(before);
    // positive control: the same body without the extra fields signs in (200, a session cookie, one new session row)
    const sessions = (await queryDatabase<{ n: number }>(db(), `select count(*)::int as n from session s join app_user u on u.id = s.user_id where u.email = 'tomasz@halka.pl'`, []))[0]!.n;
    const clean = await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'tomasz@halka.pl', password: DEMO_PASSWORD }) });
    expect(clean.status).toBe(200);
    expect(clean.headers.get('set-cookie')).toMatch(/wm_session=[^;]/);
    expect((await queryDatabase<{ n: number }>(db(), `select count(*)::int as n from session s join app_user u on u.id = s.user_id where u.email = 'tomasz@halka.pl'`, []))[0]!.n).toBe(sessions + 1);
  });

  it('T-35: write routes without a body and the panel\'s form actions ignore fields they do not read: the row they change shows only their own change, the other tenant is untouched', async () => {
    const B0 = await bistroTables();
    // publish: a body pointing at another restaurant and a version number is ignored; Halka gets the next version, Bistro nothing
    const lastHalka = Number((await queryDatabase<{ n: string }>(db(), 'select coalesce(max(number), 0)::text as n from published_version where restaurant_id = $1', [halkaId]))[0]!.n);
    const free = (await queryDatabase<{ d: string; w: string }>(db(), `select d.id as d, w.id as w from dish d cross join wine w where d.restaurant_id = $1 and w.restaurant_id = $1 and d.status = 'published' and w.active and not exists (select 1 from pairing p where p.dish_id = d.id and p.wine_id = w.id) limit 1`, [halkaId]))[0]!;
    expect((await send(marta, 'POST', `/api/v1/pairings?restaurant=${HALKA}`, { dishId: free.d, wineId: free.w })).status).toBe(201);
    const pub = await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, EXTRAS(bistroId));
    expect(pub.status).toBe(201);
    expect(((await pub.json()) as { number: number }).number).toBe(lastHalka + 1);
    // delete an invitation and cancel an import with a body: only that row goes
    const inv = await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/invitations`, { email: `ignored@${DOMAIN}`, role: 'sommelier' });
    const invId = ((await inv.json()) as { id: string }).id;
    const tokensBefore = (await queryDatabase<{ id: string; j: unknown }>(db(), `select id, to_jsonb(x) as j from auth_token x where id <> $1 order by id`, [invId]));
    expect((await send(tomasz, 'DELETE', `/api/v1/restaurants/${HALKA}/invitations/${invId}`, EXTRAS(bistroId))).status).toBe(204);
    expect(await queryDatabase(db(), `select id, to_jsonb(x) as j from auth_token x where id <> $1 order by id`, [invId])).toEqual(tokensBefore);
    // upload: extra multipart fields (restaurantId, restaurant) are ignored; the job belongs to the slug of the URL
    const form = new FormData();
    form.append('file', new File([await (await fetch(`${base()}/api/v1/import-samples/wines`)).text()], 'mass.csv', { type: 'text/csv' }));
    for (const [k, v] of Object.entries(EXTRAS(bistroId))) form.append(k, String(v));
    const up = await fetch(`${base()}/api/v1/imports/wines?restaurant=${HALKA}`, { method: 'POST', body: form, headers: { cookie: tomasz.cookie, 'x-csrf-token': tomasz.csrf, origin: origin() } });
    expect(up.status).toBe(201);
    const jobId = ((await up.json()) as { id: string }).id;
    expect((await row('import_job', jobId))!.restaurant_id).toBe(halkaId);

    // form actions: whole rows before and after
    const wine = (await queryDatabase<{ id: string }>(db(), 'select id from wine where restaurant_id = $1 and active order by name limit 1', [halkaId]))[0]!.id;
    const w0 = await row('wine', wine);
    expect((await runAction(marta, 'setWineAvailability', HALKA, { wineId: wine, active: 'false', ...stringify(EXTRAS(bistroId)), name: 'planted', glassPrice: '1' })).location).toMatch(/saved=wine_hidden/);
    expect(changed(w0, await row('wine', wine)), 'wine: only availability (and its bookkeeping)').toEqual(expect.arrayContaining(['active']));
    expect(changed(w0, await row('wine', wine)).filter((k) => !['active', 'updated_at', 'version'].includes(k))).toEqual([]);

    // an approved pairing: a note on a suggestion would approve it first (pairing-rules), which moves its role and rank by design
    const p = (await pairingsOf(marta, HALKA)).find((x) => x.status === 'approved')!;
    const p0 = await row('pairing', p.id);
    expect((await runAction(marta, 'savePairingNote', HALKA, { pairingId: p.id, comment: 'mass note', version: String(p.version), ...stringify(extrasExcept(bistroId, ['version'])), rank: '1', source: 'engine', modelScore: '100', dishId: free.d })).location).toMatch(/saved=/);
    const p1 = await row('pairing', p.id);
    expect(changed(p0, p1).filter((k) => !['comment', 'status', 'dirty', 'updated_at', 'updated_by', 'version'].includes(k)), 'pairing: only the note (and the status a note implies)').toEqual([]);
    expect(p1!.status, 'a note makes a decision `modified`, never the planted `approved`').toBe('modified');
    expect([p1!.role, p1!.rank]).toEqual([p0!.role, p0!.rank]);

    const r0 = await row('restaurant', halkaId);
    const details = { name: String(r0!.name), address: String(r0!.address), city: String(r0!.city), wineDirector: String(r0!.wine_director) };
    expect((await runAction(tomasz, 'saveRestaurantDetails', HALKA, { ...details, ...stringify(EXTRAS(bistroId)), settings: '{"showScores":false}', status: 'suspended', publishedAt: '2000-01-01' })).location).toMatch(/saved=details/);
    expect(changed(r0, await row('restaurant', halkaId)).filter((k) => !['updated_at', 'version'].includes(k)), 'restaurant: nothing but the same details').toEqual([]);
    expect((await runAction(marta, 'saveGuestSettings', HALKA, { showScores: 'on', showUnreviewed: 'on', ...stringify(EXTRAS(bistroId)), name: 'planted' })).location).toMatch(/saved=settings/);
    expect(changed(r0, await row('restaurant', halkaId)).filter((k) => !['updated_at', 'version', 'settings'].includes(k))).toEqual([]);

    const m = (await members(anna, BISTRO)).find((x) => x.role === 'sommelier')!;
    const m0 = await row('membership', m.membershipId);
    expect((await runAction(anna, 'changeMemberRole', BISTRO, { membershipId: m.membershipId, role: 'manager', version: String(m.version), status: 'deactivated', restaurantId: halkaId, userId: NIL, platform: 'true' })).location).toMatch(/saved=member_role_changed/);
    const m1 = await row('membership', m.membershipId);
    expect(changed(m0, m1).filter((k) => !['role', 'updated_at', 'version'].includes(k)), 'membership: only the role').toEqual([]);
    expect(m1).toMatchObject({ role: 'manager', status: 'active', restaurant_id: bistroId });
    // put the Bistro member back (the tenant check below compares Bistro with its state at the start)
    expect((await runAction(anna, 'changeMemberRole', BISTRO, { membershipId: m.membershipId, role: 'sommelier', version: String(m1!.version) })).location).toMatch(/saved=/);
    expect(await bistroTables(), 'no dish, wine, pairing, restaurant row or published version of Bistro changed').toBe(B0);
  });

  it('T-36: inviteMember (useActionState): both restaurants\' managers invite in their own; another slug, a Wine Director, no session and a role above your own are refused and leave no invitation', async () => {
    const invite = (s: Session | undefined, slug: string, fields: Record<string, string>) => {
      const form = new FormData();
      for (const [k, v] of Object.entries({ slug, back: `/admin/${slug}/team`, ...fields })) form.append(k, v);
      return callAction(s, 'inviteMember', `/admin/${slug}/team`, [{ status: 'idle' }, form]);
    };
    sonia = await bistroSommelier(); // the role change and back in T-35 ended her earlier session
    const tokens = async () => queryDatabase<{ email: string; restaurant_id: string; role: string }>(db(), `select email, restaurant_id, role from auth_token where email like $1 order by email`, [`%@${DOMAIN}`]);
    // positive controls, both restaurants: the answer carries the link once, the invitation is in that restaurant with that role
    for (const [s, slug, rid] of [[tomasz, HALKA, halkaId], [anna, BISTRO, bistroId]] as const) {
      const email = `ok-${slug}@${DOMAIN}`;
      const r = await invite(s, slug, { email, role: 'sommelier', restaurantId: slug === HALKA ? bistroId : halkaId, platform: 'true' });
      expect(r.status, `${slug} invite`).toBe(200);
      expect(r.text, `${slug} invite`).toContain('"status":"created"');
      expect(r.text).toContain('/admin/accept?token=');
      expect((await tokens()).filter((t) => t.email === email)).toEqual([{ email, restaurant_id: rid, role: 'sommelier' }]);
    }
    const before = await state();
    const t0 = await tokens();
    for (const [who, s, slug, fields, code] of [
      ['Halka manager on Bistro', tomasz, BISTRO, { email: `x1@${DOMAIN}`, role: 'sommelier' }, 'forbidden'],
      ['Bistro owner on Halka', anna, HALKA, { email: `x2@${DOMAIN}`, role: 'sommelier' }, 'forbidden'],
      ['Halka Wine Director', marta, HALKA, { email: `x3@${DOMAIN}`, role: 'sommelier' }, 'forbidden'],
      ['Bistro Wine Director', sonia, BISTRO, { email: `x4@${DOMAIN}`, role: 'sommelier' }, 'forbidden'],
      ['Halka manager grants owner', tomasz, HALKA, { email: `x5@${DOMAIN}`, role: 'owner' }, '']
    ] as const) {
      const r = await invite(s, slug, fields);
      expect(r.text, who).toContain('"status":"error"');
      if (code) expect(r.text, who).toContain(`"error":"${code}"`);
      expect(r.text, who).not.toContain('/admin/accept?token=');
    }
    const anonymous = await invite(undefined, HALKA, { email: `x6@${DOMAIN}`, role: 'sommelier' });
    expect(anonymous.redirect, 'no session: to sign in').toContain('/admin/login');
    expect(await tokens()).toEqual(t0);
    expect(await state()).toEqual(before);
  });

  it('T-36: login, logout and the language switch: a wrong password or an outside `next` gets nothing; logout ends only the caller\'s own session; the language switch touches no data', async () => {
    const email = 'tomasz@halka.pl';
    // positive control: the right password signs in (one new session) and goes to the caller's restaurant
    const s0 = await sessionsOf(email);
    const ok = await postForm(undefined, 'login', '/admin/login', [['email', email], ['password', DEMO_PASSWORD], ['next', 'https://evil.example/admin'], ['role', 'owner'], ['restaurant', BISTRO]]);
    expect(ok.location, 'an outside next is not followed').toBe(`/admin/${HALKA}`);
    expect(ok.setCookie).toMatch(/wm_session=/);
    const s1 = await sessionsOf(email);
    expect(s1.length).toBe(s0.length + 1);
    const cookie = `wm_session=${/wm_session=([^;]+)/.exec(ok.setCookie)![1]}`;
    expect((await fetch(`${base()}/admin/${BISTRO}`, { headers: { cookie }, redirect: 'manual' })).status, 'extra fields at sign-in grant nothing').toBe(403);
    // refused: a wrong password, an unknown account (the same answer), no session made, nothing written
    const before = await state();
    const user0 = await queryDatabase<{ j: Record<string, unknown> }>(db(), 'select to_jsonb(x) as j from app_user x where email = $1', [email]);
    const wrong = await postForm(undefined, 'login', '/admin/login', [['email', email], ['password', 'wrong-password-2026']]);
    const unknown = await postForm(undefined, 'login', '/admin/login', [['email', `nobody@${DOMAIN}`], ['password', 'wrong-password-2026']]);
    expect(wrong.location).toBe('/admin/login?error=invalid_credentials');
    expect(unknown.location).toBe(wrong.location);
    expect(wrong.setCookie + unknown.setCookie).not.toMatch(/wm_session=[^;]/);
    const after = await state();
    // the failed attempt is counted on the account (lockout) and logged as an auth event; nothing else moves, and no session is made
    expect({ ...after, auth_event: before.auth_event, app_user: before.app_user }, 'a failed sign-in writes no session and changes no data').toEqual(before);
    const user1 = await queryDatabase<{ j: Record<string, unknown> }>(db(), 'select to_jsonb(x) as j from app_user x where email = $1', [email]);
    expect(changed(user0[0]!.j, user1[0]!.j).filter((k) => !['failed_attempts', 'locked_until', 'updated_at'].includes(k)), 'only the failed-attempt counter of the account').toEqual([]);
    await queryDatabase(db(), 'update app_user set failed_attempts = 0, locked_until = null where email = $1', [email]);
    // logout: with a planted `token` field naming another session, only the caller's own session ends
    const other = await halkaManager();
    const s2 = await sessionsOf(email);
    const out = await postForm(cookie, 'logout', `/admin/${HALKA}`, [['token', other.cookie.split('=')[1]!], ['userId', NIL]]);
    expect(out.location).toBe('/admin/login');
    const s3 = await sessionsOf(email);
    expect(s3.length, 'one session ended').toBe(s2.length - 1);
    expect((await get(other, '/api/v1/auth/me')).status, 'the other session lives').toBe(200);
    expect((await fetch(`${base()}/api/v1/auth/me`, { headers: { cookie } })).status, 'the caller\'s own session is gone').toBe(401);
    const noSession = await state();
    expect((await postForm(undefined, 'logout', '/admin/login', [['token', other.cookie.split('=')[1]!]])).location).toBe('/admin/login');
    expect(await state(), 'a sign-out without a session ends nothing').toEqual(noSession);
    // language: only pl/en, only a dashboard path to go back to, no data and no session touched
    const lang = await state();
    const en = await postForm(other.cookie, 'setLanguage', '/admin/login', [['lang', 'en'], ['back', `/admin/${HALKA}/menu`]]);
    expect(en.setCookie).toMatch(/wm_lang=en/);
    expect(en.location).toBe(`/admin/${HALKA}/menu`);
    for (const [l, back] of [['xx', 'https://evil.example/'], ['en', '//evil.example/admin']] as const) {
      const r = await postForm(other.cookie, 'setLanguage', '/admin/login', [['lang', l], ['back', back], ['restaurantId', bistroId]]);
      expect(r.location, `${l} ${back}`).toMatch(/^\/admin(\/login)?$/);
      if (l === 'xx') expect(r.setCookie).not.toMatch(/wm_lang=/);
    }
    expect(await state(), 'the language switch writes nothing').toEqual(lang);
  });

  it('T-36: accepting an invitation: another tenant\'s link refuses a signed-in other account and an anonymous caller; expired, revoked and used links are dead; replay after success grants nothing', async () => {
    const accept = (cookie: string | undefined, token: string, extra: Array<[string, string]> = []) => postForm(cookie, 'acceptInvitation', '/admin/accept', [['token', token], ['name', 'Bound Person'], ['password', 'e2e-bound-passphrase-2026'], ...extra]);
    const issue = async (s: Session, slug: string, email: string, role = 'sommelier') => {
      const r = await send(s, 'POST', `/api/v1/restaurants/${slug}/invitations`, { email, role });
      expect(r.status, `invite ${email}`).toBe(201);
      const body = (await r.json()) as { id: string; link: string };
      return { id: body.id, token: new URL(body.link).searchParams.get('token')! };
    };
    const membershipsOf = async (email: string) => queryDatabase<{ slug: string; role: string }>(db(), `select r.slug, m.role from membership m join app_user u on u.id = m.user_id join restaurant r on r.id = m.restaurant_id where u.email = $1 order by r.slug`, [email]);
    // Halka invites the owner of Bistro E2E (an existing account of another tenant)
    const toAnna = await issue(tomasz, HALKA, NEW_RESTAURANT.ownerEmail);
    const before = await state();
    // refused: nobody signed in, and signed in as someone else (Halka's own Wine Director, Bistro's Wine Director)
    expect((await accept(undefined, toAnna.token)).location).toContain('error=sign_in_required');
    expect((await accept(marta.cookie, toAnna.token)).location).toContain('error=wrong_account');
    expect((await accept(sonia.cookie, toAnna.token, [['restaurant', HALKA], ['role', 'owner']])).location).toContain('error=wrong_account');
    expect(await state(), 'refused attempts write nothing').toEqual(before);
    expect(await membershipsOf(NEW_RESTAURANT.ownerEmail)).toEqual([{ slug: BISTRO, role: 'owner' }]);
    // expired and revoked links are dead, with the same answer as an unknown one
    const expired = await issue(tomasz, HALKA, `expired@${DOMAIN}`);
    await queryDatabase(db(), `update auth_token set expires_at = now() - interval '1 minute' where id = $1`, [expired.id]);
    const revoked = await issue(tomasz, HALKA, `revoked@${DOMAIN}`);
    expect((await send(tomasz, 'DELETE', `/api/v1/restaurants/${HALKA}/invitations/${revoked.id}`)).status).toBe(204);
    const dead = await state();
    for (const [what, token] of [['expired', expired.token], ['revoked', revoked.token], ['unknown', `${expired.token.slice(0, -4)}aaaa`]] as const) {
      expect((await accept(undefined, token)).location, what).toBe('/admin/accept?error=invalid_token');
    }
    expect(await state(), 'dead links write nothing').toEqual(dead);
    // positive control: the right account accepts, joins Halka with the invited role, keeps Bistro; replay of the used link grants nothing
    const ok = await accept(anna.cookie, toAnna.token, [['role', 'owner'], ['restaurantId', bistroId]]);
    expect(ok.location).toBe(`/admin/${HALKA}`);
    expect(await membershipsOf(NEW_RESTAURANT.ownerEmail)).toEqual([{ slug: BISTRO, role: 'owner' }, { slug: HALKA, role: 'sommelier' }]);
    const used = await state();
    for (const cookie of [anna.cookie, undefined, tomasz.cookie]) expect((await accept(cookie, toAnna.token)).location).toBe('/admin/accept?error=invalid_token');
    expect(await state(), 'replay writes nothing').toEqual(used);
    // a new account from a Bistro link lands in Bistro only, whatever the form adds; its link is then spent
    const fresh = await issue(anna, BISTRO, `fresh@${DOMAIN}`);
    const made = await accept(undefined, fresh.token, [['restaurant', HALKA], ['role', 'owner'], ['restaurantId', halkaId]]);
    expect(made.location).toBe(`/admin/${BISTRO}`);
    expect(await membershipsOf(`fresh@${DOMAIN}`)).toEqual([{ slug: BISTRO, role: 'sommelier' }]);
    const freshSession = `wm_session=${/wm_session=([^;]+)/.exec(made.setCookie)![1]}`;
    const spent = await state();
    expect((await accept(freshSession, fresh.token)).location).toBe('/admin/accept?error=invalid_token');
    expect((await accept(freshSession, toAnna.token)).location).toBe('/admin/accept?error=invalid_token');
    expect(await state()).toEqual(spent);
    expect((await fetch(`${base()}/admin/${HALKA}`, { headers: { cookie: freshSession }, redirect: 'manual' })).status, 'the new account has no Halka access').toBe(403);
  });
});

/** Extra fields for a form action: as strings, without `slug` (the action's own key, which a form field would replace). */
function stringify(o: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'slug').map(([k, v]) => [k, String(v)]));
}
