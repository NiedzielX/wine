import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { DISHES, WINES } from '../src/demo/halka';
import type { Dish, GuestPreferences, Pairing, Wine } from '../src/domain/types';
import { DEFAULT_PREFS } from '../src/domain/types';
import { draftDishProfile, draftWineProfile, parseCsv, rowsToMenu } from '../src/engine/drafts';
import { ENGINE_FACTS } from '../src/engine/facts';
import {
  BEST_VALUE_WINDOW, BUDGET_FALLBACK_COUNT, budgetNotice, DEFAULT_LIMIT, MIN_MODEL_SCORE, recommendForDish, SOMMELIER_BOOST
} from '../src/engine/recommend';
import { BASE_SCORE, ENGINE_VERSION, MAX_SCORE, pairingScore } from '../src/engine/scoring';
import {
  COMPROMISE_THRESHOLD, recommendForTable, TABLE_FIT_THRESHOLD, TABLE_LIMIT, TABLE_MAINS_WEIGHT, TABLE_MAX_EXTRA_GLASSES, TABLE_MEAN_WEIGHT,
  TABLE_MIN_WEIGHT, TABLE_ML_PER_PERSON, TABLE_PEOPLE_MAX, TABLE_PEOPLE_MIN, TABLE_REJECTED_CAP, TABLE_SOMMELIER_BONUS, tableFit, tablePeople,
  tableQuantity, type TableDishScore, WEAK_DISH_THRESHOLD
} from '../src/engine/table';
import * as CoreIndex from '../src/index';

const dish = (id: string) => DISHES.find((d) => d.id === id) as Dish;
const wine = (id: string) => WINES.find((w) => w.id === id) as Wine;
const pairing = (over: Partial<Pairing>): Pairing => ({
  id: 'p1', dishId: 'd_duck', wineId: 'w_lapierre', status: 'approved', role: 'primary', rank: 1, comment: null, commentTranslations: {},
  modelScore: 0, source: 'sommelier', updatedBy: 'test', updatedAt: '2026-01-01', dirty: false, ...over
});

describe('pairingScore', () => {
  it('is deterministic', () => {
    const a = pairingScore(dish('d_ribeye'), wine('w_batailley'));
    const b = pairingScore(dish('d_ribeye'), wine('w_batailley'));
    expect(a).toEqual(b);
  });

  it('stays within 0–99 for every dish and wine', () => {
    for (const d of DISHES) for (const w of WINES) {
      const { score } = pairingScore(d, w);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(99);
    }
  });

  it('prefers structured reds with dry-aged beef over delicate whites', () => {
    expect(pairingScore(dish('d_ribeye'), wine('w_batailley')).score).toBeGreaterThan(pairingScore(dish('d_ribeye'), wine('w_loosen')).score + 20);
  });

  it('penalises high tannin with fish', () => {
    const f = pairingScore(dish('d_pikeperch'), wine('w_produttori')).factors.map((x) => x.rule);
    expect(f).toContain('tannin.fish');
  });

  it('rewards off-dry aromatic wine with spicy food', () => {
    const f = pairingScore(dish('d_porkbelly'), wine('w_loosen')).factors.map((x) => x.rule);
    expect(f).toContain('spice.offdry');
  });

  it('keeps dessert wine away from savoury mains', () => {
    expect(pairingScore(dish('d_ribeye'), wine('w_tokaji')).score).toBeLessThan(MIN_MODEL_SCORE);
  });

  it('wants the wine at least as sweet as the dessert', () => {
    expect(pairingScore(dish('d_chocolate'), wine('w_grahams')).score).toBeGreaterThan(pairingScore(dish('d_chocolate'), wine('w_vacheron')).score + 25);
  });

  it('explains with a guest-facing sentence', () => {
    const { why } = pairingScore(dish('d_venison'), wine('w_graillot'));
    expect(why).toMatch(/^[A-Z].+\.$/);
    expect(why.toLowerCase()).not.toContain('ai');
  });
});

