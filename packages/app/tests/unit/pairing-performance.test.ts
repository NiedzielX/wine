import { KPI_DAYS, MIN_RATE_SAMPLE, PAIRING_ROWS_LIMIT, seedUsageEvents, type GuestInteractionInput, type PairingPerformance, type PairingPerformanceRow } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(admin)/admin/[slug]/(lists)/page';
import { PairingPerformanceSection } from '@/app/(admin)/admin/[slug]/(lists)/pairing-performance';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 3 (#22): the "Pairing performance" section of A1 as the server sends it — rows
 * with shown, chosen, conversion and the source at the time of viewing (AC7), "No views" (AC8), the failed section
 * (AC11), "Show all" / `?pairs=all` (Q11) — and A1 on the in-memory data source.
 */

const row = (r: Partial<PairingPerformanceRow> & { dish: PairingPerformanceRow['dish'] }): PairingPerformanceRow => ({
  wine: { id: 'w1', name: 'Savigny-lès-Beaune', producer: 'Domaine Chandon de Briailles', vintage: '2020' },
  source: 'sommelier', matchScore: 86, shown: 0, chosen: 0, conversion: null, ...r
});
const PERF: PairingPerformance = {
  period: { current: { from: '2026-09-17', to: '2026-10-14' }, previous: { from: '2026-08-20', to: '2026-09-16' } },
  rows: [
    row({ dish: { id: 'd1', name: 'Duck breast' }, shown: 1054, chosen: 19, conversion: 19 / 1054 }),
    row({ dish: { id: 'd2', name: 'Venison loin' }, wine: { id: 'w2', name: 'Barbaresco', producer: 'Produttori del Barbaresco', vintage: '2019' }, source: 'engine', matchScore: 74, shown: 12, chosen: 3, conversion: 0.25 }),
    row({ dish: { id: 'd3', name: 'Seared scallops' }, wine: { id: 'w3', name: 'Cuis 1er Cru', producer: 'Pierre Gimonnet & Fils', vintage: 'NV' } })
  ],
  total: 3,
  omitted: 0
};
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const section = (result: Parameters<typeof PairingPerformanceSection>[0]['result'], opts: { showAll?: boolean; locale?: 'en' | 'pl' } = {}) =>
  html(createElement(PairingPerformanceSection, { result, slug: 'halka', showAll: opts.showAll ?? false, locale: opts.locale ?? 'en' }));

describe('the Pairing performance section (AC7, AC8, AC11, Q11)', () => {
  it('AC7: each row has the dish linked to A6, the wine, the source, the Match Score, shown, chosen and the conversion', () => {
    const h = section({ ok: true, value: PERF });
    const t = text(h);
    expect(h).toContain('<h2 id="pairings-title"');
    expect(t).toMatch(/Pairing performance Last 28 days · 17 Sept? – 14 Oct 2026/);
    expect(t).toContain('Dish Wine Source Match Shown Chosen Conversion');
    expect(h).toContain('href="/admin/halka/pairings/d1"');
    expect(t).toContain('Duck breast Savigny-lès-Beaune 2020 Domaine Chandon de Briailles Sommelier 86% Engine match score 1,054 19 1.8%');
    expect(t).toContain('Venison loin Barbaresco 2019 Produttori del Barbaresco Engine 74% Engine match score 12 3 25.0%');
    expect(h.match(/data-pairing-row="sommelier"/g)).toHaveLength(2);
    expect(h.match(/data-pairing-row="engine"/g)).toHaveLength(1);
    expect(explainIds(h)).toEqual(['performance']);
    expect(placementProblems(h)).toEqual([]);
    expect(h).not.toMatch(/<details data-explain[^>]*\sopen/);
    expect(h).toContain('<span>What does this table count?</span>');
    // the table scrolls in its own container, the cells with names wrap
    expect(h).toContain('overflow-x-auto');
    expect(h).toMatch(/min-w-40 whitespace-normal/);
  });

  it('AC8: a pairing without views reads "No views", not 0%; a non-vintage wine reads so', () => {
    const t = text(section({ ok: true, value: PERF }));
    expect(t).toContain('Seared scallops Cuis 1er Cru Non-vintage Pierre Gimonnet &amp; Fils Sommelier 86% Engine match score 0 0 No views');
    expect(t).not.toMatch(/Seared scallops.*0\.0%/);
  });

  it('Q11: "Show all N pairings" links to ?pairs=all when rows were cut; with all of them, "Show top 10" goes back', () => {
    const cut = section({ ok: true, value: { ...PERF, total: 63 } });
    expect(text(cut)).toContain('Show all 63 pairings');
    expect(cut).toContain('href="/admin/halka?pairs=all"');
    expect(cut).not.toContain('Show top');
    const all = section({ ok: true, value: { ...PERF, total: 63 } }, { showAll: true });
    expect(text(all)).toContain(`Show top ${PAIRING_ROWS_LIMIT}`);
    expect(all).toContain('href="/admin/halka"');
    expect(all).not.toContain('pairs=all');
    const whole = section({ ok: true, value: PERF });
    expect(whole).not.toContain('Show all');
    expect(whole).not.toContain('Show top');
  });

  it('rows of removed dishes or wines are counted under the table', () => {
    expect(text(section({ ok: true, value: { ...PERF, omitted: 2 } }))).toContain('2 pairings hidden: the dish or wine was removed.');
    expect(text(section({ ok: true, value: { ...PERF, omitted: 1 } }))).toContain('1 pairing hidden: the dish or wine was removed.');
    expect(text(section({ ok: true, value: { ...PERF, omitted: 5 } }, { locale: 'pl' }))).toContain('5 par ukrytych: danie lub wino zostało usunięte.');
  });

  it('no rows → "No pairings to measure yet" with a link to the review queue (A7)', () => {
    const h = section({ ok: true, value: { ...PERF, rows: [], total: 0 } });
    expect(text(h)).toContain('No pairings to measure yet');
    expect(h).toContain('href="/admin/halka/review"');
    expect(h).not.toContain('<table');
    expect(explainIds(h)).toEqual([]);
  });

  it('AC11: a failed section says "Analytics are temporarily unavailable." in an h2, never an h1', () => {
    const h = section({ ok: false });
    expect(h).toMatch(/<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).toContain('<h2 id="pairings-title"');
    expect(h).not.toContain('<h1');
    expect(h).not.toContain('<table');
  });

  it('PL: the same table in Polish', () => {
    const t = text(section({ ok: true, value: PERF }, { locale: 'pl' }));
    expect(t).toContain('Skuteczność par');
    expect(t).toContain('Danie Wino Źródło Dopasowanie Pokazane Wybrane Konwersja');
    expect(t).toContain('Silnik');
    expect(t).toContain('1054 19 1,8%');   // pl-PL leaves four-digit numbers without a separator
    expect(t).toContain('Bez wyświetleń');
    expect(t).toContain('Co liczy ta tabela?');
  });
});

describe('the "Pairing performance" explanation texts (E07 R4)', () => {
  const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(Number);
  for (const [lang, dict] of [['en', en], ['pl', pl]] as const) {
    it(`${lang}: a question, at most 130 words, the window as the only number, no "AI"`, () => {
      const { summary, points } = dict.admin.explain.performance;
      expect(summary.endsWith('?')).toBe(true);
      expect(numbersIn(points({ days: 1001, minSample: 1002 }).join(' '))).toEqual([1001]);
      const today = points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE }).join(' ');
      expect(today.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(130);
      expect(today).not.toMatch(/\bAI\b/);
    });
  }
});

