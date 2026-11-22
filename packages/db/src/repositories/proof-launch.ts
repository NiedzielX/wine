import type { EntityManager } from '@mikro-orm/postgresql';
import { NotFoundError, checkLaunchAppend, type AppendLaunchDayInput, type ProofLaunchEntry, type ProofLaunchRepository } from '@wine-match/core';
import { ProofLaunchDayEntity, RestaurantEntity, type ProofLaunchDayRow } from '../entities';
import { isUuid } from './ids';
import { lockProofLaunch } from './locks';

interface Deps { em: EntityManager }

const toEntry = (r: ProofLaunchDayRow): ProofLaunchEntry => ({
  id: r.id, seq: r.seq, launchDay: String(r.launchDay), reason: r.reason ?? null, setByRole: r.setByRole, setByMembershipId: r.setByMembershipId ?? null, setAt: r.setAt.toISOString()
});

/**
 * The launch day log of the results report (spec 2026-11-18-owner-proof-report, R5). Append only: there is no update and
 * no delete here. `append` takes the log's advisory lock first, reads the newest row, applies `checkLaunchAppend` and
 * inserts the next `seq` in one transaction (lesson 2026-11-08-concurrency-tests-and-migration-roundtrip); the unique
 * `(restaurant_id, seq)` and the reason check of the table are the backstop. Every query is scoped by restaurant.
 */
export class PgProofLaunchRepository implements ProofLaunchRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async current(restaurantId: string): Promise<ProofLaunchEntry | null> {
    return (await this.read(restaurantId, 1))[0] ?? null;
  }

  async history(restaurantId: string): Promise<ProofLaunchEntry[]> {
    return this.read(restaurantId);
  }

  private async read(restaurantId: string, limit?: number): Promise<ProofLaunchEntry[]> {
    if (!isUuid(restaurantId)) return [];
    try {
      return (await this.em.find(ProofLaunchDayEntity, { restaurant: restaurantId }, { orderBy: { seq: 'desc' }, limit })).map(toEntry);
    } finally {
      this.em.clear();
    }
  }

  async append(restaurantId: string, input: AppendLaunchDayInput): Promise<ProofLaunchEntry> {
    if (!isUuid(restaurantId)) throw new NotFoundError('Restaurant');
    try {
      return await this.em.transactional(async (em) => {
        await lockProofLaunch(em, restaurantId);
        const restaurant = await em.findOne(RestaurantEntity, { id: restaurantId });
        if (!restaurant) throw new NotFoundError('Restaurant');
        const newest = (await em.find(ProofLaunchDayEntity, { restaurant: restaurantId }, { orderBy: { seq: 'desc' }, limit: 1 }))[0];
        const reason = checkLaunchAppend(newest ? toEntry(newest) : null, input);
        const row = em.create(ProofLaunchDayEntity, {
          id: input.id, restaurant, seq: (newest?.seq ?? 0) + 1, launchDay: input.launchDay, reason, setByRole: input.setByRole,
          setByMembershipId: input.setByMembershipId, setAt: new Date(input.at)
        });
        await em.flush();
        return toEntry(row);
      });
    } finally {
      this.em.clear();
    }
  }
}
