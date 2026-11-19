import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BISTRO, HALKA, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, origin, payload, send, snapshotDatabase, type Session } from './boundaries';

/**
 * docs/security/threat-model.md T-40: the restaurant's picks (spec 2026-11-18-restaurant-picks, R4, R15, R16; AC10, AC11)
 * on PostgreSQL, over plain HTTP. The three checks of .ai/docs/engineering-standards.md §10: a positive control for BOTH
 * restaurants, refused reads and writes (another slug, another restaurant's wine id, a role without `picks.edit`, a field
 * outside the schema, a foreign id in the simulation), and the state AFTER the attempts as whole payloads and a digest of
 * every table. The database is recorded first and put back at the end.
 */
let restoreDatabase: (() => Promise<void>) | undefined;
let halkaWines: Array<{ id: string; name: string }> = [];
let bistroWines: Array<{ id: string; name: string }> = [];
const NOBODY = '00000000-0000-4000-8000-0000000000fe';

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  const ids = async (slug: string) => queryDatabase<{ id: string; name: string }>(db(), 'select w.id, w.name from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.active and w.deleted_at is null order by w.name', [slug]);
  halkaWines = await ids(HALKA);
  // Bistro E2E starts without a catalog: two wines and a dish cloned from Halka's, so both restaurants have something to mark and rank
  await queryDatabase(db(), `insert into wine select (jsonb_populate_record(null::wine, to_jsonb(w) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', (select id from restaurant where slug = $2), 'name', 'Bistro ' || w.name))).* from wine w where w.id in (select id from wine where restaurant_id = (select id from restaurant where slug = $1) and active and deleted_at is null order by name limit 3)`, [HALKA, BISTRO]);
  await queryDatabase(db(), `insert into dish select (jsonb_populate_record(null::dish, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', (select id from restaurant where slug = $2), 'name', 'Bistro ' || d.name))).* from dish d where d.id in (select id from dish where restaurant_id = (select id from restaurant where slug = $1) and status = 'published' order by name limit 2)`, [HALKA, BISTRO]);
  bistroWines = await ids(BISTRO);
}, 120_000);
afterAll(async () => { await restoreDatabase?.(); });

/** The version of the set as the caller can read it; a caller who cannot read it (another slug) sends a well-formed one, so the refusal is not about the header. */
const version = async (s: Session, slug: string) => /"([^"]+)"/.exec((await get(s, `/api/v1/restaurants/${slug}/picks`)).headers.get('etag') ?? '')?.[1] ?? '00000000-1';
const mark = async (s: Session, slug: string, wineId: string, on: boolean, extra: Record<string, string> = {}, body: Record<string, unknown> = { on }) =>
  send(s, 'PUT', `/api/v1/wines/${wineId}/pick?restaurant=${slug}`, body, { 'if-match': `"${await version(s, slug)}"`, ...extra });
const simulate = (s: Session, slug: string, q = '') => get(s, `/api/v1/restaurants/${slug}/picks/simulation${q}`);

