import { KPI_DAYS, MIN_RATE_SAMPLE, seedUsageEvents, type GuestInteractionInput, type Metric, type UsageSummary } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatDelta, formatPeriod, formatRate } from '@/app/(admin)/admin/_components/kpi-format';
import DashboardPage from '@/app/(admin)/admin/[slug]/(lists)/page';
import { UsageKpis } from '@/app/(admin)/admin/[slug]/(lists)/usage-kpis';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { settleSection } from '@/server/analytics-section';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-15-kpi-dashboard, phase 1 (#20): the "Guest usage" section of A1 as the server sends it — values with
 * N of M and the change (AC1, AC6), the empty state (AC2), a failed section (AC11) — and the formatting rules (R5).
 */

const metric = (m: Partial<Metric>): Metric => ({ value: 0, previous: 0, change: null, unit: '%', noChange: null, ...m });
const SUMMARY: UsageSummary = {
  period: { current: { from: '2026-09-17', to: '2026-10-14' }, previous: { from: '2026-08-20', to: '2026-09-16' } },
  hasData: true,
  sessions: metric({ value: 1412, previous: 1197, change: 17.96 }),
  recommendationViews: metric({ value: 1030, previous: 1030, change: 0 }),
  recommendationToSelection: metric({ value: 129 / 413, previous: 0.271, change: 4.135, unit: 'pp', sample: { numerator: 129, denominator: 413, previousDenominator: 369 } }),
  staffLookups: metric({ value: 12, previous: 0, noChange: 'no_comparison' })
};
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node).replace(/<!-- -->/g, '');
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const section = (result: Parameters<typeof UsageKpis>[0]['result'], locale: 'en' | 'pl' = 'en') =>
  html(createElement(UsageKpis, { result, slug: 'halka', locale }));

describe('formatting a KPI (R5, R6, AC6)', () => {
  it('a % change rounds to a whole number, a pp change to one decimal, with an arrow that is read out as a word', () => {
    expect(formatDelta(metric({ change: 17.96 }), 'en')).toEqual({ text: `18% vs previous ${KPI_DAYS} days`, arrow: { symbol: '▲', label: 'Up' } });
    expect(formatDelta(metric({ change: -2.06, unit: 'pp' }), 'en')).toEqual({ text: '2.1 pp vs previous 28 days', arrow: { symbol: '▼', label: 'Down' } });
    expect(formatDelta(metric({ change: -2.06, unit: 'pp' }), 'pl')).toEqual({ text: '2,1 p.p. wobec poprzednich 28 dni', arrow: { symbol: '▼', label: 'Spadek' } });
    expect(formatDelta(metric({ change: 1250 }), 'en').text).toBe('1,250% vs previous 28 days');
  });

  it('a change that rounds to 0 is "No change"; a missing one says why', () => {
    expect(formatDelta(metric({ change: 0.4 }), 'en')).toEqual({ text: 'No change' });
    expect(formatDelta(metric({ change: -0.04, unit: 'pp' }), 'en')).toEqual({ text: 'No change' });
    expect(formatDelta(metric({ noChange: 'no_comparison' }), 'en')).toEqual({ text: 'No comparison' });
    expect(formatDelta(metric({ noChange: 'small_sample', unit: 'pp' }), 'en')).toEqual({ text: 'Too few to compare' });
    expect(formatDelta(metric({ noChange: 'small_sample', unit: 'pp' }), 'pl')).toEqual({ text: 'Za mało danych do porównania' });
  });

  it('rates with one decimal in the panel language, the window as dates', () => {
    expect(formatRate(0.3123, 'en')).toBe('31.2%');
    expect(formatRate(0.46, 'en')).toBe('46.0%');
    expect(formatRate(0.3123, 'pl')).toBe('31,2%');
    expect(formatRate(null, 'en')).toBeNull();
    expect(formatPeriod(SUMMARY.period.current, 'en')).toMatch(/^Last 28 days · 17 Sept? – 14 Oct 2026$/);   // ICU writes "Sep" or "Sept"
    expect(formatPeriod({ from: '2026-12-10', to: '2027-01-06' }, 'en')).toMatch(/^Last 28 days · 10 Dec 2026 – 6 Jan 2027$/);
    expect(formatPeriod(SUMMARY.period.current, 'pl')).toMatch(/^Ostatnie 28 dni · 17 \S+ – 14 \S+ 2026$/);
  });
});

