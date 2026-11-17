import type { Actor } from '../../auth/types';
import type { DishProfile, WineProfile } from '../../domain/types';
import { NotFoundError } from '../../errors';
import type { ProfileEditRecord, Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { parseWith } from '../../validators/parse';
import { dishProfileSchema, wineProfileSchema } from '../../validators/catalog/profile.schema';
import { dishScales, wineScales } from '../publishing/snapshot';
import { auditProfile, checkProfileVersion, planDishProfile, planWineProfile, profileVersion } from './profile-rules';

export type ProfileServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'profileWriteRepository'> & {
  clock: Clock;
  idGenerator: IdGenerator;
};

export interface ProfileWriteResult {
  changed: boolean;
  /** the fingerprint of the profile as it is stored now (what the next form sends back as `version`) */
  version: string;
}

export interface ProfileSaveOptions {
  /** true = "Save and confirm", false = "Save as draft" */
  confirm: boolean;
  /** the fingerprint of the profile the caller saw (`profileVersion`); another one is `version_conflict` */
  expectedVersion?: string;
}

/**
 * Commands that change taste profiles (spec 2026-11-04-panel-completion, R3 to R5). Like every command: async, input
 * through a schema, the change planned by pure rules (`profile-rules.ts`), written atomically with its audit row
 * through the port; `expectedVersion` is a fingerprint of the profile (dishes and wines have no version column). The
 * change reaches guests with the next publish (it counts as an unpublished change), never at once.
 */
export class ProfileService {
  private readonly d: ProfileServiceDeps;

  constructor(deps: ProfileServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  private edit(kind: 'dish' | 'wine', subjectId: string, actor: Actor, at: string, before: DishProfile | WineProfile, after: DishProfile | WineProfile): ProfileEditRecord {
    return { id: this.d.idGenerator.uuid(), kind, subjectId, actor: actor.name, actorId: actor.id, before: auditProfile(before), after: auditProfile(after), at };
  }

  async setDishProfile(slug: string, dishId: string, input: unknown, actor: Actor, opts: ProfileSaveOptions): Promise<ProfileWriteResult> {
    const scales = parseWith(dishProfileSchema, input, 'Check the profile.');
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    checkProfileVersion(dish.profile, opts.expectedVersion);
    const at = this.d.clock.now().toISOString();
    const plan = planDishProfile(dish.profile, scales, opts.confirm, { confirmedAt: at, confirmedBy: actor.name });
    if (!plan.changed) return { changed: false, version: profileVersion(dish.profile) };
    await this.d.profileWriteRepository.setDishProfile(r.id, dish.id, plan.next, this.edit('dish', dish.id, actor, at, dish.profile, plan.next), dish.profile);
    return { changed: true, version: profileVersion(plan.next) };
  }

  async setWineProfile(slug: string, wineId: string, input: unknown, actor: Actor, opts: ProfileSaveOptions): Promise<ProfileWriteResult> {
    const scales = parseWith(wineProfileSchema, input, 'Check the profile.');
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    checkProfileVersion(wine.profile, opts.expectedVersion);
    const at = this.d.clock.now().toISOString();
    const plan = planWineProfile(wine.profile, scales, opts.confirm, { confirmedAt: at, confirmedBy: actor.name });
    if (!plan.changed) return { changed: false, version: profileVersion(wine.profile) };
    await this.d.profileWriteRepository.setWineProfile(r.id, wine.id, plan.next, this.edit('wine', wine.id, actor, at, wine.profile, plan.next), wine.profile);
    return { changed: true, version: profileVersion(plan.next) };
  }

  /** The stored profile and its fingerprint (what a client sends back as `If-Match` / `version`). */
  async getDishProfile(slug: string, dishId: string): Promise<{ profile: DishProfile; version: string }> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    return { profile: dish.profile, version: profileVersion(dish.profile) };
  }

  async getWineProfile(slug: string, wineId: string): Promise<{ profile: WineProfile; version: string }> {
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    return { profile: wine.profile, version: profileVersion(wine.profile) };
  }

  /** "Confirm without changes": the same scales, now confirmed (only the state changes). */
  async confirmDishProfile(slug: string, dishId: string, actor: Actor, expectedVersion?: string): Promise<ProfileWriteResult> {
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    return this.setDishProfile(slug, dishId, dishScales(dish.profile), actor, { confirm: true, expectedVersion });
  }

  async confirmWineProfile(slug: string, wineId: string, actor: Actor, expectedVersion?: string): Promise<ProfileWriteResult> {
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    return this.setWineProfile(slug, wineId, wineScales(wine.profile), actor, { confirm: true, expectedVersion });
  }
}
