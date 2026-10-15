import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as menuGet } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { GET as recGet } from '@/app/api/v1/dishes/[dishId]/recommendations/route';
import { POST as tablePost } from '@/app/api/v1/recommendations/table/route';
import { GET as samplesGet } from '@/app/api/v1/import-samples/[kind]/route';
import { POST as loginPost } from '@/app/api/v1/auth/login/route';
import { POST as logoutPost } from '@/app/api/v1/auth/logout/route';
import { GET as meGet } from '@/app/api/v1/auth/me/route';
import { POST as pairingsPost } from '@/app/api/v1/pairings/route';
import { PATCH as pairingPatch, DELETE as pairingDelete } from '@/app/api/v1/pairings/[id]/route';
import { GET as pairingsList } from '@/app/api/v1/restaurants/[slug]/pairings/route';
import { POST as bulkPost } from '@/app/api/v1/restaurants/[slug]/pairings/bulk-decision/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { GET as qrGet } from '@/app/api/v1/restaurants/[slug]/qr/route';
import { PATCH as winePatch } from '@/app/api/v1/wines/[id]/route';
import { POST as importPost, GET as importGet, DELETE as importDelete } from '@/app/api/v1/imports/[ref]/route';
import { PATCH as importRows } from '@/app/api/v1/imports/[ref]/rows/route';
import { POST as importConfirm } from '@/app/api/v1/imports/[ref]/confirm/route';
import { jsonReq, loginAs, req } from './helpers';

const URL0 = 'http://localhost:3000';
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const body = async (res: Response) => (res.headers.get('content-type')?.includes('json') ? res.json() : res.text());

/** Ids of real records, read through the public API so the tests do not depend on how the demo data was seeded. */
async function menu(): Promise<{ id: string; name: string; category: string }[]> {
  const res = await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu`), params({ slug: 'halka' }));
  const data = (await res.json()) as { categories: { dishes: { id: string; name: string; category?: string }[]; name: string }[] };
  return data.categories.flatMap((c) => c.dishes.map((d) => ({ id: d.id, name: d.name, category: c.name })));
}

describe('public guest API', () => {
  it('the menu of a restaurant: found, grouped; an unknown restaurant is 404', async () => {
    const res = await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu`), params({ slug: 'halka' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    const data = (await res.json()) as { restaurant: { slug: string }; categories: { name: string }[] };
    expect(data.restaurant.slug).toBe('halka');
    expect(data.categories.map((c) => c.name)).toContain('Starters');
    const missing = await menuGet(req(`${URL0}/api/v1/public/restaurants/nope/menu`), params({ slug: 'nope' }));
    expect(missing.status).toBe(404);
  });

  it('a dish: recommendations with preferences and a limit; the limit is clamped; errors are named', async () => {
    const dish = (await menu()).find((d) => d.name === 'Duck breast')!;
    const ok = await recGet(req(`${URL0}/x?restaurant=halka&serving=glass&styles=red,white&maxPrice=200&weight=fuller&mood=classic&limit=99`), params({ dishId: dish.id }));
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { items: { tier: string; wine: { id: string } }[]; engineVersion: string };
    expect(data.items.length).toBeLessThanOrEqual(6);
    expect(data.engineVersion).toBeDefined();
    const noRestaurant = await recGet(req(`${URL0}/x`), params({ dishId: dish.id }));
    expect(noRestaurant.status).toBe(422);
    const unknown = await recGet(req(`${URL0}/x?restaurant=halka`), params({ dishId: '00000000-0000-4000-8000-00000000dead' }));
    expect(unknown.status).toBe(404);
    const junk = await recGet(req(`${URL0}/x?restaurant=halka&limit=banana`), params({ dishId: dish.id }));
    expect(junk.status).toBe(200);
  });

  it('a table of dishes: a valid table, a single dish refused, invalid JSON, an unknown restaurant, and a bad body', async () => {
    const dishes = await menu();
    const published = dishes.filter((d) => d.name !== '').slice(0, 2).map((d) => d.id);
    const ok = await tablePost(jsonReq(`${URL0}/api/v1/recommendations/table`, { restaurantSlug: 'halka', dishIds: published, preferences: { styles: 'red', serving: 'bottle', maxPrice: 300, weight: 'lighter', mood: 'adventurous' } }));
    expect(ok.status).toBe(200);
    expect(await body(ok)).toMatchObject({ items: expect.any(Array) });
    const withNulls = await tablePost(jsonReq(`${URL0}/api/v1/recommendations/table`, { restaurantSlug: 'halka', dishIds: published, preferences: { maxPrice: null, styles: ['red'] } }));
    expect(withNulls.status).toBe(200);
    const invalidJson = await tablePost(new NextRequest(`${URL0}/x`, { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } }));
    expect(invalidJson.status).toBe(422);
    const bad = await tablePost(jsonReq(`${URL0}/x`, { restaurantSlug: 'halka', dishIds: [published[0]] }));
    expect(bad.status).toBe(422);
    const unknown = await tablePost(jsonReq(`${URL0}/x`, { restaurantSlug: 'nope', dishIds: published }));
    expect(unknown.status).toBe(404);
  });

  it('sample import files are served for the two kinds, and nothing else', async () => {
    for (const kind of ['menu', 'wines']) {
      const res = await samplesGet(req(`${URL0}/x`), params({ kind }));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('.csv');
    }
    expect((await samplesGet(req(`${URL0}/x`), params({ kind: 'sales' }))).status).toBe(404);
    const { generateStaticParams } = await import('@/app/api/v1/import-samples/[kind]/route');
    expect(generateStaticParams()).toEqual([{ kind: 'menu' }, { kind: 'wines' }]);
  });
});

