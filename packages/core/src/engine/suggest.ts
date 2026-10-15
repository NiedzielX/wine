import type { Dish, Pairing, Wine } from '../domain/types';
import { MIN_MODEL_SCORE } from './recommend';
import { pairingScore } from './scoring';

export const ENGINE_AUTHOR = 'Wine Match engine';

/**
 * Engine suggestions: the top `perDish` active wines per dish with a score of at least
 * MIN_MODEL_SCORE, as `suggested` pairings. Deterministic: ties broken by wine id, the
 * timestamp is passed in by the caller.
 */
export function generateSuggestions(
  dishes: Dish[],
  wines: Wine[],
  opts: { perDish?: number; generatedAt?: string; idFor?: (dishId: string, wineId: string) => string } = {}
): Pairing[] {
  const perDish = opts.perDish ?? 4;
  const generatedAt = opts.generatedAt ?? '1970-01-01T00:00:00.000Z';
  const idFor = opts.idFor ?? ((d: string, w: string) => `p_${d}_${w}`);
  const out: Pairing[] = [];
  for (const dish of dishes) {
    const ranked = wines
      .filter((w) => w.active)
      .map((w) => ({ w, s: pairingScore(dish, w).score }))
      .filter((x) => x.s >= MIN_MODEL_SCORE)
      .sort((a, b) => b.s - a.s || a.w.id.localeCompare(b.w.id))
      .slice(0, perDish);
    for (const { w, s } of ranked) {
      out.push({
        id: idFor(dish.id, w.id), dishId: dish.id, wineId: w.id, status: 'suggested', role: null, rank: null,
        comment: null, modelScore: s, source: 'engine', updatedBy: ENGINE_AUTHOR, updatedAt: generatedAt, dirty: false
      });
    }
  }
  return out;
}
