import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BISTRO, HALKA, assertTablesCovered, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, origin, runAction, send, snapshotDatabase, stageImport, type Session } from './boundaries';

/**
 * Lesson 16 (security), docs/security/threat-model.md T-33 and T-34, part 2 of the access-boundary matrix.
 *  - T-33: guests (the `/r/{slug}` pages and the public API) see the PUBLISHED state only: no unpublished pairing decision, note or
 *    translation, no draft or hidden dish, no hidden wine, no note of a rejected or unreviewed pairing, nothing of another restaurant.
 *    The proof compares WHOLE payloads: every guest surface is read before and after a set of unpublished changes and must be
 *    byte-identical; the sommelier picks of the public API are compared with the latest published snapshot in the database; and the
 *    same surfaces show the changes once they are published (positive control: the comparison would see them).
 *  - T-34: the 403/404 policy (docs/security/threat-model.md §4, "403 or 404"): an id or slug of another restaurant is answered exactly
 *    like one that does not exist (same status, same body); 403 only for a slug you are not a member of (real or not) and for a role
 *    below the permission inside your own restaurant.
 * The file changes data (publishes, decisions, statuses, names): it records the database first and puts it back at the end, because
 * the other e2e files run after it on the same database and assume the seed.
 */
const SID = '0b0d0a11-2222-4333-8444-555566667777';
const MARK = `zq${Date.now().toString(36)}`;
const marker = (what: string) => `${what}-${MARK}`;
let marta: Session; let tomasz: Session; let anna: Session; let sonia: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
type Pairing = { id: string; dishId: string; wineId: string; version: number; status: string; role: string | null; comment: string | null };

const publishedDishes = async (slug: string) => queryDatabase<{ id: string; name: string }>(db(), `select d.id, d.name from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 and d.status = 'published' and d.deleted_at is null order by d.name`, [slug]);
const activeWines = async (slug: string) => queryDatabase<{ id: string; name: string }>(db(), `select w.id, w.name from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.active and w.deleted_at is null order by w.name`, [slug]);
const pairingsOf = async (s: Session, slug: string) => ((await (await get(s, `/api/v1/restaurants/${slug}/pairings`)).json()) as { data: Pairing[] }).data;
const latestSnapshot = async (slug: string) => (await queryDatabase<{ snapshot: { pairings: Array<{ dishId: string; wineId: string; status: string; comment: string | null }> } }>(db(), `select v.snapshot from published_version v join restaurant r on r.id = v.restaurant_id where r.slug = $1 order by v.number desc limit 1`, [slug]))[0]?.snapshot;
/**
 * Publishes; `nothing` says whether "nothing to publish" is a legitimate answer here (an earlier file, or the seed, already published
 * this state). Any other answer, or a 422 that is not `nothing_to_publish`, fails: a failed publish must not pass as "nothing to do".
 */
async function publish(s: Session, slug: string, nothing: 'must-publish' | 'may-be-published-already') {
  const r = await send(s, 'POST', `/api/v1/restaurants/${slug}/publish`, {});
  if (r.status === 201) return;
  expect(nothing, `publish ${slug}: ${r.status} ${await r.clone().text()}`).toBe('may-be-published-already');
  expect(r.status, `publish ${slug}`).toBe(422);
  expect(await errorCode(r), `publish ${slug}`).toBe('nothing_to_publish');
}

/** A guest answer as text with the per-request parts taken out (CSP nonce), so that two reads of an unchanged state are equal. */
const normalise = (text: string) => text.replace(/nonce="[^"]*"/g, 'nonce=""').replace(/"nonce":"[^"]*"/g, '"nonce":""');
async function guest(path: string, init?: RequestInit): Promise<{ status: number; text: string }> {
  const res = await fetch(`${base()}${path}`, { redirect: 'manual', ...init });
  return { status: res.status, text: normalise(await res.text()) };
}
const tableBody = (slug: string, dishIds: string[]) => ({ method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ restaurantSlug: slug, dishIds }) });