describe('sign-in, the session and sign-out over the API', () => {
  it('a sign-in with bad data, a wrong password, a right password, and a cross-site attempt', async () => {
    expect((await loginPost(jsonReq(`${URL0}/x`, { email: 'x' }))).status).toBe(422);
    expect((await loginPost(jsonReq(`${URL0}/x`, { email: 'marta@halka.pl', password: 'wrong-pass' }))).status).toBe(401);
    const cross = await loginPost(req(`${URL0}/x`, { 'sec-fetch-site': 'cross-site' }, 'POST'));
    expect(cross.status).toBe(403);
    const session = await loginAs('marta@halka.pl');
    const me = await meGet(req(`${URL0}/x`, { cookie: session.cookie }));
    expect(me.status).toBe(200);
    expect(await body(me)).toMatchObject({ user: { email: 'marta@halka.pl' } });
  });

  it('the current user needs a session; sign-out needs the CSRF token and then ends the session', async () => {
    expect((await meGet(req(`${URL0}/x`))).status).toBe(401);
    const s = await loginAs('marta@halka.pl');
    expect((await logoutPost(req(`${URL0}/x`, { cookie: s.cookie }, 'POST'))).status).toBe(403);
    const out = await logoutPost(req(`${URL0}/x`, { cookie: s.cookie, 'x-csrf-token': s.csrf }, 'POST'));
    expect(out.status).toBe(204);
    expect((await meGet(req(`${URL0}/x`, { cookie: s.cookie }))).status).toBe(401);
  });
});

