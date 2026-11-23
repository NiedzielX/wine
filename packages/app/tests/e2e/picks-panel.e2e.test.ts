import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalise } from './guest-compare';
import { HALKA, assertTablesCovered, base, bistroOwner, db, digest, get, halkaManager, halkaSommelier, runAction, send, snapshotDatabase, type Session } from './boundaries';

/**
 * Spec 2026-11-18-restaurant-picks, PR3 (panel): screen A27 and the marks in A4, A5, A6 and A11 on PostgreSQL, over plain HTTP the way a
 * browser without JavaScript sends it (the page as HTML, the switch as a multipart form post with the build's own action id and the
 * site's `Origin`). No browser tool is used, so the whole file runs wherever the HTTP part of the e2e suite runs. The database is
 * recorded first and put back at the end (the files share one database in sequence); every test starts from an empty set of picks.
 */
let restoreDatabase: (() => Promise<void>) | undefined;
let tomasz: Session; let marta: Session; let anna: Session;
let wines: Array<{ id: string; name: string }> = [];
let hidden: { id: string } | undefined;
let dishId = '';

const text = async (r: Response | Promise<Response>) => (await (await r).text()).replace(/<!-- -->/g, '');
const picksPage = (s: Session, q = '') => get(s, `/admin/${HALKA}/picks${q}`);
const state = async (s: Session) => (await (await get(s, `/api/v1/restaurants/${HALKA}/picks`)).json()) as { version: string; picks: Array<{ wineId: string; published: boolean }> };
const versionOf = (page: string) => /name="expectedVersion" value="([0-9a-f]{8}-\d+)"/.exec(page)?.[1] ?? '';
const buttons = (page: string, label: string) => [...page.matchAll(new RegExp(`<button[^>]*>${label}`, 'g'))].map((m) => m[0]);
const isDisabled = (tag: string) => /\sdisabled(=|\s|>)/.test(tag);

/** One switch, as the form of A27 posts it. `expectedVersion` defaults to the one the page shows. */
async function flip(s: Session, wineId: string, on: boolean, over: Record<string, string> = {}) {
  const version = versionOf(await text(await picksPage(s)));
  return runAction(s, 'setRestaurantPick', HALKA, { back: `/admin/${HALKA}/picks`, wineId, on: String(on), expectedVersion: version, ...over }, ['/picks']);
}
const clear = async () => {
  for (const p of (await state(tomasz)).picks) await flip(tomasz, p.wineId, false);
  expect((await state(tomasz)).picks).toEqual([]);
};

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [tomasz, marta, anna] = [await halkaManager(), await halkaSommelier(), await bistroOwner()];
  const rows = await queryDatabase<{ id: string; name: string; active: boolean }>(db(), `select w.id, w.name, w.active from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.deleted_at is null order by w.id`, [HALKA]);
  wines = rows.filter((w) => w.active);
  hidden = rows.find((w) => !w.active);
  dishId = (await queryDatabase<{ id: string }>(db(), `select d.id from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 and d.status = 'published' order by d.id limit 1`, [HALKA]))[0]!.id;
  await assertTablesCovered();
  // a published baseline: the simulator promises equality with the guest only when the picks are the one unpublished change
  expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBeLessThan(500);
}, 240_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('A27 for the two roles', () => {
  it('the General Manager gets the screen with working switches and the navigation entry; the Wine Director gets it with every switch disabled and a notice; no session and another restaurant’s owner get no data', async () => {
    await clear();
    const res = await picksPage(tomasz);
    expect(res.status).toBe(200);
    const page = await text(res);
    expect(page).toContain('<title>Restaurant’s picks | Wine Match dashboard</title>');
    expect(page).toContain('>Restaurant’s picks</h1>');
    expect(page).toContain(`href="/admin/${HALKA}/picks"`);
    expect(page).toContain('0 of 5 wines are marked as the restaurant’s pick.');
    const mine = buttons(page, 'Mark as pick');
    expect(mine.filter((b) => !isDisabled(b))).toHaveLength(wines.length);
    expect(page).not.toMatch(/\bAI\b/);

    const theirs = await text(await picksPage(marta));
    expect(theirs).toContain('View only');
    expect(theirs).toContain('Only the owner and the general manager change the picks.');
    const all = buttons(theirs, 'Mark as pick');
    expect(all.length).toBe(mine.length);
    expect(all.every(isDisabled)).toBe(true);
    expect(theirs).toContain('Before and after'); // the simulator stays open to the role

    const anonymous = await fetch(`${base()}/admin/${HALKA}/picks`, { redirect: 'manual' });
    expect(anonymous.status).toBeGreaterThanOrEqual(300);
    expect(anonymous.status).toBeLessThan(400);
    expect(anonymous.headers.get('location') ?? '').toContain('/admin/login');
    const foreign = await get(anna, `/admin/${HALKA}/picks`);
    const body = await text(foreign);
    expect(foreign.status === 404 || foreign.status === 403 || (foreign.status >= 300 && foreign.status < 400)).toBe(true);
    expect(body).not.toContain(wines[0].name);
  });
});

