import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BISTRO, HALKA, assertTablesCovered, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, origin, payload, runAction, send, snapshotDatabase,
  stageImport, type Session
} from './boundaries';

/**
 * Spec 2026-11-16-catalog-field-editing, C3: adding a dish (A32) and a wine (A32) by hand, on PostgreSQL, over plain HTTP the way a browser
 * without JavaScript sends it (the page as HTML, the form posted as multipart with its hidden fields and the site's own `Origin`). The
 * database is recorded first and put back at the end (the files share one database in sequence). A new dish is a draft and a new wine has
 * no profile in the published version, so guests see neither until a publish.
 */
void DEMO_PASSWORD;
let marta: Session; let tomasz: Session; let anna: Session; let sonia: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
let halkaId = ''; let bistroId = '';

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
async function postPage(s: Session | undefined, path: string, fields: Array<[string, string]>) {
  const body = new FormData();
  for (const [k, v] of fields) body.append(k, v);
  return fetch(`${base()}${path}`, { method: 'POST', body, redirect: 'manual', headers: { origin: origin(), 'sec-fetch-site': 'same-origin', ...(s ? { cookie: s.cookie } : {}) } });
}

const dishRowByName = async (name: string, restaurant = halkaId) => (await queryDatabase<{ id: string; status: string; price: string; category: string; description: string; profile_source: string }>(db(),
  'select id, status, price::text as price, category, description, profile_source from dish where restaurant_id = $1 and name = $2', [restaurant, name]))[0];
const wineRowByProducer = async (producer: string, restaurant = halkaId) => (await queryDatabase<{ id: string; active: boolean; list_number: number | null; glass_price: string | null; bottle_price: string; grapes: string[]; colour_hex: string; profile_source: string; profile_style: string }>(db(),
  'select id, active, list_number, glass_price::text, bottle_price::text, grapes, colour_hex, profile_source, profile_style from wine where restaurant_id = $1 and producer = $2', [restaurant, producer]))[0];
