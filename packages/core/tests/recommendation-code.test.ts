import { describe, expect, it, vi } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { ENGINE_VERSION } from '../src/engine/scoring';
import { memorySink, createLogger } from '../src/logging/logger';
import { createMemoryRepositories, MAX_MEMORY_RECOMMENDATION_CODES, MemoryStore } from '../src/memory/memory-repositories';
import type { RecommendationCodeInput, RecommendationCodeRepository } from '../src/ports/repositories';
import { CODE_DIGITS, CODE_LETTERS, codeFromUuid, findCodeInText, isWholeCellCode, normalizeCode } from '../src/recommendation-code/code-format';
import { formatServiceTime, lastFullServiceDays, serviceDay, shiftServiceDay } from '../src/recommendation-code/service-day';
import {
  MAX_CODES_PER_SESSION_DAY, MAX_PERIOD_DAYS, MAX_STAFF_CODES_PER_SESSION_DAY, RecommendationCodeService, type IssueCodeInput
} from '../src/services/recommendations/recommendation-code-service';

/** Spec 2026-10-16-recommendation-code, phase 1: the code format, the service day and issuing on G8. */

const ds = buildDemoDataset({ ids: 'uuid' });
const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2d';
/** 20:00 in Warsaw on 2026-10-16 (CEST) */
const NOW = new Date('2026-10-16T18:00:00.000Z');
const SHORT = /^[ACDEFGHJKLMNPRTUVWXY][2-9][ACDEFGHJKLMNPRTUVWXY]$/;
const LONG = /^[ACDEFGHJKLMNPRTUVWXY][2-9][ACDEFGHJKLMNPRTUVWXY][2-9]$/;

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const randomish = (n: number) => {
  // a deterministic spread of hex digits, so candidates differ in the leading bytes
  let x = (n * 2654435761) >>> 0;
  const hex = Array.from({ length: 32 }, () => { x = (x * 1103515245 + 12345) >>> 0; return (x >>> 16 & 15).toString(16); }).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

function setup(opts: { ids?: () => string; now?: Date; repo?: (r: RecommendationCodeRepository) => RecommendationCodeRepository } = {}) {
  const repos = createMemoryRepositories(MemoryStore.from(ds));
  let n = 0;
  const log = memorySink();
  const codes = opts.repo ? opts.repo(repos.recommendationCodeRepository) : repos.recommendationCodeRepository;
  const service = new RecommendationCodeService({
    ...repos, recommendationCodeRepository: codes,
    clock: { now: () => opts.now ?? NOW },
    idGenerator: { uuid: opts.ids ?? (() => randomish(++n)) },
    logger: createLogger(log.sink)
  });
  return { repo: repos.recommendationCodeRepository, service, log };
}

const published = ds.dishes.filter((d) => d.status === 'published');
const draft = ds.dishes.find((d) => d.status !== 'published')!;
const glassWine = ds.wines.find((w) => w.active && w.glassPrice !== null)!;
const bottleOnly = ds.wines.find((w) => w.active && w.glassPrice === null)!;
const inactive = ds.wines.find((w) => !w.active)!;
/** the i-th long code, all distinct for i < 25 600 */
const codeOf = (i: number) => CODE_LETTERS[i % 20] + CODE_DIGITS[Math.floor(i / 20) % 8] + CODE_LETTERS[Math.floor(i / 160) % 20] + CODE_DIGITS[Math.floor(i / 3200) % 8];
const dayOf = (i: number) => new Date(Date.UTC(2030, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const session = (id = SID) => ({ id, isNew: false, source: 'link' as const });
const choice = (over: Partial<IssueCodeInput> = {}): IssueCodeInput =>
  ({ session: session(), source: 'guest', wineId: glassWine.id, serving: 'glass', dishIds: [published[0].id], tier: 'sommelier_primary', ...over });

describe('the code format (R1, AC1)', () => {
  it('has a 20-letter alphabet without look-alikes and the digits 2–9', () => {
    expect(CODE_LETTERS).toHaveLength(20);
    for (const ch of 'BIOQSZ') expect(CODE_LETTERS).not.toContain(ch);
    expect(CODE_DIGITS).toBe('23456789');
  });

  it('codeFromUuid gives only L D L / L D L D from the alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      expect(codeFromUuid(randomish(i), 3)).toMatch(SHORT);
      expect(codeFromUuid(randomish(i), 4)).toMatch(LONG);
    }
    expect(codeFromUuid('FFFFFFFF-FFFF-4FFF-BFFF-FFFFFFFFFFFF', 3)).toBe(codeFromUuid('ffffffff-ffff-4fff-bfff-ffffffffffff', 3));
    expect(() => codeFromUuid('not-a-uuid', 3)).toThrow();
  });

  it('codeFromUuid ignores the version and variant nibbles (positions 14 and 19)', () => {
    // UUIDs that differ only there give the same code; the digit after them does change it
    const a = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const b = 'a1b2c3d4-e5f6-1a7b-fc9d-0e1f2a3b4c5d';
    expect(codeFromUuid(a, 4)).toBe(codeFromUuid(b, 4));
    // the bytes read are a1 b2 c3 d4: 0xa1 % 20 = 1 → C, 0xb2 % 8 = 2 → 4, 0xc3 % 20 = 15 → U, 0xd4 % 8 = 4 → 6
    expect(codeFromUuid(a, 4)).toBe('C4U6');
    expect(codeFromUuid(a, 3)).toBe('C4U');
  });

  it('normalizeCode accepts case, spaces, dashes, # and a prefix; rejects anything else', () => {
    for (const raw of ['w7k', ' W-7K ', '#W7K', 'kod: W7K', 'Code W7K', 'KOD:w7k', 'w 7 k']) expect(normalizeCode(raw)).toBe('W7K');
    expect(normalizeCode('w7k3')).toBe('W7K3');
    for (const raw of ['W7O', 'W1K', 'BEZ', 'W7KK', 'W7', '', '7WK', 'W7K33', 'kod W7O', 'W7K-W7K', 'x'.repeat(40)]) expect(normalizeCode(raw)).toBeNull();
  });

  it('findCodeInText finds the first code token in a till comment', () => {
    expect(findCodeInText('Pan Kowalski, alergia, W7K')).toBe('W7K');
    expect(findCodeInText('kod:w7k3 stolik 4')).toBe('W7K3');
    expect(findCodeInText('#H4N')).toBe('H4N');
    expect(findCodeInText('XW7K')).toBeNull();
    expect(findCodeInText('W7KK')).toBeNull();
    expect(findCodeInText('łW7K')).toBeNull();   // a Polish letter is a letter, unlike in `\b`
    expect(findCodeInText('alergia na orzechy')).toBeNull();
  });

  it('isWholeCellCode accepts a cell that holds only a code', () => {
    expect(isWholeCellCode('W7K')).toBe(true);
    expect(isWholeCellCode('kod: W7K')).toBe(true);
    expect(isWholeCellCode('Wino W7K butelka')).toBe(false);
  });
});

describe('the service day (R2, AC2)', () => {
  const warsaw = (iso: string) => new Date(iso);
  it('ends at 04:00 Warsaw time', () => {
    expect(serviceDay(warsaw('2026-10-16T01:59:00.000Z'))).toBe('2026-10-15');   // 03:59 CEST
    expect(serviceDay(warsaw('2026-10-16T02:00:00.000Z'))).toBe('2026-10-16');   // 04:00 CEST
    expect(serviceDay(warsaw('2026-10-15T22:30:00.000Z'))).toBe('2026-10-15');   // 00:30 CEST on the 16th
    expect(serviceDay(warsaw('2026-01-01T02:59:00.000Z'))).toBe('2025-12-31');   // 03:59 CET, across a year
    expect(serviceDay(warsaw('2026-03-01T01:00:00.000Z'))).toBe('2026-02-28');   // 02:00 CET, across a month
  });

  it('uses the local date and hour on the nights the clocks change', () => {
    // 2026-03-29: 02:00 CET → 03:00 CEST
    expect(serviceDay(warsaw('2026-03-29T01:30:00.000Z'))).toBe('2026-03-28');   // 03:30 CEST
    expect(serviceDay(warsaw('2026-03-29T02:10:00.000Z'))).toBe('2026-03-29');   // 04:10 CEST (now − 4 h would say the 28th)
    // 2026-10-25: 03:00 CEST → 02:00 CET
    expect(serviceDay(warsaw('2026-10-25T02:30:00.000Z'))).toBe('2026-10-24');   // 03:30 CET
    expect(serviceDay(warsaw('2026-10-25T03:10:00.000Z'))).toBe('2026-10-25');   // 04:10 CET
  });

  it('formats the time of day in Warsaw', () => {
    expect(formatServiceTime(new Date('2026-10-16T17:42:00.000Z'), 'pl')).toBe('19:42');
    expect(formatServiceTime(new Date('2026-01-16T17:42:00.000Z'), 'en')).toBe('18:42');
  });
});

describe('RecommendationCodeService.issue (R3–R5, R13, Q4, Q18)', () => {
  it('issues a short code and stores the choice with validated values only', async () => {
    const { service, repo } = setup();
    const issued = await service.issue('halka', choice());
    expect(issued).toEqual({ code: expect.stringMatching(SHORT), serviceDay: '2026-10-16', issuedAt: NOW.toISOString() });
    expect(await repo.findByCode(ds.restaurant.id, '2026-10-16', issued!.code)).toEqual({
      code: issued!.code, serviceDay: '2026-10-16', sessionId: SID, source: 'guest', context: 'dish', wineId: glassWine.id,
      dishIds: [published[0].id], serving: 'glass', menuVersion: ds.restaurant.publishedAt, tier: 'sommelier_primary',
      engineVersion: ENGINE_VERSION, issuedAt: NOW.toISOString(), confirmedAt: null
    });
  });

  it('gives the same code for the same choice (refresh, back) and a new one for another choice (R3)', async () => {
    const { service, repo } = setup();
    const first = await service.issue('halka', choice());
    expect(await service.issue('halka', choice())).toEqual(first);
    expect(await repo.countBySession(ds.restaurant.id, '2026-10-16', SID)).toBe(1);
    const bottle = await service.issue('halka', choice({ serving: 'bottle' }));
    const other = await service.issue('halka', choice({ session: session('7c9e6679-7425-40de-944b-e07fc1f90ae7') }));
    expect(new Set([first!.code, bottle!.code, other!.code]).size).toBe(3);
    // the next service day starts again
    const { service: tomorrow } = setup({ now: new Date('2026-10-17T18:00:00.000Z') });
    expect((await tomorrow.issue('halka', choice()))?.serviceDay).toBe('2026-10-17');
  });

  it('derives the context from validated dishes only (R5, AC5)', async () => {
    const { service, repo } = setup();
    const stored = async (input: IssueCodeInput) => repo.findByCode(ds.restaurant.id, '2026-10-16', (await service.issue('halka', input))!.code);
    const [a, b, c] = published.map((d) => d.id);
    const foreign = '00000000-0000-4000-8000-0000000000aa';
    expect(await stored(choice({ dishIds: [] }))).toMatchObject({ context: 'direct', dishIds: [], tier: null });
    expect(await stored(choice({ dishIds: [c, a, b, a], tier: 'engine' }))).toMatchObject({ context: 'table', dishIds: [a, b, c].sort(), tier: null });
    // foreign, unknown and unpublished ids are dropped: one valid dish left is a dish choice
    expect(await stored(choice({ dishIds: [b, foreign, draft.id], serving: 'bottle' }))).toMatchObject({ context: 'dish', dishIds: [b], tier: 'sommelier_primary' });
    expect(await stored(choice({ dishIds: [foreign, draft.id], serving: 'bottle', wineId: bottleOnly.id }))).toMatchObject({ context: 'direct', dishIds: [] });
  });

  it('keeps a glass only for a wine poured by the glass, and the tier only for a guest dish choice (Q18)', async () => {
    const { service, repo } = setup();
    const glass = await service.issue('halka', choice({ wineId: bottleOnly.id, serving: 'glass' }));
    expect((await repo.findByCode(ds.restaurant.id, '2026-10-16', glass!.code))?.serving).toBe('bottle');
    const staff = await service.issue('halka', choice({ source: 'staff', serving: 'bottle' }));
    expect(await repo.findByCode(ds.restaurant.id, '2026-10-16', staff!.code)).toMatchObject({ source: 'staff', tier: null });
    const none = await service.issue('halka', choice({ tier: undefined, wineId: ds.wines.find((w) => w.active && w.id !== glassWine.id && w.id !== bottleOnly.id)!.id }));
    expect((await repo.findByCode(ds.restaurant.id, '2026-10-16', none!.code))?.tier).toBeNull();
  });

  it('gives no code for an inactive or unknown wine, an unknown restaurant or more than 12 dishes (R4, R5, AC13)', async () => {
    const { service, repo } = setup();
    expect(await service.issue('halka', choice({ wineId: inactive.id, serving: 'bottle' }))).toBeNull();
    expect(await service.issue('halka', choice({ wineId: '00000000-0000-4000-8000-0000000000bb' }))).toBeNull();
    expect(await service.issue('no-such-place', choice())).toBeNull();
    expect(await repo.countBySession(ds.restaurant.id, '2026-10-16', SID)).toBe(0);
    // 13 distinct published dishes (the demo menu has fewer, so a store with more is built)
    const store = MemoryStore.from(ds);
    const extra = Array.from({ length: 13 }, (_, i) => ({ ...published[0], id: uuid(0xd00 + i), name: `Dish ${i}` }));
    store.dishes.get(ds.restaurant.id)!.push(...extra);
    const repos = createMemoryRepositories(store);
    let n = 0;
    const big = new RecommendationCodeService({ ...repos, clock: { now: () => NOW }, idGenerator: { uuid: () => randomish(++n) }, logger: createLogger(() => {}) });
    expect(await big.issue('halka', choice({ dishIds: extra.map((d) => d.id) }))).toBeNull();
    expect(await big.issue('halka', choice({ dishIds: extra.slice(0, 12).map((d) => d.id) }))).not.toBeNull();
  });

  it('stops at 30 recommendations per guest session and 300 per staff session (R13, AC13)', async () => {
    const { service } = setup();
    const table = (i: number) => [published[i % published.length].id, published[(i + 1) % published.length].id, published[(i + 2) % published.length].id];
    const wines = ds.wines.filter((w) => w.active);
    const distinct = (i: number): IssueCodeInput => choice({ wineId: wines[i % wines.length].id, serving: 'bottle', dishIds: table(Math.floor(i / wines.length)) });
    let issued = 0;
    for (let i = 0; i < MAX_CODES_PER_SESSION_DAY + 1; i++) if (await service.issue('halka', distinct(i))) issued++;
    expect(issued).toBe(MAX_CODES_PER_SESSION_DAY);
    expect(await service.issue('halka', distinct(MAX_CODES_PER_SESSION_DAY + 1))).toBeNull();
    // staff: the higher limit
    const staffRepo = createMemoryRepositories(MemoryStore.from(ds));
    const staffSid = '9b2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
    for (let i = 0; i < MAX_STAFF_CODES_PER_SESSION_DAY; i++) {
      await staffRepo.recommendationCodeRepository.tryIssue(ds.restaurant.id, {
        id: uuid(0x10000 + i), code: codeOf(i), serviceDay: '2026-10-16', sessionId: staffSid, source: 'staff', context: 'direct',
        wineId: glassWine.id, dishIds: [uuid(i)], serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: NOW.toISOString()
      } satisfies RecommendationCodeInput);
    }
    let n = 0;
    const staff = new RecommendationCodeService({ ...staffRepo, clock: { now: () => NOW }, idGenerator: { uuid: () => randomish(++n) }, logger: createLogger(() => {}) });
    expect(await staffRepo.recommendationCodeRepository.countBySession(ds.restaurant.id, '2026-10-16', staffSid)).toBe(MAX_STAFF_CODES_PER_SESSION_DAY);
    expect(await staff.issue('halka', choice({ source: 'staff', session: session(staffSid) }))).toBeNull();
    expect(await staff.issue('halka', choice({ source: 'guest', session: session(staffSid) }))).toBeNull();
    expect(await staff.issue('halka', choice({ source: 'staff' }))).not.toBeNull();
  });

  it('moves to four characters after six taken short codes, and gives up after six more (Q4, AC4)', async () => {
    // every candidate shares its first four bytes: the same short code, then the same long code
    let n = 0;
    const colliding = () => `a1b2c3d4-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
    const { service, repo, log } = setup({ ids: colliding });
    const first = await service.issue('halka', choice());
    expect(first?.code).toBe('C4U');
    expect(n).toBe(1);
    const second = await service.issue('halka', choice({ serving: 'bottle' }));
    expect(second?.code).toBe('C4U6');
    expect(n).toBe(1 + 7);
    expect(await service.issue('halka', choice({ dishIds: [] }))).toBeNull();
    expect(n).toBe(8 + 12);
    expect(await repo.countBySession(ds.restaurant.id, '2026-10-16', SID)).toBe(2);
    expect(log.lines.filter((l) => l.includes('recommendation code space exhausted'))).toHaveLength(1);
  });

  it('the memory store keeps at most 10 000 recommendations, oldest out first (R11)', async () => {
    const { repo } = setup();
    const total = MAX_MEMORY_RECOMMENDATION_CODES + 5;
    for (let i = 0; i < total; i++) {
      await repo.tryIssue(ds.restaurant.id, {
        id: uuid(i), code: 'C4U', serviceDay: dayOf(i), sessionId: SID, source: 'guest', context: 'direct', wineId: glassWine.id, dishIds: [],
        serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: NOW.toISOString()
      });
    }
    expect(await repo.findByCode(ds.restaurant.id, dayOf(4), 'C4U')).toBeNull();
    expect(await repo.findByCode(ds.restaurant.id, dayOf(5), 'C4U')).not.toBeNull();
    expect((await repo.totals(ds.restaurant.id, { from: dayOf(0), to: dayOf(total) })).issued).toBe(MAX_MEMORY_RECOMMENDATION_CODES);
    // 10 005 inserts, each scanning the store: ~5 s on a CI runner with coverage, over the default 5 s timeout
  }, 30_000);
});

describe('windows in service days (E10 F4)', () => {
  it('shiftServiceDay moves by calendar days across months, years and leap days', () => {
    expect(shiftServiceDay('2026-10-16', -1)).toBe('2026-10-15');
    expect(shiftServiceDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftServiceDay('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftServiceDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftServiceDay('2026-02-30', 0)).toBe('2026-03-02');   // not a real date: normalized
  });

  it('lastFullServiceDays: the 28 service days before the current one, both ends inclusive', () => {
    expect(lastFullServiceDays(NOW, 28)).toEqual({ from: '2026-09-18', to: '2026-10-15' });
    // 02:00 in Warsaw on the 17th still belongs to the service day of the 16th
    expect(lastFullServiceDays(new Date('2026-10-17T00:00:00.000Z'), 28)).toEqual({ from: '2026-09-18', to: '2026-10-15' });
    expect(lastFullServiceDays(new Date('2026-10-17T02:00:00.000Z'), 28)).toEqual({ from: '2026-09-19', to: '2026-10-16' });
    expect(lastFullServiceDays(NOW, 1)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
  });
});

describe('RecommendationCodeService.pairStats (R12, Q12)', () => {
  const dish = published[0];
  async function issued(repo: RecommendationCodeRepository, i: number, over: Partial<RecommendationCodeInput> = {}) {
    await repo.tryIssue(ds.restaurant.id, {
      id: uuid(0x20000 + i), code: codeOf(i), serviceDay: '2026-10-15', sessionId: uuid(0x30000 + i), source: 'guest', context: 'dish',
      wineId: glassWine.id, dishIds: [dish.id], serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: NOW.toISOString(), ...over
    });
  }

  it('reads the rows of the restaurant for the period: dish and table rows, no direct ones', async () => {
    const { service, repo } = setup();
    await issued(repo, 1);
    await issued(repo, 2);
    await repo.setConfirmed(ds.restaurant.id, '2026-10-15', codeOf(2), NOW, 'staff_view');
    await issued(repo, 3, { context: 'table', dishIds: [published[0].id, published[1].id].sort() });
    await issued(repo, 4, { context: 'direct', dishIds: [] });
    await issued(repo, 5, { serviceDay: '2026-10-14' });
    const stats = await service.pairStats('halka', { from: '2026-10-15', to: '2026-10-15' });
    expect(stats.filter((s) => s.context === 'dish')).toEqual([
      { dishId: dish.id, wineId: glassWine.id, context: 'dish', issued: 2, staffConfirmed: 1, posMatched: 0, ordered: 1 }
    ]);
    expect(stats.filter((s) => s.context === 'table')).toHaveLength(2);
    expect(stats.every((s) => s.context !== 'direct')).toBe(true);
  });

  it('rejects an invalid period (invalid_period) and an unknown restaurant (NotFoundError)', async () => {
    const { service } = setup();
    for (const period of [
      { from: '2026-10-16', to: '2026-10-15' }, { from: '2026-02-30', to: '2026-03-02' }, { from: '16.10.2026', to: '2026-10-16' },
      { from: '2025-10-15', to: '2026-10-16' }
    ]) {
      await expect(service.pairStats('halka', period)).rejects.toMatchObject({ name: 'ValidationError', code: 'invalid_period' });
    }
    expect(MAX_PERIOD_DAYS).toBe(366);
    await expect(service.pairStats('halka', { from: '2025-10-16', to: '2026-10-16' })).resolves.toEqual([]);
    await expect(service.pairStats('nowhere', { from: '2026-10-15', to: '2026-10-15' })).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

/** Spec 2026-10-16-recommendation-code, phase 2: the waiter finds a code on G9 and marks it "Ordered" (R6, R7, Q7, AC8). */
describe('RecommendationCodeService.lookup / confirm / undo (R6, R7, AC8)', () => {
  const OTHER_RESTAURANT = '00000000-0000-4000-8000-00000000beef';
  /** a mutable clock: the test moves the time on */
  const at = (iso: string) => ({ now: new Date(iso) });
  const notFound = { name: 'NotFoundError', code: 'code_not_found' };

  it('finds today\'s code by any spelling the waiter types, with the wine', async () => {
    const { service } = setup();
    const issued = (await service.issue('halka', choice()))!;
    const spelled = ` ${issued.code.toLowerCase().split('').join('-')} `;
    const found = await service.lookup('halka', spelled);
    expect(found?.record).toMatchObject({ code: issued.code, serviceDay: '2026-10-16', wineId: glassWine.id, dishIds: [published[0].id], serving: 'glass', confirmedAt: null });
    expect(found?.wine?.id).toBe(glassWine.id);
    expect(await service.lookup('halka', `kod: #${issued.code}`)).toEqual(found);
  });

  it('gives the same null for an unknown, malformed, foreign or yesterday\'s code and an unknown slug — no oracle (R6, Q15)', async () => {
    const opts = at('2026-10-16T18:00:00.000Z');
    const { service, repo } = setup(opts);
    const issued = (await service.issue('halka', choice()))!;
    // a code of another restaurant on the same day
    await repo.tryIssue(OTHER_RESTAURANT, {
      id: uuid(900), code: 'K3M', serviceDay: '2026-10-16', sessionId: SID, source: 'guest', context: 'direct', wineId: glassWine.id, dishIds: [],
      serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: opts.now.toISOString()
    });
    const findByCode = vi.spyOn(repo, 'findByCode');
    for (const raw of ['W7O', 'W1K', 'BEZ', 'W7KK', '', 'x'.repeat(40)]) expect(await service.lookup('halka', raw)).toBeNull();
    expect(findByCode).not.toHaveBeenCalled();
    expect(await service.lookup('halka', 'K3M')).toBeNull();
    expect(await service.lookup('nowhere', issued.code)).toBeNull();
    // 03:59 the next night is still the same service day; 04:00 is the next one
    opts.now = new Date('2026-10-17T01:59:00.000Z');
    expect(await service.lookup('halka', issued.code)).not.toBeNull();
    opts.now = new Date('2026-10-17T02:00:00.000Z');
    expect(await service.lookup('halka', issued.code)).toBeNull();
  });

  it('"Ordered" is idempotent: a second confirmation keeps the first time; "Undo" clears it (R7)', async () => {
    const opts = at('2026-10-16T17:42:00.000Z');
    const { service } = setup(opts);
    const { code } = (await service.issue('halka', choice()))!;
    const first = await service.confirm('halka', code, 'staff_view');
    expect(first.record.confirmedAt).toBe('2026-10-16T17:42:00.000Z');
    expect(first.wine?.id).toBe(glassWine.id);
    opts.now = new Date('2026-10-16T18:10:00.000Z');
    expect((await service.confirm('halka', code.toLowerCase(), 'staff_view')).record.confirmedAt).toBe('2026-10-16T17:42:00.000Z');
    expect((await service.undo('halka', code, 'staff_view')).record.confirmedAt).toBeNull();
    expect((await service.undo('halka', code, 'staff_view')).record.confirmedAt).toBeNull();
    expect((await service.confirm('halka', code, 'staff_view')).record.confirmedAt).toBe('2026-10-16T18:10:00.000Z');
    expect((await service.lookup('halka', code))?.record.confirmedAt).toBe('2026-10-16T18:10:00.000Z');
  });

  it('confirm and undo refuse anything but today\'s code of this restaurant with code_not_found and change nothing (AC8)', async () => {
    const opts = at('2026-10-16T18:00:00.000Z');
    const { service, repo } = setup(opts);
    const { code } = (await service.issue('halka', choice()))!;
    await service.confirm('halka', code, 'staff_view');
    for (const raw of ['W7O', 'A2A', '']) {
      await expect(service.confirm('halka', raw, 'staff_view')).rejects.toMatchObject(notFound);
      await expect(service.undo('halka', raw, 'staff_view')).rejects.toMatchObject(notFound);
    }
    await expect(service.undo('nowhere', code, 'staff_view')).rejects.toMatchObject(notFound);
    // the form was opened before 04:00 and sent after it: yesterday's code is not found, its state stays
    opts.now = new Date('2026-10-17T02:30:00.000Z');
    await expect(service.undo('halka', code, 'staff_view')).rejects.toMatchObject(notFound);
    await expect(service.confirm('halka', code, 'staff_view')).rejects.toMatchObject(notFound);
    expect((await repo.findByCode(ds.restaurant.id, '2026-10-16', code))?.confirmedAt).toBe('2026-10-16T18:00:00.000Z');
  });
});