describe('recommendForDish', () => {
  it('puts the sommelier primary pick first even when the engine scores another wine higher', () => {
    const d = dish('d_duck');
    const p = [pairing({ wineId: 'w_lapierre', role: 'primary' })];
    const res = recommendForDish(d, WINES, p, DEFAULT_PREFS);
    expect(res.items[0].wine.id).toBe('w_lapierre');
    expect(res.items[0].sommelier?.role).toBe('primary');
  });

  it('never shows a rejected pairing', () => {
    const d = dish('d_ribeye');
    const top = recommendForDish(d, WINES, [], DEFAULT_PREFS).items[0].wine.id;
    const res = recommendForDish(d, WINES, [pairing({ dishId: d.id, wineId: top, status: 'rejected', role: null })], DEFAULT_PREFS);
    expect(res.items.map((i) => i.wine.id)).not.toContain(top);
  });

  it('filters by the glass', () => {
    const res = recommendForDish(dish('d_ribeye'), WINES, [], { ...DEFAULT_PREFS, serving: 'glass' });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((i) => i.wine.glassPrice !== null)).toBe(true);
  });

  it('respects budget and relaxes it with a notice when nothing fits', () => {
    const within = recommendForDish(dish('d_duck'), WINES, [], { ...DEFAULT_PREFS, serving: 'bottle', maxPrice: 300 });
    expect(within.items.every((i) => i.wine.bottlePrice <= 300)).toBe(true);
    const tooLow = recommendForDish(dish('d_ribeye'), WINES, [], { ...DEFAULT_PREFS, serving: 'bottle', maxPrice: 50 });
    expect(tooLow.notice).not.toBeNull();
  });

  it('ignores inactive wines', () => {
    const res = recommendForDish(dish('d_venison'), WINES, [], DEFAULT_PREFS);
    expect(res.items.some((i) => !i.wine.active)).toBe(false);
  });

  it('returns at most four wines and marks at most one best value', () => {
    for (const d of DISHES) {
      const res = recommendForDish(d, WINES, [], DEFAULT_PREFS);
      expect(res.items.length).toBeLessThanOrEqual(4);
      expect(res.items.filter((i) => i.bestValue).length).toBeLessThanOrEqual(1);
    }
  });

  it('shows the honest engine score, not the boosted ranking score', () => {
    const d = dish('d_duck');
    const res = recommendForDish(d, WINES, [pairing({ wineId: 'w_lapierre' })], DEFAULT_PREFS);
    expect(res.items[0].matchScore).toBe(pairingScore(d, wine('w_lapierre')).score);
  });
});

