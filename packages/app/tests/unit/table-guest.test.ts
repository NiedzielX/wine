import { createElement, type FunctionComponent } from 'react';
import { ENGINE_FACTS, type EngineFacts } from '@wine-match/core';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import LandingPage from '@/app/(guest)/r/[slug]/page';
import TableResultPage from '@/app/(guest)/r/[slug]/table/result/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-whole-table-waiter-path, phase 3 (the guest): the "Whole table" card on G0 (R8, AC13) and the honest
 * table result on G6 — raw per-dish percentages, the "works with n of m" line, the relaxed budget, no numbers when the
 * restaurant hides them (R9, AC14, AC15) — and E08's paragraph in G6's one explanation (R11). Pages rendered to HTML.
 */

const headers = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string> } }).__wmNext.headers;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

async function render(page: unknown, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  headers().clear();
  headers().set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

async function setShowScores(showScores: boolean) {
  const scope = await createRequestScope();
  await scope.cradle.publishService.updateSettings('halka', { showScores });
  await scope.dispose();
}

/** The table result the page shows, straight from the service (the page must not compute anything of its own). */
async function forTable(ids: string[], prefs: Record<string, unknown> = {}, locale: 'en' | 'pl' = 'en') {
  const scope = await createRequestScope();
  const out = (await scope.cradle.recommendationService.forTable('halka', ids, prefs, locale, { relaxBudget: true }))!;
  await scope.dispose();
  return out.result;
}

/** The bottle card: from the first link to a wine to its end. */
const bestCard = (html: string) => {
  const at = html.indexOf('/r/halka/wine/');
  return html.slice(at, html.indexOf('</a>', at));
};

// the AC3 tables of the spec, by dish name (ids differ between data sources)
const SIX_NAMES = ['Baltic herring', 'Seared scallops', 'Pike-perch', 'Salt-baked celeriac', 'Dry-aged ribeye, 300 g', 'Venison loin'];
const FOUR_NAMES = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast', 'Pike-perch'];
let SIX: string[] = [];
let FOUR: string[] = [];
let PICKS: string[] = [];

beforeAll(async () => {
  const scope = await createRequestScope();
  const menu = (await scope.cradle.catalogService.publishedMenu('halka'))!;
  await scope.dispose();
  const id = (name: string) => menu.dishes.find((d) => d.name === name)!.id;
  SIX = SIX_NAMES.map(id);
  FOUR = FOUR_NAMES.map(id);
  PICKS = FOUR.slice(0, 3);
});

describe('G0: the "Whole table" card (R8, AC13)', () => {
  for (const lang of ['en', 'pl'] as const) {
    it(`${lang}: the card with a link to the table selection stands before "Pick your dish"; the header button is gone`, async () => {
      const t = lang === 'pl' ? pl : en;
      const html = await render(LandingPage, {}, lang);
      const card = html.indexOf(t.guest.landing.tableCardTitle);
      expect(card).toBeGreaterThan(0);
      expect(html).toContain(t.guest.landing.tableCardText);
      const link = html.indexOf('href="/r/halka/table?', card);
      expect(link).toBeGreaterThan(card);
      expect(html.indexOf(t.guest.landing.tableCardAction, card)).toBeGreaterThan(card);
      expect(html.indexOf(t.guest.landing.pickDish)).toBeGreaterThan(link);
      // one way in, not two: the quiet header button only exists without the card
      expect(html).not.toContain(t.guest.hero.tableAction);
    });
  }

  it('the card carries the guest’s explicit language and session like every guest link', async () => {
    const sid = '5a0be7e5-0000-4000-8000-00000000c0de';
    const html = await render(LandingPage, { lang: 'pl', sid });
    expect(html).toContain(`href="/r/halka/table?lang=pl&amp;sid=${sid}"`);
  });
});

describe('G6: the honest table result (R1, R9, R12, AC14)', () => {
  afterEach(async () => setShowScores(true));

  it('six dishes (AC3 table): Radikon works with 5 of 6, less so with the venison — in English and Polish', async () => {
    const enHtml = await render(TableResultPage, { dishes: SIX.join(',') });
    expect(enHtml).toContain('Radikon');
    expect(bestCard(enHtml)).toContain('Slatnik');
    expect(bestCard(enHtml)).toContain('Works with 5 of 6 dishes, less so with: Venison loin.');
    const plHtml = await render(TableResultPage, { dishes: SIX.join(',') }, 'pl');
    expect(bestCard(plHtml)).toContain('Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.');
  });

  it('the fit line replaces the old reason on the card and on every alternative', async () => {
    const result = await forTable(FOUR);
    const html = await render(TableResultPage, { dishes: FOUR.join(',') });
    expect(result.items.length).toBeGreaterThan(1);
    for (const item of result.items) expect(html).not.toContain(item.why);
    expect(bestCard(html)).toContain('Works with all 4 dishes.');
    const lines = html.match(/<p class="mt-1\.5 text-sm text-ink-2">(?:Works with|Not a strong match)[^<]*<\/p>/g) ?? [];
    expect(lines).toHaveLength(result.items.length);
  });

  it('each dish shows its raw engine score, never the score with the sommelier’s bonus; the seal is named in text', async () => {
    const result = await forTable(PICKS);
    const best = result.items[0];
    const boosted = best.perDish.filter((x) => x.sommelierPick && x.score !== x.engineScore);
    expect(boosted.length).toBeGreaterThan(0);
    const card = bestCard(await render(TableResultPage, { dishes: PICKS.join(',') }));
    const rows = [...card.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(rows).toHaveLength(best.perDish.length);
    best.perDish.forEach((x, i) => {
      expect(rows[i]).toContain(x.dish.name);
      expect(rows[i]).toContain(`<b class="text-right font-semibold tabular-nums">${x.engineScore}%</b>`);
      expect(rows[i]).toContain(`width:${x.engineScore}%`);
      expect(rows[i].includes('Sommelier’s pairing')).toBe(x.sommelierPick);
    });
    expect(card).not.toContain('title=');
    expect(card).toContain(`${best.overall}%`);
  });

  it('without percentages: no number on the card, the alternatives or in the explanation; the bars stay', async () => {
    await setShowScores(false);
    for (const lang of ['en', 'pl'] as const) {
      const html = await render(TableResultPage, { dishes: PICKS.join(',') }, lang);
      const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
      // the bars stay: their widths are inline styles, not text
      expect(main).toMatch(/style="width:\d+%"/);
      // the text a guest reads (tags and their attributes — bar widths, encoded links — left out)
      expect(main.replace(/<[^>]*>/g, ' ')).not.toMatch(/\d\s*%/);
      expect(main).not.toContain((lang === 'pl' ? pl : en).guest.tableResult.overall);
    }
  });

  it('one explanation on the screen, outside the bottle link, with E08’s paragraph and numbers from ENGINE_FACTS', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const t = lang === 'pl' ? pl : en;
      const html = await render(TableResultPage, { dishes: PICKS.join(',') }, lang);
      expect(explainIds(html)).toEqual(['tableResult']);
      expect((html.match(/<summary/g) ?? []).length).toBe(1);
      expect(placementProblems(html)).toEqual([]);
      expect(html).toContain(t.guest.explain.tableResult.summary);
      expect(html.indexOf('data-explain="tableResult"')).toBeLessThan(html.indexOf('/r/halka/wine/'));
      expect(html).toContain(lang === 'pl' ? '„Pasuje” znaczy co najmniej 70%' : '“Works with” means at least 70%');
    }
  });
});

