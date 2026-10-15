import type { ContractRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { Pairing } from '../domain/types';
import { InvariantError, NotFoundError, VersionConflictError } from '../errors';
import type { DecisionRecord, PairingOp, Repositories } from '../ports/repositories';

/**
 * Behaviour every write implementation must have. Used by the memory tests in core and by the
 * PostgreSQL integration tests in db, so both stores keep the same promises:
 * atomic commits, optimistic locking, the primary and unique-pair rules, an audit trail that
 * outlives deletions, and a published snapshot that only changes on publish.
 */

const AT = '2026-10-14T12:00:00.000Z';
const patch = (over: object) => ({ updatedBy: 'Test', updatedAt: AT, ...over });
let n = 0;
const decision = (p: Pairing, action: DecisionRecord['action']): DecisionRecord => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, pairingId: p.id, dishId: p.dishId, wineId: p.wineId,
  actor: 'Test', actorId: null, action, before: null, after: { status: 'approved' }, at: AT
});

export function writeContract(name: string, setup: () => Promise<{ repos: Repositories; dataset: DemoDataset }>, t: ContractRunner): void {
  t.describe(`write contract: ${name}`, () => {
    let repos: Repositories;
    let ds: DemoDataset;
    t.beforeEach(async () => { ({ repos, dataset: ds } = await setup()); });

    const rid = () => ds.restaurant.id;
    const duck = () => ds.dishes.find((d) => d.name === 'Duck breast')!;
    const duckPairs = async () => repos.pairingRepository.listByDish(rid(), duck().id);
    const primary = async () => (await duckPairs()).find((p) => p.role === 'primary')!;
    const suggestion = async () => (await duckPairs()).find((p) => p.status === 'suggested')!;

    t.it('updates a pairing, bumps its version and marks it as changed since the last publish', async () => {
      const s = await suggestion();
      t.expect(s.dirty).toBe(false);
      await repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'update', id: s.id, expectedVersion: s.version, patch: patch({ status: 'approved', role: 'alternative', rank: 3, comment: 'Try it' }) }], decisions: [decision(s, 'approve')] });
      const after = (await repos.pairingRepository.findById(rid(), s.id))!;
      t.expect(after).toMatchObject({ status: 'approved', role: 'alternative', rank: 3, comment: 'Try it', dirty: true, updatedBy: 'Test', updatedAt: AT, modelScore: s.modelScore, wineId: s.wineId });
      t.expect(after.version).toBe((s.version ?? 1) + 1);
    });

    t.it('rejects a stale version and applies nothing, even from earlier steps of the same commit', async () => {
      const [first, second] = (await duckPairs()).filter((p) => p.status === 'suggested');
      const ops: PairingOp[] = [
        { kind: 'update', id: first.id, expectedVersion: first.version, patch: patch({ comment: 'first' }) },
        { kind: 'update', id: second.id, expectedVersion: (second.version ?? 1) + 5, patch: patch({ comment: 'second' }) }
      ];
      await t.expect(repos.pairingWriteRepository.commit(rid(), { ops, decisions: [decision(first, 'comment')] })).rejects.toBeInstanceOf(VersionConflictError);
      t.expect((await repos.pairingRepository.findById(rid(), first.id))!.comment).toBeNull();
      t.expect(await repos.pairingRepository.listDecisions(rid(), { pairingId: first.id })).toEqual([]);
    });

    t.it('allows only one primary pairing per dish', async () => {
      const s = await suggestion();
      const before = await primary();
      await t.expect(repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'update', id: s.id, patch: patch({ status: 'approved', role: 'primary' }) }], decisions: [] })).rejects.toBeInstanceOf(InvariantError);
      t.expect((await primary()).id).toBe(before.id);
      t.expect((await repos.pairingRepository.findById(rid(), s.id))!.status).toBe('suggested');
    });

    t.it('lets a primary change hands when the old one is demoted first', async () => {
      const s = await suggestion();
      const old = await primary();
      await repos.pairingWriteRepository.commit(rid(), { ops: [
        { kind: 'update', id: old.id, patch: patch({ role: 'alternative' }) },
        { kind: 'update', id: s.id, patch: patch({ status: 'approved', role: 'primary' }) }
      ], decisions: [] });
      t.expect((await primary()).id).toBe(s.id);
    });

    t.it('allows a dish and a wine to be paired only once', async () => {
      const existing = (await duckPairs())[0];
      const dup: Pairing = { ...existing, id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: null, rank: null };
      await t.expect(repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'create', pairing: dup }], decisions: [] })).rejects.toBeInstanceOf(InvariantError);
      t.expect((await duckPairs()).length).toBe(ds.pairings.filter((p) => p.dishId === duck().id).length);
    });

    t.it('creates and deletes pairings, and keeps the audit trail after a delete', async () => {
      const taken = new Set((await duckPairs()).map((p) => p.wineId));
      const wine = ds.wines.find((w) => w.active && !taken.has(w.id))!;
      const created: Pairing = { id: '22222222-2222-4222-8222-222222222222', dishId: duck().id, wineId: wine.id, status: 'approved', role: 'alternative', rank: 9, comment: 'Mine', modelScore: 77, source: 'sommelier', updatedBy: 'Test', updatedAt: AT, dirty: true };
      await repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'create', pairing: created }], decisions: [decision(created, 'create')] });
      t.expect(await repos.pairingRepository.findById(rid(), created.id)).toMatchObject({ comment: 'Mine', source: 'sommelier', modelScore: 77, dirty: true });
      const stored = (await repos.pairingRepository.findById(rid(), created.id))!;
      await repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'delete', id: created.id, expectedVersion: stored.version }], decisions: [decision(created, 'delete')] });
      t.expect(await repos.pairingRepository.findById(rid(), created.id)).toBeNull();
      const trail = await repos.pairingRepository.listDecisions(rid(), { pairingId: created.id });
      t.expect(trail.map((d) => d.action)).toEqual(['delete', 'create']);
    });

    t.it('reports unknown pairings', async () => {
      await t.expect(repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'update', id: '33333333-3333-4333-8333-333333333333', patch: patch({}) }], decisions: [] })).rejects.toBeInstanceOf(NotFoundError);
    });

    t.it('keeps the published version fixed until publish, then counts and releases the changes', async () => {
      const s = await suggestion();
      const v1 = (await repos.publishRepository.latest(rid()))!;
      const seen = async () => (await repos.pairingRepository.listPublishedByDish(rid(), duck().id)).map((p) => `${p.wineId}:${p.status}:${p.role}`).sort();
      const before = await seen();
      t.expect(await repos.publishRepository.pendingPairingChanges(rid())).toBe(0);

      await repos.pairingWriteRepository.commit(rid(), { ops: [{ kind: 'update', id: s.id, patch: patch({ status: 'approved', role: 'alternative' }) }], decisions: [decision(s, 'approve')] });
      t.expect(await seen()).toEqual(before);
      t.expect(await repos.publishRepository.pendingPairingChanges(rid())).toBe(1);

      const v2 = await repos.publishRepository.publish(rid(), { actor: 'Test', at: '2026-10-14T13:00:00.000Z', id: '44444444-4444-4444-8444-444444444444' });
      // one changed pairing plus the draft dishes the demo menu contains
      t.expect(v2).toMatchObject({ number: v1.number + 1, publishedBy: 'Test', changesCount: 1 + ds.dishes.filter((x) => x.status === 'draft').length });
      t.expect(await seen()).not.toEqual(before);
      t.expect((await seen()).some((x) => x.startsWith(`${s.wineId}:approved`))).toBe(true);
      t.expect(await repos.publishRepository.pendingPairingChanges(rid())).toBe(0);
      t.expect((await repos.pairingRepository.findById(rid(), s.id))!.dirty).toBe(false);
      t.expect((await repos.publishRepository.latest(rid()))!.number).toBe(v2.number);
      t.expect((await repos.restaurantRepository.findBySlug(ds.restaurant.slug))!.publishedAt).toBe('2026-10-14T13:00:00.000Z');
    });

    t.it('releases draft dishes on publish', async () => {
      const draft = ds.dishes.find((d) => d.status === 'draft')!;
      await repos.publishRepository.publish(rid(), { actor: 'Test', at: '2026-10-14T13:00:00.000Z', id: '55555555-5555-4555-8555-555555555555' });
      t.expect((await repos.dishRepository.findById(rid(), draft.id))!.status).toBe('published');
    });

    t.it('adds engine suggestions, skips pairs that already exist in any status, and does not count them as changes', async () => {
      const dish = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const taken = new Set((await repos.pairingRepository.listByDish(rid(), dish.id)).map((p) => p.wineId));
      const free = ds.wines.filter((w) => w.active && !taken.has(w.id)).slice(0, 2);
      const existing = (await duckPairs())[0];
      const mk = (wineId: string, id: string): Pairing => ({ id, dishId: dish.id, wineId, status: 'suggested', role: null, rank: null, comment: null, modelScore: 70, source: 'engine', updatedBy: 'Wine Match engine', updatedAt: AT, dirty: false });
      const added = await repos.pairingWriteRepository.addSuggestions(rid(), [mk(free[0].id, '88888888-8888-4888-8888-888888888881'), mk(free[1].id, '88888888-8888-4888-8888-888888888882'), mk(existing.wineId, '88888888-8888-4888-8888-888888888883')]);
      t.expect(added).toBe(2);
      t.expect(await repos.pairingWriteRepository.addSuggestions(rid(), [mk(free[0].id, '88888888-8888-4888-8888-888888888884')])).toBe(0);
      t.expect(await repos.pairingRepository.findById(rid(), '88888888-8888-4888-8888-888888888881')).toMatchObject({ status: 'suggested', dirty: false, source: 'engine', modelScore: 70 });
      t.expect((await repos.pairingRepository.findById(rid(), existing.id))!.status).toBe(existing.status);
      t.expect(await repos.publishRepository.pendingPairingChanges(rid())).toBe(0);
      t.expect(await repos.pairingWriteRepository.addSuggestions(rid(), [])).toBe(0);
    });

    t.it('updates the restaurant details, including its slug', async () => {
      await repos.restaurantWriteRepository.updateDetails(rid(), { name: 'Halka Warszawa', slug: 'halka-waw', address: 'ul. Nowa 1', city: 'Warsaw', wineDirector: 'Marta Wierzbicka' });
      t.expect(await repos.restaurantRepository.findBySlug('halka')).toBeNull();
      t.expect(await repos.restaurantRepository.findBySlug('halka-waw')).toMatchObject({ id: rid(), name: 'Halka Warszawa', address: 'ul. Nowa 1' });
    });

    t.it('hides and shows a wine, and stores guest settings', async () => {
      const wine = ds.wines.find((w) => w.active)!;
      t.expect((await repos.wineWriteRepository.setActive(rid(), wine.id, false))!.active).toBe(false);
      t.expect((await repos.wineRepository.findById(rid(), wine.id))!.active).toBe(false);
      t.expect((await repos.wineWriteRepository.setActive(rid(), wine.id, true))!.active).toBe(true);
      t.expect(await repos.wineWriteRepository.setActive(rid(), '66666666-6666-4666-8666-666666666666', true)).toBeNull();
      await repos.restaurantWriteRepository.updateSettings(rid(), { showUnreviewed: false, showScores: true });
      t.expect((await repos.restaurantRepository.findBySlug(ds.restaurant.slug))!.settings).toEqual({ showUnreviewed: false, showScores: true });
    });
  });
}
