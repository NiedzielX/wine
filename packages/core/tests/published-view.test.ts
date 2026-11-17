import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEFAULT_PREFS, type Dish, type Wine } from '../src/domain/types';
import { recommendForDish } from '../src/engine/recommend';
import { pairingScore } from '../src/engine/scoring';
import { VersionConflictError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { PublishService } from '../src/services/publishing/publish-service';
import { loadPublishedView, resolveView } from '../src/services/publishing/published-view';
import { buildSnapshot, countProfileChanges, readSnapshot, SNAPSHOT_SCHEMA, type PublishedSnapshot } from '../src/services/publishing/snapshot';
import { RecommendationCodeService } from '../src/services/recommendations/recommendation-code-service';
import { createLogger } from '../src/logging/logger';

/** Spec 2026-11-04-panel-completion, F1: the published snapshot v2 and the one view of what guests see (R1, R2). */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const byName = (name: string) => ds.dishes.find((d) => d.name === name)!;
const duck = byName('Duck breast');
const draft = ds.dishes.find((d) => d.status === 'draft')!;
const inactive = ds.wines.find((w) => !w.active)!;
let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function setup() {
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  const clock = { now: () => new Date('2026-11-16T12:00:00.000Z') };
  return {
    store, repos,
    catalog: new CatalogService(repos),
    rec: new RecommendationService(repos),
    publish: new PublishService({ ...repos, clock, idGenerator: { uuid } }),
    codes: new RecommendationCodeService({ ...repos, clock, idGenerator: { uuid }, logger: createLogger(() => {}) }),
    dish: (id: string) => store.dishes.get(RID)!.find((d) => d.id === id)!,
    wine: (id: string) => store.wines.get(RID)!.find((w) => w.id === id)!
  };
}

const scores = async (rec: RecommendationService, dishId: string) => (await rec.forDish('halka', dishId, {}, 8))!.result.items.map((i) => [i.wine.id, i.matchScore]);
const SESSION = { id: '11111111-1111-4111-8111-111111111111', isNew: false, source: 'qr' as const };

describe('snapshot v2 (R1, AC1)', () => {
  it('a publish stores schema 2, the profile of every dish and wine (hidden and inactive included) and the menu', async () => {
    const t = setup();
    t.dish(duck.id).status = 'hidden';
    await t.repos.publishRepository.publish(RID, { actor: 'Test', at: '2026-11-16T12:00:00.000Z', id: uuid() });
    const v = (await t.repos.publishRepository.effective(RID))!;
    expect(v.info.number).toBe(2);
    expect(v.snapshot.schema).toBe(SNAPSHOT_SCHEMA);
    expect(v.snapshot.profiles!.dishes.map((d) => d.id).sort()).toEqual(ds.dishes.map((d) => d.id).sort());
    expect(v.snapshot.profiles!.wines.map((w) => w.id)).toContain(inactive.id);
    expect(v.snapshot.profiles!.wines.length).toBe(ds.wines.length);
    // drafts are released by this publish, hidden dishes stay known: every non-deleted dish is in the menu
    expect(v.snapshot.menu!.dishIds.sort()).toEqual(ds.dishes.map((d) => d.id).sort());
    // only the engine's scales: who confirmed a profile is not something guests see
    expect(Object.keys(v.snapshot.profiles!.dishes[0].profile)).not.toContain('source');
    expect(v.snapshot.profiles!.dishes.find((d) => d.id === duck.id)!.profile.intensity).toBe(duck.profile.intensity);
  });

  it('a version from before schema 2 reads as before: no profiles, no menu, pairings and translations kept', () => {
    const v2 = buildSnapshot({ restaurant: ds.restaurant, dishes: ds.dishes, wines: ds.wines, pairings: ds.pairings });
    const v1: PublishedSnapshot = { pairings: v2.pairings, content: v2.content };
    const read = readSnapshot(v1);
    expect(read).toMatchObject({ schema: 1, dishProfiles: null, wineProfiles: null, menuDishIds: null });
    expect(read.pairings.length).toBe(v2.pairings.length);
    expect(read.content.dishes.get(duck.id)).toEqual(duck.translations);
    expect(readSnapshot(null).schema).toBe(1);
    // the view of a v1 version shows the same dishes and profiles as the current state
    const view = resolveView({ restaurant: ds.restaurant, dishes: ds.dishes, wines: ds.wines, currentPairings: [], version: { info: { id: 'v', number: 1, changesCount: 0, publishedBy: 'x', publishedAt: '2026-10-01T00:00:00.000Z' }, snapshot: v1 } });
    expect(view.dishes.map((d) => [d.id, d.profile])).toEqual(ds.dishes.filter((d) => d.status === 'published').map((d) => [d.id, d.profile]));
    expect(view.wines.map((w) => w.id)).toEqual(ds.wines.filter((w) => w.active).map((w) => w.id));
    expect(countProfileChanges({ dishes: ds.dishes.map((d) => ({ ...d, profile: { ...d.profile, intensity: 0 } })), wines: ds.wines }, { info: view.version!, snapshot: v1 })).toBe(0);
  });
});

describe('PublishedView: profiles reach guests with the publish (R2, Q1, AC2)', () => {
  it('Halka: the guests\' results equal the engine on the demo data (nothing changes with F1)', async () => {
    const t = setup();
    for (const dish of ds.dishes.filter((d) => d.status === 'published')) {
      const direct = recommendForDish(dish, ds.wines.filter((w) => w.active), ds.pairings.filter((p) => p.dishId === dish.id && p.status !== 'suggested'), DEFAULT_PREFS, 8);
      expect(await scores(t.rec, dish.id)).toEqual(direct.items.map((i) => [i.wine.id, i.matchScore]));
    }
  });

  it('a changed dish or wine profile leaves the guest\'s Match Score alone until the next publish', async () => {
    const t = setup();
    const before = await scores(t.rec, duck.id);
    t.dish(duck.id).profile = { ...duck.profile, intensity: 0, fat: 0, umami: 0 };
    const someWine = ds.wines.find((w) => w.active)!;
    t.wine(someWine.id).profile = { ...someWine.profile, body: 0, tannin: 5 };
    expect(await scores(t.rec, duck.id)).toEqual(before);
    expect((await t.catalog.publishedDish('halka', duck.id))!.dish.profile.intensity).toBe(duck.profile.intensity);
    expect((await t.rec.wineDetails('halka', someWine.id))!.wine.profile.body).toBe(someWine.profile.body);
    expect((await t.publish.preview('halka')).pendingProfiles).toBe(2);
    await t.publish.publish('halka', ACTOR);
    const after = await scores(t.rec, duck.id);
    expect(after).not.toEqual(before);
    const scored = after.find(([id]) => id === someWine.id);
    if (scored) expect(scored[1]).toBe(pairingScore(t.dish(duck.id), t.wine(someWine.id)).score);
    expect((await t.publish.preview('halka')).pendingProfiles).toBe(0);
  });
});

describe('PublishedView: visibility (R2, AC3)', () => {
  it('a draft dish is visible nowhere a guest looks, and goes live with the publish', async () => {
    const t = setup();
    const other = ds.dishes.find((d) => d.status === 'published' && d.id !== duck.id)!;
    const wine = ds.wines.find((w) => w.active)!;
    expect((await t.catalog.publishedMenu('halka'))!.dishes.map((d) => d.id)).not.toContain(draft.id);
    expect(await t.catalog.publishedDish('halka', draft.id)).toBeNull();
    expect(await t.rec.forDish('halka', draft.id)).toBeNull();
    expect((await t.rec.wineDetails('halka', wine.id, draft.id))!.dish).toBeNull();
    await expect(t.rec.forTable('halka', [draft.id, other.id])).rejects.toMatchObject({ code: 'table_needs_two_dishes' });
    expect(await t.rec.tableWineQuantity('halka', wine.id, [draft.id, other.id], 4)).toBeNull();
    const issued = await t.codes.issue('halka', { session: SESSION, source: 'guest', wineId: wine.id, serving: 'bottle', dishIds: [draft.id] });
    expect((await t.repos.recommendationCodeRepository.findByCode(RID, issued!.serviceDay, issued!.code))!.dishIds).toEqual([]);
    await t.publish.publish('halka', ACTOR);
    expect(await t.rec.forDish('halka', draft.id)).not.toBeNull();
  });

  it('hiding a dish takes it away at once and showing it again brings it back at once, without a publish', async () => {
    const t = setup();
    t.dish(duck.id).status = 'hidden';
    expect(await t.rec.forDish('halka', duck.id)).toBeNull();
    expect((await t.catalog.publishedMenu('halka'))!.dishes.some((d) => d.id === duck.id)).toBe(false);
    t.dish(duck.id).status = 'published';
    expect(await t.rec.forDish('halka', duck.id)).not.toBeNull();
    // the same after a publish made while it was hidden: hidden dishes stay in the version
    t.dish(duck.id).status = 'hidden';
    await t.repos.publishRepository.publish(RID, { actor: 'Test', at: '2026-11-16T12:00:00.000Z', id: uuid() });
    t.dish(duck.id).status = 'published';
    expect(await t.rec.forDish('halka', duck.id)).not.toBeNull();
  });

  it('a dish or wine added after the last publish is not visible until the next publish', async () => {
    const t = setup();
    const newDish: Dish = { ...duck, id: '00000000-0000-4000-8000-0000000000d1', name: 'New dish', status: 'published', translations: {} };
    const template = ds.wines.find((w) => w.active)!;
    const newWine: Wine = { ...template, id: '00000000-0000-4000-8000-0000000000e1', name: 'New wine', translations: {} };
    t.store.dishes.get(RID)!.push(newDish);
    t.store.wines.get(RID)!.push(newWine);
    expect(await t.rec.forDish('halka', newDish.id)).toBeNull();
    expect(await t.rec.wineDetails('halka', newWine.id)).toBeNull();
    expect((await t.rec.forDish('halka', duck.id, {}, 50))!.result.items.some((i) => i.wine.id === newWine.id)).toBe(false);
    expect(await t.codes.issue('halka', { session: SESSION, source: 'guest', wineId: newWine.id, serving: 'bottle', dishIds: [] })).toBeNull();
    expect((await t.publish.preview('halka')).pendingProfiles).toBe(2);
    await t.publish.publish('halka', ACTOR);
    expect(await t.rec.forDish('halka', newDish.id)).not.toBeNull();
    expect(await t.rec.wineDetails('halka', newWine.id)).not.toBeNull();
  });

  it('an inactive wine keeps its page (unavailable, no match); an unknown one is null', async () => {
    const t = setup();
    const details = (await t.rec.wineDetails('halka', inactive.id, duck.id))!;
    expect(details.wine.active).toBe(false);
    expect(details.match).toBeNull();
    expect(await t.rec.wineDetails('halka', '00000000-0000-4000-8000-0000000000ff')).toBeNull();
  });

  it('a restaurant never published shows its current state', async () => {
    const t = setup();
    t.store.versions.set(RID, []);
    t.dish(duck.id).profile = { ...duck.profile, intensity: 0 };
    const restaurant = (await t.repos.restaurantRepository.findBySlug('halka'))!;
    const view = await loadPublishedView(t.repos, restaurant);
    expect(view.version).toBeNull();
    expect(view.dish(duck.id)!.profile.intensity).toBe(0);
    expect(view.dish(draft.id)).toBeNull();
    expect(view.pairings.every((p) => p.status !== 'suggested')).toBe(true);
  });
});

describe('publish: expected latest version (R12, AC5)', () => {
  it('a stale expectedLatest writes nothing and is a version conflict; the right one publishes', async () => {
    const t = setup();
    t.dish(duck.id).profile = { ...duck.profile, intensity: 0 };
    await expect(t.publish.publish('halka', ACTOR, { expectedLatest: 0 })).rejects.toBeInstanceOf(VersionConflictError);
    expect((await t.repos.publishRepository.latest(RID))!.number).toBe(1);
    expect((await t.publish.publish('halka', ACTOR, { expectedLatest: 1 })).number).toBe(2);
    t.dish(duck.id).profile = { ...duck.profile, intensity: 1 };
    await expect(t.publish.publish('halka', ACTOR, { expectedLatest: 1 })).rejects.toBeInstanceOf(VersionConflictError);
  });
});
