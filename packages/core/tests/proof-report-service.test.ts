import { describe, expect, it } from 'vitest';
import { can } from '../src/auth/permissions';
import type { Role } from '../src/auth/types';
import { buildDemoDataset } from '../src/demo/dataset';
import { createLogger } from '../src/logging/logger';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import { RecommendationCodeService } from '../src/services/recommendations/recommendation-code-service';
import { shiftServiceDay } from '../src/recommendation-code/service-day';
import { ProofReportService } from '../src/services/proof/proof-report-service';
import type { SalesRecord } from '../src/services/sales/types';

/** Spec 2026-11-18-owner-proof-report, step 4: the service over the memory store (AC5, AC8, AC10 core part, R10 to R12). */

const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const OWNER = { role: 'owner' as Role, membershipId: '00000000-0000-4000-8000-0000000000a1' };
const L = '2026-09-21';
const NOW = new Date('2026-12-01T10:00:00.000Z');
let ids = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function setup(now = NOW) {
  const store = MemoryStore.from(ds);
  const repos = createMemoryRepositories(store);
  const clock = { now: () => now };
  const service = new ProofReportService({ ...repos, clock, idGenerator: { uuid } });
  const codes = new RecommendationCodeService({ ...repos, clock, idGenerator: { uuid }, logger: createLogger(() => {}) });
  return { store, repos, service, codes };
}

/** 4 checks with food a day from L-28 to L+27: 5 of 14 with wine before the launch, 8 of 14 after; 2 of 14 carry a code after. */
function importSales(store: MemoryStore, launch = L) {
  let c = 0;
  const lines: SalesRecord[] = [];
  const add = (day: string, check: string, itemType: SalesRecord['itemType'], quantity: number, code: string | null = null) =>
    lines.push({ id: uuid(), businessDate: day, checkId: check, covers: 2, itemType, quantity, netAmount: quantity * 50, recommendationCode: code });
  for (let i = -28; i < 28; i++) {
    const day = shiftServiceDay(launch, i);
    for (let k = 0; k < 4; k++, c++) {
      const check = `${day}#${k}`;
      add(day, check, 'food', 1);
      const wine = i < 0 ? c % 14 < 5 : c % 14 < 8;
      if (wine) add(day, check, 'wine_bottle', 1, i >= 0 && c % 14 < 2 ? 'W7K' : null);
    }
  }
  store.salesLines.push(...lines.map((l) => ({ ...l, restaurantId: RID, importJobId: uuid(), replacedAt: null, replacedByJobId: null })));
}

