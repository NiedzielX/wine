import { readFileSync } from 'node:fs';
import type { MemoryStore } from '@wine-match/core';
import { NextRequest } from 'next/server';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, describe, expect, it } from 'vitest';
import SalesPage from '@/app/(admin)/admin/[slug]/import/sales/page';
import * as imports from '@/app/(admin)/admin/[slug]/import-actions';
import { POST as importPost } from '@/app/api/v1/imports/[ref]/route';
import { POST as importConfirm } from '@/app/api/v1/imports/[ref]/confirm/route';
import { PATCH as importRows } from '@/app/api/v1/imports/[ref]/rows/route';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs } from './helpers';
import { explainIds } from './html';

/**
 * Spec 2026-10-15-pos-sales-import-attach-rate, phase 1, the app side: A13 rendered as the server sends it, the
 * import actions (form posts without JavaScript) and the API, with the real file parser and the memory store.
 * AC1, AC4, AC5, AC16 (action part).
 */

const URL0 = 'http://localhost:3000';
const fixture = (name: string) => readFileSync(new URL(`../../../db/tests/fixtures/${name}`, import.meta.url));
const state = () => (globalThis as unknown as {
  __wmNext: { headers: Map<string, string>; cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } };
}).__wmNext;
const form = (fields: Record<string, string | Blob>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (e) { if (e instanceof state().RedirectSignal) return e.url; throw e; }
  throw new Error('expected a redirect');
}
async function signIn(email: string) {
  const s = await loginAs(email);
  state().cookies.set(SESSION_COOKIE, s.token);
  return s;
}
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;
async function render(search: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(SalesPage as unknown as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
/** The memory store behind the container (to change a role after sign-in, and to count saved lines). */
async function store(): Promise<MemoryStore> {
  const scope = await createRequestScope();
  try { return (scope.cradle.authRepository as unknown as { store: MemoryStore }).store; } finally { await scope.dispose(); }
}
const upload = (cookie: string, csrf: string | undefined, name: string, bytes: Uint8Array, slug = 'halka') => {
  const body = new FormData();
  body.append('file', new File([bytes], name));
  const headers: Record<string, string> = { cookie };
  if (csrf) headers['x-csrf-token'] = csrf;
  return importPost(new NextRequest(`${URL0}/api/v1/imports/sales?restaurant=${slug}`, { method: 'POST', body, headers }), { params: Promise.resolve({ ref: 'sales' }) });
};

afterEach(async () => {
  // a test that changed a role puts it back
  for (const m of (await store()).memberships) if (m.role === 'waiter' && m.restaurantSlug === 'halka' && m.userId !== (await store()).users.find((u) => u.email === 'kelner@halka.pl')?.id) m.role = 'manager';
});

describe('A13 Import sales, server-rendered', () => {
  it('shows the upload step with the sales hint, one explanation and a link to the sample (en and pl)', async () => {
    await signIn('tomasz@halka.pl');
    const html = await render();
    expect(html).toContain('Import sales');
    expect(html).toContain('Use the business day column, not a time stamp.');
    expect(html).toContain('/api/v1/import-samples/sales');
    expect(explainIds(html)).toEqual(['sales']);
    expect(html).not.toContain('application/pdf');
    const pl = await render({}, 'pl');
    expect(pl).toContain('Import sprzedaży');
    expect(pl).toContain('Jak liczony jest plik?');
  });

  it('upload → preview (summary, unrecognised categories, nothing saved) → one decision → confirm, all as form posts (AC1, AC16)', async () => {
    await signIn('tomasz@halka.pl');
    const before = (await store()).salesLines.length;
    const up = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'sales', back: '/admin/halka/import/sales', file: new File([fixture('sales-pos.xlsx')], 'sales-pos.xlsx') })));
    expect(up).toMatch(/^\/admin\/halka\/import\/sales\?job=[0-9a-f-]{36}&saved=import_uploaded$/);
    const job = new URL(up, URL0).searchParams.get('job')!;
    expect((await store()).salesLines.length).toBe(before);
    const html = await render({ job });
    expect(html).toContain('data-sales-summary');
    expect(html).toContain('Unrecognised categories');
    expect(html).toContain('name="typemap_0_from" value="Wina białe"');
    expect(html).toContain('Wina białe (choose a type)');
    expect(html).not.toContain('Gość VIP');
    expect(html).toContain('Columns not used: Brutto, Kelner, Nazwa klienta.');

    // "Check again" with the type chosen once: all 40 lines are fixed and ticked
    const rows = Array.from({ length: 61 }, (_, i) => String(i + 1)).join(',');
    // a browser sends the tick of every ticked row; the unrecognised lines are unticked
    const ticked = Object.fromEntries(Array.from({ length: 61 }, (_, i) => i + 1).filter((n) => n % 3 === 1 || n === 61).map((n) => [`row_${n}_include`, 'on']));
    const checked = await redirectOf(() => imports.saveImportRows(form({ slug: 'halka', kind: 'sales', back: '/admin/halka/import/sales', job, rows, ...ticked, typemap_0_from: 'Wina białe', typemap_0_to: 'wine_bottle' })));
    expect(checked).toContain('saved=import_checked');
    const scope = await createRequestScope();
    const after = await scope.cradle.importService.get('halka', job);
    await scope.dispose();
    expect(after.rows.filter((r) => r.include).length).toBe(61);
    const again = await render({ job });
    expect(again).not.toContain('Unrecognised categories');
    expect(again).toMatch(/data-attach-rate[^>]*>100\.0%/);

    // the form sends every row as it is; the import saves all 61 lines
    const fields: Record<string, string> = { slug: 'halka', kind: 'sales', back: '/admin/halka/import/sales', job, rows };
    for (const r of after.rows) { fields[`row_${r.rowNumber}_itemType`] = r.fields.itemType; fields[`row_${r.rowNumber}_include`] = 'on'; }
    const done = await redirectOf(() => imports.confirmImport(form(fields)));
    expect(done).toBe(`/admin/halka/import/sales?job=${job}&saved=imported_sales&n=61-0-0`);
    expect((await store()).salesLines.length).toBe(before + 61);
    const result = await render({ job, saved: 'imported_sales', n: '61-0-0' });
    expect(result).toContain('Saved 61 lines, replaced 0 checks, skipped 0.');
    expect(result).toContain('Replaced checks');
  });

  it('a file without the net amount column names the missing column; a file over 10 MB is refused (AC5, AC14)', async () => {
    await signIn('tomasz@halka.pl');
    const bad = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'sales', file: new File(['Data;Rachunek;Kategoria;Ilość;Brutto\n2026-10-14;1;Kuchnia;1;10\n'], 'gross.csv') })));
    expect(bad).toBe('/admin/halka/import/sales?error=no_header&n=netAmount');
    expect(await render({ error: 'no_header', n: 'netAmount' })).toContain('Could not find the columns: net amount.');
    expect(await render({ error: 'no_header', n: 'netAmount' }, 'pl')).toContain('Nie znaleziono kolumn: kwota netto.');
    // an unknown name in the URL is not shown
    expect(await render({ error: 'no_header', n: '<script>' })).not.toContain('&lt;script&gt;');
    const big = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'sales', file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.csv') })));
    expect(big).toBe('/admin/halka/import/sales?error=file_too_large');
  });
});

