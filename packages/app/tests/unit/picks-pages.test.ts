import { PICKS_MAX } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PicksPage from '@/app/(admin)/admin/[slug]/picks/page';
import PairingsPage from '@/app/(admin)/admin/[slug]/pairings/[dishId]/page';
import PublishPage from '@/app/(admin)/admin/[slug]/publish/page';
import WinePage from '@/app/(admin)/admin/[slug]/wines/[wineId]/page';
import WinesPage from '@/app/(admin)/admin/[slug]/(lists)/wines/page';
import { setRestaurantPick } from '@/app/(admin)/admin/[slug]/picks-actions';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';
import { explainIds, placementProblems } from './html';

/**
 * Spec 2026-11-18-restaurant-picks, PR3 (panel): A27 as the server sends it (no JavaScript), the action behind its forms
 * (permission, version, limit, revalidation), and the marks on A4, A5 and A11 (R17; AC10, AC17). The owner and the general
 * manager change the set; the Wine Director sees the screen and the simulator and changes nothing.
 */

const revalidated = vi.hoisted(() => [] as Array<[string, string | undefined]>);
vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => { revalidated.push([path, type]); } }));

type NextState = { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } };
const state = () => (globalThis as unknown as { __wmNext: NextState }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[]>> }>;

async function render(page: unknown, params: Record<string, string> = {}, search: Record<string, string | string[]> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const count = (html: string, needle: string) => html.split(needle).length - 1;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof state().RedirectSignal) return e.url;
    throw e;
  }
  throw new Error('expected a redirect');
}

let manager = '';
let sommelier = '';
let wineIds: string[] = [];
let allCount = 0;
const as = (token: string) => state().cookies.set(SESSION_COOKIE, token);

async function fingerprint(): Promise<{ version: string; ids: string[] }> {
  const scope = await createRequestScope();
  try {
    const s = await scope.cradle.picksService.list('halka');
    return { version: s.version, ids: s.picks.map((p) => p.wineId) };
  } finally {
    await scope.dispose();
  }
}
const mark = async (wineId: string, on: boolean) => {
  const { version } = await fingerprint();
  return redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId, on: String(on), expectedVersion: version })));
};
const clearAll = async () => { for (const id of (await fingerprint()).ids) await mark(id, false); };

beforeAll(async () => {
  manager = (await loginAs('tomasz@halka.pl')).token;
  sommelier = (await loginAs('marta@halka.pl')).token;
  const scope = await createRequestScope();
  const rows = (await scope.cradle.adminService.wines('halka', {}, 'en'))!.rows;
  allCount = rows.length;
  wineIds = rows.filter((r) => r.wine.active).map((r) => r.wine.id);
  await scope.dispose();
});
afterEach(async () => {
  as(manager);
  await clearAll();
  revalidated.length = 0;
});

