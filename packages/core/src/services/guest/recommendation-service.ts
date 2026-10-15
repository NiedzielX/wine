import type { Dish, GuestPreferences, Restaurant, Wine } from '../../domain/types';
import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS } from '../../domain/types';
import { recommendForDish, type RecommendationItem, type RecommendationResult } from '../../engine/recommend';
import { recommendForTable, type TableResult } from '../../engine/table';
import type { Repositories } from '../../ports/repositories';
import type { Locale } from '../../i18n/locale';

export type RecommendationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository'>;

export interface DishRecommendations {
  restaurant: Restaurant;
  dish: Dish;
  result: RecommendationResult;
}

/**
 * Application service for the guest app and the public API. Loads data through the ports
 * and delegates every decision to the deterministic engine. No I/O of its own.
 * Dependencies arrive through the constructor (Awilix PROXY injection mode).
 */
export interface WineDetails {
  restaurant: Restaurant;
  wine: Wine;
  /** the dish the guest came from, if it is published */
  dish: Dish | null;
  /** how well the wine fits that dish, with the sommelier's note when there is one */
  match: RecommendationItem | null;
}

export class RecommendationService {
  private readonly repos: RecommendationServiceDeps;

  constructor(deps: RecommendationServiceDeps) {
    this.repos = deps;
  }

  /** `locale` sets the language of the engine's texts; the public API passes none, so its answers stay in English. */
  async forDish(slug: string, dishId: string, prefs: Partial<GuestPreferences> = {}, limit?: number, locale: Locale = 'en'): Promise<DishRecommendations | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const dish = await this.repos.dishRepository.findById(restaurant.id, dishId);
    if (!dish || dish.status !== 'published') return null;
    const [wines, pairings] = await Promise.all([
      this.repos.wineRepository.listByRestaurant(restaurant.id, { activeOnly: true }),
      this.repos.pairingRepository.listPublishedByDish(restaurant.id, dish.id)
    ]);
    const result = recommendForDish(dish, wines, pairings, { ...DEFAULT_PREFS, ...prefs }, limit, locale);
    const settings = restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS;
    if (!settings.showUnreviewed) result.items = result.items.filter((i) => i.tier < 2);
    return { restaurant, dish, result };
  }

  /** A wine of the restaurant, optionally scored against the dish the guest is looking at. */
  async wineDetails(slug: string, wineId: string, dishId?: string, locale: Locale = 'en'): Promise<WineDetails | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const wine = await this.repos.wineRepository.findById(restaurant.id, wineId);
    if (!wine) return null;
    const found = dishId ? await this.repos.dishRepository.findById(restaurant.id, dishId) : null;
    const dish = found && found.status === 'published' ? found : null;
    let match: RecommendationItem | null = null;
    if (dish && wine.active) {
      const [wines, pairings] = await Promise.all([
        this.repos.wineRepository.listByRestaurant(restaurant.id, { activeOnly: true }),
        this.repos.pairingRepository.listPublishedByDish(restaurant.id, dish.id)
      ]);
      match = recommendForDish(dish, wines, pairings, DEFAULT_PREFS, wines.length, locale).items.find((i) => i.wine.id === wine.id) ?? null;
    }
    return { restaurant, wine, dish, match };
  }

  async forTable(slug: string, dishIds: string[], prefs: Partial<GuestPreferences> = {}, locale: Locale = 'en'): Promise<{ restaurant: Restaurant; result: TableResult } | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const all = await this.repos.dishRepository.listByRestaurant(restaurant.id, { statuses: ['published'] });
    const dishes = dishIds.map((id) => all.find((d) => d.id === id)).filter((d): d is Dish => !!d);
    if (dishes.length < 2) throw new TableNeedsTwoDishesError();
    const [wines, pairings] = await Promise.all([
      this.repos.wineRepository.listByRestaurant(restaurant.id, { activeOnly: true }),
      this.repos.pairingRepository.listPublishedByRestaurant(restaurant.id)
    ]);
    return { restaurant, result: recommendForTable(dishes, wines, pairings, { ...DEFAULT_PREFS, ...prefs }, undefined, locale) };
  }
}

export class TableNeedsTwoDishesError extends Error {
  readonly code = 'table_needs_two_dishes';
  readonly fields = { dishIds: 'at_least_two_published_dishes' };
  constructor() {
    super('A table recommendation needs at least two published dishes from this restaurant.');
    this.name = 'TableNeedsTwoDishesError';
  }
}
