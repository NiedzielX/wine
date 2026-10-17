import { ENGINE_FACTS, type EngineFacts } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import DashboardPage from '@/app/(admin)/admin/[slug]/(lists)/page';
import MenuListPage from '@/app/(admin)/admin/[slug]/(lists)/menu/page';
import ReviewPage from '@/app/(admin)/admin/[slug]/(lists)/review/page';
import WineListPage from '@/app/(admin)/admin/[slug]/(lists)/wines/page';
import DishPage from '@/app/(admin)/admin/[slug]/menu/[dishId]/page';
import PairingsPage from '@/app/(admin)/admin/[slug]/pairings/[dishId]/page';
import PublishPage from '@/app/(admin)/admin/[slug]/publish/page';
import WinePage from '@/app/(admin)/admin/[slug]/wines/[wineId]/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-how-it-works-explanations, phase 3: the "How it works" explanations on the dashboard (A1–A7, A11).
 * Texts: numbers only from ENGINE_FACTS (AC6), no "AI" (AC5 covers every dashboard text in explain.test.ts), word limit
 * (R4: ≤ 130). Pages: rendered to HTML as the server sends them, signed in as the Wine Director: one explanation per
 * card in the place from the inventory (AC2, R3), never inside a link, a button or a paragraph, no `title` (AC3, R2).
 */

const DICTS = { en, pl } as const;
type Lang = keyof typeof DICTS;
const SCREENS = ['dashboard', 'menu', 'score', 'wines', 'pairings', 'suggestions', 'review', 'publish'] as const;
type Screen = (typeof SCREENS)[number];

/** The points of a screen's explanation, with any set of engine facts. */
const pointsOf = (lang: Lang, screen: Screen, f: EngineFacts): string[] => {
  const p = DICTS[lang].admin.explain[screen].points;
  return typeof p === 'function' ? p(f) : p;
};
const words = (points: string[]) => points.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
/** A copy of ENGINE_FACTS where every value is a unique marker: 1001, 1002, … */
const MARKED = Object.fromEntries(Object.keys(ENGINE_FACTS).map((k, i) => [k, 1001 + i])) as unknown as EngineFacts;

/** The facts each explanation states (and only those). */
const STATES: Record<Screen, Array<keyof EngineFacts>> = {
  dashboard: ['minModelScore'],
  menu: [],
  score: ['baseScore', 'maxScore', 'minModelScore'],
  wines: [],
  pairings: ['minModelScore', 'dishLimit', 'tableRejectedCap', 'bestValueWindow'],
  suggestions: ['minModelScore'],
  review: ['tableRejectedCap', 'minModelScore'],
  publish: ['minModelScore']
};
/** Numbers that are part of a scale, not an engine fact ("0–5" profile scale, "0–99"). */
const SCALE = new Set([0, 5]);

describe('dashboard explanation texts (AC6, R4, R5)', () => {
  for (const lang of Object.keys(DICTS) as Lang[]) {
    it(`${lang}: today's facts give today's numbers`, () => {
      expect(numbersIn(pointsOf(lang, 'score', ENGINE_FACTS).join(' '))).toEqual(expect.arrayContaining([72, 99, 62]));
      expect(numbersIn(pointsOf(lang, 'pairings', ENGINE_FACTS).join(' '))).toEqual(expect.arrayContaining([62, 4, 50, 8]));
      expect(numbersIn(pointsOf(lang, 'publish', ENGINE_FACTS).join(' '))).toContain(62);
    });

    it(`${lang}: every number is a marker of a fact the text describes, never a value typed in`, () => {
      const originals = new Set(Object.values(ENGINE_FACTS).filter((n) => !SCALE.has(n)));
      for (const screen of SCREENS) {
        const text = pointsOf(lang, screen, MARKED).join(' ');
        const markers = STATES[screen].map((k) => MARKED[k]);
        for (const m of markers) expect(numbersIn(text), `${screen}: ${text}`).toContain(m);
        for (const n of numbersIn(text)) {
          expect(originals.has(n), `${screen}: ${n} typed in`).toBe(false);
          expect(n >= 1001 ? markers.includes(n) : SCALE.has(n), `${screen}: ${n} in ${text}`).toBe(true);
        }
      }
    });

    it(`${lang}: each explanation has a question and at most 130 words`, () => {
      for (const screen of SCREENS) {
        const { summary } = DICTS[lang].admin.explain[screen];
        expect(summary.endsWith('?'), summary).toBe(true);
        const points = pointsOf(lang, screen, ENGINE_FACTS);
        expect(points.length).toBeGreaterThan(0);
        expect(words(points), `${screen}: ${points.join(' ')}`).toBeLessThanOrEqual(130);
      }
    });
  }

  it('the guest labels are the ones guests see (R7), and the table texts say what the table does today (Q4)', () => {
    expect(en.admin.explain.review.points(ENGINE_FACTS).join(' ')).toContain('“Sommelier’s pairing”');
    expect(pl.admin.explain.review.points(ENGINE_FACTS).join(' ')).toContain('„Para sommeliera”');
    expect(en.admin.explain.suggestions.points(ENGINE_FACTS).join(' ')).toContain('“Recommended for your dish”');
    expect(pl.admin.explain.dashboard.points(ENGINE_FACTS).join(' ')).toContain('„Polecane do Twojego dania”');
    // the table result does not follow "Fill empty places": both the setting's own text and the explanation say so
    expect(en.admin.publish.showUnreviewedText).toContain('“Whole table” bottle still comes from the whole list');
    expect(pl.admin.publish.showUnreviewedText).toContain('z całej karty');
    expect(en.admin.explain.publish.points(ENGINE_FACTS).join(' ')).toContain('always chosen from the whole active wine list');
    expect(en.admin.publish.showUnreviewedText).not.toBe('When off, guests only see pairings you approved.');
  });
});

