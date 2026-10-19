import { kpiWindow, type MemoryStore, type SalesItemType, type SalesKpis } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import { SalesAttachRate, type AttachRateResult } from '@/app/(admin)/admin/_components/sales-attach-rate';
import SalesPage from '@/app/(admin)/admin/[slug]/import/sales/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';
import { explainIds } from './html';

/**
 * Spec 2026-10-15-pos-sales-import-attach-rate, phase 2 (#18), the app side: the Wine Attach Rate card of A13 as the
 * server sends it (no JavaScript) — the default period, a chosen period, "40.0%" (AC7), "No data" (AC8), a refused
 * period — with `SalesKpiService` from the container and the memory store.
 */

const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
async function render(search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(SalesPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** the card alone: from its id to the end of the page */
const card = (h: string) => h.slice(h.indexOf('id="wine-attach-rate"'));

async function store(): Promise<MemoryStore> {
  const scope = await createRequestScope();
  try { return (scope.cradle.authRepository as unknown as { store: MemoryStore }).store; } finally { await scope.dispose(); }
}
let n = 0;
async function addLine(businessDate: string, checkId: string, itemType: SalesItemType, quantity: number, netAmount: number, covers: number | null = null) {
  const s = await store();
  const restaurantId = s.restaurants.find((r) => r.slug === 'halka')!.id;
  s.salesLines.push({ id: `5a1e5000-0000-4000-8000-${String(++n).padStart(12, '0')}`, businessDate, checkId, covers, itemType, quantity, netAmount, restaurantId, importJobId: 'job', replacedAt: null, replacedByJobId: null });
}

describe('A13 Wine Attach Rate card, server-rendered', () => {
  beforeAll(async () => {
    const s = await loginAs('tomasz@halka.pl');
    state().cookies.set(SESSION_COOKIE, s.token);
  });

  it('without sales: the card, "No sales imported yet", the dashboard window as the period and "No data" (AC8)', async () => {
    const html = await render();
    const c = card(html);
    expect(c).toContain('data-wine-attach-rate');
    expect(text(c)).toContain('No sales imported yet.');
    const { from, to } = kpiWindow(new Date()).current;
    expect(c).toContain(`name="from" value="${from}"`);
    expect(c).toContain(`name="to" value="${to}"`);
    expect(c).toMatch(/<form[^>]*action="\/admin\/halka\/import\/sales#wine-attach-rate" method="get"/);
    expect(c).toContain('data-attach-empty');
    expect(text(c)).toContain('No sales data for this period.');
    expect(c).not.toContain('data-attach-rate=');
    // still one explanation on the screen (E07: one "i" per card; the screen's explains the rate)
    expect(explainIds(html)).toEqual(['sales']);
  });

  it('with sales: by default the 28 days ending on the last day with data; 4 of 10 checks with food → 40.0% (AC7)', async () => {
    for (let i = 1; i <= 10; i++) {
      await addLine('2031-03-20', `F${i}`, 'food', 2, 100, 2);
      if (i <= 4) await addLine('2031-03-20', `F${i}`, 'wine_bottle', 1, 150);
    }
    await addLine('2031-03-21', 'BAR1', 'wine_glass', 2, 60);   // a bar check: wine revenue, never the rate
    await addLine('2031-03-21', 'BAR2', 'wine_glass', 1, 30);
    await addLine('2031-03-02', 'R1', 'food', 1, 40, 1);        // a check whose bottle was returned (AC10)
    await addLine('2031-03-02', 'R1', 'wine_bottle', 1, 150);
    await addLine('2031-03-02', 'R1', 'wine_bottle', -1, -150);
    const html = await render();
    const c = card(html);
    expect(c).toContain('name="from" value="2031-02-22"');
    expect(c).toContain('name="to" value="2031-03-21"');
    expect(text(c)).toContain('Imported sales: 2 Mar 2031 – 21 Mar 2031.');
    expect(c).toMatch(/data-attach-rate="true">36\.4%</);        // 4 of 11: the returned bottle does not count
    expect(text(c)).toContain('4 of 11 checks with food had wine');

    const one = card(await render({ from: '2031-03-20', to: '2031-03-21' }));
    expect(one).toMatch(/data-attach-rate="true">40\.0%</);
    expect(text(one)).toContain('20 Mar 2031 – 21 Mar 2031');
    expect(text(one)).toContain('4 of 10 checks with food had wine');
    expect(text(one)).toContain('Wine revenue per guest 30 zł 20 guests at checks with food');
    expect(text(one)).toContain('Wine revenue per table 60 zł 10 checks with food');
    expect(text(one)).toContain('Average bottle 150 zł');
    expect(text(one)).toContain('Average glass 30 zł');

    const plHtml = card(await render({ from: '2031-03-20', to: '2031-03-21' }, 'pl'));
    expect(plHtml).toMatch(/data-attach-rate="true">40,0%</);
    expect(text(plHtml)).toContain('4 z 10 rachunków z jedzeniem miało wino');
  });

  it('a period with bar checks only: "No data" for the rate, the wine KPIs still shown (AC8)', async () => {
    const c = card(await render({ from: '2031-03-21', to: '2031-03-21' }));
    expect(c).toContain('data-attach-empty');
    expect(text(c)).toContain('No checks with food in this period (2 checks with drinks only), so there is no rate.');
    expect(text(c)).toContain('Average glass 30 zł');
    expect(c).toContain('aria-label="No data"');
  });

  it('a refused period (end before start, over 366 days, not a date) is an error in the card, the dates kept', async () => {
    for (const q of [{ from: '2031-03-21', to: '2031-03-20' }, { from: '2030-01-01', to: '2031-03-21' }, { from: 'x', to: '' }]) {
      const c = card(await render(q));
      expect(c).toContain('role="alert"');
      expect(text(c)).toContain('This period cannot be shown');
      expect(c).not.toContain('data-attach-rate=');
    }
    expect(card(await render({ from: '2031-03-21', to: '2031-03-20' }))).toContain('name="from" value="2031-03-21"');
  });

  it('is not shown while a file is checked (the preview has its own rate)', async () => {
    const html = await render({}, 'pl');
    expect(text(card(html))).toContain('Zaimportowana sprzedaż');
    // job pages render PreviewStep / DoneStep; the card is under the upload step only (an unknown job is a 404)
    await expect(render({ job: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow();
  });
});

describe('SalesAttachRate component', () => {
  const kpis = (k: Partial<SalesKpis>): SalesKpis => ({
    period: { from: '2026-10-01', to: '2026-10-28' }, source: 'sales_import', checks: 12, foodChecks: 10, foodChecksWithWine: 4, attachRate: 0.4, covers: null,
    wineRevenue: 590, wineRevenuePerGuest: null, wineRevenuePerTable: 48, averageBottle: 186.67, averageGlass: 30, ...k
  });
  const html = (result: AttachRateResult, locale: 'en' | 'pl' = 'en') =>
    renderToStaticMarkup(createElement(SalesAttachRate, { action: '/admin/halka/import/sales', period: { from: '2026-10-01', to: '2026-10-28' }, range: null, result, locale, t: locale === 'pl' ? pl : en })).replace(/<!-- -->/g, '');

  it('writes the rate with one decimal and money in the panel language; no guest counts → "—"', () => {
    const h = html({ ok: true, kpis: kpis({}) });
    expect(h).toMatch(/data-attach-rate="true">40\.0%</);
    expect(text(h)).toContain('Average bottle 186.67 zł');
    expect(text(h)).toContain('Wine revenue per guest — No guest counts in the export');
    expect(text(html({ ok: true, kpis: kpis({}) }, 'pl'))).toContain('Średnia butelka 186,67 zł');
  });

  it('every text of the card exists in both languages', () => {
    expect(Object.keys(pl.admin.import.sales.attach).sort()).toEqual(Object.keys(en.admin.import.sales.attach).sort());
  });
});
