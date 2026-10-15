import type { Dish, Pairing, Restaurant, Wine } from '../domain/types';
import { pairingScore } from '../engine/scoring';
import { generateSuggestions } from '../engine/suggest';
import { DISHES, RESTAURANT, SEED_DECISIONS, WINES } from './halka';
import { DEMO_USERS, type DemoUser } from './users';

export interface DemoDataset {
  /** demo accounts with their membership in the restaurant (see demo/users.ts) */
  users: Array<DemoUser & { id: string; restaurantId: string }>;
  restaurant: Restaurant;
  dishes: Dish[];
  wines: Wine[];
  pairings: Pairing[];
}

/**
 * Deterministic UUID (version nibble 8 = custom) derived from a readable demo id, so the
 * demo data has the same ids in memory and in PostgreSQL. Not for production ids.
 */
export function demoUuid(key: string): string {
  const h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ (c + k * 31), 0x01000193 + k * 2) >>> 0;
  }
  const hex = h.map((x) => x.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The Halka demo: menu, wine list, engine suggestions and the Wine Director's decisions.
 * `ids: 'raw'` keeps readable ids (d_duck) for the static mockups; `ids: 'uuid'` maps every id
 * through demoUuid for the app and the database seeder.
 */
export function buildDemoDataset(opts: { ids?: 'raw' | 'uuid' } = {}): DemoDataset {
  const map = opts.ids === 'uuid' ? demoUuid : (x: string) => x;
  const restaurant: Restaurant = { ...structuredClone(RESTAURANT), id: map(RESTAURANT.id) };
  const dishes = structuredClone(DISHES).map((d) => ({ ...d, id: map(d.id) }));
  const wines = structuredClone(WINES).map((w, i) => ({ ...w, id: map(w.id), listNumber: 101 + i }));
  const pairId = (d: string, w: string) => map(`p_${d}_${w}`);
  const pairings = generateSuggestions(dishes, wines, { generatedAt: '2026-10-08T09:00:00.000Z', idFor: pairId });

  for (const s of SEED_DECISIONS) {
    const dishId = map(s.dishId);
    const wineId = map(s.wineId);
    let p = pairings.find((x) => x.dishId === dishId && x.wineId === wineId);
    if (!p) {
      const dish = dishes.find((x) => x.id === dishId)!;
      const wine = wines.find((x) => x.id === wineId)!;
      p = {
        id: pairId(dishId, wineId), dishId, wineId, status: 'suggested', role: null, rank: null, comment: null, commentTranslations: {},
        modelScore: pairingScore(dish, wine).score, source: 'sommelier', updatedBy: restaurant.wineDirector,
        updatedAt: '2026-10-09T16:20:00.000Z', dirty: false
      };
      pairings.push(p);
    }
    Object.assign(p, {
      status: s.status, role: s.role ?? null, rank: s.rank ?? null, comment: s.comment ?? null, commentTranslations: s.commentPl ? { pl: s.commentPl } : {},
      updatedBy: restaurant.wineDirector, updatedAt: '2026-10-09T16:20:00.000Z'
    });
  }
  const users = DEMO_USERS.map((u) => ({ ...u, id: map(`u_${u.key}`), restaurantId: restaurant.id }));
  return { users, restaurant, dishes, wines, pairings };
}