/** Every guest surface of one restaurant for the given dishes and wine: pages (pl, en) and the public API. */
async function surfaces(slug: string, dishes: string[], wine: string): Promise<Record<string, { status: number; text: string }>> {
  const out: Record<string, { status: number; text: string }> = {};
  const q = `sid=${SID}`;
  const paths = [
    `/r/${slug}?${q}`, `/r/${slug}/menu?${q}`, `/r/${slug}/menu?lang=en&${q}`,
    ...dishes.flatMap((d) => [`/r/${slug}/dish/${d}/wines?${q}`, `/r/${slug}/dish/${d}/wines?lang=en&${q}`, `/api/v1/dishes/${d}/recommendations?restaurant=${slug}`]),
    `/r/${slug}/wine/${wine}?dish=${dishes[0]}&${q}`, `/r/${slug}/table?${q}`, `/r/${slug}/table/result?dishes=${dishes.slice(0, 3).join(',')}&${q}`, `/r/${slug}/how-it-works?${q}`,
    // the waiter's views (public by design, D03): the menu, one dish and the table
    `/r/${slug}/staff?dish=${dishes[0]}&${q}`, `/r/${slug}/staff/table?dishes=${dishes.slice(0, 3).join(',')}&${q}`,
    `/api/v1/public/restaurants/${slug}/menu`
  ];
  for (const p of paths) out[p] = await guest(p);
  out['POST /api/v1/recommendations/table'] = await guest('/api/v1/recommendations/table', tableBody(slug, dishes.slice(0, 3)));
  return out;
}
const leaks = (all: Record<string, { text: string }>, values: string[]) => Object.entries(all).flatMap(([p, r]) => values.filter((v) => r.text.includes(v)).map((v) => `${p}: "${v}"`));

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [marta, tomasz, anna, sonia] = await Promise.all([halkaSommelier(), halkaManager(), bistroOwner(), bistroSommelier()]);
  // Bistro E2E gets data of its own (an earlier file may have imported it already): the positive control of the second tenant
  const bistroDishes = await queryDatabase<{ n: string }>(db(), `select count(*)::text as n from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1`, [BISTRO]);
  if (bistroDishes[0]!.n === '0') {
    for (const kind of ['wines', 'menu'] as const) {
      const job = await stageImport(anna, BISTRO, kind);
      expect((await send(anna, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${BISTRO}`, {})).status).toBe(200);
    }
  }
  for (const t of ['dish', 'wine']) await queryDatabase(db(), `update ${t} set name = name || ' (Bistro E2E)' where name not like '% (Bistro E2E)' and restaurant_id = (select id from restaurant where slug = $1)`, [BISTRO]);
  expect((await send(sonia, 'POST', `/api/v1/restaurants/${BISTRO}/pairings/bulk-decision`, { action: 'approve_all' })).status).toBe(200);
  // the seed and earlier files may have published these exact states already; the 422 must then be `nothing_to_publish`
  await publish(sonia, BISTRO, 'may-be-published-already');
  await publish(marta, HALKA, 'may-be-published-already');
  await assertTablesCovered();
});
// a failed snapshot leaves `restoreDatabase` unset: the real error of beforeAll is the one reported, not a TypeError here
afterAll(async () => { if (restoreDatabase) await restoreDatabase(); });

describe('access boundaries, part 2: guests and the published state (T-33), the 403/404 policy (T-34)', () => {
  it('T-33: unpublished decisions, notes and translations reach no guest page and no public API: whole payloads are byte-identical until publish, and match the published snapshot', async () => {
    const dishes = (await publishedDishes(HALKA)).map((d) => d.id);
    const wine = (await activeWines(HALKA))[0]!.id;
    const pairings = await pairingsOf(marta, HALKA);
    const onPublished = pairings.filter((p) => dishes.includes(p.dishId));
    const approved = onPublished.filter((p) => p.status === 'approved' || p.status === 'modified');
    const suggested = onPublished.filter((p) => p.status === 'suggested');
    expect(approved.length, 'Halka has published sommelier picks').toBeGreaterThan(2);
    expect(suggested.length, 'Halka has suggestions').toBeGreaterThan(1);
    const [edited, rejected] = [approved[0]!, approved.find((p) => p.dishId !== approved[0]!.dishId)!];
    const [toApprove, unreviewed] = [suggested[0]!, suggested.find((p) => p.id !== suggested[0]!.id)!];
    const watched = [...new Set([edited.dishId, rejected.dishId, toApprove.dishId, unreviewed.dishId, ...dishes.slice(0, 2)])];

    const before = await surfaces(HALKA, watched, wine);
    for (const [p, r] of Object.entries(before)) expect(r.status, `positive control ${p}`).toBe(200);
    expect(before[`/r/${HALKA}/menu?sid=${SID}`]!.text).toContain((await publishedDishes(HALKA))[0]!.name);
    const again = await surfaces(HALKA, watched, wine);
    expect(again, 'two reads of an unchanged state are equal (the comparison is meaningful)').toEqual(before);

    // unpublished changes, through the panel's own API and actions
    // one change per request (pairingUpdateSchema), each with the pairing's current version
    const patch = async (p: Pairing, body: Record<string, unknown>) => {
      const version = (await pairingsOf(marta, HALKA)).find((x) => x.id === p.id)!.version;
      const res = await send(marta, 'PATCH', `/api/v1/pairings/${p.id}?restaurant=${HALKA}`, body, { 'if-match': `"${version}"` });
      expect(res.status, `${JSON.stringify(body)}: ${await res.clone().text()}`).toBe(200);
    };
    await patch(edited, { comment: marker('EDITED') });
    await patch(rejected, { comment: marker('REJECTED') });
    await patch(rejected, { status: 'rejected' });
    await patch(toApprove, { comment: marker('APPROVED') });
    await patch(toApprove, { status: 'approved' });
    // a note through the panel makes a suggestion `modified` (a decision, pairing-rules), so the note of a pairing that stays
    // UNREVIEWED is written directly: the publish must still leave it out (the snapshot holds reviewed and rejected pairings only)
    await queryDatabase(db(), `update pairing set comment = $2 where id = $1 and status = 'suggested'`, [unreviewed.id, marker('UNREVIEWED')]);
    expect((await pairingsOf(marta, HALKA)).find((x) => x.id === unreviewed.id)).toMatchObject({ status: 'suggested', comment: marker('UNREVIEWED') });
    expect((await runAction(tomasz, 'saveDishTranslations', HALKA, { dishId: edited.dishId, name_en: marker('EN') })).location).toMatch(/saved=/);
    const unpublished = [marker('EDITED'), marker('REJECTED'), marker('APPROVED'), marker('UNREVIEWED'), marker('EN')];

    const after = await surfaces(HALKA, watched, wine);
    expect(leaks(after, unpublished), 'an unpublished value reached a guest').toEqual([]);
    expect(after, 'every guest payload is unchanged until publish').toEqual(before);

    // the sommelier picks of the public API are EXACTLY the approved pairings of the latest published snapshot (wines still active):
    // asked with the largest page (6), every pick is in the snapshot and every snapshot pick is served (all of them when they fit)
    const snap = (await latestSnapshot(HALKA))!;
    const active = new Set((await activeWines(HALKA)).map((w) => w.id));
    for (const d of watched) {
      const api = (await (await fetch(`${base()}/api/v1/dishes/${d}/recommendations?restaurant=${HALKA}&limit=6`)).json()) as { items: Array<{ wine: { id: string }; tier: string }> };
      const picks = api.items.filter((i) => i.tier !== 'engine').map((i) => i.wine.id);
      const published = new Set(snap.pairings.filter((p) => p.dishId === d && (p.status === 'approved' || p.status === 'modified') && active.has(p.wineId)).map((p) => p.wineId));
      expect(picks.filter((w) => !published.has(w)), `every sommelier pick of dish ${d} is an approved pairing of the published snapshot`).toEqual([]);
      expect(picks.length, `dish ${d}: as many sommelier picks as the snapshot has (up to the page of 6)`).toBe(Math.min(published.size, 6));
      if (published.size <= 6) expect([...published].sort(), `dish ${d}: every approved pick of the snapshot is served`).toEqual([...picks].sort());
      if (d === toApprove.dishId) expect(picks, 'a pairing approved after the publish is not a sommelier pick yet').not.toContain(toApprove.wineId);
      if (d === rejected.dishId) expect(picks, 'a pick rejected after the publish is still served from the snapshot').toContain(rejected.wineId);
    }
    expect(snap.pairings.some((p) => p.comment?.includes(MARK)), 'the snapshot itself holds none of the unpublished notes').toBe(false);

    // positive control: once published, the same surfaces DO show the published note, decision and translation
    await publish(marta, HALKA, 'must-publish');
    const published = await surfaces(HALKA, watched, wine);
    const shown = (v: string) => Object.values(published).some((r) => r.text.includes(v));
    expect(shown(marker('EDITED')), 'a published note is shown').toBe(true);
    expect(shown(marker('APPROVED')), 'a published approval with its note is shown').toBe(true);
    expect(shown(marker('EN')), 'a published translation is shown').toBe(true);
    // ...but never the note of a rejected or of an unreviewed pairing, published or not
    expect(leaks(published, [marker('REJECTED'), marker('UNREVIEWED')]), 'a sommelier-only note reached a guest').toEqual([]);
  });

  it('T-33: draft and hidden dishes and a hidden wine are not served (404 by id, absent from every list and the table), and no guest read changes a row', async () => {
    const [x, y, z, w2] = await publishedDishes(HALKA);
    const wines = await activeWines(HALKA);
    // the dish and wine names are changed to markers only after they leave the guests' view, so any appearance is a leak
    await queryDatabase(db(), `update dish set status = 'hidden' where id = $1`, [x!.id]);
    await queryDatabase(db(), `update dish set status = 'draft' where id = $1`, [y!.id]);
    expect((await runAction(marta, 'setWineAvailability', HALKA, { wineId: wines[0]!.id, active: 'false' })).location).toMatch(/saved=wine_hidden/);
    await queryDatabase(db(), `update dish set name = $2 where id = $1`, [x!.id, marker('HIDDEN-DISH')]);
    await queryDatabase(db(), `update dish set name = $2 where id = $1`, [y!.id, marker('DRAFT-DISH')]);
    await queryDatabase(db(), `update wine set name = $2, producer = $2 where id = $1`, [wines[0]!.id, marker('HIDDEN-WINE')]);
    const secrets = [marker('HIDDEN-DISH'), marker('DRAFT-DISH'), marker('HIDDEN-WINE'), x!.id, y!.id];
    const tables = await digest();
    const naming = (ids: string[]) => queryDatabase<{ n: number }>(db(), `select count(*)::int as n from guest_interaction x where ${ids.map((_, k) => `x::text like '%' || $${k + 1} || '%'`).join(' or ')}`, ids);
    const eventsBefore = await naming([x!.id, y!.id]);

    const all = await surfaces(HALKA, [z!.id, w2!.id], wines[1]!.id);
    for (const [p, r] of Object.entries(all)) expect(r.status, `positive control ${p}`).toBe(200);
    expect(leaks(all, secrets), 'a draft or hidden dish or a hidden wine reached a guest').toEqual([]);
    for (const id of [x!.id, y!.id]) {
      for (const p of [`/r/${HALKA}/dish/${id}/wines`, `/r/${HALKA}/dish/${id}/wines?lang=en`, `/api/v1/dishes/${id}/recommendations?restaurant=${HALKA}`]) {
        const r = await guest(p);
        expect(r.status, p).toBe(404);
        // the asked-for id is in the answer (it is the URL); its name must not be
        expect(leaks({ [p]: r }, secrets.filter((v) => v !== id)), p).toEqual([]);
      }
    }
    // a table of two unpublished dishes is refused (it needs two published), and with one published dish nothing of the others shows
    const t1 = await guest('/api/v1/recommendations/table', tableBody(HALKA, [x!.id, y!.id]));
    expect(t1.status).toBe(422);
    const t2 = await guest('/api/v1/recommendations/table', tableBody(HALKA, [x!.id, y!.id, z!.id, w2!.id]));
    expect(t2.status).toBe(200);
    // (the ids are in the page's own URL, so only the names are looked for there)
    expect(leaks({ t1, t2 }, secrets)).toEqual([]);
    expect(leaks({ page: await guest(`/r/${HALKA}/table/result?dishes=${[x!.id, y!.id, z!.id, w2!.id].join(',')}`) }, secrets.slice(0, 3))).toEqual([]);
    // a hidden wine: its page says "no longer available" and shows nothing of it; it is in no recommendation
    const hiddenWine = await guest(`/r/${HALKA}/wine/${wines[0]!.id}?dish=${z!.id}&lang=en`);
    const hiddenSelected = await guest(`/r/${HALKA}/selected/${wines[0]!.id}?dish=${z!.id}&lang=en`);
    expect([hiddenWine.status, hiddenSelected.status]).toEqual([200, 200]);
    for (const page of [hiddenWine, hiddenSelected]) expect(page.text, 'the page says the wine is gone').toContain('This wine is no longer available');
    expect(leaks({ hiddenWine, hiddenSelected }, [marker('HIDDEN-WINE')])).toEqual([]);
    // by design a guest read records usage events (guest_interaction) and the waiter's table issues a recommendation code; neither
    // ever names the hidden wine or an unpublished dish, and no other table changes
    expect({ ...(await digest()), recommendation_code: tables.recommendation_code, guest_interaction: tables.guest_interaction }, 'guest reads change no other row').toEqual(tables);
    expect(await queryDatabase(db(), 'select count(*)::int as n from recommendation_code where wine_id = $1', [wines[0]!.id])).toEqual([{ n: 0 }]);
    // (a view of the hidden wine's own page is recorded by design, wine page G7; an unpublished dish never is)
    expect(await naming([x!.id, y!.id]), 'no new usage event names an unpublished dish').toEqual(eventsBefore);
  });

  it('T-33: another restaurant\'s dish and wine ids under a slug, and an unknown slug, are 404 with none of its data; both restaurants serve their own (positive control)', async () => {
    const hDish = (await publishedDishes(HALKA))[0]!; const bDish = (await publishedDishes(BISTRO))[0]!;
    const hWine = (await activeWines(HALKA))[0]!; const bWine = (await activeWines(BISTRO))[0]!;
    for (const [slug, dish, wine] of [[HALKA, hDish, hWine], [BISTRO, bDish, bWine]] as const) {
      expect((await guest(`/r/${slug}/menu`)).text, `${slug} menu`).toContain(dish.name);
      expect((await guest(`/r/${slug}/dish/${dish.id}/wines`)).status).toBe(200);
      expect((await guest(`/r/${slug}/wine/${wine.id}`)).status).toBe(200);
      expect((await guest(`/api/v1/dishes/${dish.id}/recommendations?restaurant=${slug}`)).status).toBe(200);
    }
    const tables = await digest();
    const naming = (ids: string[]) => queryDatabase<{ n: number }>(db(), `select count(*)::int as n from guest_interaction x where ${ids.map((_, k) => `x::text like '%' || $${k + 1} || '%'`).join(' or ')}`, ids);
    const eventsBefore = { h: await naming([bDish.id, bWine.id]), b: await naming([hDish.id, hWine.id]) };
    for (const [slug, dish, wine, own] of [[HALKA, bDish, bWine, hDish], [BISTRO, hDish, hWine, bDish]] as const) {
      const foreign = [dish.name, wine.name];
      for (const p of [`/r/${slug}/dish/${dish.id}/wines`, `/r/${slug}/wine/${wine.id}`, `/r/${slug}/selected/${wine.id}?dish=${own.id}`, `/api/v1/dishes/${dish.id}/recommendations?restaurant=${slug}`]) {
        const r = await guest(p);
        expect(r.status, p).toBe(404);
        expect(leaks({ [p]: r }, foreign), p).toEqual([]);
      }
      const table = await guest('/api/v1/recommendations/table', tableBody(slug, [dish.id, own.id]));
      expect(table.status, `table of ${slug} with a foreign dish`).toBe(422);
      expect(leaks({ table, page: await guest(`/r/${slug}/table/result?dishes=${dish.id},${own.id}`) }, foreign)).toEqual([]);
    }
    for (const p of ['/r/no-such-place/menu', '/api/v1/public/restaurants/no-such-place/menu', `/api/v1/dishes/${hDish.id}/recommendations?restaurant=no-such-place`]) expect((await guest(p)).status, p).toBe(404);
    // guest pages record usage events by design (the table page for the own dish); none names the other restaurant's dish or wine
    expect({ ...(await digest()), guest_interaction: tables.guest_interaction }).toEqual(tables);
    expect({ h: await naming([bDish.id, bWine.id]), b: await naming([hDish.id, hWine.id]) }, 'no usage event names a foreign dish or wine').toEqual(eventsBefore);
  });

  it('T-34: 403 vs 404 policy: another restaurant\'s slug answers like a slug that does not exist, another restaurant\'s id like an id that does not exist (status and body), on pages, API routes and actions; 403 is kept for a role below the permission', async () => {
    const GHOST_SLUG = 'no-such-restaurant';
    const GHOST_ID = '6f1e2d3c-4b5a-4968-8776-655443322110';
    type Side = { slug: string; mgr: Session; som: Session; dish: string; wine: string; pairing: string; job: string; inv: string; inv2: string; member: string };
    const side = async (slug: string, mgr: Session, som: Session): Promise<Side> => {
      const dish = (await publishedDishes(slug))[0]!.id;
      const wine = (await activeWines(slug))[0]!.id;
      // a manual pairing of the side's own (DELETE only removes the sommelier's own pairings)
      const free = (await queryDatabase<{ d: string; w: string }>(db(), `select d.id as d, w.id as w from dish d join restaurant r on r.id = d.restaurant_id join wine w on w.restaurant_id = r.id where r.slug = $1 and d.status = 'published' and w.active and not exists (select 1 from pairing p where p.dish_id = d.id and p.wine_id = w.id) order by d.name, w.name limit 1`, [slug]))[0]!;
      const made = await send(som, 'POST', `/api/v1/pairings?restaurant=${slug}`, { dishId: free.d, wineId: free.w, comment: 'policy control' });
      expect(made.status, `${slug} pairing`).toBe(201);
      const invite = async (n: number) => { const r = await send(mgr, 'POST', `/api/v1/restaurants/${slug}/invitations`, { email: `policy-${n}-${slug}@bound-e2e.example`, role: 'sommelier' }); expect(r.status).toBe(201); return ((await r.json()) as { id: string }).id; };
      const member = ((await (await get(mgr, `/api/v1/restaurants/${slug}/team`)).json()) as { members: Array<{ membershipId: string; role: string }> }).members.find((m) => m.role === 'sommelier')!.membershipId;
      return { slug, mgr, som, dish, wine, pairing: ((await made.json()) as { id: string }).id, job: (await stageImport(mgr, slug, 'wines')).id, inv: await invite(1), inv2: await invite(2), member };
    };
    const H = await side(HALKA, tomasz, marta);
    const B = await side(BISTRO, anna, sonia);
    /** The current version of a row (the `If-Match` a real client sends), 1 for an id that does not exist. */
    const ver = async (table: 'pairing' | 'membership', id: string) => (await queryDatabase<{ v: number }>(db(), `select version as v from ${table} where id::text = $1`, [id]))[0]?.v ?? 1;
    /** The body with the parts that name what was asked for taken out (the slug or id, the nonce). */
    const body = async (res: Response, asked: string[]) => { let t = normalise(await res.text()); for (const a of asked) t = t.split(a).join('<asked>'); return t; };
    const same = async (what: string, real: () => Promise<Response>, ghost: () => Promise<Response>, asked: string[], status: number) => {
      const [r, g] = [await real(), await ghost()];
      expect(r.status, `${what}: foreign`).toBe(status);
      expect(g.status, `${what}: non-existent`).toBe(status);
      expect(await body(r, asked), `${what}: the same body for a foreign and a non-existent one`).toEqual(await body(g, asked));
    };
    const pages = (s: Side) => ['', '/menu', '/setup', '/team', '/import/wines', `/menu/${s.dish}`];
    const apiReads = ['/pairings', '/team', '/qr', '/invitations'];
    type Probe = { what: string; call: (me: Side, id: string) => Promise<Response>; id: (s: Side) => string; ok: number };
    const probes: Probe[] = [
      { what: 'page dish', call: (me, id) => get(me.mgr, `/admin/${me.slug}/menu/${id}`), id: (s) => s.dish, ok: 200 },
      { what: 'page wine', call: (me, id) => get(me.mgr, `/admin/${me.slug}/wines/${id}`), id: (s) => s.wine, ok: 200 },
      { what: 'page pairings', call: (me, id) => get(me.mgr, `/admin/${me.slug}/pairings/${id}`), id: (s) => s.dish, ok: 200 },
      { what: 'public dish', call: (me, id) => fetch(`${base()}/api/v1/dishes/${id}/recommendations?restaurant=${me.slug}`), id: (s) => s.dish, ok: 200 },
      { what: 'GET import', call: (me, id) => get(me.mgr, `/api/v1/imports/${id}?restaurant=${me.slug}`), id: (s) => s.job, ok: 200 },
      { what: 'PATCH import rows', call: (me, id) => send(me.mgr, 'PATCH', `/api/v1/imports/${id}/rows?restaurant=${me.slug}`, { rows: [{ rowNumber: 1, include: true }] }), id: (s) => s.job, ok: 200 },
      { what: 'PATCH wine', call: (me, id) => send(me.som, 'PATCH', `/api/v1/wines/${id}?restaurant=${me.slug}`, { active: true }), id: (s) => s.wine, ok: 200 },
      { what: 'PATCH pairing', call: async (me, id) => send(me.som, 'PATCH', `/api/v1/pairings/${id}?restaurant=${me.slug}`, { comment: 'policy note' }, { 'if-match': `"${await ver('pairing', id)}"` }), id: (s) => s.pairing, ok: 200 },
      { what: 'DELETE pairing', call: async (me, id) => send(me.som, 'DELETE', `/api/v1/pairings/${id}?restaurant=${me.slug}`, undefined, { 'if-match': `"${await ver('pairing', id)}"` }), id: (s) => s.pairing, ok: 204 },
      { what: 'DELETE invitation', call: (me, id) => send(me.mgr, 'DELETE', `/api/v1/restaurants/${me.slug}/invitations/${id}`), id: (s) => s.inv, ok: 204 },
      { what: 'PATCH member', call: async (me, id) => send(me.mgr, 'PATCH', `/api/v1/restaurants/${me.slug}/team/${id}`, { role: 'waiter' }, { 'if-match': `"${await ver('membership', id)}"` }), id: (s) => s.member, ok: 200 }
    ];
    const actions: Array<{ name: string; field: string; who: 'mgr' | 'som'; id: (s: Side) => string; extra: Record<string, string> }> = [
      { name: 'setWineAvailability', field: 'wineId', who: 'som', id: (s) => s.wine, extra: { active: 'true' } },
      { name: 'cancelImport', field: 'job', who: 'mgr', id: (s) => s.job, extra: { kind: 'wines' } },
      { name: 'revokeInvitation', field: 'invitationId', who: 'mgr', id: (s) => s.inv2, extra: {} }
    ];
    const tables = await digest();

    for (const [me, other] of [[H, B], [B, H]] as const) {
      const tag = `${me.slug} account`;
      // slug level: the other restaurant's slug is answered like a slug that does not exist (403: no membership)
      for (const path of pages(other)) await same(`${tag}, page ${path}`, () => get(me.mgr, `/admin/${other.slug}${path}`), () => get(me.mgr, `/admin/${GHOST_SLUG}${path}`), [other.slug, GHOST_SLUG], 403);
      for (const path of apiReads) await same(`${tag}, GET api ${path}`, () => get(me.mgr, `/api/v1/restaurants/${other.slug}${path}`), () => get(me.mgr, `/api/v1/restaurants/${GHOST_SLUG}${path}`), [other.slug, GHOST_SLUG], 403);
      await same(`${tag}, POST publish`, () => send(me.som, 'POST', `/api/v1/restaurants/${other.slug}/publish`, {}), () => send(me.som, 'POST', `/api/v1/restaurants/${GHOST_SLUG}/publish`, {}), [other.slug, GHOST_SLUG], 403);
      // object level, under your OWN slug: the other restaurant's id is answered like an id that does not exist (404)
      for (const p of probes) await same(`${tag}, ${p.what}`, () => p.call(me, p.id(other)), () => p.call(me, GHOST_ID), [p.id(other), GHOST_ID], 404);
      // server actions: the same flash for a foreign id and a missing one, and for a foreign slug and a missing one
      for (const a of actions) {
        const s = me[a.who];
        const foreign = await runAction(s, a.name, me.slug, { [a.field]: a.id(other), ...a.extra });
        const ghost = await runAction(s, a.name, me.slug, { [a.field]: GHOST_ID, ...a.extra });
        expect(foreign.location, `${tag}, ${a.name}`).toContain('error=not_found');
        expect(foreign, `${tag}, ${a.name}`).toEqual(ghost);
        const fs = await runAction(s, a.name, other.slug, { [a.field]: a.id(other), ...a.extra });
        const gs = await runAction(s, a.name, GHOST_SLUG, { [a.field]: a.id(other), ...a.extra });
        expect(fs.location, `${tag}, ${a.name} on a foreign slug`).toContain('error=forbidden');
        expect(fs.location.replace(other.slug, '<asked>')).toEqual(gs.location.replace(GHOST_SLUG, '<asked>'));
      }
    }
    // anonymous: the same redirect to sign in for a real and a missing slug (only the asked path differs)
    const anon = async (slug: string) => { const r = await fetch(`${base()}/admin/${slug}/menu`, { redirect: 'manual' }); return { status: r.status, location: (r.headers.get('location') ?? '').split(encodeURIComponent(slug)).join('<asked>') }; };
    for (const slug of [HALKA, BISTRO]) expect(await anon(slug)).toEqual(await anon(GHOST_SLUG));
    // where 403 is right: a known resource of your own restaurant, a role below the permission (the caller may know it exists)
    for (const me of [H, B]) {
      expect((await get(me.som, `/admin/${me.slug}/team`)).status, `${me.slug} Wine Director, own team page`).toBe(403);
      expect((await get(me.som, `/api/v1/restaurants/${me.slug}/team`)).status, `${me.slug} Wine Director, own team list`).toBe(403);
    }
    expect((await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/pairings/bulk-decision`, { action: 'approve_all' })).status, 'manager, own pairings decision').toBe(403);
    expect((await runAction(tomasz, 'approveAllPairings', HALKA, {})).location, 'manager, own pairings decision (action)').toContain('error=forbidden');
    expect(await digest(), 'no refused call changed a row').toEqual(tables);

    // positive controls: the very same calls work for the restaurant that owns the data, both restaurants (changes come last)
    for (const me of [H, B]) {
      for (const path of pages(me)) expect((await get(me.mgr, `/admin/${me.slug}${path}`)).status, `${me.slug} page ${path}`).toBe(200);
      for (const path of apiReads) expect((await get(me.mgr, `/api/v1/restaurants/${me.slug}${path}`)).status, `${me.slug} api ${path}`).toBe(200);
      expect((await send(me.som, 'POST', `/api/v1/restaurants/${me.slug}/publish`, {})).status, `${me.slug} publish`).toBe(201);
      const control = async (p: Probe) => { const r = await p.call(me, p.id(me)); expect(r.status, `${me.slug} ${p.what}: ${r.status === p.ok ? '' : await r.text()}`).toBe(p.ok); };
      // the member's role change ends the Wine Director's access, so it comes after the actions she runs
      for (const p of probes.filter((x) => x.what !== 'PATCH member')) await control(p);
      for (const a of actions) expect((await runAction(me[a.who], a.name, me.slug, { [a.field]: a.id(me), ...a.extra })).location, `${me.slug} ${a.name}`).toMatch(/[?&]saved=/);
      await control(probes.find((x) => x.what === 'PATCH member')!);
    }
  });
});
