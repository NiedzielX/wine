import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HALKA, base, db, get, halkaManager, origin, send, snapshotDatabase, type Session } from './boundaries';

/**
 * docs/security/threat-model.md T-44: a purchase-cost column ("Cena zakupu netto") placed BEFORE the price column of an imported menu or
 * wine list is never read as a price. The whole real path on PostgreSQL over plain HTTP: upload, preview, confirm, publish, then what a guest
 * reads. The canary 7777,77 (the cost) must not appear in any answer, in `import_job.rows`, in the published snapshot, in a dish or wine row
 * or in the app log. The database is recorded first and put back at the end (the files share one database in sequence).
 */
const CANARY = '7777';
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../db/tests/fixtures/${name}`, import.meta.url)), 'utf8');
let tomasz: Session;
let restoreDatabase: (() => Promise<void>) | undefined;

type Job = { id: string; notes: string[]; rows: Array<{ include: boolean; fields: Record<string, string>; issues: unknown[] }> };
async function upload(kind: 'menu' | 'wines', name: string): Promise<{ status: number; text: string; job: Job }> {
  const form = new FormData();
  form.append('file', new File([fixture(name)], name, { type: 'text/csv' }));
  const res = await fetch(`${base()}/api/v1/imports/${kind}?restaurant=${HALKA}`, { method: 'POST', headers: { cookie: tomasz.cookie, 'x-csrf-token': tomasz.csrf, origin: origin() }, body: form });
  const text = await res.text();
  return { status: res.status, text, job: JSON.parse(text) as Job };
}

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  tomasz = await halkaManager();
}, 240_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('T-44: a cost column is never a price', () => {
  it('a menu and a wine list with "Cena zakupu netto" before the price column: the preview warns, the prices are the price column, and the cost reaches nobody', async () => {
    const menu = await upload('menu', 'menu-purchase-cost.csv');
    const wines = await upload('wines', 'wines-purchase-cost.csv');
    expect([menu.status, wines.status]).toEqual([201, 201]);
    // preview: the prices of the file, the column named as skipped, the cost nowhere
    expect(menu.job.rows.map((r) => r.fields.price)).toEqual(['36', '112']);
    expect(wines.job.rows.map((r) => [r.fields.bottlePrice, r.fields.glassPrice])).toEqual([['240', ''], ['220', '']]);
    for (const job of [menu.job, wines.job]) expect(job.notes).toContain('Cost columns skipped, never read as a price: Cena zakupu netto.');
    const preview = await (await get(tomasz, `/api/v1/imports/${menu.job.id}?restaurant=${HALKA}`)).text();
    const previewPage = await (await get(tomasz, `/admin/${HALKA}/import/menu?job=${menu.job.id}`)).text();
    expect(previewPage).toContain('Cena zakupu netto');
    for (const [what, body] of [['menu upload', menu.text], ['wines upload', wines.text], ['menu preview', preview], ['menu preview page', previewPage]] as const) expect(body, what).not.toContain(CANARY);
    expect((await queryDatabase<{ rows: string }>(db(), 'select rows::text as rows from import_job where id = any($1)', [[menu.job.id, wines.job.id]])).map((r) => r.rows).join('')).not.toContain(CANARY);

    // confirm: the stored dish and wine prices
    for (const job of [menu.job, wines.job]) expect((await send(tomasz, 'POST', `/api/v1/imports/${job.id}/confirm?restaurant=${HALKA}`, {})).status).toBe(200);
    const dishes = await queryDatabase<{ name: string; price: string }>(db(), "select name, price::text as price from dish where name in ('Tarta śliwkowa', 'Kaczka z wiśniami') order by name");
    expect(dishes.map((d) => [d.name, Number(d.price)])).toEqual([['Kaczka z wiśniami', 112], ['Tarta śliwkowa', 36]]);
    const stored = await queryDatabase<{ name: string; bottle: string }>(db(), "select name, bottle_price::text as bottle from wine where producer = 'Bodega Prueba' order by name");
    expect(stored.map((w) => [w.name, Number(w.bottle)])).toEqual([['Blanco de Prueba', 240], ['Tinto de Prueba', 220]]);

    // publish: what guests read is the price column, in the API and in the snapshot
    expect((await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/publish`)).status).toBe(201);
    const guestMenu = await (await fetch(`${base()}/api/v1/public/restaurants/${HALKA}/menu`)).text();
    const guestDishes = (JSON.parse(guestMenu) as { categories: Array<{ dishes: Array<{ id: string; name: string; price: number }> }> }).categories.flatMap((c) => c.dishes);
    expect(guestDishes.filter((d) => ['Tarta śliwkowa', 'Kaczka z wiśniami'].includes(d.name)).map((d) => [d.name, d.price]).sort()).toEqual([['Kaczka z wiśniami', 112], ['Tarta śliwkowa', 36]]);
    const guestPages = await Promise.all([`/r/${HALKA}`, `/r/${HALKA}/menu`, `/r/${HALKA}/dish/${guestDishes.find((d) => d.name === 'Tarta śliwkowa')!.id}`].map(async (p) => (await fetch(`${base()}${p}`)).text()));
    for (const [what, body] of [['guest menu', guestMenu], ...guestPages.map((b, i) => [`guest page ${i}`, b] as const)] as const) expect(body, what).not.toContain(CANARY);
    const snapshot = await queryDatabase<{ snapshot: string }>(db(), 'select snapshot::text as snapshot from published_version');
    expect(snapshot.length).toBeGreaterThan(0);
    expect(snapshot.map((s) => s.snapshot).join('')).not.toContain(CANARY);
    const costs = await queryDatabase<{ n: string }>(db(), "select count(*)::text as n from dish where price = 7777.77 or price > 7000");
    expect(costs[0]!.n).toBe('0');
    expect((await queryDatabase<{ n: string }>(db(), 'select count(*)::text as n from wine where bottle_price > 7000 or glass_price > 7000'))[0]!.n).toBe('0');

    // the app log: nothing of the cost
    const log = readFileSync(fileURLToPath(new URL('../../test-results/e2e-app.log', import.meta.url)), 'utf8');
    expect(log).not.toContain('7777,77');
    expect(log).not.toContain('7777.77');
  });
});
