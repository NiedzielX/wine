import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PanelExplain } from '@/app/(admin)/admin/_components/explain';
import { ScoreBadge } from '@/app/(admin)/admin/_components/badges';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import MenuPage from '@/app/(guest)/r/[slug]/menu/page';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import WinePage from '@/app/(guest)/r/[slug]/wine/[wineId]/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';

/**
 * Server-rendered guest pages of spec 2026-10-16-how-it-works-explanations, phase 1b (G3, G4, G7, G8 and the labels on
 * G1 and G9), without a browser: the pages are rendered to HTML the way the server sends them. AC2, AC3 (structure),
 * AC8, AC9, AC10, AC13, AC14.
 */

const headers = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string> } }).__wmNext.headers;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

async function render(page: unknown, params: Record<string, string>, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  headers().clear();
  headers().set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

const explainIds = (html: string) => [...html.matchAll(/data-explain="([^"]+)"/g)].map((m) => m[1]);
const glasses = (html: string) => [...html.matchAll(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
/** The open explanation's text: everything inside `<details data-explain="id">`. */
const explainText = (html: string, id: string) => /<details data-explain="([^"]+)"[^>]*>([\s\S]*?)<\/details>/g.exec(html.slice(html.indexOf(`data-explain="${id}"`) - 9))?.[2] ?? '';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/**
 * Where each explanation sits (R1, R3): never inside a link, a button, a paragraph or another summary; the summary is
 * the first child of its details and holds no link or button; nothing on it needs a script.
 */
function placementProblems(html: string): string[] {
  const stack: string[] = [];
  const problems: string[] = [];
  let prev = '';
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
    const [, close, raw, attrs, self] = m;
    const tag = raw.toLowerCase();
    if (close) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      prev = `/${tag}`;
      continue;
    }
    if (tag === 'details') {
      for (const bad of ['a', 'button', 'p', 'summary']) if (stack.includes(bad)) problems.push(`<details> inside <${bad}>`);
      if (/\son\w+=/i.test(attrs)) problems.push('<details> with an inline handler');
    }
    if (tag === 'summary' && prev !== 'details') problems.push('<summary> is not the first child of <details>');
    if ((tag === 'a' || tag === 'button') && stack.includes('summary')) problems.push(`<${tag}> inside <summary>`);
    if (!self && !VOID.has(tag)) stack.push(tag);
    prev = tag;
  }
  return problems;
}

const OLD_LABELS = ['Sommelier recommendation', 'Rekomendacja sommeliera', 'Best match', 'Najlepsze dopasowanie', 'Perfect with your dish', 'Pasuje do Twojego dania', 'Para od sommeliera', 'Every recommendation follows', 'Sommelier pairing available'];

let duck = '';
let plainDish = '';
let duckWine = '';
let notSuggested = '';
let tableIds = '';
let notSuggestedDish = { id: '', name: '' };

beforeAll(async () => {
  const scope = await createRequestScope();
  const c = scope.cradle;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!.id;
  for (const d of menu.dishes) {
    const r = await c.recommendationService.forDish('halka', d.id);
    if (r && r.result.items.length > 0 && r.result.items.every((i) => !i.sommelier)) { plainDish = d.id; break; }
  }
  const forDuck = (await c.recommendationService.forDish('halka', duck))!;
  duckWine = forDuck.result.items[0].wine.id;
  const wines = await c.wineRepository.listByRestaurant(menu.restaurant.id, { activeOnly: true });
  // a wine below the threshold (or rejected) for some dish: G7 has no score to show for that pair
  search: for (const d of menu.dishes) {
    for (const w of wines) {
      const details = await c.recommendationService.wineDetails('halka', w.id, d.id);
      if (details?.match === null) { notSuggested = w.id; notSuggestedDish = d; break search; }
    }
  }
  tableIds = menu.dishes.filter((d) => d.category === 'Mains').slice(0, 2).map((d) => d.id).join(',');
  await scope.dispose();
  expect({ duck, plainDish, duckWine, notSuggested, tableIds }).toEqual({ duck: expect.any(String), plainDish: expect.stringMatching(/./), duckWine: expect.stringMatching(/./), notSuggested: expect.stringMatching(/./), tableIds: expect.stringMatching(/,/) });
});

