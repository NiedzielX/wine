import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BISTRO, HALKA, assertTablesCovered, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaSommelier, origin, payload, runAction, send, snapshotDatabase,
  stageImport, type Session
} from './boundaries';

/**
 * Spec 2026-11-16-catalog-field-editing, C2: hiding and showing a dish (A3 button, `POST …/dishes/{id}/visibility`) on PostgreSQL, over plain
 * HTTP the way a browser without JavaScript sends it (the page as HTML, the button's form posted with its hidden fields and the site's own
 * `Origin`). The database is recorded first and put back at the end (the files share one database in sequence). Hiding is live for guests
 * at once, showing needs no publish, neither counts as an unpublished change.
 */
void DEMO_PASSWORD;
let marta: Session; let anna: Session; let sonia: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
let halkaId = ''; let bistroId = ''; let duckId = ''; let draftId = ''; let bistroDishId = ''; let bistroDraftId = '';

const text = async (r: Response | Promise<Response>) => (await (await r).text()).replace(/<!-- -->/g, '');
const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s/>])`).exec(tag); return m ? unescape(m[1] ?? '') : undefined; };

/** The hidden fields of the form that has a field called `hidden` (the Hide / Show button), as a browser sends them. */
function buttonFields(page: string): Array<[string, string]> {
  const form = [...page.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="hidden"'));
  expect(form, 'a form with a "hidden" field').toBeDefined();
  return [...form!.matchAll(/<input\b[^>]*>/g)].flatMap((m) => { const name = attr(m[0], 'name'); return name ? [[name, attr(m[0], 'value') ?? ''] as [string, string]] : []; });
}
async function postPage(s: Session | undefined, path: string, fields: Array<[string, string]>, extra: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of fields) body.append(k, v);
  return fetch(`${base()}${path}`, { method: 'POST', body, redirect: 'manual', headers: { origin: origin(), 'sec-fetch-site': 'same-origin', ...(s ? { cookie: s.cookie } : {}), ...extra } });
}

const dishPage = (id = duckId, slug = HALKA) => `/admin/${slug}/menu/${id}`;
const statusOf = async (id: string) => (await queryDatabase<{ status: string }>(db(), 'select status from dish where id = $1', [id]))[0]!.status;
const edits = async (subject?: string) => queryDatabase<{ action: string; actor: string; actor_id: string | null; before: Record<string, unknown>; after: Record<string, unknown>; identity: boolean }>(db(),
  `select action, actor, actor_id, before, after, identity from catalog_edit where kind = 'dish' ${subject ? 'and subject_id = $1' : 'and $1::text is null'} order by created_at, id`, [subject ?? null]);
const pending = async (s: Session) => Number(/(\d+) unpublished change/.exec(await text(await get(s, `/admin/${HALKA}/publish`)))?.[1] ?? '0');
const menuIds = async (slug: string): Promise<string> => JSON.stringify(await (await fetch(`${base()}/api/v1/public/restaurants/${slug}/menu`)).json());
const visibility = (s: Session, id: string, slug = HALKA) => get(s, `/api/v1/dishes/${id}/visibility?restaurant=${slug}`);
const etagOf = async (s: Session, id: string, slug = HALKA) => (await visibility(s, id, slug)).headers.get('etag')!;
const post = (s: Session, id: string, slug: string, body: unknown, ifMatch: string | undefined, extra: Record<string, string> = {}) =>
  send(s, 'POST', `/api/v1/dishes/${id}/visibility?restaurant=${slug}`, body, { ...(ifMatch ? { 'if-match': ifMatch } : {}), ...extra });

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [marta, anna, sonia] = await Promise.all([halkaSommelier(), bistroOwner(), bistroSommelier()]);
  halkaId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [HALKA]))[0]!.id;
  bistroId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [BISTRO]))[0]!.id;
  if ((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from dish where restaurant_id = $1', [bistroId]))[0]!.n === '0') {
    for (const kind of ['wines', 'menu'] as const) {
      const job = await stageImport(anna, BISTRO, kind);
      expect((await send(anna, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${BISTRO}`, {})).status).toBe(200);
    }
  }
  duckId = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and name = 'Duck breast'`, [halkaId]))[0]!.id;
  draftId = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and status = 'draft' order by name limit 1`, [halkaId]))[0]!.id;
  // the dishes of a new restaurant are drafts until it publishes: release one directly (the whole database is put back afterwards)
  const bistro = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and status = 'draft' order by name limit 2`, [bistroId])).map((r) => r.id);
  [bistroDishId, bistroDraftId] = bistro as [string, string];
  await queryDatabase(db(), `update dish set status = 'published' where id = $1`, [bistroDishId]);
  await assertTablesCovered();
}, 240_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('hiding and showing a dish (A3)', () => {
  it('A3 without JavaScript: Hide takes the dish away from guests at once, Show brings it back with no publish, the unpublished counter stays and two audit rows name who', async () => {
    const page = await text(await get(marta, dishPage()));
    expect(page).toContain('Hide from guests');
    expect(page).not.toContain('Show to guests');
    const counter = await pending(marta);
    expect(await menuIds(HALKA)).toContain(duckId);
    expect((await text(await fetch(`${base()}/r/${HALKA}/dish/${duckId}`))).length).toBeGreaterThan(0);
    const hide = await postPage(marta, dishPage(), buttonFields(page));
    expect(hide.status).toBe(303);
    expect(hide.headers.get('location')).toBe(`${dishPage()}?saved=dish_hidden`);
    expect(await statusOf(duckId)).toBe('hidden');
    expect(await menuIds(HALKA)).not.toContain(duckId);
    expect((await fetch(`${base()}/r/${HALKA}/dish/${duckId}`)).status).toBe(404);
    expect(await pending(marta)).toBe(counter);
    const hiddenPage = await text(await get(marta, `${dishPage()}?saved=dish_hidden`));
    expect(hiddenPage).toContain('The dish is hidden from guests.');
    expect(hiddenPage).toContain('Show to guests');
    expect(hiddenPage).not.toContain('Hide from guests');
    const show = await postPage(marta, dishPage(), buttonFields(hiddenPage));
    expect(show.status).toBe(303);
    expect(show.headers.get('location')).toMatch(new RegExp(`^${dishPage()}\\?saved=dish_shown(&n=\\d+)?$`));
    expect(await statusOf(duckId)).toBe('published');
    expect(await menuIds(HALKA)).toContain(duckId);
    expect((await fetch(`${base()}/r/${HALKA}/dish/${duckId}`)).status).toBe(200);
    expect(await pending(marta)).toBe(counter);
    const rows = await edits(duckId);
    expect(rows.map((r) => [r.action, r.before, r.after, r.actor, r.identity])).toEqual([
      ['hidden', { status: 'published' }, { status: 'hidden' }, 'Marta Wierzbicka', false],
      ['shown', { status: 'hidden' }, { status: 'published' }, 'Marta Wierzbicka', false]
    ]);
    expect(rows[0]!.actor_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('two cards: the second button, made before the first one hid the dish, is a version conflict and changes nothing; a draft dish has no button and the action refuses it', async () => {
    const first = buttonFields(await text(await get(marta, dishPage())));
    const second = buttonFields(await text(await get(marta, dishPage())));
    expect((await postPage(marta, dishPage(), first)).headers.get('location')).toContain('saved=dish_hidden');
    const rowsBefore = (await edits()).length;
    const stale = await postPage(marta, dishPage(), second);
    expect(stale.status).toBe(303);
    expect(stale.headers.get('location')).toBe(`${dishPage()}?error=version_conflict`);
    expect(await statusOf(duckId)).toBe('hidden');
    expect((await edits()).length).toBe(rowsBefore);
    const shown = buttonFields(await text(await get(marta, dishPage())));
    expect((await postPage(marta, dishPage(), shown)).headers.get('location')).toContain('saved=dish_shown');
    // a draft dish: no button on its page; the action posted by hand is dish_transition
    const draftPage = await text(await get(marta, dishPage(draftId)));
    expect(draftPage).not.toMatch(/Hide from guests|Show to guests/);
    const version = (await etagOf(marta, draftId)).replace(/"/g, '');
    const refused = await runAction(marta, 'setDishHidden', HALKA, { back: dishPage(draftId), dishId: draftId, hidden: 'true', version }, [`/menu/${draftId}`]);
    expect(refused.location).toBe(`${dishPage(draftId)}?error=dish_transition`);
    expect(await statusOf(draftId)).toBe('draft');
  });
});

describe('POST /dishes/{dishId}/visibility', () => {
  it('answers 428 without If-Match, 400 malformed, 422 for a wrong body, 404 for a non-UUID, 409 stale and 422 transition; the ETag is the new fingerprint; showing a shown dish is refused', async () => {
    const got = await visibility(marta, duckId);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ id: duckId, status: 'published' });
    const etag = got.headers.get('etag')!;
    expect(etag).toMatch(/^"[0-9a-f]{8}-\d+"$/);
    const rowsBefore = (await edits()).length;
    expect((await post(marta, duckId, HALKA, { hidden: true }, undefined)).status).toBe(428);
    expect((await post(marta, duckId, HALKA, { hidden: true }, 'not a version')).status).toBe(400);
    expect((await post(marta, duckId, HALKA, {}, etag)).status).toBe(422);
    expect((await post(marta, duckId, HALKA, { hidden: true, status: 'draft' }, etag)).status).toBe(422);
    expect((await post(marta, 'nie-uuid', HALKA, { hidden: true }, etag)).status).toBe(404);
    expect((await post(marta, duckId, HALKA, { hidden: true }, '"00000000-1"')).status).toBe(409);
    const already = await post(marta, duckId, HALKA, { hidden: false }, etag);
    expect(already.status).toBe(422);
    expect(((await already.json()) as { error: { fields: Record<string, string> } }).error.fields).toEqual({ status: 'transition' });
    expect((await post(marta, draftId, HALKA, { hidden: true }, await etagOf(marta, draftId))).status).toBe(422);
    expect((await edits()).length).toBe(rowsBefore);
    expect(await statusOf(duckId)).toBe('published');
    const hide = await post(marta, duckId, HALKA, { hidden: true }, etag);
    expect(hide.status).toBe(200);
    expect(await hide.json()).toEqual({ id: duckId, status: 'hidden', suggestions: 0 });
    expect(hide.headers.get('etag')).not.toBe(etag);
    expect(hide.headers.get('etag')).toBe(await etagOf(marta, duckId));
    const show = await post(marta, duckId, HALKA, { hidden: false }, hide.headers.get('etag')!);
    expect(show.status).toBe(200);
    expect(await statusOf(duckId)).toBe('published');
  });
});

describe('access boundaries of hiding a dish (T-41)', () => {
  it('T-41: both accounts may hide and show their own dish; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found', async () => {
    // 1. positive control, both ways: the Wine Director of Halka and the owner of Bistro each hide and show a dish of their own
    for (const [who, slug, dish] of [[marta, HALKA, duckId], [anna, BISTRO, bistroDishId]] as const) {
      const hide = await post(who, dish, slug, { hidden: true }, await etagOf(who, dish, slug));
      expect(hide.status, slug).toBe(200);
      expect(await statusOf(dish)).toBe('hidden');
      expect((await post(who, dish, slug, { hidden: false }, hide.headers.get('etag')!)).status, slug).toBe(200);
      expect(await statusOf(dish)).toBe('published');
    }
    // a waiter has no dashboard login at all: sign-in answers 403, so there is no session to try with
    expect((await fetch(`${base()}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin() }, body: JSON.stringify({ email: 'kelner@halka.pl', password: DEMO_PASSWORD }) })).status).toBe(403);

    // 2. state before: whole payloads (both public menus, the visibility of every dish of both restaurants) and a digest of every table
    const eHalka = await etagOf(marta, duckId);
    const eBistro = await etagOf(anna, bistroDishId, BISTRO);
    const ids = async (restaurant: string) => (await queryDatabase<{ id: string }>(db(), 'select id from dish where restaurant_id = $1 order by id', [restaurant])).map((r) => r.id);
    const [halkaDishes, bistroDishes] = await Promise.all([ids(halkaId), ids(bistroId)]);
    const payloads = async () => [
      await menuIds(HALKA), await menuIds(BISTRO),
      ...(await Promise.all([...halkaDishes.map((id) => payload(marta, `/api/v1/dishes/${id}/visibility?restaurant=${HALKA}`)), ...bistroDishes.map((id) => payload(anna, `/api/v1/dishes/${id}/visibility?restaurant=${BISTRO}`))]))
    ];
    const tablesBefore = await digest();
    const payloadsBefore = await payloads();

    // 3. refused reads and writes
    // the other restaurant's slug: 403 for the owner of Bistro in Halka and the Wine Director of Halka in Bistro, read and write
    for (const [who, slug, dish, etag] of [[anna, HALKA, duckId, eHalka], [marta, BISTRO, bistroDishId, eBistro]] as const) {
      expect((await visibility(who, dish, slug)).status, `read ${slug}`).toBe(403);
      expect((await post(who, dish, slug, { hidden: true }, etag)).status, `write ${slug}`).toBe(403);
    }
    // the other restaurant's object id under the own slug: 404, the very answer of an id that does not exist
    const nil = '00000000-0000-4000-8000-000000000000';
    const unknown = await post(marta, nil, HALKA, { hidden: true }, eHalka);
    const foreign = await post(marta, bistroDishId, HALKA, { hidden: true }, eHalka);
    expect([unknown.status, foreign.status]).toEqual([404, 404]);
    expect(await foreign.text()).toBe(await unknown.text());
    expect((await visibility(marta, bistroDishId, HALKA)).status).toBe(404);
    expect((await visibility(anna, duckId, BISTRO)).status).toBe(404);
    // no session: 401; a session without the CSRF header or with a foreign Origin: 403
    const url = `${base()}/api/v1/dishes/${duckId}/visibility?restaurant=${HALKA}`;
    expect((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', origin: origin(), 'if-match': eHalka }, body: JSON.stringify({ hidden: true }) })).status).toBe(401);
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { method: 'POST', headers: { cookie: marta.cookie, 'content-type': 'application/json', origin: origin(), 'if-match': eHalka }, body: JSON.stringify({ hidden: true }) })).status).toBe(403);
    expect((await post(marta, duckId, HALKA, { hidden: true }, eHalka, { origin: 'https://evil.example' })).status).toBe(403);
    // the panel's own action, posted as a browser would: the other restaurant's accounts and no session
    const act = (who: Session | undefined, slug: string, dish: string, version: string) =>
      runAction(who ?? { cookie: '', csrf: '' }, 'setDishHidden', slug, { back: `/admin/${slug}`, dishId: dish, hidden: 'true', version: version.replace(/"/g, '') }, [`/menu/${dish}`]);
    const attempts = {
      'owner of Bistro in Halka': await act(anna, HALKA, duckId, eHalka), 'Wine Director of Halka in Bistro': await act(marta, BISTRO, bistroDishId, eBistro),
      'Bistro sommelier in Halka': await act(sonia, HALKA, duckId, eHalka), 'no session': await act(undefined, HALKA, duckId, eHalka)
    };
    for (const [who, attempt] of Object.entries(attempts)) {
      expect(attempt.location, `${who}: a refused action never reports a save`).not.toContain('saved=');
      expect([200, 303, 307, 403, 404], who).toContain(attempt.status);
    }

    // 4. state after: every payload and every table digest exactly as before
    const payloadsAfter = await payloads();
    expect(payloadsAfter.flatMap((p, i) => (p === payloadsBefore[i] ? [] : [`#${i}`])), 'payloads that changed').toEqual([]);
    const tablesAfter = await digest();
    expect(Object.keys(tablesAfter).filter((t) => tablesAfter[t] !== tablesBefore[t]), 'tables that changed').toEqual([]);
    expect(await statusOf(duckId)).toBe('published');
    expect(await statusOf(bistroDishId)).toBe('published');
    expect(await statusOf(bistroDraftId)).toBe('draft');
    expect(await errorCode(await post(marta, bistroDishId, HALKA, { hidden: true }, eHalka))).toBe('not_found');
  });
});
