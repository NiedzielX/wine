import { ENGINE_FACTS, type EngineFacts, type GuestInteractionRepository } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import StaffTablePage from '@/app/(guest)/r/[slug]/staff/table/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import TableResultPage from '@/app/(guest)/r/[slug]/table/result/page';
import WinePage from '@/app/(guest)/r/[slug]/wine/[wineId]/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { formatPrice } from '@/server/i18n';
import { explainIds } from './html';

/**
 * Spec 2026-10-16-whole-table-waiter-path, phase 4: how much wine for the table. "How many people are drinking wine?"
 * on G5 and G11 (form) and as links 2–8 on G6 and G11; the quantity line ("For 6 people: 3 bottles · 960 zł") only after
 * an explicit choice — there is no default number of people (owner's decision Q4); `people` travels G6 → G7 → G8, which
 * shows the line for the chosen bottle; the events carry `people` (R14–R16, AC16–AC20 as amended by Q4). Pages rendered
 * to HTML on the in-memory data source.
 */

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function render(page: unknown, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en', params: Record<string, string> = {}): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '').replace(/&amp;/g, '&');
}
const settle = async () => { await Promise.all(next().afterTasks.splice(0)); };
/** The quantity line(s) of a page. */
const quantityLines = (html: string) => [...html.matchAll(/<p data-table-quantity=""[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
/** The number links 2–8 (named "n people" / "n osób") as [href, n], and the one marked current. */
const peopleTags = (html: string) => [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]).filter((tag) => /aria-label="\d+ (people|osób)"/.test(tag));
const peopleLinks = (html: string) => peopleTags(html).map((tag) => [tag, attr(tag, 'href')!, new URL(attr(tag, 'href')!, 'http://x').searchParams.get('people')!] as const);
const currentPeople = (html: string) => peopleTags(html).filter((tag) => attr(tag, 'aria-current') === 'true').map((tag) => Number(new URL(attr(tag, 'href')!, 'http://x').searchParams.get('people')));
/** The `people` radios of a form as [value, checked]. */
const peopleRadios = (html: string) => [...html.matchAll(/<input\s[^>]*name="people"[^>]*>/g)].map((m) => [attr(m[0], 'value'), / checked=""/.test(m[0])] as const);
const checkedPeople = (html: string) => peopleRadios(html).filter(([, c]) => c).map(([v]) => v);

const SIX_NAMES = ['Baltic herring', 'Seared scallops', 'Pike-perch', 'Salt-baked celeriac', 'Dry-aged ribeye, 300 g', 'Venison loin'];
const FOUR_NAMES = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast', 'Pike-perch'];
let SIX: string[] = [];
let FOUR: string[] = [];
let restaurantId = '';
let events: GuestInteractionRepository;
let savigny = '';
let radikon = '';

beforeAll(async () => {
  const c = (await createRequestScope()).cradle;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  events = c.guestInteractionRepository;
  const id = (name: string) => menu.dishes.find((d) => d.name === name)!.id;
  SIX = SIX_NAMES.map(id);
  FOUR = FOUR_NAMES.map(id);
  const wines = await c.wineRepository.listByRestaurant(restaurantId);
  savigny = wines.find((w) => w.name === 'Savigny-lès-Beaune')!.id;
  radikon = wines.find((w) => w.producer === 'Radikon')!.id;
});

afterEach(settle);

async function forTable(ids: string[], people: number | null, serving: 'bottle' | 'any' = 'any') {
  const scope = await createRequestScope();
  const out = (await scope.cradle.recommendationService.forTable('halka', ids, { serving }, 'en', { relaxBudget: true, people }))!;
  await scope.dispose();
  return out.result;
}

describe('no default number of people (Q4): no amount until someone chooses', () => {
  it('G6 without `people`: no quantity line, the links 2–8 with a hint, none of them current', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const t = lang === 'pl' ? pl : en;
      const html = await render(TableResultPage, { dishes: SIX.join(',') }, lang);
      expect(quantityLines(html)).toEqual([]);
      expect(html).toContain(t.guest.tableQuantity.hint);
      expect(peopleLinks(html).map((m) => Number(m[2]))).toEqual([2, 3, 4, 5, 6, 7, 8]);
      expect(currentPeople(html)).toEqual([]);
      // neither "(assumed — change)" nor a number of people the guest never gave
      expect(html).not.toMatch(/For \d+ people|Dla \d+ osób/);
    }
  });

  it('G6 with an invalid `people` (1, 13, 2.5, x, empty) is the same as none', async () => {
    for (const people of ['1', '13', '2.5', 'x', '']) {
      const html = await render(TableResultPage, { dishes: SIX.join(','), people });
      expect(quantityLines(html)).toEqual([]);
      expect(currentPeople(html)).toEqual([]);
    }
  });

  it('G11 without `people`: the bottle, but no quantity; the links and the form option "Skip" checked', async () => {
    const html = await render(StaffTablePage, { dishes: SIX.join(',') });
    expect(html).toContain('This bottle: No. 109 Radikon Slatnik.');
    expect(quantityLines(html)).toEqual([]);
    expect(html).toContain(en.guest.tableQuantity.hint);
    expect(checkedPeople(html)).toEqual(['']);
  });
});

