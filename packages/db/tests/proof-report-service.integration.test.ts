import type { MikroORM } from '@mikro-orm/postgresql';
import {
  buildDemoDataset, createLogger, createMemoryRepositories, MemoryStore, ProofReportService, RecommendationCodeService, shiftServiceDay,
  type ImportJob, type Repositories, type SalesRecord
} from '@wine-match/core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { freshDatabase, pgRepos, resetData } from './support/pg';

/**
 * The results report service on real PostgreSQL (spec 2026-11-18-owner-proof-report, step 4, AC3, AC8, AC10 core part):
 * the same sales lines, codes and launch days go through the memory store and through PostgreSQL, and the whole report
 * (counts, rate, groups, code totals, launch log) is equal; the code totals equal `RecommendationCodeService.summary`.
 */
const ds = buildDemoDataset({ ids: 'uuid' });
const RID = ds.restaurant.id;
const baseUrl = inject('databaseUrl');
const L = '2026-09-21';
const NOW = new Date('2026-12-01T10:00:00.000Z');
const OWNER = { role: 'owner' as const, membershipId: null };
let ids = 0;
const uuid = (prefix: string) => `${prefix}-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

function salesLines(): SalesRecord[] {
  const lines: SalesRecord[] = [];
  let c = 0;
  const add = (day: string, check: string, itemType: SalesRecord['itemType'], recommendationCode: string | null = null) =>
    lines.push({ id: uuid('5a1e5000'), businessDate: day, checkId: check, covers: 2, itemType, quantity: 1, netAmount: 50, recommendationCode });
  for (let i = -28; i < 28; i++) {
    const day = shiftServiceDay(L, i);
    for (let k = 0; k < 4; k++, c++) {
      add(day, `${day}#${k}`, 'food');
      if (i < 0 ? c % 14 < 5 : c % 14 < 8) add(day, `${day}#${k}`, 'wine_bottle', i >= 0 && c % 14 < 2 ? 'W7K' : null);
    }
  }
  return lines;
}

async function load(repos: Repositories) {
  const job: ImportJob = {
    id: uuid('5a1e0b00'), restaurantId: RID, kind: 'sales', fileName: 'sales.csv', fileType: 'csv', fileSize: 100, status: 'preview_ready', parser: 'csv',
    rows: [], notes: [], error: null, createdBy: 'Test', createdAt: '2026-12-01T08:00:00.000Z', confirmedAt: null, result: null
  };
  await repos.importRepository.create(job);
  const records = salesLines();
  const checks = new Map(records.map((r) => [`${r.businessDate}|${r.checkId}`, { businessDate: r.businessDate, checkId: r.checkId }]));
  await repos.importRepository.confirm(RID, job.id, { kind: 'sales', records, checks: [...checks.values()], result: { created: records.length, updated: 0, skipped: 0, suggestions: 0 } }, '2026-12-01T09:00:00.000Z');
  for (const [n, code, day] of [[1, 'W7K', L], [2, 'K4P', shiftServiceDay(L, 3)]] as const) {
    await repos.recommendationCodeRepository.tryIssue(RID, {
      id: uuid('c0de0000'), code, serviceDay: day, sessionId: uuid(`5e55000${n}`), source: 'guest', context: 'dish', wineId: ds.wines[0].id, dishIds: [ds.dishes[0].id],
      serving: 'bottle', menuVersion: '2026-09-01T08:00:00.000Z', tier: 'engine', engineVersion: 'wm-test', issuedAt: `${day}T19:00:00.000Z`
    });
  }
}

describe('ProofReportService on PostgreSQL', () => {
  let orm: MikroORM;
  beforeAll(async () => { orm = await freshDatabase(baseUrl, 'winematch_proof_service_test'); await resetData(orm); }, 120_000);
  afterAll(async () => { await orm?.close(true); });

  const service = (repos: Repositories) => {
    let n = 0;
    return new ProofReportService({ ...repos, clock: { now: () => NOW }, idGenerator: { uuid: () => `9c000000-0000-4000-8000-${String(++n).padStart(12, '0')}` } });
  };

  it('gives the same report as the memory store, and the code totals of RecommendationCodeService (AC3, AC8)', async () => {
    const mem = createMemoryRepositories(MemoryStore.from(ds));
    const pg = pgRepos(orm);
    await load(mem);
    await load(pg);
    const run = async (repos: Repositories) => {
      const s = service(repos);
      const first = await s.setLaunchDay('halka', { launchDay: '2026-09-20', expectedCurrent: null }, OWNER);
      await s.setLaunchDay('halka', { launchDay: L, reason: 'Corrected', expectedCurrent: first.id }, OWNER);
      return { report: await s.getReport('halka', 1), later: await s.getReport('halka'), codes: await new RecommendationCodeService({ ...repos, clock: { now: () => NOW }, idGenerator: { uuid: () => '9d000000-0000-4000-8000-000000000001' }, logger: createLogger(() => {}) }).summary('halka', { from: L, to: shiftServiceDay(L, 27) }) };
    };
    const fromMemory = await run(mem);
    const fromPg = await run(pg);
    expect(fromPg).toEqual(fromMemory);
    expect(fromPg.report.report.baseline).toMatchObject({ foodChecks: 112, foodChecksWithWine: 40 });
    expect(fromPg.report.report.window).toMatchObject({ foodChecks: 112, foodChecksWithWine: 64 });
    expect(fromPg.report.report.verdict).toBe('increase');
    expect(fromPg.report.report.groups!.withCode.foodChecks).toBeGreaterThan(0);
    expect(fromPg.report.report.codes).toEqual(fromPg.codes);
    expect(fromPg.report.launch.history.map((e) => e.seq)).toEqual([2, 1]);
    expect(fromPg.later.window).toBe(2);
  });

  it('refuses a role without proof.manage and writes nothing', async () => {
    const repos = pgRepos(orm);
    const before = await repos.proofLaunchRepository.history(RID);
    await expect(service(repos).setLaunchDay('halka', { launchDay: L, reason: 'x', expectedCurrent: before[0].id }, { role: 'sommelier', membershipId: null })).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(await repos.proofLaunchRepository.history(RID)).toEqual(before);
  });
});
