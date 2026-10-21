import type { AuthUser, Membership, SessionRecord } from '../auth/types';
import type { DemoDataset } from '../demo/dataset';
import type { Dish, EntityStatus, GuestInteraction, OpportunityDismissal, PairCodeStats, Pairing, RecommendationCodeRecord, Restaurant, RestaurantSettings, Wine } from '../domain/types';
import { InvariantError, NotFoundError, VersionConflictError } from '../errors';
import {
  contentSnapshot, currentContent, readContentSnapshot, sameTranslations,
  type ContentSnapshot, type DishTranslations, type WineTranslations
} from '../i18n/content';
import type { ImportJob } from '../import/types';
import type { AuthRepository } from '../ports/auth';
import type { CatalogImportPlan, ImportPlan, ImportRepository, SalesImportPlan } from '../ports/import';
import type { SalesRepository } from '../ports/sales';
import { aggregateChecks } from '../services/sales/sales-kpis';
import type { CheckKey, SalesPeriod, SalesRecord } from '../services/sales/types';
import type {
  ContentWriteRepository, DecisionRecord, DishRepository, GuestInteractionInput, GuestInteractionRepository, OpportunityDismissalRepository, RecommendationCodeInput, RecommendationCodeRepository, ServiceDayPeriod, PairingChangeSet, PairingRepository, PairingWriteRepository, PublishedVersionInfo,
  PublishRepository, Repositories, RestaurantContent, RestaurantDetails, RestaurantRepository, RestaurantWriteRepository, UsageTotals, PairingStat, PairingStatSource, WineRepository, WineWriteRepository
} from '../ports/repositories';

/** `content` is null for a version published before translations existed (read as `{}`). */
interface StoredVersion { info: PublishedVersionInfo; pairings: Pairing[]; content: ContentSnapshot | null }

const isReviewed = (p: Pairing) => p.status === 'approved' || p.status === 'modified';
/** What a published version keeps: the decisions guests need (reviewed and rejected pairings). */
const publishable = (p: Pairing) => isReviewed(p) || p.status === 'rejected';
const copy = <T>(x: T): T => structuredClone(x);

interface StoredCode { restaurantId: string; id: string; record: RecommendationCodeRecord; confirmedBy: string | null }

/** A sales line as `sales_record` keeps it: the line plus its restaurant, its import and when it was replaced. */
interface StoredSalesLine extends SalesRecord {
  restaurantId: string;
  importJobId: string;
  replacedAt: string | null;
  replacedByJobId: string | null;
}

/** In-memory data store. Tenant-scoped like the database: every record belongs to one restaurant. */
export class MemoryStore {
  readonly restaurants: Restaurant[] = [];
  readonly dishes = new Map<string, Dish[]>();
  readonly wines = new Map<string, Wine[]>();
  readonly pairings = new Map<string, Pairing[]>();
  readonly versions = new Map<string, StoredVersion[]>();
  readonly decisions: Array<DecisionRecord & { restaurantId: string }> = [];
  readonly users: AuthUser[] = [];
  readonly memberships: Array<Membership & { userId: string }> = [];
  readonly sessions: SessionRecord[] = [];
  readonly importJobs: ImportJob[] = [];
  /** ignored opportunities per restaurant, keyed by the opportunity key (a client-chosen string: a Map, never a plain object) */
  readonly dismissals = new Map<string, Map<string, OpportunityDismissal>>();
  /** usage events, oldest first; capped at `MAX_MEMORY_GUEST_EVENTS` (the oldest go first) */
  readonly guestInteractions: Array<GuestInteractionInput & { restaurantId: string }> = [];
  /** recommendation codes, oldest first; capped at `MAX_MEMORY_RECOMMENDATION_CODES` (the oldest go first) */
  readonly recommendationCodes: StoredCode[] = [];
  /** imported sales lines (the demo data has none); replaced lines stay, marked with `replacedAt` */
  readonly salesLines: StoredSalesLine[] = [];

  static from(...datasets: DemoDataset[]): MemoryStore {
    const s = new MemoryStore();
    for (const d of datasets) {
      const id = d.restaurant.id;
      s.restaurants.push(copy(d.restaurant));
      s.dishes.set(id, copy(d.dishes));
      s.wines.set(id, copy(d.wines));
      for (const u of d.users) {
        s.users.push({ id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash, failedAttempts: 0, lockedUntil: null, lastLoginAt: null });
        s.memberships.push({ userId: u.id, restaurantId: id, restaurantSlug: d.restaurant.slug, restaurantName: d.restaurant.name, role: u.role });
      }
      const pairings = copy(d.pairings).map((p) => ({ ...p, version: 1 }));
      s.pairings.set(id, pairings);
      // version 1 is the state the demo restaurant was published in
      s.versions.set(id, [{
        info: { id: `${id}:v1`, number: 1, changesCount: 0, publishedBy: d.restaurant.wineDirector, publishedAt: d.restaurant.publishedAt ?? '1970-01-01T00:00:00.000Z' },
        pairings: pairings.filter(publishable).map((p) => ({ ...p, dirty: false, version: undefined })),
        content: contentSnapshot(d.restaurant, d.dishes, d.wines)
      }]);
    }
    return s;
  }