describe('recommendForTable', () => {
  it('computes overall as 0.6 * weighted mean + 0.4 * weakest', () => {
    const dishes = [dish('d_tartare'), dish('d_risotto'), dish('d_duck')];
    const res = recommendForTable(dishes, WINES, [], DEFAULT_PREFS);
    const top = res.items[0];
    const weights = dishes.map((d) => (d.category === 'Mains' ? 1.5 : 1));
    const mean = top.perDish.reduce((s, x, i) => s + x.score * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
    expect(top.overall).toBe(Math.round(0.6 * mean + 0.4 * Math.min(...top.perDish.map((x) => x.score))));
  });

  it('sets desserts aside for the shared bottle', () => {
    const res = recommendForTable([dish('d_duck'), dish('d_chocolate')], WINES, [], DEFAULT_PREFS);
    expect(res.setAside.map((d) => d.id)).toEqual(['d_chocolate']);
  });

  it('suggests glasses per dish when the table pulls in different directions', () => {
    const res = recommendForTable([dish('d_pikeperch'), dish('d_ribeye')], WINES, [], DEFAULT_PREFS);
    expect(res.splitSuggested).toBe(true);
    expect(res.split.length).toBe(2);
  });

  it('is deterministic', () => {
    const dishes = [dish('d_tartare'), dish('d_duck')];
    expect(recommendForTable(dishes, WINES, [], DEFAULT_PREFS)).toEqual(recommendForTable(dishes, WINES, [], DEFAULT_PREFS));
  });

  // R1 / AC1: the displayed per-dish score is the raw engine score; the bonus and the cap only feed the ranking
  it('keeps the raw engine score per dish next to the ranking score', () => {
    const tartare = dish('d_tartare');
    const duck = dish('d_duck');
    const approved = pairing({ dishId: 'd_duck', wineId: 'w_lapierre', status: 'approved' });
    const item = recommendForTable([tartare, duck], WINES, [approved], DEFAULT_PREFS, WINES.length).items.find((i) => i.wine.id === 'w_lapierre')!;
    const duckScore = item.perDish.find((d) => d.dish.id === 'd_duck')!;
    expect(duckScore.engineScore).toBe(pairingScore(duck, wine('w_lapierre')).score);
    expect(duckScore.score).toBe(Math.min(MAX_SCORE, duckScore.engineScore + TABLE_SOMMELIER_BONUS));
    expect(duckScore).toMatchObject({ sommelierPick: true, rejected: false });

    // a rejected pair with a raw score above the cap: the raw score stays, the ranking score is capped
    const raw = pairingScore(duck, wine('w_savigny')).score;
    expect(raw).toBeGreaterThan(TABLE_REJECTED_CAP);
    const rejected = pairing({ dishId: 'd_duck', wineId: 'w_savigny', status: 'rejected', role: null, rank: null });
    const capped = recommendForTable([tartare, duck], WINES, [rejected], DEFAULT_PREFS, WINES.length).items
      .find((i) => i.wine.id === 'w_savigny')!.perDish.find((d) => d.dish.id === 'd_duck')!;
    expect(capped).toMatchObject({ engineScore: raw, score: TABLE_REJECTED_CAP, sommelierPick: false, rejected: true });
  });
});

const demo = buildDemoDataset({ ids: 'raw' });
const demoDishes = (ids: string[]) => ids.map((id) => demo.dishes.find((d) => d.id === id)!);
/** AC3 tables (spec 2026-10-16-whole-table-waiter-path) */
const SIX = ['d_herring', 'd_scallops', 'd_pikeperch', 'd_celeriac', 'd_ribeye', 'd_venison'];
const FOUR = ['d_tartare', 'd_risotto', 'd_duck', 'd_pikeperch'];

describe('table.fit', () => {
  const ds = (engineScores: number[], over: Array<Partial<TableDishScore>> = []): TableDishScore[] =>
    engineScores.map((s, i) => ({ dish: DISHES[i], score: s, engineScore: s, sommelierPick: false, rejected: false, ...over[i] }));

  it('counts the dishes at or above the threshold and lists the others, weakest first', () => {
    const perDish = ds([83, 93, 81, 67]);
    const fit = tableFit(perDish, 80);
    expect(fit).toMatchObject({ fits: 3, of: 4 });
    expect(fit.weaker).toEqual([perDish[3]]);
    expect(tableFit(ds([70, 99, 88]), 85)).toMatchObject({ fits: 3, of: 3, weaker: [] });
    expect(TABLE_FIT_THRESHOLD).toBe(70);
  });

  it('orders the weaker dishes by raw score, ties in the order of choice', () => {
    const perDish = ds([60, 90, 55, 60]);
    expect(tableFit(perDish, 70).weaker.map((d) => d.dish.id)).toEqual([perDish[2], perDish[0], perDish[3]].map((d) => d.dish.id));
  });

  it('counts the raw engine score, not the ranking score with the sommelier bonus', () => {
    const perDish = ds([90, 69], [{}, { score: 72, sommelierPick: true }]);
    expect(tableFit(perDish, 80)).toMatchObject({ fits: 1, weaker: [perDish[1]] });
  });

  it('never counts a pairing the sommelier rejected as a fit', () => {
    const perDish = ds([90, 85], [{}, { score: TABLE_REJECTED_CAP, rejected: true }]);
    expect(tableFit(perDish, 70)).toMatchObject({ fits: 1, weaker: [perDish[1]] });
  });

  it('marks a compromise with the same thresholds as the split suggestion; never for one dish', () => {
    expect(tableFit(ds([80, 80]), COMPROMISE_THRESHOLD - 1).compromise).toBe(true);
    expect(tableFit(ds([80, WEAK_DISH_THRESHOLD]), COMPROMISE_THRESHOLD).compromise).toBe(false);
    expect(tableFit(ds([80, WEAK_DISH_THRESHOLD - 1]), COMPROMISE_THRESHOLD).compromise).toBe(true);
    expect(tableFit(ds([40]), 40)).toMatchObject({ fits: 0, of: 1, compromise: false });
  });

  it('agrees with splitSuggested for the first bottle of every pair and trio of demo dishes', () => {
    const savoury = demo.dishes.filter((d) => d.category !== 'Desserts');
    for (let i = 0; i < savoury.length; i++) for (let j = i + 1; j < savoury.length; j++) for (const extra of [null, ...savoury.slice(j + 1)]) {
      const r = recommendForTable(extra ? [savoury[i], savoury[j], extra] : [savoury[i], savoury[j]], demo.wines, demo.pairings, DEFAULT_PREFS);
      expect(r.items[0].fit.compromise).toBe(r.splitSuggested);
    }
  });

  it('leaves set-aside desserts out of "of"', () => {
    const r = recommendForTable(demoDishes(['d_duck', 'd_risotto', 'd_chocolate']), demo.wines, demo.pairings, DEFAULT_PREFS);
    expect(r.items.every((i) => i.fit.of === 2)).toBe(true);
  });

  // AC3: the Halka tables from the spec; the order and overall are those of wm-rules-1.0.0 (the golden test pins all pairs and trios)
  it('Halka, six dishes: Radikon Slatnik works with 5 of 6, less so with the venison; ranking unchanged', () => {
    const r = recommendForTable(demoDishes(SIX), demo.wines, demo.pairings, DEFAULT_PREFS);
    expect(r.items.map((i) => [i.wine.id, i.overall])).toEqual([['w_radikon', 73], ['w_kumeu', 72], ['w_leflaive', 72]]);
    expect(r.items[0].fit).toMatchObject({ fits: 5, of: 6, compromise: true });
    expect(r.items[0].fit.weaker.map((d) => [d.dish.id, d.engineScore])).toEqual([['d_venison', 67]]);
  });

  it('Halka, four dishes: the first bottle works with all four; ranking unchanged', () => {
    const r = recommendForTable(demoDishes(FOUR), demo.wines, demo.pairings, DEFAULT_PREFS);
    expect(r.items.map((i) => [i.wine.id, i.overall])).toEqual([['w_leflaive', 86], ['w_radikon', 83], ['w_tempier', 82]]);
    expect(r.items[0].fit).toMatchObject({ fits: 4, of: 4, weaker: [], compromise: false });
  });
});

describe('table.budget_relaxed', () => {
  const table = () => demoDishes(FOUR);
  const prefs = (over: Partial<GuestPreferences>): GuestPreferences => ({ ...DEFAULT_PREFS, ...over });

  it('without the option the budget stays a hard filter (the API): no bottle, no notice', () => {
    for (const p of [prefs({ maxPrice: 150 }), prefs({ styles: ['red'], maxPrice: 200 })]) {
      const r = recommendForTable(table(), demo.wines, demo.pairings, p);
      expect(r).toMatchObject({ items: [], notice: null, splitSuggested: true });
    }
  });

  it('with the option, a budget that rules out every bottle is lifted: the closest bottles and a notice', () => {
    const r = recommendForTable(table(), demo.wines, demo.pairings, prefs({ maxPrice: 150 }), undefined, 'en', { relaxBudget: true });
    expect(r.items).toHaveLength(ENGINE_FACTS.budgetFallbackCount);
    expect(r.items.map((i) => i.wine.id)).toEqual(['w_leflaive', 'w_radikon']);
    expect(r.notice).toBe(budgetNotice(150, 'en'));
    expect(r.splitSuggested).toBe(r.items[0].fit.compromise);

    const red = recommendForTable(table(), demo.wines, demo.pairings, prefs({ styles: ['red'], maxPrice: 200 }), undefined, 'pl', { relaxBudget: true });
    expect(red.items).toHaveLength(2);
    expect(red.items.every((i) => i.wine.profile.style === 'red' && i.price > 200)).toBe(true);
    expect(red.notice).toBe(budgetNotice(200, 'pl'));
  });

  it('computes the split suggestion from the relaxed first bottle', () => {
    const r = recommendForTable(demoDishes(['d_pikeperch', 'd_ribeye']), demo.wines, demo.pairings, prefs({ maxPrice: 150 }), undefined, 'en', { relaxBudget: true });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.splitSuggested).toBe(r.items[0].fit.compromise);
    expect(r.split.length > 0).toBe(r.splitSuggested);
  });

  it('does nothing when the budget leaves bottles, or when the style alone leaves none', () => {
    const r = recommendForTable(table(), demo.wines, demo.pairings, prefs({ maxPrice: 400 }), undefined, 'en', { relaxBudget: true });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.notice).toBeNull();
    const noReds = demo.wines.filter((w) => w.profile.style !== 'red');
    const none = recommendForTable(table(), noReds, demo.pairings, prefs({ styles: ['red'], maxPrice: 150 }), undefined, 'en', { relaxBudget: true });
    expect(none).toMatchObject({ items: [], notice: null });
  });

  it('compares the budget with the table serving: bottle prices by default, glass prices when chosen', () => {
    const glass = recommendForTable(table(), demo.wines, demo.pairings, prefs({ serving: 'glass', maxPrice: 60 }), undefined, 'en', { relaxBudget: true });
    expect(glass.notice).toBeNull();
    expect(glass.items.every((i) => i.serving === 'glass' && i.price <= 60)).toBe(true);
  });

  it('leaves the ranking alone: the relaxed bottles are the first bottles without a budget', () => {
    const relaxed = recommendForTable(table(), demo.wines, demo.pairings, prefs({ maxPrice: 150 }), undefined, 'en', { relaxBudget: true });
    const unbounded = recommendForTable(table(), demo.wines, demo.pairings, DEFAULT_PREFS);
    expect(relaxed.items.map((i) => [i.wine.id, i.overall])).toEqual(unbounded.items.slice(0, 2).map((i) => [i.wine.id, i.overall]));
  });
});

