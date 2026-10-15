import type { Actor } from '../../auth/types';
import { RESTAURANT_TEXT_FIELDS, cleanTranslations, translationsVersion } from '../../i18n/content';
import { NotFoundError } from '../../errors';
import type { Repositories, RestaurantContent } from '../../ports/repositories';
import { parseWith } from '../../validators/parse';
import { dishTranslationsSchema, restaurantContentSchema, wineTranslationsSchema } from '../../validators/catalog/translations.schema';
import { checkTranslationsVersion, planDishTranslations, planRestaurantTranslations, planWineTranslations } from './translation-rules';

export type TranslationServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'contentWriteRepository'>;

/**
 * Commands that change translated content (spec 2026-10-15-bilingual-content, R6). Like every command: async (a
 * problem is a rejected promise), input through a schema, the change planned by pure rules
 * (`translation-rules.ts`) and written atomically through the port, `expectedVersion` against lost updates.
 * Dishes, wines and the restaurant have no audit trail yet, so `actor` is not stored; guests see the change after
 * the next publish (it counts as an unpublished change).
 */
export class TranslationService {
  private readonly d: TranslationServiceDeps;

  constructor(deps: TranslationServiceDeps) {
    this.d = deps;
  }

  private async restaurant(slug: string) {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r;
  }

  async setDishTranslations(slug: string, dishId: string, input: unknown, actor: Actor, expectedVersion?: string): Promise<{ changed: boolean }> {
    const values = parseWith(dishTranslationsSchema, input, 'Check the translations.');
    const r = await this.restaurant(slug);
    const dish = await this.d.dishRepository.findById(r.id, dishId);
    if (!dish) throw new NotFoundError('Dish');
    checkTranslationsVersion(dish.translations, expectedVersion);
    const plan = planDishTranslations(dish.translations, values);
    void actor;
    if (plan.changed) await this.d.contentWriteRepository.setDishTranslations(r.id, dish.id, plan.next, dish.translations);
    return { changed: plan.changed };
  }

  async setWineTranslations(slug: string, wineId: string, input: unknown, actor: Actor, expectedVersion?: string): Promise<{ changed: boolean }> {
    const values = parseWith(wineTranslationsSchema, input, 'Check the translations.');
    const r = await this.restaurant(slug);
    const wine = await this.d.wineRepository.findById(r.id, wineId);
    if (!wine) throw new NotFoundError('Wine');
    checkTranslationsVersion(wine.translations, expectedVersion);
    const plan = planWineTranslations(wine.translations, values);
    void actor;
    if (plan.changed) await this.d.contentWriteRepository.setWineTranslations(r.id, wine.id, plan.next, wine.translations);
    return { changed: plan.changed };
  }

  /** The language of the base fields and the tagline / city translations (A10 Setup). */
  async setRestaurantContent(slug: string, input: unknown, actor: Actor, expectedVersion?: string): Promise<{ changed: boolean }> {
    const values = parseWith(restaurantContentSchema, input, 'Check the translations.');
    const r = await this.restaurant(slug);
    const current: RestaurantContent = { contentLocale: r.contentLocale, translations: cleanTranslations(r.translations, RESTAURANT_TEXT_FIELDS) };
    checkTranslationsVersion(current, expectedVersion);
    const plan = planRestaurantTranslations(current.translations, values.translations);
    const changed = plan.changed || values.contentLocale !== current.contentLocale;
    void actor;
    if (changed) await this.d.contentWriteRepository.setRestaurantContent(r.id, { contentLocale: values.contentLocale, translations: plan.next }, current);
    return { changed };
  }
}

/** The fingerprint a form sends back as `version` (see `checkTranslationsVersion`). */
export const restaurantContentVersion = (r: { contentLocale: string; translations: unknown }): string =>
  translationsVersion({ contentLocale: r.contentLocale, translations: cleanTranslations(r.translations, RESTAURANT_TEXT_FIELDS) });