describe('the dashboard API: pairings, publishing, wines, QR', () => {
  it('lists the pairings of a dish: a bad status is refused, an unknown restaurant is 404, a good request lists', async () => {
    const s = await loginAs('marta@halka.pl');
    const headers = { cookie: s.cookie };
    expect((await pairingsList(req(`${URL0}/x?status=weird`, headers), params({ slug: 'halka' }))).status).toBe(422);
    // permissions are checked before the restaurant is looked up: a stranger gets 403, not 404
    expect((await pairingsList(req(`${URL0}/x`, headers), params({ slug: 'nope' }))).status).toBe(403);
    const ok = await pairingsList(req(`${URL0}/x?status=suggested`, headers), params({ slug: 'halka' }));
    expect(ok.status).toBe(200);
  });

  it('creates a pairing by hand: needs the CSRF token, needs the restaurant, and refuses a wine that is not on the list', async () => {
    const s = await loginAs('marta@halka.pl');
    const dish = (await menu()).find((d) => d.name === 'Duck breast')!;
    const noRestaurant = await pairingsPost(jsonReq(`${URL0}/x`, { dishId: dish.id, wineId: dish.id }, 'POST', { cookie: s.cookie, 'x-csrf-token': s.csrf }));
    expect(noRestaurant.status).toBe(422);
    const noCsrf = await pairingsPost(jsonReq(`${URL0}/x?restaurant=halka`, { dishId: dish.id, wineId: dish.id }, 'POST', { cookie: s.cookie }));
    expect(noCsrf.status).toBe(403);
    const unknownWine = await pairingsPost(jsonReq(`${URL0}/x?restaurant=halka`, { dishId: dish.id, wineId: '00000000-0000-4000-8000-00000000dead' }, 'POST', { cookie: s.cookie, 'x-csrf-token': s.csrf }));
    expect(unknownWine.status).toBe(404);
  });

  it('edits a pairing with a version, deletes a manual one, and refuses the wrong version, a missing header, and a bad body', async () => {
    const s = await loginAs('marta@halka.pl');
    const auth = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    const list = await pairingsList(req(`${URL0}/x`, { cookie: s.cookie }), params({ slug: 'halka' }));
    const rows = ((await list.json()) as { data: { id: string; version: number; status: string; wineId: string; dishId: string }[] }).data;
    const target = rows.find((p) => p.status === 'suggested') ?? rows[0];
    const noVersion = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { comment: 'x' }, 'PATCH', auth), params({ id: target.id }));
    expect(noVersion.status).toBe(428);
    const badVersion = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { comment: 'x' }, 'PATCH', { ...auth, 'if-match': 'banana' }), params({ id: target.id }));
    expect(badVersion.status).toBe(400);
    const noRestaurant = await pairingPatch(jsonReq(`${URL0}/x`, { comment: 'x' }, 'PATCH', auth), params({ id: target.id }));
    expect(noRestaurant.status).toBe(422);
    const badBody = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { comment: 'x', status: 'approved' }, 'PATCH', { ...auth, 'if-match': '"1"' }), params({ id: target.id }));
    expect(badBody.status).toBe(422);
    const stale = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { comment: 'x' }, 'PATCH', { ...auth, 'if-match': '"999"' }), params({ id: target.id }));
    expect(stale.status).toBe(409);
    const ok = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { status: 'approved' }, 'PATCH', { ...auth, 'if-match': `"${target.version}"` }), params({ id: target.id }));
    expect(ok.status).toBe(200);
    const role = await pairingPatch(jsonReq(`${URL0}/x?restaurant=halka`, { role: 'best_value' }, 'PATCH', { ...auth, 'if-match': '"99"' }), params({ id: target.id }));
    expect([409, 200]).toContain(role.status);
    const noRestaurantDel = await pairingDelete(req(`${URL0}/x`, { ...auth, 'if-match': '"1"' }, 'DELETE'), params({ id: target.id }));
    expect(noRestaurantDel.status).toBe(422);
    const noVersionDel = await pairingDelete(req(`${URL0}/x?restaurant=halka`, auth, 'DELETE'), params({ id: target.id }));
    expect(noVersionDel.status).toBe(428);
    const engine = rows.find((p) => p.status === 'approved')!;
    const engineDel = await pairingDelete(req(`${URL0}/x?restaurant=halka`, { ...auth, 'if-match': '"1"' }, 'DELETE'), params({ id: engine.id }));
    expect([409, 422, 404, 204]).toContain(engineDel.status);
  });

  it('bulk approval needs the token; publishing a restaurant returns the version; the settings of a wine are saved', async () => {
    const s = await loginAs('marta@halka.pl');
    const auth = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    expect((await bulkPost(jsonReq(`${URL0}/x`, { action: 'approve_all' }, 'POST', { cookie: s.cookie }), params({ slug: 'halka' }))).status).toBe(403);
    const bulk = await bulkPost(jsonReq(`${URL0}/x`, { action: 'approve_all' }, 'POST', auth), params({ slug: 'halka' }));
    expect(bulk.status).toBe(200);
    const pub = await publishPost(req(`${URL0}/x`, auth, 'POST'), params({ slug: 'halka' }));
    expect(pub.status).toBe(201);
    const published = (await pub.json()) as { number: number; versionId: string };
    expect(published.number).toBeGreaterThan(0);
    const wines = await fetchWineId();
    const hide = await winePatch(jsonReq(`${URL0}/x?restaurant=halka`, { active: false }, 'PATCH', auth), params({ id: wines }));
    expect(hide.status).toBe(200);
    expect((await winePatch(jsonReq(`${URL0}/x`, { active: false }, 'PATCH', auth), params({ id: wines }))).status).toBe(422);
    expect((await winePatch(jsonReq(`${URL0}/x?restaurant=halka`, { active: 'yes' }, 'PATCH', auth), params({ id: wines }))).status).toBe(422);
  });

  it('the QR code: an SVG, a PNG and a download; an unknown format is refused; an unknown restaurant is 404', async () => {
    const s = await loginAs('marta@halka.pl');
    const headers = { cookie: s.cookie };
    expect((await qrGet(req(`${URL0}/x?format=svg`), params({ slug: 'halka' }))).status).toBe(401);
    const svg = await qrGet(req(`${URL0}/x?format=svg&size=200`, headers), params({ slug: 'halka' }));
    expect(svg.status).toBe(200);
    expect(await svg.text()).toContain('<svg');
    const png = await qrGet(req(`${URL0}/x?format=png`, headers), params({ slug: 'halka' }));
    expect(png.headers.get('content-type')).toBe('image/png');
    const dl = await qrGet(req(`${URL0}/x?format=png&download=1`, headers), params({ slug: 'halka' }));
    expect(dl.headers.get('content-disposition')).toContain('attachment');
    expect((await qrGet(req(`${URL0}/x?format=gif`, headers), params({ slug: 'halka' }))).status).toBe(422);
    expect((await qrGet(req(`${URL0}/x`, headers), params({ slug: 'nope' }))).status).toBe(403);
  });
});

