import type { ImportRepository } from './import';
import type { CommentTranslations, DishTranslations, PublishedContent, RestaurantTranslations, WineTranslations } from '../i18n/content';
import type { Locale } from '../i18n/locale';
import type { Dish, EntityStatus, Pairing, PairingRole, PairingStatus, Restaurant, RestaurantSettings, Wine } from '../domain/types';

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
}