const edits = async (subject: string) => queryDatabase<{ action: string; actor: string; actor_id: string | null; before: unknown; after: Record<string, unknown> }>(db(), 'select action, actor, actor_id, before, after from catalog_edit where subject_id = $1 order by created_at', [subject]);
const pairsOf = async (column: 'dish_id' | 'wine_id', id: string) => queryDatabase<{ status: string; source: string }>(db(), `select status, source from pairing where ${column} = $1`, [id]);
const guestPage = async (kind: 'dish' | 'wine', id: string) => (await fetch(`${base()}/r/${HALKA}/${kind}/${id}`)).status;
const menuIds = async (slug: string): Promise<string> => JSON.stringify(await (await fetch(`${base()}/api/v1/public/restaurants/${slug}/menu`)).json());

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
  await assertTablesCovered();
}, 240_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('adding a dish and a wine by hand (A32)', () => {
  it('A32 without JavaScript: "Add dish" creates a draft with the draft profile and engine suggestions, the flash says to check the profile, guests see it only after a publish, and an audit row names who', async () => {
    const page = await text(await get(marta, `/admin/${HALKA}/menu/new`));
    expect(page).toContain('id="dish-name"');
    const fields = formFields(page, 'price');
    const menu = await text(await get(marta, `/admin/${HALKA}/menu`));
    expect(menu).toContain(`href="/admin/${HALKA}/menu/new"`);
    const res = await postPage(marta, `/admin/${HALKA}/menu/new`, withValues(fields, { name: 'Plum soufflé', description: 'Baked plum, vanilla cream', category: 'Desserts', price: '42,50' }));
    expect(res.status).toBe(303);
    const dish = (await dishRowByName('Plum soufflé'))!;
    expect(res.headers.get('location')).toBe(`/admin/${HALKA}/menu/${dish.id}?saved=catalog_created`);
    expect(dish).toMatchObject({ status: 'draft', price: '42.50', category: 'Desserts' });
    expect(dish.profile_source).toBe('draft');
    const pairs = await pairsOf('dish_id', dish.id);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((p) => p.status === 'suggested' && p.source === 'engine')).toBe(true);
    const landing = await text(await get(marta, res.headers.get('location')!));
    expect(landing).toContain('Added. The taste profile is a draft: check it and confirm it.');
    expect(landing).toContain('Plum soufflé');
    // guests: not in the menu, not on its page, until a publish
    expect(await menuIds(HALKA)).not.toContain('Plum soufflé');
    expect(await guestPage('dish', dish.id)).toBe(404);
    const rows = await edits(dish.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'create', before: null, actor: 'Marta Wierzbicka' });
    expect(rows[0]!.actor_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0]!.after).toMatchObject({ name: 'Plum soufflé', price: 42.5, category: 'Desserts' });
    // the unpublished dish is a change to publish; after the publish guests see it
    expect(await text(await get(marta, `/admin/${HALKA}/publish`))).toContain('Plum soufflé');
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`)).status).toBe(201);
    expect(await menuIds(HALKA)).toContain('Plum soufflé');
    expect(await guestPage('dish', dish.id)).toBe(200);
  });

  it('A32 without JavaScript: "Add wine" takes the next list number, saves no glass price for an unticked box, gives the wine a draft profile, and guests see it only after a publish', async () => {
    const page = await text(await get(marta, `/admin/${HALKA}/wines/new`));
    expect(page).toContain('id="wine-style"');
    const highest = Number((await queryDatabase<{ m: number }>(db(), 'select coalesce(max(list_number), 100) as m from wine where restaurant_id = $1 and deleted_at is null', [halkaId]))[0]!.m);
    const fields = formFields(page, 'bottlePrice');
    const res = await postPage(marta, `/admin/${HALKA}/wines/new`, withValues(fields, {
      producer: 'Weingut Hand', name: 'Riesling trocken', vintage: '2022', region: 'Pfalz', country: 'Germany', bottlePrice: '240', pouredByGlass: ['false'], glassPrice: '52', style: 'white', grape: 'Riesling'
    }));
    expect(res.status).toBe(303);
    const wine = (await wineRowByProducer('Weingut Hand'))!;
    expect(res.headers.get('location')).toBe(`/admin/${HALKA}/wines/${wine.id}?saved=catalog_created`);
    expect(wine).toMatchObject({ active: true, list_number: Math.max(100, highest) + 1, glass_price: null, bottle_price: '240.00', grapes: ['Riesling'] });
    expect([wine.profile_style, wine.profile_source]).toEqual(['white', 'grape_defaults']);
    expect((await pairsOf('wine_id', wine.id)).length).toBeGreaterThan(0);
    // a second wine with the glass ticked and a typed number
    const ticked = await postPage(marta, `/admin/${HALKA}/wines/new`, withValues(fields, {
      producer: 'Weingut Glass', name: 'Gamay', vintage: 'NV', bottlePrice: '210', pouredByGlass: ['false', 'true'], glassPrice: '44,50', style: 'red', listNumber: '5000'
    }));
    expect(ticked.status).toBe(303);
    expect(await wineRowByProducer('Weingut Glass')).toMatchObject({ glass_price: '44.50', list_number: 5000 });
    // the same list number again: refused at the field, with what was typed, nothing written
    const taken = await postPage(marta, `/admin/${HALKA}/wines/new`, withValues(fields, { producer: 'Weingut Third', name: 'Gamay', vintage: '2023', bottlePrice: '210', style: 'red', listNumber: '5000' }));
    expect(taken.status).toBe(200);
    const html = await text(taken);
    expect(html).toContain('Another item already has this name.');
    expect(html).toContain('value="Weingut Third"');
    expect(await wineRowByProducer('Weingut Third')).toBeUndefined();
    expect(await guestPage('wine', wine.id)).toBe(404);
    expect((await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/publish`)).status).toBe(201);
    expect(await guestPage('wine', wine.id)).toBe(200);
    expect((await edits(wine.id))[0]).toMatchObject({ action: 'create', before: null });
  });

  it('A32 without JavaScript: "58,500", an empty name and a duplicate name come back with what was typed and a message at each field; nothing is created', async () => {
    const before = Number((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from dish where restaurant_id = $1', [halkaId]))[0]!.n);
    const fields = formFields(await text(await get(marta, `/admin/${HALKA}/menu/new`)), 'price');
    for (const [name, price, expected] of [['', '58,500', ['Fill this in.', 'Enter a number such as 58 or 58,50.']], ['Plum soufflé', '40', ['Another item already has this name.']]] as const) {
      const res = await postPage(marta, `/admin/${HALKA}/menu/new`, withValues(fields, { name, price, category: 'Desserts' }));
      expect(res.status, name).toBe(200);
      const html = await text(res);
      for (const e of expected) expect(html, name).toContain(e);
      expect(html).toContain(`value="${price}"`);
    }
    expect(Number((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from dish where restaurant_id = $1', [halkaId]))[0]!.n)).toBe(before);
  });
});

describe('POST /dishes and POST /wines', () => {
  it('answer 201 with Location and ETag, 422 for missing, wrong and extra fields (nothing written), 422 for a duplicate; the Location is the details route', async () => {
    const post = (path: string, body: unknown) => send(marta, 'POST', `${path}?restaurant=${HALKA}`, body);
    const rowsBefore = Number((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from catalog_edit', []))[0]!.n);
    const missing = await post('/api/v1/dishes', {});
    expect(missing.status).toBe(422);
    expect(((await missing.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ name: 'required', category: 'required', price: 'required' });
    expect((await post('/api/v1/dishes', { name: 'X', category: 'Mains', price: 5, status: 'published' })).status).toBe(422);
    expect((await post('/api/v1/wines', { producer: 'P', name: 'N', vintage: 2099, bottlePrice: 50, style: 'red' })).status).toBe(422);
    expect((await send(marta, 'POST', '/api/v1/dishes', { name: 'No slug', category: 'Mains', price: 5 })).status).toBe(422);
    expect(Number((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from catalog_edit', []))[0]!.n)).toBe(rowsBefore);
    const dish = await post('/api/v1/dishes', { name: 'Api tartlet', category: 'Starters', price: 33 });
    expect(dish.status).toBe(201);
    const made = (await dish.json()) as { id: string; status: string };
    expect(dish.headers.get('location')).toBe(`/api/v1/dishes/${made.id}/details?restaurant=${HALKA}`);
    const details = await get(marta, dish.headers.get('location')!);
    expect(details.status).toBe(200);
    expect(details.headers.get('etag')).toBe(dish.headers.get('etag'));
    expect(await errorCode(await post('/api/v1/dishes', { name: 'api TARTLET!', category: 'Mains', price: 1 }))).toBe('validation_failed');
    const wine = await post('/api/v1/wines', { producer: 'Api Estate', name: 'Cuvée', vintage: 2021, bottlePrice: 180, style: 'red', grape: 'Merlot' });
    expect(wine.status).toBe(201);
    const w = (await wine.json()) as { id: string; listNumber: number };
    expect(wine.headers.get('location')).toBe(`/api/v1/wines/${w.id}/details?restaurant=${HALKA}`);
    expect((await get(marta, wine.headers.get('location')!)).headers.get('etag')).toBe(wine.headers.get('etag'));
    expect((await wineRowByProducer('Api Estate'))!.list_number).toBe(w.listNumber);
  });
});

describe('access boundaries of adding a dish or a wine (T-42)', () => {
  it('T-42: both accounts may add to their own restaurant; refused attempts by the other restaurant, without a session or a token leave every table and payload as it was', async () => {
    const addDish = (s: Session, slug: string, name: string, extra: Record<string, string> = {}) => send(s, 'POST', `/api/v1/dishes?restaurant=${slug}`, { name, category: 'Mains', price: 60 }, extra);
    const addWine = (s: Session, slug: string, producer: string, extra: Record<string, string> = {}) => send(s, 'POST', `/api/v1/wines?restaurant=${slug}`, { producer, name: 'Boundary', vintage: 2020, bottlePrice: 100, style: 'red' }, extra);

    // 1. positive control, both ways: the Wine Director of Halka and the owner and Wine Director of Bistro each add a dish and a wine of their own
    expect((await addDish(marta, HALKA, 'Control dish of Halka')).status).toBe(201);
    expect((await addWine(marta, HALKA, 'Control Estate of Halka')).status).toBe(201);
    expect((await addDish(anna, BISTRO, 'Control dish of Bistro')).status).toBe(201);
    expect((await addWine(sonia, BISTRO, 'Control Estate of Bistro')).status).toBe(201);
    // the same name in the other restaurant is no duplicate: names are compared inside one restaurant
    expect((await addDish(anna, BISTRO, 'Control dish of Halka')).status).toBe(201);
    expect(await dishRowByName('Control dish of Bistro', bistroId)).toBeDefined();
    expect(await dishRowByName('Control dish of Bistro')).toBeUndefined();
    // a waiter has no dashboard login at all: sign-in answers 403, so there is no session to try with
    expect((await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'kelner@halka.pl', password: DEMO_PASSWORD }) })).status).toBe(403);

    // 2. state before: whole payloads (both public menus, the details of every dish and wine of both restaurants) and a digest of every table
    const ids = async (table: 'dish' | 'wine', restaurant: string) => (await queryDatabase<{ id: string }>(db(), `select id from ${table} where restaurant_id = $1 order by id`, [restaurant])).map((r) => r.id);
    const [halkaDishes, halkaWines, bistroDishes, bistroWines] = await Promise.all([ids('dish', halkaId), ids('wine', halkaId), ids('dish', bistroId), ids('wine', bistroId)]);
    const payloads = async () => [
      await menuIds(HALKA), await menuIds(BISTRO),
      ...(await Promise.all([
        ...halkaDishes.map((id) => payload(marta, `/api/v1/dishes/${id}/details?restaurant=${HALKA}`)), ...halkaWines.map((id) => payload(marta, `/api/v1/wines/${id}/details?restaurant=${HALKA}`)),
        ...bistroDishes.map((id) => payload(anna, `/api/v1/dishes/${id}/details?restaurant=${BISTRO}`)), ...bistroWines.map((id) => payload(anna, `/api/v1/wines/${id}/details?restaurant=${BISTRO}`))
      ]))
    ];
    const tablesBefore = await digest();
    const payloadsBefore = await payloads();

    // 3. refused attempts
    // the other restaurant's slug: 403 for the owner of Bistro in Halka and the Wine Director of Halka in Bistro, a dish and a wine each
    for (const [who, slug] of [[anna, HALKA], [marta, BISTRO]] as const) {
      expect((await addDish(who, slug, 'Planted dish')).status, `dish ${slug}`).toBe(403);
      expect((await addWine(who, slug, 'Planted Estate')).status, `wine ${slug}`).toBe(403);
    }
    // no session: 401; a session without the CSRF header or with a foreign Origin: 403
    const json = { 'content-type': 'application/json', origin: origin() };
    expect((await fetch(`${base()}/api/v1/dishes?restaurant=${HALKA}`, { method: 'POST', headers: json, body: JSON.stringify({ name: 'Planted dish', category: 'Mains', price: 1 }) })).status).toBe(401);
    expect((await fetch(`${base()}/api/v1/wines?restaurant=${HALKA}`, { method: 'POST', headers: json, body: JSON.stringify({ producer: 'Planted Estate', name: 'x', vintage: 2020, bottlePrice: 1, style: 'red' }) })).status).toBe(401);
    expect((await fetch(`${base()}/api/v1/dishes?restaurant=${HALKA}`, { method: 'POST', headers: { ...json, cookie: marta.cookie }, body: JSON.stringify({ name: 'Planted dish', category: 'Mains', price: 1 }) })).status).toBe(403);
    expect((await addDish(marta, HALKA, 'Planted dish', { origin: 'https://evil.example' })).status).toBe(403);
    expect((await addWine(marta, HALKA, 'Planted Estate', { origin: 'https://evil.example' })).status).toBe(403);
    // the panel's own actions, posted as a browser would: the other restaurant's accounts and no session
    const fields = (slug: string) => ({ back: `/admin/${slug}`, name: 'Planted by form', category: 'Mains', price: '1', producer: 'Planted by form', vintage: '2020', bottlePrice: '1', style: 'red', pouredByGlass: 'false' });
    const attempts = {
      'dish action, owner of Bistro in Halka': await runAction(anna, 'createDish', HALKA, fields(HALKA), ['/menu/new']),
      'dish action, Wine Director of Halka in Bistro': await runAction(marta, 'createDish', BISTRO, fields(BISTRO), ['/menu/new']),
      'wine action, Bistro Wine Director in Halka': await runAction(sonia, 'createWine', HALKA, fields(HALKA), ['/wines/new']),
      'dish action, no session': await runAction({ cookie: '', csrf: '' }, 'createDish', HALKA, fields(HALKA), ['/menu/new'])
    };
    for (const [who, attempt] of Object.entries(attempts)) {
      expect(attempt.location, `${who}: a refused action never reports a save`).not.toContain('saved=');
      expect([200, 303, 307, 403, 404], who).toContain(attempt.status);
    }
    // the pages of A32 are closed to the other restaurant and to no session, with no form in the answer
    for (const [who, path] of [[anna, `/admin/${HALKA}/menu/new`], [marta, `/admin/${BISTRO}/wines/new`]] as const) {
      const res = await get(who, path);
      expect([403, 404], path).toContain(res.status);
      expect(await text(res), path).not.toContain('id="dish-name"');
    }

    // 4. state after: every payload and every table digest exactly as before
    const payloadsAfter = await payloads();
    expect(payloadsAfter.flatMap((p, i) => (p === payloadsBefore[i] ? [] : [`#${i}`])), 'payloads that changed').toEqual([]);
    const tablesAfter = await digest();
    expect(Object.keys(tablesAfter).filter((t) => tablesAfter[t] !== tablesBefore[t]), 'tables that changed').toEqual([]);
    for (const name of ['Planted dish', 'Planted by form']) {
      expect(await dishRowByName(name)).toBeUndefined();
      expect(await dishRowByName(name, bistroId)).toBeUndefined();
    }
    expect(await wineRowByProducer('Planted Estate')).toBeUndefined();
    expect(await wineRowByProducer('Planted by form')).toBeUndefined();
  });
});
