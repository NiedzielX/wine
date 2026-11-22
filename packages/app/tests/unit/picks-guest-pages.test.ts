import type { GuestInteraction, RankedItem } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import HowItWorksPage from '@/app/(guest)/r/[slug]/how-it-works/page';
import WinesPage from '@/app/(guest)/r/[slug]/dish/[dishId]/wines/page';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import WinePage from '@/app/(guest)/r/[slug]/wine/[wineId]/page';
import { GET as publicRecommendations } from '@/app/api/v1/dishes/[dishId]/recommendations/route';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { req } from './helpers';

/**
 * Spec 2026-11-18-restaurant-picks, PR2 (AC12, AC13, AC14, AC15): the restaurant's pick on G3, G7, G9 and G12, in both
 * languages, rendered to HTML the way the server sends it (no script), on the in-memory data source; the public API
 * field; the flag in the events. The demo restaurant has no picks, so this file marks and publishes its own set.
 */

const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Nowak' };
const SID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

async function render(page: unknown, params: Record<string, string>, search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const settle = async () => { await Promise.all(next().afterTasks.splice(0)); };
const textOf = (html: string) => html.replace(/<[^>]*>/g, ' ');
/** The label's elements (`data-pick`): what a guest reads as the restaurant's mark. */
const marks = (html: string) => [...html.matchAll(/<[a-z]+ data-pick="restaurant"[^>]*>([^<]*)</g)].map((m) => m[1]);

interface Found { dishId: string; pick: RankedItem; leading: boolean }
let restaurantId = '';
let found: Found | null = null;
let leadingCase: Found | null = null;
let sommelierPairWine: { dishId: string; wineId: string } | null = null;

beforeAll(async () => {
  const scope = await createRequestScope();
  const c = scope.cradle;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  await c.publishService.publish('halka', ACTOR);
  const wines = (await c.wineRepository.listByRestaurant(restaurantId)).filter((w) => w.active).map((w) => w.id).sort();
  for (const id of wines.slice(0, 5)) await c.picksService.set('halka', id, true, ACTOR);
  await c.publishService.publish('halka', ACTOR);
  for (const d of menu.dishes) {
    const items = (await c.recommendationService.forDish('halka', d.id, {}))!.result.items;
    items.forEach((i, k) => {
      if (i.restaurantPick && !found) found = { dishId: d.id, pick: i, leading: k === 0 };
      if (i.restaurantPick && k === 0 && !leadingCase) leadingCase = { dishId: d.id, pick: i, leading: true };
      if (i.tier < 2 && !sommelierPairWine) sommelierPairWine = { dishId: d.id, wineId: i.wine.id };
    });
  }
  await scope.dispose();
});

afterAll(async () => {
  await settle();
});

describe('the label on G3 (AC12, U3, U4)', () => {
  it('shows "Restaurant’s pick" and "Wybór restauracji" next to the wine, as plain text, with no seal and no "AI"', async () => {
    expect(found).not.toBeNull();
    for (const [lang, text] of [['en', en.guest.wines.restaurantPick], ['pl', pl.guest.wines.restaurantPick]] as const) {
      const html = await render(WinesPage, { dishId: found!.dishId }, { sid: SID, lang }, lang);
      expect(marks(html), lang).toContain(text);
      expect(html).not.toMatch(/\bAI\b/);
      // the mark is an element of its own: no seal icon and no sommelier wording inside it
      const mark = html.match(/<(?:span|p) data-pick="restaurant"[^>]*>[\s\S]*?<\/(?:span|p)>/)![0];
      expect(mark).not.toContain('<svg');
      expect(mark).not.toMatch(/sommelier|brass/i);
      // the explanation sentence of the list says what the mark is
      expect(textOf(html)).toContain(lang === 'en' ? en.guest.wines.pickNote : pl.guest.wines.pickNote);
    }
  });

  it('keeps the reason and the score of the wine as the engine wrote them', async () => {
    const html = await render(WinesPage, { dishId: found!.dishId }, { sid: SID });
    expect(html).toContain(found!.pick.why.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/’/g, '’'));
    expect(textOf(html)).toContain(`${found!.pick.matchScore}`);
  });

  it('a pick in the first place is headed "Restaurant’s pick", not "Recommended for your dish" (R12)', async () => {
    expect(leadingCase).not.toBeNull();
    const html = await render(WinesPage, { dishId: leadingCase.dishId }, { sid: SID });
    expect(html).toMatch(/<p data-pick="restaurant"[^>]*>Restaurant’s pick<\/p>/);
    // the explanation above the list still names the engine's own suggestion; the card heading must not
    expect(html).not.toMatch(/<p class="[^"]*text-wine"[^>]*>(<svg[\s\S]*?<\/svg>)?Recommended for your dish<\/p>/);
  });

  it('a list without any pick is the list as it was: no mark, no note', async () => {
    const scope = await createRequestScope();
    const menu = (await scope.cradle.catalogService.publishedMenu('halka'))!;
    let plain: string | null = null;
    for (const d of menu.dishes) {
      const items = (await scope.cradle.recommendationService.forDish('halka', d.id, {}))!.result.items;
      if (items.length > 0 && !items.some((i) => i.restaurantPick)) { plain = d.id; break; }
    }
    await scope.dispose();
    expect(plain).not.toBeNull();
    const html = await render(WinesPage, { dishId: plain! }, { sid: SID });
    expect(marks(html)).toEqual([]);
    expect(textOf(html)).not.toContain(en.guest.wines.pickNote);
  });
});

