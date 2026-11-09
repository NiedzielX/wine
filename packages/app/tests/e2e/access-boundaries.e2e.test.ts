import { queryDatabase } from '@wine-match/testkit';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { NEW_RESTAURANT, NEW_RESTAURANT_TEAM } from './new-restaurant';
import { BISTRO, HALKA, type Member, type Session, base, bistroManager, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, members, origin, payload, sampleCsv, send, signIn, stageImport } from './boundaries';

/**
 * Lesson 16 (security), docs/security/threat-model.md T-01, T-02, T-03: access boundaries on PostgreSQL, with real sessions and plain
 * `fetch` against the built app. Every check has the four parts of the "three checks" rule (.ai/docs/engineering-standards.md §Access
 * boundaries): a positive control for BOTH accounts (the call works for the one who owns the data), a refused read, a refused write,
 * and the state AFTER the attempts: whole payloads and a digest of every table the attempts could touch, not a count.
 * Prior art that stays: tenant-isolation (slug level), team (hierarchy), invitations (dead links). These add the object-id level.
 */
const DOMAIN = 'bound-e2e.example';

const cleanup: Array<() => Promise<void>> = [];
afterAll(async () => {
  for (const c of cleanup.reverse()) await c().catch(() => undefined);
});

describe('access boundaries by object id (threat model T-01, T-02, T-03)', () => {
  it('T-01: an id of another restaurant is not reachable through your own restaurant: 404, 403 for the other slug, and no row anywhere changes', async () => {
    const marta = await halkaSommelier(); // Halka, Wine Director: decides pairings, toggles wines
    const tomasz = await halkaManager(); // Halka, general manager: team, imports
    const sonia = await bistroSommelier(); // Bistro, Wine Director
    const anna = await bistroOwner(); // Bistro, owner

    // objects of Halka (pairing, wine, staged import, member, pending invitation) and of Bistro (staged import, member)
    const halkaPairings = ((await (await get(marta, `/api/v1/restaurants/${HALKA}/pairings`)).json()) as { data: Array<{ id: string; wineId: string; version: number }> }).data;
    expect(halkaPairings.length).toBeGreaterThan(0);
    const halkaPairing = halkaPairings[0]!;
    const halkaImport = await stageImport(tomasz, HALKA, 'wines');
    const bistroImport = await stageImport(anna, BISTRO, 'wines');
    cleanup.push(async () => { await send(tomasz, 'DELETE', `/api/v1/imports/${halkaImport.id}?restaurant=${HALKA}`); });
    cleanup.push(async () => { await send(anna, 'DELETE', `/api/v1/imports/${bistroImport.id}?restaurant=${BISTRO}`); });
    const halkaMartaMember = (await members(tomasz, HALKA)).find((m) => m.email === 'marta@halka.pl')!;
    const bistroSoniaMember = (await members(anna, BISTRO)).find((m) => m.email === NEW_RESTAURANT_TEAM.sommelier.email)!;
    const invitedEmail = `victim@${DOMAIN}`;
    const inv = await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/invitations`, { email: invitedEmail, role: 'sommelier' });
    expect(inv.status).toBe(201);
    const halkaInvitation = ((await inv.json()) as { id: string }).id;
    cleanup.push(async () => { await send(tomasz, 'DELETE', `/api/v1/restaurants/${HALKA}/invitations/${halkaInvitation}`); });

    // 1. positive control for BOTH sides: each account works on its own data, so a 404 below cannot come from a broken call
    expect((await get(marta, `/api/v1/restaurants/${HALKA}/pairings`)).status).toBe(200);
    expect((await send(marta, 'PATCH', `/api/v1/wines/${halkaPairing.wineId}?restaurant=${HALKA}`, { active: true })).status).toBe(200);
    expect((await get(sonia, `/api/v1/restaurants/${BISTRO}/pairings`)).status).toBe(200);
    expect((await get(tomasz, `/api/v1/imports/${halkaImport.id}?restaurant=${HALKA}`)).status).toBe(200);
    expect((await get(anna, `/api/v1/imports/${bistroImport.id}?restaurant=${BISTRO}`)).status).toBe(200);
    const same = await send(anna, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${bistroSoniaMember.membershipId}`, { role: bistroSoniaMember.role }, { 'if-match': `"${bistroSoniaMember.version}"` });
    expect(same.status).toBe(200); // a change that changes nothing: the owner of Bistro may manage Bistro's team
    expect((await get(tomasz, `/api/v1/restaurants/${HALKA}/invitations`)).status).toBe(200);

    // 2. the state before the attempts: whole payloads of both restaurants and a digest of the tables
    const before = {
      halkaPairings: await payload(marta, `/api/v1/restaurants/${HALKA}/pairings`),
      halkaImport: await payload(tomasz, `/api/v1/imports/${halkaImport.id}?restaurant=${HALKA}`),
      halkaTeam: await payload(tomasz, `/api/v1/restaurants/${HALKA}/team`),
      halkaInvites: await payload(tomasz, `/api/v1/restaurants/${HALKA}/invitations`),
      bistroImport: await payload(anna, `/api/v1/imports/${bistroImport.id}?restaurant=${BISTRO}`),
      bistroTeam: await payload(anna, `/api/v1/restaurants/${BISTRO}/team`),
      bistroInvites: await payload(anna, `/api/v1/restaurants/${BISTRO}/invitations`),
      tables: await digest()
    };

    // 3. refused writes with a foreign id under your own slug (the id is of the other restaurant): 404, never 2xx
    const ifMatch = { 'if-match': `"${halkaPairing.version}"` };
    const foreignWrites: Array<[string, Response]> = [
      ['pairing approve', await send(sonia, 'PATCH', `/api/v1/pairings/${halkaPairing.id}?restaurant=${BISTRO}`, { status: 'approved' }, ifMatch)],
      ['pairing comment', await send(sonia, 'PATCH', `/api/v1/pairings/${halkaPairing.id}?restaurant=${BISTRO}`, { comment: 'planted by another tenant' }, ifMatch)],
      ['pairing delete', await send(sonia, 'DELETE', `/api/v1/pairings/${halkaPairing.id}?restaurant=${BISTRO}`, undefined, ifMatch)],
      ['wine hide', await send(sonia, 'PATCH', `/api/v1/wines/${halkaPairing.wineId}?restaurant=${BISTRO}`, { active: false })],
      ['import cancel', await send(anna, 'DELETE', `/api/v1/imports/${halkaImport.id}?restaurant=${BISTRO}`)],
      ['import confirm', await send(anna, 'POST', `/api/v1/imports/${halkaImport.id}/confirm?restaurant=${BISTRO}`, { rows: [] })],
      ['team role', await send(anna, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${halkaMartaMember.membershipId}`, { role: 'owner' }, { 'if-match': `"${halkaMartaMember.version}"` })],
      ['team deactivate', await send(anna, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${halkaMartaMember.membershipId}`, { status: 'deactivated' }, { 'if-match': `"${halkaMartaMember.version}"` })],
      ['invitation revoke', await send(anna, 'DELETE', `/api/v1/restaurants/${BISTRO}/invitations/${halkaInvitation}`)],
      // the other direction: Halka's accounts with Bistro's ids under the Halka slug
      ['halka: import cancel', await send(tomasz, 'DELETE', `/api/v1/imports/${bistroImport.id}?restaurant=${HALKA}`)],
      ['halka: team role', await send(tomasz, 'PATCH', `/api/v1/restaurants/${HALKA}/team/${bistroSoniaMember.membershipId}`, { role: 'waiter' }, { 'if-match': `"${bistroSoniaMember.version}"` })]
    ];
    for (const [name, res] of foreignWrites) expect(res.status, name).toBe(404);

    // 4. refused reads: a foreign id under your own slug, and your own call under the other restaurant's slug
    const foreignRead = await get(anna, `/api/v1/imports/${halkaImport.id}?restaurant=${BISTRO}`);
    expect(foreignRead.status).toBe(404);
    expect(await foreignRead.text()).not.toContain(halkaImport.fileName);
    expect((await get(tomasz, `/api/v1/imports/${bistroImport.id}?restaurant=${HALKA}`)).status).toBe(404);
    for (const [who, session, path] of [
      ['sonia imports', sonia, `/api/v1/imports/${halkaImport.id}?restaurant=${HALKA}`],
      ['sonia pairings', sonia, `/api/v1/restaurants/${HALKA}/pairings`],
      ['anna team', anna, `/api/v1/restaurants/${HALKA}/team`],
      ['anna invitations', anna, `/api/v1/restaurants/${HALKA}/invitations`],
      ['tomasz team', tomasz, `/api/v1/restaurants/${BISTRO}/team`],
      ['marta imports', marta, `/api/v1/imports/${bistroImport.id}?restaurant=${BISTRO}`]
    ] as Array<[string, Session, string]>) {
      const res = await get(session, path);
      expect(res.status, who).toBe(403);
      const text = await res.text();
      expect(text).not.toContain(halkaImport.fileName);
      expect(text).not.toContain(NEW_RESTAURANT.ownerEmail);
    }
    // refused write with the other restaurant's slug
    expect((await send(sonia, 'PATCH', `/api/v1/wines/${halkaPairing.wineId}?restaurant=${HALKA}`, { active: false })).status).toBe(403);
    expect((await send(anna, 'POST', `/api/v1/restaurants/${HALKA}/invitations`, { email: `x@${DOMAIN}`, role: 'sommelier' })).status).toBe(403);

    // 5. state after: nothing moved, in either restaurant
    const after = {
      halkaPairings: await payload(marta, `/api/v1/restaurants/${HALKA}/pairings`),
      halkaImport: await payload(tomasz, `/api/v1/imports/${halkaImport.id}?restaurant=${HALKA}`),
      halkaTeam: await payload(tomasz, `/api/v1/restaurants/${HALKA}/team`),
      halkaInvites: await payload(tomasz, `/api/v1/restaurants/${HALKA}/invitations`),
      bistroImport: await payload(anna, `/api/v1/imports/${bistroImport.id}?restaurant=${BISTRO}`),
      bistroTeam: await payload(anna, `/api/v1/restaurants/${BISTRO}/team`),
      bistroInvites: await payload(anna, `/api/v1/restaurants/${BISTRO}/invitations`),
      tables: await digest()
    };
    expect(after).toEqual(before);
    // the attempts reached the app's error path and nothing else: the owners' own calls still work
    expect((await get(marta, `/api/v1/restaurants/${HALKA}/pairings`)).status).toBe(200);
  });

  it('T-02: the role hierarchy holds at every rung: a manager cannot grant or touch up, a Wine Director cannot manage the team, extra body fields are refused, and the team is unchanged', async () => {
    const anna = await bistroOwner();
    const marek = await bistroManager(); // manager: team.manage, but below the owner
    const sonia = await bistroSommelier(); // Wine Director: no team.manage
    const team = await members(anna, BISTRO);
    const ownerRow = team.find((m) => m.email === NEW_RESTAURANT.ownerEmail)!;
    const soniaRow = team.find((m) => m.email === NEW_RESTAURANT_TEAM.sommelier.email)!;
    const marekRow = team.find((m) => m.email === NEW_RESTAURANT_TEAM.manager.email)!;
    const patch = (s: Session, id: string, body: unknown, version: number) => send(s, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${id}`, body, { 'if-match': `"${version}"` });

    // positive control for both: the owner and the manager each do what their rung allows (a manager invites and cancels a Wine Director)
    expect((await patch(anna, soniaRow.membershipId, { role: soniaRow.role }, soniaRow.version)).status).toBe(200);
    const okInvite = await send(marek, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `rung@${DOMAIN}`, role: 'sommelier' });
    expect(okInvite.status).toBe(201);
    const okId = ((await okInvite.json()) as { id: string }).id;
    expect((await send(marek, 'DELETE', `/api/v1/restaurants/${BISTRO}/invitations/${okId}`)).status).toBe(204);

    const before = { team: await payload(anna, `/api/v1/restaurants/${BISTRO}/team`), invites: await payload(anna, `/api/v1/restaurants/${BISTRO}/invitations`), tables: await digest() };

    // refused writes (403 hierarchy / 422 shape)
    const attempts: Array<[string, Response, number]> = [
      ['manager grants owner', await patch(marek, soniaRow.membershipId, { role: 'owner' }, soniaRow.version), 403],
      ['manager grants manager', await patch(marek, soniaRow.membershipId, { role: 'manager' }, soniaRow.version), 403],
      ['manager touches the owner', await patch(marek, ownerRow.membershipId, { status: 'deactivated' }, ownerRow.version), 403],
      ['manager demotes the owner', await patch(marek, ownerRow.membershipId, { role: 'waiter' }, ownerRow.version), 403],
      ['manager promotes himself (self change)', await patch(marek, marekRow.membershipId, { role: 'owner' }, marekRow.version), 422],
      ['manager invites an owner', await send(marek, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `a@${DOMAIN}`, role: 'owner' }), 403],
      ['manager invites a manager', await send(marek, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `b@${DOMAIN}`, role: 'manager' }), 403],
      ['sommelier promotes himself', await patch(sonia, soniaRow.membershipId, { role: 'owner' }, soniaRow.version), 403],
      ['sommelier changes the owner', await patch(sonia, ownerRow.membershipId, { status: 'deactivated' }, ownerRow.version), 403],
      ['sommelier invites', await send(sonia, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `c@${DOMAIN}`, role: 'sommelier' }), 403],
      // mass assignment: fields the schema does not name must be refused, not ignored
      ['owner with a smuggled field', await patch(anna, soniaRow.membershipId, { role: 'manager', restaurantId: '00000000-0000-4000-8000-000000000000', userId: ownerRow.membershipId }, soniaRow.version), 422],
      ['invitation with platform flag', await send(anna, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `d@${DOMAIN}`, role: 'sommelier', platform: true }), 422]
    ];
    for (const [name, res, status] of attempts) expect(res.status, name).toBe(status);

    // refused reads of the team by a rung without team.manage
    for (const path of [`/api/v1/restaurants/${BISTRO}/team`, `/api/v1/restaurants/${BISTRO}/invitations`]) {
      const res = await get(sonia, path);
      expect(res.status, path).toBe(403);
      expect(await res.text()).not.toContain(NEW_RESTAURANT.ownerEmail);
    }

    const after = { team: await payload(anna, `/api/v1/restaurants/${BISTRO}/team`), invites: await payload(anna, `/api/v1/restaurants/${BISTRO}/invitations`), tables: await digest() };
    expect(after).toEqual(before);
  });

  it('T-03: the invitation link carries the role and the restaurant, the form cannot change them; platform flag and a second use of the link grant nothing', async () => {
    const anna = await bistroOwner();
    const email = `pawn@${DOMAIN}`;
    const created = await send(anna, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email, role: 'sommelier' });
    expect(created.status).toBe(201);
    const link = ((await created.json()) as { link: string }).link;
    const url = new URL(link);
    const token = url.searchParams.get('token')!;
    const page = await fetch(`${base()}${url.pathname}${url.search}`, { redirect: 'manual' });
    expect(page.status).toBe(200); // positive control: a live link renders its form
    const html = (await page.text()).replace(/<!-- -->/g, '');
    const form = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="token"'))!;
    const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
    const fields: Array<[string, string]> = [...form.matchAll(/<input\b[^>]*>/g)].map((m) => {
      const a = (n: string) => { const r = new RegExp(`\\s${n}="([^"]*)"`).exec(m[0]); return r ? unescape(r[1]!) : undefined; };
      return [a('name') ?? '', a('value') ?? ''] as [string, string];
    }).filter(([n]) => n !== '');
    const submit = (f: Array<[string, string]>) => {
      const body = new FormData();
      for (const [k, v] of f) body.append(k, v);
      return fetch(`${base()}/admin/accept`, { method: 'POST', body, redirect: 'manual', headers: { origin: origin(), 'sec-fetch-site': 'same-origin' } });
    };
    const named = fields.map(([n, v]): [string, string] => [n, n === 'name' ? 'Pawn Person' : n === 'password' ? 'e2e-pawn-passphrase-2026' : v]);
    const deduped: Array<[string, string]> = [...named, ['role', 'owner'], ['restaurant', HALKA], ['restaurantId', '00000000-0000-4000-8000-000000000000'], ['platform', 'true']];
    cleanup.push(async () => {
      await queryDatabase(db(), `delete from membership where user_id in (select id from app_user where email = $1)`, [email]);
      await queryDatabase(db(), `delete from session where user_id in (select id from app_user where email = $1)`, [email]);
      await queryDatabase(db(), `delete from app_user where email = $1`, [email]);
      await queryDatabase(db(), `delete from auth_token where email = $1`, [email]);
    });
    const res = await submit(deduped);
    expect([302, 303, 307]).toContain(res.status);
    expect(res.headers.get('location') ?? '').toContain(`/admin/${BISTRO}`);

    // state after: one account, one membership, the role of the invitation, in the restaurant of the invitation, nowhere else
    const rows = await queryDatabase<{ slug: string; role: string; status: string }>(db(), `select r.slug, m.role, m.status from membership m join app_user u on u.id = m.user_id join restaurant r on r.id = m.restaurant_id where u.email = $1`, [email]);
    expect(rows).toEqual([{ slug: BISTRO, role: 'sommelier', status: 'active' }]);
    const halkaTeam = await members(await halkaManager(), HALKA);
    expect(halkaTeam.some((m) => m.email === email)).toBe(false);

    // the same link a second time: dead, and nothing is written (digest before and after the attempt)
    const tables = await digest();
    const again = await submit(deduped);
    expect([302, 303, 307]).toContain(again.status);
    expect(again.headers.get('location') ?? '').toContain('invalid_token');
    expect(await digest()).toEqual(tables);
    expect((await fetch(`${base()}/admin/accept?token=${encodeURIComponent(token)}`, { redirect: 'manual' })).status).toBe(404);
  });

  it('T-03b: the showcase is read-only: a write method on /demo and a session-less write to the API change no row', async () => {
    const tables = await digest();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(`${base()}/demo/roi`, { method, headers: { origin: origin() }, body: method === 'DELETE' ? undefined : '{}' });
      // Next.js answers a write method on a page with the page itself; what matters is that it sets no cookie and writes nothing
      expect(res.status, `${method} /demo/roi`).toBeLessThan(500);
      expect(res.headers.get('set-cookie'), `${method} /demo/roi`).toBeNull();
    }
    // positive control: the page itself is served; and a write without a session is refused as a write
    expect((await fetch(`${base()}/demo/roi`)).status).toBe(200);
    const anonymous = await fetch(`${base()}/api/v1/restaurants/${HALKA}/publish`, { method: 'POST', headers: { origin: origin(), 'content-type': 'application/json' }, body: '{}' });
    expect(anonymous.status).toBe(401);
    expect(await errorCode(anonymous)).toBe('unauthenticated');
    expect(await digest()).toEqual(tables);
  });
});
