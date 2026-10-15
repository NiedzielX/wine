import { buildDemoDataset, DEFAULT_PREFS, generateSuggestions as engineSuggestions, pairingScore, RESTAURANT } from '@wine-match/core';
import type { Dish, GuestPreferences, Pairing, PairingRole, PairingStatus, Restaurant, Wine } from '@wine-match/core';

/**
 * In-browser store standing in for the backend. Admin edits persist in localStorage
 * (guarded with try/catch) so the mockup can be clicked through across reloads.
 */

export interface AnalyticsEvent { name: string; at: string; props: Record<string, unknown> }

export interface AppState {
  restaurant: Restaurant;
  dishes: Dish[];
  wines: Wine[];
  pairings: Pairing[];
  settings: { showUnreviewed: boolean; showScores: boolean };
  session: { staffName: string | null; role: 'sommelier' | 'manager' | null };
  guest: { prefs: GuestPreferences; table: string[]; lastDish: string | null };
  events: AnalyticsEvent[];
}

const STORAGE_KEY = 'winematch.demo.v2';
const SOMMELIER = RESTAURANT.wineDirector;

function nowIso(): string { return new Date().toISOString(); }

let seq = 0;
export function newId(prefix: string): string { seq += 1; return `${prefix}_${Date.now().toString(36)}${seq}`; }

/** Engine suggestions from @wine-match/core, stamped with the current time for the mockup. */
export function generateSuggestions(dishes: Dish[], wines: Wine[], perDish = 4): Pairing[] {
  return engineSuggestions(dishes, wines, { perDish, generatedAt: nowIso() });
}