describe('G6: a budget that rules out every bottle is relaxed with a notice (R3, R9, AC15)', () => {
  for (const [name, search, max] of [['red up to 200 zł', { styles: 'red', maxPrice: '200' }, 200], ['up to 150 zł', { maxPrice: '150' }, 150]] as const) {
    it(`${name}: the notice and two bottles instead of "No bottle fits these filters"`, async () => {
      const html = await render(TableResultPage, { dishes: FOUR.join(','), ...search });
      expect(html).toContain(`Nothing matches under ${max} zł. These are the closest options.`);
      expect(html).not.toContain(en.guest.tableResult.noneTitle);
      const result = await forTable(FOUR, { ...search, maxPrice: max, styles: 'styles' in search ? ['red'] : [] });
      expect(result.items).toHaveLength(2);
      for (const item of result.items) expect(html).toContain(item.wine.name);
      expect(html.indexOf('Nothing matches under')).toBeLessThan(html.indexOf('/r/halka/wine/'));
      const plHtml = await render(TableResultPage, { dishes: FOUR.join(','), ...search }, 'pl');
      expect(plHtml).toContain(`Nic nie mieści się w budżecie do ${max} zł.`);
    });
  }

  it('a budget that leaves bottles in has no notice; a colour with no bottle is still the empty state', async () => {
    const fits = await render(TableResultPage, { dishes: FOUR.join(','), maxPrice: '400' });
    expect(fits).not.toContain('Nothing matches under');
    // the one orange wine is not poured by the glass: lifting the budget cannot help, so no notice and the empty state
    const empty = await render(TableResultPage, { dishes: FOUR.join(','), styles: 'orange', serving: 'glass', maxPrice: '45' });
    expect(empty).toContain(en.guest.tableResult.noneTitle);
    expect(empty).not.toContain('Nothing matches under');
    expect(empty).not.toContain('/r/halka/wine/');
  });
});

