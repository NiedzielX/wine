import { UniqueConstraintViolationException } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  ENGINE_VERSION, InvariantError, NotFoundError, VersionConflictError,
  type DishRepository, type EntityStatus, type Pairing, type PairingChangeSet, type PairingRepository, type PairingWriteRepository,
  type PublishedVersionInfo, type PublishRepository, type RestaurantDetails, type RestaurantRepository, type RestaurantSettings, type RestaurantWriteRepository,
  type WineRepository, type WineWriteRepository
} from '@wine-match/core';
import { DishEntity, PairingEntity, PublishedVersionEntity, RestaurantEntity, SommelierDecisionEntity, WineEntity, type PublishedSnapshot, type PublishedVersionRow } from '../entities';
import { translate } from './errors';
import { toDecision, toDish, toPairing, toPublishedPairing, toRestaurant, toWine } from '../mappers';

/**
 * PostgreSQL implementations of the @wine-match/core repository ports.
 * Each receives a request-scoped EntityManager (`em`) from the DI container and returns plain
 * domain objects — entities never leave this package.
 */
interface Deps { em: EntityManager }

const PUBLISHABLE = ['approved', 'modified', 'rejected'] as const;

export class PgRestaurantRepository implements RestaurantRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async findBySlug(slug: string) {
    const r = await this.em.findOne(RestaurantEntity, { slug });
    return r ? toRestaurant(r) : null;
  }
}

export class PgDishRepository implements DishRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async findById(restaurantId: string, dishId: string) {
    const d = await this.em.findOne(DishEntity, { id: dishId, restaurant: restaurantId, deletedAt: null });
    return d ? toDish(d) : null;
  }

  async listByRestaurant(restaurantId: string, opts: { statuses?: EntityStatus[] } = {}) {
    const rows = await this.em.find(
      DishEntity,
      { restaurant: restaurantId, deletedAt: null, ...(opts.statuses ? { status: { $in: opts.statuses } } : {}) },
      { orderBy: { sortOrder: 'asc', name: 'asc' } }
    );
    return rows.map(toDish);
  }
}

export class PgWineRepository implements WineRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async findById(restaurantId: string, wineId: string) {
    const w = await this.em.findOne(WineEntity, { id: wineId, restaurant: restaurantId, deletedAt: null });
    return w ? toWine(w) : null;
  }

  async listByRestaurant(restaurantId: string, opts: { activeOnly?: boolean } = {}) {
    const rows = await this.em.find(
      WineEntity,
      { restaurant: restaurantId, deletedAt: null, ...(opts.activeOnly ? { active: true } : {}) },
      { orderBy: { listNumber: 'asc', producer: 'asc' } }
    );
    return rows.map(toWine);
  }
}

async function latestVersion(em: EntityManager, restaurantId: string): Promise<PublishedVersionRow | null> {
  return em.findOne(PublishedVersionEntity, { restaurant: restaurantId }, { orderBy: { number: 'desc' } });
}

const toInfo = (v: PublishedVersionRow): PublishedVersionInfo => ({
  id: v.id, number: v.number, changesCount: v.changesCount, publishedBy: v.publishedBy, publishedAt: v.publishedAt.toISOString()
});

