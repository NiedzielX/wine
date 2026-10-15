import type { Dish, Pairing, Restaurant, Wine } from '../../domain/types';
import { pairingScore } from '../../engine/scoring';
import type { Repositories } from '../../ports/repositories';

export type CatalogServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository'>;

export interface PairingWithWine extends Pairing {
  wine: Wine | null;
  /** sommelier's note, or the engine's explanation */
  why: string;
}

/** Read models for the menu and the sommelier dashboard. */
export class CatalogService {
  private readonly repos: CatalogServiceDeps;

  constructor(deps: CatalogServiceDeps) {
    this.repos = deps;
  }

  async publishedMenu(slug: string): Promise<{ restaurant: Restaurant; dishes: Dish[] } | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const dishes = await this.repos.dishRepository.listByRestaurant(restaurant.id, { statuses: ['published'] });
    return { restaurant, dishes };
  }

  /** One published dish; draft and hidden dishes are not visible to guests. */
  async publishedDish(slug: string, dishId: string): Promise<{ restaurant: Restaurant; dish: Dish } | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const dish = await this.repos.dishRepository.findById(restaurant.id, dishId);
    return dish && dish.status === 'published' ? { restaurant, dish } : null;
  }

  async dishPairings(slug: string, dishId: string): Promise<{ restaurant: Restaurant; dish: Dish; pairings: PairingWithWine[] } | null> {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const dish = await this.repos.dishRepository.findById(restaurant.id, dishId);
    if (!dish) return null;
    const [pairings, wines] = await Promise.all([
      this.repos.pairingRepository.listByDish(restaurant.id, dish.id),
      this.repos.wineRepository.listByRestaurant(restaurant.id)
    ]);
    const byId = new Map(wines.map((w) => [w.id, w]));
    const order = { approved: 0, modified: 0, suggested: 1, rejected: 2 } as const;
    const withWine = pairings
      .map((p) => {
        const wine = byId.get(p.wineId) ?? null;
        return { ...p, wine, why: p.comment ?? (wine ? pairingScore(dish, wine).why : '') };
      })
      .sort((a, b) => order[a.status] - order[b.status] || (a.role === 'primary' ? -1 : 0) - (b.role === 'primary' ? -1 : 0)
        || (a.rank ?? 99) - (b.rank ?? 99) || b.modelScore - a.modelScore || a.id.localeCompare(b.id));
    return { restaurant, dish, pairings: withWine };
  }

  /** What guests see: approved pairings per dish id (from the published version) and whether the sommelier chose a primary. */
  async pairingCoverage(restaurantId: string): Promise<Map<string, { approved: number; hasPrimary: boolean }>> {
    const out = new Map<string, { approved: number; hasPrimary: boolean }>();
    // the published snapshot only holds reviewed and rejected pairings: suggestions never reach guests
    for (const p of await this.repos.pairingRepository.listPublishedByRestaurant(restaurantId)) {
      const c = out.get(p.dishId) ?? { approved: 0, hasPrimary: false };
      if (p.status === 'approved' || p.status === 'modified') { c.approved++; if (p.role === 'primary') c.hasPrimary = true; }
      out.set(p.dishId, c);
    }
    return out;
  }
}
