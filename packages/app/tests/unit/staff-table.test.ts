import { ENGINE_FACTS, MAX_TABLE_DISHES, pickTableItem, serviceDay, type GuestInteractionRepository, type RecommendationCodeRepository } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import StaffTablePage from '@/app/(guest)/r/[slug]/staff/table/page';
import TablePage from '@/app/(guest)/r/[slug]/table/page';
import TableResultPage from '@/app/(guest)/r/[slug]/table/result/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { SYNTHETIC_TRAFFIC_HEADER } from '@/server/usage-events';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-whole-table-waiter-path, phase 2: the waiter's whole table, G11 `/r/{slug}/staff/table` — the form
 * without JavaScript (R5, AC7), the answer above it (R6, AC8), raw per-dish scores (AC9), the switch with G9 and the one
 * explanation (R7, R11, AC11), the code for the bottle (E09 Q19) and `staff_table_lookup` (R13, AC12). Pages rendered to
 * HTML on the in-memory data source.
 */

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function render(page: unknown, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en', extra: Record<string, string> = {}): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  for (const [k, v] of Object.entries(extra)) next().headers.set(k, v);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const g11 = (search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en', extra: Record<string, string> = {}) => render(StaffTablePage, search, lang, extra);
/** The text a reader sees, without tags. */
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
/** The answer block above the form. */
const resultBlock = (html: string) => {
  const at = html.indexOf('data-staff-table-result');
  return at < 0 ? '' : html.slice(at, html.indexOf('</section>', html.lastIndexOf('data-alternative') > at ? html.lastIndexOf('data-alternative') : at));
};
const settle = async () => { await Promise.all(next().afterTasks.splice(0)); };
const CODE = /data-recommendation-code="([A-Z0-9]{3,4})"/;

const SIX_NAMES = ['Baltic herring', 'Seared scallops', 'Pike-perch', 'Salt-baked celeriac', 'Dry-aged ribeye, 300 g', 'Venison loin'];
const FOUR_NAMES = ['Beef tartare', 'Wild mushroom risotto', 'Duck breast', 'Pike-perch'];
let SIX: string[] = [];
let FOUR: string[] = [];
let PICKS: string[] = [];
let ALL: string[] = [];
let restaurantId = '';
let events: GuestInteractionRepository;
let codes: RecommendationCodeRepository;

beforeAll(async () => {
  const c = (await createRequestScope()).cradle;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  events = c.guestInteractionRepository;
  codes = c.recommendationCodeRepository;
  const id = (name: string) => menu.dishes.find((d) => d.name === name)!.id;
  SIX = SIX_NAMES.map(id);
  FOUR = FOUR_NAMES.map(id);
  PICKS = FOUR.slice(0, 3);
  ALL = menu.dishes.map((d) => d.id);
});

afterEach(settle);

/** The table result the page shows, straight from the service. */
async function forTable(ids: string[]) {
  const scope = await createRequestScope();
  const out = (await scope.cradle.recommendationService.forTable('halka', ids, { serving: 'bottle' }, 'en', { relaxBudget: true }))!;
  await scope.dispose();
  return out.result;
}

