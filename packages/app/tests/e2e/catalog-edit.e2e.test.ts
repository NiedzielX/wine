import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BISTRO, HALKA, assertTablesCovered, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, origin, payload, runAction, send, snapshotDatabase,
  stageImport, type Session
} from './boundaries';

/**
 * Spec 2026-11-16-catalog-field-editing, C1: editing the fields of a dish (A3) and a wine (A5), on PostgreSQL, over plain HTTP the way a
 * browser without JavaScript sends it (the page as HTML, the form posted as multipart with its hidden fields, the server action id among them,
 * and the site's own `Origin`). No browser tool is used. The database is recorded first and put back at the end (the files share one database
 * in sequence). The fields are live: guests read a change at once, translations and profiles keep their own way (publish).
 */
void DEMO_PASSWORD;
let marta: Session; let tomasz: Session; let anna: Session; let sonia: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
let halkaId = ''; let bistroId = ''; let duckId = ''; let wineId = ''; let bistroDishId = ''; let bistroWineId = '';

const text = async (r: Response | Promise<Response>) => (await (await r).text()).replace(/<!-- -->/g, '');
const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s/>])`).exec(tag); return m ? unescape(m[1] ?? '') : undefined; };

/** The fields of the first form with a field called `marker`, as a browser sends them: inputs, the ticked checkboxes, textareas, the selected options. */
function formFields(page: string, marker: string): Array<[string, string]> {
  const form = [...page.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(`name="${marker}"`));
  expect(form, `a form with a "${marker}" field`).toBeDefined();
  const out: Array<[string, string]> = [];
  for (const m of form!.matchAll(/<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea>|<select\b[^>]*>[\s\S]*?<\/select>/g)) {
    const whole = m[0];
    const open = whole.slice(0, whole.indexOf('>') + 1);
    const name = attr(open, 'name');
    if (!name) continue;
    if (whole.startsWith('<input')) {
      const type = attr(open, 'type');
      if ((type === 'checkbox' || type === 'radio') && attr(open, 'checked') === undefined) continue;
      out.push([name, attr(open, 'value') ?? '']);
    } else if (whole.startsWith('<textarea')) {
      out.push([name, unescape(whole.slice(open.length, whole.length - '</textarea>'.length))]);
    } else {
      const options = [...whole.matchAll(/<option\b[^>]*>/g)].map((o) => o[0]);
      const chosen = options.find((o) => attr(o, 'selected') !== undefined) ?? options[0];
      out.push([name, chosen ? attr(chosen, 'value') ?? '' : '']);
    }
  }
  return out;
}
const withValues = (fields: Array<[string, string]>, over: Record<string, string | string[]>): Array<[string, string]> => {
  const keep = fields.filter(([k]) => !(k in over));
  return [...keep, ...Object.entries(over).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x): [string, string] => [k, x]))];
};
async function postPage(s: Session | undefined, path: string, fields: Array<[string, string]>, extra: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of fields) body.append(k, v);
  return fetch(`${base()}${path}`, { method: 'POST', body, redirect: 'manual', headers: { origin: origin(), 'sec-fetch-site': 'same-origin', ...(s ? { cookie: s.cookie } : {}), ...extra } });
}

const dishPage = (id = duckId, slug = HALKA) => `/admin/${slug}/menu/${id}`;
const winePage = (id = wineId, slug = HALKA) => `/admin/${slug}/wines/${id}`;
const dishRow = async (id: string) => (await queryDatabase<{ name: string; description: string; category: string; price: string }>(db(), 'select name, description, category, price::text as price from dish where id = $1', [id]))[0]!;
const wineRow = async (id: string) => (await queryDatabase<{ producer: string; name: string; vintage: number | null; region: string; list_number: number | null; bottle_price: string; glass_price: string | null; active: boolean }>(db(), 'select producer, name, vintage, region, list_number, bottle_price::text, glass_price::text, active from wine where id = $1', [id]))[0]!;
const edits = async (subject?: string) => queryDatabase<{ kind: string; subject_id: string; action: string; actor: string; actor_id: string | null; before: Record<string, unknown>; after: Record<string, unknown>; identity: boolean }>(db(),
  `select kind, subject_id, action, actor, actor_id, before, after, identity from catalog_edit ${subject ? 'where subject_id = $1' : 'where $1::text is null'} order by created_at, id`, [subject ?? null]);
const pending = async (s: Session) => Number(/(\d+) unpublished change/.exec(await text(await get(s, `/admin/${HALKA}/publish`)))?.[1] ?? '0');
const versionOf = (page: string) => /name="version" value="([0-9a-f]{8}-\d+)"/.exec(page)?.[1] ?? '';
const flagged = (page: string) => (page.match(/aria-invalid="true"/g) ?? []).length;
const alerts = (page: string) => [...page.matchAll(/role="alert"[^>]*>([^<]*)</g)].map((m) => m[1]);

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [marta, tomasz, anna, sonia] = await Promise.all([halkaSommelier(), halkaManager(), bistroOwner(), bistroSommelier()]);
  halkaId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [HALKA]))[0]!.id;
  bistroId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [BISTRO]))[0]!.id;
  if ((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from dish where restaurant_id = $1', [bistroId]))[0]!.n === '0') {
    for (const kind of ['wines', 'menu'] as const) {
      const job = await stageImport(anna, BISTRO, kind);
      expect((await send(anna, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${BISTRO}`, {})).status).toBe(200);
    }
  }
  duckId = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and name = 'Duck breast'`, [halkaId]))[0]!.id;
  wineId = (await queryDatabase<{ id: string }>(db(), 'select id from wine where restaurant_id = $1 and active and glass_price is not null order by name limit 1', [halkaId]))[0]!.id;
  bistroDishId = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and status = 'draft' order by name limit 1`, [bistroId]))[0]!.id;
  bistroWineId = (await queryDatabase<{ id: string }>(db(), 'select id from wine where restaurant_id = $1 order by name limit 1', [bistroId]))[0]!.id;
  await assertTablesCovered();
}, 240_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('editing the fields of a dish (A3) and a wine (A5)', () => {
  it('A3 without JavaScript: a price typed as 58,50 is saved, guests see the dish name and price at once, the unpublished counter stays and the audit row names who', async () => {
    const page = await text(await get(marta, dishPage()));
    expect(page).toContain('id="dish-price"');
    const fields = formFields(page, 'price');
    const before = await dishRow(duckId);
    const counter = await pending(marta);
    const res = await postPage(marta, dishPage(), withValues(fields, { price: '58,50', name: 'Duck breast with cherries', description: 'Roast duck,\r\nsour cherries', confirmIdentity: 'true' }));
    expect(res.status).toBe(303);
    // `n` names the languages whose published translation may be outdated (the demo dish has a Polish one)
    expect(res.headers.get('location')).toMatch(new RegExp(`^${dishPage()}\\?saved=catalog_saved(&n=[a-z,]+)?$`));
    expect(await dishRow(duckId)).toMatchObject({ name: 'Duck breast with cherries', price: '58.50', description: 'Roast duck,\nsour cherries', category: before.category });
    // the page after the redirect says so, the audit line shows the date to the Wine Director and the name to the General Manager
    const after = await text(await get(marta, `${dishPage()}?saved=catalog_saved`));
    expect(after).toContain('Saved. Guests see the change now.');
    expect(after).toMatch(/data-last-edit="true">Last edited \d/);
    expect(await text(await get(tomasz, dishPage()))).toMatch(/Last edited by Marta Wierzbicka, /);
    // guests: the public API and the dish page read the new fields at once, with no publish
    const menu = JSON.stringify(await (await fetch(`${base()}/api/v1/public/restaurants/${HALKA}/menu`)).json());
    expect(menu).toContain('Duck breast with cherries');
    expect(menu).toContain('58.5');
    expect(await text(await fetch(`${base()}/r/${HALKA}/dish/${duckId}`))).toContain('Duck breast with cherries');
    // the Polish translation of the last publish is what a Polish guest still reads (R5): the live fields reach the base text only
    const pl = await text(await fetch(`${base()}/r/${HALKA}/dish/${duckId}?lang=pl`));
    expect(pl).toContain('Pierś z kaczki');
    expect(pl).not.toContain('Duck breast with cherries');
    expect(await pending(marta)).toBe(counter);
    // one audit row with only the changed fields, the actor and the account
    const rows = await edits(duckId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'dish', action: 'update', actor: 'Marta Wierzbicka', identity: true });
    expect(rows[0]!.actor_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(rows[0]!.after).sort()).toEqual(['description', 'name', 'price']);
    expect(rows[0]!.before).toMatchObject({ name: before.name });
  });

  it('A3 and A5 without JavaScript: "58,500", "1.234", "abc" and an empty name come back with what was typed and a message at each field, and nothing is written; an unticked box saves no glass price', async () => {
    const before = await dishRow(duckId);
    const rowsBefore = (await edits()).length;
    for (const price of ['58,500', '1.234', 'abc']) {
      const fields = formFields(await text(await get(marta, dishPage())), 'price');
      const res = await postPage(marta, dishPage(), withValues(fields, { price, name: price === 'abc' ? '' : before.name }));
      expect(res.status, price + ' ' + (res.status === 400 ? (await res.clone().text()).slice(0, 600) : '')).toBe(200);
      const html = await text(res);
      expect(html, price).toContain('Enter a number such as 58 or 58,50.');
      expect(html, price).toMatch(new RegExp(`name="price"[^>]*value="${price.replace('.', '\\.')}"|value="${price.replace('.', '\\.')}"[^>]*name="price"`));
      expect(flagged(html), price).toBe(price === 'abc' ? 2 : 1);
      if (price === 'abc') { expect(html).toContain('Fill this in.'); expect(html).toContain('id="dish-name-error"'); }
    }
    expect(await dishRow(duckId)).toEqual(before);
    expect(await edits()).toHaveLength(rowsBefore);
    // A5: the glass price is typed but the box is not ticked: the glass price is saved as "none", without an error
    const winePageHtml = await text(await get(marta, winePage()));
    const wf = formFields(winePageHtml, 'bottlePrice');
    expect(wf.some(([k, v]) => k === 'pouredByGlass' && v === 'true')).toBe(true);
    const off = await postPage(marta, winePage(), withValues(wf, { pouredByGlass: ['false'], glassPrice: '44' }));
    expect(off.status).toBe(303);
    expect((await wineRow(wineId)).glass_price).toBeNull();
    // the box ticked and a glass price at or above the bottle: refused at the glass price field, written nothing
    const wf2 = formFields(await text(await get(marta, winePage())), 'bottlePrice');
    const bottle = (await wineRow(wineId)).bottle_price;
    const bad = await postPage(marta, winePage(), withValues(wf2, { pouredByGlass: ['false', 'true'], glassPrice: String(Number(bottle) + 1) }));
    expect(bad.status).toBe(200);
    expect(await text(bad)).toContain('The glass must cost less than the bottle.');
    expect((await wineRow(wineId)).glass_price).toBeNull();
    const on = await postPage(marta, winePage(), withValues(wf2, { pouredByGlass: ['false', 'true'], glassPrice: '12,5' }));
    expect(on.status).toBe(303);
    expect((await wineRow(wineId)).glass_price).toBe('12.50');
  });

  it('two cards with the same wine: the first saves, the second is told someone changed it in the meantime, and the first one\'s values stay', async () => {
    const first = formFields(await text(await get(marta, winePage())), 'bottlePrice');
    const second = formFields(await text(await get(tomasz, winePage())), 'bottlePrice');
    const a = await postPage(marta, winePage(), withValues(first, { region: 'First card' }));
    expect(a.status).toBe(303);
    const b = await postPage(tomasz, winePage(), withValues(second, { region: 'Second card' }));
    expect(b.status).toBe(200);
    const html = await text(b);
    expect(html).toContain('Someone has changed this wine in the meantime. Reload the page.');
    expect(html).toContain('value="Second card"');
    expect((await wineRow(wineId)).region).toBe('First card');
    // the stale version is the only reason: after a reload the second card saves
    const reloaded = formFields(await text(await get(tomasz, winePage())), 'bottlePrice');
    expect((await postPage(tomasz, winePage(), withValues(reloaded, { region: 'Second card' }))).status).toBe(303);
    expect((await wineRow(wineId)).region).toBe('Second card');
    expect((await edits(wineId)).map((r) => r.actor)).toEqual(expect.arrayContaining(['Marta Wierzbicka', 'Tomasz Lis']));
  });

  it('renaming a dish that has sommelier pairings: the warning with their number, a confirmation first, an audit row marked as identity, "Check after rename" until a newer decision, and the entry in the review queue', async () => {
    const dish = (await queryDatabase<{ id: string; name: string }>(db(), `select d.id, d.name from dish d where d.restaurant_id = $1 and d.status = 'published' and d.id <> $2 and exists (select 1 from pairing p where p.dish_id = d.id and p.status in ('approved', 'modified')) order by d.name limit 1`, [halkaId, duckId]))[0]!;
    const approved = Number((await queryDatabase<{ n: string }>(db(), `select count(*)::text as n from pairing where dish_id = $1 and status in ('approved', 'modified')`, [dish.id]))[0]!.n);
    const page = await text(await get(marta, dishPage(dish.id)));
    expect(page).toContain(`This dish has ${approved} sommelier pairings. Rename it only to correct the name, not to replace the dish.`);
    expect(page).not.toContain('data-check-after-rename');
    const fields = formFields(page, 'price');
    // a price change alone needs nothing: no warning acknowledged, no identity row
    expect((await postPage(marta, dishPage(dish.id), withValues(fields, { price: '77' }))).status).toBe(303);
    expect((await edits(dish.id)).map((r) => r.identity)).toEqual([false]);
    // the rename without the confirmation is refused at the name field
    const fresh = formFields(await text(await get(marta, dishPage(dish.id))), 'price');
    const refused = await postPage(marta, dishPage(dish.id), withValues(fresh, { name: `${dish.name} renamed` }));
    expect(refused.status).toBe(200);
    expect(await text(refused)).toContain('Confirm that you are correcting the name.');
    expect((await dishRow(dish.id)).name).toBe(dish.name);
    const ok = await postPage(marta, dishPage(dish.id), withValues(fresh, { name: `${dish.name} renamed`, confirmIdentity: 'true' }));
    expect(ok.status).toBe(303);
    expect((await edits(dish.id)).map((r) => r.identity)).toEqual([false, true]);
    // the pairings are marked on the dish, on the wine and in the review queue
    const after = await text(await get(marta, dishPage(dish.id)));
    expect(after).toContain('data-check-after-rename');
    const wine = (await queryDatabase<{ wine_id: string }>(db(), `select wine_id from pairing where dish_id = $1 and status in ('approved', 'modified') limit 1`, [dish.id]))[0]!.wine_id;
    expect(await text(await get(marta, winePage(wine)))).toContain('Check after rename');
    const queue = await text(await get(marta, `/admin/${HALKA}/review`));
    expect(queue).toContain('Renamed: check the pairs');
    expect(queue).toContain(`>${dish.name} renamed</a>`);
    // a decision on each approved pair after the rename takes the marks away
    const pairs = (await queryDatabase<{ id: string; version: number }>(db(), `select id, version from pairing where dish_id = $1 and status in ('approved', 'modified')`, [dish.id]));
    for (const p of pairs) {
      const res = await send(marta, 'PATCH', `/api/v1/pairings/${p.id}?restaurant=${HALKA}`, { comment: 'Checked after the rename' }, { 'if-match': `"${p.version}"` });
      expect(res.status).toBe(200);
    }
    expect(await text(await get(marta, dishPage(dish.id)))).not.toContain('data-check-after-rename');
    expect(await text(await get(marta, `/admin/${HALKA}/review`))).not.toContain(`>${dish.name} renamed</a>`);
  });
});

