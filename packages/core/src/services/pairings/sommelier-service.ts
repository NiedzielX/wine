import type { Actor } from '../../auth/types';
import type { Dish, PairingRole, Wine } from '../../domain/types';
import { MIN_MODEL_SCORE } from '../../engine/recommend';
import { pairingScore } from '../../engine/scoring';
import { NotFoundError, ValidationError, VersionConflictError } from '../../errors';
import type { Clock, IdGenerator } from '../../ports/runtime';
import type { PairingChangeSet, Repositories } from '../../ports/repositories';
import { commentTranslationsSchema } from '../../validators/catalog/translations.schema';
import { parseWith } from '../../validators/parse';
import { DishPlan, addManual, approve, approveAllSuggested, existingPairingError, move, reject, removeManual, restore, setComment, setRole, suggestPairing, type PlanContext } from './pairing-rules';

export type SommelierServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'pairingWriteRepository' | 'wineWriteRepository'> & {
  clock: Clock;
  idGenerator: IdGenerator;
};

const ROLES: PairingRole[] = ['primary', 'alternative', 'best_value'];

/**
 * The sommelier's commands. Each command loads the dish's pairings, lets the rules in
 * `pairing-rules.ts` plan the change on a working copy, and commits the result atomically.
 * `actor` is who made the change (the audit trail); `expectedVersion` is the pairing version the
 * caller saw — a mismatch means someone else changed it first (VersionConflictError).
 */
export class SommelierService {
  private readonly d: SommelierServiceDeps;

  constructor(deps: SommelierServiceDeps) {
    this.d = deps;
  }

  private ctx(actor: Actor): PlanContext {
    return { actor: actor.name, actorId: actor.id, at: this.d.clock.now().toISOString(), newId: () => this.d.idGenerator.uuid() };
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  /** Runs one rule against the pairings of the dish that `pairingId` belongs to. */
  private async onPairing(slug: string, pairingId: string, actor: Actor, expectedVersion: number | undefined, rule: (plan: DishPlan) => void): Promise<void> {
    const restaurant = await this.restaurant(slug);
    const pairing = await this.d.pairingRepository.findById(restaurant.id, pairingId);
    if (!pairing) throw new NotFoundError('Pairing');
    if (expectedVersion !== undefined && pairing.version !== undefined && pairing.version !== expectedVersion) throw new VersionConflictError();
    const plan = new DishPlan(await this.d.pairingRepository.listByDish(restaurant.id, pairing.dishId), this.ctx(actor));
    plan.expect(pairing.id, expectedVersion);
    rule(plan);
    await this.commit(restaurant.id, plan.finish());
  }

  private async commit(restaurantId: string, changes: PairingChangeSet): Promise<void> {
    if (changes.ops.length > 0) await this.d.pairingWriteRepository.commit(restaurantId, changes);
  }

  approve(slug: string, pairingId: string, actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => approve(plan, pairingId));
  }