describe('table.people_default', () => {
  // owner's decision Q4: no default number of people — a quantity only after an explicit choice
  it('accepts only a whole number of people from 2 to 12; anything else is no choice', () => {
    expect([TABLE_PEOPLE_MIN, TABLE_PEOPLE_MAX]).toEqual([2, 12]);
    for (const n of [2, 4, 12]) expect(tablePeople(n)).toBe(n);
    for (const n of [1, 13, 2.5, 0, -4, Number.NaN, null, undefined]) expect(tablePeople(n)).toBeNull();
  });

  it('without a chosen number there is no default: people null and no quantity on any bottle', () => {
    for (const options of [{}, { people: null }, { people: 1 }, { people: 13 }]) {
      const r = recommendForTable(demoDishes(SIX), demo.wines, demo.pairings, DEFAULT_PREFS, undefined, 'en', options);
      expect(r.people).toBeNull();
      expect(r.items.every((i) => i.quantity === null)).toBe(true);
    }
  });

  it('the number of people never changes the ranking (Q6)', () => {
    const plain = recommendForTable(demoDishes(SIX), demo.wines, demo.pairings, DEFAULT_PREFS);
    for (const people of [2, 5, 12]) {
      const r = recommendForTable(demoDishes(SIX), demo.wines, demo.pairings, DEFAULT_PREFS, undefined, 'en', { people });
      expect(r.people).toBe(people);
      expect(r.items.map((i) => [i.wine.id, i.overall, i.fit.fits])).toEqual(plain.items.map((i) => [i.wine.id, i.overall, i.fit.fits]));
      expect(r.splitSuggested).toBe(plain.splitSuggested);
    }
  });
});

