import { DEMO_PASSWORD } from '@wine-match/core';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BISTRO, HALKA, base, bistroOwner, db, digest, get, halkaManager, halkaSommelier, runAction, send, snapshotDatabase, type Session } from './boundaries';

/**
 * Spec 2026-11-04-panel-completion, F2: editing the taste profile of a dish (A3) and a wine (A5), on PostgreSQL, over plain HTTP the way a
 * browser without JavaScript sends it (a GET form for the preview, a POST form for the save). Guests keep reading the published profile.
 * The database is recorded first and put back at the end (the files share one database in sequence).
 */
void DEMO_PASSWORD;
let marta: Session; let tomasz: Session; let anna: Session;
let restoreDatabase: (() => Promise<void>) | undefined;
let halkaId = ''; let bistroId = ''; let duckId = ''; let wineId = '';

type Profile = Record<string, number | string | boolean>;
const DISH_COLUMNS = ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess', 'protein', 'cooking'];
const WINE_COLUMNS = ['sweetness', 'acidity', 'tannin', 'body', 'alcohol', 'fruitiness', 'oak', 'aromatic', 'freshness', 'style', 'adventurous'];

async function profileOf(table: 'dish' | 'wine', id: string): Promise<Profile> {
  const cols = table === 'dish' ? DISH_COLUMNS : WINE_COLUMNS;
  const row = (await queryDatabase<Record<string, number | string | boolean>>(db(), `select ${cols.map((c) => `profile_${c}::text as ${c}`).join(', ')} from ${table} where id = $1`, [id]))[0]!;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, k === 'protein' || k === 'cooking' || k === 'style' ? String(v) : k === 'adventurous' ? v === 'true' : Number(v)]));
}
const state = async (table: 'dish' | 'wine', id: string) => (await queryDatabase<{ j: Record<string, unknown> }>(db(), `select to_jsonb(x) as j from ${table} x where id = $1`, [id]))[0]!.j;
const edits = async () => (await queryDatabase<{ kind: string; subject_id: string; actor: string; before: Record<string, unknown>; after: Record<string, unknown> }>(db(), 'select kind, subject_id, actor, before, after from profile_edit order by created_at', []));
const fields = (p: Profile) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
const query = (p: Profile) => new URLSearchParams(fields(p)).toString();
const text = async (r: Response) => (await r.text()).replace(/<!-- -->/g, '');
const guestScores = async (dishId: string) => ((await (await fetch(`${base()}/api/v1/dishes/${dishId}/recommendations?restaurant=${HALKA}&limit=8`)).json()) as { recommendations?: Array<{ wine: { id: string }; matchScore: number }>; items?: Array<{ wine: { id: string }; matchScore: number }> });
const scoresOf = async (dishId: string) => { const b = await guestScores(dishId); return JSON.stringify((b.recommendations ?? b.items ?? []).map((i) => [i.wine.id, i.matchScore])); };
/** The `version` field of the taste-profile editor (A3 and A5 also carry the fingerprint of the catalog form and of the translations). */
const profileVersionIn = (page: string) => /name="version" value="([0-9a-f]{8}-\d+)"/.exec(page.slice(Math.max(0, page.indexOf('id="profile-editor"'))));
const pending = async (s: Session) => Number(/(\d+) unpublished change/.exec(await text(await get(s, `/admin/${HALKA}/publish`)))?.[1] ?? '0');

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  [marta, tomasz, anna] = await Promise.all([halkaSommelier(), halkaManager(), bistroOwner()]);
  halkaId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [HALKA]))[0]!.id;
  bistroId = (await queryDatabase<{ id: string }>(db(), 'select id from restaurant where slug = $1', [BISTRO]))[0]!.id;
  duckId = (await queryDatabase<{ id: string }>(db(), `select id from dish where restaurant_id = $1 and name = 'Duck breast'`, [halkaId]))[0]!.id;
  wineId = (await queryDatabase<{ id: string }>(db(), 'select id from wine where restaurant_id = $1 and active order by name limit 1', [halkaId]))[0]!.id;
}, 120_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('editing a taste profile (A3, A5)', () => {
  it('A3 without JavaScript: the preview shows before and after, Save and confirm confirms the profile, the unpublished counter grows and guests keep the old score until publish', async () => {
    const current = await profileOf('dish', duckId);
    const next = { ...current, intensity: current.intensity === 5 ? 1 : 5, fat: current.fat === 5 ? 1 : 5, acidity: current.acidity === 0 ? 4 : 0 };
    // the editor with the stored values, and the preview from the URL: a table with "before → after, delta" per wine
    const plain = await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`));
    expect(plain).toContain('Edit taste profile');
    expect(plain).toContain('Save and confirm');
    const version = profileVersionIn(plain)?.[1] ?? '';
    expect(version).toMatch(/^[0-9a-f]{8}-\d+$/);
    const previewHtml = await text(await get(marta, `/admin/${HALKA}/menu/${duckId}?${query(next)}`));
    expect(previewHtml).toContain('How the match changes');
    expect(previewHtml).toMatch(/\d+ → \d+, (\+\d+|−\d+|no change)/);
    // the preview writes nothing
    expect(await profileOf('dish', duckId)).toEqual(current);
    expect(await edits()).toEqual([]);

    const guestBefore = await scoresOf(duckId);
    const n0 = await pending(marta);
    const saved = await runAction(marta, 'saveDishProfile', HALKA, { dishId: duckId, version, confirm: 'true', back: `/admin/${HALKA}/menu/${duckId}`, ...fields(next) }, [`/menu/${duckId}`]);
    expect(saved.location).toContain('saved=profile_confirmed');
    expect(await profileOf('dish', duckId)).toEqual(next);
    const row = (await queryDatabase<{ s: string; by: string | null; at: string | null }>(db(), 'select profile_source as s, profile_confirmed_by as by, profile_confirmed_at::text as at from dish where id = $1', [duckId]))[0]!;
    expect(row).toMatchObject({ s: 'confirmed', by: 'Marta Wierzbicka' });
    expect(row.at).toBeTruthy();
    const log = await edits();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'dish', subject_id: duckId, actor: 'Marta Wierzbicka' });
    expect(log[0].before).toMatchObject({ intensity: current.intensity });
    expect(log[0].after).toMatchObject({ intensity: next.intensity, source: 'confirmed' });
    // the banner now says who confirmed it; the counter grew by one; guests still see the published profile
    expect(await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`))).toContain('Confirmed by Marta Wierzbicka');
    expect(await pending(marta)).toBe(n0 + 1);
    expect(await scoresOf(duckId)).toBe(guestBefore);
    expect((await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/publish`, {})).status).toBe(201);
    expect(await scoresOf(duckId)).not.toBe(guestBefore);
  });

  it('a stale form is refused with a conflict message and changes nothing; Save as draft and Confirm without changes change only the state', async () => {
    const plain = await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`));
    const stale = profileVersionIn(plain)![1];
    const current = await profileOf('dish', duckId);
    // another editor saves first
    const first = { ...current, umami: current.umami === 5 ? 0 : current.umami + 1 };
    expect((await runAction(tomasz, 'saveDishProfile', HALKA, { dishId: duckId, version: stale, confirm: 'true', ...fields(first) }, [`/menu/${duckId}`])).location).toContain('saved=profile_confirmed');
    const before = await state('dish', duckId);
    const rows = (await edits()).length;
    const lost = await runAction(marta, 'saveDishProfile', HALKA, { dishId: duckId, version: stale, confirm: 'true', ...fields({ ...current, smoke: 5 }) }, [`/menu/${duckId}`]);
    expect(lost.location).toContain('error=version_conflict');
    expect(await state('dish', duckId)).toEqual(before);
    expect((await edits()).length).toBe(rows);
    // a draft: the scales as sent, the state back to draft, nobody confirmed
    const fresh = profileVersionIn(await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`)))![1];
    expect((await runAction(marta, 'saveDishProfile', HALKA, { dishId: duckId, version: fresh, confirm: 'false', ...fields(first) }, [`/menu/${duckId}`])).location).toContain('saved=profile_draft');
    expect((await queryDatabase<{ s: string; by: string | null }>(db(), 'select profile_source as s, profile_confirmed_by as by from dish where id = $1', [duckId]))[0]).toEqual({ s: 'draft', by: null });
    const draftHtml = await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`));
    expect(draftHtml).toContain('Not confirmed yet');
    expect(draftHtml).toContain('Confirm without changes');
    // saving the same draft again changes nothing and says so
    const again = profileVersionIn(draftHtml)![1];
    expect((await runAction(marta, 'saveDishProfile', HALKA, { dishId: duckId, version: again, confirm: 'false', ...fields(first) }, [`/menu/${duckId}`])).location).toContain('saved=profile_unchanged');
    // confirm without changes: the scales stay, the state becomes confirmed
    const scales = await profileOf('dish', duckId);
    expect((await runAction(marta, 'confirmDishProfile', HALKA, { dishId: duckId, version: again }, [`/menu/${duckId}`])).location).toContain('saved=profile_confirmed');
    expect(await profileOf('dish', duckId)).toEqual(scales);
    expect((await queryDatabase<{ s: string }>(db(), 'select profile_source as s from dish where id = $1', [duckId]))[0]!.s).toBe('confirmed');
  });

  it('an invalid value is refused and nothing is saved: scales from 0 to 5, alcohol from 0 to 25', async () => {
    const current = await profileOf('dish', duckId);
    const version = profileVersionIn(await text(await get(marta, `/admin/${HALKA}/menu/${duckId}`)))![1];
    const before = await state('dish', duckId);
    const res = await runAction(marta, 'saveDishProfile', HALKA, { dishId: duckId, version, confirm: 'true', ...fields({ ...current, intensity: 9 }) }, [`/menu/${duckId}`]);
    expect(res.location).toContain('error=profile_invalid');
    expect(await state('dish', duckId)).toEqual(before);
    const wineVersion = profileVersionIn(await text(await get(marta, `/admin/${HALKA}/wines/${wineId}`)))![1];
    const wine = await profileOf('wine', wineId);
    const wineBefore = await state('wine', wineId);
    expect((await runAction(marta, 'saveWineProfile', HALKA, { wineId, version: wineVersion, confirm: 'true', ...fields({ ...wine, alcohol: 30 }) }, [`/wines/${wineId}`])).location).toContain('error=profile_invalid');
    expect(await state('wine', wineId)).toEqual(wineBefore);
    // the preview with the same value says it needs valid values and offers no save
    const html = await text(await get(marta, `/admin/${HALKA}/menu/${duckId}?${query({ ...current, intensity: 9 })}`));
    expect(html).toContain('The preview needs valid values.');
    expect(html).not.toContain('Save and confirm');
  });

  it('A5: a wine profile saved as a draft and then confirmed; the preview lists the dishes of the menu and the API preview gives the same numbers', async () => {
    const wine = await profileOf('wine', wineId);
    const next = { ...wine, body: wine.body === 5 ? 1 : 5, tannin: wine.tannin === 5 ? 1 : 5, alcohol: 14.5 };
    const html = await text(await get(marta, `/admin/${HALKA}/wines/${wineId}?${query(next)}`));
    expect(html).toContain('How the match changes');
    const api = (await (await get(marta, `/api/v1/wines/${wineId}/profile/preview?restaurant=${HALKA}&${query(next)}`)).json()) as { rows: Array<{ before: number; after: number; delta: number }> };
    expect(api.rows.length).toBeGreaterThan(3);
    for (const r of api.rows) expect(html).toContain(`${r.before} → ${r.after}, ${r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `−${Math.abs(r.delta)}` : 'no change'}`);
    const version = profileVersionIn(await text(await get(marta, `/admin/${HALKA}/wines/${wineId}`)))![1];
    expect((await runAction(marta, 'saveWineProfile', HALKA, { wineId, version, confirm: 'false', ...fields(next) }, [`/wines/${wineId}`])).location).toContain('saved=profile_draft');
    expect((await queryDatabase<{ s: string; a: string }>(db(), 'select profile_source as s, profile_alcohol::text as a from wine where id = $1', [wineId]))[0]).toEqual({ s: 'grape_defaults', a: '14.5' });
    expect(await text(await get(marta, `/admin/${HALKA}/publish`))).toContain('still a draft');
    const v2 = profileVersionIn(await text(await get(marta, `/admin/${HALKA}/wines/${wineId}`)))![1];
    expect((await runAction(marta, 'confirmWineProfile', HALKA, { wineId, version: v2 }, [`/wines/${wineId}`])).location).toContain('saved=profile_confirmed');
    expect((await queryDatabase<{ s: string; by: string }>(db(), 'select profile_source as s, profile_confirmed_by as by from wine where id = $1', [wineId]))[0]).toEqual({ s: 'confirmed', by: 'Marta Wierzbicka' });
  });
});