describe('ProofReportService.getReport', () => {
  it('without a launch day: the reason no_launch_day, window 1, nothing in the log', async () => {
    const { service } = setup();
    const r = await service.getReport('halka');
    expect(r.report.reasons).toEqual(['no_launch_day']);
    expect(r.report.verdict).toBe('insufficient');
    expect(r.window).toBe(1);
    expect(r.launch).toEqual({ current: null, history: [], changes: 0 });
  });

  it('with a launch day and no import: no_sales_import', async () => {
    const { service } = setup();
    await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    expect((await service.getReport('halka', 1)).report.reasons).toEqual(['no_sales_import']);
  });

  it('reads the baseline and the window from the active lines, with the groups and the same code totals as RecommendationCodeService (AC8)', async () => {
    const { store, service, codes, repos } = setup();
    importSales(store);
    await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    // one code issued inside window 1 and matched by a till line (W7K), one issued and not matched
    const issue = (n: number, code: string, day: string) => repos.recommendationCodeRepository.tryIssue(RID, {
      id: uuid(), code, serviceDay: day, sessionId: `5e550000-0000-4000-8000-${String(n).padStart(12, '0')}`, source: 'guest', context: 'dish', wineId: ds.wines[0].id,
      dishIds: [ds.dishes[0].id], serving: 'bottle', menuVersion: '2026-09-01T08:00:00.000Z', tier: 'engine', engineVersion: 'wm-test', issuedAt: `${day}T19:00:00.000Z`
    });
    for (const day of [L, shiftServiceDay(L, 1), shiftServiceDay(L, 2)]) await issue(1, 'W7K', day);
    await issue(2, 'K4P', shiftServiceDay(L, 3));

    const { report, window } = await service.getReport('halka', 1);
    expect(window).toBe(1);
    expect(report.baseline).toMatchObject({ foodChecks: 112, foodChecksWithWine: 40, tradingDays: 28, period: { from: shiftServiceDay(L, -28), to: shiftServiceDay(L, -1) } });
    expect(report.window).toMatchObject({ foodChecks: 112, foodChecksWithWine: 64, tradingDays: 28 });
    expect(report.reasons).toEqual([]);
    expect(report.verdict).toBe('increase');
    expect(report.change!.lowPp).toBeGreaterThan(0);
    expect(report.groups!.withCode.foodChecks + report.groups!.withoutCode.foodChecks).toBe(112);
    expect(report.groups!.withCode.foodChecks).toBeGreaterThan(0);
    expect(report.dataThrough).toBe(shiftServiceDay(L, 27));
    // AC8
    const summary = await codes.summary('halka', report.window!.period);
    expect(summary.issued).toBe(4);
    expect(report.codes).toEqual(summary);
  });

  it('is deterministic: the same data and clock give the same report', async () => {
    const { store, service } = setup();
    importSales(store);
    await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    expect(await service.getReport('halka', 1)).toEqual(await service.getReport('halka', 1));
  });

  it('picks the newest window that has ended when none is asked for, and says an import that stops early does not reach it', async () => {
    const { store, service } = setup();
    importSales(store);
    await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    const r = await service.getReport('halka');
    expect(r.window).toBe(2);
    expect(r.report.reasons).toContain('window_not_imported');
    expect(r.report.verdict).toBe('insufficient');
    // window 3 is still running; the clock is the service's only source of time
    expect((await service.getReport('halka', 3)).report.reasons).toContain('window_incomplete');
  });

  it('refuses a window outside 1..12, a text that is not plain digits and a window that has not started (invalid_window)', async () => {
    const { service } = setup();
    await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    for (const w of [0, 13, -1, 1.5, 'abc', '1e9', '0x2', '+3', '2.0', '', '99999999999999999999', 4]) {
      await expect(service.getReport('halka', w), String(w)).rejects.toMatchObject({ name: 'ValidationError', code: 'invalid_window' });
    }
    // without a launch day the window is still validated
    const { service: bare } = setup();
    await expect(bare.getReport('halka', 13)).rejects.toMatchObject({ code: 'invalid_window' });
    expect((await bare.getReport('halka', '7')).window).toBe(7);
  });

  it('an unknown restaurant is NotFoundError', async () => {
    const { service } = setup();
    await expect(service.getReport('no-such-place')).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(service.setLaunchDay('no-such-place', { launchDay: L, expectedCurrent: null }, OWNER)).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('ProofReportService.setLaunchDay', () => {
  it('the first entry needs no reason; a later one does; the newest is current and the history shows the change (AC5)', async () => {
    const { service } = setup();
    const first = await service.setLaunchDay('halka', { launchDay: '2026-09-20', expectedCurrent: null }, OWNER);
    expect(first).toMatchObject({ seq: 1, launchDay: '2026-09-20', reason: null, setByRole: 'owner', setByMembershipId: OWNER.membershipId, setAt: NOW.toISOString() });
    await expect(service.setLaunchDay('halka', { launchDay: L, expectedCurrent: first.id }, OWNER)).rejects.toMatchObject({ code: 'reason_required' });
    await expect(service.setLaunchDay('halka', { launchDay: L, reason: '   ', expectedCurrent: first.id }, OWNER)).rejects.toMatchObject({ code: 'reason_required' });
    const second = await service.setLaunchDay('halka', { launchDay: L, reason: 'Guests started a day later', expectedCurrent: first.id }, { role: 'manager', membershipId: null });
    const { launch, report } = await service.getReport('halka', 1);
    expect(launch.current).toMatchObject({ id: second.id, seq: 2, launchDay: L, setByRole: 'manager' });
    expect(launch.history.map((e) => e.seq)).toEqual([2, 1]);
    expect(launch.history[1]).toMatchObject({ id: first.id, reason: null, launchDay: '2026-09-20' });
    expect(launch.changes).toBe(1);
    expect(report.launchDay).toBe(L);
  });

  it('flags a change made after window 1 of the replaced day had ended, and not one made in time', async () => {
    const late = setup();
    const a = await late.service.setLaunchDay('halka', { launchDay: '2026-09-20', expectedCurrent: null }, OWNER);
    await late.service.setLaunchDay('halka', { launchDay: L, reason: 'Corrected', expectedCurrent: a.id }, OWNER);
    expect((await late.service.getReport('halka', 1)).launch.history.map((e) => e.afterWindow1)).toEqual([true, false]);

    const early = setup(new Date('2026-09-25T10:00:00.000Z'));
    const b = await early.service.setLaunchDay('halka', { launchDay: '2026-09-20', expectedCurrent: null }, OWNER);
    await early.service.setLaunchDay('halka', { launchDay: '2026-09-22', reason: 'Corrected', expectedCurrent: b.id }, OWNER);
    expect((await early.service.getReport('halka', 1)).launch.history.map((e) => e.afterWindow1)).toEqual([false, false]);
  });

  it('a write that did not see the current entry, and the retry of one that succeeded, is a version conflict', async () => {
    const { service } = setup();
    const first = await service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER);
    await expect(service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, OWNER)).rejects.toMatchObject({ name: 'VersionConflictError' });
    await service.setLaunchDay('halka', { launchDay: '2026-09-22', reason: 'Corrected', expectedCurrent: first.id }, OWNER);
    await expect(service.setLaunchDay('halka', { launchDay: '2026-09-22', reason: 'Corrected', expectedCurrent: first.id }, OWNER)).rejects.toMatchObject({ name: 'VersionConflictError' });
    expect((await service.getReport('halka', 1)).launch.history).toHaveLength(2);
  });

  it('refuses a day in the future, before 2020, a wrong format and a body with a field it does not know (422)', async () => {
    const { service } = setup();
    const bad = ['2026-12-02', '2019-12-31', '2026-02-30', '21.09.2026', '2026-9-21', '', 20260921, null];
    for (const launchDay of bad) {
      await expect(service.setLaunchDay('halka', { launchDay, expectedCurrent: null }, OWNER), String(launchDay)).rejects.toMatchObject({ name: 'ValidationError', code: 'invalid_launch_day' });
    }
    // today's service day is allowed (the clock is 2026-12-01 10:00)
    await service.setLaunchDay('halka', { launchDay: '2026-12-01', expectedCurrent: null }, OWNER);
    const fresh = setup().service;
    await expect(fresh.setLaunchDay('halka', { launchDay: L, expectedCurrent: null, restaurantId: RID }, OWNER)).rejects.toMatchObject({ code: 'validation_failed', fields: { restaurantId: 'unknown_field' } });
    await expect(fresh.setLaunchDay('halka', { launchDay: L }, OWNER)).rejects.toMatchObject({ code: 'validation_failed', fields: { expectedCurrent: 'required' } });
    await expect(fresh.setLaunchDay('halka', { launchDay: L, expectedCurrent: 'x' }, OWNER)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(fresh.setLaunchDay('halka', { launchDay: L, expectedCurrent: null, reason: 'x'.repeat(201) }, OWNER)).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(fresh.setLaunchDay('halka', 'not an object', OWNER)).rejects.toMatchObject({ code: 'validation_failed' });
    expect((await fresh.getReport('halka', 1)).launch.history).toEqual([]);
  });

  it('only the owner and the general manager may set it (proof.manage); nothing is written for the others (AC10, core part)', async () => {
    const { service } = setup();
    for (const role of ['sommelier', 'waiter'] as Role[]) {
      await expect(service.setLaunchDay('halka', { launchDay: L, expectedCurrent: null }, { role, membershipId: null }), role).rejects.toMatchObject({ name: 'ForbiddenError' });
    }
    expect((await service.getReport('halka', 1)).launch.history).toEqual([]);
  });
});

describe('permissions of the results report (R10)', () => {
  it('proof.view and proof.manage belong to the owner and the general manager, not to the Wine Director or the waiter', () => {
    const roles: Role[] = ['owner', 'manager', 'sommelier', 'waiter'];
    expect(roles.filter((r) => can(r, 'proof.view'))).toEqual(['owner', 'manager']);
    expect(roles.filter((r) => can(r, 'proof.manage'))).toEqual(['owner', 'manager']);
  });
});
