import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { RANKING_LAYER_VERSION } from '../src/ranking/restaurant-picks';
import { resolveView } from '../src/services/publishing/published-view';
import { buildSnapshot, countPickChanges, readSnapshot, SNAPSHOT_SCHEMA, type PublishedSnapshot } from '../src/services/publishing/snapshot';

/**
 * Spec 2026-11-18-restaurant-picks, PR0 (R5, B1): the reader accepts every schema from 2 up, so raising the stored
 * schema later never makes a version of schema 2 read like one of schema 1. The snapshots here are built by hand: the
 * writer still stores schema 2.
 */

const ds = buildDemoDataset({ ids: 'uuid' });
const base = buildSnapshot({ restaurant: ds.restaurant, dishes: ds.dishes, wines: ds.wines, pairings: ds.pairings });
const info = { id: 'v', number: 1, changesCount: 0, publishedBy: 'x', publishedAt: '2026-11-16T00:00:00.000Z' };
const winesA = ds.wines.filter((w) => w.active).slice(0, 2).map((w) => w.id).sort();

// a hand-built version: `picks` only when asked for (a schema 2 version never had it)
const withSchema = (schema: number, extra: Partial<PublishedSnapshot> = {}): PublishedSnapshot => {
  const { picks: _picks, ...rest } = base;
  return { ...rest, schema, ...extra };
};

describe('readSnapshot: schema 2 and up (B1)', () => {
  it('the writer stores schema 3 with an empty set of picks when none is given', () => {
    expect(SNAPSHOT_SCHEMA).toBe(3);
    expect(base.schema).toBe(3);
    expect(base.picks).toEqual({ wineIds: [], rankingVersion: RANKING_LAYER_VERSION });
  });

  it('a hand-built schema 2 snapshot reads as before: profiles and menu from the version, no picks', () => {
    const read = readSnapshot(withSchema(2));
    expect(read.schema).toBe(2);
    expect(read.dishProfiles?.size).toBe(ds.dishes.length);
    expect(read.wineProfiles?.size).toBe(ds.wines.length);
    expect(read.menuDishIds?.size).toBe(ds.dishes.length);
    expect(read.picks.size).toBe(0);
  });

  it('a hand-built schema 3 snapshot carries its picks and the same profiles and menu', () => {
    const read = readSnapshot(withSchema(3, { picks: { wineIds: winesA } }));
    expect(read.schema).toBe(3);
    expect([...read.picks].sort()).toEqual(winesA);
    expect(read.dishProfiles?.size).toBe(ds.dishes.length);
    expect(read.menuDishIds?.size).toBe(ds.dishes.length);
  });

  it('schema 3 without a picks entry has an empty set', () => {
    expect(readSnapshot(withSchema(3)).picks.size).toBe(0);
  });

  it('an unknown higher schema is read as schema 3 and not as schema 1', () => {
    const read = readSnapshot(withSchema(7, { picks: { wineIds: winesA } }));
    expect(read.schema).toBe(3);
    expect(read.dishProfiles).not.toBeNull();
    expect(read.picks.size).toBe(winesA.length);
  });

  it('a version without schema, or with schema 2 but no profiles or menu, still reads as schema 1', () => {
    const v1: PublishedSnapshot = { pairings: base.pairings, content: base.content };
    for (const s of [v1, withSchema(2, { profiles: undefined }), withSchema(3, { menu: undefined }), null, undefined]) {
      const read = readSnapshot(s);
      expect(read).toMatchObject({ schema: 1, dishProfiles: null, wineProfiles: null, menuDishIds: null });
      expect(read.picks.size).toBe(0);
    }
  });

  it('a schema 2 version resolves to the view of its own profiles and menu, not the current data', () => {
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    const stale = { ...duck, profile: { ...duck.profile, intensity: (duck.profile.intensity === 1 ? 5 : 1) as typeof duck.profile.intensity } };
    const view = resolveView({
      restaurant: ds.restaurant,
      dishes: ds.dishes.map((d) => (d.id === duck.id ? stale : d)),
      wines: ds.wines,
      currentPairings: [],
      version: { info, snapshot: withSchema(2) }
    });
    expect(view.dish(duck.id)!.profile.intensity).toBe(duck.profile.intensity);
    // the same snapshot at a later schema gives the same view
    const later = resolveView({
      restaurant: ds.restaurant,
      dishes: ds.dishes.map((d) => (d.id === duck.id ? stale : d)),
      wines: ds.wines,
      currentPairings: [],
      version: { info, snapshot: withSchema(3, { picks: { wineIds: winesA } }) }
    });
    expect(later.dishes.map((d) => [d.id, d.profile])).toEqual(view.dishes.map((d) => [d.id, d.profile]));
    expect(later.wines.map((w) => [w.id, w.profile])).toEqual(view.wines.map((w) => [w.id, w.profile]));
  });
});

