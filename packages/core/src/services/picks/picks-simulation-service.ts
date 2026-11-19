import type { Dish, Wine } from '../../domain/types';
import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS } from '../../domain/types';
import { NotFoundError } from '../../errors';
import type { Locale } from '../../i18n/locale';
import type { Repositories } from '../../ports/repositories';
import { rankForGuest } from '../../ranking/rank-for-guest';
import { PICK_MIN_SCORE, type RankedItem } from '../../ranking/restaurant-picks';
import { loadPublishedView, type PublishedView } from '../publishing/published-view';
import { parseWith } from '../../validators/parse';
import { simulationQuerySchema } from '../../validators/picks/simulation.schema';

export type PicksSimulationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository' | 'picksRepository'>;

/** Why a pick changes nothing on a dish, or on any dish (spec 2026-11-18-restaurant-picks, R13). */
export type NoEffectReason =
  | 'inactive' // the wine is switched off: it is not recommended and not published as a pick
  | 'not_in_list' // not one of the wines guests can see (unknown, another restaurant's, added after the last publish), or the engine does not offer it for this dish
  | 'sommelier_pair' // the sommelier's pair keeps its seal and is not marked as a pick
  | 'unreviewed_hidden' // the restaurant hides what the sommelier has not reviewed, picks included
  | 'below_min_score' // the raw Match Score on this dish is under `PICK_MIN_SCORE`
  | 'outside_window' // more than `PICK_WINDOW` points under the best wine of the group
  | 'over_cap'; // already `PICKS_PROMOTED_MAX` other picks go first on this list

/** The reasons in the order they are tried, and the order a tie between two reasons is broken in. */
export const NO_EFFECT_REASONS: readonly NoEffectReason[] = ['inactive', 'not_in_list', 'sommelier_pair', 'unreviewed_hidden', 'below_min_score', 'outside_window', 'over_cap'];

export interface SimulatedItem {
  wineId: string;
  producer: string;
  name: string;
  /** the engine's Match Score, never changed by the picks */
  matchScore: number;
  tier: 0 | 1 | 2;
  /** a sommelier's pair (tier 0 or 1): it carries the seal */
  sommelierPair: boolean;
  restaurantPick: boolean;
}

/** A wine whose place in the list differs; positions are 1-based, `null` = not in that list. */
export interface SimulatedMove {
  wineId: string;
  from: number | null;
  to: number | null;
}

export type PickEffect = 'moved' | 'label_only' | 'none';

export interface DishSimulation {
  dishId: string;
  dishName: string;
  /** the list a guest sees now (the picks of the published version) */
  before: SimulatedItem[];
  /** the list the same guest would see after the publish of the tried set */
  after: SimulatedItem[];
  moves: SimulatedMove[];
  /** the order or the content of the list differs */
  reordered: boolean;
  /** what each wine of the tried set does on this dish */
  picks: Array<{ wineId: string; effect: PickEffect; reason: NoEffectReason | null }>;
}

export interface PickSimulation {
  wineId: string;
  /** null for an id that is not one of the restaurant's wines (unknown and foreign are the same answer) */
  name: string | null;
  /** the wine is in the set guests see now */
  inPublishedSet: boolean;
  effect: PickEffect;
  /** set when `effect` is `none`: the reason that applies on most dishes (a reason of the wine itself first) */
  reason: NoEffectReason | null;
  dishesMoved: number;
  dishesLabelled: number;
  /** how many dishes each reason explains */
  reasons: Array<{ reason: NoEffectReason; dishes: number }>;
}

export interface PicksSimulation {
  /** false = the restaurant was never published, so guests see the working data and no picks */
  published: boolean;
  /** the tried set: the working set, or the ids asked for, each once */
  tried: string[];
  dishes: DishSimulation[];
  picks: PickSimulation[];
  summary: { dishes: number; dishesReordered: number; picksWithoutEffect: number };
}

export interface SimulateOptions {
  /** the set to try (at most `PICKS_MAX` ids); absent = the working set, empty = no picks */
  picks?: string[];
  /** only this dish; unknown or not visible is `NotFoundError` */
  dishId?: string;
  /** the language of the engine's texts, which do not appear in the answer; the lists do not depend on it */
  locale?: Locale;
}

const item = (i: RankedItem): SimulatedItem => ({
  wineId: i.wine.id, producer: i.wine.producer, name: i.wine.name, matchScore: i.matchScore, tier: i.tier,
  sommelierPair: i.tier < 2, restaurantPick: i.restaurantPick === true
});

/**
 * The "before / after" simulator of the picks (spec 2026-11-18-restaurant-picks, R13 to R15). A read: nothing is written.
 * For every visible dish it ranks the published view twice with `rankForGuest`, the one function guests are served by,
 * with the picks of the published version ("before") and with the tried set ("after"); there is no second copy of the
 * ranking path. Only the picks change between the two; every other unpublished change (pairings, profiles,
 * translations) is outside the simulation, so the equality with the guest's list after a publish holds when the picks
 * are the only unpublished change. The reasons are read from the same layer's own marks (`restaurantPick`) and the
 * constants it exports; they do not decide anything.
 */
export class PicksSimulationService {
  private readonly d: PicksSimulationServiceDeps;

  constructor(deps: PicksSimulationServiceDeps) {
    this.d = deps;
  }

