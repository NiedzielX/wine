import type { Dish, DishProfile, Pairing, PairingRole, Restaurant, Wine, WineProfile } from '../../domain/types';
import type { PublishedVersionInfo } from '../../ports/repositories';
import { RANKING_LAYER_VERSION } from '../../ranking/restaurant-picks';
import { cleanCommentTranslations, contentSnapshot, readContentSnapshot, type CommentTranslations, type ContentSnapshot, type PublishedContent } from '../../i18n/content';

/**
 * The stored form of a published version (spec 2026-11-04-panel-completion, R1). Versions are immutable. Schema 2 adds
 * the profiles and the menu composition, so guests read the taste profiles of the publish, not the working ones
 * (R03, Q1). Schema 3 adds the restaurant's picks (spec 2026-11-18-restaurant-picks, R5). A version without `schema` (published before F1) is read as before: profiles and visibility come from the
 * current data. Arrays, not objects keyed by id: the JSON never has client-chosen keys.
 */
export const SNAPSHOT_SCHEMA = 3;

export interface SnapshotPairing {
  id: string; dishId: string; wineId: string; status: 'approved' | 'modified' | 'rejected';
  role: PairingRole | null; rank: number | null; comment: string | null;
  /** absent in versions published before 2026-10-15 (read as `{}`) */
  commentTranslations?: CommentTranslations;
  modelScore: number; source: 'engine' | 'sommelier'; updatedBy: string; updatedAt: string;
}

/** The fields of a dish profile that the engine reads; who confirmed it is not part of what guests see. */
export type DishScales = Omit<DishProfile, 'source' | 'confirmedAt' | 'confirmedBy'>;
export type WineScales = Omit<WineProfile, 'source' | 'confirmedAt' | 'confirmedBy'>;

export interface PublishedSnapshot {
  /** 2 since F1; absent in older versions */
  schema?: number;
  pairings: SnapshotPairing[];
  /** translations guests see (spec 2026-10-15-bilingual-content, R4); absent in older versions (read as `{}`) */
  content?: ContentSnapshot;
  /** schema 2: the profile of every dish and wine that was not deleted, hidden dishes and inactive wines included */
  profiles?: { dishes: Array<{ id: string; profile: DishScales }>; wines: Array<{ id: string; profile: WineScales }> };
  /** schema 2: the dishes this version knows (published, hidden, and drafts released by this publish) */
  menu?: { dishIds: string[] };
  /**
   * schema 3 (restaurant picks): the sorted ids of the active wines marked at the publish; absent before schema 3 (read as
   * empty). `rankingVersion` is `RANKING_LAYER_VERSION` of the code that published it, next to the engine version
   * (R03: what a guest saw can be rebuilt); absent when a version was written without it.
   */
  picks?: { wineIds: string[]; rankingVersion?: string };
}

/** A version as the ports return it: what it is and what it holds. */
export interface PublishedVersionRecord {
  info: PublishedVersionInfo;
  snapshot: PublishedSnapshot;
}

const isPublishable = (p: Pairing) => p.status === 'approved' || p.status === 'modified' || p.status === 'rejected';

/** The scales of a dish profile, by name (nothing else of the stored profile leaks into the snapshot). */
export function dishScales(p: DishProfile | DishScales): DishScales {
  return {
    intensity: p.intensity, fat: p.fat, salt: p.salt, sweetness: p.sweetness, acidity: p.acidity, spice: p.spice, umami: p.umami,
    smoke: p.smoke, creaminess: p.creaminess, protein: p.protein, cooking: p.cooking
  };
}

