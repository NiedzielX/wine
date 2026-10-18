import type { CodeServing, CodeSource, CodeTier, RecommendationCodeRecord } from '../../domain/types';
import { ENGINE_VERSION } from '../../engine/scoring';
import { MAX_TABLE_DISHES } from '../../guest/prefs';
import type { GuestSessionRef } from '../../guest/session';
import type { Logger } from '../../logging/logger';
import type { Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { codeFromUuid, type CodeLength } from '../../recommendation-code/code-format';
import { serviceDay } from '../../recommendation-code/service-day';

/** At most this many recommendations per guest session and service day (R13): a loop over `table=` cannot drain the code space. */
export const MAX_CODES_PER_SESSION_DAY = 30;
/** The waiter keeps one session for the whole evening on the staff table result (E08), hence a higher limit (R13). */
export const MAX_STAFF_CODES_PER_SESSION_DAY = 300;
/** Candidates tried per code length before the longer form, and before giving up (Q4). */
export const CODE_ATTEMPTS_PER_LENGTH = 6;

export interface IssueCodeInput {
  /** the anonymous session (E02) of the guest, or of the waiter on the staff screens */
  session: GuestSessionRef;
  /** G8 always issues `guest`; the waiter path of E08 issues `staff` */
  source: CodeSource;
  /** an active wine of the restaurant */
  wineId: string;
  /** a glass is kept only for a wine poured by the glass; anything else is a bottle */
  serving: CodeServing;
  /** dish ids from the URL; validated here against the restaurant's published dishes (R5) */
  dishIds: string[];
  /** how the wine was placed for the dish (from `wineDetails().match`); kept only for a guest's dish choice (Q18) */
  tier?: CodeTier | null;
}

export interface IssuedCode {
  code: string;
  serviceDay: string;
  issuedAt: string;
}

export interface RecommendationCodeServiceDeps extends Pick<Repositories, 'restaurantRepository' | 'wineRepository' | 'dishRepository' | 'recommendationCodeRepository'> {
  clock: Clock;
  idGenerator: IdGenerator;
  logger: Pick<Logger, 'warn'>;
}

/**
 * Recommendation codes (spec 2026-10-16-recommendation-code). Issuing a code is not a command (AGENTS.md §1.3,
 * approved exception Q7): no actor, no expected version, no domain errors — anything that prevents a code gives
 * `null`, and the page renders without one. Confirming and undoing (phase 2) are commands.
 */
export class RecommendationCodeService {
  constructor(private readonly deps: RecommendationCodeServiceDeps) {}

  /**
   * The code of this choice: the same code for the same session, wine, serving and dishes on the same service day
   * (R3), otherwise a new one. Null when the restaurant or the wine is unknown, the wine is inactive, more than
   * `MAX_TABLE_DISHES` valid dishes are named, the session reached its limit (R13), or the code space is exhausted.
   */
  async issue(slug: string, input: IssueCodeInput): Promise<IssuedCode | null> {
    const { restaurantRepository, wineRepository, dishRepository, recommendationCodeRepository: codes } = this.deps;
    const restaurant = await restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const wine = await wineRepository.findById(restaurant.id, input.wineId);
    if (!wine || !wine.active) return null;

    // R5: only published dishes of this restaurant; unknown, unpublished and foreign ids are dropped
    let dishIds: string[] = [];
    if (input.dishIds.length) {
      const published = new Set((await dishRepository.listByRestaurant(restaurant.id, { statuses: ['published'] })).map((d) => d.id));
      dishIds = [...new Set(input.dishIds)].filter((id) => published.has(id)).sort();
    }
    if (dishIds.length > MAX_TABLE_DISHES) return null;
    const context = dishIds.length === 0 ? 'direct' : dishIds.length === 1 ? 'dish' : 'table';

    const now = this.deps.clock.now();
    const day = serviceDay(now);
    const limit = input.source === 'staff' ? MAX_STAFF_CODES_PER_SESSION_DAY : MAX_CODES_PER_SESSION_DAY;
    if ((await codes.countBySession(restaurant.id, day, input.session.id)) >= limit) return null;

    const base: Omit<RecommendationCodeRecord, 'code' | 'confirmedAt'> = {
      serviceDay: day,
      sessionId: input.session.id,
      source: input.source,
      context,
      wineId: wine.id,
      dishIds,
      serving: input.serving === 'glass' && wine.glassPrice !== null ? 'glass' : 'bottle',
      menuVersion: restaurant.publishedAt,
      tier: context === 'dish' && input.source === 'guest' ? input.tier ?? null : null,
      engineVersion: ENGINE_VERSION,
      issuedAt: now.toISOString()
    };
    // Q4: each attempt takes a fresh UUID (the row id) and reads the candidate code from it
    for (const length of [3, 4] satisfies CodeLength[]) {
      for (let attempt = 0; attempt < CODE_ATTEMPTS_PER_LENGTH; attempt++) {
        const id = this.deps.idGenerator.uuid();
        const result = await codes.tryIssue(restaurant.id, { ...base, id, code: codeFromUuid(id, length) });
        if (result.status !== 'code_taken') {
          return { code: result.record.code, serviceDay: result.record.serviceDay, issuedAt: result.record.issuedAt };
        }
      }
    }
    this.deps.logger.warn('recommendation code space exhausted', { restaurantId: restaurant.id, serviceDay: day });
    return null;
  }
}