describe('table.quantity', () => {
  const base = wine('w_radikon');
  const w = (over: Partial<Wine>, style = base.profile.style): Wine => ({ ...base, bottleSize: 750, bottlePrice: 300, glassPrice: 70, glassPour: 150, ...over, profile: { ...base.profile, style } });
  const q = (people: number, x: Wine) => { const r = tableQuantity(people, x); return r && [r.bottles, r.glasses]; };

  it('uses the owner-approved constants (Q3): 300 ml a person, up to 2 extra glasses', () => {
    expect(TABLE_ML_PER_PERSON).toBe(300);
    expect(TABLE_MAX_EXTRA_GLASSES).toBe(2);
  });

  // AC17
  it('750 ml bottle, 150 ml glass with a price: full bottles, then up to two glasses instead of another bottle', () => {
    const x = w({});
    expect([2, 3, 4, 5, 6, 8].map((n) => q(n, x))).toEqual([[1, 0], [1, 1], [2, 0], [2, 0], [2, 2], [3, 1]]);
  });

  it('without a glass price the rest is one more bottle', () => {
    const x = w({ glassPrice: null });
    expect([3, 6].map((n) => q(n, x))).toEqual([[2, 0], [3, 0]]);
  });

  it('a 125 ml pour takes more glasses for the same rest', () => {
    expect(q(3, w({ glassPour: 125 }))).toEqual([1, 2]);
  });

  it('the total is the bottles and the glasses at their prices; always at least one bottle', () => {
    expect(tableQuantity(6, w({}))).toEqual({ people: 6, bottles: 2, glasses: 2, total: 2 * 300 + 2 * 70 });
    expect(tableQuantity(2, w({ bottleSize: 1500, glassPour: 300 }))).toEqual({ people: 2, bottles: 1, glasses: 0, total: 300 });
  });

  it('no quantity for a sweet wine or a table served by the glass', () => {
    expect(tableQuantity(4, w({}, 'sweet'))).toBeNull();
    expect(tableQuantity(4, w({}), 'glass')).toBeNull();
    const glass = recommendForTable(demoDishes(FOUR), demo.wines, demo.pairings, { ...DEFAULT_PREFS, serving: 'glass' }, undefined, 'en', { people: 4 });
    expect(glass.items.length).toBeGreaterThan(0);
    expect(glass.items.every((i) => i.serving === 'glass' && i.quantity === null)).toBe(true);
  });

  // AC18 — with Q4 the number of people is chosen (no default), here the six people of the six-dish table
  it('Halka, six dishes for six people: Radikon Slatnik, 3 bottles, no glasses, 960 zł', () => {
    const r = recommendForTable(demoDishes(SIX), demo.wines, demo.pairings, DEFAULT_PREFS, undefined, 'en', { people: 6 });
    expect(r.items[0].wine.id).toBe('w_radikon');
    expect(r.items[0].quantity).toEqual({ people: 6, bottles: 3, glasses: 0, total: 960 });
    expect(r.items.every((i) => i.quantity !== null)).toBe(true);
  });
});

