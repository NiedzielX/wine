import type { Dish, GuestPreferences, Restaurant, Wine } from '../../domain/types';
import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS } from '../../domain/types';
import { rankForGuest } from '../../ranking/rank-for-guest';
import type { RankedItem, RankedResult } from '../../ranking/restaurant-picks';
import { recommendForTable, tablePeople, tableQuantity, type TableOptions, type TableQuantity, type TableResult } from '../../engine/table';
import { MAX_TABLE_DISHES } from '../../guest/prefs';
import type { Repositories } from '../../ports/repositories';
import type { Locale } from '../../i18n/locale';
import { localizeDish, localizePairing, localizeRestaurant, localizeWine } from '../../i18n/content';
import type { Pairing } from '../../domain/types';
import { loadPublishedView, type PublishedView } from '../publishing/published-view';

export type RecommendationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository'>;

export interface DishRecommendations {
  restaurant: Restaurant;
  dish: Dish;
  /** the engine's list with the restaurant's picks of the published version applied (`ranking/`) */
  result: RankedResult;
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
  match: RankedItem | null;
}

export class RecommendationService {
  private readonly repos: RecommendationServiceDeps;

  constructor(deps: RecommendationServiceDeps) {
    this.repos = deps;
  }

  /**
   * What guests see (spec 2026-11-04-panel-completion, R2): the dishes, wines, profiles, pairings and translations of
   * the publish. Every answer of this service is computed on it, never on the working data.
   */
  private async view(slug: string): Promise<PublishedView | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    return restaurant ? loadPublishedView(this.repos, restaurant) : null;
  }

  /**
   * The content in the guest's language (spec 2026-10-15-bilingual-content): the view already carries the published
   * translations; this shows them in the language, with the sommelier's note in that language. Without a locale (the
   * public API) everything stays as published.
   */
  private content(view: PublishedView, locale: Locale | undefined) {
    if (!locale) {
      const same = <T>(x: T) => x;
      return { restaurant: view.restaurant, dish: same<Dish>, wine: same<Wine>, pairing: same<Pairing> };
    }
    return {
      restaurant: localizeRestaurant(view.restaurant, locale),
      dish: (d: Dish) => localizeDish(d, locale),
      wine: (w: Wine) => localizeWine(w, locale),
      pairing: (p: Pairing) => localizePairing(p, locale)
    };
  }

  /**
   * `locale` sets the language of the engine's texts and of the restaurant's content; the public API passes none, so
   * its answers stay in English with the base content (BACKWARD_COMPATIBILITY §2). The ranking is `rankForGuest` on the
   * picks of the published version (spec 2026-11-18-restaurant-picks, R11): without picks it is the engine's list as it
   * always was; the simulator calls the same function.
   */
  async forDish(slug: string, dishId: string, prefs: Partial<GuestPreferences> = {}, limit?: number, locale?: Locale): Promise<DishRecommendations | null> {
    const view = await this.view(slug);
    const raw = view?.dish(dishId);
    if (!view || !raw) return null;
    const c = this.content(view, locale);
    const dish = c.dish(raw);
    const pairings = view.pairings.filter((p) => p.dishId === raw.id);
    const settings = view.restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS;
    const result = rankForGuest({
      dish, wines: view.wines.map(c.wine), pairings: pairings.map(c.pairing), prefs: { ...DEFAULT_PREFS, ...prefs }, limit,
      locale: locale ?? 'en', picks: view.picks, showUnreviewed: settings.showUnreviewed
    });
    return { restaurant: c.restaurant, dish, result };
  }

  /** A wine guests know, optionally scored against the dish the guest is looking at. */
  async wineDetails(slug: string, wineId: string, dishId?: string, locale?: Locale): Promise<WineDetails | null> {
    const view = await this.view(slug);
    const rawWine = view?.wine(wineId);
    if (!view || !rawWine) return null;
    const c = this.content(view, locale);
    const wine = c.wine(rawWine);
    const found = dishId ? view.dish(dishId) : null;
    const dish = found ? c.dish(found) : null;
    let match: RankedItem | null = null;
    if (dish && wine.active) {
      const pairings = view.pairings.filter((p) => p.dishId === dish.id);
      // as before, the wine page does not apply the "unreviewed" setting
      match = rankForGuest({
        dish, wines: view.wines.map(c.wine), pairings: pairings.map(c.pairing), prefs: DEFAULT_PREFS, limit: view.wines.length,
        locale: locale ?? 'en', picks: view.picks, showUnreviewed: true
      }).items.find((i) => i.wine.id === wine.id) ?? null;
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
    const view = await this.view(slug);
    if (!view) return null;
    const picked = dishIds.map((id) => view.dish(id)).filter((d): d is Dish => !!d).slice(0, MAX_TABLE_DISHES);
    if (picked.length < 2) throw new TableNeedsTwoDishesError();
    const c = this.content(view, locale);
    return { restaurant: c.restaurant, result: recommendForTable(picked.map(c.dish), view.wines.map(c.wine), view.pairings.map(c.pairing), { ...DEFAULT_PREFS, ...prefs }, undefined, locale ?? 'en', options) };
  }

  /**
   * The table quantity of one bottle (`table.quantity`) for the confirmation screen (G8 "For the table"): the same rules
   * as the table result, by the bottle. Null when the number of people was not chosen (`table.people_default`), the
   * restaurant or the wine is unknown, the wine is inactive, or fewer than two of the dishes are published.
   */
  async tableWineQuantity(slug: string, wineId: string, dishIds: string[], people: number | null): Promise<TableQuantity | null> {
    const chosen = tablePeople(people);
    if (chosen === null) return null;
    const view = await this.view(slug);
    const wine = view?.wine(wineId);
    if (!view || !wine || !wine.active) return null;
    if (dishIds.filter((id) => view.dish(id) !== null).length < 2) return null;
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