const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

async function render(page: unknown, params: Record<string, string> = {}, lang: Lang = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve({}) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

let duck = '';
let wine = '';

beforeAll(async () => {
  const { token } = await loginAs('marta@halka.pl');
  state().cookies.set(SESSION_COOKIE, token);
  const scope = await createRequestScope();
  const menu = (await scope.cradle.catalogService.publishedMenu('halka'))!;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!.id;
  wine = (await scope.cradle.recommendationService.forDish('halka', duck))!.result.items[0].wine.id;
  await scope.dispose();
});

describe('one explanation per dashboard card, in its place (AC2, AC3, R3)', () => {
  const pages: Array<[string, unknown, () => Record<string, string>, string[]]> = [
    ['A1 dashboard', DashboardPage, () => ({}), ['dashboard']],
    ['A2 menu', MenuListPage, () => ({}), ['menu']],
    ['A3 dish', DishPage, () => ({ dishId: duck }), ['score']],
    ['A4 wine list', WineListPage, () => ({}), ['wines']],
    ['A5 wine', WinePage, () => ({ wineId: wine }), ['score']],
    ['A6 pairings', PairingsPage, () => ({ dishId: duck }), ['pairings', 'suggestions']],
    ['A7 review queue', ReviewPage, () => ({}), ['review']],
    ['A11 publish', PublishPage, () => ({}), ['publish']]
  ];

  for (const lang of Object.keys(DICTS) as Lang[]) {
    for (const [name, page, params, ids] of pages) {
      it(`${lang}: ${name} has ${ids.join(' and ')}, closed, with the question as its summary`, async () => {
        const html = await render(page, params(), lang);
        expect(explainIds(html)).toEqual(ids);
        expect(placementProblems(html)).toEqual([]);
        expect(html).not.toMatch(/<details data-explain[^>]*\sopen/);
        for (const id of ids) {
          const summary = DICTS[lang].admin.explain[id as Screen].summary;
          expect(html).toContain(id === 'suggestions' ? `<span class="sr-only">${summary}</span>` : `<span>${summary}</span>`);
        }
        // AC14 stays: the score badge names itself without a title
        expect(html).not.toMatch(/title="(Engine match score|Wynik dopasowania silnika)"/);
      });
    }
  }

  it('A1: the explanation stands right above the program tiles', async () => {
    const html = await render(DashboardPage);
    const at = html.indexOf('data-explain="dashboard"');
    expect(at).toBeGreaterThan(0);
    expect(html.indexOf('aria-label="Wine program"')).toBeGreaterThan(at);
    expect(html.slice(at, html.indexOf('aria-label="Wine program"'))).toContain('from 62%');
  });

  it('A2 and A4: the explanation is outside the page description paragraph, above the filters', async () => {
    for (const page of [MenuListPage, WineListPage]) {
      const html = await render(page);
      const at = html.indexOf('data-explain=');
      expect(html.indexOf('</header>')).toBeLessThan(at);
      expect(html.indexOf('method="get"')).toBeGreaterThan(at);
    }
  });

  it('A6: "How do guests see your pairings?" in the approved card, the compact one by the engine suggestions title', async () => {
    const html = await render(PairingsPage, { dishId: duck }, 'pl');
    const approved = html.indexOf('Zatwierdzone dla gości');
    const first = html.indexOf('data-explain="pairings"');
    const suggestions = html.indexOf('Propozycje silnika<');
    const compact = html.indexOf('data-explain="suggestions"');
    expect(approved).toBeLessThan(first);
    expect(first).toBeLessThan(suggestions);
    expect(suggestions).toBeLessThan(compact);
    expect(html).toContain('Gość widzi najwyżej 4 wina.');
  });

  it('A11: the settings card explains both settings, and the setting text says the table uses the whole list', async () => {
    const html = await render(PublishPage);
    expect(html.indexOf('data-explain="publish"')).toBeGreaterThan(html.indexOf('Guest settings'));
    expect(html).toContain('The “Whole table” bottle still comes from the whole list.');
  });
});
