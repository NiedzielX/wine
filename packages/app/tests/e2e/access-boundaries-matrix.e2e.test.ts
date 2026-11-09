import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BISTRO, HALKA, base, bistroManager, bistroOwner, bistroSommelier, db, digest, get, halkaManager, halkaSommelier, members, payload, runAction, send, stageImport, type Session } from './boundaries';

/**
 * Lesson 16 (security), docs/security/threat-model.md T-25 .. T-31: the boundaries the first pass (access-boundaries) did not reach,
 * part 1 of the matrix: import rows, pairing create and list, the public recommendations route, team read by role, the panel pages
 * (incl. KPI, opportunities and sales import), the server actions of the panel by id and by slug and role, and the slug-level API
 * routes upgraded to the full rule (.ai/docs/engineering-standards.md §10): positive control for BOTH accounts, refused read, refused
 * write, state after (whole payloads and a table digest). A second tenant with data (Bistro E2E gets the sample wine list and menu)
 * is needed so that the positive control for the second account is a real read of real rows, not an empty list.
 */
type Pairing = { id: string; dishId: string; wineId: string; version: number; status: string };
type Ids = { slug: string; name: string; dishes: Array<{ id: string; name: string }>; wines: Array<{ id: string; name: string }>; pairings: Pairing[]; job: { id: string; fileName: string } };
const H = {} as Ids;
const B = {} as Ids;
let marta: Session; let tomasz: Session; let anna: Session; let marek: Session; let sonia: Session;
const cleanup: Array<() => Promise<void>> = [];

