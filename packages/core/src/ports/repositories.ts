import type { ImportRepository } from './import';
import type { SalesRepository } from './sales';
import type { CommentTranslations, DishTranslations, PublishedContent, RestaurantTranslations, WineTranslations } from '../i18n/content';
import type { Locale } from '../i18n/locale';
import type {
  CodeSummary, Dish, EntityStatus, GuestEventName, GuestInteraction, OpportunityDismissal, PairCodeStats, Pairing, PairingRole, PairingStatus, RecommendationCodeRecord,
  Restaurant, RestaurantSettings, Wine
} from '../domain/types';

/**
 * Repository ports. Implementations: in-memory (`@wine-match/core/memory`) and PostgreSQL
 * (`@wine-match/db`). Every query except the slug lookup is scoped by restaurantId — tenant
 * isolation is part of the contract, not a caller convention.
 */
export interface RestaurantRepository {
  findBySlug(slug: string): Promise<Restaurant | null>;
}

export interface DishRepository {
  findById(restaurantId: string, dishId: string): Promise<Dish | null>;
  listByRestaurant(restaurantId: string, opts?: { statuses?: EntityStatus[] }): Promise<Dish[]>;
}

export interface WineRepository {
  findById(restaurantId: string, wineId: string): Promise<Wine | null>;
  listByRestaurant(restaurantId: string, opts?: { activeOnly?: boolean }): Promise<Wine[]>;
}

export interface PairingRepository {
  findById(restaurantId: string, pairingId: string): Promise<Pairing | null>;
  /** Current state: what the sommelier sees in the dashboard (includes unpublished changes). */
  listByRestaurant(restaurantId: string): Promise<Pairing[]>;
  listByDish(restaurantId: string, dishId: string): Promise<Pairing[]>;
  /**
   * What guests see: the reviewed and rejected pairings of the latest published version.
   * A restaurant that was never published falls back to the current state.
   */
  listPublishedByRestaurant(restaurantId: string): Promise<Pairing[]>;
  listPublishedByDish(restaurantId: string, dishId: string): Promise<Pairing[]>;
  /** The audit trail, newest first. Survives the deletion of a pairing. */
  listDecisions(restaurantId: string, filter?: { pairingId?: string; dishId?: string }, limit?: number): Promise<DecisionRecord[]>;
}

/* ---------- writes ---------- */

export interface PairingPatch {
  status?: PairingStatus;
  role?: PairingRole | null;
  rank?: number | null;
  comment?: string | null;
  commentTranslations?: CommentTranslations;
  updatedBy: string;
  updatedAt: string;
}

/** One step of a change set. Steps are applied in order, each one validated against the data store. */
export type PairingOp =
  | { kind: 'update'; id: string; expectedVersion?: number; patch: PairingPatch }
  | { kind: 'create'; pairing: Pairing }
  | { kind: 'delete'; id: string; expectedVersion?: number };

export type DecisionAction = 'approve' | 'modify' | 'reject' | 'restore' | 'set_role' | 'reorder' | 'comment' | 'create' | 'delete';

