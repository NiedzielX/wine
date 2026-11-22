import type { Dish, Pairing, Wine } from '../domain/types';
import { generateSuggestions } from '../engine/suggest';

/**
 * Engine suggestions only for pairs that involve something new and do not exist yet. Hidden dishes take no part (an
 * import or a new wine must not pair with a dish guests cannot see; `hidden → published` asks for the missing ones
 * again). Shared by the import and by the catalog edit commands (spec 2026-11-16-catalog-field-editing, R7, R8).
 */
export function suggestionsFor(
  newDishes: readonly Dish[],
  newWines: readonly Wine[],
  ctx: { dishes: readonly Dish[]; wines: readonly Wine[]; pairings: readonly Pairing[]; now: string },
  idFor: () => string
): Pairing[] {
  const taken = new Set(ctx.pairings.map((p) => `${p.dishId}:${p.wineId}`));
  const allWines = [...ctx.wines, ...newWines];
  const newDishIds = new Set(newDishes.map((d) => d.id));
  const newWineIds = new Set(newWines.map((w) => w.id));
  const dishes = [...ctx.dishes.filter((d) => d.status !== 'hidden'), ...newDishes];
  return generateSuggestions(dishes, allWines, { generatedAt: ctx.now, idFor })
    .filter((p) => (newDishIds.has(p.dishId) || newWineIds.has(p.wineId)) && !taken.has(`${p.dishId}:${p.wineId}`));
}
