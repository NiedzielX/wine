import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import { ENGINE_VERSION } from '../src/engine/scoring';
import { GUEST_SESSION_PARAM, parseSessionId, usageContext, wineUsageScope } from '../src/guest/session';
import { createMemoryRepositories, MAX_MEMORY_GUEST_EVENTS, MemoryStore } from '../src/memory/memory-repositories';
import { UsageEventService, usageTier } from '../src/services/guest/usage-events';
import { seedUsageEvents } from '../src/testing/usage-events';

/** Spec 2026-10-15-guest-usage-events, phase 1: the session in the URL, the service and the in-memory limit. */

const ds = buildDemoDataset({ ids: 'uuid' });
const SID = '3f2b8c1a-9d4e-4a5b-8c6d-7e8f9a0b1c2d';
const NOW = new Date('2026-10-16T12:00:00.000Z');

function setup() {
  const repos = createMemoryRepositories(MemoryStore.from(ds));
  let n = 0;
  const service = new UsageEventService({
    guestInteractionRepository: repos.guestInteractionRepository,
    clock: { now: () => NOW },
    idGenerator: { uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  });
  return { repo: repos.guestInteractionRepository, service };
}
const restaurant = { id: ds.restaurant.id, publishedAt: '2026-10-01T08:00:00.000Z' };

describe('the guest session in the URL (R2)', () => {
  it('accepts only a canonical lower-case UUID v4 in `sid`', () => {
    expect(GUEST_SESSION_PARAM).toBe('sid');
    expect(parseSessionId({ sid: SID })).toBe(SID);
    expect(parseSessionId({})).toBeNull();
    expect(parseSessionId({ sid: SID.toUpperCase() })).toBeNull();
    expect(parseSessionId({ sid: 'hello' })).toBeNull();
    expect(parseSessionId({ sid: `${SID} ` })).toBeNull();
    expect(parseSessionId({ sid: [SID, SID] })).toBeNull();
    expect(parseSessionId({ sid: '3f2b8c1a-9d4e-1a5b-8c6d-7e8f9a0b1c2d' })).toBeNull();   // version 1
    expect(parseSessionId({ sid: '' })).toBeNull();
  });

  it('names the path of a view: table, a published dish, or direct', () => {
    const menu = { dishes: [{ id: 'd1' }] };
    expect(usageContext({ table: 'd1,d2' }, menu)).toBe('table');
    expect(usageContext({ table: 'd1,d2', dish: 'd1' }, menu)).toBe('table');
    expect(usageContext({ dish: 'd1' }, menu)).toBe('dish');
    expect(usageContext({ dish: 'unknown' }, menu)).toBe('direct');
    expect(usageContext({ dish: ['d1'] }, menu)).toBe('direct');
    expect(usageContext({}, menu)).toBe('direct');
    expect(usageContext({ table: ' , ' }, menu)).toBe('direct');   // names no dish: not the table path
  });

  it('scopes a wine view or selection with ids from the menu only (phase 2, R8)', () => {
    const menu = { dishes: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }] };
    expect(wineUsageScope({ dish: 'd1' }, menu)).toEqual({ context: 'dish', dishId: 'd1' });
    expect(wineUsageScope({ dish: 'typed by hand' }, menu)).toEqual({ context: 'direct' });
    expect(wineUsageScope({}, menu)).toEqual({ context: 'direct' });
    expect(wineUsageScope({ table: 'd3,d1,unknown,d3' }, menu)).toEqual({ context: 'table', dishIds: ['d3', 'd1'] });
    expect(wineUsageScope({ table: 'nope' }, menu)).toEqual({ context: 'table', dishIds: [] });
    expect(wineUsageScope({ table: 'd1,d2', dish: 'd1' }, menu)).toEqual({ context: 'table', dishIds: ['d1', 'd2'] });
  });
});

