import { InvariantError, NotFoundError, ValidationError } from '../../errors';
import type { Repositories, RestaurantDetails } from '../../ports/repositories';

export type RestaurantServiceDeps = Pick<Repositories, 'restaurantRepository' | 'restaurantWriteRepository'>;

/** Words that would collide with routes of the application. */
export const RESERVED_SLUGS = ['login', 'api', 'r', 'admin', 'static', 'assets', '_next', 'new', 'null', 'undefined'];
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The one rule for a restaurant slug (it is printed on QR codes). Does not normalise: callers decide
 * whether to trim or lower-case first. `null` means the slug is acceptable.
 */
export function validateSlug(slug: string): 'invalid' | 'reserved' | null {
  if (slug.length < 2 || slug.length > 40 || !SLUG_PATTERN.test(slug)) return 'invalid';
  if (RESERVED_SLUGS.includes(slug)) return 'reserved';
  return null;
}

/** The restaurant's own details. The slug is part of every printed QR code: changing it breaks those codes. */
export class RestaurantService {
  private readonly d: RestaurantServiceDeps;

  constructor(deps: RestaurantServiceDeps) {
    this.d = deps;
  }

  async updateDetails(slug: string, input: Partial<RestaurantDetails>): Promise<RestaurantDetails> {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    const next: RestaurantDetails = {
      name: (input.name ?? r.name).trim(), slug: (input.slug ?? r.slug).trim().toLowerCase(), address: (input.address ?? r.address).trim(),
      city: (input.city ?? r.city).trim(), wineDirector: (input.wineDirector ?? r.wineDirector).trim()
    };
    const fields: Record<string, string> = {};
    if (!next.name) fields.name = 'required';
    if (next.name.length > 120) fields.name = 'too_long';
    if (!next.wineDirector) fields.wineDirector = 'required';
    if (!next.address) fields.address = 'required';
    if (!next.city) fields.city = 'required';
    const slugProblem = validateSlug(next.slug);
    if (slugProblem) fields.slug = slugProblem;
    if (Object.keys(fields).length) throw new ValidationError('validation_failed', 'Check the highlighted details.', fields);
    try {
      await this.d.restaurantWriteRepository.updateDetails(r.id, next);
    } catch (e) {
      if (e instanceof InvariantError || (e as { code?: string })?.code === 'slug_taken') throw new ValidationError('slug_taken', 'Another restaurant already uses this address name.', { slug: 'taken' });
      throw e;
    }
    return next;
  }
}
