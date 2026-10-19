import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENGINE_FACTS, type EngineFacts } from '@wine-match/core';
import { describe, expect, it } from 'vitest';
import { en, type ExplainContext, type RestaurantExplainContext } from '@/i18n/en';
import { pl } from '@/i18n/pl';

/**
 * Spec 2026-10-16-how-it-works-explanations, phase 1b: the explanation texts and the labels in the dictionaries.
 * AC5 (no "AI" for guests), AC6 (numbers only from ENGINE_FACTS, point and word limits), AC8 / AC9 (variants of the
 * live guest settings), AC10 (one name for the sommelier's pairings and the engine's top pick).
 */

const DICTS = { en, pl } as const;
const SETTINGS: Array<Pick<ExplainContext, 'showScores' | 'showUnreviewed'>> = [
  { showScores: true, showUnreviewed: true },
  { showScores: true, showUnreviewed: false },
  { showScores: false, showUnreviewed: true },
  { showScores: false, showUnreviewed: false }
];
const DIRECTORS = ['Marta Wierzbicka', ''];
const contexts = (): RestaurantExplainContext[] => SETTINGS.flatMap((s) => DIRECTORS.map((director) => ({ ...s, director, restaurant: 'Halka' })));
const wineContexts = (showScores: boolean) => [
  { score: 84, dish: 'Duck breast with sour cherry jus and a very long name', showScores },
  { score: null, dish: 'Duck breast', showScores },
  { score: null, dish: null, showScores }
];

/** Every text a dictionary can produce: strings as they are, functions called with every argument shape the dictionaries use. */
function allTexts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(allTexts);
  if (typeof node === 'function') {
    const argSets: unknown[][] = [
      [], [3], ['Sample'], ['Sample', 'Other'], ['Sample', 'Other', true], ['Sample', 'Other', false], [2, 'Sample'],
      ...contexts().map((c) => [ENGINE_FACTS, c]),
      [ENGINE_FACTS],
      ...[true, false].flatMap(wineContexts).map((c) => [c])
    ];
    return argSets.flatMap((args) => {
      try {
        return allTexts((node as (...a: unknown[]) => unknown)(...args));
      } catch {
        return [];
      }
    });
  }
  if (node && typeof node === 'object') return Object.values(node).flatMap(allTexts);
  return [];
}

const words = (points: string[]) => points.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
/** Numbers written in a text, with a decimal comma read as a point ("0,6" → 0.6). */
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));

/** A copy of ENGINE_FACTS where every value is a unique marker: 1001, 1002, … */
const MARKED = Object.fromEntries(Object.keys(ENGINE_FACTS).map((k, i) => [k, 1001 + i])) as unknown as EngineFacts;
const marker = (k: keyof EngineFacts) => MARKED[k];

describe('no "AI" in what guests read (AC5, R5)', () => {
  for (const [lang, t] of Object.entries(DICTS)) {
    it(`${lang}: guest texts never say AI, LLM, artificial, algorithm or engine; dashboard texts never say AI`, () => {
      const guest = allTexts(t.guest);
      expect(guest.length).toBeGreaterThan(150);
      for (const text of guest) expect(text, text).not.toMatch(/\b(AI|LLM)\b|sztuczn|artificial|algorytm|algorithm|silnik|engine/i);
      const admin = allTexts(t.admin);
      expect(admin.length).toBeGreaterThan(300);
      for (const text of admin) expect(text, text).not.toMatch(/\b(AI|LLM)\b|sztuczn|artificial/i);
    });
  }
});

