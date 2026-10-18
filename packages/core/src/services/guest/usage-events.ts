import type { RecommendationItem } from '../../engine/recommend';
import { ENGINE_VERSION } from '../../engine/scoring';
import { parseSessionId, type GuestSessionRef, type GuestSessionSource, type UsagePath } from '../../guest/session';
import type { QueryInput } from '../../guest/prefs';
import type { Clock, IdGenerator } from '../../ports/runtime';
import type { GuestInteractionInput, Repositories } from '../../ports/repositories';

/** How a wine was placed when the guest saw it, as in the public API (`tier`). */
export type UsageTier = 'sommelier_primary' | 'sommelier' | 'engine';
export type UsageContext = UsagePath;
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
  | { name: 'recommendations_viewed'; dishId: string; props: { wineIds: string[]; items: Array<{ wineId: string; tier: UsageTier }>; prefs: UsagePrefs } }
  | { name: 'table_recommendation_viewed'; props: { dishIds: string[]; wineIds: string[]; /** the budget ruled out every bottle and was lifted (`table.budget_relaxed`, spec whole-table-waiter-path R13) */ budgetRelaxed: boolean } }
  | { name: 'wine_viewed'; dishId?: string; wineId: string; props: { context: UsageContext } }
  | { name: 'wine_selected'; dishId?: string; wineId: string; props: { serving: 'glass' | 'bottle'; context: UsageContext; dishIds?: string[] } }
  | { name: 'staff_lookup'; dishId: string; props: { source: 'staff'; prefs: UsagePrefs; wineIds: string[] } }
  /** the "How we pick your wine" page (G12) was viewed: one cheap signal of interest in the long explanation (E07 Q9) */
  | { name: 'explainer_viewed' };

/** The engine tier of a recommendation in the words of the API and the events. */
export const usageTier = (item: Pick<RecommendationItem, 'tier'>): UsageTier =>
  item.tier === 0 ? 'sommelier_primary' : item.tier === 1 ? 'sommelier' : 'engine';

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
        ...('wineId' in e ? { wineId: e.wineId } : {})
      });
    }
    if (rows.length) await this.deps.guestInteractionRepository.record(restaurant.id, rows);
  }
}