export function wineScales(p: WineProfile | WineScales): WineScales {
  return {
    sweetness: p.sweetness, acidity: p.acidity, tannin: p.tannin, body: p.body, alcohol: p.alcohol, fruitiness: p.fruitiness, oak: p.oak,
    aromatic: p.aromatic, freshness: p.freshness, style: p.style, adventurous: p.adventurous
  };
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The snapshot of a publish (schema 3), built the same way by every data store and by the demo seeder. `dishes` and
 * `wines` are the restaurant's current, non-deleted rows as they are after the publish (drafts already released).
 */
export function buildSnapshot(input: {
  restaurant: Restaurant; dishes: Dish[]; wines: Wine[]; pairings: Pairing[];
  /** the wine ids the restaurant marked as picks (the working set); absent = none. Only active wines of `wines` are written. */
  picks?: Iterable<string>;
}): PublishedSnapshot {
  const dishes = [...input.dishes].sort(byId);
  const wines = [...input.wines].sort(byId);
  return {
    schema: SNAPSHOT_SCHEMA,
    pairings: input.pairings.filter(isPublishable).sort(byId).map((p) => ({
      id: p.id, dishId: p.dishId, wineId: p.wineId, status: p.status as SnapshotPairing['status'], role: p.role ?? null, rank: p.rank ?? null,
      comment: p.comment ?? null, commentTranslations: cleanCommentTranslations(p.commentTranslations), modelScore: p.modelScore, source: p.source,
      updatedBy: p.updatedBy, updatedAt: p.updatedAt
    })),
    content: contentSnapshot(input.restaurant, dishes, wines),
    profiles: {
      dishes: dishes.map((d) => ({ id: d.id, profile: dishScales(d.profile) })),
      wines: wines.map((w) => ({ id: w.id, profile: wineScales(w.profile) }))
    },
    menu: { dishIds: dishes.map((d) => d.id) },
    picks: { wineIds: publishedPickIds(wines, input.picks ?? []), rankingVersion: RANKING_LAYER_VERSION }
  };
}

/** The ids of the picks that are written to a version: marked, active (a wine that is not active is not published as a pick), sorted, once each. */
function publishedPickIds(wines: Wine[], picks: Iterable<string>): string[] {
  const active = new Set(wines.filter((w) => w.active).map((w) => w.id));
  return [...new Set(picks)].filter((id) => active.has(id)).sort();
}

/** A stored snapshot read back. `profiles` and `menu` are null for a version published before schema 2. */
export interface ReadSnapshot {
  /** 1 before schema 2; 2 or 3 otherwise (any higher stored schema reads as 3) */
  schema: 1 | 2 | 3;
  pairings: Pairing[];
  content: PublishedContent;
  dishProfiles: Map<string, DishScales> | null;
  wineProfiles: Map<string, WineScales> | null;
  menuDishIds: Set<string> | null;
  /** schema 3: the wines the restaurant marked as its picks at the publish; empty for every older version */
  picks: Set<string>;
}

export function readSnapshot(s: PublishedSnapshot | null | undefined): ReadSnapshot {
  // `>= 2`, not `=== SNAPSHOT_SCHEMA`: a version of schema 2 must keep reading as schema 2 once the writer stores 3
  const v2 = (s?.schema ?? 0) >= 2 && !!s?.profiles && !!s.menu;
  const schema = v2 ? ((s!.schema as number) >= 3 ? 3 : 2) : 1;
  return {
    schema,
    pairings: (s?.pairings ?? []).map((p) => ({ ...p, commentTranslations: cleanCommentTranslations(p.commentTranslations), dirty: false })),
    content: readContentSnapshot(s?.content),
    dishProfiles: v2 ? new Map(s!.profiles!.dishes.map((d) => [d.id, dishScales(d.profile)])) : null,
    wineProfiles: v2 ? new Map(s!.profiles!.wines.map((w) => [w.id, wineScales(w.profile)])) : null,
    menuDishIds: v2 ? new Set(s!.menu!.dishIds) : null,
    picks: new Set(schema === 3 ? s!.picks?.wineIds ?? [] : [])
  };
}

/** Equal scales: compared field by field in a fixed order, so extra fields (who confirmed) never count. */
export const sameDishScales = (a: DishProfile | DishScales, b: DishProfile | DishScales): boolean => JSON.stringify(dishScales(a)) === JSON.stringify(dishScales(b));
export const sameWineScales = (a: WineProfile | WineScales, b: WineProfile | WineScales): boolean => JSON.stringify(wineScales(a)) === JSON.stringify(wineScales(b));

/**
 * How many dishes and wines differ from what guests see in profile or menu composition (R1, F1/F2): a profile changed
 * since the publish, or a dish or wine the version does not know yet (draft dishes are counted apart, as before). Part
 * of "unpublished changes". Zero for a version from before schema 2 and for a restaurant never published: guests read
 * the current profiles then.
 */
export function countProfileChanges(current: { dishes: Dish[]; wines: Wine[] }, version: PublishedVersionRecord | null): number {
  const snap = version ? readSnapshot(version.snapshot) : null;
  if (!snap?.dishProfiles || !snap.wineProfiles) return 0;
  let n = 0;
  for (const d of current.dishes) {
    if (d.status === 'draft') continue;
    const published = snap.dishProfiles.get(d.id);
    if (!published || !snap.menuDishIds?.has(d.id) || !sameDishScales(d.profile, published)) n++;
  }
  for (const w of current.wines) {
    const published = snap.wineProfiles.get(w.id);
    if (!published || !sameWineScales(w.profile, published)) n++;
  }
  return n;
}

/**
 * How many picks differ from what guests see (spec 2026-11-18-restaurant-picks, R7): the symmetric difference between the
 * working set (marked wines, active only) and the published one narrowed to the wines that are active now (a wine switched
 * off or on is a live change, not an unpublished one). A version before schema 3 and a restaurant never published have
 * an empty published set, so a working set of n picks is n changes and an empty one is 0.
 */
export function diffPicks(wines: Wine[], workingPickIds: Iterable<string>, version: PublishedVersionRecord | null): { added: number; removed: number } {
  const active = new Set(wines.filter((w) => w.active).map((w) => w.id));
  const working = new Set([...workingPickIds].filter((id) => active.has(id)));
  const published = new Set([...(version ? readSnapshot(version.snapshot).picks : [])].filter((id) => active.has(id)));
  let added = 0;
  let removed = 0;
  for (const id of working) if (!published.has(id)) added++;
  for (const id of published) if (!working.has(id)) removed++;
  return { added, removed };
}

export function countPickChanges(wines: Wine[], workingPickIds: Iterable<string>, version: PublishedVersionRecord | null): number {
  const d = diffPicks(wines, workingPickIds, version);
  return d.added + d.removed;
}
