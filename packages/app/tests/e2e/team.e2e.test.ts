import { DEMO_PASSWORD } from '@wine-match/core';
import { describe, expect, inject, it } from 'vitest';
import { NEW_RESTAURANT, NEW_RESTAURANT_TEAM } from './new-restaurant';

/**
 * Spec E12 F1 (team and audit) on PostgreSQL, through the built app with plain `fetch` and real sessions: the owner of
 * Bistro E2E (made by `restaurant:create`) with a general manager and a Wine Director (made by `user:create`). Access
 * changes are put back at the end of each test, so the other files see the restaurant as it was made.
 */
describe('team management on PostgreSQL', () => {
  const baseUrl = () => inject('e2e').baseUrl;
  const origin = () => new URL(baseUrl()).origin;
  const slug = NEW_RESTAURANT.slug;

  type Session = { cookie: string; csrf: string };
  async function signIn(email: string, password: string): Promise<Session> {
    const res = await fetch(`${baseUrl()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email, password }) });
    expect(res.status, `sign in ${email}`).toBe(200);
    const token = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    return { cookie: `wm_session=${token}`, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
  }
  const owner = () => signIn(NEW_RESTAURANT.ownerEmail, NEW_RESTAURANT.password);
  const manager = () => signIn(NEW_RESTAURANT_TEAM.manager.email, NEW_RESTAURANT_TEAM.password);
  const sommelier = () => signIn(NEW_RESTAURANT_TEAM.sommelier.email, NEW_RESTAURANT_TEAM.password);

  const get = (path: string, s: Session) => fetch(`${baseUrl()}${path}`, { headers: { cookie: s.cookie }, redirect: 'manual' });
  const patch = (s: Session, membershipId: string, body: unknown, version: number | null, forSlug = slug) =>
    fetch(`${baseUrl()}/api/v1/restaurants/${forSlug}/team/${membershipId}`, {
      method: 'PATCH',
      headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, origin: origin(), 'content-type': 'application/json', ...(version === null ? {} : { 'if-match': `"${version}"` }) },
      body: JSON.stringify(body)
    });
  type Member = { membershipId: string; email: string; role: string; status: string; version: number; name: string };
  async function team(s: Session, forSlug = slug): Promise<Member[]> {
    const res = await get(`/api/v1/restaurants/${forSlug}/team`, s);
    expect(res.status).toBe(200);
    return ((await res.json()) as { members: Member[] }).members;
  }
  const member = async (s: Session, email: string) => (await team(s)).find((m) => m.email === email)!;
  const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  it('an owner removes a manager\'s access: the manager\'s open session loses the dashboard and the API at once, and gets them back on reactivation', async () => {
    const o = await owner();
    const m = await manager();
    expect((await get(`/api/v1/restaurants/${slug}/pairings`, m)).status).toBe(200);
    expect((await get(`/admin/${slug}`, m)).status).toBe(200);

    const before = await member(o, NEW_RESTAURANT_TEAM.manager.email);
    expect(before).toMatchObject({ role: 'manager', status: 'active', version: 1 });
    const off = await patch(o, before.membershipId, { status: 'deactivated' }, before.version);
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ status: 'deactivated', version: 2 });

    // the same cookie, no new sign-in
    expect((await get(`/api/v1/restaurants/${slug}/pairings`, m)).status).toBe(403);
    expect((await get(`/api/v1/restaurants/${slug}/team`, m)).status).toBe(403);
    expect((await get(`/admin/${slug}`, m)).status).toBe(403);
    // and a new sign-in is refused: no restaurant gives this account the dashboard
    const again = await fetch(`${baseUrl()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: NEW_RESTAURANT_TEAM.manager.email, password: NEW_RESTAURANT_TEAM.password }) });
    expect(again.status).toBe(403);
    expect(await code(again)).toBe('no_panel_access');

    const on = await patch(o, before.membershipId, { status: 'active' }, 2);
    expect(on.status).toBe(200);
    expect((await get(`/api/v1/restaurants/${slug}/pairings`, m)).status).toBe(200);
    expect((await get(`/admin/${slug}`, m)).status).toBe(200);
    expect(await member(o, NEW_RESTAURANT_TEAM.manager.email)).toMatchObject({ status: 'active', version: 3 });
  });

  it('the hierarchy holds over HTTP: a manager cannot touch the owner, grant owner or manager, or change themselves; a stale or missing version is refused', async () => {
    const o = await owner();
    const m = await manager();
    const owners = await member(m, NEW_RESTAURANT.ownerEmail);
    const son = await member(m, NEW_RESTAURANT_TEAM.sommelier.email);
    const self = await member(m, NEW_RESTAURANT_TEAM.manager.email);

    for (const res of [
      await patch(m, owners.membershipId, { role: 'sommelier' }, owners.version),
      await patch(m, owners.membershipId, { status: 'deactivated' }, owners.version),
      await patch(m, son.membershipId, { role: 'owner' }, son.version),
      await patch(m, son.membershipId, { role: 'manager' }, son.version)
    ]) {
      expect(res.status).toBe(403);
      expect(await code(res)).toBe('team_hierarchy');
    }
    const selfRes = await patch(m, self.membershipId, { status: 'deactivated' }, self.version);
    expect(selfRes.status).toBe(422);
    expect(await code(selfRes)).toBe('self_change');
    // an owner cannot remove their own access either: the restaurant keeps its owner
    const ownSelf = await patch(o, owners.membershipId, { status: 'deactivated' }, owners.version);
    expect(ownSelf.status).toBe(422);

    const noHeader = await patch(m, son.membershipId, { role: 'waiter' }, null);
    expect(noHeader.status).toBe(428);
    // a role change with the current version passes; the same version again is a conflict; nothing else moved
    expect((await patch(m, son.membershipId, { role: 'waiter' }, son.version)).status).toBe(200);
    const stale = await patch(m, son.membershipId, { role: 'sommelier' }, son.version);
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('version_conflict');
    expect((await patch(o, son.membershipId, { role: 'sommelier' }, son.version + 1)).status).toBe(200);
    expect(await member(o, NEW_RESTAURANT.ownerEmail)).toMatchObject({ role: 'owner', status: 'active', version: owners.version });
  });

  it('the team of one restaurant is closed to everyone else: a Wine Director and the manager of Halka get 403 for the list, a change and the page, and see none of its data', async () => {
    const o = await owner();
    const son = await member(o, NEW_RESTAURANT_TEAM.sommelier.email);
    const halkaManager = await signIn('tomasz@halka.pl', DEMO_PASSWORD);
    const sommelierSession = await sommelier();

    for (const s of [sommelierSession, halkaManager]) {
      const answers = [await get(`/api/v1/restaurants/${slug}/team`, s), await patch(s, son.membershipId, { role: 'manager' }, son.version), await get(`/admin/${slug}/team`, s)];
      for (const res of answers) {
        expect(res.status, res.url).toBe(403);
        const body = await res.text();
        for (const secret of [NEW_RESTAURANT_TEAM.sommelier.email, NEW_RESTAURANT.ownerEmail, NEW_RESTAURANT_TEAM.manager.email]) expect(body).not.toContain(secret);
      }
    }
    // the owner of Bistro E2E cannot read or change Halka's team either
    const halkaTeam = await get('/api/v1/restaurants/halka/team', o);
    expect(halkaTeam.status).toBe(403);
    expect(await halkaTeam.text()).not.toContain('marta@halka.pl');
    expect((await patch(o, son.membershipId, { role: 'manager' }, son.version, 'halka')).status).toBe(403);
    // Halka's manager can read Halka's team, which has no member of Bistro E2E
    const own = await team(halkaManager, 'halka');
    expect(own.map((x) => x.email)).toContain('tomasz@halka.pl');
    expect(own.map((x) => x.email)).not.toContain(NEW_RESTAURANT.ownerEmail);
    // a member of Halka addressed through Bistro E2E's slug is not found there
    const marta = own.find((x) => x.email === 'marta@halka.pl')!;
    expect((await patch(o, marta.membershipId, { status: 'deactivated' }, marta.version)).status).toBe(404);
    expect(await member(o, NEW_RESTAURANT_TEAM.sommelier.email)).toMatchObject({ role: 'sommelier', status: 'active' });
  });

  it('A15 is a plain HTML page for the owner: every member, a role form and a remove-access form per person, none for themselves', async () => {
    const o = await owner();
    const res = await get(`/admin/${slug}/team`, o);
    expect(res.status).toBe(200);
    const html = (await res.text()).replace(/<!-- -->/g, '');
    for (const name of [NEW_RESTAURANT.ownerName, NEW_RESTAURANT_TEAM.manager.name, NEW_RESTAURANT_TEAM.sommelier.name]) expect(html).toContain(name);
    const rows = html.split('data-member="').slice(1).map((r) => r.split('</li>')[0]);
    expect(rows).toHaveLength(3);
    const ownerRow = rows.find((r) => r.includes(NEW_RESTAURANT.ownerEmail))!;
    const managerRow = rows.find((r) => r.includes(NEW_RESTAURANT_TEAM.manager.email))!;
    expect(ownerRow).not.toContain('Remove access');
    expect(ownerRow).toContain('You cannot change your own role or access.');
    expect(managerRow).toContain('Remove access');
    expect(managerRow).toContain('name="role"');
    // the page needs no script to work: forms, not click handlers
    expect(managerRow).not.toMatch(/\sonclick=/);
    // the manager sees the page too, but the owner row is read-only for them
    const mHtml = (await (await get(`/admin/${slug}/team`, await manager())).text()).replace(/<!-- -->/g, '');
    const mOwnerRow = mHtml.split('data-member="').slice(1).map((r) => r.split('</li>')[0]).find((r) => r.includes(NEW_RESTAURANT.ownerEmail))!;
    expect(mOwnerRow).not.toContain('name="role"');
    expect(mOwnerRow).toContain('Only an owner can change an owner.');
    // the Wine Director has no team entry in the sidebar and a 403 on the page
    expect((await (await get(`/admin/${slug}`, await sommelier())).text())).not.toContain(`/admin/${slug}/team`);
    expect((await get(`/admin/${slug}`, o).then((r) => r.text()))).toContain(`/admin/${slug}/team`);
  });
});