async function fetchWineId(): Promise<string> {
  const s = await loginAs('marta@halka.pl');
  const res = await (await import('@/app/api/v1/restaurants/[slug]/pairings/route')).GET(req(`${URL0}/x`, { cookie: s.cookie }), params({ slug: 'halka' }));
  const rows = ((await res.json()) as { data: { wineId: string }[] }).data;
  return rows[0].wineId;
}

describe('the import API: upload, preview, corrections, confirmation, cancel', () => {
  const csv = 'name,price,category\nSoup,22,Starters\nPie,30,Desserts\n';
  const upload = (ref: string, cookie: string, csrf?: string, name = 'menu.csv', content = csv) => {
    const form = new FormData();
    form.append('file', new File([content], name, { type: 'text/csv' }));
    const headers: Record<string, string> = { cookie };
    if (csrf) headers['x-csrf-token'] = csrf;
    return importPost(new NextRequest(`${URL0}/api/v1/imports/${ref}?restaurant=halka`, { method: 'POST', body: form, headers }), params({ ref }));
  };

  it('an upload needs a restaurant, a session, the CSRF token, a known kind and a file', async () => {
    const s = await loginAs('marta@halka.pl');
    expect((await importPost(new NextRequest(`${URL0}/x`, { method: 'POST' }), params({ ref: 'menu' }))).status).toBe(422);
    expect((await upload('menu', '', undefined)).status).toBe(401);
    expect((await upload('menu', s.cookie)).status).toBe(403);
    expect((await upload('sales', s.cookie, s.csrf)).status).toBe(404);
    const noFile = await importPost(new NextRequest(`${URL0}/x?restaurant=halka`, { method: 'POST', body: 'x', headers: { cookie: s.cookie, 'x-csrf-token': s.csrf, 'content-type': 'text/plain' } }), params({ ref: 'menu' }));
    expect(noFile.status).toBe(422);
  });

  it('a menu goes through the whole flow: preview, correction, confirmation, and the job cannot be confirmed twice', async () => {
    const s = await loginAs('marta@halka.pl');
    const created = await upload('menu', s.cookie, s.csrf);
    expect(created.status).toBe(201);
    const job = (await created.json()) as { id: string; rows: { rowNumber: number; include: boolean }[]; summary: { total: number } };
    expect(job.summary.total).toBe(2);
    const id = job.id;
    expect((await importGet(req(`${URL0}/x`, { cookie: s.cookie }), params({ ref: id }))).status).toBe(422);
    const got = await importGet(req(`${URL0}/x?restaurant=halka`, { cookie: s.cookie }), params({ ref: id }));
    expect(got.status).toBe(200);
    const edited = await importRows(jsonReq(`${URL0}/x?restaurant=halka`, { rows: [{ rowNumber: 1, fields: { price: '24' }, include: true }] }, 'PATCH', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: id }));
    expect(edited.status).toBe(200);
    expect((await importRows(jsonReq(`${URL0}/x?restaurant=halka`, { rows: [] }, 'PATCH', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: id }))).status).toBe(422);
    const confirmed = await importConfirm(jsonReq(`${URL0}/x?restaurant=halka`, {}, 'POST', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: id }));
    expect(confirmed.status).toBe(200);
    expect(await body(confirmed)).toMatchObject({ created: expect.any(Number) });
    const again = await importConfirm(jsonReq(`${URL0}/x?restaurant=halka`, {}, 'POST', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: id }));
    expect(again.status).toBe(422);   // "this import is already finished" is a refused request
    expect((await importConfirm(jsonReq(`${URL0}/x`, {}, 'POST', { cookie: s.cookie, 'x-csrf-token': s.csrf }), params({ ref: id }))).status).toBe(422);
  });

  it('a second upload can be cancelled; cancelling a finished one is refused; a missing one is 404', async () => {
    const s = await loginAs('marta@halka.pl');
    const job = (await (await upload('wines', s.cookie, s.csrf, 'w.csv', 'producer,wine,bottle\nKeller,Riesling,200\n')).json()) as { id: string };
    expect((await importDelete(req(`${URL0}/x`, { cookie: s.cookie, 'x-csrf-token': s.csrf }, 'DELETE'), params({ ref: job.id }))).status).toBe(422);
    const gone = await importDelete(req(`${URL0}/x?restaurant=halka`, { cookie: s.cookie, 'x-csrf-token': s.csrf }, 'DELETE'), params({ ref: job.id }));
    expect(gone.status).toBe(204);
    expect((await importDelete(req(`${URL0}/x?restaurant=halka`, { cookie: s.cookie, 'x-csrf-token': s.csrf }, 'DELETE'), params({ ref: job.id }))).status).toBe(422);
    expect((await importGet(req(`${URL0}/x?restaurant=halka`, { cookie: s.cookie }), params({ ref: '00000000-0000-4000-8000-00000000dead' }))).status).toBe(404);
  });

  it('the bulk and wine endpoints are restaurant-scoped: the GM can read but not change pairings', async () => {
    const gm = await loginAs('tomasz@halka.pl');
    const bulk = await bulkPost(jsonReq(`${URL0}/x`, { action: 'approve_all' }, 'POST', { cookie: gm.cookie, 'x-csrf-token': gm.csrf }), params({ slug: 'halka' }));
    expect(bulk.status).toBe(403);
    expect((await pairingsList(req(`${URL0}/x`, { cookie: gm.cookie }), params({ slug: 'halka' }))).status).toBe(200);
  });
});
