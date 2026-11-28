import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LAUNCH, seedSales } from './proof-seed';
import { BISTRO, HALKA, base, bistroOwner, bistroSommelier, db, digest, errorCode, get, halkaManager, halkaSommelier, origin, payload, send, snapshotDatabase, type Session } from './boundaries';

/**
 * docs/security/threat-model.md T-43: the results report (spec 2026-11-18-owner-proof-report, R10 to R14; AC10 to AC13) on
 * PostgreSQL, over plain HTTP. The three checks of .ai/docs/engineering-standards.md §10: a positive control for BOTH
 * restaurants (each reads its own report and writes its own launch day), refused reads and writes (another slug, roles
 * without `proof.view` / `proof.manage`, a stray field, a missing or stale precondition), and the state AFTER the attempts as
 * whole payloads and a digest of every table. POS lines with recognisable check ids, codes and a session-like id are seeded
 * into both restaurants, so a leak of any of them into an answer is visible. The database is recorded first and put back.
 */
let restoreDatabase: (() => Promise<void>) | undefined;
const NO_ID = '00000000-0000-4000-8000-0000000000fe';

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  await queryDatabase(db(), 'delete from proof_launch_day', []);
  await seedSales(HALKA, 'HALKA', [40, 10], [40, 20]);
  await seedSales(BISTRO, 'BISTRO', [32, 8], [36, 12]);
}, 120_000);
afterAll(async () => { await restoreDatabase?.(); });