  latest(restaurantId: string): StoredVersion | undefined {
    const v = this.versions.get(restaurantId) ?? [];
    return v[v.length - 1];
  }
}

export class MemoryRestaurantRepository implements RestaurantRepository {
  constructor(private readonly store: MemoryStore) {}
  async findBySlug(slug: string) {
    const r = this.store.restaurants.find((x) => x.slug === slug);
    return r ? copy(r) : null;
  }
}

export class MemoryDishRepository implements DishRepository {
  constructor(private readonly store: MemoryStore) {}
  async findById(restaurantId: string, dishId: string) {
    const d = (this.store.dishes.get(restaurantId) ?? []).find((x) => x.id === dishId);
    return d ? copy(d) : null;
  }
  async listByRestaurant(restaurantId: string, opts: { statuses?: EntityStatus[] } = {}) {
    return copy((this.store.dishes.get(restaurantId) ?? []).filter((d) => !opts.statuses || opts.statuses.includes(d.status)));
  }
}

export class MemoryWineRepository implements WineRepository {
  constructor(private readonly store: MemoryStore) {}
  async findById(restaurantId: string, wineId: string) {
    const w = (this.store.wines.get(restaurantId) ?? []).find((x) => x.id === wineId);
    return w ? copy(w) : null;
  }
  async listByRestaurant(restaurantId: string, opts: { activeOnly?: boolean } = {}) {
    return copy((this.store.wines.get(restaurantId) ?? []).filter((w) => !opts.activeOnly || w.active));
  }
}

export class MemoryPairingRepository implements PairingRepository {
  constructor(private readonly store: MemoryStore) {}
  async findById(restaurantId: string, pairingId: string) {
    const p = (this.store.pairings.get(restaurantId) ?? []).find((x) => x.id === pairingId);
    return p ? copy(p) : null;
  }
  async listByRestaurant(restaurantId: string) {
    return copy(this.store.pairings.get(restaurantId) ?? []);
  }
  async listByDish(restaurantId: string, dishId: string) {
    return copy((this.store.pairings.get(restaurantId) ?? []).filter((p) => p.dishId === dishId));
  }
  async listPublishedByRestaurant(restaurantId: string) {
    const v = this.store.latest(restaurantId);
    return v ? copy(v.pairings) : copy((this.store.pairings.get(restaurantId) ?? []).filter(publishable));
  }
  async listPublishedByDish(restaurantId: string, dishId: string) {
    return (await this.listPublishedByRestaurant(restaurantId)).filter((p) => p.dishId === dishId);
  }
  async listDecisions(restaurantId: string, filter: { pairingId?: string; dishId?: string } = {}, limit = 50) {
    return this.store.decisions
      .filter((d) => d.restaurantId === restaurantId && (!filter.pairingId || d.pairingId === filter.pairingId) && (!filter.dishId || d.dishId === filter.dishId))
      .map(({ restaurantId: _r, ...d }) => copy(d))
      .reverse()
      .slice(0, limit);
  }
}

export class MemoryPairingWriteRepository implements PairingWriteRepository {
  constructor(private readonly store: MemoryStore) {}

  async commit(restaurantId: string, changes: PairingChangeSet): Promise<void> {
    const current = this.store.pairings.get(restaurantId);
    if (!current) throw new NotFoundError('Restaurant');
    // work on a copy: the store changes only if every step and the final invariants hold
    const work = copy(current);
    for (const op of changes.ops) {
      if (op.kind === 'create') {
        work.push({ ...copy(op.pairing), dirty: true, version: 1 });
        continue;
      }
      const i = work.findIndex((p) => p.id === op.id);
      if (i < 0) throw new NotFoundError('Pairing');
      if (op.expectedVersion !== undefined && work[i].version !== op.expectedVersion) throw new VersionConflictError();
      if (op.kind === 'delete') {
        work.splice(i, 1);
      } else {
        Object.assign(work[i], op.patch, { dirty: true, version: (work[i].version ?? 1) + 1 });
      }
    }
    assertInvariants(work);
    this.store.pairings.set(restaurantId, work);
    for (const d of changes.decisions) this.store.decisions.push({ ...copy(d), restaurantId });
  }