describe('A27 Restaurant’s picks (R17)', () => {
  it('the general manager gets the list with enabled switches, one closed explanation, the simulator form and no "AI"', async () => {
    as(manager);
    const html = await render(PicksPage);
    expect(html).toContain('>Restaurant’s picks</h1>');
    expect(html).toContain('0 of 5 wines are marked as the restaurant’s pick.');
    expect(explainIds(html)).toEqual(['picks']);
    expect(placementProblems(html)).toEqual([]);
    const buttons = [...html.matchAll(/<button[^>]*>Mark as pick/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(allCount);
    // a wine hidden from guests cannot be a pick: its switch is disabled, every other one is not
    expect(buttons.filter((b) => !/\sdisabled(=|\s|>)/.test(b))).toHaveLength(wineIds.length);
    expect(html).not.toContain('View only');
    expect(html).toMatch(/<form[^>]*action="\/admin\/halka\/picks"[^>]*method="get"|<form[^>]*method="get"[^>]*action="\/admin\/halka\/picks"/);
    expect(html).toContain('Before and after');
    expect(html).not.toMatch(/\bAI\b/);
    expect(html).not.toContain('Sommelier’s pairing</span>'); // nothing here wears the seal
  });

  it('in Polish', async () => {
    as(manager);
    const html = await render(PicksPage, {}, {}, 'pl');
    for (const text of ['>Wybory restauracji</h1>', 'Wybrane wina: 0 z 5.', 'Oznacz jako wybór', 'Przed i po', 'Symuluj']) expect(html).toContain(text);
    expect(html).not.toMatch(/\bAI\b|sztuczn/i);
  });

  it('the Wine Director sees the screen and the simulator but every switch is disabled, with a notice', async () => {
    as(sommelier);
    const html = await render(PicksPage);
    expect(html).toContain('View only');
    expect(html).toContain('Only the owner and the general manager change the picks.');
    const buttons = [...html.matchAll(/<button[^>]*>Mark as pick/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(allCount);
    expect(buttons.every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
    expect(html).toContain('Simulate'); // the simulator is open to the role
  });

  it('a switch posts the action with the fingerprint of the set it was drawn from', async () => {
    as(manager);
    const { version } = await fingerprint();
    const html = await render(PicksPage);
    expect(html).toContain(`name="expectedVersion" value="${version}"`);
    expect(html).toContain('name="back" value="/admin/halka/picks"');
    expect(html).toContain(`name="wineId" value="${wineIds[0]}"`);
  });

  it('a marked wine shows as waiting for publish and A11 counts it; the simulator names its effect', async () => {
    as(manager);
    expect(await mark(wineIds[0], true)).toBe('/admin/halka/picks?saved=pick_marked');
    const html = await render(PicksPage);
    expect(html).toContain('1 of 5 wines are marked as the restaurant’s pick.');
    expect(html).toContain('Pick, waiting for publish');
    expect(html).toContain('Not visible to guests yet: 1 to add and 0 to remove. Publish to apply.');
    expect(html).toContain('>Remove pick');
    expect(html).toMatch(/of \d+ dish(es)? (change|changes) order\./);
    expect(html).toContain('What each pick does');
    const publish = await render(PublishPage);
    expect(publish).toContain('Restaurant’s picks: +1 / −0');
    expect(publish).toContain('href="/admin/halka/picks"');
    expect(await render(PublishPage)).toContain('data-pending-picks');
    const list = await render(WinesPage);
    expect(list).toContain('Pick, waiting for publish');
    const wine = await render(WinePage, { wineId: wineIds[0] });
    expect(wine).toContain('It is marked, but guests do not see it as a pick until you publish.');
    const other = await render(WinePage, { wineId: wineIds[1] });
    expect(other).toContain('This wine is not marked.');
  });

  it('after the publish the mark is live; an unmarked published pick waits for the next publish', async () => {
    as(manager);
    await mark(wineIds[0], true);
    const scope = await createRequestScope();
    try {
      await scope.cradle.publishService.publish('halka', { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Lis' });
      let html = await render(PicksPage);
      expect(html).toContain('Restaurant’s pick');
      expect(html).not.toContain('waiting for publish');
      expect(html).not.toContain('Not visible to guests yet');
      await mark(wineIds[0], false);
      html = await render(PicksPage);
      expect(html).toContain('No longer a pick, guests still see it until you publish');
      expect(html).toContain('Not visible to guests yet: 0 to add and 1 to remove.');
      expect(await render(PublishPage)).toContain('Restaurant’s picks: +0 / −1');
      expect(await render(WinePage, { wineId: wineIds[0] })).toContain('It is no longer marked, but guests see it as a pick until you publish.');
      await scope.cradle.publishService.publish('halka', { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Lis' });
      expect(await render(PicksPage)).not.toContain('Not visible to guests yet');
    } finally {
      await scope.dispose();
    }
  });

  it('the simulator is a GET form: tried wines in the URL, an empty set, too many wines and an unknown dish', async () => {
    as(sommelier);
    const one = await render(PicksPage, {}, { picks: ['', wineIds[0]] });
    const ticked = [...one.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]).filter((tag) => /\schecked(=|\s|\/|>)/.test(tag));
    expect(ticked).toHaveLength(1);
    expect(ticked[0]).toContain(`value="${wineIds[0]}"`);
    expect(one).toContain('What each pick does');
    const none = await render(PicksPage, {}, { picks: [''] });
    expect(none).toContain('No picks to try.');
    const tooMany = await render(PicksPage, {}, { picks: wineIds.slice(0, PICKS_MAX + 1) });
    expect(tooMany).toContain('Check the simulation: choose at most 5 wines and a dish from the list.');
    expect(tooMany).not.toContain('What each pick does');
    const badDish = await render(PicksPage, {}, { picks: [''], dish: 'not-a-dish' });
    expect(badDish).toContain('Check the simulation');
  });

  it('an empty search says so, with no table', async () => {
    as(manager);
    const html = await render(PicksPage, {}, { q: 'zzzz-no-such-wine' });
    expect(html).toContain('No wines found');
    expect(html).toContain('Try another search.');
  });
});

describe('A6 Pairings: the picks on one dish', () => {
  it('has the card only while a pick exists, and says what it does here; the sommelier sees it too', async () => {
    as(manager);
    const scope = await createRequestScope();
    try {
      const dish = (await scope.cradle.adminService.menu('halka'))!.rows.find((r) => r.dish.status === 'published')!.dish.id;
      expect(await render(PairingsPage, { dishId: dish })).not.toContain('data-picks-on-dish');
      await mark(wineIds[0], true);
      await scope.cradle.publishService.publish('halka', { id: '00000000-0000-4000-8000-0000000000aa', name: 'Tomasz Lis' });
      for (const token of [manager, sommelier]) {
        as(token);
        const html = await render(PairingsPage, { dishId: dish });
        expect(html).toContain('data-picks-on-dish');
        expect(html).toContain('Restaurant’s picks on this dish');
        expect(html).toMatch(/Moves up|labelled here|No effect/);
        expect(html).not.toMatch(/\bAI\b/);
      }
    } finally {
      as(manager);
      await scope.dispose();
    }
  });
});

describe('setRestaurantPick (the form action)', () => {
  it('the owner of the change is the signed-in user: marks, is idempotent, unmarks, and revalidates the layout', async () => {
    as(manager);
    expect(await mark(wineIds[0], true)).toBe('/admin/halka/picks?saved=pick_marked');
    expect(revalidated).toContainEqual(['/admin/halka', 'layout']);
    expect(await mark(wineIds[0], true)).toBe('/admin/halka/picks?saved=pick_unchanged');
    expect(await mark(wineIds[0], false)).toBe('/admin/halka/picks?saved=pick_unmarked');
  });

  it('a forged post of the Wine Director is refused and nothing changes', async () => {
    as(sommelier);
    const before = await fingerprint();
    const url = await redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId: wineIds[0], on: 'true', expectedVersion: before.version })));
    expect(url).toBe('/admin/halka/picks?error=forbidden');
    expect(await fingerprint()).toEqual(before);
  });

  it('a stale version is a conflict and the sixth pick is refused; neither changes the set', async () => {
    as(manager);
    for (const id of wineIds.slice(0, PICKS_MAX)) await mark(id, true);
    const full = await fingerprint();
    expect(full.ids).toHaveLength(PICKS_MAX);
    const sixth = await redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId: wineIds[PICKS_MAX], on: 'true', expectedVersion: full.version })));
    expect(sixth).toBe('/admin/halka/picks?error=too_many_picks');
    const stale = await redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId: wineIds[0], on: 'false', expectedVersion: '00000000-0' })));
    expect(stale).toBe('/admin/halka/picks?error=version_conflict');
    expect(await fingerprint()).toEqual(full);
    // with all five used the page offers no way to mark a sixth (the server refuses it anyway)
    const html = await render(PicksPage);
    const marks = [...html.matchAll(/<button[^>]*>Mark as pick/g)].map((m) => m[0]);
    expect(marks.length).toBe(allCount - PICKS_MAX);
    expect(marks.every((b) => /\sdisabled(=|\s|>)/.test(b))).toBe(true);
  });

  it('an unknown wine and a wine id that is not a UUID are "not found", not a crash', async () => {
    as(manager);
    const { version } = await fingerprint();
    for (const wineId of ['00000000-0000-4000-8000-00000000dead', 'x\' or 1=1']) {
      const url = await redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId, on: 'true', expectedVersion: version })));
      expect(url).toBe('/admin/halka/picks?error=not_found');
    }
  });

  it('a post for another restaurant’s slug without a session goes to the sign-in page', async () => {
    state().cookies.delete(SESSION_COOKIE);
    const url = await redirectOf(() => setRestaurantPick(form({ slug: 'halka', back: '/admin/halka/picks', wineId: wineIds[0], on: 'true' })));
    expect(url).toContain('/admin/login');
  });
});