describe('access boundaries of the restaurant picks (threat model T-40)', () => {
  it('T-40: both restaurants mark their own wines; another slug, another restaurant\'s wine id, a role without picks.edit and a stray field are refused, and no table or payload changes', async () => {
    const tomasz = await halkaManager(); // Halka, general manager: may change the set
    const marta = await halkaSommelier(); // Halka, Wine Director: sees it, may not change it
    const anna = await bistroOwner(); // Bistro, owner: may change the set
    const sonia = await bistroSommelier(); // Bistro, Wine Director
    expect(halkaWines.length).toBeGreaterThan(3);
    expect(bistroWines.length).toBeGreaterThan(1);
    const [h0, h1] = halkaWines;
    const [b0] = bistroWines;

    // 1. positive control for BOTH sides: the very calls refused below work for the one who owns the data
    expect((await mark(tomasz, HALKA, h0.id, true)).status).toBe(200);
    expect((await mark(anna, BISTRO, b0.id, true)).status).toBe(200);
    for (const [s, slug] of [[tomasz, HALKA], [marta, HALKA], [anna, BISTRO], [sonia, BISTRO]] as Array<[Session, string]>) {
      const read = await get(s, `/api/v1/restaurants/${slug}/picks`);
      expect(read.status).toBe(200);
      expect(((await read.json()) as { picks: unknown[] }).picks).toHaveLength(1);
      expect((await simulate(s, slug)).status).toBe(200);
    }
    // the wine of one restaurant is found by its own owner and by nobody else
    expect(((await (await get(tomasz, `/api/v1/restaurants/${HALKA}/picks`)).json()) as { picks: Array<{ wineId: string }> }).picks[0].wineId).toBe(h0.id);
    expect(((await (await get(anna, `/api/v1/restaurants/${BISTRO}/picks`)).json()) as { picks: Array<{ wineId: string }> }).picks[0].wineId).toBe(b0.id);

    // 2. the state before: whole payloads of both restaurants (set and simulation) and a digest of every table
    const state = async () => ({
      halkaPicks: await payload(tomasz, `/api/v1/restaurants/${HALKA}/picks`),
      halkaSimulation: await payload(tomasz, `/api/v1/restaurants/${HALKA}/picks/simulation`),
      halkaSimulationTry: await payload(tomasz, `/api/v1/restaurants/${HALKA}/picks/simulation?picks=${h1.id}`),
      bistroPicks: await payload(anna, `/api/v1/restaurants/${BISTRO}/picks`),
      bistroSimulation: await payload(anna, `/api/v1/restaurants/${BISTRO}/picks/simulation`),
      tables: await digest()
    });
    const before = await state();
    expect(Object.keys(before.tables)).toEqual(expect.arrayContaining(['restaurant_pick', 'pick_edit']));

    // 3. refused reads: another restaurant's slug is 403 and the body carries nothing of the other side's data
    const foreignReads: Array<[string, Response, string[]]> = [
      ['bistro reads halka picks', await get(anna, `/api/v1/restaurants/${HALKA}/picks`), halkaWines.map((w) => w.name)],
      ['bistro reads halka simulation', await get(sonia, `/api/v1/restaurants/${HALKA}/picks/simulation`), halkaWines.map((w) => w.name)],
      ['halka reads bistro picks', await get(tomasz, `/api/v1/restaurants/${BISTRO}/picks`), bistroWines.map((w) => w.name)],
      ['halka reads bistro simulation', await get(marta, `/api/v1/restaurants/${BISTRO}/picks/simulation?picks=${b0.id}`), bistroWines.map((w) => w.name)]
    ];
    for (const [label, res, secrets] of foreignReads) {
      expect(res.status, label).toBe(403);
      const text = await res.text();
      for (const secret of secrets) expect(text, label).not.toContain(secret);
    }

    // 4. refused writes: a foreign wine id under your own slug is exactly the answer for a wine that does not exist (404);
    //    another restaurant's slug, a role without picks.edit are 403; a field outside the schema is 422
    const missing = await mark(anna, BISTRO, NOBODY, true);
    expect(missing.status).toBe(404);
    const missingBody = await missing.text();
    const foreignOnOwnSlug: Array<[string, Response]> = [
      ['bistro marks halka wine', await mark(anna, BISTRO, h1.id, true)],
      ['bistro unmarks halka wine', await mark(anna, BISTRO, h0.id, false)],
      ['halka marks bistro wine', await mark(tomasz, HALKA, bistroWines[1].id, true)],
      ['halka unmarks bistro wine', await mark(tomasz, HALKA, b0.id, false)]
    ];
    for (const [label, res] of foreignOnOwnSlug) {
      expect(res.status, label).toBe(404);
      expect(await res.text(), label).toBe(missingBody);
    }
    expect((await mark(anna, BISTRO, 'not-a-uuid', true)).status).toBe(404);
    const foreignSlug: Array<[string, Response]> = [
      ['bistro owner marks on halka slug', await mark(anna, HALKA, h1.id, true)],
      ['bistro owner unmarks halka pick', await mark(anna, HALKA, h0.id, false)],
      ['halka manager marks on bistro slug', await mark(tomasz, BISTRO, bistroWines[1].id, true)],
      ['halka manager unmarks bistro pick', await mark(tomasz, BISTRO, b0.id, false)]
    ];
    for (const [label, res] of foreignSlug) expect(res.status, label).toBe(403);
    const lowRole: Array<[string, Response]> = [
      ['halka wine director marks', await mark(marta, HALKA, h1.id, true)],
      ['halka wine director unmarks', await mark(marta, HALKA, h0.id, false)],
      ['bistro wine director marks', await mark(sonia, BISTRO, bistroWines[1].id, true)],
      ['bistro wine director unmarks', await mark(sonia, BISTRO, b0.id, false)]
    ];
    for (const [label, res] of lowRole) {
      expect(res.status, label).toBe(403);
      expect(await errorCode(res), label).toBe('forbidden');
    }
    expect((await mark(tomasz, HALKA, h1.id, true, {}, { on: true, restaurantId: 'x' })).status).toBe(422);
    expect((await mark(anna, BISTRO, bistroWines[1].id, true, {}, { on: true, wineId: h1.id })).status).toBe(422);
    // no CSRF token and no session: refused before anything is read
    expect((await fetch(`${base()}/api/v1/wines/${h1.id}/pick?restaurant=${HALKA}`, { method: 'PUT', headers: { cookie: tomasz.cookie, origin: origin(), 'content-type': 'application/json', 'if-match': `"${await version(tomasz, HALKA)}"` }, body: JSON.stringify({ on: true }) })).status).toBe(403);
    expect((await fetch(`${base()}/api/v1/wines/${h1.id}/pick?restaurant=${HALKA}`, { method: 'PUT', headers: { origin: origin(), 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) })).status).toBe(401);

    // 5. the simulation is no oracle about another restaurant's wines: a foreign id answers like one that does not exist
    const own = await (await simulate(anna, BISTRO, `?picks=${NOBODY}`)).text();
    const foreign = await (await simulate(anna, BISTRO, `?picks=${h1.id}`)).text();
    expect(foreign.split(h1.id).join('X')).toBe(own.split(NOBODY).join('X'));
    // the clones in Bistro are named 'Bistro <name>', so look for the exact JSON string of Halka's name
    for (const w of halkaWines) expect(foreign).not.toContain(`"${w.name}"`);
    const mixed = (await (await simulate(anna, BISTRO, `?picks=${h0.id},${b0.id}`)).json()) as { picks: Array<{ wineId: string; name: string | null; reason: string | null }> };
    expect(mixed.picks.find((p) => p.wineId === h0.id)).toMatchObject({ name: null, reason: 'not_in_list' });
    expect(mixed.picks.find((p) => p.wineId === b0.id)!.name).toBe(b0.name);

    // 6. the state after the attempts: every payload as before and every table digest equal (not a count)
    expect(await state()).toEqual(before);
    // and each restaurant's set is still exactly its own one wine
    expect((await queryDatabase<{ slug: string; wine_id: string }>(db(), 'select r.slug, p.wine_id from restaurant_pick p join restaurant r on r.id = p.restaurant_id order by r.slug', []))).toEqual([{ slug: BISTRO, wine_id: b0.id }, { slug: HALKA, wine_id: h0.id }]);
    expect((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from pick_edit', []))[0].n).toBe('2');
  });
});