describe('the switch without JavaScript', () => {
  it('marks a wine: the redirect says so, the page shows it waiting for publish, A11 counts +1 / −0, the history row names who', async () => {
    await clear();
    const before = await digest();
    const r = await flip(tomasz, wines[0].id, true);
    expect(r.status).toBeGreaterThanOrEqual(300);
    expect(r.location).toBe(`/admin/${HALKA}/picks?saved=pick_marked`);
    const page = await text(await picksPage(tomasz, '?saved=pick_marked'));
    expect(page).toContain('Marked as the restaurant’s pick. Guests see it after you publish.');
    expect(page).toContain('1 of 5 wines are marked as the restaurant’s pick.');
    expect(page).toContain('Pick, waiting for publish');
    expect(page).toContain('Not visible to guests yet: 1 to add and 0 to remove.');
    expect(page).toContain('>Remove pick');
    const publish = await text(await get(tomasz, `/admin/${HALKA}/publish`));
    expect(publish).toContain('Restaurant’s picks: +1 / −0');
    expect((await digest()).restaurant_pick).not.toBe(before.restaurant_pick);
    const edits = await queryDatabase<{ actor: string; enabled: boolean }>(db(), 'select actor, enabled from pick_edit order by at, id', []);
    expect(edits.at(-1)).toEqual({ actor: 'Tomasz Lis', enabled: true });
    // the same switch again is a no-op with its own message and no new history row
    const again = await flip(tomasz, wines[0].id, true);
    expect(again.location).toBe(`/admin/${HALKA}/picks?saved=pick_unchanged`);
    expect(await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from pick_edit', [])).toEqual([{ n: String(edits.length) }]);
  });

  it('A4, A5 and A6 carry the mark; after the publish it is live, and an unmarked live pick waits for the next publish', async () => {
    await clear();
    expect((await flip(tomasz, wines[0].id, true)).location).toContain('saved=pick_marked');
    expect(await text(await get(tomasz, `/admin/${HALKA}/wines`))).toContain('Pick, waiting for publish');
    const wine = await text(await get(tomasz, `/admin/${HALKA}/wines/${wines[0].id}`));
    expect(wine).toContain('It is marked, but guests do not see it as a pick until you publish.');
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    expect((await state(tomasz)).picks[0]).toMatchObject({ wineId: wines[0].id, published: true });
    const live = await text(await picksPage(tomasz));
    expect(live).not.toContain('waiting for publish');
    expect(live).not.toContain('Not visible to guests yet');
    const a6 = await text(await get(marta, `/admin/${HALKA}/pairings/${dishId}`));
    expect(a6).toContain('data-picks-on-dish');
    expect(a6).toContain('Restaurant’s picks on this dish');
    expect((await flip(tomasz, wines[0].id, false)).location).toContain('saved=pick_unmarked');
    expect(await text(await picksPage(tomasz))).toContain('No longer a pick, guests still see it until you publish');
    expect(await text(await get(tomasz, `/admin/${HALKA}/publish`))).toContain('Restaurant’s picks: +0 / −1');
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    expect(await text(await get(tomasz, `/admin/${HALKA}/publish`))).not.toContain('data-pending-picks');
  });
});

describe('refusals change nothing (engineering-standards §10, the three checks for the form)', () => {
  it('the Wine Director’s forged post, a stale version, a sixth pick, an unknown wine and a hidden wine are refused and leave the tables as they were', async () => {
    await clear();
    // positive control: the General Manager can mark five wines through the form
    for (const w of wines.slice(0, 5)) expect((await flip(tomasz, w.id, true)).location).toContain('saved=pick_marked');
    const full = await state(tomasz);
    expect(full.picks).toHaveLength(5);
    const before = await digest();
    const pageBefore = normalise(await text(await picksPage(tomasz)));

    const forged = await flip(marta, wines[0].id, false, { expectedVersion: full.version });
    expect(forged.location).toBe(`/admin/${HALKA}/picks?error=forbidden`);
    expect((await flip(tomasz, wines[0].id, false, { expectedVersion: '00000000-0' })).location).toBe(`/admin/${HALKA}/picks?error=version_conflict`);
    expect((await flip(tomasz, wines[5].id, true)).location).toBe(`/admin/${HALKA}/picks?error=too_many_picks`);
    expect((await flip(tomasz, '00000000-0000-4000-8000-00000000dead', true)).location).toBe(`/admin/${HALKA}/picks?error=not_found`);
    expect((await flip(tomasz, 'not-a-uuid', true)).location).toBe(`/admin/${HALKA}/picks?error=not_found`);
    // another restaurant's owner posting under this slug gets no change either
    const foreign = await flip(anna, wines[0].id, false, { expectedVersion: full.version });
    expect(foreign.location).not.toContain('saved=');

    expect(await digest()).toEqual(before);
    // two reads of an unchanged page differ in the CSP nonce and the order of the streamed rows only (T-33): compare the normalised text
    expect(normalise(await text(await picksPage(tomasz)))).toBe(pageBefore);
    // the error is shown on the page in words
    const shown = await text(await picksPage(tomasz, '?error=too_many_picks'));
    expect(shown).toContain('A restaurant can mark at most 5 wines as its picks. Remove one first.');
    await clear();
    if (hidden) expect((await flip(tomasz, hidden.id, true)).location).toBe(`/admin/${HALKA}/picks?error=wine_inactive`);
    expect((await state(tomasz)).picks).toEqual([]);
  });
});

describe('the simulator form (GET)', () => {
  it('shows before and after for the tried wines, is open to the Wine Director, and writes nothing', async () => {
    await clear();
    const before = await digest();
    const q = `?${wines.slice(0, 5).map((w) => `picks=${w.id}`).join('&')}`;
    for (const s of [tomasz, marta]) {
      const page = await text(await picksPage(s, q));
      expect(page).toMatch(/of \d+ dish(es)? (change|changes) order\./);
      expect(page).toContain('What each pick does');
      expect(page.match(/type="checkbox"[^>]*checked|checked[^>]*type="checkbox"/g)?.length).toBe(5);
    }
    const none = await text(await picksPage(marta, '?picks='));
    expect(none).toContain('No picks to try.');
    const bad = await text(await picksPage(marta, `?${wines.slice(0, 6).map((w) => `picks=${w.id}`).join('&')}`));
    expect(bad).toContain('Check the simulation: choose at most 5 wines and a dish from the list.');
    const unknown = await text(await picksPage(marta, `?picks=00000000-0000-4000-8000-00000000dead`));
    expect(unknown).toContain('What each pick does'); // a foreign or unknown id is an answer like any other, not an error
    expect(await digest()).toEqual(before);
  });
});
