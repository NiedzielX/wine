import type { OnceRunner } from './contract-types';
import type { DemoDataset } from '../demo/dataset';
import type { AppendLaunchDayInput } from '../ports/proof';
import type { Repositories } from '../ports/repositories';
import { PROOF_REASON_MAX } from '../services/proof/launch-rules';

/**
 * `ProofLaunchRepository` cases of the repository contract (spec 2026-11-18-owner-proof-report, R5, R12, AC5). The cases
 * run in order on the demo restaurant's log and build on each other (the log only grows), so memory and PostgreSQL are
 * held to the same answers.
 */
export function proofLaunchContract(t: Omit<OnceRunner, 'beforeAll' | 'afterAll'>, get: () => { repos: Repositories; ds: DemoDataset }): void {
  const OTHER = '00000000-0000-4000-8000-000000000000';
  let n = 0;
  const uuid = () => `9a000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const input = (launchDay: string, expectedCurrent: string | null, reason: string | null = null): AppendLaunchDayInput =>
    ({ id: uuid(), launchDay, reason, setByRole: 'owner', setByMembershipId: null, at: '2033-01-01T10:00:00.000Z', expectedCurrent });
  const state = async () => {
    const { repos, ds } = get();
    return { current: await repos.proofLaunchRepository.current(ds.restaurant.id), history: await repos.proofLaunchRepository.history(ds.restaurant.id) };
  };

  t.it('a restaurant starts without a launch day; the first entry needs no reason and is number 1', async () => {
    const { repos, ds } = get();
    t.expect(await state()).toEqual({ current: null, history: [] });
    const first = await repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-01-10', null));
    t.expect(first).toMatchObject({ seq: 1, launchDay: '2033-01-10', reason: null, setByRole: 'owner', setByMembershipId: null });
    t.expect(await state()).toEqual({ current: first, history: [first] });
  });

  t.it('a second entry without a reason (also blank) is refused with reason_required and changes nothing (AC5)', async () => {
    const { repos, ds } = get();
    const before = await state();
    for (const reason of [null, '', '   ']) {
      await t.expect(repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-01-20', before.current!.id, reason))).rejects.toMatchObject({ name: 'ValidationError', code: 'reason_required' });
    }
    t.expect(await state()).toEqual(before);
  });

  t.it('a second entry with a reason is added: the newest is current, the first stays as it was (AC5)', async () => {
    const { repos, ds } = get();
    const before = await state();
    const second = await repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-01-17', before.current!.id, '  Guests started a week earlier  '));
    t.expect(second).toMatchObject({ seq: 2, launchDay: '2033-01-17', reason: 'Guests started a week earlier' });
    t.expect(await state()).toEqual({ current: second, history: [second, before.history[0]] });
  });

  t.it('a write that did not see the current entry is a version conflict, and so is the retry of one that succeeded', async () => {
    const { repos, ds } = get();
    const before = await state();
    // saw nothing / saw an older entry / the same request again (its expectedCurrent is no longer the current one)
    for (const seen of [null, before.history[1].id, '9a999999-0000-4000-8000-000000000000']) {
      await t.expect(repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-02-01', seen, 'Another change'))).rejects.toMatchObject({ name: 'VersionConflictError' });
    }
    t.expect(await state()).toEqual(before);
  });

  t.it(`a reason has at most ${PROOF_REASON_MAX} characters`, async () => {
    const { repos, ds } = get();
    const before = await state();
    await t.expect(repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-02-02', before.current!.id, 'x'.repeat(PROOF_REASON_MAX + 1)))).rejects.toMatchObject({ code: 'reason_too_long' });
    t.expect(await state()).toEqual(before);
    const third = await repos.proofLaunchRepository.append(ds.restaurant.id, input('2033-02-02', before.current!.id, 'x'.repeat(PROOF_REASON_MAX)));
    t.expect(third.seq).toBe(3);
  });

  t.it('keeps the log within its restaurant: another restaurant sees nothing and cannot be written to by an unknown id (R12)', async () => {
    const { repos, ds } = get();
    const before = await state();
    t.expect(await repos.proofLaunchRepository.current(OTHER)).toBeNull();
    t.expect(await repos.proofLaunchRepository.history(OTHER)).toEqual([]);
    for (const id of [OTHER, 'not-a-uuid']) {
      await t.expect(repos.proofLaunchRepository.append(id, input('2033-03-01', null))).rejects.toMatchObject({ name: 'NotFoundError' });
    }
    t.expect(await repos.proofLaunchRepository.history('not-a-uuid')).toEqual([]);
    t.expect(await state()).toEqual(before);
    t.expect(before.history.map((e) => e.seq)).toEqual([3, 2, 1]);
    t.expect(ds.restaurant.id).not.toBe(OTHER);
  });

  t.it('the port has no way to edit or delete an entry: append, read, nothing else', async () => {
    const { repos } = get();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repos.proofLaunchRepository)).filter((m) => m !== 'constructor' && !m.startsWith('_'));
    t.expect(methods.filter((m) => /^(update|delete|remove|edit|set|replace|clear|upsert)/i.test(m))).toEqual([]);
    t.expect(['append', 'current', 'history'].every((m) => methods.includes(m))).toBe(true);
  });
}