function seed(): AppState {
  const { restaurant, dishes, wines, pairings } = buildDemoDataset({ ids: 'raw' });
  return {
    restaurant,
    dishes, wines, pairings,
    settings: { showUnreviewed: true, showScores: true },
    session: { staffName: null, role: null },
    guest: { prefs: { ...DEFAULT_PREFS }, table: [], lastDish: null },
    events: []
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch { /* storage unavailable: fall back to seed */ }
  return seed();
}

export const state: AppState = load();

export function save(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function resetDemo(): void {
  const fresh = seed();
  Object.assign(state, fresh);
  save();
}

/* ---------- selectors ---------- */

export const dishById = (id: string) => state.dishes.find((d) => d.id === id);
export const wineById = (id: string) => state.wines.find((w) => w.id === id);
export const pairingsForDish = (dishId: string) => state.pairings.filter((p) => p.dishId === dishId);
export const visibleDishes = () => state.dishes.filter((d) => d.status === 'published');
export const dirtyCount = () => state.pairings.filter((p) => p.dirty).length
  + state.dishes.filter((d) => d.status === 'draft').length;


/* ---------- mutations (sommelier) ---------- */

function touch(p: Pairing): void {
  p.updatedBy = state.session.staffName ?? SOMMELIER;
  p.updatedAt = nowIso();
  p.dirty = true;
}

export function setPairingStatus(id: string, status: PairingStatus): void {
  const p = state.pairings.find((x) => x.id === id);
  if (!p) return;
  p.status = status;
  if (status === 'rejected') { p.role = null; p.rank = null; }
  touch(p);
  track('pairing_status_changed', { pairingId: id, status });
  save();
}

export function setPairingRole(id: string, role: PairingRole | null): void {
  const p = state.pairings.find((x) => x.id === id);
  if (!p) return;
  if (role === 'primary') {
    for (const other of state.pairings) {
      if (other.dishId === p.dishId && other.role === 'primary' && other.id !== id) { other.role = 'alternative'; touch(other); }
    }
  }
  p.role = role;
  if (p.status === 'suggested' || p.status === 'rejected') p.status = 'approved';
  touch(p);
  normaliseRanks(p.dishId);
  track('pairing_role_changed', { pairingId: id, role });
  save();
}

export function setPairingComment(id: string, comment: string): void {
  const p = state.pairings.find((x) => x.id === id);
  if (!p) return;
  p.comment = comment.trim() || null;
  if (p.status === 'approved' || p.status === 'suggested') p.status = 'modified';
  touch(p);
  save();
}

export function movePairing(id: string, dir: -1 | 1): void {
  const p = state.pairings.find((x) => x.id === id);
  if (!p) return;
  const list = orderedReviewed(p.dishId);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { if (x.rank !== k + 1) { x.rank = k + 1; touch(x); } });
  if (p.status === 'approved') p.status = 'modified';
  save();
}

export function orderedReviewed(dishId: string): Pairing[] {
  return state.pairings
    .filter((x) => x.dishId === dishId && (x.status === 'approved' || x.status === 'modified'))
    .sort((a, b) => (a.role === 'primary' ? -1 : 0) - (b.role === 'primary' ? -1 : 0) || (a.rank ?? 99) - (b.rank ?? 99) || b.modelScore - a.modelScore);
}

function normaliseRanks(dishId: string): void {
  orderedReviewed(dishId).forEach((x, k) => { x.rank = k + 1; });
}

export function addManualPairing(dishId: string, wineId: string, role: PairingRole | null, comment: string): Pairing | null {
  const dish = dishById(dishId);
  const wine = wineById(wineId);
  if (!dish || !wine) return null;
  let p = state.pairings.find((x) => x.dishId === dishId && x.wineId === wineId);
  if (!p) {
    p = {
      id: newId('p'), dishId, wineId, status: 'approved', role: null, rank: null, comment: null, commentTranslations: {},
      modelScore: pairingScore(dish, wine).score, source: 'sommelier', updatedBy: SOMMELIER, updatedAt: nowIso(), dirty: true
    };
    state.pairings.push(p);
  }
  p.status = comment.trim() ? 'modified' : 'approved';
  p.comment = comment.trim() || null;
  touch(p);
  setPairingRole(p.id, role ?? 'alternative');
  track('pairing_added', { dishId, wineId });
  return p;
}

export function deletePairing(id: string): void {
  state.pairings = state.pairings.filter((p) => p.id !== id);
  track('pairing_deleted', { pairingId: id });
  save();
}

export function approveAllSuggested(dishId?: string): number {
  let n = 0;
  for (const p of state.pairings) {
    if (p.status === 'suggested' && (!dishId || p.dishId === dishId)) {
      p.status = 'approved';
      if (!p.role) p.role = 'alternative';
      touch(p);
      n++;
    }
  }
  const dishes = dishId ? [dishId] : [...new Set(state.pairings.map((p) => p.dishId))];
  for (const id of dishes) {
    const reviewed = orderedReviewed(id);
    if (reviewed.length && !reviewed.some((p) => p.role === 'primary')) {
      const best = [...reviewed].sort((a, b) => b.modelScore - a.modelScore)[0];
      best.role = 'primary';
    }
    normaliseRanks(id);
  }
  save();
  return n;
}

export function publish(): number {
  const n = dirtyCount();
  state.pairings.forEach((p) => { p.dirty = false; });
  state.dishes.forEach((d) => { if (d.status === 'draft') d.status = 'published'; });
  state.restaurant.publishedAt = nowIso();
  track('restaurant_published', { changes: n });
  save();
  return n;
}

/* ---------- guest ---------- */

export function setPrefs(p: Partial<GuestPreferences>): void {
  state.guest.prefs = { ...state.guest.prefs, ...p };
  save();
}

export function toggleTableDish(id: string): void {
  const t = state.guest.table;
  state.guest.table = t.includes(id) ? t.filter((x) => x !== id) : [...t, id];
  save();
}

/* ---------- analytics ---------- */

export function track(name: string, props: Record<string, unknown> = {}): void {
  const e = { name, at: nowIso(), props: { restaurantId: state.restaurant.id, ...props } };
  state.events.push(e);
  if (state.events.length > 300) state.events.splice(0, state.events.length - 300);
}