describe('ENGINE_VERSION', () => {
  it('is wm-rules-1.2.0 (minor: table.people_default and table.quantity are new rules; results unchanged)', () => {
    expect(ENGINE_VERSION).toBe('wm-rules-1.2.0');
  });
});

describe('import drafting', () => {
  it('parses quoted CSV and flags missing prices', () => {
    const rows = rowsToMenu(parseCsv('category,name,description,price\nMains,"Veal, schnitzel","Breaded, lemon",\n'));
    expect(rows[0].name).toBe('Veal, schnitzel');
    expect(rows[0].issues).toContain('Missing price');
  });

  it('drafts a dish profile from the description', () => {
    const p = draftDishProfile('Grilled cauliflower', 'charred, tahini, chili', 'Mains');
    expect(p.smoke).toBeGreaterThanOrEqual(3);
    expect(p.spice).toBeGreaterThanOrEqual(3);
    expect(p.source).toBe('draft');
  });

  it('drafts a wine profile from grape and style', () => {
    expect(draftWineProfile('Nebbiolo', 'Red').tannin).toBe(5);
    expect(draftWineProfile('Chardonnay', 'Champagne Brut').style).toBe('sparkling');
  });
});

describe('import drafting edge cases', () => {
  it('treats a vegetable "steak" as vegetable, not beef', () => {
    expect(draftDishProfile('Grilled cauliflower steak', 'charred, tahini', 'Mains').protein).toBe('vegetable');
  });
});

