import type { OnceRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { Repositories } from '../ports/repositories';

/**
 * Behaviour every Repositories implementation must have. Used by the memory tests in core and
 * by the PostgreSQL integration tests in db, so both data sources are held to one contract.
 * Framework-agnostic: pass in your test runner's `it` and `expect`.
 */
export function repositoryContract(
  name: string,
  setup: () => Promise<{ repos: Repositories; dataset: DemoDataset; teardown?: () => Promise<void> }>,
  t: OnceRunner
): void {
  t.describe(`repository contract: ${name}`, () => {
    let repos: Repositories;
    let ds: DemoDataset;
    let teardown: (() => Promise<void>) | undefined;
    t.beforeAll(async () => { ({ repos, dataset: ds, teardown } = await setup()); });
    t.afterAll(async () => { await teardown?.(); });

    t.it('finds a restaurant by slug and returns null for unknown slugs', async () => {
      t.expect((await repos.restaurantRepository.findBySlug(ds.restaurant.slug))?.id).toBe(ds.restaurant.id);
      t.expect(await repos.restaurantRepository.findBySlug('no-such-place')).toBeNull();
    });

    t.it('returns dishes equal to the dataset, scoped by restaurant', async () => {
      const all = await repos.dishRepository.listByRestaurant(ds.restaurant.id);
      t.expect(all.length).toBe(ds.dishes.length);
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      t.expect(await repos.dishRepository.findById(ds.restaurant.id, duck.id)).toEqual(duck);
      t.expect(await repos.dishRepository.findById('00000000-0000-4000-8000-000000000000', duck.id)).toBeNull();
    });

    t.it('filters dishes by status', async () => {
      const published = await repos.dishRepository.listByRestaurant(ds.restaurant.id, { statuses: ['published'] });
      t.expect(published.length).toBe(ds.dishes.filter((d) => d.status === 'published').length);
    });

    t.it('returns wines equal to the dataset and filters inactive ones', async () => {
      const all = await repos.wineRepository.listByRestaurant(ds.restaurant.id);
      const byId = new Map(all.map((w) => [w.id, w]));
      for (const w of ds.wines) t.expect(byId.get(w.id)).toEqual(w);
      const active = await repos.wineRepository.listByRestaurant(ds.restaurant.id, { activeOnly: true });
      t.expect(active.every((w) => w.active)).toBe(true);
      t.expect(active.length).toBe(ds.wines.filter((w) => w.active).length);
    });

    t.it('finds a wine by id within its restaurant only', async () => {
      const wine = ds.wines.find((w) => w.glassPrice === null)!;
      t.expect(await repos.wineRepository.findById(ds.restaurant.id, wine.id)).toEqual(wine);
      t.expect(await repos.wineRepository.findById('00000000-0000-4000-8000-000000000000', wine.id)).toBeNull();
      t.expect(await repos.wineRepository.findById(ds.restaurant.id, '00000000-0000-4000-8000-000000000000')).toBeNull();
    });

    t.it('keeps the content language and every translation as stored (spec 2026-10-15-bilingual-content)', async () => {
      const r = (await repos.restaurantRepository.findBySlug(ds.restaurant.slug))!;
      t.expect({ contentLocale: r.contentLocale, translations: r.translations }).toEqual({ contentLocale: ds.restaurant.contentLocale, translations: ds.restaurant.translations });
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      t.expect((await repos.dishRepository.findById(ds.restaurant.id, duck.id))!.translations).toEqual(duck.translations);
      const noted = ds.pairings.find((p) => Object.keys(p.commentTranslations).length > 0)!;
      t.expect((await repos.pairingRepository.findById(ds.restaurant.id, noted.id))!.commentTranslations).toEqual(noted.commentTranslations);
      const published = await repos.publishRepository.publishedContent(ds.restaurant.id);
      t.expect(published.dishes.get(duck.id)).toEqual(duck.translations);
      t.expect(published.restaurant).toEqual(ds.restaurant.translations);
      t.expect((await repos.pairingRepository.listPublishedByDish(ds.restaurant.id, noted.dishId)).find((p) => p.id === noted.id)!.commentTranslations).toEqual(noted.commentTranslations);
      t.expect((await repos.publishRepository.publishedContent('00000000-0000-4000-8000-000000000000')).dishes.size).toBe(0);
    });

    t.it('returns pairings by restaurant and by dish with the sommelier fields intact', async () => {
      const all = await repos.pairingRepository.listByRestaurant(ds.restaurant.id);
      t.expect(all.length).toBe(ds.pairings.length);
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const forDuck = await repos.pairingRepository.listByDish(ds.restaurant.id, duck.id);
      const primary = forDuck.find((p) => p.role === 'primary')!;
      const expected = ds.pairings.find((p) => p.id === primary.id)!;
      t.expect({ ...primary, updatedAt: '', version: undefined }).toEqual({ ...expected, updatedAt: '', version: undefined });
    });
  });
}
