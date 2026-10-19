import { KPI_DAYS, kpiWindow, MIN_RATE_SAMPLE, type MemoryStore, type Metric, type SalesItemType, type SalesSummary } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(admin)/admin/[slug]/(lists)/page';
import { SalesKpis } from '@/app/(admin)/admin/[slug]/(lists)/sales-kpis';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 2 (#21): the "Sales" section of A1 as the server sends it — the highlighted
 * Wine attach rate with N of M checks and its change in pp, four amounts in % (AC4, AC6), the empty state with or
 * without "Import sales" (AC5), a window imported in part (Q3) and a failed section (AC11) — and A1 with POS sales
 * from the memory store.
 */

const metric = (m: Partial<Metric>): Metric => ({ value: 0, previous: 0, change: null, unit: '%', noChange: null, ...m });
const SUMMARY: SalesSummary = {
  period: { current: { from: '2026-09-17', to: '2026-10-14' }, previous: { from: '2026-08-20', to: '2026-09-16' } },
  source: 'sales_import',
  latestDataDay: '2026-10-14',
  attachRate: metric({ value: 123 / 267, previous: 0.428, change: 3.17, unit: 'pp', sample: { numerator: 123, denominator: 267, previousDenominator: 250 } }),
  wineRevenuePerGuest: metric({ value: 48.5, previous: 44, change: 10.23 }),
  wineRevenuePerTable: metric({ value: 1234.5, previous: 1300, change: -5.04 }),
  averageBottle: metric({ value: 186.67, previous: 186.67, change: 0 }),
  averageGlass: metric({ value: null, previous: 30, noChange: 'no_comparison' })
};
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const section = (result: Parameters<typeof SalesKpis>[0]['result'], { canImport = true, locale = 'en' }: { canImport?: boolean; locale?: 'en' | 'pl' } = {}) =>
  html(createElement(SalesKpis, { result, slug: 'halka', canImport, locale }));
/** one tile: from its `data-sales-kpi` to the next tile */
const tile = (h: string, key: string) => text(`<${h.slice(h.indexOf(`data-sales-kpi="${key}"`)).split('data-sales-kpi=')[1] ?? ''}`);

describe('the Sales section (AC4–AC6, AC11)', () => {
  it('AC4: the highlighted attach rate with N of M checks with food and a pp change; four amounts with a % change; one closed explanation', () => {
    const h = section({ ok: true, value: SUMMARY });
    const t = text(h);
    expect(h).toContain('<h2 id="sales-title"');
    expect(t).toMatch(/Sales Last 28 days · 17 Sept? – 14 Oct 2026/);
    expect(tile(h, 'attach-rate')).toContain('Wine attach rate 46.1% 123 of 267 checks with food ▲ Up 3.2 pp vs previous 28 days');
    expect(h).toMatch(/class="[^"]*bg-primary[^"]*" data-sales-kpi="attach-rate"/);   // the lead tile
    expect(tile(h, 'per-guest')).toContain('Wine revenue per guest 48.5 zł Checks with food that have a guest count ▲ Up 10% vs previous 28 days');
    expect(tile(h, 'per-table')).toContain('Wine revenue per table 1,234.5 zł Per check with food ▼ Down 5% vs previous 28 days');
    expect(tile(h, 'bottle')).toContain('Average bottle 186.67 zł Net price per bottle sold No change');
    expect(tile(h, 'glass')).toContain('Average glass No data Net price per glass sold No comparison');
    expect(h.match(/data-kpi-delta/g)).toHaveLength(5);
    expect(h.match(/bg-primary/g)).toHaveLength(1);
    expect(h).toMatch(/grid gap-4 sm:grid-cols-2 xl:grid-cols-3/);
    expect(h).not.toContain('data-sales-through');
    expect(explainIds(h)).toEqual(['sales-kpis']);
    expect(placementProblems(h)).toEqual([]);
    expect(h).not.toMatch(/<details data-explain[^>]*\sopen/);
    expect(h).not.toMatch(/text-(green|red|emerald|destructive)/);
    // R4: no tile is about guest sessions (only the explanation says they are never divided by checks)
    expect(text(h.slice(h.indexOf('</details>')))).not.toMatch(/session/i);
  });

  it(`AC6: below ${MIN_RATE_SAMPLE} checks with food the rate keeps N of M and says "Too few to compare"; a rate without checks with food reads "No data"`, () => {
    const small = section({ ok: true, value: { ...SUMMARY, attachRate: metric({ value: 10 / 29, previous: 0.2, unit: 'pp', noChange: 'small_sample', sample: { numerator: 10, denominator: 29, previousDenominator: 40 } }) } });
    expect(tile(small, 'attach-rate')).toContain('Wine attach rate 34.5% 10 of 29 checks with food Too few to compare');
    const none = section({ ok: true, value: { ...SUMMARY, attachRate: metric({ value: null, previous: null, unit: 'pp', noChange: 'no_comparison', sample: { numerator: 0, denominator: 0, previousDenominator: 0 } }) } });
    expect(tile(none, 'attach-rate')).toContain('Wine attach rate No data 0 of 0 checks with food No comparison');
    const flat = section({ ok: true, value: { ...SUMMARY, attachRate: { ...SUMMARY.attachRate, change: 0.04 } } });
    expect(tile(flat, 'attach-rate')).toContain('No change');
  });

  it('Q3: a window imported in part renders and says up to which day the data goes', () => {
    const h = section({ ok: true, value: { ...SUMMARY, latestDataDay: '2026-10-09' } });
    expect(text(h)).toContain('Sales data through 9 Oct 2026');
    expect(h).toContain('data-sales-through');
    expect(tile(h, 'attach-rate')).toContain('46.1%');
  });

  it('AC5: no sales in the window → the empty state with "Import sales" for import.manage and the latest day with data', () => {
    const empty: SalesSummary = { ...SUMMARY, source: null, latestDataDay: '2026-09-02' };
    const h = section({ ok: true, value: empty });
    const t = text(h);
    expect(t).toContain('Upload a POS export to see attach rate');
    expect(t).toContain(`Wine attach rate and wine revenue come from your POS sales of the last ${KPI_DAYS} days.`);
    expect(h).toContain('href="/admin/halka/import/sales"');
    expect(t).toContain('Import sales');
    expect(t).toMatch(/Latest sales data: 2 Sept? 2026\./);
    expect(h).not.toContain('data-sales-kpi=');
    expect(h).not.toContain('data-kpi-delta');
    expect(explainIds(h)).toEqual([]);
  });

  it('AC5: canImport=false → no import link, a sentence instead; nothing imported → no latest day', () => {
    const h = section({ ok: true, value: { ...SUMMARY, source: null, latestDataDay: null } }, { canImport: false });
    expect(h).not.toContain('/import/sales');
    expect(text(h)).toContain('Someone with import access can upload it.');
    expect(h).not.toContain('data-sales-latest');
  });

  it('AC11: a failed section says "Analytics are temporarily unavailable." in an h2, never an h1', () => {
    const h = section({ ok: false });
    expect(h).toContain('role="alert"');
    expect(h).toMatch(/<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).not.toContain('<h1');
    expect(h).not.toContain('/import/sales');
  });

  it('PL: the same tiles in Polish', () => {
    const t = text(section({ ok: true, value: SUMMARY }, { locale: 'pl' }));
    expect(t).toContain('Sprzedaż');
    expect(t).toContain('Wine Attach Rate 46,1% 123 z 267 rachunków z jedzeniem');
    expect(t).toContain('Wzrost 3,2 p.p. wobec poprzednich 28 dni');
    expect(t).toContain('Przychód z wina na stolik 1 234,5 zł');
    expect(t).toContain('Jak liczymy sprzedaż?');
    const empty = text(section({ ok: true, value: { ...SUMMARY, source: null } }, { locale: 'pl' }));
    expect(empty).toContain('Importuj sprzedaż');
  });
});

describe('the "Sales" explanation texts (E07 R4)', () => {
  const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(Number);
  for (const [lang, dict] of [['en', en], ['pl', pl]] as const) {
    it(`${lang}: a question, at most 130 words, and only the window and the sample size as numbers`, () => {
      const { summary, points } = dict.admin.explain.salesKpis;
      expect(summary.endsWith('?')).toBe(true);
      const marked = points({ days: 1001, minSample: 1002 }).join(' ');
      expect(numbersIn(marked).every((n) => n === 1001 || n === 1002)).toBe(true);
      expect(numbersIn(marked)).toEqual(expect.arrayContaining([1001, 1002]));
      const today = points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE });
      expect(today.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(130);
      expect(today.join(' ')).not.toMatch(/\bAI\b/);
    });
  }
  it('PL has the same keys as EN', () => {
    expect(Object.keys(pl.admin.dashboard.sales).sort()).toEqual(Object.keys(en.admin.dashboard.sales).sort());
  });
});

