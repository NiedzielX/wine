import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { InvariantError, NotFoundError, ValidationError, VersionConflictError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { AdminService } from '../src/services/dashboard/admin-service';
import { CatalogService } from '../src/services/catalog/catalog-service';
import { PublishService } from '../src/services/publishing/publish-service';
import { RecommendationService } from '../src/services/guest/recommendation-service';
import { SommelierService } from '../src/services/pairings/sommelier-service';
import { writeContract } from '../src/testing/write-contract';
import { beforeEach as be } from 'vitest';

const ds0 = buildDemoDataset({ ids: 'uuid' });
const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };

function build(data = buildDemoDataset({ ids: 'uuid' })) {
  const store = MemoryStore.from(data);
  const repos = createMemoryRepositories(store);
  let tick = Date.parse('2026-10-14T10:00:00.000Z');
  let seq = 0;
  const clock = { now: () => new Date((tick += 1000)) };
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return {
    data, store, repos,
    som: new SommelierService({ ...repos, clock, idGenerator }),
    publish: new PublishService({ ...repos, clock, idGenerator }),
    rec: new RecommendationService(repos),
    catalog: new CatalogService(repos),
    admin: new AdminService(repos)
  };
}

writeContract('memory', async () => { const b = build(); return { repos: b.repos, dataset: b.data }; }, { describe, it, expect, beforeEach: be });

const dishOf = (d: ReturnType<typeof build>, name: string) => d.data.dishes.find((x) => x.name === name)!;
const wineOf = (d: ReturnType<typeof build>, name: string) => d.data.wines.find((x) => x.name === name)!;
const pairs = async (d: ReturnType<typeof build>, dish: string) => d.repos.pairingRepository.listByDish(d.data.restaurant.id, dishOf(d, dish).id);
const live = async (d: ReturnType<typeof build>, dish: string, wine: string) => (await pairs(d, dish)).find((p) => p.wineId === wineOf(d, wine).id)!;
const trail = (d: ReturnType<typeof build>, pairingId: string) => d.repos.pairingRepository.listDecisions(d.data.restaurant.id, { pairingId });

