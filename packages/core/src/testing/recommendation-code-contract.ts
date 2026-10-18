import type { OnceRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { RecommendationCodeInput, Repositories } from '../ports/repositories';

/**
 * `RecommendationCodeRepository` cases of the repository contract (spec 2026-10-16-recommendation-code, R3, R7, R11,
 * R13, AC3). Called from `repositoryContract`, so memory and PostgreSQL run the same cases. The setup runs once per
 * file: every case uses its own service days (2032) and sessions.
 */
export function recommendationCodeContract(t: Omit<OnceRunner, 'beforeAll' | 'afterAll'>, get: () => { repos: Repositories; ds: DemoDataset }): void {
  const OTHER = '00000000-0000-4000-8000-000000000000';
  const sid = (n: number) => `c0de5e55-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rid = (n: number) => `c0de0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const input = (n: number, over: Partial<RecommendationCodeInput> = {}): RecommendationCodeInput => {
    const { ds } = get();
    return {
      id: rid(n), code: 'W7K', serviceDay: '2032-01-01', sessionId: sid(n), source: 'guest', context: 'dish', wineId: ds.wines[0].id,
      dishIds: [ds.dishes[0].id], serving: 'bottle', menuVersion: '2032-01-01T08:00:00.000Z', tier: 'engine', engineVersion: 'wm-test',
      issuedAt: '2032-01-01T19:00:00.000Z', ...over
    };
  };

  t.it('issues a code once per choice and finds it by the whole code, within its restaurant (AC3)', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    const first = input(1);
    const created = await repo.tryIssue(ds.restaurant.id, first);
    const { id: _id, ...fields } = first;
    t.expect(created).toEqual({ status: 'created', record: { ...fields, confirmedAt: null } });
    // the same choice with another candidate code: the stored code comes back, no second row
    t.expect(await repo.tryIssue(ds.restaurant.id, { ...first, id: rid(2), code: 'A3C' })).toEqual({ status: 'existing', record: { ...fields, confirmedAt: null } });
    t.expect(await repo.countBySession(ds.restaurant.id, '2032-01-01', sid(1))).toBe(1);
    t.expect(await repo.findByCode(ds.restaurant.id, '2032-01-01', 'W7K')).toEqual({ ...fields, confirmedAt: null });
    t.expect(await repo.findByCode(ds.restaurant.id, '2032-01-01', 'A3C')).toBeNull();
    t.expect(await repo.findByCode(ds.restaurant.id, '2032-01-02', 'W7K')).toBeNull();
    t.expect(await repo.findByCode(OTHER, '2032-01-01', 'W7K')).toBeNull();
  });

  t.it('reports a taken code for another choice; a longer code with the same prefix is another code', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    await repo.tryIssue(ds.restaurant.id, input(10, { serviceDay: '2032-01-10', code: 'H4N' }));
    t.expect(await repo.tryIssue(ds.restaurant.id, input(11, { serviceDay: '2032-01-10', code: 'H4N' }))).toEqual({ status: 'code_taken' });
    t.expect((await repo.tryIssue(ds.restaurant.id, input(11, { serviceDay: '2032-01-10', code: 'H4N7' }))).status).toBe('created');
    // the same code on another day is free
    t.expect((await repo.tryIssue(ds.restaurant.id, input(12, { serviceDay: '2032-01-11', code: 'H4N' }))).status).toBe('created');
    t.expect((await repo.findByCode(ds.restaurant.id, '2032-01-10', 'H4N7'))?.sessionId).toBe(sid(11));
    t.expect((await repo.findByCode(ds.restaurant.id, '2032-01-10', 'H4N'))?.sessionId).toBe(sid(10));
  });

  t.it('tells choices apart by serving, dishes, wine and session', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    const day = '2032-01-20';
    const base = input(20, { serviceDay: day, code: 'A2A' });
    t.expect((await repo.tryIssue(ds.restaurant.id, base)).status).toBe('created');
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(21), code: 'A2C', serving: 'glass' })).status).toBe('created');
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(22), code: 'A2D', context: 'direct', dishIds: [], tier: null })).status).toBe('created');
    const table = [ds.dishes[0].id, ds.dishes[1].id].sort();
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(23), code: 'A2E', context: 'table', dishIds: table, tier: null })).status).toBe('created');
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(24), code: 'A2F', context: 'table', dishIds: table, tier: null })).status).toBe('existing');
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(25), code: 'A2G', wineId: ds.wines[1].id })).status).toBe('created');
    t.expect((await repo.tryIssue(ds.restaurant.id, { ...base, id: rid(26), code: 'A2H', sessionId: sid(26) })).status).toBe('created');
    t.expect(await repo.countBySession(ds.restaurant.id, day, sid(20))).toBe(5);
    t.expect(await repo.countBySession(ds.restaurant.id, day, sid(26))).toBe(1);
    t.expect(await repo.countBySession(ds.restaurant.id, '2032-01-21', sid(20))).toBe(0);
    t.expect(await repo.countBySession(OTHER, day, sid(20))).toBe(0);
    t.expect((await repo.findByCode(ds.restaurant.id, day, 'A2E'))?.dishIds).toEqual(table);
  });

  t.it('confirms idempotently, clears on undo and ignores unknown codes and other restaurants (R7)', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    const day = '2032-02-01';
    await repo.tryIssue(ds.restaurant.id, input(30, { serviceDay: day, code: 'K3M' }));
    const first = await repo.setConfirmed(ds.restaurant.id, day, 'K3M', new Date('2032-02-01T19:42:00.000Z'), 'staff_view');
    t.expect(first?.confirmedAt).toBe('2032-02-01T19:42:00.000Z');
    const second = await repo.setConfirmed(ds.restaurant.id, day, 'K3M', new Date('2032-02-01T20:10:00.000Z'), 'staff_view');
    t.expect(second?.confirmedAt).toBe('2032-02-01T19:42:00.000Z');
    t.expect(await repo.setConfirmed(OTHER, day, 'K3M', null, null)).toBeNull();
    t.expect((await repo.findByCode(ds.restaurant.id, day, 'K3M'))?.confirmedAt).toBe('2032-02-01T19:42:00.000Z');
    t.expect((await repo.setConfirmed(ds.restaurant.id, day, 'K3M', null, null))?.confirmedAt).toBeNull();
    t.expect(await repo.setConfirmed(ds.restaurant.id, day, 'X9X', new Date('2032-02-01T20:00:00.000Z'), 'staff_view')).toBeNull();
    t.expect(await repo.setConfirmed(ds.restaurant.id, '2032-02-02', 'K3M', new Date('2032-02-02T20:00:00.000Z'), 'staff_view')).toBeNull();
  });

  t.it('totals count every recommendation once; pair stats expand a table per dish and leave out direct (Q12)', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    const [d1, d2, d3] = ds.dishes.map((d) => d.id);
    const wine = ds.wines[0].id;
    const table = [d1, d2, d3].sort();
    await repo.tryIssue(ds.restaurant.id, input(40, { serviceDay: '2032-03-01', code: 'P4R', dishIds: [d1] }));
    await repo.tryIssue(ds.restaurant.id, input(41, { serviceDay: '2032-03-02', code: 'P4R', context: 'table', dishIds: table, tier: null }));
    await repo.tryIssue(ds.restaurant.id, input(42, { serviceDay: '2032-03-03', code: 'P4R', context: 'direct', dishIds: [], tier: null }));
    await repo.tryIssue(ds.restaurant.id, input(43, { serviceDay: '2032-03-04', code: 'P4R', dishIds: [d1] }));   // outside the period
    await repo.setConfirmed(ds.restaurant.id, '2032-03-01', 'P4R', new Date('2032-03-01T20:00:00.000Z'), 'staff_view');
    const period = { from: '2032-03-01', to: '2032-03-03' };
    t.expect(await repo.totals(ds.restaurant.id, period)).toEqual({ issued: 3, staffConfirmed: 1, posMatched: 0, ordered: 1 });
    t.expect(await repo.totals(OTHER, period)).toEqual({ issued: 0, staffConfirmed: 0, posMatched: 0, ordered: 0 });
    const stats = await repo.pairStats(ds.restaurant.id, period);
    const expected = [
      { dishId: d1, wineId: wine, context: 'dish', issued: 1, staffConfirmed: 1, posMatched: 0, ordered: 1 },
      ...table.map((dishId) => ({ dishId, wineId: wine, context: 'table', issued: 1, staffConfirmed: 0, posMatched: 0, ordered: 0 }))
    ].sort((a, b) => a.dishId.localeCompare(b.dishId) || a.wineId.localeCompare(b.wineId) || a.context.localeCompare(b.context));
    t.expect(stats).toEqual(expected);
    t.expect(await repo.pairStats(OTHER, period)).toEqual([]);
    t.expect(await repo.unmatchedPosCodes(ds.restaurant.id, period)).toBe(0);
  });

  t.it('counts the distinct (date, code) pairs that match no issued code', async () => {
    const { repos, ds } = get();
    const repo = repos.recommendationCodeRepository;
    await repo.tryIssue(ds.restaurant.id, input(50, { serviceDay: '2032-04-01', code: 'T5V' }));
    const pairs = [
      { businessDate: '2032-04-01', code: 'T5V' },   // issued
      { businessDate: '2032-04-02', code: 'T5V' },   // another day
      { businessDate: '2032-04-01', code: 'Y6W' },
      { businessDate: '2032-04-01', code: 'Y6W' }    // the same pair twice: once
    ];
    t.expect(await repo.countUnmatched(ds.restaurant.id, pairs)).toBe(2);
    t.expect(await repo.countUnmatched(OTHER, pairs)).toBe(3);
    t.expect(await repo.countUnmatched(ds.restaurant.id, [])).toBe(0);
  });
}