describe('buildSnapshot and the view: picks (R5, R6, R7)', () => {
  const inactive = ds.wines.find((w) => !w.active)!;
  const [w1, w2, w3] = ds.wines.filter((w) => w.active).map((w) => w.id).sort();
  const build = (picks?: string[], wines = ds.wines) => buildSnapshot({ restaurant: ds.restaurant, dishes: ds.dishes, wines, pairings: ds.pairings, picks });
  const view = (snapshot: PublishedSnapshot, wines = ds.wines) => resolveView({ restaurant: ds.restaurant, dishes: ds.dishes, wines, currentPairings: [], version: { info, snapshot } });

  it('writes the sorted ids of the active wines, once each, and the version of the ranking layer', () => {
    const snap = build([w3, w1, w1, inactive.id, 'not-a-wine-of-this-restaurant']);
    expect(snap.picks).toEqual({ wineIds: [w1, w3].sort(), rankingVersion: RANKING_LAYER_VERSION });
    expect(readSnapshot(snap).picks).toEqual(new Set([w1, w3]));
  });

  it('round-trips through JSON and a snapshot of schema 3 keeps its schema 2 parts readable (B1)', () => {
    const stored = JSON.parse(JSON.stringify(build([w2]))) as PublishedSnapshot;
    const read = readSnapshot(stored);
    expect(read.schema).toBe(3);
    expect(read.picks).toEqual(new Set([w2]));
    // an older reader (schema 2) ignores `picks` and still finds profiles, menu and pairings where it did
    expect(stored.profiles!.dishes.length).toBe(ds.dishes.length);
    expect(stored.menu!.dishIds.length).toBe(ds.dishes.length);
    expect(stored.pairings.length).toBeGreaterThan(0);
  });

  it('the view holds the picks of the version, narrowed to the wines that are active now', () => {
    const snap = build([w1, w2]);
    expect(view(snap).picks).toEqual(new Set([w1, w2]));
    const switchedOff = ds.wines.map((w) => (w.id === w2 ? { ...w, active: false } : w));
    expect(view(snap, switchedOff).picks).toEqual(new Set([w1]));
  });

  it('the view has no picks for a version before schema 3, for schema 2 and for a restaurant never published', () => {
    expect(view(withSchema(2)).picks.size).toBe(0);
    expect(view({ pairings: base.pairings, content: base.content }).picks.size).toBe(0);
    const never = resolveView({ restaurant: ds.restaurant, dishes: ds.dishes, wines: ds.wines, currentPairings: [], version: null });
    expect(never.picks.size).toBe(0);
  });

  it('countPickChanges is the symmetric difference of the working set and the published one, for active wines', () => {
    const v = { info, snapshot: build([w1, w2]) };
    expect(countPickChanges(ds.wines, [w1, w2], v)).toBe(0);
    expect(countPickChanges(ds.wines, [w1, w3], v)).toBe(2);
    expect(countPickChanges(ds.wines, [], v)).toBe(2);
    expect(countPickChanges(ds.wines, [w1, w2, w3], v)).toBe(1);
    // a wine switched off is a live change: it is neither working nor published, whatever the set says
    const off = ds.wines.map((w) => (w.id === w2 ? { ...w, active: false } : w));
    expect(countPickChanges(off, [w1, w2], v)).toBe(0);
  });

  it('countPickChanges: an empty working set is 0 before schema 3 and when never published; a marked one counts', () => {
    expect(countPickChanges(ds.wines, [], null)).toBe(0);
    expect(countPickChanges(ds.wines, [w1], null)).toBe(1);
    expect(countPickChanges(ds.wines, [], { info, snapshot: withSchema(2) })).toBe(0);
    expect(countPickChanges(ds.wines, [w1, w2], { info, snapshot: withSchema(2) })).toBe(2);
  });
});