const report = (s: Session, slug: string, q = '') => get(s, `/api/v1/restaurants/${slug}/proof-report${q}`);
const current = async (s: Session, slug: string) => /"([^"]+)"/.exec((await report(s, slug)).headers.get('etag') ?? '')?.[1] ?? 'none';
/** the precondition as the caller can read it; a caller who cannot read the report sends a well-formed one, so a refusal is not about the header */
const setLaunch = async (s: Session, slug: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  send(s, 'POST', `/api/v1/restaurants/${slug}/proof-launch`, body, { 'if-match': `"${await current(s, slug)}"`, ...headers });
type Body = { window: number; report: { launchDay: string | null; verdict: string; reasons: string[]; baseline: { foodChecks: number; foodChecksWithWine: number }; window: { foodChecks: number; foodChecksWithWine: number } }; launch: { history: unknown[]; changes: number } };

describe('access boundaries of the results report (threat model T-43)', () => {
  it('T-43: both restaurants read their own report and set their own launch day; another slug, roles without proof.view or proof.manage, a stray field and a stale precondition are refused, and no table or payload changes', async () => {
    const tomasz = await halkaManager(); // Halka, general manager: reads and sets
    const marta = await halkaSommelier(); // Halka, Wine Director: neither
    const anna = await bistroOwner(); // Bistro, owner: reads and sets
    const sonia = await bistroSommelier(); // Bistro, Wine Director: neither

    // 1. positive control for BOTH sides: the very calls refused below work for the one who owns the data
    expect((await setLaunch(tomasz, HALKA, { launchDay: LAUNCH })).status).toBe(201);
    expect((await setLaunch(anna, BISTRO, { launchDay: LAUNCH })).status).toBe(201);
    const halkaBody = (await (await report(tomasz, HALKA, '?window=1')).json()) as Body;
    const bistroBody = (await (await report(anna, BISTRO, '?window=1')).json()) as Body;
    expect(halkaBody.report).toMatchObject({ launchDay: LAUNCH, baseline: { foodChecks: 40, foodChecksWithWine: 10 }, window: { foodChecks: 40, foodChecksWithWine: 20 } });
    expect(bistroBody.report).toMatchObject({ launchDay: LAUNCH, baseline: { foodChecks: 32, foodChecksWithWine: 8 }, window: { foodChecks: 36, foodChecksWithWine: 12 } });
    // the newest complete window is the default one (no `window` in the query)
    expect(((await (await report(tomasz, HALKA)).json()) as Body).window).toBeGreaterThanOrEqual(1);

    // 2. the state before: whole payloads of both restaurants (report, window 2, log) and a digest of every table
    const state = async () => ({
      halka1: await payload(tomasz, `/api/v1/restaurants/${HALKA}/proof-report?window=1`),
      halka2: await payload(tomasz, `/api/v1/restaurants/${HALKA}/proof-report?window=2`),
      bistro1: await payload(anna, `/api/v1/restaurants/${BISTRO}/proof-report?window=1`),
      bistro2: await payload(anna, `/api/v1/restaurants/${BISTRO}/proof-report?window=2`),
      tables: await digest()
    });
    const before = await state();
    expect(Object.keys(before.tables)).toContain('proof_launch_day');
    // R14 (AC13): only aggregates: no check id, recommendation code, session id, membership or POS text in an answer
    for (const text of [before.halka1, before.halka2, before.bistro1, before.bistro2]) expect(text).not.toMatch(/SECRETCHK|Z9Q|"sid"|check_?id|membership/i);

    // 3. refused reads: another restaurant's slug is 403, a role without proof.view is 403, no session is 401; no body carries the other side's data
    const foreignReads: Array<[string, Response, string]> = [
      ['bistro owner reads halka report', await report(anna, HALKA, '?window=1'), 'x'],
      ['halka manager reads bistro report', await report(tomasz, BISTRO, '?window=1'), 'SECRETCHK-BISTRO'],
      ['bistro wine director reads halka', await report(sonia, HALKA), 'SECRETCHK-HALKA']
    ];
    for (const [label, res] of foreignReads) {
      expect(res.status, label).toBe(403);
      expect(await res.text(), label).not.toMatch(/SECRETCHK|"baseline"|"foodChecks"/);
    }
    for (const [label, res] of [['halka wine director reads own', await report(marta, HALKA)], ['bistro wine director reads own', await report(sonia, BISTRO)]] as Array<[string, Response]>) {
      expect(res.status, label).toBe(403);
      expect(await errorCode(res), label).toBe('forbidden');
    }
    expect((await fetch(`${base()}/api/v1/restaurants/${HALKA}/proof-report`)).status).toBe(401);

    // 4. refused writes: another slug and a role without proof.manage are 403, a stray field 422, no or stale precondition 428 / 409
    const day = '2026-02-09';
    const halkaCurrent = await current(tomasz, HALKA);
    const bistroCurrent = await current(anna, BISTRO);
    const refused: Array<[string, Response, number]> = [
      ['bistro owner sets halka', await send(anna, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: halkaCurrent }), 403],
      ['halka manager sets bistro', await send(tomasz, 'POST', `/api/v1/restaurants/${BISTRO}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: bistroCurrent }), 403],
      ['halka wine director sets own', await send(marta, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: halkaCurrent }), 403],
      ['bistro wine director sets own', await send(sonia, 'POST', `/api/v1/restaurants/${BISTRO}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: bistroCurrent }), 403],
      ['stray restaurant field', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: halkaCurrent, restaurantId: NO_ID }), 422],
      ['future launch day', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: '2999-01-01', reason: 'x', expectedCurrent: halkaCurrent }), 422],
      ['bad launch day format', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: '09.02.2026', reason: 'x', expectedCurrent: halkaCurrent }), 422],
      ['second entry without a reason', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, expectedCurrent: halkaCurrent }), 422],
      ['no precondition', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x' }), 428],
      ['malformed If-Match', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x' }, { 'if-match': 'garbage' }), 400],
      ['stale precondition', await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: NO_ID }), 409],
      ['null precondition after an entry exists', await send(anna, 'POST', `/api/v1/restaurants/${BISTRO}/proof-launch`, { launchDay: day, reason: 'x', expectedCurrent: null }), 409]
    ];
    for (const [label, res, status] of refused) expect(res.status, label).toBe(status);
    for (const w of ['0', '13', '1e9', 'abc']) expect((await report(tomasz, HALKA, `?window=${w}`)).status, `window ${w}`).toBe(422);
    // no CSRF token and no session: refused before anything is read
    expect((await fetch(`${base()}/api/v1/restaurants/${HALKA}/proof-launch`, { method: 'POST', headers: { cookie: tomasz.cookie, origin: origin(), 'content-type': 'application/json' }, body: JSON.stringify({ launchDay: day, reason: 'x', expectedCurrent: halkaCurrent }) })).status).toBe(403);
    expect((await fetch(`${base()}/api/v1/restaurants/${HALKA}/proof-launch`, { method: 'POST', headers: { origin: origin(), 'content-type': 'application/json' }, body: JSON.stringify({ launchDay: day, reason: 'x', expectedCurrent: halkaCurrent }) })).status).toBe(401);

    // 5. the state after the attempts: every payload as before and every table digest equal (not a count)
    expect(await state()).toEqual(before);
    expect(await queryDatabase<{ slug: string; seq: number; launch_day: string }>(db(), `select r.slug, p.seq, to_char(p.launch_day, 'YYYY-MM-DD') as launch_day from proof_launch_day p join restaurant r on r.id = p.restaurant_id order by r.slug`, []))
      .toEqual([{ slug: BISTRO, seq: 1, launch_day: LAUNCH }, { slug: HALKA, seq: 1, launch_day: LAUNCH }]);

    // 6. the allowed second entry still works, only in its own restaurant, and leaves the other one untouched
    expect((await send(tomasz, 'POST', `/api/v1/restaurants/${HALKA}/proof-launch`, { launchDay: day, reason: 'first guests came a week later', expectedCurrent: halkaCurrent })).status).toBe(201);
    expect(await payload(anna, `/api/v1/restaurants/${BISTRO}/proof-report?window=1`)).toBe(before.bistro1);
    expect(((await (await report(tomasz, HALKA, '?window=1')).json()) as Body).launch.changes).toBe(1);
  });
});