describe('the Guest usage section (AC1, AC2, AC11)', () => {
  it('AC1: four tiles with values, N of M sessions and the change; the waiter apart; one closed explanation', () => {
    const h = section({ ok: true, value: SUMMARY });
    const t = text(h);
    expect(h).toContain('<h2 id="usage-title"');
    expect(t).toContain('Guest usage');
    expect(t).toContain('Guest sessions 1,412');
    expect(t).toContain('▲ Up 18% vs previous 28 days');
    expect(t).toContain('Dish recommendations viewed 1,030');
    expect(t).toContain('Recommendation → selection 31.2% 129 of 413 sessions · dish recommendations only ▲ Up 4.1 pp vs previous 28 days');
    expect(t).toContain('Waiter lookups 12 Staff screen, a dish or a whole table · not in the guest figures No comparison');
    expect(h).toContain('<span aria-hidden="true">▲</span><span class="sr-only">Up</span>');
    expect(h.match(/data-kpi-delta/g)).toHaveLength(4);
    expect(h).toMatch(/grid gap-4 sm:grid-cols-2 xl:grid-cols-4/);
    expect(explainIds(h)).toEqual(['usage']);
    expect(placementProblems(h)).toEqual([]);
    expect(h).not.toMatch(/<details data-explain[^>]*\sopen/);
    expect(h).toContain('<span>What do these figures count?</span>');
    // no colours of meaning on the change
    expect(h).not.toMatch(/text-(green|red|emerald|destructive)/);
  });

  it('a rate without a denominator reads "No data", still with its N of M', () => {
    const t = text(section({ ok: true, value: { ...SUMMARY, recommendationToSelection: metric({ value: null, previous: 0.5, unit: 'pp', noChange: 'no_comparison', sample: { numerator: 0, denominator: 0, previousDenominator: 4 } }) } }));
    expect(t).toContain('Recommendation → selection No data 0 of 0 sessions');
  });

  it('PL: the same tiles in Polish', () => {
    const t = text(section({ ok: true, value: SUMMARY }, 'pl'));
    expect(t).toContain('Korzystanie gości');
    expect(t).toContain('Sesje gości 1412');   // pl-PL leaves four-digit numbers without a separator
    expect(t).toContain('Rekomendacja → wybór 31,2% 129 z 413 sesji');
    expect(t).toContain('Wzrost 18% wobec poprzednich 28 dni');
    expect(t).toContain('Co liczą te liczby?');
  });

  it('AC2: no guest session in either window → the empty state with the QR code and the guest app, not zeros', () => {
    const h = section({ ok: true, value: { ...SUMMARY, hasData: false } });
    expect(text(h)).toContain('No guests have used Wine Match yet');
    expect(text(h)).toContain('Usage figures appear once guests scan the QR code.');
    expect(h).toContain('href="/admin/halka/qr"');
    expect(h).toContain('href="/r/halka"');
    expect(h).not.toContain('data-kpi-delta');
    expect(explainIds(h)).toEqual([]);
  });

  it('AC11: a failed section says "Analytics are temporarily unavailable." in an h2, never an h1', () => {
    const h = section({ ok: false });
    expect(h).toContain('role="alert"');
    expect(h).toMatch(/<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).toContain('Pairings and guest app work normally.');
    expect(h).not.toContain('<h1');
    expect(section({ ok: false }, 'pl')).toContain('Analityka jest chwilowo niedostępna.');
  });
});

describe('settleSection (R9, AC11)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes a value through and turns a failure into { ok: false } with an error in the log', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    expect(await settleSection('halka', 'usage', Promise.resolve(7))).toEqual({ ok: true, value: 7 });
    expect(error).not.toHaveBeenCalled();
    expect(await settleSection('halka', 'usage', Promise.reject(new Error('connection refused')))).toEqual({ ok: false });
    expect(error).toHaveBeenCalledWith('analytics section failed', { slug: 'halka', section: 'usage', error: 'connection refused' });
  });
});

