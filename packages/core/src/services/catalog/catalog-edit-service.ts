import type { Actor } from '../../auth/types';
import type { Locale } from '../../i18n/locale';
import { NotFoundError, ValidationError } from '../../errors';
import { suggestionsFor } from '../../import/suggestions';
import type { Dish, Pairing } from '../../domain/types';
import type { CatalogEditRecord, DishFields, Repositories, WineFields } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { dishCreateSchema } from '../../validators/catalog/dish-create.schema';
import { wineCreateSchema } from '../../validators/catalog/wine-create.schema';
import { dishFieldsSchema, dishShapeSchema } from '../../validators/catalog/dish-fields.schema';
import { wineFieldsSchema, wineShapeSchema } from '../../validators/catalog/wine-fields.schema';
import { parseWith } from '../../validators/parse';
import {
  buildNewDish, buildNewWine, checkFieldsVersion, dishFieldsOf, dishFieldsVersion, dishVisibilityVersion, planDishEdit, planDishVisibility, planNewDish, planNewWine, planWineEdit, pruneUnchanged, staleTranslationLocales, wineFieldsOf, wineFieldsVersion
} from './catalog-edit-rules';

export type CatalogEditServiceDeps = Pick<
  Repositories,
  'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository' | 'catalogWriteRepository'
> & { clock: Clock; idGenerator: IdGenerator };

export interface CatalogVisibilityResult {
  status: 'published' | 'hidden';
  /** the fingerprint after the change */
  version: string;
  /** engine suggestions added for the dish when it was shown again */
  suggestions: number;
}

export interface CatalogCreateResult {
  id: string;
  /** the fingerprint of the new item's fields (the `ETag` of its details) */
  version: string;
  /** engine suggestions made for it */
  suggestions: number;
}

export interface CatalogEditResult<F> {
  changed: boolean;
  /** the fields as they are stored now */
  fields: F;
  /** the fingerprint of those fields (what the next form sends back as `version`, what the API returns as `ETag`) */
  version: string;
  /** languages whose published translation belongs to a field this edit changed (R11) */
  staleLocales: Locale[];
}

/**
 * Options of the panel's forms. `identityConfirmed` is only asked for when options are given: the form of A3 and A5 has a separate
 * confirmation for a rename of something that has sommelier pairings (R15); the API does not send it.
 */
export interface CatalogEditOptions {
  identityConfirmed?: boolean;
  /** plan and check everything, write nothing (a form that already knows one field is wrong still wants the other fields' problems) */
  validateOnly?: boolean;
}

/**
 * Commands that edit the fields of dishes and wines (spec 2026-11-16-catalog-field-editing, R1 to R5, R15). Like every
 * command: async, input through a schema, the change planned by pure rules (`catalog-edit-rules.ts`), written atomically
 * with its audit row through the port; `expectedVersion` is a fingerprint of the editable fields. The fields are live: guests
 * see the change at once, the translations stay as published.
 */
export class CatalogEditService {
  private readonly d: CatalogEditServiceDeps;

  constructor(deps: CatalogEditServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  private record(kind: 'dish' | 'wine', subjectId: string, actor: Actor, at: string, plan: { before: Record<string, unknown>; after: Record<string, unknown>; identity: boolean }): CatalogEditRecord {
    return { id: this.d.idGenerator.uuid(), kind, subjectId, action: 'update', actor: actor.name, actorId: actor.id, before: plan.before, after: plan.after, identity: plan.identity, at };
  }

  private async stale(restaurantId: string, kind: 'dish' | 'wine', id: string, keys: readonly string[]): Promise<Locale[]> {
    if (!keys.length) return [];
    const published = await this.d.publishRepository.publishedContent(restaurantId);
    return staleTranslationLocales(kind, keys, (kind === 'dish' ? published.dishes : published.wines).get(id));
  }

  /** The stored fields and their fingerprint. */
  async getDishFields(slug: string, dishId: string): Promise<{ fields: DishFields; version: string }> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    const fields = dishFieldsOf(dish);
    return { fields, version: dishFieldsVersion(fields) };
  }

  async getWineFields(slug: string, wineId: string): Promise<{ fields: WineFields; version: string }> {
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    const fields = wineFieldsOf(wine);
    return { fields, version: wineFieldsVersion(fields) };
  }

