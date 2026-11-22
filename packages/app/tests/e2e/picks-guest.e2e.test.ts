import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalise } from './guest-compare';
import { HALKA, base, db, errorCode, get, halkaManager, halkaSommelier, send, snapshotDatabase, type Session } from './boundaries';

/**
 * Spec 2026-11-18-restaurant-picks, PR2: the guest side of the picks on the built app and PostgreSQL, plain HTTP, no script
 * (AC7, AC12, AC13, AC14, AC15). The restaurant's set reaches guests only with a publish; the Match Score never moves;
 * the sommelier's pairs keep their places; the label is on the pages in both languages; the events carry the flag.
 * The file records the database first and puts it back at the end (the files share one database in sequence).
 */
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SID = '0c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
let restoreDatabase: (() => Promise<void>) | undefined;
let tomasz: Session; let marta: Session;
let wines: string[] = [];
let dishes: Array<{ id: string; name: string }> = [];

type Item = { wine: { id: string }; matchScore: number; tier: string; sommelier: unknown; restaurantPick: boolean; why: string; bestValue: boolean };
type Reco = { items: Item[] };

const apiList = async (dishId: string): Promise<{ status: number; raw: string; body: Reco }> => {
  const res = await fetch(`${base()}/api/v1/dishes/${dishId}/recommendations?restaurant=${HALKA}&limit=6`);
  const raw = await res.text();
  return { status: res.status, raw, body: JSON.parse(raw) as Reco };
};
const page = async (path: string, lang = 'en') => {
  const res = await fetch(`${base()}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': lang }, redirect: 'manual' });
  return { status: res.status, html: normalise(await res.text()) };
};
/**
 * A dish whose list as the guest pages show it (the default limit of 4, the same list G3 and G9 render) has a labelled wine,
 * and that wine. The comparison lists above ask for 6 items; a pick in places 5 and 6 is not on the page, so the page tests
 * choose their dish and wine from what the page shows, never from the longer list.
 */
const shownHit = async (): Promise<{ dishId: string; pick: string; other: string | undefined }> => {
  for (const d of dishes) {
    const res = await fetch(`${base()}/api/v1/dishes/${d.id}/recommendations?restaurant=${HALKA}`);
    const items = ((await res.json()) as Reco).items;
    const pick = items.find((i) => i.restaurantPick);
    if (pick) return { dishId: d.id, pick: pick.wine.id, other: items.find((i) => !i.restaurantPick)?.wine.id };
  }
  throw new Error('no dish shows a restaurant pick on its first four places');
};
const lists = async () => Promise.all(dishes.map(async (d) => ({ dish: d, ...(await apiList(d.id)) })));
const version = async () => ((await (await get(tomasz, `/api/v1/restaurants/${HALKA}/picks`)).json()) as { version: string }).version;
const mark = async (wineId: string, on: boolean) => send(tomasz, 'PUT', `/api/v1/wines/${wineId}/pick?restaurant=${HALKA}`, { on }, { 'if-match': `"${await version()}"` });
const marks = (html: string) => [...html.matchAll(/data-pick="restaurant"[^>]*>([^<]*)</g)].map((m) => m[1]);

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [tomasz, marta] = [await halkaManager(), await halkaSommelier()];
  wines = (await queryDatabase<{ id: string }>(db(), `select w.id from wine w join restaurant r on r.id = w.restaurant_id where r.slug = $1 and w.active and w.deleted_at is null order by w.id`, [HALKA])).map((w) => w.id);
  dishes = await queryDatabase<{ id: string; name: string }>(db(), `select d.id, d.name from dish d join restaurant r on r.id = d.restaurant_id where r.slug = $1 and d.status = 'published' and d.deleted_at is null order by d.name`, [HALKA]);
  // the equality below starts from a published state without picks: publish what is pending (nothing to publish is fine)
  const first = await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {});
  if (first.status !== 201) { expect(first.status).toBe(422); expect(await errorCode(first)).toBe('nothing_to_publish'); }
  const current = ((await (await get(tomasz, `/api/v1/restaurants/${HALKA}/picks`)).json()) as { picks: Array<{ wineId: string }> }).picks;
  for (const p of current) expect((await mark(p.wineId, false)).status).toBe(200);
  const again = await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {});
  if (again.status !== 201) { expect(again.status).toBe(422); expect(await errorCode(again)).toBe('nothing_to_publish'); }
}, 180_000);
afterAll(async () => { await restoreDatabase?.(); });

let beforeLists: Awaited<ReturnType<typeof lists>> = [];
let afterLists: Awaited<ReturnType<typeof lists>> = [];

describe('picks reach guests only with a publish, and move nothing but the order (AC7, AC15)', () => {
  it('an unpublished set changes no byte of any guest payload; after the publish wines carry the label and every score and reason is the engine\'s', async () => {
    beforeLists = await lists();
    const pagesBefore = await Promise.all(dishes.map((d) => page(`/r/${HALKA}/dish/${d.id}/wines?sid=${SID}`)));
    for (const b of beforeLists) { expect(b.status).toBe(200); expect(b.body.items.every((i) => i.restaurantPick === false)).toBe(true); }
    for (const p of pagesBefore) expect(marks(p.html)).toEqual([]);

    for (const w of wines.slice(0, 5)) expect((await mark(w, true)).status).toBe(200);
    // working set only: the whole payloads (API and pages) are the same as before
    const unpublished = await lists();
    expect(unpublished.map((l) => l.raw)).toEqual(beforeLists.map((l) => l.raw));
    const pagesUnpublished = await Promise.all(dishes.map((d) => page(`/r/${HALKA}/dish/${d.id}/wines?sid=${SID}`)));
    expect(pagesUnpublished.map((p) => p.html)).toEqual(pagesBefore.map((p) => p.html));

    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    afterLists = await lists();
    let labelled = 0; let reordered = 0;
    afterLists.forEach((a, k) => {
      const was = new Map(beforeLists[k].body.items.map((i) => [i.wine.id, i]));
      for (const i of a.body.items) {
        const w = was.get(i.wine.id);
        if (w) { expect(i.matchScore, `${a.dish.name} ${i.wine.id}`).toBe(w.matchScore); expect(i.why).toBe(w.why); }
        if (i.restaurantPick) labelled += 1;
      }
      if (a.body.items.map((i) => i.wine.id).join() !== beforeLists[k].body.items.map((i) => i.wine.id).join()) reordered += 1;
    });
    expect(labelled).toBeGreaterThan(0);
    expect(reordered).toBeGreaterThan(0);
  });

  it('the sommelier\'s pairs keep their company and their places, carry no pick label, and a pick never stands above them', async () => {
    afterLists.forEach((a, k) => {
      const b = beforeLists[k];
      expect(a.body.items.filter((i) => i.tier !== 'engine'), a.dish.name).toEqual(b.body.items.filter((i) => i.tier !== 'engine'));
      const firstEngine = a.body.items.findIndex((i) => i.tier === 'engine');
      a.body.items.forEach((i, at) => {
        if (i.tier !== 'engine') { expect(i.restaurantPick).toBe(false); expect(i.sommelier).not.toBeNull(); if (firstEngine >= 0) expect(at).toBeLessThan(firstEngine); }
        else expect(i.sommelier).toBeNull();
      });
    });
  });

  it('only wines from a raw score of 75 are labelled and at most two picks move to the front of the engine\'s group', async () => {
    let promotedDishes = 0;
    afterLists.forEach((a, k) => {
      const engine = a.body.items.filter((i) => i.tier === 'engine');
      const was = beforeLists[k].body.items.filter((i) => i.tier === 'engine').map((i) => i.wine.id);
      for (const i of engine) if (i.restaurantPick) expect(i.matchScore, `${a.dish.name} ${i.wine.id}`).toBeGreaterThanOrEqual(75);
      // a pick that stands higher than it did is a promoted one: the layer promotes at most two per list
      const movedUp = engine.filter((i, at) => i.restaurantPick && was.includes(i.wine.id) && at < was.indexOf(i.wine.id));
      expect(movedUp.length, a.dish.name).toBeLessThanOrEqual(2);
      if (movedUp.length > 0) promotedDishes += 1;
    });
    expect(promotedDishes).toBeGreaterThan(0);
  });
});

describe('the label on the pages, without a script (AC12, AC13)', () => {
  it('G3, G7 and G9 show the restaurant\'s pick in English and Polish, never with the seal wording; G12 says what it is', async () => {
    const shown = await shownHit();
    const hit = { dish: { id: shown.dishId } };
    const wine = shown.pick;
    const g3 = await page(`/r/${HALKA}/dish/${hit.dish.id}/wines?sid=${SID}`);
    expect(g3.status).toBe(200);
    expect(marks(g3.html)).toContain('Restaurant’s pick');
    const g3pl = await page(`/r/${HALKA}/dish/${hit.dish.id}/wines?lang=pl&sid=${SID}`, 'pl');
    expect(marks(g3pl.html)).toContain('Wybór restauracji');
    const g7 = await page(`/r/${HALKA}/wine/${wine}?dish=${hit.dish.id}&sid=${SID}`);
    expect(marks(g7.html)).toEqual(['Restaurant’s pick']);
    expect(marks((await page(`/r/${HALKA}/wine/${wine}?sid=${SID}`)).html)).toEqual([]);
    const g9 = await page(`/r/${HALKA}/staff?dish=${hit.dish.id}`);
    expect(marks(g9.html)).toContain('Restaurant’s pick');
    for (const p of [g3, g3pl, g7, g9]) expect(p.html).not.toMatch(/\bAI\b/);
    // the sentence of the guest explanation
    const g12 = await page(`/r/${HALKA}/how-it-works?sid=${SID}`);
    expect(g12.html).toContain('A restaurant can mark some wines as its pick and show them higher among the suggestions.');
    const g12pl = await page(`/r/${HALKA}/how-it-works?lang=pl&sid=${SID}`, 'pl');
    expect(g12pl.html).toContain('Restauracja może oznaczyć część win jako swój wybór i pokazać je wyżej wśród propozycji.');
  });
});

describe('the events carry the flag only for a labelled wine (AC14)', () => {
  it('recommendations_viewed items, wine_viewed and wine_selected have `pick: true` for the pick and nothing else has it', async () => {
    const sid = '1c2d3e4f-5a6b-4c7d-9e8f-01a2b3c4d5e6';
    const shown = await shownHit();
    const hit = { dish: { id: shown.dishId } };
    const pick = shown.pick;
    const other = shown.other;
    await page(`/r/${HALKA}/dish/${hit.dish.id}/wines?sid=${sid}`);
    await page(`/r/${HALKA}/wine/${pick}?dish=${hit.dish.id}&sid=${sid}`);
    await page(`/r/${HALKA}/selected/${pick}?dish=${hit.dish.id}&serving=bottle&sid=${sid}`);
    if (other) await page(`/r/${HALKA}/wine/${other}?dish=${hit.dish.id}&sid=${sid}`);
    const until = Date.now() + 8_000;
    let rows: Array<{ name: string; wine_id: string | null; props: { pick?: boolean; items?: Array<{ wineId: string; pick?: boolean }> } }> = [];
    do {
      rows = await queryDatabase(db(), 'select name, wine_id::text, props from guest_interaction where session_id = $1 order by id', [sid]);
      if (rows.length >= (other ? 5 : 4)) break;
      await new Promise((r) => setTimeout(r, 200));
    } while (Date.now() < until);
    const viewed = rows.find((r) => r.name === 'recommendations_viewed')!;
    expect(viewed.props.items!.find((i) => i.wineId === pick)?.pick).toBe(true);
    for (const i of viewed.props.items!) if (i.wineId === other) expect('pick' in i).toBe(false);
    const flagged = (name: string, wineId: string) => rows.filter((r) => r.name === name && r.wine_id === wineId);
    expect(flagged('wine_viewed', pick)[0].props.pick).toBe(true);
    expect(flagged('wine_selected', pick)[0].props.pick).toBe(true);
    if (other) expect('pick' in flagged('wine_viewed', other)[0].props).toBe(false);
  });
});