describe('G6: the quantity after a choice (R16, AC18, AC19)', () => {
  it('six dishes for six people (AC18): Radikon, 3 bottles, 960 zł — in English and Polish', async () => {
    const en6 = await render(TableResultPage, { dishes: SIX.join(','), people: '6' });
    expect(quantityLines(en6)).toEqual([`For 6 people: 3 bottles · ${formatPrice(960, 'en')}`]);
    expect(currentPeople(en6)).toEqual([6]);
    const pl6 = await render(TableResultPage, { dishes: SIX.join(','), people: '6' }, 'pl');
    expect(quantityLines(pl6)).toEqual([`Dla 6 osób: 3 butelki · ${formatPrice(960, 'pl')}`]);
  });

  it('people=3 (AC19): the line for 3 from the engine, link 3 current, the bottle links and the way back carry people=3', async () => {
    const result = await forTable(FOUR, 3);
    const q = result.items[0].quantity!;
    const html = await render(TableResultPage, { dishes: FOUR.join(','), people: '3' });
    expect(quantityLines(html)).toEqual([en.guest.tableQuantity.line({ ...q, total: formatPrice(q.total, 'en') })]);
    expect(currentPeople(html)).toEqual([3]);
    const wineLinks = [...html.matchAll(/href="(\/r\/halka\/wine\/[^"]+\?table=[^"]+)"/g)].map((m) => m[1]);
    expect(wineLinks.length).toBe(result.items.length);
    for (const link of wineLinks) expect(new URL(link, 'http://x').searchParams.get('people')).toBe('3');
    // back to G5 with the choice, so the form shows it
    expect(html).toMatch(/href="\/r\/halka\/table\?dishes=[^"]*people=3/);
  });

  it('"8+" is 10 people: the line says 10, no link 2–8 is current', async () => {
    const html = await render(TableResultPage, { dishes: SIX.join(','), people: '10' });
    expect(quantityLines(html)[0]).toMatch(/^For 10 people: /);
    expect(currentPeople(html)).toEqual([]);
  });

  it('by the glass there is no quantity and no question', async () => {
    const html = await render(TableResultPage, { dishes: FOUR.join(','), people: '4', serving: 'glass' });
    expect(quantityLines(html)).toEqual([]);
    expect(html).not.toContain('data-people-links');
  });

  it('the people links keep the dishes and the preferences', async () => {
    const html = await render(TableResultPage, { dishes: FOUR.join(','), maxPrice: '400' });
    for (const [, href] of peopleLinks(html)) {
      const u = new URL(href, 'http://x');
      expect(u.pathname).toBe('/r/halka/table/result');
      expect(u.searchParams.get('dishes')).toBe(FOUR.join(','));
      expect(u.searchParams.get('maxPrice')).toBe('400');
    }
  });
});

