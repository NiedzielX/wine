import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { LockMode, type EntityManager } from '@mikro-orm/postgresql';
import {
  ENGINE_VERSION, InvariantError, NotFoundError, VersionConflictError, contentSnapshot, currentContent, readContentSnapshot, sameTranslations,
  type ContentWriteRepository, type DishTranslations, type RestaurantContent, type WineTranslations,
  type DishRepository, type EntityStatus, type OpportunityDismissal, type OpportunityDismissalRepository, type Pairing, type PairingChangeSet, type PairingRepository, type PairingWriteRepository,
  type PublishedVersionInfo, type PublishRepository, type RestaurantDetails, type RestaurantRepository, type RestaurantSettings, type RestaurantWriteRepository,
  type WineRepository, type WineWriteRepository, type GuestInteractionInput, type GuestInteractionRepository, type UsageTotals,
  type RecommendationCodeInput, type RecommendationCodeRecord, type RecommendationCodeRepository, type ServiceDayPeriod
} from '@wine-match/core';
import {
  DishEntity, GuestInteractionEntity, OpportunityDismissalEntity, PairingEntity, PublishedVersionEntity, RestaurantEntity, SommelierDecisionEntity, WineEntity,
  type PublishedSnapshot, type PublishedVersionRow
} from '../entities';
import { translate } from './errors';
import { toRecommendationCode, type RecommendationCodeSqlRow } from '../mappers';
import { toDecision, toDish, toGuestInteraction, toOpportunityDismissal, toPairing, toPublishedPairing, toRestaurant, toWine } from '../mappers';

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
              status: p.status, role: p.role, rank: p.rank, comment: p.comment, commentTranslations: p.commentTranslations ?? {}, modelScore: p.modelScore, factors: null, engineVersion: ENGINE_VERSION,
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
              if (patch.commentTranslations !== undefined) e.commentTranslations = { ...patch.commentTranslations };
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

  async publishedContent(restaurantId: string) {
    const v = await latestVersion(this.em, restaurantId);
    if (v) return readContentSnapshot(v.snapshot.content);
    // never published: the current translations (like the pairings)
    const r = await this.em.findOne(RestaurantEntity, { id: restaurantId });
    if (!r) return readContentSnapshot(null);
    const [dishes, wines] = await Promise.all([
      this.em.find(DishEntity, { restaurant: restaurantId, deletedAt: null }),
      this.em.find(WineEntity, { restaurant: restaurantId, deletedAt: null })
    ]);
    return currentContent(toRestaurant(r), dishes.map(toDish), wines.map(toWine));
  }

  async publish(restaurantId: string, input: { actor: string; at: string; id: string; contentChanges?: number }) {
    try {
      return await this.em.transactional(async (em) => {
        const restaurant = await em.findOneOrFail(RestaurantEntity, { id: restaurantId });
        const last = await latestVersion(em, restaurantId);
        const pending = await countPending(em, restaurantId, last?.publishedAt);
        const reviewed = await em.find(PairingEntity, { restaurant: restaurantId, status: { $in: [...PUBLISHABLE] } }, { orderBy: { id: 'asc' } });
        const drafts = await em.find(DishEntity, { restaurant: restaurantId, status: 'draft', deletedAt: null });
        const [allDishes, allWines] = await Promise.all([
          em.find(DishEntity, { restaurant: restaurantId, deletedAt: null }, { orderBy: { id: 'asc' } }),
          em.find(WineEntity, { restaurant: restaurantId, deletedAt: null }, { orderBy: { id: 'asc' } })
        ]);
        const snapshot: PublishedSnapshot = {
          content: contentSnapshot(toRestaurant(restaurant), allDishes.map(toDish), allWines.map(toWine)),
          pairings: reviewed.map((p) => ({
            id: p.id, dishId: p.dish.id, wineId: p.wine.id, status: p.status as 'approved' | 'modified' | 'rejected', role: p.role ?? null, rank: p.rank ?? null,
            comment: p.comment ?? null, commentTranslations: { ...(p.commentTranslations ?? {}) }, modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy, updatedAt: p.updatedAt.toISOString()
          }))
        };
        const version = em.create(PublishedVersionEntity, {
          id: input.id, restaurant, number: (last?.number ?? 0) + 1, snapshot, changesCount: pending + drafts.length + (input.contentChanges ?? 0),
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

/**
 * Writes of translated content (spec 2026-10-15-bilingual-content). Each write locks the row (`FOR UPDATE`), compares
 * what is stored with what the caller saw and writes in the same transaction, so two editors cannot overwrite each other.
 */
export class PgContentWriteRepository implements ContentWriteRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async setDishTranslations(restaurantId: string, dishId: string, next: DishTranslations, expected?: DishTranslations) {
    try {
      await this.em.transactional(async (em) => {
        const d = await em.findOne(DishEntity, { id: dishId, restaurant: restaurantId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!d) throw new NotFoundError('Dish');
        if (expected !== undefined && !sameTranslations(d.translations ?? {}, expected)) throw new VersionConflictError();
        d.translations = { ...next };
        await em.flush();
      });
    } finally {
      this.em.clear();
    }
  }

  async setWineTranslations(restaurantId: string, wineId: string, next: WineTranslations, expected?: WineTranslations) {
    try {
      await this.em.transactional(async (em) => {
        const w = await em.findOne(WineEntity, { id: wineId, restaurant: restaurantId, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!w) throw new NotFoundError('Wine');
        if (expected !== undefined && !sameTranslations(w.translations ?? {}, expected)) throw new VersionConflictError();
        w.translations = { ...next };
        await em.flush();
      });
    } finally {
      this.em.clear();
    }
  }

  async setRestaurantContent(restaurantId: string, next: RestaurantContent, expected?: RestaurantContent) {
    try {
      await this.em.transactional(async (em) => {
        const r = await em.findOne(RestaurantEntity, { id: restaurantId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!r) throw new NotFoundError('Restaurant');
        if (expected !== undefined && !sameTranslations({ contentLocale: r.contentLocale, translations: r.translations ?? {} }, expected)) throw new VersionConflictError();
        r.contentLocale = next.contentLocale;
        r.translations = { ...next.translations };
        await em.flush();
      });
    } finally {
      this.em.clear();
    }
  }
}

/**
 * Ignored opportunities (spec 2026-10-16-sommelier-opportunities, R6). The upsert is one statement
 * (`insert … on conflict (restaurant_id, opportunity_key) do update`), so two people ignoring the same opportunity at
 * once leave one row with the later term. Reads bypass the identity map: rows are written with native statements.
 */
export class PgOpportunityDismissalRepository implements OpportunityDismissalRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async listActive(restaurantId: string, now: Date) {
    const rows = await this.em.find(
      OpportunityDismissalEntity,
      { restaurant: restaurantId, expiresAt: { $gt: now } },
      { orderBy: { expiresAt: 'asc', key: 'asc' }, disableIdentityMap: true }
    );
    return rows.map(toOpportunityDismissal);
  }

  async upsert(restaurantId: string, d: OpportunityDismissal) {
    await this.em.getConnection().execute(
      `insert into opportunity_dismissal (id, restaurant_id, opportunity_key, rule, dish_id, wine_id, dismissed_by, dismissed_by_id, dismissed_at, expires_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (restaurant_id, opportunity_key) do update
       set dismissed_by = excluded.dismissed_by, dismissed_by_id = excluded.dismissed_by_id, dismissed_at = excluded.dismissed_at, expires_at = excluded.expires_at`,
      [d.id, restaurantId, d.key, d.rule, d.dishId, d.wineId, d.dismissedBy, d.dismissedById, new Date(d.dismissedAt), new Date(d.expiresAt)]
    );
  }

  async remove(restaurantId: string, key: string) {
    return (await this.em.nativeDelete(OpportunityDismissalEntity, { restaurant: restaurantId, key })) > 0;
  }
}

/**
 * Usage events (spec 2026-10-15-guest-usage-events). `record` is one native multi-row insert and never flushes: the
 * write runs after the response (`after()`), on the request's EntityManager, and must not persist anything else
 * waiting in its identity map. The count is native SQL too.
 */
export class PgGuestInteractionRepository implements GuestInteractionRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  async record(restaurantId: string, events: GuestInteractionInput[]) {
    if (!events.length) return;
    await this.em.insertMany(GuestInteractionEntity, events.map((e) => ({
      restaurant: restaurantId, sessionId: e.sessionId, name: e.name, dishId: e.dishId ?? null, wineId: e.wineId ?? null,
      props: e.props, engineVersion: e.engineVersion, createdAt: e.createdAt
    })));
  }

  async listBySession(restaurantId: string, sessionId: string) {
    const rows = await this.em.find(GuestInteractionEntity, { restaurant: restaurantId, sessionId }, { orderBy: { id: 'asc' } });
    return rows.map(toGuestInteraction);
  }

  async countGuestSessions(restaurantId: string, range: { from: Date; to: Date }) {
    const rows = await this.em.getConnection().execute<Array<{ n: string }>>(
      `select count(distinct session_id)::text as n from guest_interaction
        where restaurant_id = ? and name = 'guest_session_started' and created_at >= ? and created_at < ?`,
      [restaurantId, range.from, range.to]
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** One statement over the window's rows (index `(restaurant_id, created_at)`); guest figures only for sessions started in it. */
  async usageTotals(restaurantId: string, range: { from: Date; to: Date }): Promise<UsageTotals> {
    const rows = await this.em.getConnection().execute<Array<Record<keyof UsageTotals, number>>>(
      `with ev as (
         select session_id, name, dish_id, props from guest_interaction
          where restaurant_id = ? and created_at >= ? and created_at < ?
       ),
       guest as (select distinct session_id from ev where name = 'guest_session_started'),
       viewed as (
         select distinct session_id, dish_id from ev
          where name = 'recommendations_viewed' and dish_id is not null and session_id in (select session_id from guest)
       ),
       selected as (
         select distinct session_id from ev
          where name = 'wine_selected' and props->>'context' = 'dish' and session_id in (select session_id from guest)
       ),
       lookups as (
         select distinct session_id, name, coalesce(dish_id::text, (props->'dishIds')::text) as subject from ev
          where name in ('staff_lookup', 'staff_table_lookup')
       )
       select (select count(*) from guest)::int as "sessions",
              (select count(*) from viewed)::int as "recommendationViews",
              (select count(distinct session_id) from viewed)::int as "sessionsWithViews",
              (select count(*) from (select distinct v.session_id from viewed v join selected s on s.session_id = v.session_id) x)::int as "sessionsWithSelection",
              (select count(*) from lookups)::int as "staffLookups"`,
      [restaurantId, range.from, range.to]
    );
    const r = rows[0];
    return {
      sessions: Number(r?.sessions ?? 0), recommendationViews: Number(r?.recommendationViews ?? 0), sessionsWithViews: Number(r?.sessionsWithViews ?? 0),
      sessionsWithSelection: Number(r?.sessionsWithSelection ?? 0), staffLookups: Number(r?.staffLookups ?? 0)
    };
  }
}

/** The columns of a recommendation as `toRecommendationCode` reads them (dates as text, so no time zone applies). */
const CODE_COLUMNS = `code, service_day::text as service_day, session_id, source, context, wine_id, dish_ids, serving,
  menu_version, tier, engine_version, issued_at, confirmed_at`;

/**
 * Recommendation codes (spec 2026-10-16-recommendation-code, R11). Native statements throughout, so the identity
 * map never holds a stale row. `tryIssue` is one `insert … on conflict do nothing returning`: a conflict on either
 * unique index (the code of the day, or the choice) inserts nothing, and a read by the choice key tells `existing`
 * from `code_taken`. POS matching (R9) needs `sales_record` (phase 3): `posMatched` is 0 until then.
 */
export class PgRecommendationCodeRepository implements RecommendationCodeRepository {
  private readonly em: EntityManager;
  constructor({ em }: Deps) { this.em = em; }

  private run<T>(sql: string, params: unknown[]) {
    return this.em.getConnection().execute<T[]>(sql, params);
  }

  async tryIssue(restaurantId: string, input: RecommendationCodeInput) {
    const inserted = await this.run<RecommendationCodeSqlRow>(
      `insert into recommendation_code (id, restaurant_id, service_day, code, session_id, source, context, wine_id, dish_ids, serving, menu_version, tier, engine_version, issued_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
       on conflict do nothing
       returning ${CODE_COLUMNS}`,
      [
        input.id, restaurantId, input.serviceDay, input.code, input.sessionId, input.source, input.context, input.wineId, JSON.stringify(input.dishIds),
        input.serving, input.menuVersion ? new Date(input.menuVersion) : null, input.tier, input.engineVersion, new Date(input.issuedAt)
      ]
    );
    if (inserted[0]) return { status: 'created' as const, record: toRecommendationCode(inserted[0]) };
    const existing = await this.run<RecommendationCodeSqlRow>(
      `select ${CODE_COLUMNS} from recommendation_code
        where restaurant_id = ? and service_day = ? and session_id = ? and wine_id = ? and serving = ? and dish_ids = ?::jsonb`,
      [restaurantId, input.serviceDay, input.sessionId, input.wineId, input.serving, JSON.stringify(input.dishIds)]
    );
    return existing[0] ? { status: 'existing' as const, record: toRecommendationCode(existing[0]) } : { status: 'code_taken' as const };
  }

  async findByCode(restaurantId: string, serviceDay: string, code: string): Promise<RecommendationCodeRecord | null> {
    const rows = await this.run<RecommendationCodeSqlRow>(
      `select ${CODE_COLUMNS} from recommendation_code where restaurant_id = ? and service_day = ? and code = ?`,
      [restaurantId, serviceDay, code]
    );
    return rows[0] ? toRecommendationCode(rows[0]) : null;
  }

  async setConfirmed(restaurantId: string, serviceDay: string, code: string, at: Date | null, by: string | null) {
    // R7: one statement; a second confirmation keeps the first time and author
    const rows = await this.run<RecommendationCodeSqlRow>(
      at === null
        ? `update recommendation_code set confirmed_at = null, confirmed_by = null
            where restaurant_id = ? and service_day = ? and code = ? returning ${CODE_COLUMNS}`
        : `update recommendation_code set confirmed_by = case when confirmed_at is null then ? else confirmed_by end, confirmed_at = coalesce(confirmed_at, ?)
            where restaurant_id = ? and service_day = ? and code = ? returning ${CODE_COLUMNS}`,
      at === null ? [restaurantId, serviceDay, code] : [by, at, restaurantId, serviceDay, code]
    );
    return rows[0] ? toRecommendationCode(rows[0]) : null;
  }

  async countBySession(restaurantId: string, serviceDay: string, sessionId: string) {
    const rows = await this.run<{ n: string }>(
      'select count(*)::text as n from recommendation_code where restaurant_id = ? and service_day = ? and session_id = ?',
      [restaurantId, serviceDay, sessionId]
    );
    return Number(rows[0]?.n ?? 0);
  }

  async pairStats(restaurantId: string, period: ServiceDayPeriod) {
    const rows = await this.run<{ dish_id: string; wine_id: string; context: 'dish' | 'table'; issued: string; confirmed: string }>(
      `select d.dish_id, r.wine_id, r.context, count(*)::text as issued, count(r.confirmed_at)::text as confirmed
         from recommendation_code r cross join lateral jsonb_array_elements_text(r.dish_ids) as d(dish_id)
        where r.restaurant_id = ? and r.service_day between ? and ? and r.context in ('dish', 'table')
        group by d.dish_id, r.wine_id, r.context`,
      [restaurantId, period.from, period.to]
    );
    return rows
      .map((r) => ({
        dishId: r.dish_id, wineId: r.wine_id, context: r.context, issued: Number(r.issued),
        staffConfirmed: Number(r.confirmed), posMatched: 0, ordered: Number(r.confirmed)
      }))
      .sort((a, b) => a.dishId.localeCompare(b.dishId) || a.wineId.localeCompare(b.wineId) || a.context.localeCompare(b.context));
  }

  async totals(restaurantId: string, period: ServiceDayPeriod) {
    const rows = await this.run<{ issued: string; confirmed: string }>(
      `select count(*)::text as issued, count(confirmed_at)::text as confirmed from recommendation_code
        where restaurant_id = ? and service_day between ? and ?`,
      [restaurantId, period.from, period.to]
    );
    const confirmed = Number(rows[0]?.confirmed ?? 0);
    return { issued: Number(rows[0]?.issued ?? 0), staffConfirmed: confirmed, posMatched: 0, ordered: confirmed };
  }

  async unmatchedPosCodes() {
    return 0;
  }

  async countUnmatched(restaurantId: string, pairs: Array<{ businessDate: string; code: string }>) {
    if (!pairs.length) return 0;
    const rows = await this.run<{ n: string }>(
      `select count(*)::text as n from (select distinct p.day, p.code from jsonb_to_recordset(?::jsonb) as p(day date, code text)) p
        where not exists (select 1 from recommendation_code r where r.restaurant_id = ? and r.service_day = p.day and r.code = p.code)`,
      [JSON.stringify(pairs.map((x) => ({ day: x.businessDate, code: x.code }))), restaurantId]
    );
    return Number(rows[0]?.n ?? 0);
  }
}

async function countPending(em: EntityManager, restaurantId: string, since: Date | undefined): Promise<number> {
  const rows = await em.getConnection().execute<Array<{ n: string }>>(
    'select count(distinct pairing_id)::text as n from sommelier_decision where restaurant_id = ? and created_at > ?',
    [restaurantId, since ?? new Date(0)]
  );
  return Number(rows[0]?.n ?? 0);
}

