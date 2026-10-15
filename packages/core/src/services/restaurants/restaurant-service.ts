import { InvariantError, NotFoundError, ValidationError } from '../../errors';
import type { Repositories, RestaurantDetails } from '../../ports/repositories';

export type RestaurantServiceDeps = Pick<Repositories, 'restaurantRepository' | 'restaurantWriteRepository'>;

/** Words that would collide with routes of the application. */
export const RESERVED_SLUGS = ['login', 'api', 'r', 'admin', 'static', 'assets', '_next', 'new', 'null', 'undefined'];
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    if (next.slug.length < 2 || next.slug.length > 40 || !SLUG_PATTERN.test(next.slug)) fields.slug = 'invalid';
    else if (RESERVED_SLUGS.includes(next.slug)) fields.slug = 'reserved';
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
