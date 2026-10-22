import { readFileSync } from 'node:fs';
import type { MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { describe, expect, it } from 'vitest';
import SalesPage from '@/app/(admin)/admin/[slug]/import/sales/page';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';

/**
 * Spec 2026-10-16-recommendation-code, phase 3 (E09 F3, #49), the app side: the import preview note about codes and the
 * "Wine from a recommendation" card of A13, as the server sends them (no JavaScript), with the real file parser and the
 * memory store. AC9 (preview part), AC12.
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
const card = (h: string, id: string) => h.slice(h.indexOf(`id="${id}"`));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../../db/tests/fixtures/${name}`, import.meta.url)));

async function signIn() {
  const s = await loginAs('tomasz@halka.pl');
  state().cookies.set(SESSION_COOKIE, s.token);
}

describe('A13 recommendation codes on the sales import (E09 F3), server-rendered', () => {
  it('the preview says how many checks carry a code and how many codes match no recommendation; the codes are shown, the comments are not (AC9)', async () => {
    await signIn();
    const scope = await createRequestScope();
    const job = await scope.cradle.importService.upload('halka', 'sales', { name: 'sales-pos-codes.csv', bytes: fixture('sales-pos-codes.csv') }, { id: 'user-tomasz', name: 'Tomasz' });
    await scope.dispose();
    const html = await render({ job: job.id });
    expect(html).toContain('data-codes-note');
    expect(text(html)).toContain('4 checks have a recommendation code. 4 codes do not match a recommendation of that day.');
    expect(text(html)).toContain('Recommendation code');
    expect(html).toContain('W7K');
    expect(html).not.toMatch(/Kowalski|alergia|stolik/);
    const pl = await render({ job: job.id }, 'pl');
    expect(text(pl)).toContain('4 rachunki mają kod polecenia. 4 kody nie pasują do poleceń z tego dnia.');
  });

  it('the "Recommendation code" column shows only when the file has a code column or a code in an item cell (SCREEN_SPECIFICATION A13)', async () => {
    await signIn();
    const scope = await createRequestScope();
    const actor = { id: 'user-tomasz', name: 'Tomasz' };
    const upload = async (name: string, csv: string) => (await scope.cradle.importService.upload('halka', 'sales', { name, bytes: new TextEncoder().encode(csv) }, actor)).id;
    const head = 'business date,check number,item type,item,quantity,net amount';
    const withColumn = await upload('column.csv', `${head},recommendation code\n14.10.2026,501,Food,Duck breast,2,207.41,\n14.10.2026,502,Wine bottle,Morgon 2021,1,166.67,W7K\n`);
    const codeInItem = await upload('item-code.csv', `${head}\n14.10.2026,601,Food,Duck breast,2,207.41\n14.10.2026,602,Wine bottle,W7K,1,166.67\n`);
    const plain = await upload('plain.csv', `${head}\n14.10.2026,701,Food,Duck breast,2,207.41\n14.10.2026,702,Wine bottle,Morgon 2021,1,166.67\n`);
    await scope.dispose();

    const column = (h: string) => /<th[^>]*>Recommendation code<\/th>/.test(h);
    expect(column(await render({ job: withColumn }))).toBe(true);
    expect(column(await render({ job: codeInItem }))).toBe(true);
    expect(column(await render({ job: plain }))).toBe(false);
  });

  it('the card shows the orders of the period once each, the codes on the till without a recommendation, and a refused period (AC12)', async () => {
    await signIn();
    const scope = await createRequestScope();
    const actor = { id: 'user-tomasz', name: 'Tomasz' };
    const job = await scope.cradle.importService.upload('halka', 'sales', { name: 'sales-pos-codes.csv', bytes: fixture('sales-pos-codes.csv') }, actor);
    await scope.cradle.importService.confirm('halka', job.id, actor);
    // one guest recommendation issued for W7K on 14 Oct (the wine of the first check), confirmed by nobody: the till matches it
    const s = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const restaurant = s.restaurants.find((r) => r.slug === 'halka')!;
    s.recommendationCodes.push({
      restaurantId: restaurant.id, id: '00000000-0000-4000-8000-0000000000c1', confirmedBy: null,
      record: {
        code: 'W7K', serviceDay: '2026-10-14', sessionId: '00000000-0000-4000-8000-0000000000c2', source: 'guest', context: 'direct',
        wineId: s.wines.get(restaurant.id)![0].id, dishIds: [], serving: 'bottle', menuVersion: null, tier: null,
        engineVersion: 'wm-test', issuedAt: '2026-10-14T18:00:00.000Z', confirmedAt: null
      }
    });
    await scope.dispose();

    const html = await render({ from: '2026-10-14', to: '2026-10-15' });
    const c = card(html, 'wine-from-recommendation');
    expect(c).toContain('data-recommendation-card');
    expect(text(c)).toContain('Ordered: 1 of 1 recommendation');
    expect(text(c)).toContain('(waiter 0, till 1). Each recommendation counts once.');
    expect(text(c)).toContain('Codes on the till without a recommendation: 3');
    expect(c).toContain('data-codes-ordered');
    expect(c).not.toContain('role="alert"');

    const pl = card(await render({ from: '2026-10-14', to: '2026-10-15' }, 'pl'), 'wine-from-recommendation');
    expect(text(pl)).toContain('Zamówione: 1 z 1 polecenia (kelner 0, kasa 1).');
    expect(text(pl)).toContain('Kody w kasie bez polecenia: 3');

    const refused = card(await render({ from: '2026-10-15', to: '2026-10-14' }), 'wine-from-recommendation');
    expect(refused).toContain('role="alert"');
    expect(text(refused)).toContain('This period cannot be shown');
  });
});
