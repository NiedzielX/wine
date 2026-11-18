import type { Dish, Pairing, PairingRole, PairingStatus, Wine } from '../../domain/types';
import { DEFAULT_PREFS } from '../../domain/types';
import { DEFAULT_LIMIT, MIN_MODEL_SCORE, recommendForDish } from '../../engine/recommend';
import { pairingScore } from '../../engine/scoring';
import { NotFoundError } from '../../errors';
import type { Repositories } from '../../ports/repositories';
import { parseWith } from '../../validators/parse';
import { dishProfileSchema, wineProfileSchema } from '../../validators/catalog/profile.schema';

export type ProfilePreviewServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository'>;

/** One line of the table "how the match changes": the dish or wine on the other side of the pair. */
export interface PreviewRow {
  otherId: string;
  otherName: string;
  /** Match Score with the stored profile and with the candidate: both from `pairingScore`, nothing else */
  before: number;
  after: number;
  delta: number;
  /** the sommelier's decision on this pair in the working data, or null when there is none */
  pairing: { status: PairingStatus; role: PairingRole | null } | null;
}

export interface PreviewSummary {
  /** rows whose score changes */
  changedRows: number;
  /** approved or modified pairs whose score changes */
  changedPairs: number;
  /** of those, pairs whose score moves across `MIN_MODEL_SCORE` (either way) */
  crossingPairs: number;
}

/** What a guest would see on one screen: the wine ids (or dish ids) in the order of the screen, before and after. */
export interface PreviewGuestEntry { id: string; name: string; matchScore: number }

export interface DishPreview {
  kind: 'dish';
  subjectId: string;
  rows: PreviewRow[];
  /** the top `DEFAULT_LIMIT` of `recommendForDish` on the working pairings, before and after (R6) */
  guest: { before: PreviewGuestEntry[]; after: PreviewGuestEntry[] };
  summary: PreviewSummary;
  /** pairings with a decision that is not published yet: the preview is of the state after the next publish */
  unpublishedPairings: number;
}

export interface WinePreview {
  kind: 'wine';
  subjectId: string;
  rows: PreviewRow[];
  /** dishes where the wine enters, leaves or moves within the top `DEFAULT_LIMIT` of the recommendation */
  guest: Array<{ dishId: string; dishName: string; before: number | null; after: number | null }>;
  summary: PreviewSummary;
  unpublishedPairings: number;
}

const crosses = (a: number, b: number) => (a >= MIN_MODEL_SCORE) !== (b >= MIN_MODEL_SCORE);

function rowOf(otherId: string, otherName: string, before: number, after: number, pairing: Pairing | undefined): PreviewRow {
  return { otherId, otherName, before, after, delta: after - before, pairing: pairing ? { status: pairing.status, role: pairing.role } : null };
}

function summarize(rows: PreviewRow[]): PreviewSummary {
  const changed = rows.filter((r) => r.delta !== 0);
  const pairs = changed.filter((r) => r.pairing && (r.pairing.status === 'approved' || r.pairing.status === 'modified'));
  return { changedRows: changed.length, changedPairs: pairs.length, crossingPairs: pairs.filter((r) => crosses(r.before, r.after)).length };
}

/**
 * Preview of a profile change (spec 2026-11-04-panel-completion, R6, R7). A read: nothing is written, nothing is
 * scored here (every number is `pairingScore` or `recommendForDish`), no network, no clock, no randomness (N03).
 * It computes on the working pairings (Q13): "what will guests see after the next publish".
 */
export class ProfilePreviewService {
  private readonly d: ProfilePreviewServiceDeps;

  constructor(deps: ProfilePreviewServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  async previewDish(slug: string, dishId: string, candidate: unknown): Promise<DishPreview> {
    const scales = parseWith(dishProfileSchema, candidate, 'Check the profile.');
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    const [wines, pairings] = await Promise.all([
      this.d.wineRepository.listByRestaurant(r.id, { activeOnly: true }),
      this.d.pairingRepository.listByDish(r.id, dish.id)
    ]);
    const after: Dish = { ...dish, profile: { ...dish.profile, ...scales } };
    const byWine = new Map(pairings.map((p) => [p.wineId, p]));
    const rows = wines.map((w) => rowOf(w.id, w.name, pairingScore(dish, w).score, pairingScore(after, w).score, byWine.get(w.id)))
      .sort((a, b) => b.after - a.after || (a.otherId < b.otherId ? -1 : 1));
    const top = (d: Dish) => recommendForDish(d, wines, pairings, DEFAULT_PREFS, DEFAULT_LIMIT).items.map((i) => ({ id: i.wine.id, name: i.wine.name, matchScore: i.matchScore }));
    return {
      kind: 'dish', subjectId: dish.id, rows, guest: { before: top(dish), after: top(after) }, summary: summarize(rows),
      unpublishedPairings: pairings.filter((p) => p.dirty).length
    };
  }

  async previewWine(slug: string, wineId: string, candidate: unknown): Promise<WinePreview> {
    const scales = parseWith(wineProfileSchema, candidate, 'Check the profile.');
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    const [dishes, allWines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(r.id, { statuses: ['published'] }),
      this.d.wineRepository.listByRestaurant(r.id, { activeOnly: true }),
      this.d.pairingRepository.listByRestaurant(r.id)
    ]);
    const after: Wine = { ...wine, profile: { ...wine.profile, ...scales } };
    const byDish = new Map(pairings.filter((p) => p.wineId === wine.id).map((p) => [p.dishId, p]));
    const rows = dishes.map((dish) => rowOf(dish.id, dish.name, pairingScore(dish, wine).score, pairingScore(dish, after).score, byDish.get(dish.id)))
      .sort((a, b) => b.after - a.after || (a.otherId < b.otherId ? -1 : 1));
    const guest: WinePreview['guest'] = [];
    if (wine.active) {
      const rank = (dish: Dish, w: Wine) => {
        const items = recommendForDish(dish, allWines.map((x) => (x.id === w.id ? w : x)), pairings.filter((p) => p.dishId === dish.id), DEFAULT_PREFS, DEFAULT_LIMIT).items;
        const i = items.findIndex((x) => x.wine.id === w.id);
        return i < 0 ? null : i + 1;
      };
      for (const dish of dishes) {
        const b = rank(dish, wine);
        const a = rank(dish, after);
        if (a !== b) guest.push({ dishId: dish.id, dishName: dish.name, before: b, after: a });
      }
    }
    return { kind: 'wine', subjectId: wine.id, rows, guest, summary: summarize(rows), unpublishedPairings: pairings.filter((p) => p.wineId === wine.id && p.dirty).length };
  }
}