export class PgPairingRepository implements PairingRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async findById(restaurantId: string, pairingId: string) {
    const p = await this.em.findOne(PairingEntity, { id: pairingId, restaurant: restaurantId });
    return p ? toPairing(p) : null;
  }

  async listByRestaurant(restaurantId: string) {
    const rows = await this.em.find(PairingEntity, { restaurant: restaurantId }, { orderBy: { id: 'asc' } });
    return rows.map(toPairing);
  }

  async listByDish(restaurantId: string, dishId: string) {
    const rows = await this.em.find(PairingEntity, { restaurant: restaurantId, dish: dishId }, { orderBy: { id: 'asc' } });
    return rows.map(toPairing);
  }

  async listPublishedByRestaurant(restaurantId: string) {
    const v = await latestVersion(this.em, restaurantId);
    if (v) return v.snapshot.pairings.map(toPublishedPairing);
    // never published: guests see the current state (a new restaurant is not blocked on its first publish)
    const rows = await this.em.find(PairingEntity, { restaurant: restaurantId, status: { $in: [...PUBLISHABLE] } }, { orderBy: { id: 'asc' } });
    return rows.map(toPairing);
  }

  async listPublishedByDish(restaurantId: string, dishId: string) {
    return (await this.listPublishedByRestaurant(restaurantId)).filter((p) => p.dishId === dishId);
  }

  async listDecisions(restaurantId: string, filter: { pairingId?: string; dishId?: string } = {}, limit = 50) {
    const rows = await this.em.find(
      SommelierDecisionEntity,
      { restaurant: restaurantId, ...(filter.pairingId ? { pairingId: filter.pairingId } : {}), ...(filter.dishId ? { dishId: filter.dishId } : {}) },
      { orderBy: { createdAt: 'desc', id: 'desc' }, limit }
    );
    return rows.map(toDecision);
  }
}

export class PgPairingWriteRepository implements PairingWriteRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async commit(restaurantId: string, changes: PairingChangeSet): Promise<void> {
    try {
      // One transaction; each step is flushed on its own so the unique indexes (one primary per dish,
      // one pairing per dish and wine) are checked in the order the rules planned them.
      await this.em.transactional(async (em) => {
        for (const op of changes.ops) {
          if (op.kind === 'create') {
            const p = op.pairing;
            em.create(PairingEntity, {
              id: p.id, restaurant: em.getReference(RestaurantEntity, restaurantId), dish: em.getReference(DishEntity, p.dishId), wine: em.getReference(WineEntity, p.wineId),
              status: p.status, role: p.role, rank: p.rank, comment: p.comment, modelScore: p.modelScore, factors: null, engineVersion: ENGINE_VERSION,
              source: p.source, dirty: true, updatedBy: p.updatedBy, updatedAt: new Date(p.updatedAt)
            });
          } else {
            const e = await em.findOne(PairingEntity, { id: op.id, restaurant: restaurantId });
            if (!e) throw new NotFoundError('Pairing');
            if (op.expectedVersion !== undefined && e.version !== op.expectedVersion) throw new VersionConflictError();
            if (op.kind === 'delete') {
              em.remove(e);
            } else {
              const { patch } = op;
              if (patch.status !== undefined) e.status = patch.status;
              if (patch.role !== undefined) e.role = patch.role;
              if (patch.rank !== undefined) e.rank = patch.rank;
              if (patch.comment !== undefined) e.comment = patch.comment;
              e.dirty = true;
              e.updatedBy = patch.updatedBy;
              e.updatedAt = new Date(patch.updatedAt);
            }
          }
          await em.flush();
        }
        for (const d of changes.decisions) {
          em.create(SommelierDecisionEntity, {
            id: d.id, restaurant: em.getReference(RestaurantEntity, restaurantId), pairingId: d.pairingId, dishId: d.dishId, wineId: d.wineId,
            actor: d.actor, actorId: d.actorId, action: d.action, before: d.before, after: d.after, createdAt: new Date(d.at)
          });
        }
        await em.flush();
      });
    } catch (e) {
      throw translate(e);
    } finally {
      // a failed transaction leaves the identity map in an unknown state: start clean
      this.em.clear();
    }
  }

  async addSuggestions(restaurantId: string, pairings: Pairing[]): Promise<number> {
    if (pairings.length === 0) return 0;
    try {
      return await this.em.transactional(async (em) => {
        const existing = await em.find(PairingEntity, { restaurant: restaurantId, dish: { $in: [...new Set(pairings.map((p) => p.dishId))] } });
        const taken = new Set(existing.map((e) => `${e.dish.id}:${e.wine.id}`));
        let added = 0;
        for (const p of pairings) {
          const key = `${p.dishId}:${p.wineId}`;
          if (taken.has(key)) continue;
          taken.add(key);
          em.create(PairingEntity, {
            id: p.id, restaurant: em.getReference(RestaurantEntity, restaurantId), dish: em.getReference(DishEntity, p.dishId), wine: em.getReference(WineEntity, p.wineId),
            status: 'suggested', role: null, rank: null, comment: null, modelScore: p.modelScore, factors: null, engineVersion: ENGINE_VERSION, source: 'engine',
            dirty: false, updatedBy: p.updatedBy, updatedAt: new Date(p.updatedAt)
          });
          added++;
        }
        await em.flush();
        return added;
      });
    } catch (e) {
      throw translate(e);
    } finally {
      this.em.clear();
    }
  }
}

