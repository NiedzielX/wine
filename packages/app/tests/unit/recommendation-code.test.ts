import { serviceDay, type RecommendationCodeRepository, type RecommendationCodeService } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';
import { ISSUE_TIMEOUT_MS, issueCodeForPage } from '@/server/recommendation-code';
import { SYNTHETIC_TRAFFIC_HEADER } from '@/server/usage-events';

/**
 * Spec 2026-10-16-recommendation-code, phase 1: the code on G8 (AC5, AC6, AC13) and `issueCodeForPage` (R4) —
 * rendered to HTML the way the server sends it, on the in-memory data source.
 */

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CODE = /data-recommendation-code="([A-Z0-9]{3,4})"/;

function setHeaders(extra: Record<string, string> = {}, lang = 'en') {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  for (const [k, v] of Object.entries(extra)) next().headers.set(k, v);
}

async function render(wineId: string, search: Record<string, string>, opts: { headers?: Record<string, string>; lang?: string } = {}): Promise<string> {
  setHeaders(opts.headers, opts.lang);
  const { prelude } = await prerender(createElement(SelectedPage as Page, { params: Promise.resolve({ slug: 'halka', wineId }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const codeOf = (html: string) => CODE.exec(html)?.[1] ?? null;

let repo: RecommendationCodeRepository;
let restaurantId = '';
let duck = '';
let dishes: string[] = [];
let wine = '';
let glassWine = '';
let inactiveWine = '';

beforeAll(async () => {
  const c = (await createRequestScope()).cradle;
  repo = c.recommendationCodeRepository;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!.id;
  dishes = menu.dishes.map((d) => d.id);
  const wines = await c.wineRepository.listByRestaurant(restaurantId);
  wine = (await c.recommendationService.forDish('halka', duck, { serving: 'any', styles: [], maxPrice: null, weight: 'any', mood: 'any' }))!.result.items[0].wine.id;
  glassWine = wines.find((w) => w.active && w.glassPrice !== null)!.id;
  inactiveWine = wines.find((w) => !w.active)!.id;
});

afterEach(async () => {
  await Promise.all(next().afterTasks.splice(0));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const today = () => serviceDay(new Date());

describe('G8: the code for the waiter (AC5, AC13)', () => {
  it('shows a code, keeps it on refresh with the same sid, and stores the dish choice with its tier', async () => {
    const html = await render(wine, { dish: duck, serving: 'bottle', sid: SID });
    const code = codeOf(html);
    expect(code).toMatch(/^[ACDEFGHJKLMNPRTUVWXY][2-9][ACDEFGHJKLMNPRTUVWXY]$/);
    expect(html).toContain('Code for your waiter');
    expect(html).toContain('Show it to your waiter with the wine.');
    expect(html).toContain(`<span class="sr-only">${code!.split('').join(', ')}</span>`);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>[A-Z0-9]{3}<\/span>/);
    // refresh / back: the same code, no second row
    expect(codeOf(await render(wine, { dish: duck, serving: 'bottle', sid: SID }))).toBe(code);
    expect(await repo.countBySession(restaurantId, today(), SID)).toBe(1);
    expect(await repo.findByCode(restaurantId, today(), code!)).toMatchObject({
      sessionId: SID, source: 'guest', context: 'dish', wineId: wine, dishIds: [duck], serving: 'bottle', tier: expect.stringMatching(/^(sommelier_primary|sommelier|engine)$/)
    });
    // the bottle and the glass are two choices
    expect(codeOf(await render(glassWine, { dish: duck, serving: 'glass', sid: SID }))).not.toBe(code);
  });

  it('speaks Polish on the Polish page', async () => {
    const html = await render(wine, { dish: duck, sid: '0b8c6c1e-1f0e-4c43-9a0b-5b8f1e2d3c4a', lang: 'pl' }, { lang: 'pl' });
    expect(codeOf(html)).not.toBeNull();
    expect(html).toContain('Kod dla kelnera');
    expect(html).toContain('Pokaż go kelnerowi razem z winem.');
  });

  it('a wine opened without a dish is a direct choice; foreign and unknown dish ids never reach the record (R5)', async () => {
    const sid = '5a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const direct = codeOf(await render(wine, { sid }));
    expect(await repo.findByCode(restaurantId, today(), direct!)).toMatchObject({ context: 'direct', dishIds: [], tier: null });
    const foreign = '00000000-0000-4000-8000-0000000000aa';
    const table = codeOf(await render(wine, { table: [dishes[0], foreign, dishes[1], 'not-a-uuid'].join(','), sid }));
    expect(await repo.findByCode(restaurantId, today(), table!)).toMatchObject({ context: 'table', dishIds: [dishes[0], dishes[1]].sort(), tier: null });
  });

  it('an inactive wine and a 404 issue nothing; our synthetic traffic and bots get no code (R4, AC6)', async () => {
    const sid = '6b2d3c4e-5f60-4b7c-9d8e-0f1a2b3c4d5e';
    const inactive = await render(inactiveWine, { dish: duck, sid });
    expect(inactive).not.toContain('data-recommendation-code');
    await expect(render('00000000-0000-4000-8000-0000000000ff', { sid })).rejects.toThrow('NEXT_NOT_FOUND');
    const synthetic = await render(wine, { dish: duck, sid }, { headers: { [SYNTHETIC_TRAFFIC_HEADER]: '1' } });
    expect(synthetic).toContain('data-recommendation-code="none"');
    expect(synthetic).toContain('Code unavailable — name the wine to your waiter.');
    const bot = await render(wine, { dish: duck, sid }, { headers: { 'user-agent': 'WhatsApp/2.23' } });
    expect(codeOf(bot)).toBeNull();
    expect(await repo.countBySession(restaurantId, today(), sid)).toBe(0);
    // the rest of the screen is unchanged
    expect(synthetic).toContain('Show this to your waiter.');
  });

  it('after 30 recommendations of one session the page says that the code is unavailable (R13, AC13)', async () => {
    const sid = '7c3e4d5f-6071-4c8d-8e9f-1a2b3c4d5e6f';
    const c = (await createRequestScope()).cradle;
    const wines = (await c.wineRepository.listByRestaurant(restaurantId)).filter((w) => w.active);
    let n = 0;
    for (const w of wines) {
      for (const dish of dishes) {
        if (n >= 30) break;
        const r = await c.recommendationCodeService.issue('halka', { session: { id: sid, isNew: false, source: 'link' }, source: 'guest', wineId: w.id, serving: 'bottle', dishIds: [dish] });
        if (r) n++;
      }
    }
    expect(n).toBe(30);
    const html = await render(glassWine, { sid });
    expect(html).toContain('data-recommendation-code="none"');
    expect(html).toContain('Code unavailable — name the wine to your waiter.');
  });
});

describe('issueCodeForPage (R4, AC6)', () => {
  const restaurant = () => ({ id: restaurantId, slug: 'halka' });
  const input = () => ({ session: { id: SID, isNew: false, source: 'link' as const }, source: 'guest' as const, wineId: wine, serving: 'bottle' as const, dishIds: [] });
  const failing = (issue: RecommendationCodeService['issue']) => ({ recommendationCodeService: { issue } as unknown as RecommendationCodeService });

  it('a failing write gives no code and a warning without guest data', async () => {
    setHeaders();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(await issueCodeForPage(failing(async () => { throw new Error('connection refused'); }), restaurant(), input())).toBeNull();
    expect(warn).toHaveBeenCalledWith('recommendation code not issued', { restaurantId, error: 'connection refused' });
  });

  it('the page does not wait longer than ISSUE_TIMEOUT_MS', async () => {
    setHeaders();
    vi.useFakeTimers();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const pending = issueCodeForPage(failing(() => new Promise(() => {})), restaurant(), input());
    await vi.advanceTimersByTimeAsync(ISSUE_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBeNull();
    expect(warn).toHaveBeenCalledWith('recommendation code not issued', expect.objectContaining({ error: `timed out after ${ISSUE_TIMEOUT_MS} ms` }));
  });

  it('a request that is not a guest page view does not reach the service', async () => {
    setHeaders({ [SYNTHETIC_TRAFFIC_HEADER]: '1' });
    const issue = vi.fn();
    expect(await issueCodeForPage(failing(issue), restaurant(), input())).toBeNull();
    expect(issue).not.toHaveBeenCalled();
  });
});
