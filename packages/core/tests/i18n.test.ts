import { describe, expect, it } from 'vitest';
import { DISHES, WINES } from '../src/demo/halka';
import type { Dish, Wine } from '../src/domain/types';
import { DEFAULT_PREFS } from '../src/domain/types';
import { budgetNotice, recommendForDish } from '../src/engine/recommend';
import { explain, pairingScore, styleWord, type Factor } from '../src/engine/scoring';
import { recommendForTable } from '../src/engine/table';
import { prefsSummary, STYLE_LABELS, styleLabel, WINE_STYLES } from '../src/guest/prefs';
import { tasteWords } from '../src/guest/taste';
import { isLocale, LOCALES, pickLocale } from '../src/i18n/locale';

const dish = (id: string) => DISHES.find((d) => d.id === id) as Dish;
const wine = (id: string) => WINES.find((w) => w.id === id) as Wine;

describe('pickLocale and isLocale', () => {
  it('picks the best supported language from Accept-Language, English otherwise', () => {
    expect(pickLocale('pl-PL')).toBe('pl');
    expect(pickLocale('pl-PL,pl;q=0.9,en-US;q=0.8')).toBe('pl');
    expect(pickLocale('en-GB')).toBe('en');
    expect(pickLocale('de, pl;q=0.8')).toBe('pl');
    expect(pickLocale('de, en;q=0.5, pl;q=0.8')).toBe('pl');
    expect(pickLocale('en;q=0.9, PL')).toBe('pl');
    expect(pickLocale('pl;q=0, en;q=0.1')).toBe('en');
    expect(pickLocale('de-DE, fr')).toBe('en');
    expect(pickLocale('*')).toBe('en');
    expect(pickLocale('')).toBe('en');
    expect(pickLocale(null)).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
  });

  it('knows exactly the two languages', () => {
    expect(LOCALES).toEqual(['pl', 'en']);
    expect(isLocale('pl')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe('engine texts in Polish', () => {
  it('every factor with an English phrase has a Polish one, for every demo dish and wine', () => {
    let seen = 0;
    for (const d of DISHES) for (const w of WINES) {
      for (const f of pairingScore(d, w).factors) {
        if (!f.why) { expect(f.whyPl).toBeUndefined(); continue; }
        seen++;
        expect(f.whyPl, f.rule).toBeTruthy();
        expect(f.whyPl).not.toBe(f.why);
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('the score and the factors do not depend on the language; English is the default', () => {
    const en = pairingScore(dish('d_venison'), wine('w_graillot'));
    const pl = pairingScore(dish('d_venison'), wine('w_graillot'), 'pl');
    expect(pl.score).toBe(en.score);
    expect(pl.factors).toEqual(en.factors);
    expect(pairingScore(dish('d_venison'), wine('w_graillot'), 'en').why).toBe(en.why);
    expect(pl.why).not.toBe(en.why);
    expect(pl.why).toMatch(/^[A-ZŁŚŻŹĆ].+\.$/);
  });

  it('composes two Polish phrases with ", a" and falls back to a natural sentence', () => {
    const factors: Factor[] = [
      { rule: 'weight.match', delta: 4, why: 'its weight matches the dish', whyPl: 'jego budowa pasuje do dania' },
      { rule: 'acid.cuts_fat', delta: 5, why: 'fresh acidity cuts through the richness', whyPl: 'świeża kwasowość równoważy bogactwo potrawy' }
    ];
    expect(explain(factors, wine('w_graillot'), 'pl')).toBe('Świeża kwasowość równoważy bogactwo potrawy, a jego budowa pasuje do dania.');
    expect(explain(factors, wine('w_graillot'))).toBe('Fresh acidity cuts through the richness, and its weight matches the dish.');
    expect(explain([factors[0]], wine('w_graillot'), 'pl')).toBe('Jego budowa pasuje do dania.');
    expect(explain([{ rule: 'x', delta: 3, why: 'only english' }], wine('w_graillot'), 'pl')).toBe('Only english.');
    const red = WINES.find((w) => w.profile.style === 'red')!;
    expect(explain([], red, 'pl')).toBe('Wszechstronne, zrównoważone wino czerwone, które dobrze pasuje do tego dania.');
    expect(explain([], red)).toBe('A balanced, food-friendly red wine for this dish.');
    expect(styleWord(red, 'pl')).toBe('wino czerwone');
  });

  it('recommendations and the budget notice follow the locale; without one they stay English', () => {
    const prefs = { ...DEFAULT_PREFS, serving: 'bottle' as const, maxPrice: 50 };
    const en = recommendForDish(dish('d_ribeye'), WINES, [], prefs);
    const pl = recommendForDish(dish('d_ribeye'), WINES, [], prefs, undefined, 'pl');
    expect(en.notice).toBe(budgetNotice(50));
    expect(en.notice).toContain('Nothing matches under 50 zł');
    expect(pl.notice).toBe('Nic nie mieści się w budżecie do 50 zł. Oto najbliższe propozycje.');
    expect(pl.items.map((i) => i.wine.id)).toEqual(en.items.map((i) => i.wine.id));
    expect(pl.items[0].why).not.toBe(en.items[0].why);
  });

  it('table reasons are in Polish with dish names as written', () => {
    const dishes = [dish('d_tartare'), dish('d_risotto'), dish('d_duck')];
    const en = recommendForTable(dishes, WINES, [], DEFAULT_PREFS);
    const pl = recommendForTable(dishes, WINES, [], DEFAULT_PREFS, 3, 'pl');
    expect(pl.items.map((i) => i.wine.id)).toEqual(en.items.map((i) => i.wine.id));
    expect(en.items[0].why).toMatch(/^(Works|Strongest|Best)/);
    expect(pl.items[0].why).toMatch(/^(Pasuje|Najlepiej)/);
  });
});

describe('guest labels in Polish', () => {
  it('taste words', () => {
    const ribeye = DISHES.find((d) => d.name.startsWith('Dry-aged ribeye'))!;
    expect(tasteWords(ribeye)).toContain('Full-flavoured');
    expect(tasteWords(ribeye, 'pl')).toContain('Wyrazisty');
    expect(tasteWords(ribeye, 'pl')).toHaveLength(tasteWords(ribeye).length);
    const herring = DISHES.find((d) => d.name === 'Baltic herring')!;
    expect(tasteWords(herring, 'pl')).toContain('Słony');
  });

  it('style labels and the preference summary; the old English map stays', () => {
    expect(styleLabel('red')).toBe('Red');
    expect(styleLabel('red', 'pl')).toBe('Czerwone');
    expect(WINE_STYLES.map((s) => styleLabel(s))).toEqual(WINE_STYLES.map((s) => STYLE_LABELS[s]));
    const p = { ...DEFAULT_PREFS, serving: 'glass' as const, styles: ['red' as const], maxPrice: 60, weight: 'lighter' as const, mood: 'adventurous' as const };
    expect(prefsSummary(p)).toEqual(['By the glass', 'Red', 'Up to 60 zł', 'Lighter', 'Adventurous']);
    expect(prefsSummary(p, 'pl')).toEqual(['Na kieliszki', 'Czerwone', 'Do 60 zł', 'Lżejsze', 'Odważne']);
  });
});

describe('RecommendationService locale', () => {
  it('answers in English unless a locale is passed; the sommelier note is never translated', async () => {
    const { buildDemoDataset } = await import('../src/demo/dataset');
    const { createMemoryRepositories, MemoryStore } = await import('../src/memory/memory-repositories');
    const { RecommendationService } = await import('../src/services/guest/recommendation-service');
    const ds = buildDemoDataset({ ids: 'uuid' });
    const svc = new RecommendationService(createMemoryRepositories(MemoryStore.from(ds)));
    const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
    const en = (await svc.forDish('halka', duck.id))!.result.items;
    const pl = (await svc.forDish('halka', duck.id, {}, undefined, 'pl'))!.result.items;
    expect(pl[0].why).toBe(en[0].why);   // the sommelier's note, as written
    const engineRow = en.findIndex((i) => !i.sommelier?.comment);
    expect(pl[engineRow].why).not.toBe(en[engineRow].why);
    const table = (await svc.forTable('halka', ds.dishes.slice(0, 3).map((d) => d.id), {}, 'pl'))!;
    expect(table.result.items[0].why).toMatch(/^(Pasuje|Najlepiej)/);
    const details = (await svc.wineDetails('halka', en[engineRow].wine.id, duck.id, 'pl'))!;
    expect(details.match!.why).toBe(pl[engineRow].why);
  });
});
