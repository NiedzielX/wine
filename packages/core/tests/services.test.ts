import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, demoUuid } from '../src/demo/dataset';
import { budgetNotice, recommendForDish } from '../src/engine/recommend';
import { MAX_TABLE_DISHES } from '../src/guest/prefs';
import { DEFAULT_PREFS } from '../src/domain/types';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { RecommendationService, TableNeedsTwoDishesError } from '../src/services/guest/recommendation-service';
import { repositoryContract } from '../src/testing/repository-contract';

const ds = buildDemoDataset({ ids: 'uuid' });
const repos = () => createMemoryRepositories(MemoryStore.from(ds));
const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;

repositoryContract('memory', async () => ({ repos: repos(), dataset: ds }), { describe, it, expect, beforeAll, afterAll });

describe('demo dataset', () => {
  it('maps ids to stable UUIDs', () => {
    expect(demoUuid('d_duck')).toBe(demoUuid('d_duck'));
    expect(demoUuid('d_duck')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ds.pairings.map((p) => p.id)).size).toBe(ds.pairings.length);
  });

  it('is identical in raw and uuid form apart from ids', () => {
    const raw = buildDemoDataset({ ids: 'raw' });
    expect(raw.pairings.length).toBe(ds.pairings.length);
    expect(raw.dishes.map((d) => d.name)).toEqual(ds.dishes.map((d) => d.name));
  });
});

describe('RecommendationService', () => {
  it('returns exactly what the engine returns for the same data', async () => {
    const svc = new RecommendationService(repos());
    const out = await svc.forDish('halka', duck.id, { serving: 'glass' });
    const direct = recommendForDish(duck, ds.wines.filter((w) => w.active), ds.pairings.filter((p) => p.dishId === duck.id), { ...DEFAULT_PREFS, serving: 'glass' });
    expect(out?.result.items.map((i) => [i.wine.id, i.matchScore, i.tier])).toEqual(direct.items.map((i) => [i.wine.id, i.matchScore, i.tier]));
    expect(out?.result.items[0].sommelier?.role).toBe('primary');
  });

  it('returns null for unknown restaurant, unknown dish or unpublished dish', async () => {
    const svc = new RecommendationService(repos());
    expect(await svc.forDish('nope', duck.id)).toBeNull();
    expect(await svc.forDish('halka', demoUuid('d_missing'))).toBeNull();
    const draft = ds.dishes.find((d) => d.status === 'draft')!;
    expect(await svc.forDish('halka', draft.id)).toBeNull();
  });

  it('hides engine picks when the restaurant turns off unreviewed suggestions', async () => {
    const custom = buildDemoDataset({ ids: 'uuid' });
    custom.restaurant.settings = { showUnreviewed: false, showScores: true };
    const svc = new RecommendationService(createMemoryRepositories(MemoryStore.from(custom)));
    const out = await svc.forDish('halka', duck.id);
    expect(out!.result.items.length).toBeGreaterThan(0);
    expect(out!.result.items.every((i) => i.tier < 2)).toBe(true);
  });

  it('pairs a bottle for the table and rejects fewer than two dishes', async () => {
    const svc = new RecommendationService(repos());
    const ids = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast'].map((n) => ds.dishes.find((d) => d.name === n)!.id);
    const out = await svc.forTable('halka', ids);
    expect(out!.result.items[0].wine.name).toBe('Savigny-lès-Beaune');
    await expect(svc.forTable('halka', [ids[0]])).rejects.toBeInstanceOf(TableNeedsTwoDishesError);
  });

  it('uses the first twelve published dishes of a larger table', async () => {
    const svc = new RecommendationService(repos());
    const published = ds.dishes.filter((d) => d.status === 'published');
    expect(published).toHaveLength(14);
    const out = await svc.forTable('halka', published.map((d) => d.id));
    const used = [...out!.result.items[0].perDish.map((d) => d.dish.id), ...out!.result.setAside.map((d) => d.id)];
    expect(used).toHaveLength(MAX_TABLE_DISHES);
    // the menu order puts desserts last, so they are the ones left out
    expect(new Set(used)).toEqual(new Set(published.slice(0, MAX_TABLE_DISHES).map((d) => d.id)));
    expect(out!.result.setAside).toEqual([]);
  });

  it('relaxes the budget only when asked (the screens), never by default (the API)', async () => {
    const svc = new RecommendationService(repos());
    const ids = ['Beef tartare', 'Wild mushroom risotto'].map((n) => ds.dishes.find((d) => d.name === n)!.id);
    const strict = await svc.forTable('halka', ids, { maxPrice: 150 });
    expect(strict!.result).toMatchObject({ items: [], notice: null });
    const relaxed = await svc.forTable('halka', ids, { maxPrice: 150 }, 'pl', { relaxBudget: true });
    expect(relaxed!.result.items).toHaveLength(2);
    expect(relaxed!.result.notice).toBe(budgetNotice(150, 'pl'));
  });
});

describe('CatalogService', () => {
  it('lists the published menu and orders dish pairings with reviewed first', async () => {
    const svc = new CatalogService(repos());
    const menu = await svc.publishedMenu('halka');
    expect(menu!.dishes.every((d) => d.status === 'published')).toBe(true);
    const p = await svc.dishPairings('halka', duck.id);
    expect(p!.pairings[0].role).toBe('primary');
    expect(p!.pairings[0].why).toContain('signature');
    expect(p!.pairings.findIndex((x) => x.status === 'suggested')).toBeGreaterThan(p!.pairings.findLastIndex((x) => x.status === 'approved' || x.status === 'modified'));
  });

  it('returns a published dish only, and tells which dishes have a sommelier primary', async () => {
    const svc = new CatalogService(repos());
    expect((await svc.publishedDish('halka', duck.id))!.dish.name).toBe('Duck breast');
    expect(await svc.publishedDish('halka', ds.dishes.find((d) => d.status === 'draft')!.id)).toBeNull();
    expect(await svc.publishedDish('nope', duck.id)).toBeNull();
    const cov = await svc.pairingCoverage(ds.restaurant.id);
    expect(cov.get(duck.id)!.hasPrimary).toBe(true);
    const pork = ds.dishes.find((d) => d.name === 'Glazed pork belly')!;
    expect(cov.get(pork.id)?.hasPrimary ?? false).toBe(false);
  });
});