describe('who may import sales (AC4, R11)', () => {
  it('the API: no session 401; without the CSRF token, a role without import.manage and another restaurant 403; nothing saved', async () => {
    const lines = (await store()).salesLines.length;
    const jobs = (await store()).importJobs.length;
    const csv = new Uint8Array(fixture('sales-pos.csv'));
    expect((await upload('', undefined, 'sales-pos.csv', csv)).status).toBe(401);
    // a waiter cannot sign in to the dashboard at all
    await expect(loginAs('kelner@halka.pl')).rejects.toThrow();
    const s = await loginAs('tomasz@halka.pl');
    expect((await upload(s.cookie, undefined, 'sales-pos.csv', csv)).status).toBe(403);
    expect((await upload(s.cookie, s.csrf, 'sales-pos.csv', csv, 'other-place')).status).toBe(403);
    // the role changed to one without import.manage after sign-in: refused on the next request
    const st = await store();
    const tomasz = st.users.find((u) => u.email === 'tomasz@halka.pl')!;
    const membership = st.memberships.find((m) => m.userId === tomasz.id && m.restaurantSlug === 'halka')!;
    membership.role = 'waiter';
    const refused = await upload(s.cookie, s.csrf, 'sales-pos.csv', csv);
    expect(refused.status).toBe(403);
    membership.role = 'manager';
    expect((await store()).salesLines.length).toBe(lines);
    expect((await store()).importJobs.length).toBe(jobs);
  });

  it('the panel action: a role without import.manage and another restaurant are refused; nothing saved', async () => {
    const s = await signIn('tomasz@halka.pl');
    const st = await store();
    const membership = st.memberships.find((m) => m.userId === st.users.find((u) => u.email === 'tomasz@halka.pl')!.id && m.restaurantSlug === 'halka')!;
    const jobs = st.importJobs.length;
    membership.role = 'waiter';
    const refused = await redirectOf(() => imports.uploadImport(form({ slug: 'halka', kind: 'sales', back: '/admin/halka/import/sales', file: new File([fixture('sales-pos.csv')], 'sales-pos.csv') })));
    membership.role = 'manager';
    expect(refused).toMatch(/error=forbidden|error=no_panel_access/);
    expect(await redirectOf(() => imports.uploadImport(form({ slug: 'other-place', kind: 'sales', file: new File([fixture('sales-pos.csv')], 'sales-pos.csv') })))).toMatch(/error=forbidden/);
    expect((await store()).importJobs.length).toBe(jobs);
    void s;
  });

  it('the API flow: upload 201, a value map through PATCH, confirm with `replaced`; a file over 10 MB is 422 (AC5)', async () => {
    const s = await loginAs('marta@halka.pl');
    const big = await upload(s.cookie, s.csrf, 'big.csv', new Uint8Array(10 * 1024 * 1024 + 1));
    expect(big.status).toBe(422);
    expect(((await big.json()) as { error: { code: string } }).error.code).toBe('file_too_large');
    const pdf = await upload(s.cookie, s.csrf, 'menu.pdf', new Uint8Array(fixture('menu.pdf')));
    expect(((await pdf.json()) as { error: { code: string } }).error.code).toBe('unsupported_format');
    const created = await upload(s.cookie, s.csrf, 'sales-pos.xlsx', new Uint8Array(fixture('sales-pos.xlsx')));
    expect(created.status).toBe(201);
    const job = (await created.json()) as { id: string; kind: string; summary: { total: number; included: number } };
    expect(job).toMatchObject({ kind: 'sales', summary: { total: 61, included: 21 } });
    const h = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    const p = { params: Promise.resolve({ ref: job.id }) };
    const bad = await importRows(jsonReq(`${URL0}/x?restaurant=halka`, { rows: [], valueMap: [{ field: 'itemType', from: 'Wina białe', to: 'beer' }] }, 'PATCH', h), p);
    expect(bad.status).toBe(422);
    const mapped = await importRows(jsonReq(`${URL0}/x?restaurant=halka`, { rows: [], valueMap: [{ field: 'itemType', from: 'wina białe', to: 'wine_bottle' }] }, 'PATCH', h), p);
    expect(((await mapped.json()) as { summary: { included: number } }).summary.included).toBe(61);
    const confirmed = await importConfirm(jsonReq(`${URL0}/x?restaurant=halka`, {}, 'POST', h), p);
    expect(await confirmed.json()).toEqual({ created: 61, updated: 0, skipped: 0, suggestions: 0, replaced: 21 });
  });
});