describe('G11: the form works without JavaScript (R5, AC7)', () => {
  it('a GET form on G11 with a 48 px tile per published dish (a whole <label> around its checkbox), two columns, anchors, budget and colour', async () => {
    const html = await g11({ lang: 'en' });
    expect(html).toMatch(/<form id="staff-table-form"[^>]* action="\/r\/halka\/staff\/table" method="get"/);
    const tiles = [...html.matchAll(/<label data-dish-name="[^"]*" class="([^"]*)"><input type="checkbox"[^>]* name="dish"[^>]* value="([^"]+)"/g)];
    expect(tiles.map((m) => m[2]).sort()).toEqual([...ALL].sort());
    for (const [, cls] of tiles) expect(cls.split(' ')).toContain('min-h-12');
    expect(html).toContain('grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    // the section anchors: plain links to the sections, no script needed
    for (const c of ['starters', 'mains', 'desserts']) {
      expect(html).toContain(`href="#table-cat-${c}"`);
      expect(html).toContain(`id="table-cat-${c}"`);
    }
    expect(html).toContain('(paired separately)');
    expect(html).toMatch(/<input type="radio"[^>]* name="maxPrice"[^>]* value=""/);
    expect(html).toMatch(/<input type="radio"[^>]* name="maxPrice"[^>]* value="200"/);
    expect(html).toMatch(/<details class="mt-5"><summary[^>]*>Colour<\/summary>/);
    expect(html).toMatch(/<input type="hidden" name="lang" value="en"\/>/);
    expect(html).toMatch(/<input type="hidden" name="sid" value="[0-9a-f-]{36}"\/>/);
    expect(html).toContain('>Show the bottle</button>');
    // the search box is a script-only enhancement: nothing of it in the HTML
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('<select');
  });

  it('the form shares its picker with G5: the same checkbox `dish` per dish, in the same menu order', async () => {
    const guest = await render(TablePage);
    const ids = (h: string) => [...h.matchAll(/<input type="checkbox"[^>]* name="dish"[^>]* value="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(await g11())).toEqual(ids(guest));
    expect(guest).toContain('Colour and budget');
  });

  it('one dish, or ids that are not published dishes: "Tick at least two dishes", the selection kept, no answer, no event', async () => {
    const sid = '3a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
    const html = await g11({ dish: FOUR[0], sid });
    expect(html).toContain('Tick at least two dishes.');
    expect(html).not.toContain('data-staff-table-result');
    expect(html).toContain(`name="dish" checked="" value="${FOUR[0]}"`);
    expect(await g11({ dishes: 'nope,also-nope', sid })).toContain('Tick at least two dishes.');
    await settle();
    expect(await events.listBySession(restaurantId, sid)).toEqual([]);
  });

  it('more than twelve dishes: the first twelve in menu order are paired and the screen says so', async () => {
    expect(ALL.length).toBeGreaterThan(MAX_TABLE_DISHES);
    const html = await g11({ dishes: [...ALL].reverse().join(',') });
    expect(html).toContain(`We worked out the first ${MAX_TABLE_DISHES} dishes.`);
    expect(await g11({ dishes: ALL.join(',') }, 'pl')).toContain(`Policzyliśmy pierwsze ${MAX_TABLE_DISHES} dań.`);
    expect(await g11({ dishes: SIX.join(',') })).not.toContain('We worked out the first');
  });
});

describe('G11: the answer (R6, AC8, AC9)', () => {
  it('six dishes (AC3 table), English: "This bottle: No. 109 Radikon Slatnik.", then the fit line, then the bars; no "Say:"', async () => {
    const html = await g11({ dishes: SIX.join(','), lang: 'en' });
    const block = text(resultBlock(html));
    const bottle = block.indexOf('This bottle: No. 109 Radikon Slatnik.');
    const fit = block.indexOf('Works with 5 of 6 dishes, less so with: Venison loin.');
    expect(bottle).toBeGreaterThanOrEqual(0);
    expect(fit).toBeGreaterThan(bottle);
    expect(block.indexOf('Venison loin', fit + 60)).toBeGreaterThan(fit);   // the bars, after the line
    expect(html).not.toContain('Say:');
    // the answer stands above the form, the selection is kept
    expect(html.indexOf('data-staff-table-result')).toBeLessThan(html.indexOf('name="dish"'));
    for (const id of SIX) expect(html).toContain(`name="dish" checked="" value="${id}"`);
  });

  it('Polish: "Ta butelka: nr 109 Radikon Slatnik." and "Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia."', async () => {
    const block = text(resultBlock(await g11({ dishes: SIX.join(',') }, 'pl')));
    expect(block).toContain('Ta butelka: nr 109 Radikon Slatnik.');
    expect(block).toContain('Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.');
  });

  it('at most two alternatives, one line each with "n of 6" and its bottle price; "Choose this one" keeps the table, sid and lang', async () => {
    const result = await forTable(SIX);
    const sid = '4b2c3d4e-5f60-4b7c-9d8e-9f0a1b2c3d4e';
    const html = (await g11({ dishes: SIX.join(','), lang: 'en', sid })).replace(/&amp;/g, '&');
    const alts = [...html.matchAll(/<li data-alternative="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.length).toBeLessThanOrEqual(2);
    expect(alts.map((m) => m[1])).toEqual(result.items.slice(1, 3).map((i) => i.wine.id));
    for (const [, wineId, row] of alts) {
      const item = result.items.find((i) => i.wine.id === wineId)!;
      expect(text(row)).toContain(`${item.fit.fits} of 6`);
      const choose = /href="([^"]+)"[^>]*>Choose this one</.exec(row)![1];
      const url = new URL(choose, 'http://x');
      expect(url.pathname).toBe('/r/halka/staff/table');
      expect(url.searchParams.get('wine')).toBe(wineId);
      expect(url.searchParams.get('dishes')!.split(',').sort()).toEqual([...SIX].sort());
      expect(url.searchParams.get('lang')).toBe('en');
      expect(url.searchParams.get('sid')).toBe(sid);
    }
  });

  it('`wine=` of an alternative makes it the bottle (pickTableItem), the others follow in engine order; a wine outside the result changes nothing', async () => {
    const result = await forTable(SIX);
    const alt = result.items[1];
    const html = await g11({ dishes: SIX.join(','), wine: alt.wine.id });
    const picked = pickTableItem(result.items, alt.wine.id);
    const block = text(resultBlock(html));
    expect(block).toContain(`This bottle: ${alt.wine.listNumber !== undefined ? `No. ${alt.wine.listNumber} ` : ''}${alt.wine.producer} ${alt.wine.name}.`);
    expect([...html.matchAll(/data-alternative="([^"]+)"/g)].map((m) => m[1])).toEqual(picked.slice(1).map((i) => i.wine.id));
    // the same session: the same answer keeps its code, so the blocks compare whole
    const sid = '8f607182-93a4-4fb0-80c2-3d4e5f607182';
    const plain = text(resultBlock(await g11({ dishes: SIX.join(','), sid })));
    expect(text(resultBlock(await g11({ dishes: SIX.join(','), wine: '00000000-0000-4000-8000-000000000000', sid })))).toBe(plain);
  });

  it('each dish shows its raw engine score; the seal only on a sommelier’s pairing (tartare, risotto, duck — AC9)', async () => {
    const best = (await forTable(PICKS)).items[0];
    expect(best.perDish.some((x) => x.sommelierPick && x.score !== x.engineScore)).toBe(true);
    const block = resultBlock(await g11({ dishes: PICKS.join(',') }));
    const rows = [...block.matchAll(/<li class="grid[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    expect(rows).toHaveLength(best.perDish.length);
    best.perDish.forEach((x, i) => {
      expect(rows[i]).toContain(x.dish.name);
      expect(rows[i]).toContain(`>${x.engineScore}%</b>`);
      expect(rows[i].includes('Sommelier’s pairing')).toBe(x.sommelierPick);
    });
  });

  it('always a bottle: `serving=glass` in the address changes nothing', async () => {
    const sid = '9a718293-a4b5-4c01-91d3-4e5f60718293';
    const bottle = text(resultBlock(await g11({ dishes: FOUR.join(','), sid })));
    expect(bottle).toContain('This bottle:');
    expect(text(resultBlock(await g11({ dishes: FOUR.join(','), serving: 'glass', sid })))).toBe(bottle);
  });

  it('a budget no bottle meets is relaxed with a notice and still answers', async () => {
    const relaxed = await g11({ dishes: FOUR.join(','), styles: 'red', maxPrice: '200' });
    expect(relaxed).toContain('Nothing matches under 200 zł');
    expect(relaxed).toContain('This bottle:');
    // every colour has a bottle in the demo list and a budget is always relaxed, so "Nothing fits" has no demo case:
    // a style with bottles still answers
    expect(await g11({ dishes: FOUR.join(','), styles: 'sweet' })).toContain('This bottle:');
  });
});

describe('G11 and G9: switch, explanation, old addresses (R7, R10, R11, AC11)', () => {
  it('G9 links to G11 with the preferences and lang; G11 links back to G9', async () => {
    const g9 = (await render(StaffPage, { styles: 'red', lang: 'pl', dish: FOUR[2] }, 'pl')).replace(/&amp;/g, '&');
    const toTable = /<a [^>]*href="(\/r\/halka\/staff\/table\?[^"]+)"[^>]*>Cały stolik</.exec(g9)![1];
    expect(toTable).toContain('styles=red');
    expect(toTable).toContain('lang=pl');
    expect(g9).toMatch(/<a aria-current="page"[^>]*href="\/r\/halka\/staff\?[^"]*"[^>]*>Jedno danie</);
    const html = (await g11({ styles: 'red', lang: 'en' })).replace(/&amp;/g, '&');
    const toDish = /<a [^>]*href="(\/r\/halka\/staff\?[^"]+)"[^>]*>One dish</.exec(html)![1];
    expect(toDish).toContain('styles=red');
    expect(toDish).toContain('lang=en');
    expect(html).toMatch(/aria-current="page"[^>]*>Whole table</);
  });

  it('one explanation, closed, with the 70% from ENGINE_FACTS, no "first in the order" promise and no "AI"', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const t = lang === 'pl' ? pl : en;
      const html = await g11({ dishes: SIX.join(',') }, lang);
      expect(explainIds(html)).toEqual(['staffTable']);
      expect(placementProblems(html)).toEqual([]);
      expect(html).not.toMatch(/<details[^>]*data-explain="staffTable"[^>]*open/);
      expect(html).toContain(t.guest.explain.staffTable.summary);
      expect(html).toContain(`${ENGINE_FACTS.tableFitThreshold}%`);
      expect(text(html)).not.toMatch(/\bAI\b/);
      expect(text(html)).not.toMatch(/first in the order|pierwszeństw/i);
    }
  });

  it('the old addresses still render: G5, G6, G9 with their parameters', async () => {
    expect(await render(TablePage, { dish: FOUR[0] })).toContain('Find a bottle for the table');
    expect(await render(TableResultPage, { dishes: FOUR.join(',') })).toContain('Best wine for your table');
    expect(await render(StaffPage, { dish: FOUR[2] })).toContain('Say:');
  });
});

describe('G11: the recommendation code for the bottle (E09 Q19)', () => {
  const today = () => serviceDay(new Date());

  it('one code per answer, for the bottle shown first (source staff, context table); the same answer keeps it; an alternative gets one only once chosen', async () => {
    const sid = '5c3d4e5f-6071-4c8d-8e9f-0a1b2c3d4e5f';
    const result = await forTable(SIX);
    const html = await g11({ dishes: SIX.join(','), sid });
    const code = CODE.exec(html)?.[1];
    expect(code).toBeDefined();
    expect((html.match(/data-recommendation-code="/g) ?? []).length).toBe(1);
    expect(await codes.findByCode(restaurantId, today(), code!)).toMatchObject({ sessionId: sid, source: 'staff', context: 'table', wineId: result.items[0].wine.id, serving: 'bottle', tier: null });
    expect(CODE.exec(await g11({ dishes: SIX.join(','), sid }))?.[1]).toBe(code);
    expect(await codes.countBySession(restaurantId, today(), sid)).toBe(1);
    // "Choose this one": a new choice, a new code for that bottle
    const alt = result.items[1].wine.id;
    const chosen = CODE.exec(await g11({ dishes: SIX.join(','), wine: alt, sid }))?.[1];
    expect(chosen).toBeDefined();
    expect(chosen).not.toBe(code);
    expect(await codes.findByCode(restaurantId, today(), chosen!)).toMatchObject({ source: 'staff', wineId: alt });
    expect(await codes.countBySession(restaurantId, today(), sid)).toBe(2);
  });

  it('no code for our synthetic traffic, and none without an answer', async () => {
    const sid = '6d4e5f60-7182-4d9e-9fa0-1b2c3d4e5f60';
    expect(await g11({ dishes: SIX.join(','), sid }, 'en', { [SYNTHETIC_TRAFFIC_HEADER]: '1' })).toContain('data-recommendation-code="none"');
    expect(await g11({ sid })).not.toContain('data-recommendation-code');
    expect(await codes.countBySession(restaurantId, today(), sid)).toBe(0);
  });
});

describe('G11: staff_table_lookup (R13, AC12)', () => {
  const everything = { from: new Date(0), to: new Date('2100-01-01') };
  const list = async (sid: string) => { await settle(); return events.listBySession(restaurantId, sid); };

  it('two or more dishes record one staff_table_lookup under the waiter’s own session, without a guest session start', async () => {
    const sessionsBefore = await events.countGuestSessions(restaurantId, everything);
    const result = await forTable(SIX);
    const html = (await g11({ dishes: SIX.join(','), styles: 'white,orange', serving: 'glass' })).replace(/&amp;/g, '&');
    const sid = /name="sid" value="([^"]+)"/.exec(html)![1];
    const rows = await list(sid);
    expect(rows.map((e) => e.name)).toEqual(['staff_table_lookup']);
    expect(rows[0]).toMatchObject({ dishId: null, props: { source: 'staff', prefs: { styles: 'white,orange' }, budgetRelaxed: false } });
    expect((rows[0].props as { dishIds: string[] }).dishIds.sort()).toEqual([...SIX].sort());
    expect(rows[0].props).not.toHaveProperty('pickedWineId');
    const wineIds = (rows[0].props as { wineIds: string[] }).wineIds;
    expect(rows[0].wineId).toBe(wineIds[0] ?? null);
    expect(wineIds.length).toBe(1 + (html.match(/<li data-alternative=/g) ?? []).length);
    expect(typeof (rows[0].props as { splitSuggested: unknown }).splitSuggested).toBe('boolean');
    expect(await events.countGuestSessions(restaurantId, everything)).toBe(sessionsBefore);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('"Choose this one" is another lookup with pickedWineId; a relaxed budget is recorded; no dishes or one dish — nothing', async () => {
    const sid = '7e5f6071-8293-4eaf-8fb1-2c3d4e5f6071';
    const alt = (await forTable(SIX)).items[1].wine.id;
    await g11({ sid });
    await g11({ dish: SIX[0], sid });
    expect(await list(sid)).toEqual([]);
    await g11({ dishes: SIX.join(','), wine: alt, sid });
    await g11({ dishes: FOUR.join(','), maxPrice: '150', sid });
    const rows = await list(sid);
    expect(rows.map((e) => e.name)).toEqual(['staff_table_lookup', 'staff_table_lookup']);
    expect(rows[0]).toMatchObject({ wineId: alt, props: { pickedWineId: alt } });
    expect((rows[0].props as { wineIds: string[] }).wineIds[0]).toBe(alt);
    expect(rows[1]).toMatchObject({ props: { budgetRelaxed: true, prefs: { maxPrice: '150' } } });
  });
});