/* ---------- the page: A1 on the in-memory data source, signed in ---------- */

const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
async function render(searchParams: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(DashboardPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(searchParams) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const rowsIn = (h: string) => (h.match(/data-pairing-row=/g) ?? []).length;

describe('A1 with the Pairing performance section', () => {
  beforeAll(async () => {
    state().cookies.set(SESSION_COOKIE, (await loginAs('marta@halka.pl')).token);
  });
  afterEach(() => vi.restoreAllMocks());

  it('below "Needs your attention": the top 10, the approved pairings without views; ?pairs=all shows every row', async () => {
    const h = await render();
    const attention = h.indexOf('Needs your attention');
    expect(attention).toBeGreaterThan(0);
    expect(h.indexOf('id="pairings-title"')).toBeGreaterThan(attention);
    expect(rowsIn(h)).toBe(PAIRING_ROWS_LIMIT);
    expect(text(h)).toMatch(/Show all \d+ pairings/);
    expect(text(h)).toContain('No views');
    const total = Number(text(h).match(/Show all (\d+) pairings/)![1]);
    expect(total).toBeGreaterThan(PAIRING_ROWS_LIMIT);
    const all = await render({ pairs: 'all' });
    expect(rowsIn(all)).toBe(total);
    expect(text(all)).toContain(`Show top ${PAIRING_ROWS_LIMIT}`);
    // any other value is the top 10
    expect(rowsIn(await render({ pairs: 'everything' }))).toBe(PAIRING_ROWS_LIMIT);
  });

  it('AC7: guest views and choices in the window lead the table, with the source at the time of viewing', async () => {
    const scope = await createRequestScope();
    const { guestInteractionRepository, restaurantRepository, catalogService, recommendationService } = scope.cradle;
    const restaurant = (await restaurantRepository.findBySlug('halka'))!;
    const duck = (await catalogService.publishedMenu('halka'))!.dishes.find((d) => d.name === 'Duck breast')!.id;
    const wine = (await recommendationService.forDish('halka', duck))!.result.items[0].wine;
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    const ev = (sessionId: string, name: GuestInteractionInput['name'], createdAt: Date, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test-f3', createdAt, ...extra });
    const events = Array.from({ length: 4 }, (_, i) => {
      const s = `c3000000-0000-4000-8000-00000000000${i}`;
      return [
        ev(s, 'guest_session_started', daysAgo(3), { props: { source: 'qr', menuVersion: null } }),
        ev(s, 'recommendations_viewed', daysAgo(3), { dishId: duck, props: { wineIds: [wine.id], items: [{ wineId: wine.id, tier: 'sommelier_primary' }], menuVersion: null } }),
        ...(i === 0 ? [ev(s, 'wine_selected', daysAgo(3), { dishId: duck, wineId: wine.id, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
      ];
    }).flat();
    await seedUsageEvents(guestInteractionRepository, restaurant.id, events);
    await scope.dispose();
    const t = text(await render());
    expect(t).toMatch(new RegExp(`Conversion Duck breast ${wine.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .*? Sommelier \\d+% Engine match score 4 1 25\\.0%`));
  });

  it('R9: a failing pairing read shows the section error, and the rest of A1 renders', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const scope = await createRequestScope();
    const spy = vi.spyOn(scope.cradle.guestInteractionRepository, 'pairingStats').mockRejectedValue(new Error('read failed'));
    const h = await render();
    spy.mockRestore();
    await scope.dispose();
    expect(h).toMatch(/<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).toContain('id="pairings-title"');
    expect(h).toContain('aria-label="Wine program"');
    expect(h).toContain('Needs your attention');
    expect(error).toHaveBeenCalledWith('analytics section failed', expect.objectContaining({ slug: 'halka', section: 'pairings' }));
  });
});
