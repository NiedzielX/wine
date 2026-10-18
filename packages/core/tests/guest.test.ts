import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DEFAULT_PREFS } from '../src/domain/types';
import {
  budgetOptions, canPairTable, MAX_TABLE_DISHES, parseDishIds, parseGuestPrefs, parsePeople, pickTableItem, prefsSummary, prefsToQuery,
  TABLE_PEOPLE_CHOICES, TABLE_PEOPLE_MORE, toQueryString, withBudget, withServing, withStyleToggled
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

describe('the whole table (spec 2026-10-16-whole-table-waiter-path)', () => {
  const published = ds.dishes.filter((d) => d.status === 'published');
  const savoury = published.filter((d) => d.category !== 'Desserts');
  const desserts = published.filter((d) => d.category === 'Desserts');

  it('offers the table only for at least two published dishes outside desserts', () => {
    expect(canPairTable(savoury.slice(0, 2))).toBe(true);
    expect(canPairTable(published)).toBe(true);
    expect(canPairTable([savoury[0], ...desserts])).toBe(false);
    expect(canPairTable(desserts)).toBe(false);
    expect(canPairTable([])).toBe(false);
    // a draft dish does not count
    expect(canPairTable([savoury[0], { ...savoury[1], status: 'draft' }])).toBe(false);
  });

  it('takes at most twelve dishes, the same limit as the API', () => {
    expect(MAX_TABLE_DISHES).toBe(12);
  });

  it('puts the chosen wine first and keeps the engine order for the others', async () => {
    const ids = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast'].map((n) => dish(n).id);
    const { result } = (await svc().forTable('halka', ids))!;
    const [a, b, c] = result.items;
    expect(pickTableItem(result.items, c.wine.id)).toEqual([c, a, b]);
    expect(pickTableItem(result.items, b.wine.id)).toEqual([b, a, c]);
    expect(pickTableItem(result.items, a.wine.id)).toEqual([a, b, c]);
  });

  it('ignores a wine that is not in the result, or none', async () => {
    const ids = ['Beef tartare', 'Duck breast'].map((n) => dish(n).id);
    const { result } = (await svc().forTable('halka', ids))!;
    const outside = ds.wines.find((w) => !result.items.some((i) => i.wine.id === w.id))!;
    expect(pickTableItem(result.items, outside.id)).toBe(result.items);
    expect(pickTableItem(result.items, null)).toBe(result.items);
    expect(pickTableItem(result.items, undefined)).toBe(result.items);
    expect(pickTableItem(result.items, '')).toBe(result.items);
    expect(pickTableItem([], 'x')).toEqual([]);
  });
});

describe('the number of people at the table (spec 2026-10-16-whole-table-waiter-path, F4, R14)', () => {
  // AC16 with the owner's decision Q4: no default — anything but an explicit 2–12 is null (no quantity)
  it('parses only a whole number from 2 to 12', () => {
    expect(parsePeople({ people: '4' })).toBe(4);
    expect(parsePeople({ people: '12' })).toBe(12);
    for (const people of ['1', '13', '2.5', 'x', '', ' 4', '04x', '-2', '100']) expect(parsePeople({ people })).toBeNull();
    expect(parsePeople({ people: ['4', '5'] })).toBeNull();
    expect(parsePeople({})).toBeNull();
  });

  it('offers 2–8 and "8+" (10), all accepted by the parser', () => {
    expect([...TABLE_PEOPLE_CHOICES]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const n of [...TABLE_PEOPLE_CHOICES, TABLE_PEOPLE_MORE]) expect(parsePeople({ people: String(n) })).toBe(n);
  });

  it('the service passes the chosen number to the table result; without it there is no quantity', async () => {
    const ids = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast'].map((n) => dish(n).id);
    const none = (await svc().forTable('halka', ids))!.result;
    expect(none.people).toBeNull();
    expect(none.items.every((i) => i.quantity === null)).toBe(true);
    const five = (await svc().forTable('halka', ids, {}, 'en', { people: 5 }))!.result;
    expect(five.people).toBe(5);
    expect(five.items[0].quantity).toMatchObject({ people: 5, bottles: 2 });
  });

  it('tableWineQuantity: the same rule for one bottle (G8), only with a choice, an active wine and two published dishes', async () => {
    const ids = ['Beef tartare', 'Wild mushroom risotto'].map((n) => dish(n).id);
    const savigny = wine('Savigny-lès-Beaune');
    const s = svc();
    // AC19 / the spec's example: Savigny 320 zł a bottle, 64 zł a glass → for 3 people 1 bottle + 1 glass, 384 zł
    expect(await s.tableWineQuantity('halka', savigny.id, ids, 3)).toEqual({ people: 3, bottles: 1, glasses: 1, total: 384 });
    expect(await s.tableWineQuantity('halka', savigny.id, ids, null)).toBeNull();
    expect(await s.tableWineQuantity('halka', savigny.id, ids, 13)).toBeNull();
    expect(await s.tableWineQuantity('halka', savigny.id, [ids[0]], 3)).toBeNull();
    expect(await s.tableWineQuantity('nope', savigny.id, ids, 3)).toBeNull();
    expect(await s.tableWineQuantity('halka', 'missing', ids, 3)).toBeNull();
    const inactive = ds.wines.find((w) => !w.active);
    if (inactive) expect(await s.tableWineQuantity('halka', inactive.id, ids, 3)).toBeNull();
    const sweet = ds.wines.find((w) => w.active && w.profile.style === 'sweet')!;
    expect(await s.tableWineQuantity('halka', sweet.id, ids, 3)).toBeNull();
  });
});