  async simulate(slug: string, options: SimulateOptions = {}): Promise<PicksSimulation> {
    const opts = parseWith(simulationQuerySchema, { ...(options.picks ? { picks: options.picks } : {}), ...(options.dishId ? { dish: options.dishId } : {}) });
    const restaurant = await this.d.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    const [view, ownWines, working] = await Promise.all([
      loadPublishedView(this.d, restaurant),
      this.d.wineRepository.listByRestaurant(restaurant.id),
      opts.picks ? Promise.resolve(null) : this.d.picksRepository.list(restaurant.id)
    ]);
    const tried = [...new Set(opts.picks ?? working!.map((p) => p.wineId))];
    const own = new Map(ownWines.map((w) => [w.id, w]));
    const visible = new Set(view.wines.map((w) => w.id));
    // the set the guest layer gets: only wines guests can be shown (what a publish would keep)
    const after = new Set(tried.filter((id) => visible.has(id)));
    const one = opts.dish ? view.dish(opts.dish) : null;
    if (opts.dish && !one) throw new NotFoundError('Dish');
    const dishes = one ? [one] : view.dishes;
    const locale = options.locale ?? 'en';

    const sims = dishes.map((dish) => this.dish(view, dish, after, tried, locale));
    const picks = tried.map((id) => this.pick(id, own.get(id) ?? null, visible.has(id), view, sims));
    return {
      published: view.version !== null,
      tried,
      dishes: sims,
      picks,
      summary: { dishes: sims.length, dishesReordered: sims.filter((s) => s.reordered).length, picksWithoutEffect: picks.filter((p) => p.effect === 'none').length }
    };
  }

  private dish(view: PublishedView, dish: Dish, after: ReadonlySet<string>, tried: string[], locale: Locale): DishSimulation {
    const pairings = view.pairings.filter((p) => p.dishId === dish.id);
    const showUnreviewed = (view.restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS).showUnreviewed;
    const rank = (picks: ReadonlySet<string>, over: { limit?: number; showUnreviewed?: boolean } = {}) =>
      rankForGuest({ dish, wines: view.wines, pairings, prefs: DEFAULT_PREFS, locale, picks, showUnreviewed: over.showUnreviewed ?? showUnreviewed, ...(over.limit !== undefined ? { limit: over.limit } : {}) });
    const beforeItems = rank(view.picks).items;
    const afterItems = rank(after).items;
    const before = beforeItems.map(item);
    const afterList = afterItems.map(item);
    const pos = (items: SimulatedItem[]) => new Map(items.map((i, n) => [i.wineId, n + 1]));
    const b = pos(before);
    const a = pos(afterList);
    const moves: SimulatedMove[] = [];
    for (const id of [...new Set([...before.map((i) => i.wineId), ...afterList.map((i) => i.wineId)])]) {
      const from = b.get(id) ?? null;
      const to = a.get(id) ?? null;
      if (from !== to) moves.push({ wineId: id, from, to });
    }
    // the whole list of the tried set, to say why a pick does nothing
    const full = rank(after, { limit: view.wines.length, showUnreviewed: true }).items;
    return {
      dishId: dish.id, dishName: dish.name, before, after: afterList, moves, reordered: moves.length > 0,
      picks: tried.map((id) => {
        const shown = afterList.find((i) => i.wineId === id);
        if (shown?.restaurantPick) return { wineId: id, effect: moves.some((m) => m.wineId === id) ? 'moved' as const : 'label_only' as const, reason: null };
        const found = full.find((i) => i.wine.id === id);
        let reason: NoEffectReason;
        if (!found) reason = 'not_in_list';
        else if (found.tier < 2) reason = 'sommelier_pair';
        else if (!showUnreviewed) reason = 'unreviewed_hidden';
        else if (found.restaurantPick !== true) reason = found.matchScore < PICK_MIN_SCORE ? 'below_min_score' : 'outside_window';
        else reason = 'over_cap'; // qualified, but `PICKS_PROMOTED_MAX` other picks go first
        return { wineId: id, effect: 'none' as const, reason };
      })
    };
  }

  private pick(id: string, wine: Wine | null, visible: boolean, view: PublishedView, sims: DishSimulation[]): PickSimulation {
    const inPublishedSet = view.picks.has(id);
    const base = { wineId: id, name: wine?.name ?? null, inPublishedSet };
    // a reason that belongs to the wine, not to a dish
    const own: NoEffectReason | null = !wine || !visible ? (wine && !wine.active ? 'inactive' : 'not_in_list') : null;
    if (own) return { ...base, effect: 'none', reason: own, dishesMoved: 0, dishesLabelled: 0, reasons: sims.length ? [{ reason: own, dishes: sims.length }] : [] };
    const rows = sims.flatMap((s) => s.picks.filter((p) => p.wineId === id));
    const dishesMoved = rows.filter((r) => r.effect === 'moved').length;
    const dishesLabelled = rows.filter((r) => r.effect === 'label_only').length;
    const counts = new Map<NoEffectReason, number>();
    for (const r of rows) if (r.reason) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const reasons = NO_EFFECT_REASONS.filter((r) => counts.has(r)).map((reason) => ({ reason, dishes: counts.get(reason)! }));
    const top = [...reasons].sort((x, y) => y.dishes - x.dishes)[0]?.reason ?? null;
    const effect: PickEffect = dishesMoved > 0 ? 'moved' : dishesLabelled > 0 ? 'label_only' : 'none';
    return { ...base, effect, reason: effect === 'none' ? top : null, dishesMoved, dishesLabelled, reasons };
  }
}
