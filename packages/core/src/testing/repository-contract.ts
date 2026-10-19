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

    /* ---------- pairing stats for the KPI dashboard and E10 S4 (spec 2026-10-15-kpi-dashboard, R2, R8, Q10, AC7, AC10) ---------- */
    t.it('counts shown and chosen per (dish, wine, source of the session’s latest view) in guest sessions of [from, to)', async () => {
      const repo = repos.guestInteractionRepository;
      const [d1, d2] = [ds.dishes[0].id, ds.dishes[1].id];
      const [w1, w2] = [ds.wines[0].id, ds.wines[1].id];
      const start = (s: string, iso: string) => ev(s, 'guest_session_started', iso, { props: { source: 'qr', menuVersion: null } });
      const view = (s: string, iso: string, dishId: string, items: unknown) =>
        ev(s, 'recommendations_viewed', iso, { dishId, props: { wineIds: [], items, menuVersion: null } });
      const pick = (s: string, iso: string, dishId: string | undefined, wineId: string, context = 'dish') =>
        ev(s, 'wine_selected', iso, { ...(dishId ? { dishId } : {}), wineId, props: { serving: 'glass', context, menuVersion: null } });
      await seedUsageEvents(repo, ds.restaurant.id, [
        // A: sees w1 as an engine pick, later as the sommelier's (approved in between) and w2 as the primary; chooses w1
        start(sid(31), '2033-02-01T10:00:00.000Z'),
        view(sid(31), '2033-02-01T10:01:00.000Z', d1, [{ wineId: w1, tier: 'engine' }, { wineId: w2, tier: 'sommelier_primary' }]),
        view(sid(31), '2033-02-01T10:05:00.000Z', d1, [{ wineId: w1, tier: 'sommelier' }]),
        pick(sid(31), '2033-02-01T10:06:00.000Z', d1, w1),
        // B: sees w1 from the engine, chooses it only at the whole table — not chosen
        start(sid(32), '2033-02-02T10:00:00.000Z'),
        view(sid(32), '2033-02-02T10:01:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]),
        pick(sid(32), '2033-02-02T10:02:00.000Z', d1, w1, 'table'),
        // C: sees w1 twice (one session), chooses w2 for d1 (never shown) and w1 for another dish — not chosen
        start(sid(33), '2033-02-03T10:00:00.000Z'),
        view(sid(33), '2033-02-03T10:01:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]),
        view(sid(33), '2033-02-03T10:02:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]),
        pick(sid(33), '2033-02-03T10:03:00.000Z', d1, w2),
        pick(sid(33), '2033-02-03T10:04:00.000Z', d2, w1),
        // D: items missing, not an array, or not usable — only w2 (engine) of d2 counts
        start(sid(34), '2033-02-04T10:00:00.000Z'),
        ev(sid(34), 'recommendations_viewed', '2033-02-04T10:01:00.000Z', { dishId: d2, props: { wineIds: [w1], menuVersion: null } }),
        view(sid(34), '2033-02-04T10:02:00.000Z', d2, { wineId: w1, tier: 'engine' }),
        view(sid(34), '2033-02-04T10:03:00.000Z', d2, [{ wineId: w1, tier: 'unknown' }, 'junk', null, { tier: 'engine' }, { wineId: w2, tier: 'engine' }]),
        // E: started before `from`; F: no start at all (a hand-copied sid, the waiter) — out
        start(sid(35), '2033-01-31T23:59:59.999Z'),
        view(sid(35), '2033-02-05T10:00:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]), pick(sid(35), '2033-02-05T10:01:00.000Z', d1, w1),
        view(sid(36), '2033-02-05T11:00:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]), pick(sid(36), '2033-02-05T11:01:00.000Z', d1, w1),
        ev(sid(36), 'staff_lookup', '2033-02-05T11:02:00.000Z', { dishId: d1, props: { source: 'staff', prefs: {}, wineIds: [w1], menuVersion: null } }),
        // G: chooses before the view (order does not matter) — chosen
        start(sid(37), '2033-02-06T10:00:00.000Z'),
        pick(sid(37), '2033-02-06T10:01:00.000Z', d1, w1),
        view(sid(37), '2033-02-06T10:02:00.000Z', d1, [{ wineId: w1, tier: 'sommelier_primary' }]),
        // H: two views at the same instant — the later write wins
        start(sid(38), '2033-02-07T10:00:00.000Z'),
        view(sid(38), '2033-02-07T10:01:00.000Z', d1, [{ wineId: w1, tier: 'engine' }]),
        view(sid(38), '2033-02-07T10:01:00.000Z', d1, [{ wineId: w1, tier: 'sommelier' }]),
        // I: a view at `to` — out
        start(sid(39), '2033-02-28T23:00:00.000Z'),
        view(sid(39), '2033-03-01T00:00:00.000Z', d1, [{ wineId: w1, tier: 'engine' }])
      ]);
      const range = { from: at('2033-02-01T00:00:00.000Z'), to: at('2033-03-01T00:00:00.000Z') };
      const byte = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      const expected = [
        { dishId: d1, wineId: w1, source: 'engine', shown: 2, chosen: 0 },        // B, C
        { dishId: d1, wineId: w1, source: 'sommelier', shown: 3, chosen: 2 },     // A, G, H; chosen A, G
        { dishId: d1, wineId: w2, source: 'sommelier', shown: 1, chosen: 0 },     // A
        { dishId: d2, wineId: w2, source: 'engine', shown: 1, chosen: 0 }         // D
      ].sort((a, b) => byte(a.dishId, b.dishId) || byte(a.wineId, b.wineId) || byte(a.source, b.source));
      t.expect(await repo.pairingStats(ds.restaurant.id, range)).toEqual(expected);
      t.expect(await repo.pairingStats(OTHER, range)).toEqual([]);
      t.expect(await repo.pairingStats(ds.restaurant.id, { from: at('2033-03-01T00:00:00.000Z'), to: at('2033-03-29T00:00:00.000Z') })).toEqual([]);
    });

    /* ---------- recommendation codes (spec 2026-10-16-recommendation-code) ---------- */
    recommendationCodeContract(t, () => ({ repos, ds }));

    /* ---------- sales lines (spec 2026-10-15-pos-sales-import-attach-rate) ---------- */
    salesContract(t, () => ({ repos, ds }));
  });
}