describe('the label on G7 and G9 (AC12)', () => {
  it('G7 shows the mark in the match box for a pick and for no other wine', async () => {
    const html = await render(WinePage, { wineId: found!.pick.wine.id }, { dish: found!.dishId, sid: SID });
    expect(marks(html)).toEqual([en.guest.wines.restaurantPick]);
    expect(html).not.toContain("Sommelier’s pairing");
    if (sommelierPairWine) {
      const pair = await render(WinePage, { wineId: sommelierPairWine.wineId }, { dish: sommelierPairWine.dishId, sid: SID });
      expect(marks(pair)).toEqual([]);
    }
    const direct = await render(WinePage, { wineId: found!.pick.wine.id }, { sid: SID });
    expect(marks(direct)).toEqual([]);
  });

  it('G9 shows the mark to the waiter, in Polish too', async () => {
    const en9 = await render(StaffPage, {}, { dish: found!.dishId, sid: SID });
    expect(marks(en9)).toContain(en.guest.wines.restaurantPick);
    const pl9 = await render(StaffPage, {}, { dish: found!.dishId, sid: SID, lang: 'pl' }, 'pl');
    expect(marks(pl9)).toContain(pl.guest.wines.restaurantPick);
  });
});

describe('G12 says what the mark is (AC13, U6)', () => {
  it('has the sentence in English and in Polish', async () => {
    const enHtml = await render(HowItWorksPage, {}, { sid: SID });
    expect(textOf(enHtml)).toContain('A restaurant can mark some wines as its pick and show them higher among the suggestions.');
    expect(textOf(enHtml)).toContain('The mark does not change the match score, and the sommelier’s pairing always stays on top.');
    const plHtml = await render(HowItWorksPage, {}, { sid: SID, lang: 'pl' }, 'pl');
    expect(textOf(plHtml)).toContain('Restauracja może oznaczyć część win jako swój wybór i pokazać je wyżej wśród propozycji. Oznaczenie nie zmienia wyniku dopasowania, a para sommeliera zawsze zostaje na górze.');
    expect(`${enHtml}${plHtml}`).not.toMatch(/\bAI\b/);
  });
});

describe('the public API field (AC15)', () => {
  it('has `restaurantPick` on every item, true only on a marked wine, with the engine\'s score', async () => {
    const res = await publicRecommendations(req(`http://localhost:3000/api/v1/dishes/${found!.dishId}/recommendations?restaurant=halka&limit=6`), { params: Promise.resolve({ dishId: found!.dishId }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ wine: { id: string }; matchScore: number; tier: string; restaurantPick: boolean }> };
    expect(body.items.length).toBeGreaterThan(0);
    for (const i of body.items) {
      expect(typeof i.restaurantPick).toBe('boolean');
      if (i.restaurantPick) expect(i.tier).toBe('engine');
    }
    const mine = body.items.find((i) => i.wine.id === found!.pick.wine.id);
    expect(mine?.restaurantPick).toBe(true);
  });
});

describe('the events carry `pick: true` only for a labelled wine (AC14, U7)', () => {
  const events = async (sid: string): Promise<GuestInteraction[]> => {
    await settle();
    const scope = await createRequestScope();
    const list = await scope.cradle.guestInteractionRepository.listBySession(restaurantId, sid);
    await scope.dispose();
    return list;
  };

  it('recommendations_viewed marks the item; wine_viewed and wine_selected carry the prop for the labelled wine only', async () => {
    const sid = '1d0f5a2e-3b4c-4d5e-9f60-718293a4b5c6';
    await render(WinesPage, { dishId: found!.dishId }, { sid });
    await render(WinePage, { wineId: found!.pick.wine.id }, { dish: found!.dishId, sid });
    await render(SelectedPage, { wineId: found!.pick.wine.id }, { dish: found!.dishId, serving: 'bottle', sid });
    const list = await events(sid);
    const viewed = list.find((e) => e.name === 'recommendations_viewed')!;
    const items = (viewed.props as { items: Array<{ wineId: string; pick?: boolean }> }).items;
    expect(items.find((i) => i.wineId === found!.pick.wine.id)?.pick).toBe(true);
    // the key is only ever `true`: an item without the label has no `pick` at all
    for (const i of items) if ('pick' in i) expect(i.pick).toBe(true);
    expect(list.find((e) => e.name === 'wine_viewed')!.props).toMatchObject({ context: 'dish', pick: true });
    expect(list.find((e) => e.name === 'wine_selected')!.props).toMatchObject({ context: 'dish', pick: true });
  });

  it('a wine page without a dish, or for a wine without the label, has no `pick`', async () => {
    const sid = '2e1a6b3f-4c5d-4e6f-8a71-8293a4b5c6d7';
    await render(WinePage, { wineId: found!.pick.wine.id }, { sid });
    await render(SelectedPage, { wineId: found!.pick.wine.id }, { serving: 'bottle', sid });
    const list = await events(sid);
    for (const e of list.filter((x) => x.name === 'wine_viewed' || x.name === 'wine_selected')) expect('pick' in (e.props as object)).toBe(false);
  });
});
