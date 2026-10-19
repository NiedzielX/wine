import type { OnceRunner } from './contract-types';
import { recommendationCodeContract } from './recommendation-code-contract';
import { seedUsageEvents } from './usage-events';
import { salesContract } from './sales-contract';
import type { DemoDataset } from '../demo/dataset';
import type { OpportunityDismissal } from '../domain/types';
import type { GuestInteractionInput, Repositories } from '../ports/repositories';

/**
 * Behaviour every Repositories implementation must have. Used by the memory tests in core and
 * by the PostgreSQL integration tests in db, so both data sources are held to one contract.
 * Framework-agnostic: pass in your test runner's `it` and `expect`.
 */
export function repositoryContract(
  name: string,
  setup: () => Promise<{ repos: Repositories; dataset: DemoDataset; teardown?: () => Promise<void> }>,
  t: OnceRunner
): void {
  t.describe(`repository contract: ${name}`, () => {
    let repos: Repositories;
    let ds: DemoDataset;
    let teardown: (() => Promise<void>) | undefined;
    t.beforeAll(async () => { ({ repos, dataset: ds, teardown } = await setup()); });
    t.afterAll(async () => { await teardown?.(); });

    t.it('finds a restaurant by slug and returns null for unknown slugs', async () => {
      t.expect((await repos.restaurantRepository.findBySlug(ds.restaurant.slug))?.id).toBe(ds.restaurant.id);
      t.expect(await repos.restaurantRepository.findBySlug('no-such-place')).toBeNull();
    });

    t.it('returns dishes equal to the dataset, scoped by restaurant', async () => {
      const all = await repos.dishRepository.listByRestaurant(ds.restaurant.id);
      t.expect(all.length).toBe(ds.dishes.length);
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      t.expect(await repos.dishRepository.findById(ds.restaurant.id, duck.id)).toEqual(duck);
      t.expect(await repos.dishRepository.findById('00000000-0000-4000-8000-000000000000', duck.id)).toBeNull();
    });

    t.it('filters dishes by status', async () => {
      const published = await repos.dishRepository.listByRestaurant(ds.restaurant.id, { statuses: ['published'] });
      t.expect(published.length).toBe(ds.dishes.filter((d) => d.status === 'published').length);
    });

    t.it('returns wines equal to the dataset and filters inactive ones', async () => {
      const all = await repos.wineRepository.listByRestaurant(ds.restaurant.id);
      const byId = new Map(all.map((w) => [w.id, w]));
      for (const w of ds.wines) t.expect(byId.get(w.id)).toEqual(w);
      const active = await repos.wineRepository.listByRestaurant(ds.restaurant.id, { activeOnly: true });
      t.expect(active.every((w) => w.active)).toBe(true);
      t.expect(active.length).toBe(ds.wines.filter((w) => w.active).length);
    });

    t.it('finds a wine by id within its restaurant only', async () => {
      const wine = ds.wines.find((w) => w.glassPrice === null)!;
      t.expect(await repos.wineRepository.findById(ds.restaurant.id, wine.id)).toEqual(wine);
      t.expect(await repos.wineRepository.findById('00000000-0000-4000-8000-000000000000', wine.id)).toBeNull();
      t.expect(await repos.wineRepository.findById(ds.restaurant.id, '00000000-0000-4000-8000-000000000000')).toBeNull();
    });

    t.it('keeps the content language and every translation as stored (spec 2026-10-15-bilingual-content)', async () => {
      const r = (await repos.restaurantRepository.findBySlug(ds.restaurant.slug))!;
      t.expect({ contentLocale: r.contentLocale, translations: r.translations }).toEqual({ contentLocale: ds.restaurant.contentLocale, translations: ds.restaurant.translations });
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      t.expect((await repos.dishRepository.findById(ds.restaurant.id, duck.id))!.translations).toEqual(duck.translations);
      const noted = ds.pairings.find((p) => Object.keys(p.commentTranslations).length > 0)!;
      t.expect((await repos.pairingRepository.findById(ds.restaurant.id, noted.id))!.commentTranslations).toEqual(noted.commentTranslations);
      const published = await repos.publishRepository.publishedContent(ds.restaurant.id);
      t.expect(published.dishes.get(duck.id)).toEqual(duck.translations);
      t.expect(published.restaurant).toEqual(ds.restaurant.translations);
      t.expect((await repos.pairingRepository.listPublishedByDish(ds.restaurant.id, noted.dishId)).find((p) => p.id === noted.id)!.commentTranslations).toEqual(noted.commentTranslations);
      t.expect((await repos.publishRepository.publishedContent('00000000-0000-4000-8000-000000000000')).dishes.size).toBe(0);
    });

    t.it('returns pairings by restaurant and by dish with the sommelier fields intact', async () => {
      const all = await repos.pairingRepository.listByRestaurant(ds.restaurant.id);
      t.expect(all.length).toBe(ds.pairings.length);
      const duck = ds.dishes.find((d) => d.name === 'Duck breast')!;
      const forDuck = await repos.pairingRepository.listByDish(ds.restaurant.id, duck.id);
      const primary = forDuck.find((p) => p.role === 'primary')!;
      const expected = ds.pairings.find((p) => p.id === primary.id)!;
      t.expect({ ...primary, updatedAt: '', version: undefined }).toEqual({ ...expected, updatedAt: '', version: undefined });
    });

    /* ---- ignored opportunities (spec 2026-10-16-sommelier-opportunities, R6, AC4, AC5) ---- */

    const OTHER_RESTAURANT = '00000000-0000-4000-8000-000000000000';
    const dismissal = (key: string, over: Partial<OpportunityDismissal> = {}): OpportunityDismissal => ({
      id: '00000000-0000-4000-8000-0000000d0001', key, rule: 'glass_match_unpaired', dishId: ds.dishes[0].id, wineId: ds.wines[0].id,
      dismissedBy: 'Marta Wierzbicka', dismissedById: null, dismissedAt: '2026-10-16T10:00:00.000Z', expiresAt: '2026-11-15T10:00:00.000Z', ...over
    });

    t.it('stores a dismissal and lists it while it is active', async () => {
      const d = dismissal('glass_match_unpaired:contract-active', { id: '00000000-0000-4000-8000-0000000d0011', dismissedById: ds.users[0]?.id ?? null });
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, d);
      const active = await repos.opportunityDismissalRepository.listActive(ds.restaurant.id, new Date('2026-10-20T00:00:00.000Z'));
      t.expect(active.find((x) => x.key === d.key)).toEqual(d);
    });

    t.it('upsert of the same key extends the dismissal and keeps its id', async () => {
      const key = 'wine_unpaired:contract-extend';
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, dismissal(key, { id: '00000000-0000-4000-8000-0000000d0021' }));
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, dismissal(key, {
        id: '00000000-0000-4000-8000-0000000d0022', dismissedBy: 'Tomasz Lis', dismissedAt: '2026-10-20T10:00:00.000Z', expiresAt: '2026-11-19T10:00:00.000Z'
      }));
      const rows = (await repos.opportunityDismissalRepository.listActive(ds.restaurant.id, new Date('2026-10-20T10:00:00.000Z'))).filter((x) => x.key === key);
      t.expect(rows.length).toBe(1);
      t.expect(rows[0]).toMatchObject({ id: '00000000-0000-4000-8000-0000000d0021', dismissedBy: 'Tomasz Lis', dismissedAt: '2026-10-20T10:00:00.000Z', expiresAt: '2026-11-19T10:00:00.000Z' });
    });

    t.it('does not list a dismissal that has expired, including one that expires exactly now', async () => {
      const key = 'dish_no_primary:contract-expiry:none';
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, dismissal(key, { id: '00000000-0000-4000-8000-0000000d0031', rule: 'dish_no_primary', wineId: null, expiresAt: '2026-11-01T00:00:00.000Z' }));
      const at = async (iso: string) => (await repos.opportunityDismissalRepository.listActive(ds.restaurant.id, new Date(iso))).some((x) => x.key === key);
      t.expect(await at('2026-10-31T23:59:59.999Z')).toBe(true);
      t.expect(await at('2026-11-01T00:00:00.000Z')).toBe(false);
      t.expect(await at('2026-11-02T00:00:00.000Z')).toBe(false);
    });

    t.it('removes a dismissal and reports false when there is none', async () => {
      const key = 'glass_match_unpaired:contract-remove';
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, dismissal(key, { id: '00000000-0000-4000-8000-0000000d0041' }));
      t.expect(await repos.opportunityDismissalRepository.remove(ds.restaurant.id, key)).toBe(true);
      t.expect(await repos.opportunityDismissalRepository.remove(ds.restaurant.id, key)).toBe(false);
      t.expect((await repos.opportunityDismissalRepository.listActive(ds.restaurant.id, new Date('2026-10-20T00:00:00.000Z'))).some((x) => x.key === key)).toBe(false);
    });

    t.it('keeps dismissals within their restaurant', async () => {
      const key = 'glass_match_unpaired:contract-tenant';
      await repos.opportunityDismissalRepository.upsert(ds.restaurant.id, dismissal(key, { id: '00000000-0000-4000-8000-0000000d0051' }));
      t.expect(await repos.opportunityDismissalRepository.listActive(OTHER_RESTAURANT, new Date('2026-10-20T00:00:00.000Z'))).toEqual([]);
      t.expect(await repos.opportunityDismissalRepository.remove(OTHER_RESTAURANT, key)).toBe(false);
      t.expect((await repos.opportunityDismissalRepository.listActive(ds.restaurant.id, new Date('2026-10-20T00:00:00.000Z'))).some((x) => x.key === key)).toBe(true);
    });

    /* ---------- usage events (spec 2026-10-15-guest-usage-events, R7, AC11, AC12) ---------- */
    // the setup runs once per file: every case uses its own sessions and a time range of its own (2031)
    const OTHER = '00000000-0000-4000-8000-000000000000';
    const sid = (n: number) => `5e551000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const at = (iso: string) => new Date(iso);
    const ev = (sessionId: string, name: GuestInteractionInput['name'], createdAt: string, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test', createdAt: at(createdAt), ...extra });

    t.it('records usage events and lists one session in insertion order, scoped by restaurant', async () => {
      const dish = ds.dishes[0].id;
      const wine = ds.wines[0].id;
      await repos.guestInteractionRepository.record(ds.restaurant.id, [
        ev(sid(1), 'guest_session_started', '2031-01-01T10:00:00.000Z', { props: { source: 'qr', menuVersion: '2031-01-01T00:00:00.000Z' } }),
        ev(sid(1), 'menu_viewed', '2031-01-01T10:00:00.000Z'),
        ev(sid(1), 'recommendations_viewed', '2031-01-01T10:01:00.000Z', { dishId: dish, props: { wineIds: [wine], items: [{ wineId: wine, tier: 'engine' }], prefs: { serving: 'glass' }, menuVersion: null } })
      ]);
      await repos.guestInteractionRepository.record(ds.restaurant.id, [ev(sid(1), 'wine_viewed', '2031-01-01T10:02:00.000Z', { wineId: wine, props: { context: 'direct', menuVersion: null } })]);
      await repos.guestInteractionRepository.record(ds.restaurant.id, []);
      const list = await repos.guestInteractionRepository.listBySession(ds.restaurant.id, sid(1));
      t.expect(list.map((e) => e.name)).toEqual(['guest_session_started', 'menu_viewed', 'recommendations_viewed', 'wine_viewed']);
      t.expect(list[0]).toEqual({
        sessionId: sid(1), name: 'guest_session_started', dishId: null, wineId: null,
        props: { source: 'qr', menuVersion: '2031-01-01T00:00:00.000Z' }, engineVersion: 'wm-test', createdAt: '2031-01-01T10:00:00.000Z'
      });
      t.expect(list[2]).toMatchObject({ dishId: dish, wineId: null, props: { wineIds: [wine], items: [{ wineId: wine, tier: 'engine' }], prefs: { serving: 'glass' } } });
      t.expect(list[3]).toMatchObject({ dishId: null, wineId: wine });
      t.expect(await repos.guestInteractionRepository.listBySession(OTHER, sid(1))).toEqual([]);
      t.expect(await repos.guestInteractionRepository.listBySession(ds.restaurant.id, sid(999))).toEqual([]);
    });

    t.it('counts distinct guest sessions with a start in [from, to): never staff sessions or sessions without a start', async () => {
      const repo = repos.guestInteractionRepository;
      await repo.record(ds.restaurant.id, [
        ev(sid(11), 'guest_session_started', '2031-02-01T00:00:00.000Z'),   // at `from`: counted
        ev(sid(11), 'menu_viewed', '2031-02-01T00:00:01.000Z'),
        ev(sid(11), 'guest_session_started', '2031-02-02T00:00:00.000Z'),   // the same session twice: counted once
        ev(sid(12), 'guest_session_started', '2031-02-05T00:00:00.000Z'),
        ev(sid(13), 'guest_session_started', '2031-03-01T00:00:00.000Z'),   // at `to`: not counted
        ev(sid(14), 'guest_session_started', '2031-01-31T23:59:59.999Z'),   // before `from`
        ev(sid(15), 'staff_lookup', '2031-02-03T00:00:00.000Z', { props: { source: 'staff', prefs: {}, wineIds: [], menuVersion: null } }),
        // a staff sid reused on a guest page: guest events without a start
        ev(sid(15), 'menu_viewed', '2031-02-03T00:01:00.000Z'),
        ev(sid(16), 'recommendations_viewed', '2031-02-04T00:00:00.000Z')
      ]);
      const range = { from: at('2031-02-01T00:00:00.000Z'), to: at('2031-03-01T00:00:00.000Z') };
      t.expect(await repo.countGuestSessions(ds.restaurant.id, range)).toBe(2);
      t.expect(await repo.countGuestSessions(OTHER, range)).toBe(0);
      t.expect(await repo.countGuestSessions(ds.restaurant.id, { from: at('2031-02-28T00:00:00.000Z'), to: at('2031-03-01T00:00:00.001Z') })).toBe(1);
    });

    /* ---------- usage totals for the KPI dashboard (spec 2026-10-15-kpi-dashboard, R2, R3, R10, AC3, AC10) ---------- */
    t.it('totals usage of guest sessions only, in [from, to), and the waiter lookups apart', async () => {
      const repo = repos.guestInteractionRepository;
      const [d1, d2] = [ds.dishes[0].id, ds.dishes[1].id];
      const [w1, w2] = [ds.wines[0].id, ds.wines[1].id];
      const view = (s: string, iso: string, dishId: string) =>
        ev(s, 'recommendations_viewed', iso, { dishId, props: { wineIds: [w1], items: [{ wineId: w1, tier: 'engine' }], menuVersion: null } });
      const pick = (s: string, iso: string, context: string, extra: Partial<GuestInteractionInput> = {}) =>
        ev(s, 'wine_selected', iso, { wineId: w1, props: { serving: 'glass', context, menuVersion: null }, ...extra });
      await seedUsageEvents(repo, ds.restaurant.id, [
        // A: views two dishes (one twice) and selects for a dish — in every figure
        ev(sid(21), 'guest_session_started', '2032-02-01T00:00:00.000Z', { props: { source: 'qr', menuVersion: null } }),
        view(sid(21), '2032-02-01T00:01:00.000Z', d1), view(sid(21), '2032-02-01T00:02:00.000Z', d1), view(sid(21), '2032-02-01T00:03:00.000Z', d2),
        pick(sid(21), '2032-02-01T00:04:00.000Z', 'dish', { dishId: d1 }),
        // B: views, selects only from the table — a view without a selection
        ev(sid(22), 'guest_session_started', '2032-02-02T00:00:00.000Z'),
        view(sid(22), '2032-02-02T00:01:00.000Z', d1),
        ev(sid(22), 'table_recommendation_viewed', '2032-02-02T00:02:00.000Z', { props: { dishIds: [d1, d2], wineIds: [w2], budgetRelaxed: false, menuVersion: null } }),
        pick(sid(22), '2032-02-02T00:03:00.000Z', 'table', { props: { serving: 'bottle', context: 'table', dishIds: [d1, d2], menuVersion: null } }),
        // C: selects without a view — a session, nothing else
        ev(sid(23), 'guest_session_started', '2032-02-03T00:00:00.000Z'),
        pick(sid(23), '2032-02-03T00:01:00.000Z', 'dish', { dishId: d1 }),
        // D: started before `from` — out of every guest figure
        ev(sid(24), 'guest_session_started', '2032-01-31T23:59:59.999Z'),
        view(sid(24), '2032-02-01T00:10:00.000Z', d1), pick(sid(24), '2032-02-01T00:11:00.000Z', 'dish', { dishId: d1 }),
        // E: guest events without a start (a hand-copied sid) — out
        view(sid(25), '2032-02-04T00:00:00.000Z', d2), pick(sid(25), '2032-02-04T00:01:00.000Z', 'dish', { dishId: d2 }),
        // F: a view at `to` — the session is in, the view is not
        ev(sid(26), 'guest_session_started', '2032-02-28T23:59:59.999Z'),
        view(sid(26), '2032-03-01T00:00:00.000Z', d1),
        // the waiter: two dishes, one looked up twice, a table looked up and then "Choose this one" — 3 lookups
        ev(sid(27), 'staff_lookup', '2032-02-05T00:00:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [w1], menuVersion: null } }),
        ev(sid(27), 'staff_lookup', '2032-02-05T00:01:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [w1], menuVersion: null } }),
        ev(sid(27), 'staff_lookup', '2032-02-05T00:02:00.000Z', { dishId: d2, props: { source: 'staff', prefs: {}, wineIds: [w1], menuVersion: null } }),
        ev(sid(27), 'staff_table_lookup', '2032-02-05T00:03:00.000Z', { wineId: w2, props: { source: 'staff', dishIds: [d1, d2], wineIds: [w2], prefs: {}, splitSuggested: false, budgetRelaxed: false, menuVersion: null } }),
        ev(sid(27), 'staff_table_lookup', '2032-02-05T00:04:00.000Z', { wineId: w2, props: { source: 'staff', dishIds: [d1, d2], wineIds: [w2], pickedWineId: w2, prefs: {}, splitSuggested: false, budgetRelaxed: false, menuVersion: null } }),
        // the waiter after the window — out
        ev(sid(27), 'staff_lookup', '2032-03-01T00:00:00.000Z', { dishId: d2, props: { source: 'staff', prefs: {}, wineIds: [], menuVersion: null } })
      ]);
      const range = { from: at('2032-02-01T00:00:00.000Z'), to: at('2032-03-01T00:00:00.000Z') };
      const totals = await repo.usageTotals(ds.restaurant.id, range);
      t.expect(totals).toEqual({ sessions: 4, recommendationViews: 3, sessionsWithViews: 2, sessionsWithSelection: 1, staffLookups: 3 });
      t.expect(totals.sessions).toBe(await repo.countGuestSessions(ds.restaurant.id, range));
      t.expect(await repo.usageTotals(OTHER, range)).toEqual({ sessions: 0, recommendationViews: 0, sessionsWithViews: 0, sessionsWithSelection: 0, staffLookups: 0 });
      // the next window: F's view at its `from` belongs to a session started in the previous one — out
      const next = await repo.usageTotals(ds.restaurant.id, { from: at('2032-03-01T00:00:00.000Z'), to: at('2032-03-29T00:00:00.000Z') });
      t.expect(next).toEqual({ sessions: 0, recommendationViews: 0, sessionsWithViews: 0, sessionsWithSelection: 0, staffLookups: 1 });
    });

    /* ---------- recommendation codes (spec 2026-10-16-recommendation-code) ---------- */
    recommendationCodeContract(t, () => ({ repos, ds }));

    /* ---------- sales lines (spec 2026-10-15-pos-sales-import-attach-rate) ---------- */
    salesContract(t, () => ({ repos, ds }));
  });
}
