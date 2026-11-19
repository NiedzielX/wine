import type { Actor } from '../../auth/types';
import { NotFoundError } from '../../errors';
import { PICKS_MAX } from '../../ranking/restaurant-picks';
import type { PickRecord, Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { readSnapshot } from '../publishing/snapshot';
import { picksVersion } from './picks-rules';

export type PicksServiceDeps = Pick<Repositories, 'restaurantRepository' | 'wineRepository' | 'picksRepository' | 'publishRepository'> & {
  clock: Clock;
  idGenerator: IdGenerator;
};

/** A pick of the working set with what the screen shows about the wine. */
export interface PickEntry extends PickRecord {
  producer: string;
  name: string;
  vintage: number | 'NV';
  /** the wine is in the set guests see now (the version they read) and it is active */
  published: boolean;
}

export interface PicksState {
  /** the fingerprint of the working set (what the next write sends back as `If-Match` / `expectedVersion`) */
  version: string;
  /** the most wines a restaurant may mark (`PICKS_MAX`) */
  max: number;
  /** the working set: every wine that is not deleted, active or not (an inactive one still takes a place), sorted by wine id */
  picks: PickEntry[];
}

export interface PickWriteResult {
  changed: boolean;
  /** the fingerprint of the working set as it is stored now */
  version: string;
}

export interface PickWriteOptions {
  /** the fingerprint of the working set the caller saw; another one is `version_conflict` */
  expectedVersion?: string;
}

/**
 * The restaurant's picks, the working set (spec 2026-11-18-restaurant-picks, R1 to R4). Reads need the dashboard
 * (`panel.view`: the Wine Director sees the set), the one command `set` is for `picks.edit` (owner and general manager);
 * the entry point checks the permission, as with every command. The change is written by the port atomically with its
 * `pick_edit` row and reaches guests only with the next publish. Wines are looked up under the restaurant the slug
 * names, so another restaurant's wine and an unknown one are the same `NotFoundError`.
 */
export class PicksService {
  private readonly d: PicksServiceDeps;

  constructor(deps: PicksServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  /** The working set with its fingerprint. NotFoundError for an unknown slug. */
  async list(slug: string): Promise<PicksState> {
    const r = await this.restaurant(slug);
    const [picks, wines, effective] = await Promise.all([
      this.d.picksRepository.list(r.id),
      this.d.wineRepository.listByRestaurant(r.id),
      this.d.publishRepository.effective(r.id)
    ]);
    const byId = new Map(wines.map((w) => [w.id, w]));
    const live = effective ? readSnapshot(effective.snapshot).picks : new Set<string>();
    return {
      version: picksVersion(picks.map((p) => p.wineId)),
      max: PICKS_MAX,
      picks: picks.flatMap((p) => {
        const w = byId.get(p.wineId);
        return w ? [{ ...p, producer: w.producer, name: w.name, vintage: w.vintage, published: p.active && live.has(p.wineId) }] : [];
      })
    };
  }

  /**
   * Marks (`on`) or unmarks a wine. Idempotent: asking for the state the wine is in is `{ changed: false }` with no
   * history row. NotFoundError for an unknown wine or another restaurant's; `wine_inactive` and `too_many_picks`
   * (ValidationError) when marking is not allowed; `version_conflict` for a stale `expectedVersion`.
   */
  async set(slug: string, wineId: string, on: boolean, actor: Actor, opts: PickWriteOptions = {}): Promise<PickWriteResult> {
    const r = await this.restaurant(slug);
    const result = await this.d.picksRepository.set(r.id, {
      wineId, enabled: on, editId: this.d.idGenerator.uuid(), actor: actor.name, actorId: actor.id,
      at: this.d.clock.now().toISOString(), max: PICKS_MAX, expectedVersion: opts.expectedVersion
    });
    const now = await this.d.picksRepository.list(r.id);
    return { changed: result.changed, version: picksVersion(now.map((p) => p.wineId)) };
  }
}