const listPairings = async (s: Session, slug: string) => ((await (await get(s, `/api/v1/restaurants/${slug}/pairings`)).json()) as { data: Pairing[] }).data;
const confirmSample = async (s: Session, slug: string, kind: 'wines' | 'menu') => {
  const job = await stageImport(s, slug, kind);
  expect((await send(s, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${slug}`, {})).status, `confirm ${kind}`).toBe(200);
};
async function load(slug: string, s: Session, job: { id: string; fileName: string }): Promise<Ids> {
  const rest = await queryDatabase<{ name: string }>(db(), 'select name from restaurant where slug = $1', [slug]);
  const dishes = await queryDatabase<{ id: string; name: string }>(db(), `select d.id, d.name from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 order by d.name`, [slug]);
  const wines = await queryDatabase<{ id: string; name: string }>(db(), `select w.id, w.name from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 order by w.name`, [slug]);
  return { slug, name: rest[0]!.name, dishes, wines, pairings: await listPairings(s, slug), job };
}
/** Values that appear only in the other restaurant's data: the body of a refused answer must carry none of them. */
const onlyIn = (a: Ids, b: Ids) => [a.name, a.job.fileName, ...a.dishes.map((d) => d.name).filter((n) => !b.dishes.some((x) => x.name === n)), ...a.wines.map((w) => w.name).filter((n) => !b.wines.some((x) => x.name === n))];
const noLeak = (text: string, secrets: string[], what: string) => { for (const v of secrets) expect(text.includes(v) ? text.slice(Math.max(0, text.indexOf(v) - 200), text.indexOf(v) + 100) : '', `${what} leaks "${v}"`).toBe(''); };

beforeAll(async () => {
  [marta, tomasz, anna, marek, sonia] = await Promise.all([halkaSommelier(), halkaManager(), bistroOwner(), bistroManager(), bistroSommelier()]);
  // the e2e database is one per run, shared by the files in sequence: import the samples only when no earlier file did, and rename idempotently
  const bistroDishes = await queryDatabase<{ n: string }>(db(), `select count(*)::text as n from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1`, [BISTRO]);
  if (bistroDishes[0]!.n === '0') {
    await confirmSample(anna, BISTRO, 'wines');
    await confirmSample(anna, BISTRO, 'menu');
  }
  // the sample files are the same for every tenant: give Bistro's dishes and wines names of their own, so that a leak of a name is a leak the body checks can see
  for (const t of ['dish', 'wine']) await queryDatabase(db(), `update ${t} set name = name || ' (Bistro E2E)' where name not like '% (Bistro E2E)' and restaurant_id = (select id from restaurant where slug = $1)`, [BISTRO]);
  const hJob = await stageImport(tomasz, HALKA, 'wines');
  const bJob = await stageImport(anna, BISTRO, 'wines');
  cleanup.push(async () => { await send(tomasz, 'DELETE', `/api/v1/imports/${hJob.id}?restaurant=${HALKA}`); await send(anna, 'DELETE', `/api/v1/imports/${bJob.id}?restaurant=${BISTRO}`); });
  Object.assign(H, await load(HALKA, marta, hJob));
  Object.assign(B, await load(BISTRO, sonia, bJob));
  expect(B.dishes.length).toBeGreaterThan(0);
  // no name is shared between the two tenants, so `onlyIn` drops nothing and every body check bites
  expect([...H.dishes, ...H.wines].filter((x) => [...B.dishes, ...B.wines].some((y) => y.name === x.name))).toEqual([]);
  expect(B.pairings.length).toBeGreaterThan(0);
});
afterAll(async () => { for (const c of cleanup.reverse()) await c().catch(() => undefined); });

/** The whole state a refused attempt could touch, for both restaurants. */
const snapshot = async () => ({
  halkaPairings: await payload(marta, `/api/v1/restaurants/${HALKA}/pairings`),
  bistroPairings: await payload(sonia, `/api/v1/restaurants/${BISTRO}/pairings`),
  halkaImport: await payload(tomasz, `/api/v1/imports/${H.job.id}?restaurant=${HALKA}`),
  bistroImport: await payload(anna, `/api/v1/imports/${B.job.id}?restaurant=${BISTRO}`),
  halkaTeam: await payload(tomasz, `/api/v1/restaurants/${HALKA}/team`),
  bistroTeam: await payload(anna, `/api/v1/restaurants/${BISTRO}/team`),
  halkaMenu: await payload(tomasz, `/api/v1/public/restaurants/${HALKA}/menu`),
  tables: await digest()
});

describe('access boundaries, part 1 of the matrix (threat model T-25 .. T-31)', () => {
  it('T-25: import rows: correcting rows of another restaurant\'s import is refused (404 by id, 403 by slug) and changes nothing', async () => {
    const edit = (s: Session, id: string, slug: string) => send(s, 'PATCH', `/api/v1/imports/${id}/rows?restaurant=${slug}`, { rows: [{ rowNumber: 1, include: true }] });
    expect((await edit(tomasz, H.job.id, HALKA)).status).toBe(200);
    expect((await edit(anna, B.job.id, BISTRO)).status).toBe(200);
    const before = await snapshot();
    for (const [name, res] of [
      ['bistro, halka id', await edit(anna, H.job.id, BISTRO)],
      ['halka, bistro id', await edit(tomasz, B.job.id, HALKA)]
    ] as const) { expect(res.status, name).toBe(404); noLeak(await res.text(), name.startsWith('bistro') ? onlyIn(H, B) : onlyIn(B, H), name); }
    for (const [name, res] of [['bistro on halka slug', await edit(anna, H.job.id, HALKA)], ['wine director of bistro on halka slug', await edit(sonia, H.job.id, HALKA)], ['halka on bistro slug', await edit(tomasz, B.job.id, BISTRO)]] as const) {
      expect(res.status, name).toBe(403);
      noLeak(await res.text(), [...onlyIn(H, B), ...onlyIn(B, H)], name);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('T-26: pairing create and list: a foreign dish or wine id cannot be paired in your restaurant, the list is scoped, and no row changes', async () => {
    const free = (ids: Ids) => { const d = ids.dishes.find((x) => ids.wines.some((w) => !ids.pairings.some((p) => p.dishId === x.id && p.wineId === w.id)))!; return { dishId: d.id, wineId: ids.wines.find((w) => !ids.pairings.some((p) => p.dishId === d.id && p.wineId === w.id))!.id }; };
    const create = (s: Session, slug: string, body: unknown) => send(s, 'POST', `/api/v1/pairings?restaurant=${slug}`, body);
    // positive control for both accounts: the Wine Director creates a pairing of her own dish and wine
    for (const [s, ids] of [[marta, H], [sonia, B]] as const) {
      const res = await create(s, ids.slug, { ...free(ids), comment: 'boundary control' });
      expect(res.status, ids.slug).toBe(201);
      const made = (await res.json()) as { id: string; version: number };
      cleanup.push(async () => { await send(s, 'DELETE', `/api/v1/pairings/${made.id}?restaurant=${ids.slug}`, undefined, { 'if-match': `"${made.version}"` }); });
    }
    const before = await snapshot();
    const hd = H.dishes[0]!.id; const hw = H.wines[0]!.id; const bd = B.dishes[0]!.id; const bw = B.wines[0]!.id;
    for (const [name, res] of [
      ['foreign dish', await create(sonia, BISTRO, { dishId: hd, wineId: bw })],
      ['foreign wine', await create(sonia, BISTRO, { dishId: bd, wineId: hw })],
      ['both foreign', await create(sonia, BISTRO, { dishId: hd, wineId: hw })],
      ['halka: bistro ids', await create(marta, HALKA, { dishId: bd, wineId: bw })],
      ['smuggled field', await create(sonia, BISTRO, { dishId: bd, wineId: bw, restaurantId: H.dishes[0]!.id })]
    ] as const) { expect([404, 422], name).toContain(res.status); }
    expect((await create(sonia, HALKA, { dishId: hd, wineId: hw })).status).toBe(403);
    expect((await create(tomasz, HALKA, { dishId: hd, wineId: hw })).status).toBe(403); // a manager does not decide pairings
    // list: the filter by a foreign dish id under your own slug finds nothing of the other restaurant; the other slug is 403
    const filtered = await get(sonia, `/api/v1/restaurants/${BISTRO}/pairings?dishId=${hd}`);
    expect(filtered.status).toBe(200);
    expect(((await filtered.json()) as { data: unknown[] }).data).toEqual([]);
    const foreign = await get(sonia, `/api/v1/restaurants/${HALKA}/pairings`);
    expect(foreign.status).toBe(403);
    noLeak(await foreign.text(), onlyIn(H, B), 'pairing list of the other slug');
    expect(await snapshot()).toEqual(before);
  });

  it('T-27: team read by role: owner and manager read their own team, a Wine Director and the other restaurant get 403 and no e-mail', async () => {
    for (const [s, slug] of [[anna, BISTRO], [marek, BISTRO], [tomasz, HALKA]] as const) expect((await get(s, `/api/v1/restaurants/${slug}/team`)).status).toBe(200);
    const before = await snapshot();
    const emails = [...(await members(anna, BISTRO)), ...(await members(tomasz, HALKA))].map((m) => m.email);
    for (const [who, s, slug] of [['sommelier of bistro', sonia, BISTRO], ['sommelier of halka', marta, HALKA], ['bistro owner on halka', anna, HALKA], ['halka manager on bistro', tomasz, BISTRO], ['bistro manager on halka', marek, HALKA]] as const) {
      const res = await get(s, `/api/v1/restaurants/${slug}/team`);
      expect(res.status, who).toBe(403);
      noLeak(await res.text(), emails, who);
    }
    // a refused write by the same rungs: the team cannot be changed from a role without team.manage (hierarchy detail: T-02)
    const row = (await members(anna, BISTRO)).find((m) => m.role === 'sommelier')!;
    expect((await send(sonia, 'PATCH', `/api/v1/restaurants/${BISTRO}/team/${row.membershipId}`, { role: 'waiter' }, { 'if-match': `"${row.version}"` })).status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it('T-28: recommendations of the public route: another restaurant\'s dish id under your slug is 404 with none of its data; a draft dish is not served', async () => {
    const ask = (slug: string, dishId: string) => fetch(`${base()}/api/v1/dishes/${dishId}/recommendations?restaurant=${slug}`);
    const publishedOf = async (slug: string) => (await queryDatabase<{ id: string }>(db(), `select d.id from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 and d.status = 'published' limit 1`, [slug]))[0]?.id;
    const published = (await publishedOf(HALKA))!;
    // a draft dish is not served, even under its own slug: make one verifiably draft whatever an earlier file did to Bistro
    const draftId = B.dishes[0]!.id;
    await queryDatabase(db(), `update dish set status = 'draft' where id = $1`, [draftId]);
    expect((await ask(BISTRO, draftId)).status).toBe(404);
    // Bistro gets a published dish (approve all, publish) so that its owner side has a positive control too
    expect((await send(sonia, 'POST', `/api/v1/restaurants/${BISTRO}/pairings/bulk-decision`, { action: 'approve_all' })).status).toBe(200);
    const published2 = await send(sonia, 'POST', `/api/v1/restaurants/${BISTRO}/publish`, {});
    expect([201, 422], 'publish, or nothing to publish after an earlier file published').toContain(published2.status);
    const bistroPublished = await publishedOf(BISTRO);
    expect(bistroPublished, 'Bistro has a published dish').toBeDefined();
    expect((await ask(HALKA, published)).status).toBe(200);
    expect((await ask(BISTRO, bistroPublished!)).status).toBe(200);
    const before = await snapshot();
    const res = await ask(BISTRO, published);
    expect(res.status).toBe(404);
    const back = await ask(HALKA, bistroPublished!);
    expect(back.status).toBe(404);
    noLeak(await back.text(), [...onlyIn(B, H), ...B.wines.map((w) => w.id)], 'recommendations of a Bistro dish under the Halka slug');
    noLeak(await res.text(), [...onlyIn(H, B), ...H.wines.map((w) => w.id)], 'recommendations');
    expect(await snapshot()).toEqual(before);
  });

  it('T-29: panel pages (KPI, opportunities, publish, QR, setup, team, imports, details): own pages render, the other restaurant gets 403 or 404 with none of its data, no row changes', async () => {
    const paths = (ids: Ids) => ['', '/menu', '/wines', '/review', '/opportunities', '/publish', '/qr', '/setup', '/import/menu', '/import/sales', '/import/wines', `/menu/${ids.dishes[0]!.id}`, `/pairings/${ids.dishes[0]!.id}`, `/wines/${ids.wines[0]!.id}`];
    const page = (s: Session, slug: string, path: string) => get(s, `/admin/${slug}${path}`);
    for (const [s, ids] of [[tomasz, H], [anna, B]] as const) {
      for (const path of [...paths(ids), '/team']) {
        const res = await page(s, ids.slug, path);
        expect(res.status, `${ids.slug}${path}`).toBe(200);
        expect(await res.text(), `${ids.slug}${path}`).toContain(ids.name);
      }
    }
    const before = await snapshot();
    const found: string[] = [];
    for (const [s, mine, other] of [[tomasz, H, B], [anna, B, H]] as const) {
      for (const path of [...paths(other), '/team']) {
        const res = await page(s, other.slug, path); // the other restaurant's slug
        expect(res.status, `${other.slug}${path}`).toBe(403);
        const text = await res.text();
        for (const v of onlyIn(other, mine)) if (text.includes(v)) found.push(`${s === tomasz ? 'halka' : 'bistro'} account, ${other.slug}${path}: "${v}"`);
      }
      // an id of the other restaurant under your own slug: a real 404 (these pages are outside loading.tsx)
      for (const path of [`/menu/${other.dishes[0]!.id}`, `/pairings/${other.dishes[0]!.id}`, `/wines/${other.wines[0]!.id}`]) {
        const res = await page(s, mine.slug, path);
        expect(res.status, `${mine.slug}${path}`).toBe(404);
        noLeak(await res.text(), onlyIn(other, mine), `${mine.slug}${path}`);
      }
      // the import screens read `?job=`: the other restaurant's job id under your own slug shows nothing of it
      for (const kind of ['menu', 'sales', 'wines']) {
        const res = await page(s, mine.slug, `/import/${kind}?job=${other.job.id}`);
        noLeak(await res.text(), onlyIn(other, mine), `${mine.slug} import ${kind} with a foreign job`);
      }
    }
    // the pairings index redirects to the first dish: it must not do so (or name a dish id) for anyone without access
    const own = await get(tomasz, `/admin/${HALKA}/pairings`);
    expect([307, 308]).toContain(own.status);
    expect(own.headers.get('location')).toContain(`/admin/${HALKA}/pairings/`);
    for (const [who, res] of [['halka account on bistro', await get(tomasz, `/admin/${BISTRO}/pairings`)], ['bistro account on halka', await get(anna, `/admin/${HALKA}/pairings`)], ['anonymous on halka', await fetch(`${base()}/admin/${HALKA}/pairings`, { redirect: 'manual' })]] as const) {
      expect(res.headers.get('location') ?? '', who).not.toContain('/pairings/');
      const text = await res.text();
      for (const v of [...onlyIn(who.startsWith('halka') ? B : H, who.startsWith('halka') ? H : B)]) if (text.includes(v)) found.push(`${who}, /pairings: "${v}"`);
    }
    // no session at all: a redirect to sign-in, and the body carries nothing of either restaurant
    for (const ids of [H, B]) {
      for (const path of [...paths(ids), '/team']) {
        const res = await fetch(`${base()}/admin/${ids.slug}${path}`, { redirect: 'manual' });
        const text = await res.text();
        expect([307, 308], `anonymous ${ids.slug}${path}`).toContain(res.status);
        for (const v of [ids.name, ...ids.dishes.map((d) => d.name), ...ids.wines.map((w) => w.name)]) if (text.includes(v)) found.push(`anonymous, ${ids.slug}${path}: "${v}"`);
      }
    }
    expect(found, 'a refused page must not carry the other restaurant\'s data').toEqual([]);
    // a rung without team.manage: the Wine Director does not get the team page
    for (const [s, slug] of [[sonia, BISTRO], [marta, HALKA]] as const) expect((await page(s, slug, '/team')).status, `${slug} team`).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it('T-30: panel server actions with an id of another restaurant under your own slug are refused and change nothing', async () => {
    const pairOf = async (s: Session, ids: Ids, n: number) => {
      const free = ids.dishes.flatMap((d) => ids.wines.map((w) => ({ d, w }))).filter(({ d, w }) => !ids.pairings.some((p) => p.dishId === d.id && p.wineId === w.id));
      const { d, w } = free[free.length - 1 - n]!;
      const res = await send(s, 'POST', `/api/v1/pairings?restaurant=${ids.slug}`, { dishId: d.id, wineId: w.id, comment: 'action control' });
      expect(res.status).toBe(201);
      return ((await res.json()) as Pairing);
    };
    const hp = await pairOf(marta, H, 0); const bp = await pairOf(sonia, B, 0);
    const keysOf = async (s: Session, slug: string) => [...(await (await get(s, `/admin/${slug}/opportunities`)).text()).matchAll(/name="key"[^>]*value="([^"]+)"/g)].map((m) => m[1]!);
    const hKey = (await keysOf(marta, HALKA))[0]!;
    expect(hKey, 'Halka has a current opportunity').toBeTruthy();
    // Bistro's sample data has no current opportunity ("Nothing to check"): its key is well-formed but not a candidate, so its positive control is the gap listed in the run log
    const bKey = `wine_unpaired:${B.wines[0]!.id}`;
    const ok = (r: { location: string }, what: string) => expect(r.location, what).toMatch(/[?&]saved=/);
    const refused = (r: { location: string }, what: string, code = 'not_found') => { expect(r.location, what).not.toMatch(/[?&]saved=/); expect(r.location, what).toContain(`error=${code}`); };
    const run = (s: Session, slug: string, name: string, fields: Record<string, string>) => runAction(s, name, slug, fields);
    const cur = async (s: Session, ids: Ids, pid: string) => String((await listPairings(s, ids.slug)).find((p) => p.id === pid)!.version);

    // 1. positive controls for BOTH accounts: each Wine Director / manager runs the action on its own object
    for (const [s, m, ids, p] of [[marta, tomasz, H, hp], [sonia, anna, B, bp]] as const) {
      const sl = ids.slug;
      ok(await run(m, sl, 'saveDishTranslations', { dishId: ids.dishes[0]!.id, name_en: ids.dishes[0]!.name }), `${sl} dish translations`);
      ok(await run(m, sl, 'saveWineTranslations', { wineId: ids.wines[0]!.id, region_en: 'Boundary' }), `${sl} wine translations`);
      ok(await run(s, sl, 'setWineAvailability', { wineId: ids.wines[0]!.id, active: 'true' }), `${sl} wine availability`);
      ok(await run(s, sl, 'approvePairing', { pairingId: p.id, version: String(p.version) }), `${sl} approve`);
      ok(await run(s, sl, 'savePairingNote', { pairingId: p.id, comment: 'boundary note', version: await cur(s, ids, p.id) }), `${sl} note`);
      ok(await run(m, sl, 'saveImportRows', { job: ids.job.id, kind: 'wines', rows: '' }), `${sl} import rows`);
      if (ids === H) ok(await run(s, sl, 'dismissOpportunity', { key: hKey }), `${sl} dismiss`);
    }
    const invite = async (m: Session, slug: string) => { const r = await send(m, 'POST', `/api/v1/restaurants/${slug}/invitations`, { email: `act-${slug}@bound-e2e.example`, role: 'sommelier' }); expect(r.status).toBe(201); return ((await r.json()) as { id: string }).id; };
    const hInv = await invite(tomasz, HALKA); const bInv = await invite(anna, BISTRO);
    const before = await snapshot();
    const hv = await cur(marta, H, hp.id); const bv = await cur(sonia, B, bp.id);
    // 2. refused: Bistro's accounts with Halka's ids under the Bistro slug, and Halka's with Bistro's
    for (const [s, m, mine, other, op, ov, otherKey] of [[sonia, anna, B, H, hp, hv, hKey], [marta, tomasz, H, B, bp, bv, bKey]] as const) {
      const sl = mine.slug; const tag = `${sl} with ${other.slug} ids`;
      refused(await run(m, sl, 'saveDishTranslations', { dishId: other.dishes[0]!.id, name_en: 'planted' }), `${tag}: dish translations`);
      refused(await run(m, sl, 'saveWineTranslations', { wineId: other.wines[0]!.id, region_en: 'planted' }), `${tag}: wine translations`);
      refused(await run(s, sl, 'setWineAvailability', { wineId: other.wines[0]!.id, active: 'false' }), `${tag}: wine hide`);
      for (const name of ['approvePairing', 'rejectPairing', 'restorePairing', 'movePairing', 'deletePairing']) refused(await run(s, sl, name, { pairingId: op.id, version: ov, direction: 'up' }), `${tag}: ${name}`);
      refused(await run(s, sl, 'setPairingRole', { pairingId: op.id, role: 'primary', version: ov }), `${tag}: role`);
      refused(await run(s, sl, 'savePairingNote', { pairingId: op.id, comment: 'planted', version: ov }), `${tag}: note`);
      refused(await run(s, sl, 'addPairing', { dishId: other.dishes[0]!.id, wineId: other.wines[0]!.id }), `${tag}: add pairing`);
      refused(await run(s, sl, 'addOpportunitySuggestion', { dishId: other.dishes[0]!.id, wineId: other.wines[0]!.id }), `${tag}: suggestion`);
      refused(await run(s, sl, 'dismissOpportunity', { key: otherKey }), `${tag}: dismiss`, 'opportunity_stale');
      if (other === H) refused(await run(s, sl, 'restoreOpportunity', { key: otherKey }), `${tag}: restore a key ignored in the other restaurant`, 'opportunity_not_dismissed');
      for (const name of ['saveImportRows', 'confirmImport', 'cancelImport']) refused(await run(m, sl, name, { job: other.job.id, kind: 'wines', rows: '' }), `${tag}: ${name}`);
    }
    const teamRow = (await members(anna, BISTRO)).find((x) => x.role === 'sommelier')!;
    for (const [name, fields] of [['changeMemberRole', { role: 'owner' }], ['deactivateMember', {}], ['reactivateMember', {}]] as const) {
      refused(await run(tomasz, HALKA, name, { membershipId: teamRow.membershipId, version: String(teamRow.version), ...fields }), `halka manager: ${name} of a Bistro member`);
    }
    refused(await run(tomasz, HALKA, 'revokeInvitation', { invitationId: bInv }), 'halka manager revokes a Bistro invitation');
    refused(await run(anna, BISTRO, 'revokeInvitation', { invitationId: hInv }), 'bistro owner revokes a Halka invitation');
    // ids that are not UUIDs are unknown ids: the same refusal, never `unexpected` (a driver error)
    for (const [m, s, sl] of [[tomasz, marta, HALKA], [anna, sonia, BISTRO]] as const) {
      for (const [name, fields, who] of [
        ['saveDishTranslations', { dishId: 'abc', name_en: 'x' }, m], ['saveWineTranslations', { wineId: 'abc', region_en: 'x' }, m], ['setWineAvailability', { wineId: 'abc', active: 'false' }, s],
        ['approvePairing', { pairingId: 'abc', version: '1' }, s], ['deletePairing', { pairingId: 'abc', version: '1' }, s], ['addPairing', { dishId: 'abc', wineId: 'abc' }, s],
        ['addOpportunitySuggestion', { dishId: 'abc', wineId: 'abc' }, s], ['saveImportRows', { job: 'abc', kind: 'wines', rows: '' }, m], ['cancelImport', { job: 'abc', kind: 'wines' }, m],
        ['revokeInvitation', { invitationId: 'abc' }, m], ['changeMemberRole', { membershipId: 'abc', role: 'waiter', version: '1' }, m]
      ] as const) refused(await run(who, sl, name, fields), `${sl}: ${name} with an id that is not a UUID`);
    }
    // 3. state after: nothing of the other restaurant moved (digest includes opportunity_dismissal, import_job, pairing, wine, dish)
    expect(await snapshot()).toEqual(before);
    // clean up: the controls' own pairings, deleted through the same action (a last positive control)
    for (const [s, ids, p] of [[marta, H, hp], [sonia, B, bp]] as const) ok(await run(s, ids.slug, 'deletePairing', { pairingId: p.id, version: await cur(s, ids, p.id) }), `${ids.slug} delete`);
    ok(await run(marta, HALKA, 'restoreOpportunity', { key: hKey }), 'halka restore');
    ok(await run(tomasz, HALKA, 'revokeInvitation', { invitationId: hInv }), 'halka revoke');
    ok(await run(anna, BISTRO, 'revokeInvitation', { invitationId: bInv }), 'bistro revoke');
  });

  it('T-31: panel server actions by slug and role: the other restaurant\'s slug and a role below the permission are refused (forbidden) and change nothing', async () => {
    const run = (s: Session, slug: string, name: string, fields: Record<string, string>) => runAction(s, name, slug, fields);
    const forbidden = (r: { location: string }, what: string) => { expect(r.location, what).not.toMatch(/[?&]saved=/); expect(r.location, what).toContain('error=forbidden'); };
    const settings = { showScores: 'on', showUnreviewed: 'on' };
    const rest = async (slug: string) => (await queryDatabase<{ name: string; address: string; city: string; wine_director: string; content_locale: string }>(db(), 'select name, address, city, wine_director, content_locale from restaurant where slug = $1', [slug]))[0]!;
    const details = async (slug: string) => { const r = await rest(slug); return { name: r.name, address: r.address, city: r.city, wineDirector: r.wine_director }; };
    // positive controls: the same calls work for the owner of the data (manager role, or owner)
    for (const [m, s, ids] of [[tomasz, marta, H], [anna, sonia, B]] as const) {
      const sl = ids.slug;
      expect((await run(m, sl, 'saveRestaurantDetails', await details(sl))).location, `${sl} details`).toMatch(/saved=details/);
      expect((await run(m, sl, 'saveRestaurantContent', { contentLocale: (await rest(sl)).content_locale })).location, `${sl} content`).toMatch(/saved=content/);
      expect((await run(s, sl, 'saveGuestSettings', settings)).location, `${sl} settings`).toMatch(/saved=settings/);
      expect((await run(s, sl, 'generateSuggestions', {})).location, `${sl} suggestions`).toMatch(/saved=suggestions/);
      expect((await run(s, sl, 'publishChanges', {})).location, `${sl} publish`).toMatch(/saved=published/);
    }
    const before = await snapshot();
    const names = ['saveRestaurantDetails', 'saveRestaurantContent', 'saveGuestSettings', 'generateSuggestions', 'publishChanges', 'approveAllPairings', 'uploadImport'];
    for (const [m, mine, other] of [[tomasz, H, B], [anna, B, H]] as const) {
      for (const name of names) forbidden(await run(m, other.slug, name, { ...(await details(mine.slug)), newSlug: mine.slug, kind: 'sales', contentLocale: 'pl', ...settings }), `${mine.slug} account, ${name} on ${other.slug}`);
      // the takeover of a slug: an owner of one restaurant renames his own restaurant to the other one's slug
      const taken = await run(m, mine.slug, 'saveRestaurantDetails', { ...(await details(mine.slug)), newSlug: other.slug });
      expect(taken.location, 'slug takeover').not.toMatch(/saved=/);
    }
    // team actions under the other slug (the ids are real: the answer must be forbidden, decided before any lookup)
    const bRow = (await members(anna, BISTRO)).find((x) => x.role === 'sommelier')!;
    for (const name of ['changeMemberRole', 'deactivateMember', 'reactivateMember', 'revokeInvitation']) forbidden(await run(tomasz, BISTRO, name, { membershipId: bRow.membershipId, invitationId: bRow.membershipId, role: 'owner', version: String(bRow.version) }), `halka manager, ${name} on bistro`);
    // role rungs inside one restaurant: the manager does not decide pairings, the Wine Director does not edit the restaurant's details
    forbidden(await run(tomasz, HALKA, 'approveAllPairings', {}), 'manager approves pairings');
    forbidden(await run(marek, BISTRO, 'approveAllPairings', {}), 'bistro manager approves pairings');
    forbidden(await run(marta, HALKA, 'saveRestaurantDetails', { ...(await details(HALKA)), name: 'planted' }), 'wine director edits details');
    forbidden(await run(sonia, BISTRO, 'saveRestaurantDetails', { ...(await details(BISTRO)), name: 'planted' }), 'bistro wine director edits details');
    expect(await snapshot()).toEqual(before);
    expect((await rest(HALKA)).name).toBe(H.name);
    expect((await rest(BISTRO)).name).toBe(B.name);
  });

  it('T-32: slug-level API routes (QR, publish, bulk decision, pairing list): both accounts work on their own restaurant, the other slug is 403 with no data and no row changes', async () => {
    const bulk = (s: Session, slug: string) => send(s, 'POST', `/api/v1/restaurants/${slug}/pairings/bulk-decision`, { action: 'approve_all' });
    const publish = (s: Session, slug: string) => send(s, 'POST', `/api/v1/restaurants/${slug}/publish`, {});
    for (const [s, slug] of [[marta, HALKA], [sonia, BISTRO]] as const) {
      expect((await get(s, `/api/v1/restaurants/${slug}/qr`)).status, `${slug} qr`).toBe(200);
      expect((await get(s, `/api/v1/restaurants/${slug}/pairings`)).status, `${slug} pairings`).toBe(200);
      expect((await bulk(s, slug)).status, `${slug} bulk`).toBe(200);
      // something to publish: a manual pairing of the restaurant's own (the earlier cases may have published everything)
      const ids = slug === HALKA ? H : B;
      const free = ids.dishes.flatMap((d) => ids.wines.map((w) => ({ d, w }))).filter(({ d, w }) => !ids.pairings.some((p) => p.dishId === d.id && p.wineId === w.id))[1]!;
      const made = await send(s, 'POST', `/api/v1/pairings?restaurant=${slug}`, { dishId: free.d.id, wineId: free.w.id, comment: 'publish control' });
      expect(made.status, `${slug} pairing to publish`).toBe(201);
      const madeId = ((await made.json()) as { id: string; version: number });
      cleanup.push(async () => { await send(s, 'DELETE', `/api/v1/pairings/${madeId.id}?restaurant=${slug}`, undefined, { 'if-match': `"${madeId.version}"` }); });
      expect((await publish(s, slug)).status, `${slug} publish`).toBe(201);
    }
    const before = await snapshot();
    for (const [s, m, mine, other] of [[sonia, anna, B, H], [marta, tomasz, H, B]] as const) {
      for (const [name, res] of [
        ['qr', await get(s, `/api/v1/restaurants/${other.slug}/qr`)],
        ['pairings', await get(s, `/api/v1/restaurants/${other.slug}/pairings`)],
        ['publish', await publish(s, other.slug)],
        ['bulk decision', await bulk(s, other.slug)],
        ['owner publish', await publish(m, other.slug)]
      ] as const) { expect(res.status, `${mine.slug} account, ${name} on ${other.slug}`).toBe(403); noLeak(await res.text(), onlyIn(other, mine), name); }
    }
    expect((await bulk(tomasz, HALKA)).status).toBe(403); // pairings.decide is the Wine Director's
    const anonymous = await fetch(`${base()}/api/v1/restaurants/${HALKA}/qr`);
    expect(anonymous.status).toBe(401);
    expect(await snapshot()).toEqual(before);
  });
});