describe('G5 and G11: "How many people are drinking wine?" in the form (R16)', () => {
  it('G5: radios Skip, 2–8 and 8+ (10) named `people`; Skip checked by default, the chosen one when it came back', async () => {
    const html = await render(TablePage, {});
    expect(peopleRadios(html).map(([v]) => v)).toEqual(['', '2', '3', '4', '5', '6', '7', '8', '10']);
    expect(html).toContain(en.guest.tableQuantity.question);
    expect(checkedPeople(html)).toEqual(['']);
    const back = await render(TablePage, { dishes: FOUR.join(','), people: '4' }, 'pl');
    expect(back).toContain(pl.guest.tableQuantity.question);
    expect(checkedPeople(back)).toEqual(['4']);
  });

  it('G11 with people=6 and six dishes: the line under the bottle; "Choose this one" keeps people; the people links keep the dishes', async () => {
    const html = await render(StaffTablePage, { dishes: SIX.join(','), people: '6' });
    expect(quantityLines(html)).toEqual([`For 6 people: 3 bottles · ${formatPrice(960, 'en')}`]);
    expect(checkedPeople(html)).toEqual(['6']);
    const choose = [...html.matchAll(/<a\s[^>]*data-choose="[^>]*>/g)].map((m) => attr(m[0], 'href')!);
    expect(choose.length).toBeGreaterThan(0);
    for (const href of choose) expect(new URL(href, 'http://x').searchParams.get('people')).toBe('6');
    // G11 writes the dishes in menu order
    for (const [, href] of peopleLinks(html)) expect(new URL(href, 'http://x').searchParams.get('dishes')!.split(',').sort()).toEqual([...SIX].sort());
  });

  it('G11: a chosen alternative gets its own quantity, and the people links stay on it', async () => {
    const result = await forTable(SIX, 4, 'bottle');
    const alt = result.items[1];
    const html = await render(StaffTablePage, { dishes: SIX.join(','), wine: alt.wine.id, people: '4' });
    expect(quantityLines(html)).toEqual([en.guest.tableQuantity.line({ ...alt.quantity!, total: formatPrice(alt.quantity!.total, 'en') })]);
    for (const [, href] of peopleLinks(html)) expect(new URL(href, 'http://x').searchParams.get('wine')).toBe(alt.wine.id);
  });
});

describe('G7 → G8: the chosen number of people travels and G8 "For the table" shows the line (R16, AC19)', () => {
  it('G7 keeps people in the form and in the way back', async () => {
    const html = await render(WinePage, { table: FOUR.join(','), people: '3' }, 'en', { wineId: savigny });
    expect(html).toContain('<input type="hidden" name="people" value="3"/>');
    expect(html).toMatch(/href="\/r\/halka\/table\/result\?dishes=[^"]*people=3/);
  });

  it('G8: Savigny for 3 people is 1 bottle + 1 glass, 384 zł (the spec example), in English and Polish', async () => {
    const enHtml = await render(SelectedPage, { table: FOUR.join(','), people: '3', serving: 'bottle' }, 'en', { wineId: savigny });
    expect(enHtml).toContain(en.guest.selected.forTable);
    expect(quantityLines(enHtml)).toEqual([`For 3 people: 1 bottle + 1 glass · ${formatPrice(384, 'en')}`]);
    expect(enHtml).toMatch(/href="\/r\/halka\/wine\/[^"]*people=3/);
    const plHtml = await render(SelectedPage, { table: FOUR.join(','), people: '3', serving: 'bottle' }, 'pl', { wineId: savigny });
    expect(quantityLines(plHtml)).toEqual([`Dla 3 osób: 1 butelka + 1 kieliszek · ${formatPrice(384, 'pl')}`]);
  });

  it('G8: no line without people, by the glass, next to a dish, or for one dish', async () => {
    expect(quantityLines(await render(SelectedPage, { table: FOUR.join(','), serving: 'bottle' }, 'en', { wineId: savigny }))).toEqual([]);
    expect(quantityLines(await render(SelectedPage, { table: FOUR.join(','), people: '3', serving: 'glass' }, 'en', { wineId: savigny }))).toEqual([]);
    expect(quantityLines(await render(SelectedPage, { dish: FOUR[0], table: FOUR.join(','), people: '3', serving: 'bottle' }, 'en', { wineId: savigny }))).toEqual([]);
    expect(quantityLines(await render(SelectedPage, { table: FOUR[0], people: '3', serving: 'bottle' }, 'en', { wineId: savigny }))).toEqual([]);
  });

  it('G8: Radikon (no glass) for 6 people is 3 bottles', async () => {
    const html = await render(SelectedPage, { table: SIX.join(','), people: '6', serving: 'bottle' }, 'en', { wineId: radikon });
    expect(quantityLines(html)).toEqual([`For 6 people: 3 bottles · ${formatPrice(960, 'en')}`]);
  });
});

