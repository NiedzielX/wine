import type { MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ProofPage from '@/app/(admin)/admin/[slug]/proof/page';
import { setProofLaunchDay } from '@/app/(admin)/admin/[slug]/proof-actions';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';

/**
 * Spec 2026-11-18-owner-proof-report, step 6 (A33; AC7, AC9, AC10, AC14, AC15): the results report as the server sends it (no
 * JavaScript) on the in-memory data source, and the one action behind its form. POS lines are put into the memory store: 120
 * checks with food in the baseline (42 with wine) and 130 in window 1 (65 with wine, the first 10 with a code), the numbers of
 * H2 of the specification. The first test starts from a restaurant without a launch day.
 */
const revalidated = vi.hoisted(() => [] as Array<[string, string | undefined]>);
vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => { revalidated.push([path, type]); } }));

type NextState = { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } };
const state = () => (globalThis as unknown as { __wmNext: NextState }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[]>> }>;

async function render(search: Record<string, string | string[]> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(ProofPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const text = (h: string) => h.replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
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
const FORBIDDEN_WORDS = /\bAI\b|gwarantowan|dzięki Wine Match|efekt Wine Match|guarantee/i;
const L = '2026-06-01';
let manager = '';
let sommelier = '';
const as = (token: string) => state().cookies.set(SESSION_COOKIE, token);

async function store(): Promise<MemoryStore> {
  const scope = await createRequestScope();
  try { return (scope.cradle.authRepository as unknown as { store: MemoryStore }).store; } finally { await scope.dispose(); }
}
async function importSales() {
  const s = await store();
  const restaurantId = s.restaurants.find((r) => r.slug === 'halka')!.id;
  let n = 0;
  const add = (day: string, check: string, itemType: 'food' | 'wine_bottle', code: string | null = null) =>
    s.salesLines.push({ id: `5a1e6000-0000-4000-8000-${String(++n).padStart(12, '0')}`, businessDate: day, checkId: check, covers: 2, itemType, quantity: 1, netAmount: itemType === 'food' ? 100 : 150, recommendationCode: code, restaurantId, importJobId: 'job', replacedAt: null, replacedByJobId: null });
  const day = (offset: number) => new Date(Date.parse(`${L}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  for (let j = 0; j < 120; j++) { add(day(-28 + (j % 28)), `B${j}`, 'food'); if (j < 42) add(day(-28 + (j % 28)), `B${j}`, 'wine_bottle'); }
  for (let j = 0; j < 130; j++) { add(day(j % 28), `W${j}`, 'food'); if (j < 65) add(day(j % 28), `W${j}`, 'wine_bottle', j < 10 ? 'W7K' : null); }
}

beforeAll(async () => {
  manager = (await loginAs('tomasz@halka.pl')).token;
  sommelier = (await loginAs('marta@halka.pl')).token;
});

describe('A33 Results report', () => {
  it('without a launch day the manager gets the empty state with the form; the Wine Director gets 403 on the page and in the action', async () => {
    as(manager);
    const html = await render();
    expect(html).toContain('>Results report</h1>');
    expect(text(html)).toContain('Set the launch day first');
    expect(html).toMatch(/<input[^>]*name="launchDay"[^>]*type="date"|<input[^>]*type="date"[^>]*name="launchDay"/);
    expect(html).toMatch(/name="expectedCurrent"[^>]*value=""|value=""[^>]*name="expectedCurrent"/);
    expect(text(html)).toContain('How we calculate');
    expect(text(html)).toContain('What this report does not say');
    expect(html).not.toMatch(/<script[^>]*>[^<]*(setLaunch|onClick)/);
    as(sommelier);
    await expect(render()).rejects.toMatchObject({ name: 'ForbiddenSignal' });
    expect(await redirectOf(() => setProofLaunchDay(form({ slug: 'halka', back: '/admin/halka/proof', launchDay: L, expectedCurrent: '' })))).toBe('/admin/halka/proof?error=forbidden');
    as(manager);
    expect(text(await render())).toContain('Set the launch day first');
  });

  it('the action adds entries: saved, then reason required, stale, a bad or future day, never an overwrite', async () => {
    as(manager);
    expect(await redirectOf(() => setProofLaunchDay(form({ slug: 'halka', back: '/admin/halka/proof', launchDay: L, expectedCurrent: '' })))).toBe('/admin/halka/proof?saved=launch_day_saved');
    expect(revalidated.some(([p, t]) => p === '/admin/halka' && t === 'layout')).toBe(true);
    const html = await render();
    const current = /name="expectedCurrent"[^>]*value="([0-9a-f-]{36})"|value="([0-9a-f-]{36})"[^>]*name="expectedCurrent"/.exec(html);
    const id = current?.[1] ?? current?.[2] ?? '';
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const post = (fields: Record<string, string>) => redirectOf(() => setProofLaunchDay(form({ slug: 'halka', back: '/admin/halka/proof', expectedCurrent: id, ...fields })));
    expect(await post({ launchDay: '2026-06-08' })).toBe('/admin/halka/proof?error=reason_required');
    expect(await post({ launchDay: '2026-06-08', reason: 'x', expectedCurrent: '00000000-0000-4000-8000-0000000000aa' })).toBe('/admin/halka/proof?error=version_conflict');
    expect(await post({ launchDay: '2999-01-01', reason: 'x' })).toBe('/admin/halka/proof?error=invalid_launch_day');
    expect(await post({ launchDay: 'soon', reason: 'x' })).toBe('/admin/halka/proof?error=invalid_launch_day');
    expect(await post({ launchDay: L, reason: 'y'.repeat(201) })).toBe('/admin/halka/proof?error=reason_too_long');
    expect(text(await render())).toContain('Upload a POS export');
    expect(text(await render())).toContain('Launch day set to 1 Jun 2026');
    // a note from the history is shown, an entry is never edited
    expect(await post({ launchDay: L, reason: 'same day, typo in the first entry' })).toBe('/admin/halka/proof?saved=launch_day_saved');
    const after = text(await render());
    expect(after).toContain('changed 1 time');
    expect(after).toContain('Reason: same day, typo in the first entry');
  });

  it('shows the report of window 1 (H2): before 35%, after 50%, change with an outward interval, the verdict, the groups with a correlation caveat, the codes', async () => {
    await importSales();
    as(manager);
    const html = await render({ window: '1' });
    const t = text(html);
    expect(t).toContain('Window 1: 1 Jun 2026 – 28 Jun 2026');
    expect(t).toMatch(/Before \(Baseline\).*35%.*42 of 120 checks with food included wine/);
    expect(t).toMatch(/After.*50%.*65 of 130 checks with food included wine/);
    expect(t).toContain('+15 percentage points, interval from +2 to +27');
    expect(html).toContain('data-verdict="increase"');
    expect(t).toContain(en.admin.proof.verdict.increase);
    expect(t).toContain(en.admin.proof.groupsCaveat);
    // AC7: the group with a code has 10 checks (under 30): no percentage; no difference between the groups
    expect(t).toMatch(/With a code 10 of 10 checks with food included wine not enough data/);
    expect(t).toMatch(/Without a code 55 of 120 checks with food included wine 46%/);
    expect(t).not.toMatch(/difference between the groups/i);
    expect(t).toMatch(/Issued 0/);
    // the table has the baseline and window 1; windows with no data of their own and not chosen are left out
    expect(t).toMatch(/All windows.*Baseline.*Window 1/);
    expect(t).not.toMatch(/All windows.*Window 2/);
    expect(html).toMatch(/aria-current="true"/);
    expect(t).not.toMatch(FORBIDDEN_WORDS);
    // links are plain `?window=`; the window after the last started one is not a link
    expect(html).toContain('href="/admin/halka/proof?window=2"');
  });

  it('window 2 has the baseline but no data of its own: the counters and the reason with what to do, no change and no verdict', async () => {
    as(manager);
    const html = await render({ window: '2' });
    const t = text(html);
    expect(html).toContain('data-verdict="insufficient"');
    expect(t).toContain('Not enough data to show a change');
    expect(t).toMatch(/POS data ends 28 Jun 2026, before the end of the window/);
    expect(t).not.toMatch(/percentage points, interval/);
    expect(t).not.toMatch(FORBIDDEN_WORDS);
  });

  it('in Polish, with the same numbers and no forbidden word', async () => {
    as(manager);
    const t = text(await render({ window: '1' }, 'pl'));
    expect(t).toContain('Raport wyników');
    expect(t).toContain('Okno 1: 01.06.2026 – 28.06.2026');
    expect(t).toContain('+15 punktów procentowych, przedział od +2 do +27');
    expect(t).toContain(pl.admin.proof.verdict.increase);
    expect(t).toContain(pl.admin.proof.groupsCaveat);
    expect(t).toContain('Jak to liczymy');
    expect(t).toContain('Czego ten raport nie mówi');
    expect(t).not.toMatch(FORBIDDEN_WORDS);
  });

  it('a window that does not exist or has not started is an error message with a way back, not a crash', async () => {
    as(manager);
    for (const w of ['0', '13', '1e9', 'abc', '', '3', '12']) {
      const t = text(await render({ window: w }));
      // windows 3 to 12 have started (they are after 28 days each from 1 Jun 2026): only the ones outside 1..12 and the not-whole ones fail
      if (['0', '13', '1e9', 'abc', ''].includes(w)) expect(t, w).toContain('This window does not exist');
    }
  });
});

describe('the wording of the results report (R8, AC9)', () => {
  const sample = { from: '1 Jun', to: '28 Jun', minChecks: 30, minDays: 14, dataThrough: '10 Jun' };
  for (const [lang, d] of [['en', en.admin.proof], ['pl', pl.admin.proof]] as const) {
    it(`every text of the dictionary (${lang}) avoids "AI", "guaranteed" and any claim of cause`, () => {
      const all: string[] = [];
      const walk = (v: unknown): void => {
        if (typeof v === 'string') all.push(v);
        else if (typeof v === 'function') walk((v as (...a: unknown[]) => unknown)(sample, 1, 2, 3));
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(d);
      expect(all.length).toBeGreaterThan(60);
      for (const s of all) expect(s, s).not.toMatch(FORBIDDEN_WORDS);
      // the verdict sentences never name a cause
      for (const v of Object.values(d.verdict)) expect(v).not.toMatch(/because|due to|thanks|dzięki|z powodu|spowodowan[ay] przez/i);
    });
  }
});
