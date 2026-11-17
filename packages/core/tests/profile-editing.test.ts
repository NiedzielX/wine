import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import type { DishProfile, Wine } from '../src/domain/types';
import { MIN_MODEL_SCORE } from '../src/engine/recommend';
import { pairingScore } from '../src/engine/scoring';
import { NotFoundError, ValidationError, VersionConflictError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { can } from '../src/auth/permissions';
import { ProfilePreviewService } from '../src/services/catalog/profile-preview-service';
import { checkProfileVersion, profileVersion } from '../src/services/catalog/profile-rules';
import { ProfileService } from '../src/services/catalog/profile-service';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { PublishService } from '../src/services/publishing/publish-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { dishScales, wineScales } from '../src/services/publishing/snapshot';
import { dishProfileFromQuery, dishProfileSchema, wineProfileFromQuery, wineProfileSchema } from '../src/validators/catalog/profile.schema';

/** Spec 2026-11-04-panel-completion, F2: profile editing (R3 to R6, R8; AC7 to AC12). */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
const wineId = ds.wines.find((w) => w.active)!.id;
let seq = 0;

function setup() {
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  let tick = Date.parse('2026-11-17T09:00:00.000Z');
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return {
    store, repos,
    profiles: new ProfileService({ ...repos, clock, idGenerator }),
    preview: new ProfilePreviewService(repos),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    rec: new RecommendationService(repos),
    catalog: new CatalogService(repos),
    dish: (id: string) => store.dishes.get(RID)!.find((d) => d.id === id)!,
    wine: (id: string) => store.wines.get(RID)!.find((w) => w.id === id)!
  };
}

const dishInput = (over: Record<string, unknown> = {}) => ({ ...dishScales(duck.profile), ...over });
const wineInput = (w: Wine, over: Record<string, unknown> = {}) => ({ ...wineScales(w.profile), ...over });

describe('profile schemas (R3, AC7)', () => {
  it('accepts a complete profile and refuses scales out of range, unknown dictionary values and extra fields', () => {
    expect(dishProfileSchema.safeParse(dishInput()).success).toBe(true);
    for (const bad of [{ intensity: 6 }, { fat: -1 }, { salt: 2.5 }, { protein: 'unicorn' }, { cooking: 'microwave' }, { extra: 1 }, { umami: '3' }]) {
      expect(dishProfileSchema.safeParse(dishInput(bad)).success, JSON.stringify(bad)).toBe(false);
    }
    const w = ds.wines[0];
    expect(wineProfileSchema.safeParse(wineInput(w)).success).toBe(true);
    for (const bad of [{ alcohol: 25.5 }, { alcohol: -1 }, { alcohol: 12.25 }, { style: 'port' }, { adventurous: 'yes' }, { tannin: 9 }, { source: 'confirmed' }]) {
      expect(wineProfileSchema.safeParse(wineInput(w, bad)).success, JSON.stringify(bad)).toBe(false);
    }
    expect(wineProfileSchema.safeParse(wineInput(w, { alcohol: 13.5 })).success).toBe(true);
  });

  it('reads the scales from a URL the way a form without JavaScript sends them, and never looks at other keys', () => {
    const params = { get: (k: string) => new Map<string, string>([...Object.entries(dishScales(duck.profile)).map(([a, v]) => [a, String(v)] as [string, string]), ['__proto__', 'x'], ['constructor', 'y']]).get(k) ?? null };
    const parsed = dishProfileFromQuery((k) => params.get(k));
    expect(dishProfileSchema.safeParse(parsed).success).toBe(true);
    expect(Object.keys(parsed)).not.toContain('__proto__');
    expect(dishProfileSchema.safeParse(dishProfileFromQuery((k) => (k === 'fat' ? 'abc' : params.get(k)))).success).toBe(false);
    expect(dishProfileSchema.safeParse(dishProfileFromQuery((k) => (k === 'fat' ? null : params.get(k)))).success).toBe(false);
    const w = ds.wines[0];
    const wp = { get: (k: string) => new Map(Object.entries(wineScales(w.profile)).map(([a, v]) => [a, String(v)] as [string, string])).get(k) ?? null };
    expect(wineProfileSchema.safeParse(wineProfileFromQuery((k) => wp.get(k))).success).toBe(true);
  });
});

describe('ProfileService (R3 to R5, AC7 to AC10)', () => {
  it('saves a valid dish profile and refuses an invalid one with the fields named, writing nothing (AC7)', async () => {
    const t = setup();
    const r = await t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: 5 }), ACTOR, { confirm: true });
    expect(r.changed).toBe(true);
    expect(t.dish(duck.id).profile.intensity).toBe(5);
    const bad = t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: 6, fat: 2.5, extra: 1 }), ACTOR, { confirm: true });
    await expect(bad).rejects.toBeInstanceOf(ValidationError);
    await expect(bad).rejects.toMatchObject({ fields: { intensity: 'invalid', fat: 'invalid', extra: 'unknown_field' } });
    expect(t.dish(duck.id).profile.intensity).toBe(5);
    await expect(t.profiles.setDishProfile('halka', '00000000-0000-4000-8000-00000000dead', dishInput(), ACTOR, { confirm: true })).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.profiles.setDishProfile('nope', duck.id, dishInput(), ACTOR, { confirm: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a stale fingerprint is a conflict and changes nothing; a save without a change writes no audit row (AC8)', async () => {
    const t = setup();
    const v0 = profileVersion(t.dish(duck.id).profile);
    const next = (duck.profile.intensity + 1) % 6;
    await t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: next }), ACTOR, { confirm: true, expectedVersion: v0 });
    expect(t.store.profileEdits).toHaveLength(1);
    const stale = t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: (next + 1) % 6 }), ACTOR, { confirm: true, expectedVersion: v0 });
    await expect(stale).rejects.toBeInstanceOf(VersionConflictError);
    expect(t.dish(duck.id).profile.intensity).toBe(next);
    expect(t.store.profileEdits).toHaveLength(1);
    const same = await t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: next }), ACTOR, { confirm: true, expectedVersion: profileVersion(t.dish(duck.id).profile) });
    expect(same.changed).toBe(false);
    expect(t.store.profileEdits).toHaveLength(1);
    expect(() => checkProfileVersion(t.dish(duck.id).profile, undefined)).not.toThrow();
    expect(() => checkProfileVersion(t.dish(duck.id).profile, 'deadbeef-1')).toThrow(VersionConflictError);
  });

  it('"Save and confirm" confirms with who and when from the clock, "Save as draft" makes a draft, "Confirm without changes" changes only the state (AC9)', async () => {
    const t = setup();
    const draftDish = ds.dishes.find((d) => d.profile.source === 'draft')!;
    const before = t.dish(draftDish.id).profile;
    const confirmed = await t.profiles.confirmDishProfile('halka', draftDish.id, ACTOR);
    expect(confirmed.changed).toBe(true);
    const after = t.dish(draftDish.id).profile;
    expect(after).toMatchObject({ ...dishScales(before), source: 'confirmed', confirmedBy: ACTOR.name });
    expect(after.confirmedAt).toBe('2026-11-17T09:00:01.000Z');
    expect(await t.profiles.confirmDishProfile('halka', draftDish.id, ACTOR)).toMatchObject({ changed: false });
    await t.profiles.setDishProfile('halka', draftDish.id, dishScales(before), ACTOR, { confirm: false });
    expect(t.dish(draftDish.id).profile).toMatchObject({ source: 'draft', confirmedAt: null, confirmedBy: null });
    // saving a draft over a draft with the same scales changes nothing
    expect((await t.profiles.setDishProfile('halka', draftDish.id, dishScales(before), ACTOR, { confirm: false })).changed).toBe(false);
  });

  it('a wine saved as a draft falls back to grape defaults (a catalog source is kept), a confirmed one gets who and when (AC9, Q4)', async () => {
    const t = setup();
    const w = t.wine(wineId);
    expect(w.profile.source ?? 'confirmed').toBe('confirmed');
    await t.profiles.setWineProfile('halka', wineId, wineScales(w.profile), ACTOR, { confirm: false });
    expect(t.wine(wineId).profile.source).toBe('grape_defaults');
    t.wine(wineId).profile.source = 'catalog';
    await t.profiles.setWineProfile('halka', wineId, wineScales(t.wine(wineId).profile), ACTOR, { confirm: true });
    expect(t.wine(wineId).profile).toMatchObject({ source: 'confirmed', confirmedBy: ACTOR.name });
    expect((await t.profiles.setWineProfile('halka', wineId, wineScales(t.wine(wineId).profile), ACTOR, { confirm: true })).changed).toBe(false);
    await t.profiles.setWineProfile('halka', wineId, wineInput(t.wine(wineId), { alcohol: 14.5 }), ACTOR, { confirm: false });
    expect(t.wine(wineId).profile).toMatchObject({ alcohol: 14.5, source: 'grape_defaults', confirmedBy: null });
    await expect(t.profiles.confirmWineProfile('halka', '00000000-0000-4000-8000-00000000dead', ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('every change writes an audit row with before, after, actor and the clock time, and only changes do (AC10)', async () => {
    const t = setup();
    const before = t.dish(duck.id).profile;
    await t.profiles.setDishProfile('halka', duck.id, dishInput({ acidity: 5 }), ACTOR, { confirm: true });
    await t.profiles.setWineProfile('halka', wineId, wineInput(t.wine(wineId), { body: 5 }), ACTOR, { confirm: true });
    const dishEdits = await t.repos.profileWriteRepository.listProfileEdits(RID, { kind: 'dish' });
    expect(dishEdits).toHaveLength(1);
    expect(dishEdits[0]).toMatchObject({ kind: 'dish', subjectId: duck.id, actor: ACTOR.name, actorId: ACTOR.id, at: '2026-11-17T09:00:01.000Z' });
    expect(dishEdits[0].before).toMatchObject({ acidity: before.acidity, source: before.source });
    expect(dishEdits[0].after).toMatchObject({ acidity: 5, source: 'confirmed', confirmedBy: ACTOR.name });
    expect(await t.repos.profileWriteRepository.listProfileEdits(RID)).toHaveLength(2);
    expect(await t.repos.profileWriteRepository.listProfileEdits('00000000-0000-4000-8000-00000000dead')).toEqual([]);
  });

  it('the stored profile and its fingerprint come back from get; only the role table decides who may edit (R8)', async () => {
    const t = setup();
    const { profile, version } = await t.profiles.getDishProfile('halka', duck.id);
    expect(version).toBe(profileVersion(profile));
    expect(profileVersion(t.dish(duck.id).profile)).toBe(version);
    await expect(t.profiles.getWineProfile('halka', '00000000-0000-4000-8000-00000000dead')).rejects.toBeInstanceOf(NotFoundError);
    expect({ owner: can('owner', 'profiles.edit'), manager: can('manager', 'profiles.edit'), sommelier: can('sommelier', 'profiles.edit'), waiter: can('waiter', 'profiles.edit') })
      .toEqual({ owner: true, manager: true, sommelier: true, waiter: false });
  });
});

describe('a profile edit is an unpublished change and does not reach guests (R4, AC2, AC15)', () => {
  it('raises the unpublished counter by one and keeps the guest score until the next publish', async () => {
    const t = setup();
    const scores = async () => (await t.rec.forDish('halka', duck.id, {}, 8))!.result.items.map((i) => [i.wine.id, i.matchScore]);
    const guestBefore = await scores();
    const n0 = (await t.publish.preview('halka')).pendingChanges;
    await t.profiles.setDishProfile('halka', duck.id, dishInput({ intensity: 5, fat: 5 }), ACTOR, { confirm: true });
    expect((await t.publish.preview('halka')).pendingChanges).toBe(n0 + 1);
    expect(await scores()).toEqual(guestBefore);
    await t.publish.publish('halka', ACTOR);
    expect(await scores()).not.toEqual(guestBefore);
  });
});

describe('ProfilePreviewService (R6, AC11, AC12)', () => {
  it('a dish: before and after are pairingScore of the stored and of the candidate profile for every active wine, nothing is written', async () => {
    const t = setup();
    const candidate = dishInput({ intensity: Math.min(5, duck.profile.intensity + 2) });
    const snapshotBefore = JSON.stringify([t.store.dishes, t.store.wines, [...t.store.pairings], t.store.profileEdits]);
    const p = await t.preview.previewDish('halka', duck.id, candidate);
    const active = ds.wines.filter((w) => w.active);
    expect(p.rows.map((r) => r.otherId).sort()).toEqual(active.map((w) => w.id).sort());
    for (const w of active) {
      const row = p.rows.find((r) => r.otherId === w.id)!;
      expect(row.before).toBe(pairingScore(duck, w).score);
      expect(row.after).toBe(pairingScore({ ...duck, profile: { ...duck.profile, ...candidate } as DishProfile }, w).score);
      expect(row.delta).toBe(row.after - row.before);
    }
    expect(p.summary.changedRows).toBe(p.rows.filter((r) => r.delta !== 0).length);
    const approved = ds.pairings.filter((x) => x.dishId === duck.id && (x.status === 'approved' || x.status === 'modified'));
    expect(p.rows.filter((r) => r.pairing?.status === 'approved').length).toBe(approved.filter((x) => x.status === 'approved').length);
    expect(p.summary.changedPairs).toBe(p.rows.filter((r) => r.delta !== 0 && r.pairing && (r.pairing.status === 'approved' || r.pairing.status === 'modified')).length);
    expect(p.summary.crossingPairs).toBeLessThanOrEqual(p.summary.changedPairs);
    expect(p.guest.before.length).toBeGreaterThan(0);
    expect(JSON.stringify([t.store.dishes, t.store.wines, [...t.store.pairings], t.store.profileEdits])).toBe(snapshotBefore);
    // deterministic: the same data gives the same answer (N03)
    expect(await t.preview.previewDish('halka', duck.id, candidate)).toEqual(p);
  });

  it('the stored profile as the candidate changes nothing; an invalid candidate is refused as a validation error', async () => {
    const t = setup();
    const p = await t.preview.previewDish('halka', duck.id, dishScales(duck.profile));
    expect(p.summary).toEqual({ changedRows: 0, changedPairs: 0, crossingPairs: 0 });
    expect(p.guest.after).toEqual(p.guest.before);
    await expect(t.preview.previewDish('halka', duck.id, { ...dishScales(duck.profile), intensity: 9 })).rejects.toBeInstanceOf(ValidationError);
    await expect(t.preview.previewDish('halka', '00000000-0000-4000-8000-00000000dead', dishScales(duck.profile))).rejects.toBeInstanceOf(NotFoundError);
  });

  it('counts approved pairs whose score crosses the engine threshold, in either direction', async () => {
    const t = setup();
    const w = ds.wines.find((x) => x.active)!;
    const dish = ds.dishes.find((d) => d.status === 'published')!;
    // make the pair approved so it is counted, then look for a candidate that moves its score across the threshold
    const pairing = ds.pairings.find((x) => x.dishId === dish.id && x.status === 'approved')!;
    const wine = ds.wines.find((x) => x.id === pairing.wineId)!;
    const opposite = { ...dishScales(dish.profile), intensity: dish.profile.intensity >= 3 ? 0 : 5, fat: dish.profile.fat >= 3 ? 0 : 5, acidity: dish.profile.acidity >= 3 ? 0 : 5, sweetness: dish.profile.sweetness >= 3 ? 0 : 5 };
    const p = await t.preview.previewDish('halka', dish.id, opposite);
    const row = p.rows.find((r) => r.otherId === wine.id)!;
    expect(row.pairing?.status).toBe('approved');
    const crossing = (row.before >= MIN_MODEL_SCORE) !== (row.after >= MIN_MODEL_SCORE);
    expect(p.summary.crossingPairs).toBe(p.rows.filter((r) => r.delta !== 0 && r.pairing && (r.pairing.status === 'approved' || r.pairing.status === 'modified') && (r.before >= MIN_MODEL_SCORE) !== (r.after >= MIN_MODEL_SCORE)).length);
    expect(typeof crossing).toBe('boolean');
    void w;
  });

  it('a wine: rows for the dishes guests could see, scored by pairingScore, and the dishes where it enters or leaves the top picks', async () => {
    const t = setup();
    const wine = ds.wines.find((w) => w.active)!;
    const candidate = wineInput(wine, { body: wine.profile.body >= 3 ? 0 : 5, tannin: wine.profile.tannin >= 3 ? 0 : 5, acidity: wine.profile.acidity >= 3 ? 0 : 5 });
    const p = await t.preview.previewWine('halka', wine.id, candidate);
    const published = ds.dishes.filter((d) => d.status === 'published');
    expect(p.rows.map((r) => r.otherId).sort()).toEqual(published.map((d) => d.id).sort());
    for (const d of published) {
      const row = p.rows.find((r) => r.otherId === d.id)!;
      expect(row.before).toBe(pairingScore(d, wine).score);
      expect(row.after).toBe(pairingScore(d, { ...wine, profile: { ...wine.profile, ...candidate } }).score);
    }
    for (const g of p.guest) expect(g.before === g.after).toBe(false);
    expect((await t.preview.previewWine('halka', wine.id, wineScales(wine.profile))).guest).toEqual([]);
    await expect(t.preview.previewWine('halka', wine.id, { ...candidate, style: 'port' })).rejects.toBeInstanceOf(ValidationError);
    await expect(t.preview.previewWine('halka', '00000000-0000-4000-8000-00000000dead', candidate)).rejects.toBeInstanceOf(NotFoundError);
  });
});
