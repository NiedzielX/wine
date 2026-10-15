import { describe, expect, it } from 'vitest';
import { DISHES, WINES } from '../src/demo/halka';
import type { Dish, Pairing, Wine } from '../src/domain/types';
import { DEFAULT_PREFS } from '../src/domain/types';
import { draftDishProfile, draftWineProfile, parseCsv, rowsToMenu } from '../src/engine/drafts';
import { MIN_MODEL_SCORE, recommendForDish } from '../src/engine/recommend';
import { pairingScore } from '../src/engine/scoring';
import { recommendForTable } from '../src/engine/table';

const dish = (id: string) => DISHES.find((d) => d.id === id) as Dish;
const wine = (id: string) => WINES.find((w) => w.id === id) as Wine;
const pairing = (over: Partial<Pairing>): Pairing => ({
  id: 'p1', dishId: 'd_duck', wineId: 'w_lapierre', status: 'approved', role: 'primary', rank: 1, comment: null,
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
