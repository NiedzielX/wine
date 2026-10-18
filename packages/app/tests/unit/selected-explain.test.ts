import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SelectedPage from '@/app/(guest)/r/[slug]/selected/[wineId]/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { createRequestScope } from '@/server/container';
import { SYNTHETIC_TRAFFIC_HEADER } from '@/server/usage-events';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-10-16-how-it-works-explanations, the explanation on G8 ("What happens next?"): one "i" on the screen,
 * under the choice and the recommendation code, with the sentence about the code (spec 2026-10-16-recommendation-code,
 * G8) only when a code is shown (Q15). AC2, AC3 (structure), AC5, AC6 and the limits of R4 for G8 — the page rendered
 * to HTML the way the server sends it.
 */

const DICTS = { en, pl } as const;
const next = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; afterTasks: Array<Promise<unknown>> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SID = '3d1e2f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';

async function render(wineId: string, search: Record<string, string>, lang: 'en' | 'pl', extra: Record<string, string> = {}): Promise<string> {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  for (const [k, v] of Object.entries(extra)) next().headers.set(k, v);
  const { prelude } = await prerender(createElement(SelectedPage as Page, { params: Promise.resolve({ slug: 'halka', wineId }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

/** The explanation's inner HTML: everything inside `<details data-explain="selected">`. */
const explainHtml = (html: string) => /<details data-explain="selected"[^>]*>([\s\S]*?)<\/details>/.exec(html)?.[1] ?? '';
const points = (html: string) => [...explainHtml(html).matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
const words = (texts: string[]) => texts.join(' ').split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&');

let duck = '';
let wine = '';
let inactiveWine = '';
let table = '';

beforeAll(async () => {
  const scope = await createRequestScope();
  const c = scope.cradle;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!.id;
  wine = (await c.recommendationService.forDish('halka', duck))!.result.items[0].wine.id;
  inactiveWine = (await c.wineRepository.listByRestaurant(menu.restaurant.id)).find((w) => !w.active)!.id;
  table = menu.dishes.filter((d) => d.category === 'Mains').slice(0, 2).map((d) => d.id).join(',');
  await scope.dispose();
});

afterEach(async () => {
  await Promise.all(next().afterTasks.splice(0));
});

describe('G8 texts: what happens next, and the code sentence (AC5, AC6, R4)', () => {
  for (const [lang, t] of Object.entries(DICTS)) {
    it(`${lang}: at most 6 points and 90 words with the code sentence, no number, no "AI"`, () => {
      const all = [...t.guest.explain.selected.points, t.guest.selected.code.explain];
      expect(all.length).toBeLessThanOrEqual(6);
      expect(words(all)).toBeLessThanOrEqual(90);
      // nothing on G8 depends on the pairing rules: no number to take from ENGINE_FACTS, so none is written
      for (const text of all) expect(text, text).not.toMatch(/\d/);
      for (const text of [t.guest.explain.selected.summary, ...all]) expect(text, text).not.toMatch(/\b(AI|LLM)\b|sztuczn|artificial|algorytm|algorithm|silnik|engine/i);
    });
  }
});

describe('G8: one explanation, in its place, with the code sentence only next to a code (AC2, AC3, Q15)', () => {
  for (const lang of ['en', 'pl'] as const) {
    const t = DICTS[lang];

    it(`${lang}: a dish choice with a code — one closed "i" under the code, never in a link, a button or a paragraph`, async () => {
      const html = await render(wine, { dish: duck, sid: SID, ...(lang === 'pl' ? { lang } : {}) }, lang);
      expect(html).toMatch(/data-recommendation-code="[A-Z0-9]{3,4}"/);
      expect(explainIds(html)).toEqual(['selected']);
      expect(placementProblems(html)).toEqual([]);
      expect(html).not.toMatch(/<details[^>]*data-explain[^>]*\sopen/);
      expect(html).toContain(`<span>${t.guest.explain.selected.summary}</span></summary>`);
      // the summary is the first child of the details, and no script is needed to open it
      expect(html).toMatch(/<details data-explain="selected"[^>]*><summary/);
      // under the choice and the code, above the buttons
      const at = html.indexOf('data-explain="selected"');
      expect(html.indexOf('data-recommendation-code=')).toBeLessThan(at);
      expect(html.indexOf(t.guest.selected.pairAnother)).toBeGreaterThan(at);
      expect(points(html).map(decode)).toEqual([...t.guest.explain.selected.points, t.guest.selected.code.explain]);
    });

    it(`${lang}: no code (our synthetic traffic) — the same "i" without the code sentence`, async () => {
      const html = await render(wine, { dish: duck, sid: SID }, lang, { [SYNTHETIC_TRAFFIC_HEADER]: '1' });
      expect(html).toContain('data-recommendation-code="none"');
      expect(explainIds(html)).toEqual(['selected']);
      expect(placementProblems(html)).toEqual([]);
      expect(points(html).map(decode)).toEqual([...t.guest.explain.selected.points]);
      expect(html).not.toContain(t.guest.selected.code.explain);
    });
  }

  it('the table bottle and a wine opened without a dish: one "i" too', async () => {
    expect(explainIds(await render(wine, { table, sid: SID }, 'en'))).toEqual(['selected']);
    expect(explainIds(await render(wine, { sid: SID }, 'en'))).toEqual(['selected']);
  });

  it('an inactive wine has no choice to explain: no "i"', async () => {
    expect(explainIds(await render(inactiveWine, { dish: duck, sid: SID }, 'en'))).toEqual([]);
  });
});
