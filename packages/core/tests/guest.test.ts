import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEFAULT_PREFS } from '../src/domain/types';
import {
  budgetOptions, parseDishIds, parseGuestPrefs, prefsSummary, prefsToQuery, toQueryString,
  withBudget, withServing, withStyleToggled
} from '../src/guest/prefs';
import { tasteWords } from '../src/guest/taste';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { RecommendationService } from '../src/services/guest/recommendation-service';

const ds = buildDemoDataset({ ids: 'uuid' });
const svc = () => new RecommendationService(createMemoryRepositories(MemoryStore.from(ds)));
const dish = (name: string) => ds.dishes.find((d) => d.name === name)!;
const wine = (name: string) => ds.wines.find((w) => w.name === name)!;

describe('guest preferences in the URL', () => {
  it('parses nothing into the defaults', () => {
    expect(parseGuestPrefs({})).toEqual(DEFAULT_PREFS);
  });

  it('round-trips every preference through the query string', () => {
    const p = { serving: 'glass', styles: ['red', 'white'], maxPrice: 60, weight: 'lighter', mood: 'adventurous' } as const;
    const q = prefsToQuery({ ...p, styles: [...p.styles] });
    expect(parseGuestPrefs(q)).toEqual({ ...p, styles: ['white', 'red'] }); // styles come back in list order
    expect(toQueryString(q)).toBe('?serving=glass&styles=white%2Cred&maxPrice=60&weight=lighter&mood=adventurous');
  });

  it('serialises only non-default values', () => {
    expect(prefsToQuery(DEFAULT_PREFS)).toEqual({});
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ a: undefined, b: '', c: 'x y' })).toBe('?c=x%20y');
  });

  it('ignores invalid values and accepts repeated form fields', () => {
    expect(parseGuestPrefs({ serving: 'sip', maxPrice: '-3', styles: ['red', 'purple', 'white,red'], weight: 'x', mood: '' }))
      .toEqual({ ...DEFAULT_PREFS, styles: ['white', 'red'] });   // canonical order, whatever the order in the URL
    expect(parseGuestPrefs({ maxPrice: '' }).maxPrice).toBeNull();
  });

  it('switching glass/bottle drops the budget, other changes keep it', () => {
    const p = withBudget(withServing(DEFAULT_PREFS, 'glass'), 60);
    expect(withServing(p, 'glass').maxPrice).toBe(60);
    expect(withServing(p, 'bottle').maxPrice).toBeNull();
    expect(withBudget(p, null).maxPrice).toBeNull();
  });

  it('toggles styles on and off and describes active preferences', () => {
    const on = withStyleToggled(DEFAULT_PREFS, 'red');
    expect(on.styles).toEqual(['red']);
    expect(withStyleToggled(on, 'red').styles).toEqual([]);
    expect(prefsSummary({ ...on, serving: 'glass', maxPrice: 60 })).toEqual(['By the glass', 'Red', 'Up to 60 zł']);
    expect(budgetOptions('glass')).toEqual([45, 60, 75]);
    expect(budgetOptions('any')).toEqual([200, 300, 400]);
  });

  it('collects table dishes from repeated or comma-separated fields without duplicates', () => {
    expect(parseDishIds({ dish: ['a', 'b', 'a'], dishes: 'c,b' })).toEqual(['a', 'b', 'c']);
    expect(parseDishIds({})).toEqual([]);
  });
});

describe('tasteWords', () => {
  it('describes a dish in at most four words', () => {
    const words = tasteWords(dish('Dry-aged ribeye, 300 g'));
    expect(words.length).toBeLessThanOrEqual(4);
    expect(words).toContain('Full-flavoured');
    expect(tasteWords(dish('Baltic herring'))).toContain('Salty');
  });
});

describe('RecommendationService.wineDetails', () => {
  it('returns the wine with its match and the sommelier note for a dish', async () => {
    const out = await svc().wineDetails('halka', wine('Savigny-lès-Beaune').id, dish('Duck breast').id);
    expect(out!.dish!.name).toBe('Duck breast');
    expect(out!.match!.sommelier?.role).toBe('primary');
    expect(out!.match!.matchScore).toBe(80);
    expect(out!.wine.listNumber).toBe(112);
  });

  it('returns the wine without a match when no dish is given or the dish is not published', async () => {
    const plain = await svc().wineDetails('halka', wine('Morgon').id);
    expect(plain!.match).toBeNull();
    const draft = await svc().wineDetails('halka', wine('Morgon').id, ds.dishes.find((d) => d.status === 'draft')!.id);
    expect(draft!.dish).toBeNull();
    expect(draft!.match).toBeNull();
  });

  it('returns inactive wines (the page says they are unavailable) but never a match for them', async () => {
    const out = await svc().wineDetails('halka', wine('Hochar Père et Fils').id, dish('Duck breast').id);
    expect(out!.wine.active).toBe(false);
    expect(out!.match).toBeNull();
  });

  it('returns null for an unknown restaurant or wine', async () => {
    expect(await svc().wineDetails('nope', wine('Morgon').id)).toBeNull();
    expect(await svc().wineDetails('halka', '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