  reject(slug: string, pairingId: string, actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => reject(plan, pairingId));
  }

  restore(slug: string, pairingId: string, actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => restore(plan, pairingId));
  }

  // async on purpose: every command reports problems as a rejected promise, never as a synchronous throw
  async setRole(slug: string, pairingId: string, role: string, actor: Actor, expectedVersion?: number): Promise<void> {
    if (!ROLES.includes(role as PairingRole)) throw new ValidationError('invalid_role', 'Choose primary, alternative or best value.', { role: 'invalid' });
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => setRole(plan, pairingId, role as PairingRole));
  }

  setComment(slug: string, pairingId: string, comment: string, actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => setComment(plan, pairingId, comment));
  }

  /** The note with its translations (A6, spec 2026-10-15-bilingual-content): `translations` goes through its schema. */
  async setNote(slug: string, pairingId: string, input: { comment: string; translations: unknown }, actor: Actor, expectedVersion?: number): Promise<void> {
    const translations = parseWith(commentTranslationsSchema, input.translations, 'Check the note.');
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => setComment(plan, pairingId, input.comment, translations));
  }

  move(slug: string, pairingId: string, direction: 'up' | 'down', actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => move(plan, pairingId, direction === 'up' ? -1 : 1));
  }

  deleteManual(slug: string, pairingId: string, actor: Actor, expectedVersion?: number) {
    return this.onPairing(slug, pairingId, actor, expectedVersion, (plan) => removeManual(plan, pairingId));
  }

  /** A pairing the sommelier writes by hand: wine + role + optional note. */
  async addManual(slug: string, input: { dishId: string; wineId: string; role?: string | null; comment?: string }, actor: Actor): Promise<void> {
    const restaurant = await this.restaurant(slug);
    const dish: Dish | null = await this.d.dishRepository.findById(restaurant.id, input.dishId);
    if (!dish) throw new NotFoundError('Dish');
    if (!input.wineId) throw new ValidationError('wine_required', 'Choose a wine to pair.', { wineId: 'required' });
    const wine: Wine | null = await this.d.wineRepository.findById(restaurant.id, input.wineId);
    if (!wine) throw new NotFoundError('Wine');
    if (!wine.active) throw new ValidationError('wine_not_available', 'This wine is hidden from guests. Show it on the wine list first.', { wineId: 'not_available' });
    const role = input.role ? (ROLES.includes(input.role as PairingRole) ? (input.role as PairingRole) : null) : null;
    if (input.role && !role) throw new ValidationError('invalid_role', 'Choose primary, alternative or best value.', { role: 'invalid' });
    const ctx = this.ctx(actor);
    const plan = new DishPlan(await this.d.pairingRepository.listByDish(restaurant.id, dish.id), ctx);
    addManual(plan, { dishId: dish.id, wineId: wine.id, role, comment: input.comment ?? '', modelScore: pairingScore(dish, wine).score }, ctx);
    await this.commit(restaurant.id, plan.finish());
  }

  /**
   * "Add to suggestions" (spec 2026-10-16-sommelier-opportunities, R5, Q13–Q14): a `suggested` pairing in the review
   * queue with the current match score, through the same path as the import and "Generate suggestions" (no audit
   * entry, not counted as an unpublished change). Requires a published dish, an active wine and a score of at least
   * MIN_MODEL_SCORE. Guests see nothing until the sommelier approves it and publishes.
   */
  async addSuggestion(slug: string, input: { dishId: string; wineId: string }, actor: Actor): Promise<void> {
    const restaurant = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(restaurant.id, input.dishId);
    if (!dish) throw new NotFoundError('Dish');
    if (dish.status !== 'published') throw new ValidationError('dish_not_published', 'This dish is not visible to guests.', { dishId: 'not_published' });
    const wine = await this.d.wineRepository.findById(restaurant.id, input.wineId);
    if (!wine) throw new NotFoundError('Wine');
    if (!wine.active) throw new ValidationError('wine_not_available', 'This wine is hidden from guests. Show it on the wine list first.', { wineId: 'not_available' });
    const modelScore = pairingScore(dish, wine).score;
    if (modelScore < MIN_MODEL_SCORE) throw new ValidationError('low_match', 'This wine is a weak match for the dish.', { wineId: 'low_match' });
    const pairing = suggestPairing(await this.d.pairingRepository.listByDish(restaurant.id, dish.id), { dishId: dish.id, wineId: wine.id, modelScore }, this.ctx(actor));
    if (await this.d.pairingWriteRepository.addSuggestions(restaurant.id, [pairing]) > 0) return;
    // someone paired the two a moment ago: report what the pairing is now
    const now = (await this.d.pairingRepository.listByDish(restaurant.id, dish.id)).find((p) => p.wineId === wine.id);
    throw now ? existingPairingError(now) : new VersionConflictError();
  }

  /** Approves every suggestion of one dish, or of the whole menu. Returns how many were approved. */
  async approveAll(slug: string, actor: Actor, dishId?: string): Promise<number> {
    const restaurant = await this.restaurant(slug);
    const all = await this.d.pairingRepository.listByRestaurant(restaurant.id);
    const dishIds = [...new Set(all.filter((p) => p.status === 'suggested' && (!dishId || p.dishId === dishId)).map((p) => p.dishId))];
    const ctx = this.ctx(actor);
    const changes: PairingChangeSet = { ops: [], decisions: [] };
    let approved = 0;
    for (const id of dishIds) {
      const plan = new DishPlan(all.filter((p) => p.dishId === id), ctx);
      approved += approveAllSuggested(plan);
      const c = plan.finish();
      changes.ops.push(...c.ops);
      changes.decisions.push(...c.decisions);
    }
    await this.commit(restaurant.id, changes);
    return approved;
  }

  /** Availability changes take effect for guests immediately (no publish needed). */
  async setWineActive(slug: string, wineId: string, active: boolean): Promise<Wine> {
    const restaurant = await this.restaurant(slug);
    const wine = await this.d.wineWriteRepository.setActive(restaurant.id, wineId, active);
    if (!wine) throw new NotFoundError('Wine');
    return wine;
  }
}
