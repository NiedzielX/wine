import { queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base, db, get, halkaManager, halkaSommelier, runAction, snapshotDatabase, type Session } from './boundaries';
import { LAUNCH, seedSales } from './proof-seed';

/**
 * A33 "Results report" (spec 2026-11-18-owner-proof-report; AC4, AC5, AC7, AC9, AC10, AC13, AC15) on the built app and PostgreSQL,
 * over plain HTTP, the way a browser without JavaScript sends it: the page is the server's HTML, the launch day goes in as a plain
 * form post to the server action. POS lines with recognisable check ids and a code are seeded into Halka (the numbers of H2 of the
 * specification: 42 of 120 before, 65 of 130 after). The files share one database in sequence: this one records it first, starts
 * Halka without a launch day or sales, and puts everything back at the end. The layout at 390 and 1440 px is
 * `proof-report-layout.e2e.test.ts`.
 */
let restoreDatabase: (() => Promise<void>) | undefined;
let manager: Session;
let sommelier: Session;

const page = async (s: Session, q = '', lang: 'en' | 'pl' = 'en') => {
  const res = await fetch(`${base()}/admin/halka/proof${q}`, { headers: { cookie: `${s.cookie}; wm_lang=${lang}` }, redirect: 'manual' });
  return { status: res.status, html: await res.text() };
};
/** the visible text: no markup and no script (the RSC payload of the page is a script) */
const text = (html: string) => html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const currentId = (html: string) => /name="expectedCurrent"[^>]*value="([0-9a-f-]{36})"|value="([0-9a-f-]{36})"[^>]*name="expectedCurrent"/.exec(html)?.slice(1).find(Boolean) ?? '';
const setDay = (s: Session, fields: Record<string, string>) => runAction(s, 'setProofLaunchDay', 'halka', { back: '/admin/halka/proof', ...fields }, ['/proof']);
const rows = async () => queryDatabase<{ seq: number; launch_day: string; reason: string | null }>(db(), `select seq, to_char(launch_day, 'YYYY-MM-DD') as launch_day, reason from proof_launch_day p join restaurant r on r.id = p.restaurant_id where r.slug = 'halka' order by seq`, []);
const FORBIDDEN_WORDS = /\bAI\b|gwarantowan|dzięki Wine Match|efekt Wine Match/i;

beforeAll(async () => {
  restoreDatabase = await snapshotDatabase();
  await queryDatabase(db(), 'delete from proof_launch_day', []);
  await queryDatabase(db(), `delete from sales_record where restaurant_id = (select id from restaurant where slug = 'halka')`, []);
  manager = await halkaManager();
  sommelier = await halkaSommelier();
}, 120_000);
afterAll(async () => { await restoreDatabase?.(); });