describe('numbers in explanations come from ENGINE_FACTS (AC6, R4, R8)', () => {
  for (const [lang, t] of Object.entries(DICTS)) {
    const ex = t.guest.explain;

    it(`${lang}: with today's facts the texts state today's numbers`, () => {
      const g3 = ex.wines.points(ENGINE_FACTS, { showScores: true, showUnreviewed: true, director: 'Marta Wierzbicka' }).join(' ');
      for (const n of [ENGINE_FACTS.minModelScore, ENGINE_FACTS.maxScore, ENGINE_FACTS.bestValueWindow, ENGINE_FACTS.budgetFallbackCount]) expect(numbersIn(g3)).toContain(n);
      expect(numbersIn(ex.filters.points(ENGINE_FACTS).join(' '))).toContain(ENGINE_FACTS.budgetFallbackCount);
    });

    it(`${lang}: with marked facts every number is a marker of a fact the text describes, never a value typed in`, () => {
      const originals = new Set(Object.values(ENGINE_FACTS));
      for (const c of contexts()) {
        const g3 = ex.wines.points(MARKED, c).join(' ');
        const expected: Array<keyof EngineFacts> = ['budgetFallbackCount'];
        if (c.showScores) expected.push('maxScore', 'bestValueWindow');
        if (c.showScores && c.showUnreviewed) expected.push('minModelScore');
        for (const k of expected) expect(numbersIn(g3), `${k} in ${g3}`).toContain(marker(k));
        for (const n of numbersIn(g3)) expect(originals.has(n), `${n} in ${g3}`).toBe(false);
      }
      const g4 = ex.filters.points(MARKED).join(' ');
      expect(numbersIn(g4)).toEqual([marker('budgetFallbackCount')]);
    });

    it(`${lang}: point and word limits hold in every variant (≤ 6 points; G3 ≤ 110 words, others ≤ 90)`, () => {
      for (const c of contexts()) {
        const g3 = ex.wines.points(ENGINE_FACTS, c);
        expect(g3.length).toBeLessThanOrEqual(6);
        expect(words(g3), g3.join(' ')).toBeLessThanOrEqual(110);
      }
      const g4 = ex.filters.points(ENGINE_FACTS);
      expect(g4.length).toBeLessThanOrEqual(6);
      expect(words(g4)).toBeLessThanOrEqual(90);
      for (const c of [true, false].flatMap(wineContexts)) {
        const g7 = ex.wine.points(c);
        expect(g7.length).toBeLessThanOrEqual(6);
        expect(words(g7), g7.join(' ')).toBeLessThanOrEqual(90);
      }
    });
  }
});

describe('the explanations follow the live guest settings (AC8, AC9, R6)', () => {
  const GLASS = { en: /fuller glass|glass shows/i, pl: /kieliszek/i };
  const ENGINE_LABEL = { en: 'Recommended for your dish', pl: 'Polecane do Twojego dania' };
  const RULES = { en: 'pairing rules', pl: 'zasad łączenia wina z jedzeniem' };

  for (const [lang, t] of Object.entries(DICTS) as Array<[keyof typeof DICTS, typeof en]>) {
    const ex = t.guest.explain;

    it(`${lang}: without percentages there is no "%" anywhere, the glass is explained instead, and its name has no number`, () => {
      for (const showUnreviewed of [true, false]) {
        const g3 = ex.wines.points(ENGINE_FACTS, { showScores: false, showUnreviewed, director: 'M' }).join(' ');
        expect(g3).not.toContain('%');
        expect(g3).toMatch(GLASS[lang]);
        expect(ex.wines.points(ENGINE_FACTS, { showScores: true, showUnreviewed, director: 'M' }).join(' ')).toContain('%');
      }
      for (const c of wineContexts(false)) expect(ex.wine.points(c).join(' ')).not.toContain('%');
      expect(ex.wine.points(wineContexts(false)[0]).join(' ')).toMatch(GLASS[lang]);
      expect(ex.wine.points(wineContexts(true)[0]).join(' ')).toContain('84%');
      expect(t.guest.wines.glassLabel).not.toMatch(/\d/);
    });

    it(`${lang}: the engine's label and the pairing rules are mentioned only when engine picks fill the list`, () => {
      const on = ex.wines.points(ENGINE_FACTS, { showScores: true, showUnreviewed: true, director: 'M' }).join(' ');
      const off = ex.wines.points(ENGINE_FACTS, { showScores: true, showUnreviewed: false, director: 'M' }).join(' ');
      expect(on).toContain(ENGINE_LABEL[lang]);
      expect(off).not.toContain(ENGINE_LABEL[lang]);
      expect(off).not.toContain(RULES[lang]);
      expect(t.guest.wines.footer('Halka', 'Marta Wierzbicka', true)).toContain(RULES[lang]);
      expect(t.guest.wines.footer('Halka', 'Marta Wierzbicka', false)).not.toContain(RULES[lang]);
      expect(t.guest.wines.footer('Halka', 'Marta Wierzbicka', false)).not.toContain(ENGINE_LABEL[lang]);
    });

    it(`${lang}: an empty Wine Director name reads as the restaurant's sommelier`, () => {
      const someone = lang === 'pl' ? 'sommelier restauracji' : 'the restaurant’s sommelier';
      expect(ex.wines.points(ENGINE_FACTS, { showScores: true, showUnreviewed: true, director: '  ' })[0]).toContain(someone);
      expect(t.guest.wines.footer('Halka', '', true)).toContain(someone);
    });
  }

  it('the glass is named in the page language (AC8)', () => {
    expect(pl.guest.wines.matchLabel(80)).toBe('Dopasowanie 80 procent');
    expect(en.guest.wines.matchLabel(80)).toBe('Match 80 percent');
  });
});

