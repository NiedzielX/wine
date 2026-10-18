import { ENGINE_FACTS, type EngineFacts } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '@/app/(guest)/r/[slug]/page';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import HowItWorksPage from '@/app/(guest)/r/[slug]/how-it-works/page';
import MenuPage from '@/app/(guest)/r/[slug]/menu/page';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import TableResultPage from '@/app/(guest)/r/[slug]/table/result/page';
import { en, type RestaurantExplainContext } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-how-it-works-explanations, phase 2: the explanations on G0, G1, G5, G6 and G9 and the "How we pick
 * your wine" page (G12). Dictionary texts (AC5 is in explain.test.ts for every text; here AC6 and the limits of R4 for
 * the new keys, the variants of R6) and the pages rendered to HTML the way the server sends them (AC2, AC3 structure,
 * AC11, AC12).
 */

const DICTS = { en, pl } as const;
const SETTINGS = [
  { showScores: true, showUnreviewed: true },
  { showScores: true, showUnreviewed: false },
  { showScores: false, showUnreviewed: true },
  { showScores: false, showUnreviewed: false }
];
const contexts = (): RestaurantExplainContext[] =>
  SETTINGS.flatMap((s) => ['Marta Wierzbicka', ''].map((director) => ({ ...s, director, restaurant: 'Restauracja Pod Długą Nazwą' })));

const words = (texts: string[]) => texts.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
/** Numbers written in a text, with a decimal comma read as a point ("1,5" → 1.5). */
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
/** A copy of ENGINE_FACTS where every value is a unique marker: 1001, 1002, … */
const MARKED = Object.fromEntries(Object.keys(ENGINE_FACTS).map((k, i) => [k, 1001 + i])) as unknown as EngineFacts;
const ORIGINALS = new Set(Object.values(ENGINE_FACTS));

/** Every sentence of the G12 page in one variant: title, lead, headings, paragraphs, lists. */
const pageTexts = (t: typeof en, f: EngineFacts, c: RestaurantExplainContext) => [
  t.guest.howItWorks.title, t.guest.howItWorks.lead(c.restaurant),
  ...t.guest.howItWorks.sections(f, c).flatMap((s) => [s.title, ...s.text, ...(s.points ?? []), s.after ?? ''])
];

/** The phase 2 explanations of one dictionary, called for one variant (G6 has its own marker test: its weights are shares). */
const explanations = (t: typeof en, f: EngineFacts, c: RestaurantExplainContext) => ({
  landing: t.guest.explain.landing.points(f, c),
  menu: t.guest.explain.menu.points(c),
  table: t.guest.explain.table.points(f),
  tableResult: t.guest.explain.tableResult.points(f, c),
  staff: t.guest.explain.staff.points(f, c)
});

