import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { resolveView } from '../src/services/publishing/published-view';
import { buildSnapshot, readSnapshot, SNAPSHOT_SCHEMA, type PublishedSnapshot } from '../src/services/publishing/snapshot';

/**
 * Spec 2026-11-18-restaurant-picks, PR0 (R5, B1): the reader accepts every schema from 2 up, so raising the stored
 * schema later never makes a version of schema 2 read like one of schema 1. The snapshots here are built by hand: the
 * writer still stores schema 2.
 */

const ds = buildDemoDataset({ ids: 'uuid' });
const base = buildSnapshot({ restaurant: ds.restaurant, dishes: ds.dishes, wines: ds.wines, pairings: ds.pairings });
const info = { id: 'v', number: 1, changesCount: 0, publishedBy: 'x', publishedAt: '2026-11-16T00:00:00.000Z' };
const winesA = ds.wines.filter((w) => w.active).slice(0, 2).map((w) => w.id).sort();

const withSchema = (schema: number, extra: Partial<PublishedSnapshot> = {}): PublishedSnapshot => ({ ...base, schema, ...extra });

describe('readSnapshot: schema 2 and up (B1)', () => {
  it('the writer still stores schema 2 in this step', () => {
    expect(SNAPSHOT_SCHEMA).toBe(2);
    expect(base.schema).toBe(2);
    expect(base.picks).toBeUndefined();
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