async function setSettings(patch: { showScores?: boolean; showUnreviewed?: boolean }) {
  const scope = await createRequestScope();
  await scope.cradle.publishService.updateSettings('halka', patch);
  await scope.dispose();
}

describe('G3 and G4: one explanation per screen, in the right place (AC2, AC3)', () => {
  for (const lang of ['en', 'pl'] as const) {
    it(`${lang}: "Why these wines?" once on G3, plus "How do the filters work?" in the open sheet`, async () => {
      const t = lang === 'pl' ? pl : en;
      const html = await render(WinesPage, { dishId: duck }, {}, lang);
      expect(explainIds(html)).toEqual(['wines']);
      expect(html).toContain(`<span>${t.guest.explain.wines.summary}</span></summary>`);
      expect(placementProblems(html)).toEqual([]);
      const sheet = await render(WinesPage, { dishId: duck }, { sheet: 'filters' }, lang);
      expect(explainIds(sheet)).toEqual(['wines', 'filters']);
      expect(placementProblems(sheet)).toEqual([]);
    });
  }

  it('the explanation stands between the quick preferences and the first wine, closed', async () => {
    const html = await render(WinesPage, { dishId: duck });
    const at = html.indexOf('data-explain="wines"');
    expect(html.indexOf('Quick preferences')).toBeLessThan(at);
    expect(html.indexOf('Pinot and sour cherry jus')).toBeGreaterThan(at);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });
});

describe('labels on G1, G3 and G9 (AC10, R7)', () => {
  it('the duck shows the sommelier’s pairing; a dish without one shows the engine’s top pick, in both languages', async () => {
    const enDuck = await render(WinesPage, { dishId: duck });
    expect(enDuck).toContain('Sommelier’s pairing');
    expect(enDuck).toContain('Match ');
    const plDuck = await render(WinesPage, { dishId: duck }, {}, 'pl');
    expect(plDuck).toContain('Para sommeliera');
    expect(glasses(plDuck).every((l) => /^Dopasowanie \d+ procent$/.test(l))).toBe(true);
    expect(await render(WinesPage, { dishId: plainDish })).toContain('Recommended for your dish');
    expect(await render(WinesPage, { dishId: plainDish }, {}, 'pl')).toContain('Polecane do Twojego dania');
  });

  it('no old name on the dish, the menu or the staff lookup', async () => {
    const pages = [
      await render(WinesPage, { dishId: duck }), await render(WinesPage, { dishId: duck }, {}, 'pl'),
      await render(WinesPage, { dishId: plainDish }), await render(WinesPage, { dishId: plainDish }, {}, 'pl'),
      await render(MenuPage, {}), await render(MenuPage, {}, {}, 'pl'),
      await render(StaffPage, {}, { dish: duck }), await render(StaffPage, {}, { dish: duck }, 'pl')
    ];
    for (const html of pages) for (const old of OLD_LABELS) expect(html).not.toContain(old);
    expect(pages[4]).toContain('Sommelier’s pairing');
    expect(pages[5]).toContain('Para sommeliera');
    expect(pages[6]).toContain('Sommelier’s pairing · first choice');
    expect(pages[7]).toContain('Para sommeliera · pierwszy wybór');
  });
});

describe('G3 follows the live guest settings (AC8, AC9)', () => {
  beforeEach(async () => setSettings({ showScores: true, showUnreviewed: true }));
  afterEach(async () => setSettings({ showScores: true, showUnreviewed: true }));

  it('without percentages: no number in the glass names, no "%" in the explanation, the glass explained instead', async () => {
    await setSettings({ showScores: false });
    for (const lang of ['en', 'pl'] as const) {
      const html = await render(WinesPage, { dishId: duck }, {}, lang);
      const names = glasses(html);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) expect(n).toBe((lang === 'pl' ? pl : en).guest.wines.glassLabel);
      const text = explainText(html, 'wines');
      expect(text).not.toContain('%');
      expect(text).toMatch(lang === 'pl' ? /kieliszek/i : /fuller glass/i);
    }
  });

  it('with only the sommelier’s pairings: no mention of the engine’s label or the pairing rules', async () => {
    await setSettings({ showUnreviewed: false });
    const html = await render(WinesPage, { dishId: duck });
    expect(html).not.toContain('Recommended for your dish');
    expect(html).not.toContain('pairing rules');
    expect(html).toContain('Every wine comes from Halka’s list and is recommended by Marta Wierzbicka.');
    const pl1 = await render(WinesPage, { dishId: duck }, {}, 'pl');
    expect(pl1).not.toContain('Polecane do Twojego dania');
    // a dish without a sommelier's pairing is now an empty list: the explanation stays above it
    const empty = await render(WinesPage, { dishId: plainDish });
    expect(empty).toContain('No wine fits all your choices');
    expect(explainIds(empty)).toEqual(['wines']);
    await setSettings({ showUnreviewed: true });
    const on = await render(WinesPage, { dishId: duck });
    expect(explainText(on, 'wines')).toContain('Recommended for your dish');
    expect(on).toContain('the others are matched by our pairing rules');
  });
});