  async addSuggestions(restaurantId: string, pairings: Pairing[]): Promise<number> {
    const list = this.store.pairings.get(restaurantId);
    if (!list) throw new NotFoundError('Restaurant');
    const taken = new Set(list.map((p) => `${p.dishId}:${p.wineId}`));
    let added = 0;
    for (const p of pairings) {
      const key = `${p.dishId}:${p.wineId}`;
      if (taken.has(key)) continue;
      taken.add(key);
      list.push({ ...copy(p), status: 'suggested', role: null, rank: null, dirty: false, version: 1 });
      added++;
    }
    return added;
  }
}

/** The same two rules the database enforces with unique indexes. */
function assertInvariants(pairings: Pairing[]): void {
  const primary = new Set<string>();
  const pairs = new Set<string>();
  for (const p of pairings) {
    const key = `${p.dishId}:${p.wineId}`;
    if (pairs.has(key)) throw new InvariantError('duplicate_pairing', 'A dish and a wine can be paired only once.');
    pairs.add(key);
    if (isReviewed(p) && p.role === 'primary') {
      if (primary.has(p.dishId)) throw new InvariantError('multiple_primary', 'A dish can have only one primary pairing.');
      primary.add(p.dishId);
    }
  }
}

export class MemoryWineWriteRepository implements WineWriteRepository {
  constructor(private readonly store: MemoryStore) {}
  async setActive(restaurantId: string, wineId: string, active: boolean) {
    const w = (this.store.wines.get(restaurantId) ?? []).find((x) => x.id === wineId);
    if (!w) return null;
    w.active = active;
    return copy(w);
  }
}

export class MemoryRestaurantWriteRepository implements RestaurantWriteRepository {
  constructor(private readonly store: MemoryStore) {}
  async updateSettings(restaurantId: string, settings: RestaurantSettings) {
    const r = this.store.restaurants.find((x) => x.id === restaurantId);
    if (!r) throw new NotFoundError('Restaurant');
    r.settings = { ...settings };
  }

  async updateDetails(restaurantId: string, details: RestaurantDetails) {
    const r = this.store.restaurants.find((x) => x.id === restaurantId);
    if (!r) throw new NotFoundError('Restaurant');
    if (this.store.restaurants.some((x) => x.id !== restaurantId && x.slug === details.slug)) throw new InvariantError('slug_taken', 'Another restaurant already uses this address name.');
    Object.assign(r, details);
    // memberships carry a copy of the restaurant's slug and name (the database joins them instead)
    for (const m of this.store.memberships) if (m.restaurantId === restaurantId) { m.restaurantSlug = details.slug; m.restaurantName = details.name; }
  }
}

export class MemoryPublishRepository implements PublishRepository {
  constructor(private readonly store: MemoryStore) {}

  async latest(restaurantId: string) {
    const v = this.store.latest(restaurantId);
    return v ? { ...v.info } : null;
  }

  async pendingPairingChanges(restaurantId: string) {
    const since = this.store.latest(restaurantId)?.info.publishedAt ?? '';
    return new Set(this.store.decisions.filter((d) => d.restaurantId === restaurantId && d.at > since).map((d) => d.pairingId)).size;
  }

  async publishedContent(restaurantId: string) {
    const v = this.store.latest(restaurantId);
    if (v) return readContentSnapshot(v.content);
    const r = this.store.restaurants.find((x) => x.id === restaurantId);
    return r ? currentContent(r, this.store.dishes.get(restaurantId) ?? [], this.store.wines.get(restaurantId) ?? []) : readContentSnapshot(null);
  }

  async publish(restaurantId: string, input: { actor: string; at: string; id: string; contentChanges?: number }) {
    const pairings = this.store.pairings.get(restaurantId);
    const restaurant = this.store.restaurants.find((r) => r.id === restaurantId);
    if (!pairings || !restaurant) throw new NotFoundError('Restaurant');
    const drafts = (this.store.dishes.get(restaurantId) ?? []).filter((d) => d.status === 'draft');
    const info: PublishedVersionInfo = {
      id: input.id, number: (this.store.latest(restaurantId)?.info.number ?? 0) + 1,
      changesCount: (await this.pendingPairingChanges(restaurantId)) + drafts.length + (input.contentChanges ?? 0), publishedBy: input.actor, publishedAt: input.at
    };
    const list = this.store.versions.get(restaurantId) ?? [];
    const content = contentSnapshot(restaurant, this.store.dishes.get(restaurantId) ?? [], this.store.wines.get(restaurantId) ?? []);
    list.push({ info, pairings: copy(pairings.filter(publishable)).map((p) => ({ ...p, dirty: false, version: undefined })), content });
    this.store.versions.set(restaurantId, list);
    pairings.forEach((p) => { p.dirty = false; });
    drafts.forEach((d) => { d.status = 'published'; });
    restaurant.publishedAt = input.at;
    return { ...info };
  }
}