/* ---------- the page: A1 on the in-memory data source, signed in ---------- */

const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
async function render(lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(DashboardPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve({}) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
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

describe('A1 with the Sales section', () => {
  beforeAll(async () => {
    state().cookies.set(SESSION_COOKIE, (await loginAs('marta@halka.pl')).token);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC5: without sales — the empty state with "Import sales" first, above Guest usage', async () => {
    const h = await render();
    const sales = h.indexOf('id="sales-title"');
    expect(sales).toBeGreaterThan(0);
    expect(h.indexOf('id="usage-title"')).toBeGreaterThan(sales);
    expect(text(h)).toContain('Upload a POS export to see attach rate');
    expect(h).toContain('href="/admin/halka/import/sales"');
    expect(explainIds(h)).toEqual(['dashboard', 'performance']);
  });

  it('R9: a failing sales read shows the section error, and the rest of A1 renders', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const scope = await createRequestScope();
    const spy = vi.spyOn(scope.cradle.salesRepository, 'checkTotals').mockRejectedValue(new Error('read failed'));
    const h = await render();
    spy.mockRestore();
    await scope.dispose();
    expect(h).toMatch(/<section aria-labelledby="sales-title"[\s\S]*?<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).toContain('id="usage-title"');
    expect(h).toContain('aria-label="Wine program"');
    expect(error).toHaveBeenCalledWith('analytics section failed', expect.objectContaining({ slug: 'halka', section: 'sales' }));
  });

  it('AC4: POS sales in both windows show the tiles with N of M checks and the change; today is left out', async () => {
    const w = kpiWindow(new Date());
    for (let i = 1; i <= 30; i++) {
      await addLine(w.current.from, `C${i}`, 'food', 1, 100, 2);
      if (i <= 12) await addLine(w.current.from, `C${i}`, 'wine_bottle', 1, 150);
      await addLine(w.previous.to, `P${i}`, 'food', 1, 100, 2);
      if (i <= 9) await addLine(w.previous.to, `P${i}`, 'wine_bottle', 1, 150);
    }
    const h = await render();
    expect(tile(h, 'attach-rate')).toContain('Wine attach rate 40.0% 12 of 30 checks with food ▲ Up 10.0 pp vs previous 28 days');
    expect(tile(h, 'per-table')).toContain('Wine revenue per table 60 zł');
    expect(tile(h, 'per-table')).toContain('Up 33% vs previous 28 days');
    expect(tile(h, 'bottle')).toContain('Average bottle 150 zł Net price per bottle sold No change');
    expect(explainIds(h)).toEqual(['sales-kpis', 'dashboard', 'performance']);
    expect(placementProblems(h)).toEqual([]);
    expect(text(await render('pl'))).toContain('12 z 30 rachunków z jedzeniem');
  });
});