describe('UsageEventService', () => {
  it('keeps a valid sid and starts a new session otherwise', () => {
    const { service } = setup();
    expect(service.session({ sid: SID }, 'link')).toEqual({ id: SID, isNew: false, source: 'link' });
    const fresh = service.session({ sid: 'BAD' }, 'qr');
    expect(fresh).toEqual({ id: '00000000-0000-4000-8000-000000000001', isNew: true, source: 'qr' });
  });

  it('writes the start of a new guest session first, with menuVersion, engine version and the clock (R1, R4)', async () => {
    const { repo, service } = setup();
    const session = service.session({}, 'qr');
    await service.record(restaurant, session, [{ name: 'menu_viewed' }]);
    const list = await repo.listBySession(ds.restaurant.id, session.id);
    expect(list).toEqual([
      { sessionId: session.id, name: 'guest_session_started', dishId: null, wineId: null, props: { source: 'qr', menuVersion: restaurant.publishedAt }, engineVersion: ENGINE_VERSION, createdAt: NOW.toISOString() },
      { sessionId: session.id, name: 'menu_viewed', dishId: null, wineId: null, props: { menuVersion: restaurant.publishedAt }, engineVersion: ENGINE_VERSION, createdAt: NOW.toISOString() }
    ]);
  });

  it('records the wines a guest saw with their tier and the non-default preferences', async () => {
    const { repo, service } = setup();
    const dish = ds.dishes[0].id;
    await service.record(restaurant, { id: SID, isNew: false, source: 'link' }, [{
      name: 'recommendations_viewed', dishId: dish,
      props: { wineIds: ['w1', 'w2'], items: [{ wineId: 'w1', tier: usageTier({ tier: 0 }) }, { wineId: 'w2', tier: usageTier({ tier: 2 }) }], prefs: { serving: 'glass' } }
    }]);
    const [e] = await repo.listBySession(ds.restaurant.id, SID);
    expect(e).toMatchObject({
      name: 'recommendations_viewed', dishId: dish, wineId: null,
      props: { wineIds: ['w1', 'w2'], items: [{ wineId: 'w1', tier: 'sommelier_primary' }, { wineId: 'w2', tier: 'engine' }], prefs: { serving: 'glass' }, menuVersion: restaurant.publishedAt }
    });
    expect(usageTier({ tier: 1 })).toBe('sommelier');
  });

  it('does not start a session for an existing sid or for staff, and writes nothing when there is nothing to write', async () => {
    const { repo, service } = setup();
    await service.record(restaurant, { id: SID, isNew: false, source: 'link' }, []);
    const staff = service.session({}, 'staff');
    await service.record(restaurant, staff, []);
    expect(await repo.listBySession(ds.restaurant.id, SID)).toEqual([]);
    expect(await repo.listBySession(ds.restaurant.id, staff.id)).toEqual([]);
    expect(await repo.countGuestSessions(ds.restaurant.id, { from: new Date(0), to: new Date('2100-01-01') })).toBe(0);
  });

  it('stores a selection with its dish and wine in columns, and a staff lookup without a guest session (phases 2, 3)', async () => {
    const { repo, service } = setup();
    const [d1, d2] = ds.dishes;
    const wine = ds.wines[0].id;
    const guest = service.session({}, 'link');
    await service.record(restaurant, guest, [{ name: 'wine_selected', dishId: d1.id, wineId: wine, props: { serving: 'glass', context: 'dish' } }]);
    await service.record(restaurant, { ...guest, isNew: false }, [{ name: 'wine_selected', wineId: wine, props: { serving: 'bottle', context: 'table', dishIds: [d1.id, d2.id] } }]);
    expect(await repo.listBySession(ds.restaurant.id, guest.id)).toMatchObject([
      { name: 'guest_session_started' },
      { name: 'wine_selected', dishId: d1.id, wineId: wine, props: { serving: 'glass', context: 'dish', menuVersion: restaurant.publishedAt } },
      { name: 'wine_selected', dishId: null, wineId: wine, props: { serving: 'bottle', context: 'table', dishIds: [d1.id, d2.id] } }
    ]);
    const staff = service.session({}, 'staff');
    await service.record(restaurant, staff, [{ name: 'staff_lookup', dishId: d1.id, props: { source: 'staff', prefs: {}, wineIds: [wine] } }]);
    expect(await repo.listBySession(ds.restaurant.id, staff.id)).toMatchObject([{ name: 'staff_lookup', dishId: d1.id, wineId: null, props: { source: 'staff', wineIds: [wine] } }]);
    expect(await repo.countGuestSessions(ds.restaurant.id, { from: new Date(0), to: new Date('2100-01-01') })).toBe(1);
  });

  it('a restaurant without a published menu still starts the session, with menuVersion null', async () => {
    const { repo, service } = setup();
    const session = service.session({}, 'link');
    await service.record({ id: ds.restaurant.id, publishedAt: null }, session, []);
    expect(await repo.listBySession(ds.restaurant.id, session.id)).toMatchObject([{ name: 'guest_session_started', props: { source: 'link', menuVersion: null } }]);
  });
});

describe('the in-memory event store (R7, AC12)', () => {
  it(`keeps at most ${MAX_MEMORY_GUEST_EVENTS} events, dropping the oldest`, async () => {
    const { repo } = setup();
    const ev = (sessionId: string) => ({ sessionId, name: 'menu_viewed' as const, props: {}, engineVersion: 'x', createdAt: NOW });
    await seedUsageEvents(repo, ds.restaurant.id, [ev(SID), ...Array.from({ length: MAX_MEMORY_GUEST_EVENTS - 1 }, () => ev('a'))]);
    expect(await repo.listBySession(ds.restaurant.id, SID)).toHaveLength(1);
    await seedUsageEvents(repo, ds.restaurant.id, [ev('b'), ev('b')]);
    expect(await repo.listBySession(ds.restaurant.id, SID)).toHaveLength(0);
    expect(await repo.listBySession(ds.restaurant.id, 'a')).toHaveLength(MAX_MEMORY_GUEST_EVENTS - 2);
    expect(await repo.listBySession(ds.restaurant.id, 'b')).toHaveLength(2);
  });
});
