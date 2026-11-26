import type { MemoryStore } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import ProofPrintPage from '@/app/(admin)/admin/[slug]/proof/print/page';
import { setProofLaunchDay } from '@/app/(admin)/admin/[slug]/proof-actions';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs } from './helpers';

/**
 * Spec 2026-11-18-owner-proof-report, step 7 (A34, R13, AC16 server part): the printable report as the server sends it. The same
 * numbers as A33, the "Ctrl/Cmd+P" line always there, no print button without a script, nothing that loads from outside, the date on
 * the paper from the POS data, and 403 for the Wine Director. The first test starts from a restaurant without a launch day.
 */
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

type NextState = { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } };
const state = () => (globalThis as unknown as { __wmNext: NextState }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[]>> }>;

async function render(search: Record<string, string | string[]> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(ProofPrintPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
const text = (h: string) => h.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
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

async function importSales() {
  const scope = await createRequestScope();
  const s = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
  await scope.dispose();
  const restaurantId = s.restaurants.find((r) => r.slug === 'halka')!.id;
  let n = 0;
  const add = (day: string, check: string, itemType: 'food' | 'wine_bottle') =>
    s.salesLines.push({ id: `5a1e7000-0000-4000-8000-${String(++n).padStart(12, '0')}`, businessDate: day, checkId: check, covers: 2, itemType, quantity: 1, netAmount: 100, recommendationCode: null, restaurantId, importJobId: 'job', replacedAt: null, replacedByJobId: null });
  const day = (offset: number) => new Date(Date.parse(`${L}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  for (let j = 0; j < 120; j++) { add(day(-28 + (j % 28)), `B${j}`, 'food'); if (j < 42) add(day(-28 + (j % 28)), `B${j}`, 'wine_bottle'); }
  for (let j = 0; j < 130; j++) { add(day(j % 28), `W${j}`, 'food'); if (j < 65) add(day(j % 28), `W${j}`, 'wine_bottle'); }
}

beforeAll(async () => {
  manager = (await loginAs('tomasz@halka.pl')).token;
  sommelier = (await loginAs('marta@halka.pl')).token;
});

describe('A34 printable results report', () => {
  it('without a launch day it says so and links back; the Wine Director gets 403', async () => {
    as(manager);
    const t = text(await render());
    expect(t).toContain('The launch day has not been set');
    expect(t).toContain('Back to the report');
    as(sommelier);
    await expect(render()).rejects.toMatchObject({ name: 'ForbiddenSignal' });
  });

  it('prints window 1: the numbers of A33, the date from the data, the Ctrl/Cmd+P line, no print button without a script, nothing from outside', async () => {
    as(manager);
    expect(await redirectOf(() => setProofLaunchDay(form({ slug: 'halka', back: '/admin/halka/proof', launchDay: L, expectedCurrent: '' })))).toContain('saved=launch_day_saved');
    await importSales();
    const html = await render({ window: '1' });
    const t = text(html);
    expect(html).toContain('>Results report: Halka</h1>');
    expect(t).toContain('Window 1: 1 Jun 2026 – 28 Jun 2026');
    expect(t).toContain('POS data through 28 Jun 2026.');
    expect(t).toMatch(/Before \(Baseline\).*35%.*42 of 120 checks with food included wine/);
    expect(t).toMatch(/After.*50%.*65 of 130 checks with food included wine/);
    expect(t).toContain('+15 percentage points, interval from +2 to +27');
    expect(t).toMatch(/All windows.*Baseline.*Window 1/);
    expect(t).toContain('This is a comparison, not proof of a cause.');
    expect(t).toContain('How we calculate');
    expect(t).toContain('What this report does not say');
    // R13: the line is always there, the button only with a script; the controls are hidden on paper
    expect(t).toContain('To print or save as PDF, use Ctrl/Cmd+P.');
    expect(html).not.toContain('data-print-button');
    expect(html).toMatch(/<div[^>]*print:hidden[^>]*data-print-controls|<div[^>]*data-print-controls[^>]*print:hidden/);
    // no form, no input and no link to the launch day on paper
    expect(html).not.toMatch(/<form|<input|name="launchDay"/);
    // nothing loads from outside (no absolute address in an attribute that fetches)
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toMatch(/<link[^>]*stylesheet[^>]*https?:/);
    expect(t).not.toMatch(FORBIDDEN_WORDS);
  });

  it('in Polish, with the same numbers and no forbidden word', async () => {
    as(manager);
    const t = text(await render({ window: '1' }, 'pl'));
    expect(t).toContain('Raport wyników: Halka');
    expect(t).toContain('Dane POS do dnia 28.06.2026.');
    expect(t).toContain('Aby wydrukować lub zapisać jako PDF, użyj Ctrl/Cmd+P.');
    expect(t).toContain('+15 punktów procentowych, przedział od +2 do +27');
    expect(t).not.toMatch(FORBIDDEN_WORDS);
  });

  it('a window that does not exist is an error message, not a crash', async () => {
    as(manager);
    for (const w of ['0', '13', 'abc']) expect(text(await render({ window: w })), w).toContain('This window does not exist');
  });
});
