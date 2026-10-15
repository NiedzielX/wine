import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { pairingScore } from '../src/engine/scoring';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { AdminService } from '../src/services/dashboard/admin-service';

const ds = buildDemoDataset({ ids: 'uuid' });
const svc = (data = ds) => new AdminService(createMemoryRepositories(MemoryStore.from(data)));
const dish = (name: string) => ds.dishes.find((d) => d.name === name)!;
const wine = (name: string) => ds.wines.find((w) => w.name === name)!;

describe('AdminService.overview', () => {
  it('counts the catalog the way the dashboard shows it', async () => {
    const o = (await svc().overview('halka'))!;
    expect(o.dishes).toEqual({ total: 15, published: 14, draft: 1, hidden: 0, draftProfiles: 4 });
    expect(o.wines).toEqual({ total: 20, active: 19, inactive: 1, byGlass: 14 });
    expect(o.pairings.approved + o.pairings.suggested + o.pairings.rejected).toBe(ds.pairings.length);
    expect(o.pairings.rejected).toBe(1);
  });

  it('knows which published dishes have no sommelier primary', async () => {
    const o = (await svc().overview('halka'))!;
    expect(o.primaryCoverage.published).toBe(14);
    expect(o.primaryCoverage.withPrimary + o.primaryCoverage.without.length).toBe(14);
    expect(o.primaryCoverage.without.map((d) => d.name)).toContain('Glazed pork belly');
    expect(o.primaryCoverage.without.map((d) => d.name)).not.toContain('Duck breast');
  });

  it('reports review progress and returns null for an unknown restaurant', async () => {
    const o = (await svc().overview('halka'))!;
    expect(o.review.suggestions).toBe(o.pairings.suggested);
    expect(o.review.reviewedDishes).toBeLessThanOrEqual(o.review.dishesWithPairings);
    expect(await svc().overview('nope')).toBeNull();
  });
});

describe('AdminService.menu', () => {
  it('lists every dish including drafts, with pairing coverage', async () => {
    const m = (await svc().menu('halka'))!;
    expect(m.rows.length).toBe(15);
    expect(m.categories.sort()).toEqual(['Desserts', 'Mains', 'Starters']);
    const duck = m.rows.find((r) => r.dish.name === 'Duck breast')!;
    expect(duck.hasPrimary).toBe(true);
    expect(duck.approved).toBe(2);
    expect(duck.suggested).toBeGreaterThan(0);
  });

  it('filters by text (name and description, case-insensitive) and by category', async () => {
    expect((await svc().menu('halka', { q: 'PORCINI' }))!.rows.map((r) => r.dish.name)).toEqual(['Wild mushroom risotto']);
    expect((await svc().menu('halka', { category: 'Desserts' }))!.rows.length).toBe(3);
    expect((await svc().menu('halka', { q: 'chocolate', category: 'Mains' }))!.rows).toEqual([]);
    expect((await svc().menu('halka', { q: 'zzz' }))!.total).toBe(15);
  });
});

