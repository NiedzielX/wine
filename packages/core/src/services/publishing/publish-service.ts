import type { Actor } from '../../auth/types';
import type { Dish, Restaurant, RestaurantSettings } from '../../domain/types';
import { DEFAULT_RESTAURANT_SETTINGS } from '../../domain/types';
import { NotFoundError, ValidationError } from '../../errors';
import type { PublishedVersionInfo, Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { isReviewed } from '../pairings/pairing-rules';
import { countContentChanges } from '../../i18n/content';

export type PublishServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'restaurantWriteRepository' | 'publishRepository'> & {
  clock: Clock;
  idGenerator: IdGenerator;
};

export interface PublishPreview {
  restaurant: Restaurant;
  settings: RestaurantSettings;
  lastVersion: PublishedVersionInfo | null;
  /** pairings with a decision since the last publish + draft dishes that would go live */
  pendingChanges: number;
  pendingPairings: number;
  /** dishes, wines and the restaurant whose translations differ from the published version (spec 2026-10-15-bilingual-content, R4) */
  pendingContent: number;
  draftDishes: Dish[];
  /** the checklist of the publish screen (advice, never a blocker) */
  withoutPrimary: Dish[];
  unreviewedSuggestions: number;
  draftProfiles: Dish[];
}

export class PublishService {
  private readonly d: PublishServiceDeps;

  constructor(deps: PublishServiceDeps) {
    this.d = deps;
  }

  async preview(slug: string): Promise<PublishPreview> {
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    const [dishes, wines, pairings, lastVersion, pendingPairings, published] = await Promise.all([
      this.d.dishRepository.listByRestaurant(restaurant.id),
      this.d.wineRepository.listByRestaurant(restaurant.id),
      this.d.pairingRepository.listByRestaurant(restaurant.id),
      this.d.publishRepository.latest(restaurant.id),
      this.d.publishRepository.pendingPairingChanges(restaurant.id),
      this.d.publishRepository.publishedContent(restaurant.id)
    ]);
    const pendingContent = countContentChanges({ restaurant, dishes, wines }, published);
    const live = dishes.filter((x) => x.status !== 'hidden');
    const primary = new Set(pairings.filter((p) => isReviewed(p) && p.role === 'primary').map((p) => p.dishId));
    const draftDishes = dishes.filter((x) => x.status === 'draft');
    return {
      restaurant,
      settings: { ...DEFAULT_RESTAURANT_SETTINGS, ...restaurant.settings },
      lastVersion, pendingPairings, pendingContent, draftDishes,
      pendingChanges: pendingPairings + draftDishes.length + pendingContent,
      withoutPrimary: live.filter((x) => !primary.has(x.id)),
      unreviewedSuggestions: pairings.filter((p) => p.status === 'suggested').length,
      draftProfiles: live.filter((x) => x.profile.source === 'draft')
    };
  }

  /** Publishes the current pairings as the version guests see. Nothing to publish is an error, not a silent no-op. */
  async publish(slug: string, actor: Actor): Promise<PublishedVersionInfo> {
    const p = await this.preview(slug);
    if (p.pendingChanges === 0) throw new ValidationError('nothing_to_publish', 'There are no unpublished changes.');
    return this.d.publishRepository.publish(p.restaurant.id, { actor: actor.name, at: this.d.clock.now().toISOString(), id: this.d.idGenerator.uuid(), contentChanges: p.pendingContent });
  }

  /** Guest-facing settings apply immediately; they are not part of a published version. */
  async updateSettings(slug: string, patch: Partial<RestaurantSettings>): Promise<RestaurantSettings> {
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    const next = { ...DEFAULT_RESTAURANT_SETTINGS, ...restaurant.settings, ...patch };
    await this.d.restaurantWriteRepository.updateSettings(restaurant.id, next);
    return next;
  }
}