describe('one name for the sommelier’s pairings and the engine’s top pick (AC10, R7, Q1, Q5)', () => {
  it('the new labels are in place for guests, the waiter and the dashboard', () => {
    expect(en.guest.wines.sommelierPairing).toBe('Sommelier’s pairing');
    expect(pl.guest.wines.sommelierPairing).toBe('Para sommeliera');
    expect(en.guest.wines.recommended).toBe('Recommended for your dish');
    expect(pl.guest.wines.recommended).toBe('Polecane do Twojego dania');
    expect(pl.guest.staff.firstChoice).toBe('Para sommeliera · pierwszy wybór');
    expect(en.guest.staff.firstChoice).toBe('Sommelier’s pairing · first choice');
    expect(pl.guest.hero.directorLine).toBe('Pary Wine Directora zawsze otwierają listę dania.');
    expect(en.guest.hero.directorLine).toBe('The Wine Director’s pairings always lead a dish’s list.');
    expect(pl.admin.dashboard.waitingText).toContain('Polecane do Twojego dania');
    expect(en.admin.pairings.suggestionsText).toContain('Recommended for your dish');
  });

  it('no dictionary text uses an old name', () => {
    const old = /sommelier recommendation|rekomendacj\w* sommeliera|best match|najlepsze dopasowanie|perfect with your dish|pasuje do twojego dania|para od sommeliera|sommelier pairing available|every recommendation follows|wine director’s first choice|pierwszy wybór wine director/i;
    for (const t of Object.values(DICTS)) for (const text of allTexts(t)) expect(text, text).not.toMatch(old);
  });
});

describe('contrast of the guest explanation (AC16, R2, WCAG 1.4.3 / 1.4.11)', () => {
  const css = readFileSync(fileURLToPath(new URL('../../src/app/(guest)/guest.css', import.meta.url)), 'utf8');
  const token = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)![1];
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('summary and body text (ink-2) reach 4.5:1 on paper and on white; the icon and the focus ring (wine) reach 3:1', () => {
    for (const bg of ['paper', 'surface']) {
      expect(contrast('ink-2', bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('wine', bg)).toBeGreaterThanOrEqual(3);
    }
    // ink-3 is AA for text since the lesson-06 fix (docs/DESIGN_SYSTEM.md); the explanation still uses ink-2 by rule
    expect(contrast('ink-3', 'paper')).toBeGreaterThanOrEqual(4.5);
  });

  it('the explanation and the trust note never use ink-3', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/app/(guest)/_components/guest-ui.tsx', import.meta.url)), 'utf8');
    const part = (name: string) => {
      const start = src.indexOf(`export function ${name}(`);
      return src.slice(start, src.indexOf('\nexport ', start + 1));
    };
    for (const name of ['Explain', 'RecoFooter']) {
      expect(part(name).length).toBeGreaterThan(100);
      expect(part(name)).not.toContain('ink-3');
    }
  });
});
