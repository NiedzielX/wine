import type { Actor } from '../../auth/types';
import type { Dish, OpportunityRule, PairingRole, Restaurant, Wine } from '../../domain/types';
import { pairingScore } from '../../engine/scoring';
import { NotFoundError, ValidationError } from '../../errors';
import { localizeDish, localizeWine } from '../../i18n/content';
import type { Locale } from '../../i18n/locale';
import type { Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { lastFullServiceDays } from '../../recommendation-code/service-day';
import { opportunityKeySchema } from '../../validators/opportunities/opportunity-key.schema';
import { parseWith } from '../../validators/parse';
import { orderReviewed } from '../pairings/pairing-rules';
import {
  DISMISS_DAYS, WINDOW_DAYS, findOpportunities, opportunityCandidates, scoreKey, type Opportunity, type OpportunityInput, type OrderedPair
} from './opportunity-rules';

export type OpportunityServiceDeps = Pick<Repositories,
  'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'opportunityDismissalRepository' | 'recommendationCodeRepository'> & {
  clock: Clock;
  idGenerator: IdGenerator;
};

/** `dish`: S1–S3 only, no aggregate queries (A6, A1); `all`: every signal (A14), S5 from the recommendation codes. */
export type OpportunityScope = 'dish' | 'all';

export interface OpportunityItem extends Opportunity {
  /** the wine named by the opportunity (localized), null for S1 `none` / `no_primary` */
  wine: Wine | null;
}

export interface OpportunityGroup {
  dish: Dish;
  /** the dish's approved pairings in guest order */
  current: Array<{ pairingId: string; wine: Wine; role: PairingRole | null }>;
  items: OpportunityItem[];
}

export interface DismissedOpportunity {
  key: string;
  rule: OpportunityRule;
  dish: Dish | null;
  wine: Wine | null;
  dismissedBy: string;
  expiresAt: string;
}

export interface OpportunityView {
  restaurant: Restaurant;
  groups: OpportunityGroup[];
  /** ignored and not yet expired, soonest to return first */
  dismissed: DismissedOpportunity[];
  /** sources that failed to load (phase 3: `usage`, phase 4: `orders`); the other signals are still shown */
  degraded: Array<'usage' | 'orders'>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The match score of every published dish with every active wine: computed once per request, shared by S2 and S3. */
export function buildScoreMatrix(dishes: Dish[], wines: Wine[]): Map<string, number> {
  const scores = new Map<string, number>();
  const active = wines.filter((w) => w.active);
  for (const dish of dishes) {
    if (dish.status !== 'published') continue;
    for (const wine of active) scores.set(scoreKey(dish.id, wine.id), pairingScore(dish, wine).score);
  }
  return scores;
}

/**
 * The sommelier's opportunities (spec 2026-10-16-sommelier-opportunities): computed on read for one restaurant, plus
 * "Ignore" and "Restore". Adding a suggestion is `SommelierService.addSuggestion` — this service never writes pairings.
 */
export class OpportunityService {
  private readonly d: OpportunityServiceDeps;

  constructor(deps: OpportunityServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string): Promise<Restaurant> {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  /**
   * S5 input: orders with a recommendation code per (dish, wine) in the last WINDOW_DAYS full service days. Only rows
   * of context `dish`: a table code would credit one order to every dish of the table (E09 Q12).
   */
  private async orders(restaurantId: string): Promise<OrderedPair[]> {
    const stats = await this.d.recommendationCodeRepository.pairStats(restaurantId, lastFullServiceDays(this.d.clock.now(), WINDOW_DAYS));
    return stats.filter((s) => s.context === 'dish').map((s) => ({ dishId: s.dishId, wineId: s.wineId, orders: s.ordered }));
  }

  /** Current data of one restaurant (the panel reads the current state, not the published one). */
  private async input(restaurantId: string): Promise<Omit<OpportunityInput, 'dismissedKeys'>> {
    const [dishes, wines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(restaurantId),
      this.d.wineRepository.listByRestaurant(restaurantId),
      this.d.pairingRepository.listByRestaurant(restaurantId)
    ]);
    return { dishes, wines, pairings, scores: buildScoreMatrix(dishes, wines) };
  }