describe('ENGINE_FACTS', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(ENGINE_FACTS)).toBe(true);
    expect(() => { (ENGINE_FACTS as { baseScore: number }).baseScore = 1; }).toThrow(TypeError);
  });

  it('holds exactly the constants the engine uses', () => {
    expect(ENGINE_FACTS).toEqual({
      baseScore: BASE_SCORE,
      maxScore: MAX_SCORE,
      minModelScore: MIN_MODEL_SCORE,
      sommelierRankBoost: SOMMELIER_BOOST,
      dishLimit: DEFAULT_LIMIT,
      budgetFallbackCount: BUDGET_FALLBACK_COUNT,
      bestValueWindow: BEST_VALUE_WINDOW,
      tableLimit: TABLE_LIMIT,
      tableMeanWeight: TABLE_MEAN_WEIGHT,
      tableMinWeight: TABLE_MIN_WEIGHT,
      tableMainsWeight: TABLE_MAINS_WEIGHT,
      tableSommelierBonus: TABLE_SOMMELIER_BONUS,
      tableRejectedCap: TABLE_REJECTED_CAP,
      tableFitThreshold: TABLE_FIT_THRESHOLD,
      tableMlPerPerson: TABLE_ML_PER_PERSON,
      tableMaxExtraGlasses: TABLE_MAX_EXTRA_GLASSES,
      tablePeopleMin: TABLE_PEOPLE_MIN,
      tablePeopleMax: TABLE_PEOPLE_MAX,
      compromiseThreshold: COMPROMISE_THRESHOLD,
      weakDishThreshold: WEAK_DISH_THRESHOLD
    });
  });

  it('is exported from the package entry point', () => {
    expect(CoreIndex.ENGINE_FACTS).toBe(ENGINE_FACTS);
  });

  it('drives the engine: the list limits and the score cap are the named constants', () => {
    const ribeye = dish('d_ribeye');
    expect(recommendForDish(ribeye, WINES, [], DEFAULT_PREFS).items).toHaveLength(ENGINE_FACTS.dishLimit);
    expect(recommendForDish(ribeye, WINES, [], { ...DEFAULT_PREFS, maxPrice: 0 }).items).toHaveLength(ENGINE_FACTS.budgetFallbackCount);
    expect(recommendForTable([ribeye, dish('d_duck')], WINES, [], DEFAULT_PREFS).items).toHaveLength(ENGINE_FACTS.tableLimit);
    for (const d of DISHES) for (const w of WINES) expect(pairingScore(d, w).score).toBeLessThanOrEqual(ENGINE_FACTS.maxScore);
  });
});