describe('A33 results report (PostgreSQL, no JavaScript)', () => {
  it('A33: without a launch day the screen asks for it, with a day and no sales it asks for a POS export, and the Wine Director and a visitor are refused', async () => {
    const empty = await page(manager);
    expect(empty.status).toBe(200);
    expect(text(empty.html)).toContain('Set the launch day first');
    expect(empty.html).toMatch(/type="date"/);
    expect(await fetch(`${base()}/admin/halka/proof`, { redirect: 'manual' }).then((r) => [r.status, r.headers.get('location') ?? ''])).toEqual([307, expect.stringContaining('/admin/login')]);
    expect((await page(sommelier)).status).toBe(403);
    // a forged post of the Wine Director is refused and writes nothing
    expect((await setDay(sommelier, { launchDay: LAUNCH, expectedCurrent: '' })).location).toContain('error=forbidden');
    expect(await rows()).toEqual([]);

    // the first entry needs no reason; the next page asks for the POS export and offers the way to import
    expect((await setDay(manager, { launchDay: LAUNCH, expectedCurrent: '' })).location).toContain('saved=launch_day_saved');
    const noSales = await page(manager);
    expect(text(noSales.html)).toContain('Upload a POS export');
    expect(noSales.html).toContain('href="/admin/halka/import/sales"');
    // the Wine Director cannot read the report through the API either (AC10)
    expect((await get(sommelier, '/api/v1/restaurants/halka/proof-report')).status).toBe(403);
  });

  it('A33: window 1 shows 35 percent before, 50 percent after, the change with an outward interval and the verdict, and no check id, code or session id', async () => {
    await seedSales('halka', 'HALKA', [120, 42], [130, 65]);
    const { status, html } = await page(manager, '?window=1');
    expect(status).toBe(200);
    const t = text(html);
    expect(t).toMatch(/Window 1: 2 Feb 2026 – 1 Mar 2026/);
    expect(t).toMatch(/Before \(Baseline\).*35%.*42 of 120 checks with food included wine/);
    expect(t).toMatch(/After.*50%.*65 of 130 checks with food included wine/);
    expect(t).toContain('+15 percentage points, interval from +2 to +27');
    expect(html).toContain('data-verdict="increase"');
    expect(t).toContain('The report does not say what caused it.');
    // the window table lists the baseline and window 1 with its interval
    expect(t).toMatch(/All windows.*Baseline.*42 \/ 120.*35%.*Window 1.*65 \/ 130.*50%/);
    // R14 (AC13): nothing of a single check, code or session in the HTML
    expect(html).not.toMatch(/SECRETCHK|Z9Q|check_?id|wm_session|sid=/i);
    // the api carries the same numbers
    const api = (await (await get(manager, '/api/v1/restaurants/halka/proof-report?window=1')).json()) as { report: { verdict: string; baseline: { foodChecks: number }; window: { foodChecksWithWine: number } } };
    expect(api.report).toMatchObject({ verdict: 'increase', baseline: { foodChecks: 120 }, window: { foodChecksWithWine: 65 } });
  });

  it('A34: the printable page has the report without controls, the Ctrl/Cmd+P line and nothing from outside, and the Wine Director is refused', async () => {
    const res = await fetch(`${base()}/admin/halka/proof/print?window=1`, { headers: { cookie: `${manager.cookie}; wm_lang=en` }, redirect: 'manual' });
    expect(res.status).toBe(200);
    const html = await res.text();
    const t = text(html);
    expect(t).toContain('Results report: Halka');
    expect(t).toMatch(/Before \(Baseline\).*35%.*After.*50%/);
    expect(t).toContain('+15 percentage points, interval from +2 to +27');
    expect(t).toContain('POS data through 1 Mar 2026.');
    expect(t).toContain('To print or save as PDF, use Ctrl/Cmd+P.');
    expect(t).toContain('This is a comparison, not proof of a cause.');
    expect(t).toContain('How we calculate');
    // without a script there is no print button and no form; the controls are hidden on paper; nothing is fetched from outside
    expect(html).not.toContain('data-print-button');
    expect(html).not.toMatch(/<form[^>]*name="launchDay"|name="launchDay"/);
    expect(html).toMatch(/print:hidden/);
    expect(html).not.toMatch(/(?:src|href)="https?:\/\//);
    expect(html).not.toMatch(/SECRETCHK|Z9Q|check_?id|sid=/i);
    expect(t).not.toMatch(FORBIDDEN_WORDS);
    expect((await fetch(`${base()}/admin/halka/proof/print?window=1`, { headers: { cookie: sommelier.cookie }, redirect: 'manual' })).status).toBe(403);
    expect((await fetch(`${base()}/admin/halka/proof/print`, { redirect: 'manual' })).status).toBe(307);
  });

  it('A33: a window without data of its own shows the counters and the reason with what to do, and no change or verdict; a window that does not exist is an error message', async () => {
    const second = await page(manager, '?window=2');
    const t = text(second.html);
    expect(second.html).toContain('data-verdict="insufficient"');
    expect(t).toContain('Not enough data to show a change');
    expect(t).toMatch(/POS data ends 1 Mar 2026, before the end of the window/);
    expect(t).not.toMatch(/percentage points, interval/);
    for (const w of ['0', '13', '1e9', 'abc']) {
      const bad = await page(manager, `?window=${w}`);
      expect(bad.status, w).toBe(200);
      expect(text(bad.html), w).toContain('This window does not exist');
    }
  });

  it('A33: the checks with and without a code carry the caveat in both languages, no difference between the groups, and none of the forbidden words', async () => {
    for (const lang of ['en', 'pl'] as const) {
      const { html } = await page(manager, '?window=1', lang);
      const t = text(html);
      expect(t, lang).not.toMatch(FORBIDDEN_WORDS);
      if (lang === 'en') {
        expect(t).toContain('This is a comparison, not proof of a cause.');
        expect(t).toMatch(/With a code 13 of 13 checks with food included wine not enough data/);
        expect(t).toMatch(/Without a code 52 of 117 checks with food included wine 44%/);
        expect(t).toContain('How we calculate');
        expect(t).toContain('What this report does not say');
      } else {
        expect(t).toContain('To zestawienie, nie dowód przyczyny.');
        expect(t).toMatch(/Z kodem 13 z 13 rachunków z jedzeniem zawierało wino za mało danych/);
        expect(t).toContain('Jak to liczymy');
        expect(t).toContain('Czego ten raport nie mówi');
        expect(t).toContain('Raport wyników');
      }
      expect(t).not.toMatch(/difference between the groups|różnica między grupami/i);
    }
    // the window pages in every state have no forbidden word either
    for (const q of ['?window=2', '?window=0', '']) expect(text((await page(manager, q)).html)).not.toMatch(FORBIDDEN_WORDS);
  });

  it('A33: the launch day form works without JavaScript: a second entry needs a reason, a stale form is refused, nothing is overwritten, the history grows', async () => {
    const before = await rows();
    expect(before).toEqual([{ seq: 1, launch_day: LAUNCH, reason: null }]);
    const html = (await page(manager, '?window=1')).html;
    const id = currentId(html);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // no reason: refused, nothing changes; a stale form (an id that is not the current one): refused
    expect((await setDay(manager, { launchDay: '2026-02-09', expectedCurrent: id })).location).toContain('error=reason_required');
    expect((await setDay(manager, { launchDay: '2026-02-09', reason: 'x', expectedCurrent: '00000000-0000-4000-8000-0000000000aa' })).location).toContain('error=version_conflict');
    expect((await setDay(manager, { launchDay: '2999-01-01', reason: 'x', expectedCurrent: id })).location).toContain('error=invalid_launch_day');
    expect(await rows()).toEqual(before);
    // with a reason: a new entry, the first one untouched
    expect((await setDay(manager, { launchDay: '2026-02-09', reason: 'first guests came a week later', expectedCurrent: id })).location).toContain('saved=launch_day_saved');
    expect(await rows()).toEqual([{ seq: 1, launch_day: LAUNCH, reason: null }, { seq: 2, launch_day: '2026-02-09', reason: 'first guests came a week later' }]);
    const after = text((await page(manager)).html);
    expect(after).toContain('changed 1 time');
    expect(after).toContain('Reason: first guests came a week later');
    // the same form posted again with the old id is stale now: 409, no third row
    expect((await setDay(manager, { launchDay: '2026-02-09', reason: 'again', expectedCurrent: id })).location).toContain('error=version_conflict');
    expect(await rows()).toHaveLength(2);
  });
});
