import type { Dish, Pairing, Restaurant, Wine } from '../../domain/types';
import { currentContent, withPublishedContent } from '../../i18n/content';
import type { PublishedVersionInfo, Repositories } from '../../ports/repositories';
import { readSnapshot, type PublishedVersionRecord } from './snapshot';

/**
 * What guests see (spec 2026-11-04-panel-completion, R2): the one source of "visible to guests" for every guest page,
 * the public API and the figures about what guests saw. Versioned: pairings, translations, profiles and the menu
 * composition (from the published snapshot). Live: names, descriptions, prices, `wine.active`, `dish.status = hidden`
 * (an instant switch both ways) and the restaurant's settings.
 *
 * - never published: the current state (published dishes, current profiles and translations, decided pairings);
 * - a version from before schema 2: pairings and translations from it, profiles and visibility from the current data;
 * - schema 2: a dish is visible when the version knows it (`menu.dishIds`), it still exists and its current status is
 *   `published`; a wine when it still exists and the version has its profile (a wine added after the publish is not
 *   shown); both carry the published profile and translations;
 * - schema 3 adds the picks of the restaurant (`picks`); older versions have none.
 */
export interface PublishedView {
  /** the restaurant with the published translations (base fields as stored) */
  restaurant: Restaurant;
  /** the version guests see; null when the restaurant was never published */
  version: PublishedVersionInfo | null;
  /** visible dishes, in the order of the current menu */
  dishes: Dish[];
  /** visible and active wines: the ones the engine may recommend */
  wines: Wine[];
  /** the decided pairings of the version (approved, modified and rejected) */
  pairings: Pairing[];
  /** a visible dish, or null */
  dish(id: string): Dish | null;
  /** a wine known to guests, active or not (the wine page says when it is unavailable), or null */
  wine(id: string): Wine | null;
  /**
   * Every current dish and wine with what is published applied where there is something (figures about what guests
   * saw, e.g. a dish that has been hidden since). Not a visibility list.
   */
  allDishes: Dish[];
  allWines: Wine[];
  /**
   * The wines the restaurant marked as its picks in the version guests see (spec 2026-11-18-restaurant-picks, R6),
   * narrowed to `wines` (visible and active). Empty for a restaurant never published and for a version before schema 3.
   * `RecommendationService` passes it to `rankForGuest`; nothing else decides what a guest sees as a pick.
   */
  picks: ReadonlySet<string>;
}

export interface ResolveViewInput {
  restaurant: Restaurant;
  /** the current, non-deleted dishes and wines */
  dishes: Dish[];
  wines: Wine[];
  /** the version guests see now (F1: the latest), or null */
  version: PublishedVersionRecord | null;
  /** used only when `version` is null: the current decided pairings */
  currentPairings: Pairing[];
}

const decided = (p: Pairing) => p.status === 'approved' || p.status === 'modified' || p.status === 'rejected';

/** Pure: the same data gives the same view. */
export function resolveView(input: ResolveViewInput): PublishedView {
  const { restaurant, dishes, wines, version } = input;
  const snap = version ? readSnapshot(version.snapshot) : null;
  const content = withPublishedContent(snap ? snap.content : currentContent(restaurant, dishes, wines));
  const dishProfiles = snap?.dishProfiles ?? null;
  const wineProfiles = snap?.wineProfiles ?? null;

  const allDishes = dishes.map((d) => {
    const scales = dishProfiles?.get(d.id);
    return content.dish(scales ? { ...d, profile: { ...d.profile, ...scales } } : d);
  });
  const allWines = wines.map((w) => {
    const scales = wineProfiles?.get(w.id);
    return content.wine(scales ? { ...w, profile: { ...w.profile, ...scales } } : w);
  });

  const visibleDish = (d: Dish) => d.status === 'published' && (!snap?.menuDishIds || (snap.menuDishIds.has(d.id) && !!dishProfiles?.has(d.id)));
  const knownWine = (w: Wine) => !wineProfiles || wineProfiles.has(w.id);
  const visibleDishes = allDishes.filter(visibleDish);
  const knownWines = allWines.filter(knownWine);
  const dishById = new Map(visibleDishes.map((d) => [d.id, d]));
  const wineById = new Map(knownWines.map((w) => [w.id, w]));

  const activeWines = knownWines.filter((w) => w.active);
  const activeIds = new Set(activeWines.map((w) => w.id));

  return {
    restaurant: content.restaurant(restaurant),
    version: version?.info ?? null,
    dishes: visibleDishes,
    wines: activeWines,
    pairings: snap ? snap.pairings : input.currentPairings.filter(decided),
    dish: (id) => dishById.get(id) ?? null,
    wine: (id) => wineById.get(id) ?? null,
    allDishes,
    allWines,
    picks: new Set([...(snap?.picks ?? [])].filter((id) => activeIds.has(id)))
  };
}

export type PublishedViewDeps = Pick<Repositories, 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository'>;

/** Loads the data of one restaurant and resolves its view. Every guest path goes through here. */
export async function loadPublishedView(deps: PublishedViewDeps, restaurant: Restaurant): Promise<PublishedView> {
  const [dishes, wines, version] = await Promise.all([
    deps.dishRepository.listByRestaurant(restaurant.id),
    deps.wineRepository.listByRestaurant(restaurant.id),
    deps.publishRepository.effective(restaurant.id)
  ]);
  // never published: the repository's published pairings fall back to the current decided ones
  const currentPairings = version ? [] : await deps.pairingRepository.listPublishedByRestaurant(restaurant.id);
  return resolveView({ restaurant, dishes, wines, version, currentPairings });
}