export class MemoryContentWriteRepository implements ContentWriteRepository {
  constructor(private readonly store: MemoryStore) {}

  async setDishTranslations(restaurantId: string, dishId: string, next: DishTranslations, expected?: DishTranslations) {
    const d = (this.store.dishes.get(restaurantId) ?? []).find((x) => x.id === dishId);
    if (!d) throw new NotFoundError('Dish');
    if (expected !== undefined && !sameTranslations(d.translations, expected)) throw new VersionConflictError();
    d.translations = copy(next);
  }

  async setWineTranslations(restaurantId: string, wineId: string, next: WineTranslations, expected?: WineTranslations) {
    const w = (this.store.wines.get(restaurantId) ?? []).find((x) => x.id === wineId);
    if (!w) throw new NotFoundError('Wine');
    if (expected !== undefined && !sameTranslations(w.translations, expected)) throw new VersionConflictError();
    w.translations = copy(next);
  }

  async setRestaurantContent(restaurantId: string, next: RestaurantContent, expected?: RestaurantContent) {
    const r = this.store.restaurants.find((x) => x.id === restaurantId);
    if (!r) throw new NotFoundError('Restaurant');
    if (expected !== undefined && !sameTranslations({ contentLocale: r.contentLocale, translations: r.translations }, expected)) throw new VersionConflictError();
    r.contentLocale = next.contentLocale;
    r.translations = copy(next.translations);
  }
}

export class MemoryAuthRepository implements AuthRepository {
  constructor(private readonly store: MemoryStore) {}

  async findUserByEmail(email: string) {
    const u = this.store.users.find((x) => x.email === email);
    return u ? copy(u) : null;
  }

  async membershipsOf(userId: string): Promise<Membership[]> {
    return this.store.memberships.filter((m) => m.userId === userId).map(({ userId: _u, ...m }) => copy(m));
  }

  async registerFailedLogin(userId: string, input: { maxAttempts: number; lockMs: number; now: string }) {
    const u = this.store.users.find((x) => x.id === userId);
    if (!u) return { attempts: 0, lockedUntil: null };
    const expired = !!u.lockedUntil && Date.parse(u.lockedUntil) <= Date.parse(input.now);
    const attempts = (expired ? 0 : u.failedAttempts) + 1;
    u.failedAttempts = attempts;
    u.lockedUntil = attempts >= input.maxAttempts ? new Date(Date.parse(input.now) + input.lockMs).toISOString() : expired ? null : u.lockedUntil;
    return { attempts, lockedUntil: u.lockedUntil };
  }

  async registerSuccessfulLogin(userId: string, at: string) {
    const u = this.store.users.find((x) => x.id === userId);
    if (u) { u.failedAttempts = 0; u.lockedUntil = null; u.lastLoginAt = at; }
  }

  async createSession(session: SessionRecord) {
    this.store.sessions.push(copy(session));
  }

  async findSession(tokenHash: string) {
    const session = this.store.sessions.find((s) => s.tokenHash === tokenHash);
    const user = session && this.store.users.find((u) => u.id === session.userId);
    return session && user ? { session: copy(session), user: copy(user) } : null;
  }

  async deleteSession(tokenHash: string) {
    const i = this.store.sessions.findIndex((s) => s.tokenHash === tokenHash);
    if (i >= 0) this.store.sessions.splice(i, 1);
  }

  async updatePasswordHash(userId: string, passwordHash: string) {
    const u = this.store.users.find((x) => x.id === userId);
    if (u) u.passwordHash = passwordHash;
  }

  async deleteExpiredSessions(now: string) {
    const before = this.store.sessions.length;
    const keep = this.store.sessions.filter((s) => Date.parse(s.expiresAt) > Date.parse(now));
    this.store.sessions.splice(0, before, ...keep);
    return before - keep.length;
  }
}

export class MemoryImportRepository implements ImportRepository {
  constructor(private readonly store: MemoryStore) {}

  private job(restaurantId: string, id: string) {
    return this.store.importJobs.find((j) => j.restaurantId === restaurantId && j.id === id);
  }

  async create(job: ImportJob) {
    this.store.importJobs.push(copy(job));
  }

  async find(restaurantId: string, jobId: string) {
    const j = this.job(restaurantId, jobId);
    return j ? copy(j) : null;
  }

  async listRecent(restaurantId: string, limit: number) {
    return copy(this.store.importJobs.filter((j) => j.restaurantId === restaurantId).reverse().slice(0, limit));
  }

  async saveRows(restaurantId: string, jobId: string, rows: ImportJob['rows']) {
    const j = this.job(restaurantId, jobId);
    if (!j || j.status !== 'preview_ready') return false;
    j.rows = copy(rows);
    return true;
  }

