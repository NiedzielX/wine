import type { Dish, GuestPreferences, Pairing, Wine } from '../domain/types';
import { DEFAULT_LIMIT, recommendForDish } from '../engine/recommend';
import type { Locale } from '../i18n/locale';
import { applyRestaurantPicks, type RankedResult } from './restaurant-picks';

export interface RankForGuestInput {
  /** the dish, the visible active wines and the pairings of the dish, already in the guest's language */
  dish: Dish;
  wines: Wine[];
  pairings: Pairing[];
  prefs: GuestPreferences;
  limit?: number;
  locale: Locale;
  /** the restaurant's picks of the published version; none means the engine's list as it always was */
  picks?: ReadonlySet<string>;
  /** `false` hides what the sommelier has not reviewed (tier 2), picks included */
  showUnreviewed: boolean;
}

/**
 * The one ranking guests see (spec 2026-11-18-restaurant-picks, R11): the engine, then the picks layer, then the
 * "unreviewed" filter. The guest service and the simulator both call it; there is no second copy of this path.
 * Without picks the engine runs with `limit` exactly as before. With picks it runs on the whole list and the layer
 * cuts it to `limit`, so the order inside tier 2 can change.
 */
export function rankForGuest(input: RankForGuestInput): RankedResult {
  const { dish, wines, pairings, prefs, locale, picks, showUnreviewed } = input;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const layered = !!picks && picks.size > 0;
  const raw = recommendForDish(dish, wines, pairings, prefs, layered ? wines.length : limit, locale);
  const result: RankedResult = layered ? applyRestaurantPicks(raw, picks, limit) : raw;
  if (!showUnreviewed) result.items = result.items.filter((i) => i.tier < 2);
  return result;
}
