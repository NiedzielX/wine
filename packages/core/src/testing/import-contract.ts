import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { Dish, Pairing, Wine } from '../domain/types';
import { InvariantError, NotFoundError } from '../errors';
import type { ImportJob, ImportRow } from '../import/types';
import type { CatalogImportPlan, SalesImportPlan } from '../ports/import';
import type { SalesRecord } from '../services/sales/types';
import type { Repositories } from '../ports/repositories';

/**
 * Behaviour every ImportRepository must have (memory and PostgreSQL): jobs are scoped to their
 * restaurant, only an open job can change, and `confirm` is atomic and can happen only once.
 */

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(900000 + ++n).padStart(12, '0')}`;
const AT = '2026-10-14T12:00:00.000Z';

export function importContract(name: string, setup: () => Promise<{ repos: Repositories; dataset: DemoDataset }>, t: ContractRunner): void {
  t.describe(`import contract: ${name}`, () => {
    let repos: Repositories;
    let ds: DemoDataset;
    t.beforeEach(async () => { ({ repos, dataset: ds } = await setup()); });
    const rid = () => ds.restaurant.id;
    const OTHER = '00000000-0000-4000-8000-00000000dead';

    const rows = (): ImportRow[] => [
      { rowNumber: 1, fields: { name: 'Plum tart', price: '36' }, include: true, action: 'create', matchId: null, issues: [] },
      { rowNumber: 2, fields: { name: 'Pie', price: '' }, include: false, action: 'create', matchId: null, issues: [{ level: 'error', field: 'price', message: 'Price is missing.' }] }
    ];
    const job = (over: Partial<ImportJob> = {}): ImportJob => ({
      id: uuid(), restaurantId: rid(), kind: 'menu', fileName: 'menu.xlsx', fileType: 'xlsx', fileSize: 5123, status: 'preview_ready', parser: 'xlsx', rows: rows(),
      notes: ['No category column.'], error: null, createdBy: 'Marta Wierzbicka', createdAt: '2026-10-14T10:00:00.000Z', confirmedAt: null, result: null, ...over
    });
    const dish = (over: Partial<Dish> = {}): Dish => ({ ...structuredClone(ds.dishes[0]), id: uuid(), name: 'Plum tart', category: 'Desserts', price: 36, status: 'draft', ...over });
    const wine = (over: Partial<Wine> = {}): Wine => ({ ...structuredClone(ds.wines[0]), id: uuid(), producer: 'Weingut Keller', name: 'Riesling trocken', vintage: 2022, listNumber: 500, active: true, ...over });
    const pairing = (dishId: string, wineId: string): Pairing => ({
      id: uuid(), dishId, wineId, status: 'suggested', role: null, rank: null, comment: null, commentTranslations: {}, modelScore: 81, source: 'engine', updatedBy: 'Wine Match engine', updatedAt: AT, dirty: false
    });
    const plan = (over: Partial<CatalogImportPlan> = {}): CatalogImportPlan => ({ kind: 'catalog', newDishes: [], dishUpdates: [], newWines: [], wineUpdates: [], newPairings: [], result: { created: 0, updated: 0, skipped: 0, suggestions: 0 }, ...over });
    const salesLine = (businessDate: string, checkId: string, over: Partial<SalesRecord> = {}): SalesRecord =>
      ({ id: uuid(), businessDate, checkId, covers: 2, itemType: 'food', quantity: 1, netAmount: 50, recommendationCode: null, ...over });
    const salesPlan = (records: SalesRecord[]): SalesImportPlan => ({
      kind: 'sales', records, checks: [...new Map(records.map((r) => [`${r.businessDate}|${r.checkId}`, { businessDate: r.businessDate, checkId: r.checkId }])).values()],
      result: { created: records.length, updated: 0, skipped: 0, suggestions: 0 }
    });
    const salesJob = () => job({ kind: 'sales', fileName: 'sales.csv', fileType: 'csv', parser: 'csv', rows: [] });

    t.it('stores a job and reads it back whole, only for its own restaurant', async () => {
      const j = job();
      await repos.importRepository.create(j);
      t.expect(await repos.importRepository.find(rid(), j.id)).toEqual(j);
      t.expect(await repos.importRepository.find(OTHER, j.id)).toBeNull();
      t.expect(await repos.importRepository.find(rid(), uuid())).toBeNull();
    });

    t.it('lists the newest jobs first and only those of the restaurant', async () => {
      const a = job({ createdAt: '2026-10-14T10:00:00.000Z' });
      const b = job({ createdAt: '2026-10-14T11:00:00.000Z' });
      await repos.importRepository.create(a);
      await repos.importRepository.create(b);
      t.expect((await repos.importRepository.listRecent(rid(), 10)).map((x) => x.id)).toEqual([b.id, a.id]);
      t.expect(await repos.importRepository.listRecent(OTHER, 10)).toEqual([]);
      t.expect((await repos.importRepository.listRecent(rid(), 1)).length).toBe(1);
    });

    t.it('replaces the rows of an open job, and refuses once the job is closed', async () => {
      const j = job();
      await repos.importRepository.create(j);
      const edited = rows().map((r) => ({ ...r, include: !r.include }));
      t.expect(await repos.importRepository.saveRows(rid(), j.id, edited)).toBe(true);
      t.expect((await repos.importRepository.find(rid(), j.id))!.rows).toEqual(edited);
      t.expect(await repos.importRepository.saveRows(OTHER, j.id, rows())).toBe(false);
      t.expect(await repos.importRepository.cancel(rid(), j.id)).toBe(true);
      t.expect(await repos.importRepository.cancel(rid(), j.id)).toBe(false);
      t.expect(await repos.importRepository.saveRows(rid(), j.id, rows())).toBe(false);
      t.expect((await repos.importRepository.find(rid(), j.id))!.status).toBe('cancelled');
    });

    t.it('confirm applies the whole plan and closes the job with its result and time', async () => {
      const j = job();
      await repos.importRepository.create(j);
      const newDish = dish();
      const newWine = wine();
      const existingDish = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const existingWine = ds.wines.find((w) => w.name === 'Morgon')!;
      const p = plan({
        newDishes: [newDish], newWines: [newWine],
        dishUpdates: [{ id: existingDish.id, description: 'New text', category: 'Starters', price: 99 }],
        wineUpdates: [{ id: existingWine.id, glassPrice: null, bottlePrice: 999 }],
        newPairings: [pairing(newDish.id, newWine.id), pairing(newDish.id, existingWine.id)],
        result: { created: 2, updated: 2, skipped: 1, suggestions: 2 }
      });
      await repos.importRepository.confirm(rid(), j.id, p, AT);

      const dishBack = (await repos.dishRepository.findById(rid(), newDish.id))!;
      t.expect(dishBack).toMatchObject({ name: 'Plum tart', status: 'draft', price: 36, category: 'Desserts' });
      t.expect(dishBack.profile).toEqual(newDish.profile);
      t.expect(await repos.wineRepository.findById(rid(), newWine.id)).toMatchObject({ producer: 'Weingut Keller', vintage: 2022, active: true, listNumber: 500, bottlePrice: newWine.bottlePrice });
      t.expect(await repos.dishRepository.findById(rid(), existingDish.id)).toMatchObject({ description: 'New text', category: 'Starters', price: 99, status: existingDish.status });
      t.expect(await repos.wineRepository.findById(rid(), existingWine.id)).toMatchObject({ glassPrice: null, bottlePrice: 999 });
      const made = (await repos.pairingRepository.listByDish(rid(), newDish.id));
      t.expect(made.length).toBe(2);
      t.expect(made.every((m) => m.status === 'suggested' && m.source === 'engine' && m.dirty === false && m.role === null)).toBe(true);
      t.expect(await repos.importRepository.find(rid(), j.id)).toMatchObject({ status: 'confirmed', confirmedAt: AT, result: p.result });
      // the new dish goes at the end of the menu
      const all = await repos.dishRepository.listByRestaurant(rid());
      t.expect(all[all.length - 1].id).toBe(newDish.id);
    });

    t.it('confirm writes translations of new and updated dishes and wines (spec 2026-10-15-bilingual-content, R5)', async () => {
      const j = job();
      await repos.importRepository.create(j);
      const newDish = dish({ translations: { pl: { name: 'Tarta śliwkowa' } } });
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const morgon = ds.wines.find((w) => w.name === 'Morgon')!;
      await repos.importRepository.confirm(rid(), j.id, plan({
        newDishes: [newDish],
        dishUpdates: [{ id: duck.id, description: duck.description, category: duck.category, price: duck.price, translations: { pl: { name: 'Kaczka', description: 'Nowy opis' }, en: { name: 'Duck' } } }],
        wineUpdates: [{ id: morgon.id, glassPrice: morgon.glassPrice, bottlePrice: morgon.bottlePrice, translations: { pl: { region: 'Beaujolais (PL)' } } }]
      }), AT);
      t.expect((await repos.dishRepository.findById(rid(), newDish.id))!.translations).toEqual({ pl: { name: 'Tarta śliwkowa' } });
      t.expect((await repos.dishRepository.findById(rid(), duck.id))!.translations).toEqual({ pl: { name: 'Kaczka', description: 'Nowy opis' }, en: { name: 'Duck' } });
      t.expect((await repos.wineRepository.findById(rid(), morgon.id))!.translations).toEqual({ pl: { region: 'Beaujolais (PL)' } });
      // an update without translations keeps them
      const k = job();
      await repos.importRepository.create(k);
      await repos.importRepository.confirm(rid(), k.id, plan({ dishUpdates: [{ id: duck.id, description: 'x', category: duck.category, price: duck.price }] }), AT);
      t.expect((await repos.dishRepository.findById(rid(), duck.id))!.translations).toEqual({ pl: { name: 'Kaczka', description: 'Nowy opis' }, en: { name: 'Duck' } });
    });

    t.it('confirm works once: a second confirm of the same job is refused and changes nothing', async () => {
      const j = job();
      await repos.importRepository.create(j);
      const d = dish();
      await repos.importRepository.confirm(rid(), j.id, plan({ newDishes: [d] }), AT);
      const count = (await repos.dishRepository.listByRestaurant(rid())).length;
      await t.expect(repos.importRepository.confirm(rid(), j.id, plan({ newDishes: [dish()] }), AT)).rejects.toBeInstanceOf(InvariantError);
      t.expect((await repos.dishRepository.listByRestaurant(rid())).length).toBe(count);
      const c = job();
      await repos.importRepository.create(c);
      await repos.importRepository.cancel(rid(), c.id);
      await t.expect(repos.importRepository.confirm(rid(), c.id, plan(), AT)).rejects.toBeInstanceOf(InvariantError);
    });

    t.it('confirm is all or nothing: a broken plan leaves the data and the open job untouched', async () => {
      const j = job();
      await repos.importRepository.create(j);
      const d = dish();
      const w = wine();
      // two suggestions for the same dish and wine break the unique pair rule after the dish and wine are written
      const broken = plan({ newDishes: [d], newWines: [w], newPairings: [pairing(d.id, w.id), pairing(d.id, w.id)] });
      await t.expect(repos.importRepository.confirm(rid(), j.id, broken, AT)).rejects.toBeInstanceOf(InvariantError);
      t.expect(await repos.dishRepository.findById(rid(), d.id)).toBeNull();
      t.expect(await repos.wineRepository.findById(rid(), w.id)).toBeNull();
      t.expect((await repos.importRepository.find(rid(), j.id))!.status).toBe('preview_ready');
      // an update of something that does not exist is refused too
      await t.expect(repos.importRepository.confirm(rid(), j.id, plan({ newDishes: [dish()], dishUpdates: [{ id: uuid(), description: '', category: 'Mains', price: 1 }] }), AT)).rejects.toBeInstanceOf(NotFoundError);
      t.expect((await repos.dishRepository.listByRestaurant(rid())).length).toBe(ds.dishes.length);
    });

    /* ---- sales (spec 2026-10-15-pos-sales-import-attach-rate, R7, AC3, AC13) ---- */

    t.it('a sales confirm saves the lines, closes the job and replaces nothing the first time', async () => {
      const j = salesJob();
      await repos.importRepository.create(j);
      const p = salesPlan([salesLine('2026-10-01', '101'), salesLine('2026-10-01', '101', { itemType: 'wine_bottle', netAmount: 180, covers: null }), salesLine('2026-10-02', '7')]);
      t.expect(await repos.importRepository.confirm(rid(), j.id, p, AT)).toEqual({ replacedChecks: 0 });
      t.expect(await repos.importRepository.find(rid(), j.id)).toMatchObject({ status: 'confirmed', confirmedAt: AT, result: { ...p.result, replaced: 0 } });
      const totals = await repos.salesRepository.checkTotals(rid(), { from: '2026-10-01', to: '2026-10-02' });
      t.expect(totals.map((c) => [c.businessDate, c.checkId, c.foodQuantity, c.bottleAmount, c.covers])).toEqual([['2026-10-01', '101', 1, 180, 2], ['2026-10-02', '7', 1, 0, 2]]);
    });

    t.it('the same file confirmed twice: the second replaces its checks, the active lines do not double (AC3)', async () => {
      const lines = () => [salesLine('2026-10-03', '1'), salesLine('2026-10-03', '1', { itemType: 'wine_glass', quantity: 2, netAmount: 64 }), salesLine('2026-10-03', '2')];
      const a = salesJob();
      await repos.importRepository.create(a);
      await repos.importRepository.confirm(rid(), a.id, salesPlan(lines()), AT);
      const before = await repos.salesRepository.checkTotals(rid(), { from: '2026-10-03', to: '2026-10-03' });
      const b = salesJob();
      await repos.importRepository.create(b);
      t.expect(await repos.importRepository.confirm(rid(), b.id, salesPlan(lines()), AT)).toEqual({ replacedChecks: 2 });
      t.expect(await repos.salesRepository.checkTotals(rid(), { from: '2026-10-03', to: '2026-10-03' })).toEqual(before);
      t.expect((await repos.importRepository.find(rid(), b.id))!.result).toMatchObject({ created: 3, replaced: 2 });
    });

    t.it('a sales confirm is refused for a closed job, an unknown job and another restaurant’s job, and changes nothing', async () => {
      const j = salesJob();
      await repos.importRepository.create(j);
      await repos.importRepository.cancel(rid(), j.id);
      await t.expect(repos.importRepository.confirm(rid(), j.id, salesPlan([salesLine('2026-10-04', '9')]), AT)).rejects.toBeInstanceOf(InvariantError);
      const k = salesJob();
      await repos.importRepository.create(k);
      await t.expect(repos.importRepository.confirm(OTHER, k.id, salesPlan([salesLine('2026-10-04', '9')]), AT)).rejects.toBeInstanceOf(NotFoundError);
      await t.expect(repos.importRepository.confirm(rid(), uuid(), salesPlan([salesLine('2026-10-04', '9')]), AT)).rejects.toBeInstanceOf(NotFoundError);
      t.expect(await repos.salesRepository.checkTotals(rid(), { from: '2026-10-04', to: '2026-10-04' })).toEqual([]);
      t.expect(await repos.salesRepository.checkTotals(OTHER, { from: '2026-10-04', to: '2026-10-04' })).toEqual([]);
      t.expect((await repos.importRepository.find(rid(), k.id))!.status).toBe('preview_ready');
    });

    t.it('a sales confirm of one restaurant never replaces another restaurant’s checks', async () => {
      const j = salesJob();
      await repos.importRepository.create(j);
      await repos.importRepository.confirm(rid(), j.id, salesPlan([salesLine('2026-10-05', '1')]), AT);
      t.expect(await repos.salesRepository.countChecks(OTHER, [{ businessDate: '2026-10-05', checkId: '1' }])).toBe(0);
      t.expect(await repos.salesRepository.countChecks(rid(), [{ businessDate: '2026-10-05', checkId: '1' }])).toBe(1);
    });

    t.it('confirm refuses an unknown job or another restaurant’s job', async () => {
      const j = job();
      await repos.importRepository.create(j);
      await t.expect(repos.importRepository.confirm(rid(), uuid(), plan(), AT)).rejects.toBeInstanceOf(NotFoundError);
      await t.expect(repos.importRepository.confirm(OTHER, j.id, plan(), AT)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
}