describe('the fit line and the G6 explanation in the dictionaries (R11, R12)', () => {
  const fit = (fits: number, of: number, weaker: string[] = [], compromise = false) => ({ fits, of, weaker, compromise });

  it('English and Polish say the same thing for every shape of the fit', () => {
    const cases: Array<[ReturnType<typeof fit>, string, string]> = [
      [fit(4, 4), 'Works with all 4 dishes.', 'Pasuje do wszystkich 4 dań.'],
      [fit(4, 4, [], true), 'Works with all 4 dishes, though it’s a compromise.', 'Pasuje do wszystkich 4 dań, choć to kompromis.'],
      [fit(2, 2), 'Works with both dishes.', 'Pasuje do obu dań.'],
      [fit(2, 2, [], true), 'Works with both dishes, though it’s a compromise.', 'Pasuje do obu dań, choć to kompromis.'],
      [fit(5, 6, ['Venison loin']), 'Works with 5 of 6 dishes, less so with: Venison loin.', 'Pasuje do 5 z 6 dań, słabiej do: Venison loin.'],
      [fit(1, 3, ['A', 'B']), 'Works with 1 of 3 dishes, less so with: A, B.', 'Pasuje do 1 z 3 dań, słabiej do: A, B.'],
      [fit(1, 6, ['A', 'B', 'C', 'D', 'E']), 'Works with 1 of 6 dishes, less so with: A, B, C and 2 others.', 'Pasuje do 1 z 6 dań, słabiej do: A, B, C i 2 innych.'],
      [fit(3, 7, ['A', 'B', 'C', 'D']), 'Works with 3 of 7 dishes, less so with: A, B, C and 1 other.', 'Pasuje do 3 z 7 dań, słabiej do: A, B, C i 1 innego.'],
      [fit(0, 4, ['A', 'B', 'C', 'D']), 'Not a strong match for any of the 4 dishes.', 'Nie pasuje dobrze do żadnego z 4 dań.'],
      [fit(1, 1), 'Works with this dish.', 'Pasuje do tego dania.'],
      [fit(0, 1, ['Comber z jelenia']), 'Less of a match for: Comber z jelenia.', 'Słabiej pasuje do: Comber z jelenia.']
    ];
    for (const [f, enText, plText] of cases) {
      expect(en.guest.tableFit.line(f)).toBe(enText);
      expect(pl.guest.tableFit.line(f)).toBe(plText);
    }
  });

  it('the G6 explanation takes every number from ENGINE_FACTS and has no "%" when percentages are hidden', () => {
    const marked = { ...ENGINE_FACTS, tableFitThreshold: 1071, tableSommelierBonus: 1003, tableRejectedCap: 1050, tableMainsWeight: 1.25, tableMeanWeight: 0.55, tableMinWeight: 0.45 } as EngineFacts;
    for (const t of [en, pl]) {
      const on = t.guest.explain.tableResult.points(marked, { showScores: true }).join(' ');
      for (const n of ['1071%', '1003', '1050%', '55%', '45%']) expect(on).toContain(n);
      expect(on).toMatch(/×1[.,]25/);
      const off = t.guest.explain.tableResult.points(marked, { showScores: false }).join(' ');
      expect(off).not.toMatch(/\d/);
      expect(t.guest.explain.tableResult.points(ENGINE_FACTS, { showScores: true }).join(' ')).toContain(`${ENGINE_FACTS.tableFitThreshold}%`);
    }
  });
});