export class PgWineWriteRepository implements WineWriteRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async setActive(restaurantId: string, wineId: string, active: boolean) {
    const w = await this.em.findOne(WineEntity, { id: wineId, restaurant: restaurantId, deletedAt: null });
    if (!w) return null;
    w.active = active;
    await this.em.flush();
    return toWine(w);
  }
}

export class PgRestaurantWriteRepository implements RestaurantWriteRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async updateSettings(restaurantId: string, settings: RestaurantSettings) {
    const r = await this.em.findOne(RestaurantEntity, { id: restaurantId });
    if (!r) throw new NotFoundError('Restaurant');
    r.settings = { ...settings };
    await this.em.flush();
  }

  async updateDetails(restaurantId: string, details: RestaurantDetails) {
    const r = await this.em.findOne(RestaurantEntity, { id: restaurantId });
    if (!r) throw new NotFoundError('Restaurant');
    Object.assign(r, details);
    try {
      await this.em.flush();
    } catch (e) {
      if (e instanceof UniqueConstraintViolationException) throw new InvariantError('slug_taken', 'Another restaurant already uses this address name.');
      throw e;
    }
  }
}

export class PgPublishRepository implements PublishRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async latest(restaurantId: string) {
    const v = await latestVersion(this.em, restaurantId);
    return v ? toInfo(v) : null;
  }

  async pendingPairingChanges(restaurantId: string) {
    return countPending(this.em, restaurantId, (await latestVersion(this.em, restaurantId))?.publishedAt);
  }

  async publish(restaurantId: string, input: { actor: string; at: string; id: string }) {
    try {
      return await this.em.transactional(async (em) => {
        const restaurant = await em.findOneOrFail(RestaurantEntity, { id: restaurantId });
        const last = await latestVersion(em, restaurantId);
        const pending = await countPending(em, restaurantId, last?.publishedAt);
        const reviewed = await em.find(PairingEntity, { restaurant: restaurantId, status: { $in: [...PUBLISHABLE] } }, { orderBy: { id: 'asc' } });
        const drafts = await em.find(DishEntity, { restaurant: restaurantId, status: 'draft', deletedAt: null });
        const snapshot: PublishedSnapshot = {
          pairings: reviewed.map((p) => ({
            id: p.id, dishId: p.dish.id, wineId: p.wine.id, status: p.status as 'approved' | 'modified' | 'rejected', role: p.role ?? null, rank: p.rank ?? null,
            comment: p.comment ?? null, modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy, updatedAt: p.updatedAt.toISOString()
          }))
        };
        const version = em.create(PublishedVersionEntity, {
          id: input.id, restaurant, number: (last?.number ?? 0) + 1, snapshot, changesCount: pending + drafts.length,
          publishedBy: input.actor, publishedAt: new Date(input.at)
        });
        // a native update: clearing the flag must not count as a change of the pairing (no version bump)
        await em.nativeUpdate(PairingEntity, { restaurant: restaurantId, dirty: true }, { dirty: false });
        drafts.forEach((d) => { d.status = 'published'; });
        restaurant.publishedAt = new Date(input.at);
        await em.flush();
        return toInfo(version);
      });
    } finally {
      this.em.clear();
    }
  }
}

async function countPending(em: EntityManager, restaurantId: string, since: Date | undefined): Promise<number> {
  const rows = await em.getConnection().execute<Array<{ n: string }>>(
    'select count(distinct pairing_id)::text as n from sommelier_decision where restaurant_id = ? and created_at > ?',
    [restaurantId, since ?? new Date(0)]
  );
  return Number(rows[0]?.n ?? 0);
}