describe('the "Guest usage" explanation texts (E07 R4, AC6 rules for the panel)', () => {
  const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(Number);
  for (const [lang, dict] of [['en', en], ['pl', pl]] as const) {
    it(`${lang}: a question, at most 130 words, and only the window and the sample size as numbers`, () => {
      const { summary, points } = dict.admin.explain.usage;
      expect(summary.endsWith('?')).toBe(true);
      const marked = points({ days: 1001, minSample: 1002 }).join(' ');
      expect(numbersIn(marked).every((n) => n === 1001 || n === 1002)).toBe(true);
      expect(numbersIn(marked)).toEqual(expect.arrayContaining([1001, 1002]));
      const today = points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE });
      expect(today.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length).toBeLessThanOrEqual(130);
      expect(today.join(' ')).not.toMatch(/\bAI\b/);
    });
  }
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

describe('A1 with the Guest usage section', () => {
  beforeAll(async () => {
    state().cookies.set(SESSION_COOKIE, (await loginAs('marta@halka.pl')).token);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC2 + Q14: without events — the empty state above the program tiles; the old "Guest activity" card is gone', async () => {
    const h = await render();
    const usage = h.indexOf('id="usage-title"');
    expect(usage).toBeGreaterThan(0);
    expect(h.indexOf('aria-label="Wine program"')).toBeGreaterThan(usage);
    expect(text(h)).toContain('No guests have used Wine Match yet');
    expect(h).not.toContain('Guest activity');
    expect(h).not.toContain('Nothing has been recorded yet');
    expect(explainIds(h)).toEqual(['dashboard']);
  });

  it('AC1 + AC3: guest sessions in the window show the tiles; the waiter is apart; today is left out', async () => {
    const scope = await createRequestScope();
    const { guestInteractionRepository, restaurantRepository, catalogService } = scope.cradle;
    const restaurant = (await restaurantRepository.findBySlug('halka'))!;
    const dish = (await catalogService.publishedMenu('halka'))!.dishes[0].id;
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    const ev = (sessionId: string, name: GuestInteractionInput['name'], createdAt: Date, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test', createdAt, ...extra });
    await seedUsageEvents(guestInteractionRepository, restaurant.id, [
      ev('c0000000-0000-4000-8000-000000000001', 'guest_session_started', daysAgo(3), { props: { source: 'qr', menuVersion: null } }),
      ev('c0000000-0000-4000-8000-000000000001', 'recommendations_viewed', daysAgo(3), { dishId: dish, props: { wineIds: [], items: [], menuVersion: null } }),
      ev('c0000000-0000-4000-8000-000000000002', 'guest_session_started', daysAgo(4), { props: { source: 'link', menuVersion: null } }),
      ev('c0000000-0000-4000-8000-000000000009', 'staff_lookup', daysAgo(2), { dishId: dish, props: { source: 'staff', prefs: {}, wineIds: [], menuVersion: null } })
    ]);
    await scope.dispose();
    const h = await render();
    const t = text(h);
    expect(t).toContain('Guest sessions 2');
    expect(t).toContain('Dish recommendations viewed 1');
    expect(t).toContain('Recommendation → selection 0.0% 0 of 1 sessions');
    expect(t).toContain('Waiter lookups 1');
    expect(t).toContain('No comparison');
    expect(explainIds(h)).toEqual(['usage', 'dashboard']);
    expect(placementProblems(h)).toEqual([]);
    expect(text(await render('pl'))).toContain('Sesje gości 2');
  });

  it('R9: a failing usage read shows the section error, and the rest of A1 renders', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const scope = await createRequestScope();
    const repo = scope.cradle.guestInteractionRepository;
    const spy = vi.spyOn(repo, 'usageTotals').mockRejectedValue(new Error('read failed'));
    const h = await render();
    spy.mockRestore();
    await scope.dispose();
    expect(h).toMatch(/<h2[^>]*>Analytics are temporarily unavailable\.<\/h2>/);
    expect(h).toContain('aria-label="Wine program"');
    expect(h).toContain('Needs your attention');
    expect(error).toHaveBeenCalledWith('analytics section failed', expect.objectContaining({ slug: 'halka', section: 'usage' }));
  });
});
