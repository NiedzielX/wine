import type { Dish, GuestPreferences, Restaurant, Wine } from '../../domain/types';
import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS } from '../../domain/types';
import { recommendForDish, type RecommendationItem, type RecommendationResult } from '../../engine/recommend';
import { recommendForTable, tablePeople, tableQuantity, type TableOptions, type TableQuantity, type TableResult } from '../../engine/table';
import { MAX_TABLE_DISHES } from '../../guest/prefs';
import type { Repositories } from '../../ports/repositories';
import type { Locale } from '../../i18n/locale';
import { localizeDish, localizePairing, localizeRestaurant, localizeWine, withPublishedContent } from '../../i18n/content';
import type { Pairing } from '../../domain/types';

export type RecommendationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository'>;

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

  /**
   * The content in the guest's language (spec 2026-10-15-bilingual-content): the translations of the latest publish,
   * the sommelier's note in that language. Without a locale (the public API) everything stays as stored.
   */
  private async content(restaurant: Restaurant, locale: Locale | undefined) {
    if (!locale) {
      const same = <T>(x: T) => x;
      return { restaurant, dish: same<Dish>, wine: same<Wine>, pairing: same<Pairing> };
    }
    const pub = withPublishedContent(await this.repos.publishRepository.publishedContent(restaurant.id));
    return {
      restaurant: localizeRestaurant(pub.restaurant(restaurant), locale),
      dish: (d: Dish) => localizeDish(pub.dish(d), locale),
      wine: (w: Wine) => localizeWine(pub.wine(w), locale),
      pairing: (p: Pairing) => localizePairing(p, locale)
    };
  }

  /**
   * `locale` sets the language of the engine's texts and of the restaurant's content; the public API passes none, so
   * its answers stay in English with the base content (BACKWARD_COMPATIBILITY §2).
   */
  async forDish(slug: string, dishId: string, prefs: Partial<GuestPreferences> = {}, limit?: number, locale?: Locale): Promise<DishRecommendations | null> {
    const found = await this.repos.restaurantRepository.findBySlug(slug);
    if (!found) return null;
    const raw = await this.repos.dishRepository.findById(found.id, dishId);
    if (!raw || raw.status !== 'published') return null;
    const [wines, pairings, c] = await Promise.all([
      this.repos.wineRepository.listByRestaurant(found.id, { activeOnly: true }),
      this.repos.pairingRepository.listPublishedByDish(found.id, raw.id),
      this.content(found, locale)
    ]);
    const dish = c.dish(raw);
    const result = recommendForDish(dish, wines.map(c.wine), pairings.map(c.pairing), { ...DEFAULT_PREFS, ...prefs }, limit, locale ?? 'en');
    const settings = found.settings ?? DEFAULT_RESTAURANT_SETTINGS;
    if (!settings.showUnreviewed) result.items = result.items.filter((i) => i.tier < 2);
    return { restaurant: c.restaurant, dish, result };
  }

  /** A wine of the restaurant, optionally scored against the dish the guest is looking at. */
  async wineDetails(slug: string, wineId: string, dishId?: string, locale?: Locale): Promise<WineDetails | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const rawWine = await this.repos.wineRepository.findById(restaurant.id, wineId);
    if (!rawWine) return null;
    const c = await this.content(restaurant, locale);
    const wine = c.wine(rawWine);
    const found = dishId ? await this.repos.dishRepository.findById(restaurant.id, dishId) : null;
    const dish = found && found.status === 'published' ? c.dish(found) : null;
    let match: RecommendationItem | null = null;
    if (dish && wine.active) {
      const [wines, pairings] = await Promise.all([
        this.repos.wineRepository.listByRestaurant(restaurant.id, { activeOnly: true }),
        this.repos.pairingRepository.listPublishedByDish(restaurant.id, dish.id)
      ]);
      match = recommendForDish(dish, wines.map(c.wine), pairings.map(c.pairing), DEFAULT_PREFS, wines.length, locale ?? 'en').items.find((i) => i.wine.id === wine.id) ?? null;
    }
    return { restaurant: c.restaurant, wine, dish, match };
  }

  /**
   * The best bottle for a table. Only the first MAX_TABLE_DISHES published dishes (in the order given) are used.
   * `options.relaxBudget` is for the guest and waiter screens; the public API passes none, so its budget stays a hard
   * filter (BACKWARD_COMPATIBILITY §2).
   */
  async forTable(
    slug: string,
    dishIds: string[],
    prefs: Partial<GuestPreferences> = {},
    locale?: Locale,
    options: TableOptions = {}
  ): Promise<{ restaurant: Restaurant; result: TableResult } | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const all = await this.repos.dishRepository.listByRestaurant(restaurant.id, { statuses: ['published'] });
    const picked = dishIds.map((id) => all.find((d) => d.id === id)).filter((d): d is Dish => !!d).slice(0, MAX_TABLE_DISHES);
    if (picked.length < 2) throw new TableNeedsTwoDishesError();
    const [wines, pairings, c] = await Promise.all([
      this.repos.wineRepository.listByRestaurant(restaurant.id, { activeOnly: true }),
      this.repos.pairingRepository.listPublishedByRestaurant(restaurant.id),
      this.content(restaurant, locale)
    ]);
    return { restaurant: c.restaurant, result: recommendForTable(picked.map(c.dish), wines.map(c.wine), pairings.map(c.pairing), { ...DEFAULT_PREFS, ...prefs }, undefined, locale ?? 'en', options) };
  }

  /**
   * The table quantity of one bottle (`table.quantity`) for the confirmation screen (G8 "For the table"): the same rules
   * as the table result, by the bottle. Null when the number of people was not chosen (`table.people_default`), the
   * restaurant or the wine is unknown, the wine is inactive, or fewer than two of the dishes are published.
   */
  async tableWineQuantity(slug: string, wineId: string, dishIds: string[], people: number | null): Promise<TableQuantity | null> {
    const chosen = tablePeople(people);
    if (chosen === null) return null;
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const [wine, dishes] = await Promise.all([
      this.repos.wineRepository.findById(restaurant.id, wineId),
      this.repos.dishRepository.listByRestaurant(restaurant.id, { statuses: ['published'] })
    ]);
    if (!wine || !wine.active) return null;
    if (dishIds.filter((id) => dishes.some((d) => d.id === id)).length < 2) return null;
    return tableQuantity(chosen, wine, 'bottle');
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
