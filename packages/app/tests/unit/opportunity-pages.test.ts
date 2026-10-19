import { MIN_ORDERS, OpportunityService, WINDOW_DAYS, lastFullServiceDays } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(admin)/admin/[slug]/(lists)/page';
import OpportunitiesPage from '@/app/(admin)/admin/[slug]/opportunities/page';
import PairingsPage from '@/app/(admin)/admin/[slug]/pairings/[dishId]/page';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-sommelier-opportunities, phase 2: the opportunity screens as the server sends them (no JavaScript).
 * A14 lists every opportunity grouped by dish with the dish's current pairings (Q9); A6 has a card only for a dish
 * with opportunities; A1 has one line with their number (Q19). The general manager sees them without buttons (R7, AC7).
 * On the Halka demo data: 6 opportunities (herring 2 × S3, scallops S2, pike-perch S2, risotto 2 × S3).
 */

const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

async function render(page: unknown, params: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve({}) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const count = (html: string, needle: string) => html.split(needle).length - 1;

let sommelier = '';
let manager = '';
const dishes = new Map<string, string>();

beforeAll(async () => {
  sommelier = (await loginAs('marta@halka.pl')).token;
  manager = (await loginAs('tomasz@halka.pl')).token;
  const scope = await createRequestScope();
  for (const r of (await scope.cradle.adminService.menu('halka'))!.rows) dishes.set(r.dish.name, r.dish.id);
  await scope.dispose();
});
const as = (token: string) => state().cookies.set(SESSION_COOKIE, token);
afterEach(() => vi.restoreAllMocks());

describe('A14 Opportunities', () => {
  it('groups the opportunities by dish, each headed by the current pairings, with one closed explanation', async () => {
    as(sommelier);
    const html = await render(OpportunitiesPage);
    expect(html).toContain('<h1 class="font-serif text-3xl leading-tight tracking-tight lg:text-4xl">Opportunities</h1>');
    expect(explainIds(html)).toEqual(['opportunities']);
    expect(placementProblems(html)).toEqual([]);
    expect(html).not.toMatch(/<details data-explain[^>]*\sopen/);
    expect(html).toContain('<span>What are opportunities?</span>');
    expect(count(html, 'data-opportunity=')).toBe(6);
    const order = ['Baltic herring', 'Seared scallops', 'Pike-perch', 'Wild mushroom risotto'].map((d) => html.indexOf(`>${d}</h2>`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('Current pairings:');
    expect(html).toContain(`href="/admin/halka/pairings/${dishes.get('Seared scallops')}"`);
    expect(html).toContain('Winnica Turnau Solaris matches this dish at 85%, is served by the glass (38 zł), and none of this dish’s pairings is available by the glass.');
    expect(html).toContain('is on your list but has no approved pairing. It matches “Baltic herring” best (87%).');
    expect(count(html, '>Add to suggestions</button>')).toBe(6);
    expect(count(html, '>Ignore</button>')).toBe(6);
    expect(html).not.toMatch(/\bAI\b/);
    expect(html).not.toContain('Ignored (');
  });

  it('in Polish', async () => {
    as(sommelier);
    const html = await render(OpportunitiesPage, {}, 'pl');
    for (const text of ['Okazje', '>Okazja<', 'Dodaj do propozycji', 'Ignoruj', 'Obecne parowania:', 'Czym są okazje?', 'Śledź bałtycki', 'jest na kieliszki (38 zł)']) expect(html).toContain(text);
    expect(html).not.toMatch(/\bAI\b|sztuczn/i);
  });

  it('the general manager sees the same opportunities without buttons, with a view-only note (R7)', async () => {
    as(manager);
    const html = await render(OpportunitiesPage);
    expect(count(html, 'data-opportunity=')).toBe(6);
    expect(html).toContain('View only');
    expect(html).not.toContain('Add to suggestions');
    expect(html).not.toContain('>Ignore</button>');
    expect(html).not.toContain('<form');
    as(sommelier);
  });

  it('ignored opportunities move to "Ignored (n)" with Restore; with none left, the empty state', async () => {
    as(sommelier);
    const scope = await createRequestScope();
    const actor = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
    const keys = (await scope.cradle.opportunityService.list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items.map((o) => o.key));
    for (const key of keys) await scope.cradle.opportunityService.dismiss('halka', key, actor);
    try {
      const html = await render(OpportunitiesPage);
      expect(html).toContain('Nothing to check.');
      expect(count(html, 'data-opportunity=')).toBe(0);
      expect(html).toContain('Ignored (6)');
      expect(count(html, '>Restore</button>')).toBe(6);
      expect(html).toContain('Marta Wierzbicka · back on');
      expect(html).toContain('By-the-glass match: Seared scallops · Winnica Turnau Solaris');
      // the dashboard line goes away with them
      expect(await render(DashboardPage)).not.toContain('Opportunities:');
    } finally {
      for (const key of keys) await scope.cradle.opportunityService.restore('halka', key, actor);
      await scope.dispose();
    }
  });

  it('a source that failed to load is a note on the page and a warning in the log; the other opportunities stay', async () => {
    as(sommelier);
    const list = OpportunityService.prototype.list;
    vi.spyOn(OpportunityService.prototype, 'list').mockImplementation(async function (this: OpportunityService, ...args) {
      const view = await list.apply(this, args);
      return view && { ...view, degraded: ['usage'] };
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const html = await render(OpportunitiesPage);
    expect(html).toContain('Some opportunities are temporarily unavailable.');
    expect(count(html, 'data-opportunity=')).toBe(6);
    expect(warn).toHaveBeenCalledWith('opportunities: some sources are unavailable', { slug: 'halka', degraded: ['usage'] });
  });
});

describe('A6 card and A1 line', () => {
  it('A6: a dish with opportunities has the card above "Approved for guests", with its own explanation and a link to A14', async () => {
    as(sommelier);
    const html = await render(PairingsPage, { dishId: dishes.get('Wild mushroom risotto')! });
    expect(explainIds(html)).toEqual(['opportunities', 'pairings', 'suggestions']);
    expect(placementProblems(html)).toEqual([]);
    const card = html.indexOf('Opportunities for this dish');
    expect(card).toBeGreaterThan(0);
    expect(card).toBeLessThan(html.indexOf('Approved for guests'));
    expect(count(html, 'data-opportunity=')).toBe(2);
    expect(html).toContain('href="/admin/halka/opportunities"');
    expect(html).toContain(`name="back" value="/admin/halka/pairings/${dishes.get('Wild mushroom risotto')}"`);
  });

  it('A6: no card for a dish without opportunities; the general manager sees the card without buttons', async () => {
    as(sommelier);
    expect(await render(PairingsPage, { dishId: dishes.get('Duck breast')! })).not.toContain('Opportunities for this dish');
    as(manager);
    const html = await render(PairingsPage, { dishId: dishes.get('Wild mushroom risotto')! });
    expect(count(html, 'data-opportunity=')).toBe(2);
    expect(html).not.toContain('Add to suggestions');
    as(sommelier);
  });

  it('A1: one line with the number of opportunities and a link to A14, no second explanation', async () => {
    as(sommelier);
    const html = await render(DashboardPage);
    expect(html).toContain('Opportunities: 6');
    expect(html).toContain('href="/admin/halka/opportunities">Open opportunities</a>');
    // the opportunities line adds no explanation (the second one belongs to the pairing performance table, E04 F3)
    expect(explainIds(html)).toEqual(['dashboard', 'performance']);
    expect(await render(DashboardPage, {}, 'pl')).toContain('Okazje: 6');
  });
});

// Last in the file: the codes it stores stay in the shared in-memory store (A1 and A6 never read them, scope "dish").
describe('A14 S5: ordered with a recommendation code, not approved (phase 4)', () => {
  it('a suggested pairing gets "Approve" with its version; the sentence names the orders and the 28 days; read-only without buttons', async () => {
    const scope = await createRequestScope();
    const restaurant = (await scope.cradle.restaurantRepository.findBySlug('halka'))!;
    const pairings = await scope.cradle.pairingRepository.listByRestaurant(restaurant.id);
    const herring = dishes.get('Baltic herring')!;
    const suggested = pairings.find((p) => p.dishId === herring && p.status === 'suggested')
      ?? pairings.find((p) => p.status === 'suggested' && [...dishes.values()].includes(p.dishId))!;
    const day = lastFullServiceDays(new Date(), WINDOW_DAYS).to;
    const codes = scope.cradle.recommendationCodeRepository;
    for (let i = 0; i < MIN_ORDERS; i++) {
      const id = `00000000-0000-4000-a000-${String(i + 1).padStart(12, '0')}`;
      const code = `X${i + 2}Y`;
      await codes.tryIssue(restaurant.id, {
        id, code, serviceDay: day, sessionId: id, source: 'guest', context: 'dish', wineId: suggested.wineId, dishIds: [suggested.dishId],
        serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: new Date().toISOString()
      });
      await codes.setConfirmed(restaurant.id, day, code, new Date(), 'staff_view');
    }
    await scope.dispose();

    as(sommelier);
    const html = await render(OpportunitiesPage);
    expect(count(html, 'data-opportunity="ordered_not_reviewed"')).toBe(1);
    expect(html).toMatch(/was ordered with a recommendation code for this dish 5 times in the last 28 days, and this pairing isn’t approved\./);
    expect(count(html, '>Approve</button>')).toBe(1);
    expect(html).toContain(`<input type="hidden" name="pairingId" value="${suggested.id}"/>`);
    expect(html).toMatch(/<input type="hidden" name="version" value="\d+"\/>/);
    expect(html).not.toMatch(/\bAI\b/);
    expect(await render(OpportunitiesPage, {}, 'pl')).toContain('zamówiono z kodem polecenia do tego dania 5 razy w ostatnich 28 dniach, a to parowanie nie jest zatwierdzone.');
    // A6 (scope "dish") does not read the codes
    expect(count(await render(PairingsPage, { dishId: suggested.dishId }), 'data-opportunity="ordered_not_reviewed"')).toBe(0);

    as(manager);
    const readOnly = await render(OpportunitiesPage);
    expect(count(readOnly, 'data-opportunity="ordered_not_reviewed"')).toBe(1);
    expect(readOnly).not.toContain('>Approve</button>');
    as(sommelier);
  });
});