  async cancel(restaurantId: string, jobId: string) {
    const j = this.job(restaurantId, jobId);
    if (!j || j.status !== 'preview_ready') return false;
    j.status = 'cancelled';
    return true;
  }

  async confirm(restaurantId: string, jobId: string, plan: ImportPlan, at: string) {
    const j = this.job(restaurantId, jobId);
    if (!j) throw new NotFoundError('Import');
    if (j.status !== 'preview_ready') throw new InvariantError('job_closed', 'This import is already finished.');
    if (plan.kind === 'sales') return this.confirmSales(restaurantId, j, plan, at);
    this.confirmCatalog(restaurantId, plan);
    Object.assign(j, { status: 'confirmed', confirmedAt: at, result: copy(plan.result) });
    return { replacedChecks: 0 };
  }

  /** Q4: the active lines of the same checks are marked replaced by this job, then the new lines are added. */
  private confirmSales(restaurantId: string, j: ImportJob, plan: SalesImportPlan, at: string) {
    const keys = new Set(plan.checks.map((k: CheckKey) => `${k.businessDate}|${k.checkId}`));
    const replaced = new Set<string>();
    for (const l of this.store.salesLines) {
      const key = `${l.businessDate}|${l.checkId}`;
      if (l.restaurantId !== restaurantId || l.replacedAt !== null || !keys.has(key)) continue;
      l.replacedAt = at;
      l.replacedByJobId = j.id;
      replaced.add(key);
    }
    this.store.salesLines.push(...plan.records.map((r) => ({ ...copy(r), restaurantId, importJobId: j.id, replacedAt: null, replacedByJobId: null })));
    Object.assign(j, { status: 'confirmed', confirmedAt: at, result: { ...copy(plan.result), replaced: replaced.size } });
    return { replacedChecks: replaced.size };
  }

  private confirmCatalog(restaurantId: string, plan: CatalogImportPlan) {
    // all or nothing: work on copies, replace the store's lists only when everything applied
    const dishes = copy(this.store.dishes.get(restaurantId) ?? []);
    const wines = copy(this.store.wines.get(restaurantId) ?? []);
    const pairings = copy(this.store.pairings.get(restaurantId) ?? []);
    for (const u of plan.dishUpdates) {
      const d = dishes.find((x) => x.id === u.id);
      if (!d) throw new NotFoundError('Dish');
      Object.assign(d, { description: u.description, category: u.category, price: u.price });
      if (u.translations) d.translations = copy(u.translations);
    }
    for (const u of plan.wineUpdates) {
      const w = wines.find((x) => x.id === u.id);
      if (!w) throw new NotFoundError('Wine');
      Object.assign(w, { glassPrice: u.glassPrice, bottlePrice: u.bottlePrice });
      if (u.translations) w.translations = copy(u.translations);
    }
    dishes.push(...copy(plan.newDishes));
    wines.push(...copy(plan.newWines));
    pairings.push(...copy(plan.newPairings).map((p) => ({ ...p, dirty: false, version: 1 })));
    assertInvariants(pairings);
    this.store.dishes.set(restaurantId, dishes);
    this.store.wines.set(restaurantId, wines);
    this.store.pairings.set(restaurantId, pairings);
  }
}

/** Sales lines in memory (spec 2026-10-15-pos-sales-import-attach-rate): the same sums as the SQL `GROUP BY`. */
export class MemorySalesRepository implements SalesRepository {
  constructor(private readonly store: MemoryStore) {}

  private active(restaurantId: string) {
    return this.store.salesLines.filter((l) => l.restaurantId === restaurantId && l.replacedAt === null);
  }

  async checkTotals(restaurantId: string, period: SalesPeriod) {
    const lines = this.active(restaurantId).filter((l) => l.businessDate >= period.from && l.businessDate <= period.to);
    // byte order, as PostgreSQL's `collate "C"`
    const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    return aggregateChecks(lines).sort((a, b) => cmp(a.businessDate, b.businessDate) || cmp(a.checkId, b.checkId));
  }

  async dataRange(restaurantId: string): Promise<SalesPeriod | null> {
    const days = this.active(restaurantId).map((l) => l.businessDate).sort();
    return days.length ? { from: days[0], to: days[days.length - 1] } : null;
  }

  async countChecks(restaurantId: string, keys: CheckKey[]) {
    const wanted = new Set(keys.map((k) => `${k.businessDate}|${k.checkId}`));
    return new Set(this.active(restaurantId).map((l) => `${l.businessDate}|${l.checkId}`).filter((k) => wanted.has(k))).size;
  }
}

export class MemoryOpportunityDismissalRepository implements OpportunityDismissalRepository {
  constructor(private readonly store: MemoryStore) {}