describe('the details routes', () => {
  it('PATCH …/details answers 428 without If-Match, 409 with a stale one, 422 for an empty body and a field outside the schema, 404 for an id that is not a UUID; the ETag is the new fingerprint', async () => {
    const got = await get(marta, `/api/v1/dishes/${duckId}/details?restaurant=${HALKA}`);
    expect(got.status).toBe(200);
    const etag = got.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{8}-\d+"$/);
    const rowsBefore = (await edits()).length;
    const patch = (body: unknown, headers: Record<string, string>, id = duckId) => send(marta, 'PATCH', `/api/v1/dishes/${id}/details?restaurant=${HALKA}`, body, headers);
    expect((await patch({ price: 61 }, {})).status).toBe(428);
    expect((await patch({ price: 61 }, { 'if-match': 'not a version' })).status).toBe(400);
    expect((await patch({}, { 'if-match': etag })).status).toBe(422);
    expect((await patch({ price: 61, status: 'hidden' }, { 'if-match': etag })).status).toBe(422);
    expect((await patch({ price: 61 }, { 'if-match': etag }, 'nie-uuid')).status).toBe(404);
    expect((await patch({ price: 61 }, { 'if-match': '"00000000-1"' })).status).toBe(409);
    expect((await edits()).length).toBe(rowsBefore);
    const ok = await patch({ price: 61 }, { 'if-match': etag });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { price: number; changed: boolean })).toMatchObject({ price: 61, changed: true });
    expect(ok.headers.get('etag')).not.toBe(etag);
    expect((await dishRow(duckId)).price).toBe('61.00');
    // the availability route of the wine is the same as before
    const active = await send(marta, 'PATCH', `/api/v1/wines/${wineId}?restaurant=${HALKA}`, { active: true });
    expect(await active.json()).toEqual({ id: wineId, active: true });
  });
});