describe('AdminService.dishDetail', () => {
  it('ranks the five best active wines for the dish profile with the engine explanation', async () => {
    const d = (await svc().dishDetail('halka', dish('Duck breast').id))!;
    expect(d.topMatches).toHaveLength(5);
    expect(d.topMatches.every((m) => m.wine.active)).toBe(true);
    expect(d.topMatches.map((m) => m.score)).toEqual([...d.topMatches.map((m) => m.score)].sort((a, b) => b - a));
    expect(d.topMatches[0].score).toBe(pairingScore(dish('Duck breast'), d.topMatches[0].wine).score);
    expect(d.pairings.hasPrimary).toBe(true);
  });

  it('shows draft dishes too, and returns null for unknown dishes', async () => {
    const draft = ds.dishes.find((x) => x.status === 'draft')!;
    expect((await svc().dishDetail('halka', draft.id))!.dish.status).toBe('draft');
    expect(await svc().dishDetail('halka', '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('AdminService.wines / wineDetail', () => {
  it('lists wines including inactive ones and filters by style and text', async () => {
    const all = (await svc().wines('halka'))!;
    expect(all.rows.length).toBe(20);
    expect(all.active).toBe(19);
    expect(all.rows.find((r) => r.wine.name === 'Hochar Père et Fils')!.wine.active).toBe(false);
    expect((await svc().wines('halka', { style: 'sweet' }))!.rows.map((r) => r.wine.name).sort()).toEqual(['20 Year Old Tawny Port', '5 Puttonyos Aszú']);
    expect((await svc().wines('halka', { q: 'pinot noir' }))!.rows.length).toBe(2);
    expect((await svc().wines('halka', { q: 'Burgundy', style: 'red' }))!.rows.map((r) => r.wine.name)).toEqual(['Savigny-lès-Beaune']);
  });

  it('ranks the dishes a wine suits best, never hidden ones, and lists its approved pairings', async () => {
    const w = wine('Crozes-Hermitage');
    const d = (await svc().wineDetail('halka', w.id))!;
    expect(d.bestDishes).toHaveLength(5);
    expect(d.bestDishes[0].dish.name).toBe('Venison loin');
    expect(d.approvedFor.map((x) => x.dish.name).sort()).toEqual(['Dry-aged ribeye, 300 g', 'Venison loin']);
    expect(d.approvedFor.find((x) => x.dish.name === 'Venison loin')!.role).toBe('primary');
    const hidden = buildDemoDataset({ ids: 'uuid' });
    hidden.dishes.find((x) => x.name === 'Venison loin')!.status = 'hidden';
    expect((await svc(hidden).wineDetail('halka', w.id))!.bestDishes.map((x) => x.dish.name)).not.toContain('Venison loin');
    expect(await svc().wineDetail('halka', '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('AdminService.reviewQueue', () => {
  it('groups the engine suggestions by dish, best first, with progress', async () => {
    const q = (await svc().reviewQueue('halka'))!;
    expect(q.groups.length).toBeGreaterThan(0);
    for (const g of q.groups) {
      expect(g.items.every((i) => i.pairing.status === 'suggested')).toBe(true);
      expect(g.items.map((i) => i.pairing.modelScore)).toEqual([...g.items.map((i) => i.pairing.modelScore)].sort((a, b) => b - a));
    }
    expect(q.groups.reduce((n, g) => n + g.items.length, 0)).toBe(q.progress.suggestions);
    const pork = q.groups.find((g) => g.dish.name === 'Glazed pork belly')!;
    expect(pork.hasPrimary).toBe(false);
    expect(q.groups.find((g) => g.dish.name === 'Duck breast')!.hasPrimary).toBe(true);
  });

  it('is empty when every suggestion has been decided', async () => {
    const done = buildDemoDataset({ ids: 'uuid' });
    for (const p of done.pairings) if (p.status === 'suggested') p.status = 'approved';
    const q = (await svc(done).reviewQueue('halka'))!;
    expect(q.groups).toEqual([]);
    expect(q.progress.suggestions).toBe(0);
  });
});

describe('AdminService.pairingWorkbench', () => {
  it('groups a dish by decision, in guest order, with the moves that are possible', async () => {
    const w = (await svc().pairingWorkbench('halka', dish('Duck breast').id))!;
    expect(w.approved.map((p) => p.wine?.name)).toEqual(['Savigny-lès-Beaune', 'Morgon']);
    expect(w.approved[0]).toMatchObject({ role: 'primary', canMoveUp: false, canMoveDown: false });
    expect(w.approved[1]).toMatchObject({ canMoveUp: false, canMoveDown: false });   // below a pinned primary and last
    expect(w.approved[0].why).toContain('signature');
    expect(w.suggested.length).toBeGreaterThan(0);
    expect(w.suggested.map((p) => p.modelScore)).toEqual([...w.suggested.map((p) => p.modelScore)].sort((a, b) => b - a));
    expect(w.rejected).toEqual([]);
    expect(w.hasUnpublishedChanges).toBe(false);
  });

  it('lists rejected pairings, and offers only active wines without a decision as additions', async () => {
    const w = (await svc().pairingWorkbench('halka', dish('Pike-perch').id))!;
    expect(w.rejected.map((p) => p.wine?.name)).toEqual(['Barbaresco']);
    const addable = w.addable.map((a) => a.wine.name);
    expect(addable).not.toContain('Barbaresco');          // rejected: restore it instead
    expect(addable).not.toContain('Mâcon-Verzé');         // already approved
    expect(addable).not.toContain('Hochar Père et Fils'); // hidden wine
    expect(w.addable.map((a) => a.score)).toEqual([...w.addable.map((a) => a.score)].sort((a, b) => b - a));
  });

  it('knows about unpublished work and returns null for unknown dishes', async () => {
    const data = buildDemoDataset({ ids: 'uuid' });
    data.pairings.find((p) => p.dishId === dish('Duck breast').id)!.dirty = true;
    expect((await svc(data).pairingWorkbench('halka', dish('Duck breast').id))!.hasUnpublishedChanges).toBe(true);
    expect(await svc().pairingWorkbench('halka', '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('AdminService.listPairings', () => {
  it('lists current pairings and filters by dish and status', async () => {
    const all = (await svc().listPairings('halka'))!;
    expect(all.pairings.length).toBe(ds.pairings.length);
    const duck = (await svc().listPairings('halka', { dishId: dish('Duck breast').id, status: 'approved' }))!;
    expect(duck.pairings.map((p) => p.role).sort()).toEqual(['best_value', 'primary']);
    expect((await svc().listPairings('halka', { status: 'rejected' }))!.pairings).toHaveLength(1);
    expect(await svc().listPairings('nope')).toBeNull();
  });
});

describe('AdminService.setup', () => {
  it('lists the onboarding steps with what is done', async () => {
    const s = (await svc().setup('halka'))!;
    expect(s.steps.map((x) => [x.key, x.done])).toEqual([['details', true], ['menu', true], ['wines', true], ['profiles', false], ['pairings', false], ['publish', false], ['qr', true]]);
    expect(s.steps.find((x) => x.key === 'profiles')!.detail).toBe('4 of 15 dish profiles are still drafts.');
    expect(s.steps.find((x) => x.key === 'menu')!.detail).toBe('15 dishes on the menu.');
    expect(s.published).toBe(true);
  });

  it('a restaurant with nothing yet has nothing done except the details', async () => {
    const empty = buildDemoDataset({ ids: 'uuid' });
    empty.dishes = []; empty.wines = []; empty.pairings = [];
    const s = (await svc(empty).setup('halka'))!;
    expect(s.steps.filter((x) => x.done).map((x) => x.key)).toEqual(['details']);
    expect(s.steps.find((x) => x.key === 'menu')!.detail).toMatch(/Upload/);
    expect(await svc().setup('nope')).toBeNull();
  });
});