describe('G7 and G8: a match glass only with a real score (AC2, AC13, Q13)', () => {
  it('from a dish with a score: one glass named in the page language and one explanation with the score', async () => {
    const enHtml = await render(WinePage, { wineId: duckWine }, { dish: duck });
    expect(explainIds(enHtml)).toEqual(['wine']);
    expect(placementProblems(enHtml)).toEqual([]);
    expect(glasses(enHtml)).toHaveLength(1);
    expect(glasses(enHtml)[0]).toMatch(/^Match \d+ percent$/);
    expect(explainText(enHtml, 'wine')).toMatch(/\d+% rates how well this wine suits “Duck breast”/);
    const plHtml = await render(WinePage, { wineId: duckWine }, { dish: duck }, 'pl');
    expect(glasses(plHtml)[0]).toMatch(/^Dopasowanie \d+ procent$/);
  });

  it('from the table result, without a dish, or for a wine the dish does not suggest: no glass, and the explanation says why', async () => {
    const fromTable = await render(WinePage, { wineId: duckWine }, { table: tableIds });
    expect(glasses(fromTable)).toEqual([]);
    expect(explainText(fromTable, 'wine')).toContain('There is no rating here');
    const noDish = await render(WinePage, { wineId: duckWine });
    expect(glasses(noDish)).toEqual([]);
    expect(explainIds(noDish)).toEqual(['wine']);
    const notForDuck = await render(WinePage, { wineId: notSuggested }, { dish: notSuggestedDish.id });
    expect(glasses(notForDuck)).toEqual([]);
    expect(explainText(notForDuck, 'wine')).toContain(`is not among the wines we suggest for “${notSuggestedDish.name}”`);
    expect(placementProblems(notForDuck)).toEqual([]);
  });

  it('G8 never draws the glass', async () => {
    expect(glasses(await render(SelectedPage, { wineId: duckWine }, { dish: duck }))).toEqual([]);
    expect(glasses(await render(SelectedPage, { wineId: duckWine }, { table: tableIds }))).toEqual([]);
  });
});

describe('dashboard pieces (AC14, R2)', () => {
  it('ScoreBadge reads its meaning out with the number, without a title', () => {
    const plHtml = renderToStaticMarkup(createElement(ScoreBadge, { score: 81, t: pl }));
    expect(plHtml).toContain('81%<span class="sr-only"> Wynik dopasowania silnika</span>');
    expect(plHtml).not.toContain('title=');
    expect(renderToStaticMarkup(createElement(ScoreBadge, { score: 81, t: en }))).toContain('Engine match score');
  });

  it('PanelExplain is the shared disclosure in the panel theme; the compact one keeps an accessible name', () => {
    const full = renderToStaticMarkup(createElement(PanelExplain, { id: 'score', summary: 'How does the engine score a pairing?', points: ['One', 'Two'] }));
    expect(full).toMatch(/^<details data-explain="score"/);
    expect(full).toContain('<span>How does the engine score a pairing?</span>');
    expect(full).toContain('<li>Two</li>');
    const compact = renderToStaticMarkup(createElement(PanelExplain, { id: 'suggestions', summary: 'How guests see suggestions', points: ['x'], compact: true }));
    expect(compact).toContain('<span class="sr-only">How guests see suggestions</span>');
    expect(compact).toContain('size-6');
    expect(placementProblems(full + compact)).toEqual([]);
  });
});