  async listActive(restaurantId: string, now: Date) {
    const at = now.getTime();
    return [...(this.store.dismissals.get(restaurantId)?.values() ?? [])]
      .filter((d) => Date.parse(d.expiresAt) > at)
      .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt) || a.key.localeCompare(b.key))
      .map(copy);
  }

  async upsert(restaurantId: string, dismissal: OpportunityDismissal) {
    let rows = this.store.dismissals.get(restaurantId);
    if (!rows) this.store.dismissals.set(restaurantId, (rows = new Map()));
    const existing = rows.get(dismissal.key);
    rows.set(dismissal.key, existing
      ? { ...existing, dismissedBy: dismissal.dismissedBy, dismissedById: dismissal.dismissedById, dismissedAt: dismissal.dismissedAt, expiresAt: dismissal.expiresAt }
      : copy(dismissal));
  }

  async remove(restaurantId: string, key: string) {
    return this.store.dismissals.get(restaurantId)?.delete(key) ?? false;
  }
}

/** The in-memory data source keeps this many usage events at most (R7): a demo server must not grow without bound. */
export const MAX_MEMORY_GUEST_EVENTS = 10_000;

export class MemoryGuestInteractionRepository implements GuestInteractionRepository {
  constructor(private readonly store: MemoryStore) {}

  async record(restaurantId: string, events: GuestInteractionInput[]) {
    const list = this.store.guestInteractions;
    for (const e of events) list.push({ ...copy(e), restaurantId });
    if (list.length > MAX_MEMORY_GUEST_EVENTS) list.splice(0, list.length - MAX_MEMORY_GUEST_EVENTS);
  }

  async listBySession(restaurantId: string, sessionId: string): Promise<GuestInteraction[]> {
    return this.store.guestInteractions
      .filter((e) => e.restaurantId === restaurantId && e.sessionId === sessionId)
      .map((e) => ({
        sessionId: e.sessionId, name: e.name, dishId: e.dishId ?? null, wineId: e.wineId ?? null,
        props: copy(e.props), engineVersion: e.engineVersion, createdAt: e.createdAt.toISOString()
      }));
  }

  async countGuestSessions(restaurantId: string, range: { from: Date; to: Date }) {
    const from = range.from.getTime();
    const to = range.to.getTime();
    const sessions = new Set<string>();
    for (const e of this.store.guestInteractions) {
      const at = e.createdAt.getTime();
      if (e.restaurantId === restaurantId && e.name === 'guest_session_started' && at >= from && at < to) sessions.add(e.sessionId);
    }
    return sessions.size;
  }

  async usageTotals(restaurantId: string, range: { from: Date; to: Date }): Promise<UsageTotals> {
    const from = range.from.getTime();
    const to = range.to.getTime();
    const inWindow = this.store.guestInteractions.filter((e) => {
      const at = e.createdAt.getTime();
      return e.restaurantId === restaurantId && at >= from && at < to;
    });
    const guest = new Set(inWindow.filter((e) => e.name === 'guest_session_started').map((e) => e.sessionId));
    const views = new Set<string>();
    const withViews = new Set<string>();
    const withDishSelection = new Set<string>();
    const lookups = new Set<string>();
    for (const e of inWindow) {
      if (e.name === 'staff_lookup' || e.name === 'staff_table_lookup') {
        lookups.add(JSON.stringify([e.sessionId, e.name, e.dishId ?? null, e.dishId ? null : e.props.dishIds ?? null]));
      }
      if (!guest.has(e.sessionId)) continue;
      if (e.name === 'recommendations_viewed' && e.dishId) {
        views.add(`${e.sessionId}|${e.dishId}`);
        withViews.add(e.sessionId);
      }
      if (e.name === 'wine_selected' && e.props.context === 'dish') withDishSelection.add(e.sessionId);
    }
    return {
      sessions: guest.size,
      recommendationViews: views.size,
      sessionsWithViews: withViews.size,
      sessionsWithSelection: [...withViews].filter((s) => withDishSelection.has(s)).length,
      staffLookups: lookups.size
    };
  }