describe('access boundaries of the catalog edit (T-39)', () => {
  it('T-39: both accounts may edit their own restaurant; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found', async () => {
    const detailsOf = async (s: Session, kind: 'dishes' | 'wines', id: string, slug: string) => get(s, `/api/v1/${kind}/${id}/details?restaurant=${slug}`);
    const patch = (s: Session, kind: 'dishes' | 'wines', id: string, slug: string, body: unknown, ifMatch: string | undefined, extra: Record<string, string> = {}) =>
      send(s, 'PATCH', `/api/v1/${kind}/${id}/details?restaurant=${slug}`, body, { ...(ifMatch ? { 'if-match': ifMatch } : {}), ...extra });

    // 1. positive control, both ways: the Wine Director of Halka on a wine of Halka, the owner of Bistro on a dish and a wine of Bistro
    const w = await detailsOf(marta, 'wines', wineId, HALKA);
    expect(w.status).toBe(200);
    expect((await patch(marta, 'wines', wineId, HALKA, { tastingNote: 'Control note of Halka' }, w.headers.get('etag')!)).status).toBe(200);
    const bd = await detailsOf(anna, 'dishes', bistroDishId, BISTRO);
    expect(bd.status).toBe(200);
    expect((await patch(anna, 'dishes', bistroDishId, BISTRO, { description: 'Control description of Bistro' }, bd.headers.get('etag')!)).status).toBe(200);
    const bw = await detailsOf(sonia, 'wines', bistroWineId, BISTRO);
    expect((await patch(sonia, 'wines', bistroWineId, BISTRO, { region: 'Control region of Bistro' }, bw.headers.get('etag')!)).status).toBe(200);

    // a waiter has no dashboard login at all: sign-in answers 403, so there is no session to try with (a sign-in updates the account row, so it comes before the state is recorded)
    expect((await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'kelner@halka.pl', password: DEMO_PASSWORD }) })).status).toBe(403);
    // 2. state before: whole payloads and a digest of every table
    const etagOf = async (s: Session, kind: 'dishes' | 'wines', id: string, slug: string) => (await detailsOf(s, kind, id, slug)).headers.get('etag')!;
    const eHalkaWine = await etagOf(marta, 'wines', wineId, HALKA);
    const eHalkaDish = await etagOf(marta, 'dishes', duckId, HALKA);
    const eBistroDish = await etagOf(anna, 'dishes', bistroDishId, BISTRO);
    const eBistroWine = await etagOf(sonia, 'wines', bistroWineId, BISTRO);
    const paths = [`/api/v1/public/restaurants/${HALKA}/menu`, `/api/v1/public/restaurants/${BISTRO}/menu`];
    // whole payloads: both public menus and the details of EVERY dish and wine of both restaurants (the panel pages carry per-render ids, so they are not compared as text)
    const ids = async (table: 'dish' | 'wine', restaurant: string) => (await queryDatabase<{ id: string }>(db(), `select id from ${table} where restaurant_id = $1 order by id`, [restaurant])).map((r) => r.id);
    const [halkaDishes, halkaWines, bistroDishes, bistroWines] = await Promise.all([ids('dish', halkaId), ids('wine', halkaId), ids('dish', bistroId), ids('wine', bistroId)]);
    const payloads = async () => [
      ...(await Promise.all(paths.map((p) => text(fetch(`${base()}${p}`))))),
      ...(await Promise.all([
        ...halkaDishes.map((id) => payload(marta, `/api/v1/dishes/${id}/details?restaurant=${HALKA}`)), ...halkaWines.map((id) => payload(marta, `/api/v1/wines/${id}/details?restaurant=${HALKA}`)),
        ...bistroDishes.map((id) => payload(anna, `/api/v1/dishes/${id}/details?restaurant=${BISTRO}`)), ...bistroWines.map((id) => payload(anna, `/api/v1/wines/${id}/details?restaurant=${BISTRO}`))
      ]))
    ];
    const tablesBefore = await digest();
    const payloadsBefore = await payloads();
    expect(tablesBefore.catalog_edit).toBeDefined();
    const planted = { name: 'Planted by the other restaurant', price: 1, producer: 'Planted', bottlePrice: 1 };

    // 3. refused reads and writes
    // the other restaurant's slug: 403 for the owner of Bistro in Halka and the Wine Director of Halka in Bistro, read and write
    for (const [who, slug, dish, wine, dEtag, wEtag] of [[anna, HALKA, duckId, wineId, eHalkaDish, eHalkaWine], [marta, BISTRO, bistroDishId, bistroWineId, eBistroDish, eBistroWine]] as const) {
      expect((await detailsOf(who, 'dishes', dish, slug)).status).toBe(403);
      expect((await detailsOf(who, 'wines', wine, slug)).status).toBe(403);
      expect((await patch(who, 'dishes', dish, slug, { name: planted.name, price: planted.price }, dEtag)).status).toBe(403);
      expect((await patch(who, 'wines', wine, slug, { producer: planted.producer, bottlePrice: planted.bottlePrice }, wEtag)).status).toBe(403);
    }
    // the other restaurant's object id under the own slug: 404, the very answer of an id that does not exist
    const nil = '00000000-0000-4000-8000-000000000000';
    const unknownDish = await patch(marta, 'dishes', nil, HALKA, { price: 5 }, eHalkaDish);
    const foreignDish = await patch(marta, 'dishes', bistroDishId, HALKA, { price: 5 }, eHalkaDish);
    expect(unknownDish.status).toBe(404);
    expect(foreignDish.status).toBe(404);
    expect(await foreignDish.text()).toBe(await unknownDish.text());
    const unknownWine = await patch(marta, 'wines', nil, HALKA, { bottlePrice: 5 }, eHalkaWine);
    const foreignWine = await patch(marta, 'wines', bistroWineId, HALKA, { bottlePrice: 5 }, eHalkaWine);
    expect([unknownWine.status, foreignWine.status]).toEqual([404, 404]);
    expect(await foreignWine.text()).toBe(await unknownWine.text());
    expect((await detailsOf(marta, 'dishes', bistroDishId, HALKA)).status).toBe(404);
    expect((await detailsOf(anna, 'wines', wineId, BISTRO)).status).toBe(404);
    // no session: 401; a session without the CSRF header or with a foreign Origin: 403
    expect((await fetch(`${base()}/api/v1/dishes/${duckId}/details?restaurant=${HALKA}`, { method: 'PATCH', headers: { 'content-type': 'application/json', origin: origin(), 'if-match': eHalkaDish }, body: JSON.stringify({ price: 1 }) })).status).toBe(401);
    expect((await fetch(`${base()}/api/v1/dishes/${duckId}/details?restaurant=${HALKA}`, { headers: {} })).status).toBe(401);
    expect((await fetch(`${base()}/api/v1/dishes/${duckId}/details?restaurant=${HALKA}`, { method: 'PATCH', headers: { cookie: marta.cookie, 'content-type': 'application/json', origin: origin(), 'if-match': eHalkaDish }, body: JSON.stringify({ price: 1 }) })).status).toBe(403);
    expect((await patch(marta, 'dishes', duckId, HALKA, { price: 1 }, eHalkaDish, { origin: 'https://evil.example' })).status).toBe(403);
    // the panel's own actions, posted as a browser would: the other restaurant's account and no session
    const stateOf = async (s: Session | undefined, slug: string, dish: string) => {
      const fields: Record<string, string> = { back: `/admin/${slug}`, dishId: dish, version: '00000000-1', name: planted.name, description: 'x', category: 'Mains', price: '1' };
      return runAction(s ?? { cookie: '', csrf: '' }, 'saveDishDetails', slug, fields, [`/menu/${dish}`]);
    };
    const wineAction = () => runAction(anna, 'saveWineDetails', HALKA, { back: `/admin/${HALKA}`, wineId, version: '00000000-1', producer: planted.producer, name: 'x', vintage: '2020', region: '', country: '', tastingNote: '', listNumber: '', bottlePrice: '1', pouredByGlass: 'false', glassPrice: '' }, [`/wines/${wineId}`]);
    const attempts = { 'owner of Bistro in Halka': await stateOf(anna, HALKA, duckId), 'Wine Director of Halka in Bistro': await stateOf(marta, BISTRO, bistroDishId), 'no session': await stateOf(undefined, HALKA, duckId), 'wine action, owner of Bistro in Halka': await wineAction() };
    for (const [who, attempt] of Object.entries(attempts)) {
      // never the redirect of a success; a refusal page, the form state with the refusal, or the sign-in page
      expect(attempt.location, 'a refused action never reports a save').not.toContain('saved=');
      expect([200, 303, 307, 403, 404], who).toContain(attempt.status);
    }

    // 4. state after: every payload and every table digest exactly as before
    const payloadsAfter = await payloads();
    const differing = payloadsAfter.flatMap((p, i) => { if (p === payloadsBefore[i]) return []; let k = 0; while (p[k] === payloadsBefore[i]![k]) k++; return [`#${i}: ${payloadsBefore[i]!.slice(Math.max(0, k - 80), k + 80)} <> ${p.slice(Math.max(0, k - 80), k + 80)}`]; });
    expect(differing, 'payloads that changed').toEqual([]);
    const tablesAfter = await digest();
    expect(Object.keys(tablesAfter).filter((t) => tablesAfter[t] !== tablesBefore[t]), 'tables that changed').toEqual([]);
    expect((await dishRow(duckId)).name).not.toBe(planted.name);
    expect((await dishRow(bistroDishId)).name).not.toBe(planted.name);
    expect(await errorCode(await patch(marta, 'dishes', bistroDishId, HALKA, { price: 5 }, eHalkaDish))).toBe('not_found');
  });
});