  /** The opportunities, grouped by dish; `dishId` narrows to one dish (A6). Null for an unknown restaurant. */
  async list(slug: string, opts: { dishId?: string; scope: OpportunityScope }, locale?: Locale): Promise<OpportunityView | null> {
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const [data, dismissals] = await Promise.all([
      this.input(restaurant.id),
      this.d.opportunityDismissalRepository.listActive(restaurant.id, this.d.clock.now())
    ]);
    // S5 (orders) for scope "all" only; a failed read leaves the other signals and says so (S4, usage: phase 3)
    const degraded: OpportunityView['degraded'] = [];
    let orders: OrderedPair[] | undefined;
    if (opts.scope === 'all') {
      try {
        orders = await this.orders(restaurant.id);
      } catch {
        degraded.push('orders');
      }
    }
    const items = findOpportunities({ ...data, orders, dismissedKeys: new Set(dismissals.map((x) => x.key)) })
      .filter((o) => !opts.dishId || o.dishId === opts.dishId);

    const dishes = new Map(data.dishes.map((x) => [x.id, locale ? localizeDish(x, locale) : x]));
    const wines = new Map(data.wines.map((x) => [x.id, locale ? localizeWine(x, locale) : x]));
    const groups: OpportunityGroup[] = [];
    for (const o of items) {
      let g = groups[groups.length - 1];
      if (!g || g.dish.id !== o.dishId) {
        const dish = dishes.get(o.dishId)!;
        const current = orderReviewed(data.pairings.filter((p) => p.dishId === o.dishId)).flatMap((p) => {
          const wine = wines.get(p.wineId);
          return wine ? [{ pairingId: p.id, wine, role: p.role }] : [];
        });
        groups.push((g = { dish, current, items: [] }));
      }
      g.items.push({ ...o, wine: o.wineId ? wines.get(o.wineId) ?? null : null });
    }
    const dismissed = dismissals
      .filter((x) => !opts.dishId || x.dishId === opts.dishId)
      .map((x) => ({
        key: x.key, rule: x.rule, dish: x.dishId ? dishes.get(x.dishId) ?? null : null, wine: x.wineId ? wines.get(x.wineId) ?? null : null,
        dismissedBy: x.dismissedBy, expiresAt: x.expiresAt
      }));
    return { restaurant, groups, dismissed, degraded };
  }

  /**
   * "Ignore": hides the opportunity for DISMISS_DAYS. Only a current candidate can be ignored (its condition holds,
   * ignored or not), otherwise `opportunity_stale` and nothing is stored. Ignoring again extends the term.
   */
  async dismiss(slug: string, key: string, actor: Actor): Promise<void> {
    const input = parseWith(opportunityKeySchema, { key }, 'This opportunity is not valid.');
    const restaurant = await this.restaurant(slug);
    const data = await this.input(restaurant.id);
    // S5 keys need the orders (a read error propagates: nothing is stored); other keys never query them
    const orders = input.key.startsWith('ordered_not_reviewed:') ? await this.orders(restaurant.id) : undefined;
    const candidate = opportunityCandidates({ ...data, orders }).find((o) => o.key === input.key);
    if (!candidate) throw new ValidationError('opportunity_stale', 'This opportunity is no longer current.');
    const now = this.d.clock.now();
    await this.d.opportunityDismissalRepository.upsert(restaurant.id, {
      id: this.d.idGenerator.uuid(), key: candidate.key, rule: candidate.rule, dishId: candidate.dishId, wineId: candidate.wineId,
      dismissedBy: actor.name, dismissedById: actor.id, dismissedAt: now.toISOString(), expiresAt: new Date(now.getTime() + DISMISS_DAYS * DAY_MS).toISOString()
    });
  }

  /** "Restore": the ignored opportunity shows again right away (if its condition still holds). */
  async restore(slug: string, key: string, _actor: Actor): Promise<void> {
    const input = parseWith(opportunityKeySchema, { key }, 'This opportunity is not valid.');
    const restaurant = await this.restaurant(slug);
    const removed = await this.d.opportunityDismissalRepository.remove(restaurant.id, input.key);
    if (!removed) throw new NotFoundError('Opportunity', 'opportunity_not_dismissed', 'This opportunity is not ignored.');
  }
}