describe('approve / reject / restore', () => {
  let d: ReturnType<typeof build>;
  beforeEach(() => { d = build(); });

  it('makes the first approved pairing of a dish its primary and the next ones alternatives, with ranks 1..n', async () => {
    const pork = await pairs(d, 'Glazed pork belly');
    const [a, b] = pork.filter((p) => p.status === 'suggested').sort((x, y) => y.modelScore - x.modelScore);
    await d.som.approve('halka', a.id, ACTOR);
    await d.som.approve('halka', b.id, ACTOR);
    const after = await pairs(d, 'Glazed pork belly');
    expect(after.find((p) => p.id === a.id)).toMatchObject({ status: 'approved', role: 'primary', rank: 1, updatedBy: ACTOR.name, dirty: true });
    expect(after.find((p) => p.id === b.id)).toMatchObject({ status: 'approved', role: 'alternative', rank: 2 });
    expect((await trail(d, a.id)).map((x) => x.action)).toEqual(['approve']);
    expect((await trail(d, a.id))[0]).toMatchObject({ actor: ACTOR.name, actorId: ACTOR.id });   // the audit trail names the person
  });

  it('approving an already approved pairing changes nothing (no version bump, no audit entry)', async () => {
    const savigny = await live(d, 'Duck breast', 'Savigny-lès-Beaune');
    await d.som.approve('halka', savigny.id, ACTOR);
    expect((await live(d, 'Duck breast', 'Savigny-lès-Beaune')).version).toBe(savigny.version);
    expect(await trail(d, savigny.id)).toEqual([]);
  });

  it('rejecting a pairing clears its role and rank and renumbers the rest', async () => {
    const morgon = await live(d, 'Duck breast', 'Morgon');
    const savigny = await live(d, 'Duck breast', 'Savigny-lès-Beaune');
    await d.som.reject('halka', savigny.id, ACTOR);
    expect(await live(d, 'Duck breast', 'Savigny-lès-Beaune')).toMatchObject({ status: 'rejected', role: null, rank: null });
    expect((await live(d, 'Duck breast', 'Morgon')).rank).toBe(1);
    expect(morgon.rank).toBe(2);
    expect((await trail(d, savigny.id))[0].action).toBe('reject');
  });

  it('restores only rejected pairings', async () => {
    const rejected = await live(d, 'Pike-perch', 'Barbaresco');
    expect(rejected.status).toBe('rejected');
    await d.som.restore('halka', rejected.id, ACTOR);
    expect((await live(d, 'Pike-perch', 'Barbaresco')).status).toBe('suggested');
    await expect(d.som.restore('halka', rejected.id, ACTOR)).rejects.toMatchObject({ code: 'not_rejected' });
  });

  it('approveAll approves a dish best score first, or the whole menu, and returns the count', async () => {
    const forDish = await d.som.approveAll('halka', ACTOR, dishOf(d, 'Glazed pork belly').id);
    const suggested = (await d.repos.pairingRepository.listByRestaurant(d.data.restaurant.id)).filter((p) => p.status === 'suggested');
    expect(forDish).toBe(4);
    expect((await pairs(d, 'Glazed pork belly')).filter((p) => p.role === 'primary')).toHaveLength(1);
    const rest = await d.som.approveAll('halka', ACTOR);
    expect(rest).toBe(suggested.length);
    expect((await d.repos.pairingRepository.listByRestaurant(d.data.restaurant.id)).some((p) => p.status === 'suggested')).toBe(false);
    for (const dish of d.data.dishes.filter((x) => x.status === 'published')) {
      const primaries = (await pairs(d, dish.name)).filter((p) => p.status !== 'rejected' && p.status !== 'suggested' && p.role === 'primary');
      expect(primaries.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('roles, notes and order', () => {
  let d: ReturnType<typeof build>;
  beforeEach(() => { d = build(); });

  it('a new primary demotes the old one, and both are in the audit trail', async () => {
    const morgon = await live(d, 'Duck breast', 'Morgon');
    const savigny = await live(d, 'Duck breast', 'Savigny-lès-Beaune');
    await d.som.setRole('halka', morgon.id, 'primary', ACTOR);
    expect(await live(d, 'Duck breast', 'Morgon')).toMatchObject({ role: 'primary', rank: 1 });
    expect(await live(d, 'Duck breast', 'Savigny-lès-Beaune')).toMatchObject({ role: 'alternative', rank: 2 });
    expect((await trail(d, morgon.id))[0].action).toBe('set_role');
    expect((await trail(d, savigny.id))[0].action).toBe('set_role');
  });

  it('setting a role on a suggestion approves it; a rejected pairing must be restored first; invalid roles are refused', async () => {
    const s = (await pairs(d, 'Duck breast')).find((p) => p.status === 'suggested')!;
    await d.som.setRole('halka', s.id, 'best_value', ACTOR);
    expect((await d.repos.pairingRepository.findById(d.data.restaurant.id, s.id))).toMatchObject({ status: 'approved', role: 'best_value' });
    const rejected = await live(d, 'Pike-perch', 'Barbaresco');
    await expect(d.som.setRole('halka', rejected.id, 'primary', ACTOR)).rejects.toMatchObject({ code: 'pairing_rejected' });
    await expect(d.som.setRole('halka', s.id, 'boss', ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });

  it('a note marks the pairing as modified; on a suggestion it also approves it; over 140 characters is refused', async () => {
    const savigny = await live(d, 'Duck breast', 'Savigny-lès-Beaune');
    await d.som.setComment('halka', savigny.id, '  Cherry jus, always.  ', ACTOR);
    expect(await live(d, 'Duck breast', 'Savigny-lès-Beaune')).toMatchObject({ comment: 'Cherry jus, always.', status: 'modified', role: 'primary' });
    const s = (await pairs(d, 'Duck breast')).find((p) => p.status === 'suggested')!;
    await d.som.setComment('halka', s.id, 'Worth trying', ACTOR);
    expect(await d.repos.pairingRepository.findById(d.data.restaurant.id, s.id)).toMatchObject({ status: 'modified', comment: 'Worth trying', role: 'alternative' });
    await expect(d.som.setComment('halka', savigny.id, 'x'.repeat(141), ACTOR)).rejects.toMatchObject({ code: 'comment_too_long', fields: { comment: 'max_140' } });
  });

  it('moves a pairing down and up, keeps the primary first and refuses impossible moves', async () => {
    await d.som.approveAll('halka', ACTOR, dishOf(d, 'Duck breast').id);
    const order = async () => (await pairs(d, 'Duck breast')).filter((p) => p.rank !== null).sort((a, b) => a.rank! - b.rank!);
    const [primary, second, third] = await order();
    expect(primary.role).toBe('primary');
    await d.som.move('halka', second.id, 'down', ACTOR);
    expect((await order()).slice(0, 3).map((p) => p.id)).toEqual([primary.id, third.id, second.id]);
    await d.som.move('halka', second.id, 'up', ACTOR);
    expect((await order()).slice(0, 3).map((p) => p.id)).toEqual([primary.id, second.id, third.id]);
    await expect(d.som.move('halka', primary.id, 'down', ACTOR)).rejects.toMatchObject({ code: 'primary_is_pinned' });
    await expect(d.som.move('halka', second.id, 'up', ACTOR)).rejects.toMatchObject({ code: 'cannot_move' });
  });
});

describe('manual pairings', () => {
  let d: ReturnType<typeof build>;
  beforeEach(() => { d = build(); });

  it('adds a pairing written by the sommelier with the engine score and an audit entry', async () => {
    const wine = wineOf(d, 'Estate Chardonnay');
    await d.som.addManual('halka', { dishId: dishOf(d, 'Duck breast').id, wineId: wine.id, role: 'best_value', comment: 'Surprise pick' }, ACTOR);
    const p = await live(d, 'Duck breast', 'Estate Chardonnay');
    expect(p).toMatchObject({ status: 'modified', role: 'best_value', comment: 'Surprise pick', source: 'sommelier', updatedBy: ACTOR.name, dirty: true });
    expect(p.modelScore).toBeGreaterThan(0);
    expect((await trail(d, p.id))[0].action).toBe('create');
  });

  it('upgrades an existing suggestion instead of creating a duplicate, and a new primary demotes the old one', async () => {
    const s = (await pairs(d, 'Duck breast')).find((p) => p.status === 'suggested')!;
    const before = (await pairs(d, 'Duck breast')).length;
    await d.som.addManual('halka', { dishId: dishOf(d, 'Duck breast').id, wineId: s.wineId, role: 'primary', comment: '' }, ACTOR);
    expect((await pairs(d, 'Duck breast')).length).toBe(before);
    expect((await pairs(d, 'Duck breast')).filter((p) => p.role === 'primary')).toHaveLength(1);
    expect(await d.repos.pairingRepository.findById(d.data.restaurant.id, s.id)).toMatchObject({ status: 'approved', role: 'primary' });
  });

  it('refuses a wine that is already paired, hidden, unknown or a missing wine', async () => {
    const dishId = dishOf(d, 'Duck breast').id;
    await expect(d.som.addManual('halka', { dishId, wineId: wineOf(d, 'Morgon').id }, ACTOR)).rejects.toMatchObject({ code: 'already_paired' });
    await expect(d.som.addManual('halka', { dishId, wineId: wineOf(d, 'Hochar Père et Fils').id }, ACTOR)).rejects.toMatchObject({ code: 'wine_not_available' });
    await expect(d.som.addManual('halka', { dishId, wineId: '' }, ACTOR)).rejects.toMatchObject({ code: 'wine_required' });
    await expect(d.som.addManual('halka', { dishId, wineId: '00000000-0000-4000-8000-00000000ffff' }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(d.som.addManual('halka', { dishId, wineId: wineOf(d, 'Estate Chardonnay').id, role: 'boss' }, ACTOR)).rejects.toMatchObject({ code: 'invalid_role' });
  });

  it('deletes only manual pairings and keeps their history', async () => {
    const dishId = dishOf(d, 'Duck breast').id;
    await d.som.addManual('halka', { dishId, wineId: wineOf(d, 'Estate Chardonnay').id }, ACTOR);
    const mine = await live(d, 'Duck breast', 'Estate Chardonnay');
    await d.som.deleteManual('halka', mine.id, ACTOR);
    expect(await d.repos.pairingRepository.findById(d.data.restaurant.id, mine.id)).toBeNull();
    expect((await trail(d, mine.id)).map((x) => x.action)).toEqual(['delete', 'create']);
    const engine = (await pairs(d, 'Duck breast')).find((p) => p.source === 'engine')!;
    await expect(d.som.deleteManual('halka', engine.id, ACTOR)).rejects.toMatchObject({ code: 'only_manual_pairings_can_be_deleted' });
  });
});

describe('concurrency', () => {
  it('refuses a change made on a stale version and changes nothing', async () => {
    const d = build();
    const s = await live(d, 'Duck breast', 'Morgon');
    await d.som.setComment('halka', s.id, 'First', ACTOR, s.version);
    await expect(d.som.setComment('halka', s.id, 'Second', ACTOR, s.version)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await live(d, 'Duck breast', 'Morgon')).comment).toBe('First');
  });

  it('the store itself refuses two primaries even if a caller tries to force them', async () => {
    const d = build();
    const s = (await pairs(d, 'Duck breast')).find((p) => p.status === 'suggested')!;
    await expect(d.repos.pairingWriteRepository.commit(d.data.restaurant.id, {
      ops: [{ kind: 'update', id: s.id, patch: { status: 'approved', role: 'primary', updatedBy: 'x', updatedAt: '2026-10-14T00:00:00.000Z' } }], decisions: []
    })).rejects.toBeInstanceOf(InvariantError);
  });
});

describe('what guests see: published version, wine availability, settings', () => {
  it('guests keep seeing the published pairings until publish, then the new ones', async () => {
    const d = build();
    const pork = dishOf(d, 'Glazed pork belly');
    const tops = async () => (await d.rec.forDish('halka', pork.id))!.result.items.map((i) => `${i.wine.name}:${i.tier}`);
    const before = await tops();
    expect(before.every((x) => x.endsWith(':2'))).toBe(true);        // engine picks only
    await d.som.approveAll('halka', ACTOR, pork.id);
    expect(await tops()).toEqual(before);                             // not published yet
    expect((await d.catalog.pairingCoverage(d.data.restaurant.id)).get(pork.id)?.hasPrimary ?? false).toBe(false);
    await d.publish.publish('halka', ACTOR);
    const after = (await d.rec.forDish('halka', pork.id))!.result.items;
    expect(after[0].tier).toBe(0);
    expect(after[0].sommelier?.role).toBe('primary');
    expect((await d.catalog.pairingCoverage(d.data.restaurant.id)).get(pork.id)!.hasPrimary).toBe(true);
  });

  it('a rejected pairing stays visible to guests until publish', async () => {
    const d = build();
    const duck = dishOf(d, 'Duck breast');
    const savigny = await live(d, 'Duck breast', 'Savigny-lès-Beaune');
    await d.som.reject('halka', savigny.id, ACTOR);
    expect((await d.rec.forDish('halka', duck.id))!.result.items[0].wine.name).toBe('Savigny-lès-Beaune');
    await d.publish.publish('halka', ACTOR);
    expect((await d.rec.forDish('halka', duck.id))!.result.items.map((i) => i.wine.name)).not.toContain('Savigny-lès-Beaune');
  });

  it('wine availability reaches guests immediately; unknown wines are refused', async () => {
    const d = build();
    const duck = dishOf(d, 'Duck breast');
    await d.som.setWineActive('halka', wineOf(d, 'Savigny-lès-Beaune').id, false);
    expect((await d.rec.forDish('halka', duck.id))!.result.items.map((i) => i.wine.name)).not.toContain('Savigny-lès-Beaune');
    await d.som.setWineActive('halka', wineOf(d, 'Savigny-lès-Beaune').id, true);
    expect((await d.rec.forDish('halka', duck.id))!.result.items[0].wine.name).toBe('Savigny-lès-Beaune');
    await expect(d.som.setWineActive('halka', '00000000-0000-4000-8000-00000000ffff', false)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('guest settings apply immediately', async () => {
    const d = build();
    await d.publish.updateSettings('halka', { showUnreviewed: false });
    const items = (await d.rec.forDish('halka', dishOf(d, 'Duck breast').id))!.result.items;
    expect(items.every((i) => i.tier < 2)).toBe(true);
  });
});

describe('PublishService', () => {
  it('refuses to publish when nothing changed', async () => {
    const data = buildDemoDataset({ ids: 'uuid' });
    data.dishes.forEach((x) => { if (x.status === 'draft') x.status = 'published'; });
    const d = build(data);
    expect((await d.publish.preview('halka')).pendingChanges).toBe(0);
    await expect(d.publish.publish('halka', ACTOR)).rejects.toMatchObject({ code: 'nothing_to_publish' });
  });

  it('counts changes and draft dishes, then publishes', async () => {
    const d = build();
    // the demo has one draft dish, so the first preview already has one pending change
    const p0 = await d.publish.preview('halka');
    expect(p0.draftDishes).toHaveLength(1);
    expect(p0.pendingChanges).toBe(1);
    const s = (await pairs(d, 'Duck breast')).find((p) => p.status === 'suggested')!;
    await d.som.approve('halka', s.id, ACTOR);
    await d.som.setComment('halka', s.id, 'Note', ACTOR);
    expect((await d.publish.preview('halka')).pendingChanges).toBe(2);   // one pairing (two decisions) + one draft dish
    const v = await d.publish.publish('halka', ACTOR);
    expect(v).toMatchObject({ number: 2, changesCount: 2, publishedBy: ACTOR.name });
    const p1 = await d.publish.preview('halka');
    expect(p1.pendingChanges).toBe(0);
    expect(p1.lastVersion!.number).toBe(2);
    expect((await d.catalog.publishedMenu('halka'))!.dishes.some((x) => x.name === 'Polish cheese selection')).toBe(true);
    await expect(d.publish.publish('halka', ACTOR)).rejects.toBeInstanceOf(ValidationError);
  });

  it('the checklist tells what is missing, and the dashboard shows the pending count', async () => {
    const d = build();
    const p = await d.publish.preview('halka');
    expect(p.withoutPrimary.map((x) => x.name)).toContain('Glazed pork belly');
    expect(p.unreviewedSuggestions).toBeGreaterThan(0);
    expect(p.draftProfiles.length).toBe(4);
    expect((await d.admin.overview('halka'))!.unpublishedChanges).toBe(1);
  });

  it('refuses unknown restaurants', async () => {
    const d = build();
    await expect(d.publish.preview('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(d.som.approve('nope', ds0.pairings[0].id, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });
});