  async pairingStats(restaurantId: string, range: { from: Date; to: Date }): Promise<PairingStat[]> {
    const from = range.from.getTime();
    const to = range.to.getTime();
    const inWindow = this.store.guestInteractions.filter((e) => {
      const at = e.createdAt.getTime();
      return e.restaurantId === restaurantId && at >= from && at < to;
    });
    const guest = new Set(inWindow.filter((e) => e.name === 'guest_session_started').map((e) => e.sessionId));
    const key = (...parts: string[]) => JSON.stringify(parts);
    // (session, dish, wine) → source of the latest view; events are in write order, so a later one wins a tie
    const latest = new Map<string, { at: number; source: PairingStatSource; sessionId: string; dishId: string; wineId: string }>();
    const selected = new Set<string>();
    for (const e of inWindow) {
      if (!guest.has(e.sessionId) || !e.dishId) continue;
      if (e.name === 'wine_selected' && e.wineId && e.props.context === 'dish') selected.add(key(e.sessionId, e.dishId, e.wineId));
      if (e.name !== 'recommendations_viewed' || !Array.isArray(e.props.items)) continue;
      const at = e.createdAt.getTime();
      for (const item of e.props.items as unknown[]) {
        const wineId = typeof item === 'object' && item !== null ? (item as { wineId?: unknown }).wineId : undefined;
        const source = statSource(typeof item === 'object' && item !== null ? (item as { tier?: unknown }).tier : undefined);
        if (typeof wineId !== 'string' || !source) continue;
        const k = key(e.sessionId, e.dishId, wineId);
        const prev = latest.get(k);
        if (!prev || at >= prev.at) latest.set(k, { at, source, sessionId: e.sessionId, dishId: e.dishId, wineId });
      }
    }
    const rows = new Map<string, PairingStat>();
    for (const [k, v] of latest) {
      const rowKey = key(v.dishId, v.wineId, v.source);
      const row = rows.get(rowKey) ?? { dishId: v.dishId, wineId: v.wineId, source: v.source, shown: 0, chosen: 0 };
      row.shown += 1;
      if (selected.has(k)) row.chosen += 1;
      rows.set(rowKey, row);
    }
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return [...rows.values()].sort((a, b) => cmp(a.dishId, b.dishId) || cmp(a.wineId, b.wineId) || cmp(a.source, b.source));
  }
}

/** The tier written by E02 (`usageTier`) as the source of a pairing stat; anything else is not counted. */
const statSource = (tier: unknown): PairingStatSource | null =>
  tier === 'sommelier_primary' || tier === 'sommelier' ? 'sommelier' : tier === 'engine' ? 'engine' : null;

/** The in-memory data source keeps this many recommendation codes at most (R11). */
export const MAX_MEMORY_RECOMMENDATION_CODES = 10_000;

const sameChoice = (a: RecommendationCodeRecord, b: Omit<RecommendationCodeRecord, 'confirmedAt'>) =>
  a.serviceDay === b.serviceDay && a.sessionId === b.sessionId && a.wineId === b.wineId && a.serving === b.serving &&
  a.dishIds.length === b.dishIds.length && a.dishIds.every((id, i) => id === b.dishIds[i]);

export class MemoryRecommendationCodeRepository implements RecommendationCodeRepository {
  constructor(private readonly store: MemoryStore) {}

  private rows(restaurantId: string) {
    return this.store.recommendationCodes.filter((r) => r.restaurantId === restaurantId);
  }

  private inPeriod(restaurantId: string, period: ServiceDayPeriod) {
    return this.rows(restaurantId).filter((r) => r.record.serviceDay >= period.from && r.record.serviceDay <= period.to);
  }

  async tryIssue(restaurantId: string, input: RecommendationCodeInput) {
    const rows = this.rows(restaurantId);
    const existing = rows.find((r) => sameChoice(r.record, input));
    if (existing) return { status: 'existing' as const, record: copy(existing.record) };
    if (rows.some((r) => r.record.serviceDay === input.serviceDay && r.record.code === input.code)) return { status: 'code_taken' as const };
    const { id, ...fields } = copy(input);
    const record: RecommendationCodeRecord = { ...fields, confirmedAt: null };
    const list = this.store.recommendationCodes;
    list.push({ restaurantId, id, record, confirmedBy: null });
    if (list.length > MAX_MEMORY_RECOMMENDATION_CODES) list.splice(0, list.length - MAX_MEMORY_RECOMMENDATION_CODES);
    return { status: 'created' as const, record: copy(record) };
  }

  async findByCode(restaurantId: string, serviceDay: string, code: string) {
    const row = this.rows(restaurantId).find((r) => r.record.serviceDay === serviceDay && r.record.code === code);
    return row ? copy(row.record) : null;
  }

  async setConfirmed(restaurantId: string, serviceDay: string, code: string, at: Date | null, by: string | null) {
    const row = this.rows(restaurantId).find((r) => r.record.serviceDay === serviceDay && r.record.code === code);
    if (!row) return null;
    if (at === null) {
      row.record.confirmedAt = null;
      row.confirmedBy = null;
    } else if (row.record.confirmedAt === null) {
      row.record.confirmedAt = at.toISOString();
      row.confirmedBy = by;
    }
    return copy(row.record);
  }

  async countBySession(restaurantId: string, serviceDay: string, sessionId: string) {
    return this.rows(restaurantId).filter((r) => r.record.serviceDay === serviceDay && r.record.sessionId === sessionId).length;
  }