describe('the events carry the chosen number of people (R16)', () => {
  const list = async (sid: string) => { await settle(); return events.listBySession(restaurantId, sid); };

  it('table_recommendation_viewed and wine_selected from the table get `people`; without a choice they have none', async () => {
    const sid = '3f0a1b2c-4d5e-4f60-8a7b-9c0d1e2f3a4b';
    await render(TableResultPage, { dishes: FOUR.join(','), people: '5', sid });
    await render(SelectedPage, { table: FOUR.join(','), people: '5', serving: 'bottle', sid }, 'en', { wineId: savigny });
    await render(TableResultPage, { dishes: FOUR.join(','), sid });
    const rows = await list(sid);
    expect(rows.map((e) => e.name)).toEqual(['table_recommendation_viewed', 'wine_selected', 'table_recommendation_viewed']);
    expect(rows[0].props).toMatchObject({ people: 5 });
    expect(rows[1].props).toMatchObject({ context: 'table', people: 5 });
    expect(rows[2].props).not.toHaveProperty('people');
  });

  it('staff_table_lookup gets `people` when the waiter chose it', async () => {
    const html = await render(StaffTablePage, { dishes: SIX.join(','), people: '6' });
    const sid = /name="sid" value="([^"]+)"/.exec(html)![1];
    const rows = await list(sid);
    expect(rows).toMatchObject([{ name: 'staff_table_lookup', props: { source: 'staff', people: 6 } }]);
  });
});

describe('the explanations and the dictionaries (R11, R16, AC20)', () => {
  it('one "i" per table screen, each with the amount per person "if everyone drinks the same wine", numbers from ENGINE_FACTS', async () => {
    for (const [page, id, search] of [[TablePage, 'table', {}], [TableResultPage, 'tableResult', { dishes: FOUR.join(',') }], [StaffTablePage, 'staffTable', { dishes: FOUR.join(',') }]] as const) {
      const html = await render(page, search);
      expect(explainIds(html)).toEqual([id]);
      expect(html).toContain('Amount: about 300 ml a person, if everyone drinks the same wine.');
      const plHtml = await render(page, search, 'pl');
      expect(plHtml).toContain('Ilość: ok. 300 ml na osobę, jeśli wszyscy piją to samo wino.');
    }
    const marked = { ...ENGINE_FACTS, tableMlPerPerson: 1301, tableMaxExtraGlasses: 1007 } as EngineFacts;
    for (const t of [en, pl]) {
      const points = [
        ...t.guest.explain.table.points(marked), ...t.guest.explain.tableResult.points(marked, { showScores: true }),
        ...t.guest.explain.tableResult.points(marked, { showScores: false }), ...t.guest.explain.staffTable.points(marked)
      ].join(' ');
      expect(points.match(/1301 ml/g)).toHaveLength(4);
      // the waiter's G11 also says how glasses top up the bottles
      expect(t.guest.explain.staffTable.points(marked).join(' ')).toMatch(/1007 (glasses|kieliszków)/);
    }
  });

  it('Polish numerals for bottles and glasses (AC20); English singular and plural', () => {
    const line = (t: typeof en, bottles: number, glasses = 0) => t.guest.tableQuantity.line({ people: 6, bottles, glasses, total: 'X' });
    expect([1, 2, 5, 12, 22].map((n) => line(pl, n))).toEqual([
      'Dla 6 osób: 1 butelka · X', 'Dla 6 osób: 2 butelki · X', 'Dla 6 osób: 5 butelek · X', 'Dla 6 osób: 12 butelek · X', 'Dla 6 osób: 22 butelki · X'
    ]);
    expect([1, 2, 5].map((g) => line(pl, 1, g))).toEqual([
      'Dla 6 osób: 1 butelka + 1 kieliszek · X', 'Dla 6 osób: 1 butelka + 2 kieliszki · X', 'Dla 6 osób: 1 butelka + 5 kieliszków · X'
    ]);
    expect([line(en, 1), line(en, 3, 1), line(en, 2, 2)]).toEqual(['For 6 people: 1 bottle · X', 'For 6 people: 3 bottles + 1 glass · X', 'For 6 people: 2 bottles + 2 glasses · X']);
  });
});