describe('phase 2 texts: numbers from ENGINE_FACTS, limits, variants (AC6, R4, R6)', () => {
  for (const [lang, t] of Object.entries(DICTS) as Array<[keyof typeof DICTS, typeof en]>) {
    it(`${lang}: every explanation has at most 6 points and 90 words; G12 at most 350 words — in every variant`, () => {
      for (const c of contexts()) {
        for (const [id, points] of Object.entries(explanations(t, ENGINE_FACTS, c))) {
          expect(points.length, id).toBeLessThanOrEqual(6);
          expect(words(points), `${id}: ${points.join(' ')}`).toBeLessThanOrEqual(90);
        }
        expect(words(pageTexts(t, ENGINE_FACTS, c))).toBeLessThanOrEqual(350);
      }
    });

    it(`${lang}: with marked facts every number is a marker of a fact the text describes, never a value typed in`, () => {
      for (const c of contexts()) {
        const ex = explanations(t, MARKED, c);
        const expected: Record<string, Array<keyof EngineFacts>> = {
          landing: ['dishLimit'],
          menu: [],
          table: ['tableMainsWeight', 'budgetFallbackCount'],
          staff: c.showUnreviewed ? ['minModelScore', 'dishLimit'] : ['dishLimit']
        };
        for (const [id, keys] of Object.entries(expected)) {
          const text = ex[id as keyof typeof ex].join(' ');
          expect(numbersIn(text).sort(), `${id}: ${text}`).toEqual(keys.map((k) => MARKED[k]).sort());
        }
        const page = pageTexts(t, MARKED, c).join(' ');
        const pageKeys: Array<keyof EngineFacts> = ['dishLimit', 'tableMainsWeight'];
        if (c.showScores) pageKeys.push('maxScore');
        if (c.showScores && c.showUnreviewed) pageKeys.push('minModelScore');
        for (const k of pageKeys) expect(numbersIn(page), `${k} in ${page}`).toContain(MARKED[k]);
        // "0–1002%": the bottom of the scale is a 0 written in the text, not a fact
        for (const n of numbersIn(page).filter((x) => x !== 0)) expect(ORIGINALS.has(n), `${n} in ${page}`).toBe(false);
      }
    });

    it(`${lang}: G6 states when a glass per dish is suggested, from ENGINE_FACTS`, () => {
      const on = t.guest.explain.tableResult.points(MARKED, { showScores: true }).join(' ');
      expect(on).toContain(`${MARKED.compromiseThreshold}%`);
      expect(on).toContain(`${MARKED.weakDishThreshold}%`);
      const today = t.guest.explain.tableResult.points(ENGINE_FACTS, { showScores: true }).join(' ');
      for (const n of [ENGINE_FACTS.compromiseThreshold, ENGINE_FACTS.weakDishThreshold, ENGINE_FACTS.tableSommelierBonus, ENGINE_FACTS.tableRejectedCap]) expect(numbersIn(today)).toContain(n);
    });

    it(`${lang}: today's numbers on G0, G5, G9 and G12`, () => {
      const c = contexts()[0];
      const ex = explanations(t, ENGINE_FACTS, c);
      expect(numbersIn(ex.landing.join(' '))).toContain(ENGINE_FACTS.dishLimit);
      expect(numbersIn(ex.table.join(' '))).toEqual([ENGINE_FACTS.tableMainsWeight, ENGINE_FACTS.budgetFallbackCount]);
      expect(numbersIn(ex.staff.join(' '))).toEqual([ENGINE_FACTS.minModelScore, ENGINE_FACTS.dishLimit]);
      // decimals in the page's language (R4): "1,5" in Polish, "1.5" in English
      expect(ex.table.join(' ')).toContain(lang === 'pl' ? '×1,5' : '×1.5');
      const page = pageTexts(t, ENGINE_FACTS, c).join(' ');
      for (const n of [ENGINE_FACTS.dishLimit, ENGINE_FACTS.maxScore, ENGINE_FACTS.minModelScore]) expect(numbersIn(page)).toContain(n);
    });
  }

  const RULES = { en: 'pairing rules', pl: 'zasad' };
  for (const [lang, t] of Object.entries(DICTS) as Array<[keyof typeof DICTS, typeof en]>) {
    it(`${lang}: with only the sommelier’s pairings, G0, G1, G9 and G12 do not mention wines matched by the rules`, () => {
      for (const showScores of [true, false]) {
        const off = { showScores, showUnreviewed: false, director: 'M', restaurant: 'Halka' };
        const on = { ...off, showUnreviewed: true };
        expect(t.guest.explain.landing.points(ENGINE_FACTS, off).join(' ')).not.toContain(RULES[lang]);
        expect(t.guest.explain.landing.points(ENGINE_FACTS, on).join(' ')).toContain(RULES[lang]);
        expect(t.guest.explain.menu.points(off).join(' ')).not.toContain(RULES[lang]);
        expect(t.guest.explain.menu.points(on).join(' ')).toContain(RULES[lang]);
        // the first point of G9 is the order; "Say:" may still quote a rule's reason for a sommelier's pairing without a note
        expect(t.guest.explain.staff.points(ENGINE_FACTS, off)[0]).not.toContain(RULES[lang]);
        expect(t.guest.explain.staff.points(ENGINE_FACTS, on)[0]).toContain(RULES[lang]);
        expect(t.guest.howItWorks.sections(ENGINE_FACTS, off).map((s) => s.id)).toEqual(['list', 'sommelier', 'score', 'table', 'choices', 'fair']);
        expect(t.guest.howItWorks.sections(ENGINE_FACTS, on).map((s) => s.id)).toEqual(['list', 'sommelier', 'rules', 'score', 'table', 'choices', 'fair']);
      }
    });

    it(`${lang}: without percentages G12 has no "%" and explains the glass`, () => {
      for (const showUnreviewed of [true, false]) {
        const page = pageTexts(t, ENGINE_FACTS, { showScores: false, showUnreviewed, director: 'M', restaurant: 'Halka' }).join(' ');
        expect(page).not.toContain('%');
        expect(page).toMatch(lang === 'pl' ? /kieliszek/i : /glass/i);
      }
    });

    it(`${lang}: an empty Wine Director name reads as the restaurant's sommelier on G0 and G12`, () => {
      const someone = lang === 'pl' ? 'sommelier restauracji' : 'the restaurant’s sommelier';
      const c = { showScores: true, showUnreviewed: true, director: ' ', restaurant: 'Halka' };
      expect(t.guest.explain.landing.points(ENGINE_FACTS, c).join(' ')).toContain(someone);
      expect(pageTexts(t, ENGINE_FACTS, c).join(' ')).toContain(someone);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// pages

const headers = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string> } }).__wmNext.headers;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

async function render(page: unknown, params: Record<string, string> = {}, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  headers().clear();
  headers().set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

async function setSettings(patch: { showScores?: boolean; showUnreviewed?: boolean }) {
  const scope = await createRequestScope();
  await scope.cradle.publishService.updateSettings('halka', patch);
  await scope.dispose();
}

const SID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
/** The guest's text: tags and their attributes left out. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ');
const main = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

let duck = '';
let table = '';

beforeAll(async () => {
  const scope = await createRequestScope();
  const menu = (await scope.cradle.catalogService.publishedMenu('halka'))!;
  await scope.dispose();
  const id = (name: string) => menu.dishes.find((d) => d.name === name)!.id;
  duck = id('Duck breast');
  table = [id('Beef tartare'), id('Wild mushroom risotto'), duck].join(',');
});

describe('one explanation on G0, G1, G5, G6 and G9, in its place (AC2, AC3)', () => {
  const screens = (): Array<[string, unknown, Record<string, string>, Record<string, string>, string]> => [
    ['G0', LandingPage, {}, {}, 'landing'],
    ['G1', MenuPage, {}, {}, 'menu'],
    ['G5', TablePage, {}, {}, 'table'],
    ['G6', TableResultPage, {}, { dishes: table }, 'tableResult'],
    ['G9', StaffPage, {}, { dish: duck }, 'staff']
  ];

  for (const lang of ['en', 'pl'] as const) {
    it(`${lang}: exactly the screen's id, closed, never inside a link, a button, a paragraph or a summary`, async () => {
      const t = DICTS[lang];
      for (const [name, page, params, search, id] of screens()) {
        const html = await render(page, params, search, lang);
        expect(explainIds(html), name).toEqual([id]);
        expect(placementProblems(html), name).toEqual([]);
        expect(html, name).not.toMatch(/<details[^>]*data-explain[^>]*\sopen/);
        const summary = t.guest.explain[id as 'landing'].summary;
        expect(html, name).toContain(`<span>${summary}</span></summary>`);
      }
    });
  }

  it('G0: under "Pick your dish" and above the dishes; G1, G5 and G9: under the lead', async () => {
    const g0 = await render(LandingPage);
    const at = g0.indexOf('data-explain="landing"');
    expect(g0.indexOf(en.guest.landing.pickDishLead)).toBeLessThan(at);
    expect(g0.indexOf(`/r/halka/dish/${duck}/wines`)).toBeGreaterThan(at);
    const g1 = await render(MenuPage);
    expect(g1.indexOf(en.guest.menu.pickLead)).toBeLessThan(g1.indexOf('data-explain="menu"'));
    expect(g1.indexOf(`/r/halka/dish/${duck}/wines`)).toBeGreaterThan(g1.indexOf('data-explain="menu"'));
    const g5 = await render(TablePage);
    expect(g5.indexOf(en.guest.table.lead)).toBeLessThan(g5.indexOf('data-explain="table"'));
    expect(g5.indexOf('name="dish"')).toBeGreaterThan(g5.indexOf('data-explain="table"'));
    const g9 = await render(StaffPage, {}, { dish: duck });
    expect(g9.indexOf(en.guest.staff.lead)).toBeLessThan(g9.indexOf('data-explain="staff"'));
    expect(g9.indexOf('<form')).toBeGreaterThan(g9.indexOf('data-explain="staff"'));
  });
});

describe('the explanations follow the live settings (R6)', () => {
  beforeEach(async () => setSettings({ showScores: true, showUnreviewed: true }));
  afterEach(async () => setSettings({ showScores: true, showUnreviewed: true }));

  it('only the sommelier’s pairings: G0, G1 and G9 drop the wines matched by the rules', async () => {
    await setSettings({ showUnreviewed: false });
    expect(await render(LandingPage)).not.toContain('The others are matched by our pairing rules.');
    expect(await render(MenuPage)).toContain('we show only wines the sommelier has already approved');
    expect(await render(StaffPage, {}, { dish: duck })).toContain('the restaurant shows no other wines');
    await setSettings({ showUnreviewed: true });
    expect(await render(LandingPage)).toContain('The others are matched by our pairing rules.');
  });
});

describe('G6: the seal marks only a sommelier’s pairing, next to its dish (AC11, R7)', () => {
  it('the card header has no seal; each sommelier’s pairing has one, named in text, without a title', async () => {
    const scope = await createRequestScope();
    const out = (await scope.cradle.recommendationService.forTable('halka', table.split(','), {}, 'en', { relaxBudget: true }))!;
    await scope.dispose();
    const best = out.result.items[0];
    const picks = best.perDish.filter((d) => d.sommelierPick).length;
    expect(picks).toBeGreaterThan(0);
    const html = await render(TableResultPage, {}, { dishes: table });
    const at = html.indexOf('/r/halka/wine/');
    const card = html.slice(at, html.indexOf('</a>', at));
    const header = card.slice(card.indexOf('<p'), card.indexOf('</p>'));
    expect(header).toContain(en.guest.tableResult.recommended);
    expect(header).not.toContain('<svg');
    expect((card.match(/<svg class="size-4" viewBox="0 0 16 16"/g) ?? []).length).toBe(picks);
    expect((card.match(/<span class="sr-only">Sommelier’s pairing<\/span>/g) ?? []).length).toBe(picks);
    expect(card).not.toContain('title=');
  });
});

describe('G12 "How we pick your wine" (AC12, R9, R10)', () => {
  beforeEach(async () => setSettings({ showScores: true, showUnreviewed: true }));
  afterEach(async () => setSettings({ showScores: true, showUnreviewed: true }));

  it('English and Polish: the heading, the sections, the way back with the guest’s language and session', async () => {
    const enHtml = await render(HowItWorksPage, {}, { sid: SID });
    expect(enHtml).toMatch(/<h1[^>]*>How we pick your wine<\/h1>/);
    expect([...enHtml.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1])).toEqual(['list', 'sommelier', 'rules', 'score', 'table', 'choices', 'fair']);
    expect(enHtml).toContain(`href="/r/halka?sid=${SID}"`);
    expect(enHtml).toContain('Marta Wierzbicka');
    expect(enHtml).toContain(`shown from ${ENGINE_FACTS.minModelScore}%`);
    const plHtml = await render(HowItWorksPage, {}, { lang: 'pl', sid: SID }, 'pl');
    expect(plHtml).toMatch(/<h1[^>]*>Jak dobieramy wino<\/h1>/);
    expect(plHtml).toContain(`href="/r/halka?lang=pl&amp;sid=${SID}"`);
    expect(plHtml).toContain('Wróć do menu');
    // one heading per section, no explanation disclosure: the page is the long version
    expect((plHtml.match(/<h2/g) ?? []).length).toBe(7);
    expect(explainIds(plHtml)).toEqual([]);
    expect(placementProblems(plHtml)).toEqual([]);
  });

  it('every link on the page carries the session; nothing needs a script', async () => {
    const html = await render(HowItWorksPage, {}, { sid: SID });
    const links = [...html.matchAll(/\shref="(\/r\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const l of links) expect(new URL(l, 'http://x').searchParams.get('sid'), l).toBe(SID);
    expect(html).not.toMatch(/\son[a-z]+="/);
  });

  it('follows the live settings: no rules section with only the sommelier’s pairings, no "%" without percentages', async () => {
    await setSettings({ showUnreviewed: false, showScores: false });
    const html = await render(HowItWorksPage);
    expect(html).not.toContain('data-section="rules"');
    expect(textOf(main(html))).not.toContain('%');
    expect(html).toContain('What the glass means');
  });

  it('an unknown restaurant is a 404', async () => {
    await expect(render(HowItWorksPage, { slug: 'no-such-place' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('G0 (phone and desktop) and the trust note on G3 link to it, with the guest’s language and session', async () => {
    const g0 = await render(LandingPage, {}, { lang: 'pl', sid: SID }, 'pl');
    const target = `href="/r/halka/how-it-works?lang=pl&amp;sid=${SID}"`;
    // once under the menu (phone), once in the restaurant header (desktop column)
    expect(g0.split(target).length - 1).toBe(2);
    expect(g0).toContain('Więcej o doborze win');
    const g3 = await render(WinesPage, { dishId: duck }, { sid: SID });
    expect(g3).toContain(`href="/r/halka/how-it-works?sid=${SID}"`);
    expect(g3).toContain(en.guest.hero.howLink);
  });
});