  async pairStats(restaurantId: string, period: ServiceDayPeriod): Promise<PairCodeStats[]> {
    const matched = this.posMatches(restaurantId);
    const stats = new Map<string, PairCodeStats>();
    for (const { record: r } of this.inPeriod(restaurantId, period)) {
      if (r.context === 'direct') continue;
      const pos = matched.has(`${r.serviceDay}|${r.code}`);
      const confirmed = r.confirmedAt !== null;
      for (const dishId of r.dishIds) {
        const key = `${dishId}|${r.wineId}|${r.context}`;
        const s = stats.get(key) ?? { dishId, wineId: r.wineId, context: r.context, issued: 0, staffConfirmed: 0, posMatched: 0, ordered: 0 };
        s.issued += 1;
        if (confirmed) s.staffConfirmed += 1;
        if (pos) s.posMatched += 1;
        if (confirmed || pos) s.ordered += 1;
        stats.set(key, s);
      }
    }
    return [...stats.values()].sort((a, b) => a.dishId.localeCompare(b.dishId) || a.wineId.localeCompare(b.wineId) || a.context.localeCompare(b.context));
  }

  async totals(restaurantId: string, period: ServiceDayPeriod) {
    const matched = this.posMatches(restaurantId);
    const rows = this.inPeriod(restaurantId, period);
    const isMatched = (r: RecommendationCodeRecord) => matched.has(`${r.serviceDay}|${r.code}`);
    const staffConfirmed = rows.filter((r) => r.record.confirmedAt !== null).length;
    const posMatched = rows.filter((r) => isMatched(r.record)).length;
    const ordered = rows.filter((r) => r.record.confirmedAt !== null || isMatched(r.record)).length;
    return { issued: rows.length, staffConfirmed, posMatched, ordered };
  }

  async unmatchedPosCodes(restaurantId: string, period: ServiceDayPeriod) {
    const issued = new Set(this.rows(restaurantId).map((r) => `${r.record.serviceDay}|${r.record.code}`));
    const unmatched = new Set<string>();
    for (const l of this.store.salesLines) {
      if (l.restaurantId !== restaurantId || l.replacedAt !== null || !l.recommendationCode) continue;
      if (l.businessDate < period.from || l.businessDate > period.to) continue;
      const key = `${l.businessDate}|${l.recommendationCode}`;
      if (!issued.has(key)) unmatched.add(key);
    }
    return unmatched.size;
  }

  /**
   * POS matches (R9): `${businessDate}|${code}` of every active check that has a code on one of its lines and wine sold
   * (glasses + bottles, summed over the check, above zero). The same rule as the SQL in `PgRecommendationCodeRepository`.
   */
  private posMatches(restaurantId: string): Set<string> {
    const lines = this.store.salesLines.filter((l) => l.restaurantId === restaurantId && l.replacedAt === null);
    const wineByCheck = new Map<string, number>();
    for (const l of lines) {
      if (l.itemType !== 'wine_glass' && l.itemType !== 'wine_bottle') continue;
      const check = `${l.businessDate}|${l.checkId}`;
      wineByCheck.set(check, (wineByCheck.get(check) ?? 0) + l.quantity);
    }
    const matched = new Set<string>();
    for (const l of lines) {
      if (l.recommendationCode && (wineByCheck.get(`${l.businessDate}|${l.checkId}`) ?? 0) > 0) matched.add(`${l.businessDate}|${l.recommendationCode}`);
    }
    return matched;
  }

  async countUnmatched(restaurantId: string, pairs: Array<{ businessDate: string; code: string }>) {
    const issued = new Set(this.rows(restaurantId).map((r) => `${r.record.serviceDay}|${r.record.code}`));
    return new Set(pairs.map((p) => `${p.businessDate}|${p.code}`).filter((k) => !issued.has(k))).size;
  }
}

export function createMemoryRepositories(store: MemoryStore): Repositories {
  return {
    restaurantRepository: new MemoryRestaurantRepository(store),
    dishRepository: new MemoryDishRepository(store),
    wineRepository: new MemoryWineRepository(store),
    pairingRepository: new MemoryPairingRepository(store),
    pairingWriteRepository: new MemoryPairingWriteRepository(store),
    wineWriteRepository: new MemoryWineWriteRepository(store),
    restaurantWriteRepository: new MemoryRestaurantWriteRepository(store),
    publishRepository: new MemoryPublishRepository(store),
    contentWriteRepository: new MemoryContentWriteRepository(store),
    importRepository: new MemoryImportRepository(store),
    opportunityDismissalRepository: new MemoryOpportunityDismissalRepository(store),
    guestInteractionRepository: new MemoryGuestInteractionRepository(store),
    recommendationCodeRepository: new MemoryRecommendationCodeRepository(store),
    salesRepository: new MemorySalesRepository(store)
  };
}