  async updateDish(slug: string, dishId: string, input: unknown, actor: Actor, expectedVersion?: string, opts?: CatalogEditOptions): Promise<CatalogEditResult<DishFields>> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    const current = dishFieldsOf(dish);
    const version = dishFieldsVersion(current);
    // a stale fingerprint is a conflict even when nothing would change (R3)
    checkFieldsVersion(version, expectedVersion);
    const shape = parseWith(dishShapeSchema, input, 'Check the fields.');
    const values = parseWith(dishFieldsSchema, pruneUnchanged(shape, current), 'Check the fields.');
    const others = (await this.d.dishRepository.listByRestaurant(r.id)).map((x) => ({ id: x.id, name: x.name }));
    const plan = planDishEdit(current, values, { selfId: dish.id, others });
    if (!plan.changed) return { changed: false, fields: current, version, staleLocales: [] };
    if (plan.identity) await this.requireIdentityConfirmation('name', opts, async () => (await this.d.pairingRepository.listByDish(r.id, dish.id)).filter((p) => p.status === 'approved' || p.status === 'modified').length);
    if (opts?.validateOnly) return { changed: true, fields: plan.next, version, staleLocales: [] };
    const at = this.d.clock.now().toISOString();
    await this.d.catalogWriteRepository.updateDish(r.id, dish.id, plan.next, expectedVersion, this.record('dish', dish.id, actor, at, plan));
    return { changed: true, fields: plan.next, version: dishFieldsVersion(plan.next), staleLocales: await this.stale(r.id, 'dish', dish.id, plan.keys) };
  }

  async updateWine(slug: string, wineId: string, input: unknown, actor: Actor, expectedVersion?: string, opts?: CatalogEditOptions): Promise<CatalogEditResult<WineFields>> {
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    const current = wineFieldsOf(wine);
    const version = wineFieldsVersion(current);
    checkFieldsVersion(version, expectedVersion);
    const shape = parseWith(wineShapeSchema, input, 'Check the fields.');
    const stored = { ...current, pouredByGlass: current.glassPrice !== null };
    const values = parseWith(wineFieldsSchema, pruneUnchanged(shape, stored, ['pouredByGlass', 'glassPrice']), 'Check the fields.');
    const others = (await this.d.wineRepository.listByRestaurant(r.id)).map((x) => ({ id: x.id, producer: x.producer, name: x.name, vintage: x.vintage, listNumber: x.listNumber ?? null }));
    const plan = planWineEdit(current, values, { selfId: wine.id, others, maxVintage: this.d.clock.now().getUTCFullYear() + 1 });
    if (!plan.changed) return { changed: false, fields: current, version, staleLocales: [] };
    if (plan.identity) await this.requireIdentityConfirmation('name', opts, async () => (await this.d.pairingRepository.listByRestaurant(r.id)).filter((p) => p.wineId === wine.id && (p.status === 'approved' || p.status === 'modified')).length);
    if (opts?.validateOnly) return { changed: true, fields: plan.next, version, staleLocales: [] };
    const at = this.d.clock.now().toISOString();
    await this.d.catalogWriteRepository.updateWine(r.id, wine.id, plan.next, expectedVersion, this.record('wine', wine.id, actor, at, plan));
    return { changed: true, fields: plan.next, version: wineFieldsVersion(plan.next), staleLocales: await this.stale(r.id, 'wine', wine.id, plan.keys) };
  }

  /** The fingerprint a visibility change of the dish is checked against (what the hide / show button sends back as `version`). */
  async getDishVisibility(slug: string, dishId: string): Promise<{ status: Dish['status']; version: string }> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    return { status: dish.status, version: dishVisibilityVersion(dish) };
  }

  /**
   * R7: hide a published dish from guests or show a hidden one again, at once and without a publish (the hidden dish is part
   * of the published menu, so showing it needs no new version). Showing it also asks the engine for the pairs the dish
   * missed while hidden (N4), in the same transaction. A `draft` dish has no switch (`status: 'transition'`).
   */
  async setDishHidden(slug: string, dishId: string, hidden: boolean, actor: Actor, expectedVersion?: string): Promise<CatalogVisibilityResult> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    checkFieldsVersion(dishVisibilityVersion(dish), expectedVersion);
    const change = planDishVisibility(dish.status, hidden);
    const now = this.d.clock.now().toISOString();
    let suggestions: Pairing[] = [];
    if (!hidden) {
      const [dishes, wines, pairings] = await Promise.all([
        this.d.dishRepository.listByRestaurant(r.id), this.d.wineRepository.listByRestaurant(r.id), this.d.pairingRepository.listByRestaurant(r.id)
      ]);
      suggestions = suggestionsFor([{ ...dish, status: 'published' }], [], { dishes: dishes.filter((x) => x.id !== dish.id), wines, pairings, now }, () => this.d.idGenerator.uuid());
    }
    const edit: CatalogEditRecord = {
      id: this.d.idGenerator.uuid(), kind: 'dish', subjectId: dish.id, action: hidden ? 'hidden' : 'shown', actor: actor.name, actorId: actor.id,
      before: { status: change.from }, after: { status: change.to }, identity: false, at: now
    };
    const added = await this.d.catalogWriteRepository.setDishStatus(r.id, dish.id, change, expectedVersion, edit, suggestions);
    return { status: change.to, version: dishVisibilityVersion({ ...dish, status: change.to }), suggestions: added };
  }

  /**
   * R8: a new dish. It is a `draft` with the engine's draft profile (to check and confirm) and, like an imported one, reaches guests
   * only with a publish. The engine's suggestions for it are made in the same transaction.
   */
  async createDish(slug: string, input: unknown, actor: Actor): Promise<CatalogCreateResult> {
    const r = await this.restaurant(slug);
    const values = parseWith(dishCreateSchema, input, 'Check the fields.');
    const [dishes, wines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(r.id), this.d.wineRepository.listByRestaurant(r.id), this.d.pairingRepository.listByRestaurant(r.id)
    ]);
    const fields = planNewDish(values, { others: dishes.map((x) => ({ id: x.id, name: x.name })) });
    const dish = buildNewDish(this.d.idGenerator.uuid(), fields);
    const at = this.d.clock.now().toISOString();
    const suggestions = suggestionsFor([dish], [], { dishes, wines, pairings, now: at }, () => this.d.idGenerator.uuid());
    const edit: CatalogEditRecord = { id: this.d.idGenerator.uuid(), kind: 'dish', subjectId: dish.id, action: 'create', actor: actor.name, actorId: actor.id, before: null, after: { ...fields }, identity: false, at };
    await this.d.catalogWriteRepository.createDish(r.id, dish, suggestions, edit);
    return { id: dish.id, version: dishFieldsVersion(fields), suggestions: suggestions.length };
  }

  /** R8: a new wine, active, with the draft profile of `style` and `grape`, the next free list number when none is given, and its suggestions. */
  async createWine(slug: string, input: unknown, actor: Actor): Promise<CatalogCreateResult & { listNumber: number | null }> {
    const r = await this.restaurant(slug);
    const values = parseWith(wineCreateSchema, input, 'Check the fields.');
    const [dishes, wines, pairings] = await Promise.all([
      this.d.dishRepository.listByRestaurant(r.id), this.d.wineRepository.listByRestaurant(r.id), this.d.pairingRepository.listByRestaurant(r.id)
    ]);
    const plan = planNewWine(values, {
      others: wines.map((x) => ({ id: x.id, producer: x.producer, name: x.name, vintage: x.vintage, listNumber: x.listNumber ?? null })),
      maxVintage: this.d.clock.now().getUTCFullYear() + 1
    });
    const wine = buildNewWine(this.d.idGenerator.uuid(), plan);
    const at = this.d.clock.now().toISOString();
    const suggestions = suggestionsFor([], [wine], { dishes, wines, pairings, now: at }, () => this.d.idGenerator.uuid());
    const edit: CatalogEditRecord = {
      id: this.d.idGenerator.uuid(), kind: 'wine', subjectId: wine.id, action: 'create', actor: actor.name, actorId: actor.id, before: null,
      after: { ...plan.fields, style: plan.style, ...(plan.grape ? { grape: plan.grape } : {}) }, identity: false, at
    };
    const { listNumber } = await this.d.catalogWriteRepository.createWine(r.id, wine, { autoListNumber: plan.autoListNumber }, suggestions, edit);
    return { id: wine.id, version: wineFieldsVersion({ ...plan.fields, listNumber }), suggestions: suggestions.length, listNumber };
  }

  /** R15 (4): a form that asks for it refuses a rename of something with sommelier pairings until it is confirmed. */
  private async requireIdentityConfirmation(field: string, opts: CatalogEditOptions | undefined, pairs: () => Promise<number>): Promise<void> {
    if (!opts || opts.identityConfirmed) return;
    if ((await pairs()) > 0) throw new ValidationError('validation_failed', 'Confirm the rename.', { [field]: 'identity_unconfirmed' });
  }
}
