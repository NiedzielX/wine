import { describe, expect, it } from 'vitest';
import { GET as reportGet } from '@/app/api/v1/restaurants/[slug]/proof-report/route';
import { POST as launchPost } from '@/app/api/v1/restaurants/[slug]/proof-launch/route';
import { jsonReq, loginAs, req } from './helpers';

/**
 * Spec 2026-11-18-owner-proof-report, step 5 (R10, R11; AC10, AC12): the two routes of the results report on the in-memory data
 * source. Owner and general manager read and write; the Wine Director is refused both; a stale or missing precondition is
 * 409 or 428; a bad window or launch day is 422, never 500. The first test starts from a restaurant without a launch day.
 */
const URL0 = 'http://localhost:3000/x';
const slugCtx = (slug = 'halka') => ({ params: Promise.resolve({ slug }) });
type Session = { cookie: string; csrf: string };
const json = async (r: Response): Promise<ReturnType<typeof JSON.parse>> => r.json();
const read = (s: Session | null, q = '', slug?: string) => reportGet(req(`${URL0}${q}`, s ? { cookie: s.cookie } : {}), slugCtx(slug));
const write = (s: Session | null, body: unknown, headers: Record<string, string> = {}, slug?: string) =>
  launchPost(jsonReq(URL0, body, 'POST', s ? { cookie: s.cookie, 'x-csrf-token': s.csrf, ...headers } : headers), slugCtx(slug));
const etag = (r: Response) => /"([^"]+)"/.exec(r.headers.get('etag') ?? '')?.[1];

describe('proof routes', () => {
  it('reads an empty report and the log precondition, and refuses a role without proof.view', async () => {
    const tomasz = await loginAs('tomasz@halka.pl');
    const marta = await loginAs('marta@halka.pl');
    const res = await read(tomasz);
    expect(res.status).toBe(200);
    expect(etag(res)).toBe('none');
    const body = await json(res);
    expect(body.report).toMatchObject({ launchDay: null, verdict: 'insufficient', reasons: ['no_launch_day'] });
    expect(body.launch).toEqual({ current: null, history: [], changes: 0 });
    expect((await read(marta)).status).toBe(403);
    expect((await read(null)).status).toBe(401);
    expect((await read(tomasz, '', 'nowhere')).status).toBe(403);
  });

  it('answers 422 for a window that is not a whole number from 1 to 12', async () => {
    const tomasz = await loginAs('tomasz@halka.pl');
    for (const w of ['0', '13', '1e9', 'abc', '', '2.0', '-1', '0x2']) {
      const res = await read(tomasz, `?window=${w}`);
      expect(res.status, w).toBe(422);
      expect((await json(res)).error.code, w).toBe('invalid_window');
    }
    expect((await read(tomasz, '?window=1')).status).toBe(200);
  });

  it('writes the launch day with a precondition (428, 400, 422, 409), refuses roles and stray fields, and appends with a reason', async () => {
    const tomasz = await loginAs('tomasz@halka.pl');
    const marta = await loginAs('marta@halka.pl');
    const L = '2026-01-05';
    const body = { launchDay: L, expectedCurrent: null };
    // refused first: nothing may change
    expect((await write(marta, body)).status).toBe(403);
    expect((await write(null, body)).status).toBe(401);
    expect((await write(tomasz, { launchDay: L })).status).toBe(428);
    expect((await write(tomasz, { launchDay: L }, { 'if-match': 'garbage' })).status).toBe(400);
    expect((await write(tomasz, { ...body, restaurantId: 'x' })).status).toBe(422);
    expect((await write(tomasz, { ...body, launchDay: '2999-01-01' })).status).toBe(422);
    expect((await write(tomasz, { ...body, launchDay: '2026-13-45' })).status).toBe(422);
    expect((await write(tomasz, { launchDay: L, expectedCurrent: null }, { 'if-match': '"00000000-0000-4000-8000-000000000001"' })).status).toBe(422);
    expect((await json(await read(tomasz))).launch.history).toEqual([]);

    const first = await write(tomasz, { launchDay: L }, { 'if-match': '"none"' });
    expect(first.status).toBe(201);
    const entry = await json(first);
    expect(entry).toMatchObject({ seq: 1, launchDay: L, reason: null, setByRole: 'manager' });
    expect(entry).not.toHaveProperty('setByMembershipId');
    expect(etag(first)).toBe(entry.id);

    // a stale precondition is 409 and changes nothing; the second entry needs a reason
    expect((await write(tomasz, { launchDay: '2026-01-12', reason: 'moved', expectedCurrent: null })).status).toBe(409);
    const noReason = await write(tomasz, { launchDay: '2026-01-12', expectedCurrent: entry.id });
    expect(noReason.status).toBe(422);
    expect((await json(noReason)).error.code).toBe('reason_required');
    const second = await write(tomasz, { launchDay: '2026-01-12', reason: 'first guests came a week later' }, { 'if-match': `"${entry.id}"` });
    expect(second.status).toBe(201);

    const after = await json(await read(tomasz));
    expect(after.launch.history.map((h: { seq: number }) => h.seq)).toEqual([2, 1]);
    expect(after.launch.changes).toBe(1);
    expect(after.report.launchDay).toBe('2026-01-12');
    // nothing but aggregates and the role of the writer
    const text = JSON.stringify(after);
    expect(text).not.toMatch(/membership|checkId|check_id|"sid"/i);
  });
});