/** An entry of the append-only audit trail (kept even after the pairing is deleted). */
export interface DecisionRecord {
  id: string;
  pairingId: string;
  dishId: string;
  wineId: string;
  actor: string;
  /** the signed-in user behind the change; null for history written before accounts existed */
  actorId: string | null;
  action: DecisionAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

export interface PairingChangeSet {
  ops: PairingOp[];
  decisions: DecisionRecord[];
}

export interface PairingWriteRepository {
  /**
   * Applies the change set atomically (all or nothing). Throws VersionConflictError when an
   * `expectedVersion` does not match, InvariantError when a rule of the store would be broken
   * (one primary per dish, one pairing per dish and wine) and NotFoundError for unknown ids.
   * Every touched pairing is marked as changed since the last publish.
   */
  commit(restaurantId: string, changes: PairingChangeSet): Promise<void>;
  /**
   * Adds engine suggestions (status "suggested", not marked as changed: they are not decisions).
   * Pairs that already exist for the dish and wine, in any status, are skipped. Returns how many were added.
   */
  addSuggestions(restaurantId: string, pairings: Pairing[]): Promise<number>;
}

export interface WineWriteRepository {
  setActive(restaurantId: string, wineId: string, active: boolean): Promise<Wine | null>;
}

export interface RestaurantDetails {
  name: string;
  slug: string;
  address: string;
  city: string;
  wineDirector: string;
}

export interface RestaurantWriteRepository {
  updateSettings(restaurantId: string, settings: RestaurantSettings): Promise<void>;
  /** Throws InvariantError("slug_taken") when another restaurant uses the slug. */
  updateDetails(restaurantId: string, details: RestaurantDetails): Promise<void>;
}

export interface PublishedVersionInfo {
  id: string;
  number: number;
  changesCount: number;
  publishedBy: string;
  publishedAt: string;
}

export interface PublishRepository {
  latest(restaurantId: string): Promise<PublishedVersionInfo | null>;
  /** Pairings with a decision since the last publish (deletions included) — the "unpublished changes" counter. */
  pendingPairingChanges(restaurantId: string): Promise<number>;
  /**
   * Atomically: snapshot of reviewed and rejected pairings as the new version, clear the
   * changed flags, release draft dishes, stamp the restaurant. Returns the new version.
   */
  publish(restaurantId: string, input: { actor: string; at: string; id: string; contentChanges?: number }): Promise<PublishedVersionInfo>;
  /**
   * The translations guests see (spec 2026-10-15-bilingual-content, R4): those of the latest published version.
   * A restaurant that was never published shows its current translations; a version published before translations
   * existed has none (read as `{}`). The snapshot also carries `commentTranslations` of the published pairings.
   */
  publishedContent(restaurantId: string): Promise<PublishedContent>;
}

export interface RestaurantContent { contentLocale: Locale; translations: RestaurantTranslations }

/**
 * Writes of translated content. Each write is atomic: when `expected` is given and the stored translations differ
 * from it, nothing changes and VersionConflictError is thrown. Unknown ids (or another restaurant's) → NotFoundError.
 * The change reaches guests on the next publish.
 */
export interface ContentWriteRepository {
  setDishTranslations(restaurantId: string, dishId: string, next: DishTranslations, expected?: DishTranslations): Promise<void>;
  setWineTranslations(restaurantId: string, wineId: string, next: WineTranslations, expected?: WineTranslations): Promise<void>;
  setRestaurantContent(restaurantId: string, next: RestaurantContent, expected?: RestaurantContent): Promise<void>;
}

/**
 * Ignored opportunities (spec 2026-10-16-sommelier-opportunities, R6). One row per (restaurant, key); a dismissal is
 * active while `expiresAt > now` (a row that expires exactly now is no longer active).
 */
export interface OpportunityDismissalRepository {
  /** dismissals with expiresAt > now, ordered by expiresAt, then key */
  listActive(restaurantId: string, now: Date): Promise<OpportunityDismissal[]>;
  /** insert, or on (restaurantId, key) replace dismissedBy/dismissedById/dismissedAt and expiresAt (id kept) */
  upsert(restaurantId: string, dismissal: OpportunityDismissal): Promise<void>;
  /** true when a row was removed */
  remove(restaurantId: string, key: string): Promise<boolean>;
}

/** One usage event to store (spec 2026-10-15-guest-usage-events). `props` are typed by `UsageEventService` before this. */
export interface GuestInteractionInput {
  sessionId: string;
  name: GuestEventName;
  dishId?: string;
  wineId?: string;
  props: Record<string, unknown>;
  engineVersion: string;
  createdAt: Date;
}

/**
 * Anonymous usage events (telemetry, not a command: no actor, no version, no domain errors). Scoped by restaurant
 * like every other port. The in-memory implementation keeps at most 10 000 events.
 */
export interface GuestInteractionRepository {
  /** stores the events in one write (one insert), in the given order */
  record(restaurantId: string, events: GuestInteractionInput[]): Promise<void>;
  /** events of one session in insertion order — contract tests and diagnostics */
  listBySession(restaurantId: string, sessionId: string): Promise<GuestInteraction[]>;
  /** distinct session_id with a guest_session_started event, createdAt in [from, to) */
  countGuestSessions(restaurantId: string, range: { from: Date; to: Date }): Promise<number>;
  /**
   * Usage totals of one window for the KPI dashboard (spec 2026-10-15-kpi-dashboard, R2, R3, Q8, Q9). Guest figures
   * count only guest sessions — a guest_session_started with createdAt in [from, to) — and only their events also in
   * [from, to): staff sessions, sessions without a start and sessions started before `from` are out.
   * `sessions === countGuestSessions(restaurantId, range)`. `staffLookups` is the waiter's figure, apart from them.
   */
  usageTotals(restaurantId: string, range: { from: Date; to: Date }): Promise<UsageTotals>;
  /**
   * How often guests saw and chose each (dish, wine) of the dish recommendations in one window (spec
   * 2026-10-15-kpi-dashboard, R2, R8, Q10; read by E04 "Pairing performance" and E10 S4). Guest sessions only, like
   * `usageTotals`: a guest_session_started with createdAt in [from, to), and only their events also in [from, to).
   *
   * Per (session, dish, wine): the source is the tier of the session's latest recommendations_viewed for the dish whose
   * `props.items` contains the wine (`sommelier_primary` | `sommelier` → 'sommelier', `engine` → 'engine'); ties on
   * createdAt go to the later write. `shown` = such sessions; `chosen` = of those, sessions with a wine_selected whose
   * `props.context = 'dish'` for the same dish_id and wine_id (in any order). Events whose `props.items` is missing or
   * not an array, and items without a known tier, are skipped. The table path and the waiter are out.
   * One row per (dishId, wineId, source) with shown > 0, ordered by dishId, wineId, then source.
   */
  pairingStats(restaurantId: string, range: { from: Date; to: Date }): Promise<PairingStat[]>;
}

/** Where a pairing stood when the guest saw it (E04 R8): the sommelier's tiers or the engine's. */
export type PairingStatSource = 'sommelier' | 'engine';

/** One row of `GuestInteractionRepository.pairingStats`: one (dish, wine, source) in one window. */
export interface PairingStat {
  dishId: string;
  wineId: string;
  source: PairingStatSource;
  /** distinct guest sessions whose latest view of the dish showed the wine with this source */
  shown: number;
  /** of those sessions, the ones that selected the wine for the dish (context 'dish') */
  chosen: number;
}

/** What `GuestInteractionRepository.usageTotals` counts in one window. */
export interface UsageTotals {
  /** distinct guest sessions */
  sessions: number;
  /** distinct (session_id, dish_id) of recommendations_viewed in guest sessions */
  recommendationViews: number;
  /** distinct guest sessions with a recommendations_viewed */
  sessionsWithViews: number;
  /** of those, sessions with a wine_selected whose props.context = 'dish' (the table path is out) */
  sessionsWithSelection: number;
  /**
   * The waiter's lookups (staff_lookup on G9, staff_table_lookup on G11), any session: distinct (session_id, name,
   * dish_id or props.dishIds) — a repeated look at the same dish or table counts once, like the guest figures.
   */
  staffLookups: number;
}

/** A recommendation to store: the record without its confirmation, plus the row id (`IdGenerator`). */
export type RecommendationCodeInput = Omit<RecommendationCodeRecord, 'confirmedAt'> & { id: string };

/** A period of service days (`YYYY-MM-DD`), both ends inclusive. */
export interface ServiceDayPeriod { from: string; to: string }

/**
 * Recommendation codes (spec 2026-10-16-recommendation-code, R11). A code is unique per (restaurant, service day); a
 * choice — (service day, session, wine, serving, dish ids) — has one code. Issuing is telemetry-like (AGENTS §1.3,
 * Q7), confirming is a command of the service. A POS match (R9) is read from the active `sales_record` lines at read
 * time, never stored, so a second import of the same file cannot count it twice. The in-memory implementation keeps at
 * most 10 000 recommendations.
 */
export interface RecommendationCodeRepository {
  /** inserts unless (serviceDay, code) or the choice exists; `existing` returns the stored record of the same choice */
  tryIssue(restaurantId: string, input: RecommendationCodeInput):
    Promise<{ status: 'created' | 'existing'; record: RecommendationCodeRecord } | { status: 'code_taken' }>;
  /** the whole code only, never a prefix */
  findByCode(restaurantId: string, serviceDay: string, code: string): Promise<RecommendationCodeRecord | null>;
  /** `at` set: confirmed_at = coalesce(confirmed_at, at) (idempotent); `at` null: clears it. Null for an unknown code. */
  setConfirmed(restaurantId: string, serviceDay: string, code: string, at: Date | null, by: string | null): Promise<RecommendationCodeRecord | null>;
  /** issued codes of one session on one service day (R13) */
  countBySession(restaurantId: string, serviceDay: string, sessionId: string): Promise<number>;
  /** serviceDay in the period; rows only for context dish (one) and table (one per dish); sorted by dish, wine, context */
  pairStats(restaurantId: string, period: ServiceDayPeriod): Promise<PairCodeStats[]>;
  /** totals per R10 for the period, including context 'direct' */
  totals(restaurantId: string, period: ServiceDayPeriod): Promise<Omit<CodeSummary, 'period' | 'unmatchedPosCodes'>>;
  /** distinct (business day, code) pairs on the stored checks of the period that match no issued code (A13 card) */
  unmatchedPosCodes(restaurantId: string, period: ServiceDayPeriod): Promise<number>;
  /** import preview: how many of these distinct (businessDate, code) pairs have no issued code */
  countUnmatched(restaurantId: string, pairs: Array<{ businessDate: string; code: string }>): Promise<number>;
}

/** The repositories a data source must provide, registered in the DI container under these names. */
export interface Repositories {
  restaurantRepository: RestaurantRepository;
  dishRepository: DishRepository;
  wineRepository: WineRepository;
  pairingRepository: PairingRepository;
  pairingWriteRepository: PairingWriteRepository;
  wineWriteRepository: WineWriteRepository;
  restaurantWriteRepository: RestaurantWriteRepository;
  publishRepository: PublishRepository;
  contentWriteRepository: ContentWriteRepository;
  importRepository: ImportRepository;
  opportunityDismissalRepository: OpportunityDismissalRepository;
  guestInteractionRepository: GuestInteractionRepository;
  recommendationCodeRepository: RecommendationCodeRepository;
  salesRepository: SalesRepository;
}