describe('access to the profile routes', () => {
  it('both accounts may edit their own restaurant; refused reads and writes by the other restaurant leave every table as it was, and a foreign id is not found', async () => {
    // a dish of the other restaurant, cloned from Halka's
    const bistroDish = (await queryDatabase<{ id: string }>(db(), `insert into dish select (jsonb_populate_record(null::dish, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid(), 'restaurant_id', $2::uuid))).* from dish d where d.id = $1 returning id`, [duckId, bistroId]))[0]!.id;
    const versionOf = async (s: Session, slug: string, id: string) => ((await (await get(s, `/api/v1/dishes/${id}/profile?restaurant=${slug}`)).json()) as { version: string }).version;
    const put = (s: Session, slug: string, id: string, version: string, profile: Profile) => send(s, 'PUT', `/api/v1/dishes/${id}/profile?restaurant=${slug}`, { profile, confirm: true }, { 'if-match': `"${version}"` });
    const halkaProfile = await profileOf('dish', duckId);
    const bistroProfile = await profileOf('dish', bistroDish);
    // positive controls: each account edits its own restaurant's dish
    expect((await put(marta, HALKA, duckId, await versionOf(marta, HALKA, duckId), { ...halkaProfile, spice: halkaProfile.spice === 5 ? 0 : 5 })).status).toBe(200);
    expect((await put(anna, BISTRO, bistroDish, await versionOf(anna, BISTRO, bistroDish), { ...bistroProfile, spice: bistroProfile.spice === 5 ? 0 : 5 })).status).toBe(200);
    expect(await edits().then((e) => e.filter((x) => x.subject_id === bistroDish).length)).toBe(1);
    // refusals: the other restaurant's slug is 403 for read, write and preview; a foreign dish id under one's own slug is 404
    const beforeTables = await digest();
    const halkaVersion = await versionOf(marta, HALKA, duckId);
    const bistroVersion = await versionOf(anna, BISTRO, bistroDish);
    const harm = { ...halkaProfile, intensity: 0, fat: 0 };
    expect((await get(anna, `/api/v1/dishes/${duckId}/profile?restaurant=${HALKA}`)).status).toBe(403);
    expect((await put(anna, HALKA, duckId, halkaVersion, harm)).status).toBe(403);
    expect((await get(anna, `/api/v1/dishes/${duckId}/profile/preview?restaurant=${HALKA}&${query(harm)}`)).status).toBe(403);
    expect((await put(marta, BISTRO, bistroDish, bistroVersion, harm)).status).toBe(403);
    expect((await get(marta, `/api/v1/dishes/${bistroDish}/profile/preview?restaurant=${BISTRO}&${query(harm)}`)).status).toBe(403);
    expect((await put(marta, HALKA, bistroDish, bistroVersion, harm)).status).toBe(404);
    expect((await put(anna, BISTRO, duckId, halkaVersion, harm)).status).toBe(404);
    expect((await get(marta, `/api/v1/dishes/${bistroDish}/profile/preview?restaurant=${HALKA}&${query(harm)}`)).status).toBe(404);
    expect((await send(marta, 'PUT', `/api/v1/dishes/${duckId}/profile?restaurant=${HALKA}`, { profile: harm, confirm: true })).status).toBe(428);
    // the whole state after the attempts: every table digest and both profiles
    expect(await digest()).toEqual(beforeTables);
    expect(await profileOf('dish', bistroDish)).toMatchObject({ spice: bistroProfile.spice === 5 ? 0 : 5 });
    expect((await profileOf('dish', duckId)).intensity).not.toBe(0);
  });
});
