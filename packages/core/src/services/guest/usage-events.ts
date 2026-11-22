import type { RecommendationItem } from '../../engine/recommend';
import type { RankedItem } from '../../ranking/restaurant-picks';
import { ENGINE_VERSION } from '../../engine/scoring';
import { parseSessionId, type GuestSessionRef, type GuestSessionSource, type UsagePath } from '../../guest/session';
import type { QueryInput } from '../../guest/prefs';
import type { Clock, IdGenerator } from '../../ports/runtime';
import type { GuestInteractionInput, Repositories } from '../../ports/repositories';

/** How a wine was placed when the guest saw it, as in the public API (`tier`). */
export type UsageTier = 'sommelier_primary' | 'sommelier' | 'engine';
export type UsageContext = UsagePath;
/**
 * `pick: true` on an item or in the props of a wine view or selection marks a wine that carried the restaurant's pick
 * label when the guest saw it (spec 2026-11-18-restaurant-picks, U7): the key is absent otherwise, so events about
 * wines without the label are as they were. The learning layer (E17) does not read a flagged item as a sign that the
 * wine fits (O11), and the pairing figures (E04) can tell a restaurant's pick from the engine's own choice.
 */
export interface UsageItem { wineId: string; tier: UsageTier; pick?: true }
/** Only the non-default preferences, as `prefsToQuery` writes them. */
export type UsagePrefs = Record<string, string>;

/**
 * The events a page may record, each with its own typed `props` (spec 2026-10-15-guest-usage-events, API Contracts).
 * `guest_session_started` is not here: the service adds it. `menuVersion` is added to every event by the service.
 * Values are validated ones only (parsed preferences, ids from the database): never an IP, a user agent, a table
 * number or text typed by the guest (R8).
 */
export type UsageEvent =
  | { name: 'menu_viewed' }
  | { name: 'recommendations_viewed'; dishId: string; props: { wineIds: string[]; items: UsageItem[]; prefs: UsagePrefs } }
  | { name: 'table_recommendation_viewed'; props: { dishIds: string[]; wineIds: string[]; /** the budget ruled out every bottle and was lifted (`table.budget_relaxed`, spec whole-table-waiter-path R13) */ budgetRelaxed: boolean; /** the number of people chosen on the table screens (`table.people_default`), only when chosen (R16) */ people?: number } }
  | { name: 'wine_viewed'; dishId?: string; wineId: string; props: { context: UsageContext; pick?: true } }
  | { name: 'wine_selected'; dishId?: string; wineId: string; props: { serving: 'glass' | 'bottle'; context: UsageContext; pick?: true; dishIds?: string[]; /** from the table, when a number of people was chosen (R16) */ people?: number } }
  | { name: 'staff_lookup'; dishId: string; props: { source: 'staff'; prefs: UsagePrefs; wineIds: string[] } }
  /**
   * the waiter's whole-table lookup on G11 (spec 2026-10-16-whole-table-waiter-path, R13): `wineId` is the bottle shown
   * first (none for an empty result), `dishIds` the dishes the bottle was chosen for, `wineIds` the wines in display
   * order, `pickedWineId` the alternative the waiter chose ("Choose this one"), only when it is in the result
   */
  | {
    name: 'staff_table_lookup'; wineId?: string;
    props: { source: 'staff'; dishIds: string[]; wineIds: string[]; pickedWineId?: string; prefs: UsagePrefs; splitSuggested: boolean; budgetRelaxed: boolean; people?: number };
  }
  /** the "How we pick your wine" page (G12) was viewed: one cheap signal of interest in the long explanation (E07 Q9) */
  | { name: 'explainer_viewed' };

/** The engine tier of a recommendation in the words of the API and the events. */
export const usageTier = (item: Pick<RecommendationItem, 'tier'>): UsageTier =>
  item.tier === 0 ? 'sommelier_primary' : item.tier === 1 ? 'sommelier' : 'engine';

/** One recommendation as an event item: the wine, its place and, only when the label was shown, `pick: true`. */
export const usageItem = (item: Pick<RankedItem, 'tier' | 'restaurantPick'> & { wine: { id: string } }): UsageItem => ({
  wineId: item.wine.id, tier: usageTier(item), ...(item.restaurantPick ? { pick: true as const } : {})
});

/** The `pick` prop of a wine view or selection: `{ pick: true }` when the item carried the label, otherwise nothing. */
export const usagePick = (item: Pick<RankedItem, 'restaurantPick'> | null | undefined): { pick?: true } => (item?.restaurantPick ? { pick: true } : {});

export interface UsageEventServiceDeps extends Pick<Repositories, 'guestInteractionRepository'> {
  clock: Clock;
  idGenerator: IdGenerator;
}

/**
 * Anonymous usage events of guests and staff. Telemetry, not a command (AGENTS.md §1.3, approved exception): no
 * actor, no expected version, no domain errors. The caller decides when to record and swallows a failed write.
 */
export class UsageEventService {
  constructor(private readonly deps: UsageEventServiceDeps) {}

  /** The session of this request: the valid `sid` from the query, or a new one. */
  session(q: QueryInput, source: GuestSessionSource): GuestSessionRef {
    const id = parseSessionId(q);
    return id ? { id, isNew: false, source } : { id: this.deps.idGenerator.uuid(), isNew: true, source };
  }

  /**
   * Stores the page's events in one write. A new guest session (not staff) gets `guest_session_started` first, in the
   * same write, so a session never has events without its start. Every event carries `menuVersion` (the restaurant's
   * `publishedAt`), the engine version and the time of the clock. Nothing to store → no write.
   */
  async record(restaurant: { id: string; publishedAt: string | null }, session: GuestSessionRef, events: UsageEvent[]): Promise<void> {
    const createdAt = this.deps.clock.now();
    const base = { sessionId: session.id, engineVersion: ENGINE_VERSION, createdAt };
    const menuVersion = restaurant.publishedAt;
    const rows: GuestInteractionInput[] = [];
    if (session.isNew && session.source !== 'staff') {
      rows.push({ ...base, name: 'guest_session_started', props: { source: session.source, menuVersion } });
    }
    for (const e of events) {
      const props = 'props' in e ? e.props : {};
      rows.push({
        ...base, name: e.name, props: { ...props, menuVersion },
        ...('dishId' in e && e.dishId ? { dishId: e.dishId } : {}),
        ...('wineId' in e && e.wineId ? { wineId: e.wineId } : {})
      });
    }
    if (rows.length) await this.deps.guestInteractionRepository.record(restaurant.id, rows);
  }
}
