import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { Dish, Pairing, Wine } from '../domain/types';
import { InvariantError, NotFoundError } from '../errors';
import type { ImportJob, ImportRow } from '../import/types';
import type { ImportPlan } from '../ports/import';
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
      id: uuid(), dishId, wineId, status: 'suggested', role: null, rank: null, comment: null, modelScore: 81, source: 'engine', updatedBy: 'Wine Match engine', updatedAt: AT, dirty: false
    });
    const plan = (over: Partial<ImportPlan> = {}): ImportPlan => ({ newDishes: [], dishUpdates: [], newWines: [], wineUpdates: [], newPairings: [], result: { created: 0, updated: 0, skipped: 0, suggestions: 0 }, ...over });

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

    t.it('confirm refuses an unknown job or another restaurant’s job', async () => {
      const j = job();
      await repos.importRepository.create(j);
      await t.expect(repos.importRepository.confirm(rid(), uuid(), plan(), AT)).rejects.toBeInstanceOf(NotFoundError);
      await t.expect(repos.importRepository.confirm(OTHER, j.id, plan(), AT)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
}
