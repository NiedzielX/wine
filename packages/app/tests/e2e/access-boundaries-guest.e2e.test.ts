import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BISTRO, HALKA, base, bistroOwner, bistroSommelier, db, digest, get, halkaManager, halkaSommelier, origin, runAction, send, snapshotDatabase, stageImport, type Session } from './boundaries';

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
let restoreDatabase: () => Promise<void>;
type Pairing = { id: string; dishId: string; wineId: string; version: number; status: string; role: string | null; comment: string | null };

const publishedDishes = async (slug: string) => queryDatabase<{ id: string; name: string }>(db(), `select d.id, d.name from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 and d.status = 'published' and d.deleted_at is null order by d.name`, [slug]);
const activeWines = async (slug: string) => queryDatabase<{ id: string; name: string }>(db(), `select w.id, w.name from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.active and w.deleted_at is null order by w.name`, [slug]);
const pairingsOf = async (s: Session, slug: string) => ((await (await get(s, `/api/v1/restaurants/${slug}/pairings`)).json()) as { data: Pairing[] }).data;
const latestSnapshot = async (slug: string) => (await queryDatabase<{ snapshot: { pairings: Array<{ dishId: string; wineId: string; status: string; comment: string | null }> } }>(db(), `select v.snapshot from published_version v join restaurant r on r.id = v.restaurant_id where r.slug = $1 order by v.number desc limit 1`, [slug]))[0]?.snapshot;
const publish = async (s: Session, slug: string) => { const r = await send(s, 'POST', `/api/v1/restaurants/${slug}/publish`, {}); expect([201, 422], `publish ${slug}`).toContain(r.status); };

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
  await publish(sonia, BISTRO);
  await publish(marta, HALKA);
});
afterAll(async () => { await restoreDatabase(); });

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

    // the sommelier picks of the public API are exactly the approved pairings of the latest published snapshot (wines still active)
    const snap = (await latestSnapshot(HALKA))!;
    const active = new Set((await activeWines(HALKA)).map((w) => w.id));
    for (const d of watched) {
      const api = JSON.parse(after[`/api/v1/dishes/${d}/recommendations?restaurant=${HALKA}`]!.text) as { items: Array<{ wine: { id: string }; tier: string }> };
      const picks = api.items.filter((i) => i.tier !== 'engine').map((i) => i.wine.id);
      const published = new Set(snap.pairings.filter((p) => p.dishId === d && (p.status === 'approved' || p.status === 'modified') && active.has(p.wineId)).map((p) => p.wineId));
      expect(picks.filter((w) => !published.has(w)), `every sommelier pick of dish ${d} is an approved pairing of the published snapshot`).toEqual([]);
      if (d === toApprove.dishId) expect(picks, 'a pairing approved after the publish is not a sommelier pick yet').not.toContain(toApprove.wineId);
      if (d === rejected.dishId && published.has(rejected.wineId)) expect(picks.length, 'a pick rejected after the publish is still served from the snapshot').toBeGreaterThan(0);
    }
    expect(snap.pairings.some((p) => p.comment?.includes(MARK)), 'the snapshot itself holds none of the unpublished notes').toBe(false);

    // positive control: once published, the same surfaces DO show the published note, decision and translation
    await publish(marta, HALKA);
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
    const hiddenWine = await guest(`/r/${HALKA}/wine/${wines[0]!.id}?dish=${z!.id}`);
    const hiddenSelected = await guest(`/r/${HALKA}/selected/${wines[0]!.id}?dish=${z!.id}`);
    expect([hiddenWine.status, hiddenSelected.status]).toEqual([200, 200]);
    expect(leaks({ hiddenWine, hiddenSelected }, [marker('HIDDEN-WINE')])).toEqual([]);
    // the waiter's table view issues a recommendation code by design (spec 2026-10-16-recommendation-code); never for the hidden wine
    expect({ ...(await digest()), recommendation_code: tables.recommendation_code }, 'guest reads change no other row').toEqual(tables);
    expect(await queryDatabase(db(), 'select count(*)::int as n from recommendation_code where wine_id = $1', [wines[0]!.id])).toEqual([{ n: 0 }]);
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
    expect(await digest()).toEqual(tables);
  });

  it('T-34: 403 vs 404 policy: another restaurant\'s slug answers like a slug that does not exist, another restaurant\'s id like an id that does not exist (status and body), on pages, API routes and actions; 403 is kept for a role below the permission', async () => {
    const GHOST_SLUG = 'no-such-restaurant';
    const GHOST_ID = '6f1e2d3c-4b5a-4968-8776-655443322110';
    const bDish = (await publishedDishes(BISTRO))[0]!.id; const bWine = (await activeWines(BISTRO))[0]!.id;
    const bPairing = (await pairingsOf(sonia, BISTRO))[0]!;
    const job = await stageImport(anna, BISTRO, 'wines');
    const bInvitation = await send(anna, 'POST', `/api/v1/restaurants/${BISTRO}/invitations`, { email: `policy@bound-e2e.example`, role: 'sommelier' });
    expect(bInvitation.status).toBe(201);
    const bInv = ((await bInvitation.json()) as { id: string }).id;
    const bMember = ((await (await get(anna, `/api/v1/restaurants/${BISTRO}/team`)).json()) as { members: Array<{ membershipId: string; version: number; role: string }> }).members.find((m) => m.role === 'sommelier')!;
    const tables = await digest();
    /** The body with the restaurant-specific parts taken out: the slug or id that was asked for, and the nonce. */
    const body = async (res: Response, asked: string[]) => { let t = normalise(await res.text()); for (const a of asked) t = t.split(a).join('<asked>'); return t; };
    const same = async (what: string, real: () => Promise<Response>, ghost: () => Promise<Response>, asked: string[], status: number) => {
      const [r, g] = [await real(), await ghost()];
      expect(r.status, `${what}: foreign`).toBe(status);
      expect(g.status, `${what}: non-existent`).toBe(status);
      expect(await body(r, asked), `${what}: the same body for a foreign and a non-existent one`).toEqual(await body(g, asked));
    };

    // slug level, signed in as Halka's manager: Bistro's slug is answered like a slug that does not exist (403: no membership)
    for (const path of ['', '/menu', '/setup', '/team', '/import/wines', `/menu/${bDish}`]) {
      await same(`page ${path}`, () => get(tomasz, `/admin/${BISTRO}${path}`), () => get(tomasz, `/admin/${GHOST_SLUG}${path}`), [BISTRO, GHOST_SLUG], 403);
    }
    for (const path of ['/pairings', '/team', '/qr', '/invitations']) {
      await same(`GET api ${path}`, () => get(tomasz, `/api/v1/restaurants/${BISTRO}${path}`), () => get(tomasz, `/api/v1/restaurants/${GHOST_SLUG}${path}`), [BISTRO, GHOST_SLUG], 403);
    }
    await same('POST publish', () => send(tomasz, 'POST', `/api/v1/restaurants/${BISTRO}/publish`, {}), () => send(tomasz, 'POST', `/api/v1/restaurants/${GHOST_SLUG}/publish`, {}), [BISTRO, GHOST_SLUG], 403);
    // anonymous: the same redirect to sign in (only the asked path differs)
    const anon = async (slug: string) => { const r = await fetch(`${base()}/admin/${slug}/menu`, { redirect: 'manual' }); return { status: r.status, location: (r.headers.get('location') ?? '').split(encodeURIComponent(slug)).join('<asked>') }; };
    expect(await anon(BISTRO)).toEqual(await anon(GHOST_SLUG));

    // object level, under your OWN slug: another restaurant's id is answered like an id that does not exist (404)
    const ids: Array<[string, (id: string) => Promise<Response>, string]> = [
      ['page dish', (id) => get(tomasz, `/admin/${HALKA}/menu/${id}`), bDish],
      ['page wine', (id) => get(tomasz, `/admin/${HALKA}/wines/${id}`), bWine],
      ['page pairings', (id) => get(tomasz, `/admin/${HALKA}/pairings/${id}`), bDish],
      ['PATCH wine', (id) => send(marta, 'PATCH', `/api/v1/wines/${id}?restaurant=${HALKA}`, { active: true }), bWine],
      ['PATCH pairing', (id) => send(marta, 'PATCH', `/api/v1/pairings/${id}?restaurant=${HALKA}`, { comment: 'x' }, { 'if-match': `"${bPairing.version}"` }), bPairing.id],
      ['DELETE pairing', (id) => send(marta, 'DELETE', `/api/v1/pairings/${id}?restaurant=${HALKA}`, undefined, { 'if-match': `"${bPairing.version}"` }), bPairing.id],
      ['GET import', (id) => get(tomasz, `/api/v1/imports/${id}?restaurant=${HALKA}`), job.id],
      ['PATCH import rows', (id) => send(tomasz, 'PATCH', `/api/v1/imports/${id}/rows?restaurant=${HALKA}`, { rows: [{ rowNumber: 1, include: true }] }), job.id],
      ['DELETE invitation', (id) => send(tomasz, 'DELETE', `/api/v1/restaurants/${HALKA}/invitations/${id}`), bInv],
      ['PATCH member', (id) => send(tomasz, 'PATCH', `/api/v1/restaurants/${HALKA}/team/${id}`, { role: 'waiter' }, { 'if-match': `"${bMember.version}"` }), bMember.membershipId],
      ['public dish', (id) => fetch(`${base()}/api/v1/dishes/${id}/recommendations?restaurant=${HALKA}`), bDish]
    ];
    for (const [what, call, foreignId] of ids) await same(what, () => call(foreignId), () => call(GHOST_ID), [foreignId, GHOST_ID], 404);
    // server actions: the same flash for a foreign id and a non-existent one (not_found), and for a foreign slug and a non-existent one (forbidden)
    for (const [name, field, foreignId, s] of [['setWineAvailability', 'wineId', bWine, marta], ['approvePairing', 'pairingId', bPairing.id, marta], ['cancelImport', 'job', job.id, tomasz], ['revokeInvitation', 'invitationId', bInv, tomasz]] as const) {
      const a = await runAction(s, name, HALKA, { [field]: foreignId, active: 'false', version: '1', kind: 'wines' });
      const g = await runAction(s, name, HALKA, { [field]: GHOST_ID, active: 'false', version: '1', kind: 'wines' });
      expect(a.location, name).toContain('error=not_found');
      expect(a, name).toEqual(g);
      const fs = await runAction(s, name, BISTRO, { [field]: foreignId, active: 'false', version: '1', kind: 'wines' });
      const gs = await runAction(s, name, GHOST_SLUG, { [field]: foreignId, active: 'false', version: '1', kind: 'wines' });
      expect(fs.location, `${name} on a foreign slug`).toContain('error=forbidden');
      expect(fs.location.replace(BISTRO, '<asked>')).toEqual(gs.location.replace(GHOST_SLUG, '<asked>'));
    }
    // where 403 is right: a known resource of your own restaurant, a role below the permission (the caller may know it exists)
    expect((await get(marta, `/admin/${HALKA}/team`)).status, 'Wine Director, own team page').toBe(403);
    expect((await get(marta, `/api/v1/restaurants/${HALKA}/team`)).status, 'Wine Director, own team list').toBe(403);
    expect((await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/pairings/bulk-decision`, { action: 'approve_all' })).status, 'manager, own pairings decision').toBe(403);
    expect((await runAction(tomasz, 'approveAllPairings', HALKA, {})).location, 'manager, own pairings decision (action)').toContain('error=forbidden');
    expect(await digest(), 'no refused call changed a row').toEqual(tables);
  });
});
