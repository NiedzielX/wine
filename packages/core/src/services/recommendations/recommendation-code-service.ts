import type { CodeServing, CodeSource, CodeTier, PairCodeStats, RecommendationCodeRecord, Wine } from '../../domain/types';
import { ENGINE_VERSION } from '../../engine/scoring';
import { NotFoundError, ValidationError } from '../../errors';
import { MAX_TABLE_DISHES } from '../../guest/prefs';
import type { GuestSessionRef } from '../../guest/session';
import type { Logger } from '../../logging/logger';
import type { Repositories, ServiceDayPeriod } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { codeFromUuid, normalizeCode, type CodeLength } from '../../recommendation-code/code-format';
import { serviceDay, shiftServiceDay } from '../../recommendation-code/service-day';

/** At most this many recommendations per guest session and service day (R13): a loop over `table=` cannot drain the code space. */
export const MAX_CODES_PER_SESSION_DAY = 30;
/** The waiter keeps one session for the whole evening on the staff table result (E08), hence a higher limit (R13). */
export const MAX_STAFF_CODES_PER_SESSION_DAY = 300;
/** Candidates tried per code length before the longer form, and before giving up (Q4). */
export const CODE_ATTEMPTS_PER_LENGTH = 6;
/** The longest period of a read (`pairStats`), in service days: one year, as the sales period of E03. */
export const MAX_PERIOD_DAYS = 366;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar date `YYYY-MM-DD` (not 2026-02-30). */
const isDay = (d: string) => DAY.test(d) && shiftServiceDay(d, 0) === d;

/** `invalid_period` unless both ends are dates, `from ≤ to`, and the period has at most MAX_PERIOD_DAYS days. */
export function assertServiceDayPeriod(period: ServiceDayPeriod): void {
  const ok = isDay(period.from) && isDay(period.to) && period.from <= period.to && shiftServiceDay(period.from, MAX_PERIOD_DAYS - 1) >= period.to;
  if (!ok) throw new ValidationError('invalid_period', 'The period is not valid.');
}

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

/** A recommendation found by its code (G9): the record and the wine as stored (also an inactive one), or null when the wine is gone. */
export interface CodeLookup {
  record: RecommendationCodeRecord;
  wine: Wine | null;
}

/**
 * Who marks a code (R7, Q7): the public staff view G9, without a sign-in (Q8). Stored in `confirmed_by`; a signed-in
 * waiter (a separate spec with a PIN) would add a value here.
 */
export type CodeActor = 'staff_view';

/** The one answer for a code that is unknown, of another restaurant, of another service day or malformed (R6, AC8). */
export const CODE_NOT_FOUND = 'code_not_found';

export interface RecommendationCodeServiceDeps extends Pick<Repositories, 'restaurantRepository' | 'wineRepository' | 'dishRepository' | 'recommendationCodeRepository'> {
  clock: Clock;
  idGenerator: IdGenerator;
  logger: Pick<Logger, 'warn'>;
}

/**
 * Recommendation codes (spec 2026-10-16-recommendation-code). Issuing a code is not a command (AGENTS.md §1.3,
 * approved exception Q7): no actor, no expected version, no domain errors — anything that prevents a code gives
 * `null`, and the page renders without one. Confirming and undoing (phase 2) are commands: an actor, and a domain error
 * (`code_not_found`) for anything that is not a code of this restaurant's current service day.
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

  /**
   * Results per (dish, wine, context) for the service days of the period, both ends inclusive (R12, Q12): a table code
   * gives one row per dish with context `table`, a `direct` code none. Readers that credit an order to one dish (E10
   * S5) take context `dish` only. Until POS matching (phase 3) `ordered` = `staffConfirmed`.
   */
  async pairStats(slug: string, period: ServiceDayPeriod): Promise<PairCodeStats[]> {
    assertServiceDayPeriod(period);
    const restaurant = await this.deps.restaurantRepository.findBySlug(slug);
    if (!restaurant) throw new NotFoundError('Restaurant');
    return this.deps.recommendationCodeRepository.pairStats(restaurant.id, { from: period.from, to: period.to });
  }

  /**
   * The recommendation of this code on the current service day of the restaurant (R6), or null — the same null for
   * an unknown code, a code of another restaurant or of another service day, a malformed code and an unknown slug, so
   * the answer never tells that a code existed yesterday. A malformed code never reaches the repository.
   */
  async lookup(slug: string, rawCode: string): Promise<CodeLookup | null> {
    const found = await this.find(slug, rawCode);
    if (!found) return null;
    const record = await this.deps.recommendationCodeRepository.findByCode(found.restaurantId, found.day, found.code);
    return record ? this.withWine(found.restaurantId, record) : null;
  }

  /**
   * "Ordered" (R7): idempotent — a second confirmation keeps the first time (`COALESCE` in one statement). Only a code
   * of the current service day; anything else is `code_not_found`, with no change.
   */
  async confirm(slug: string, rawCode: string, actor: CodeActor): Promise<CodeLookup> {
    return this.mark(slug, rawCode, actor);
  }

  /**
   * "Undo" (R7): clears the confirmation and its author, only on the current service day; anything else is
   * `code_not_found`. The actor names who undoes it (the command's author); nothing of it is kept on an undone code.
   */
  async undo(slug: string, rawCode: string, _actor: CodeActor): Promise<CodeLookup> {
    return this.mark(slug, rawCode, null);
  }

  private async mark(slug: string, rawCode: string, by: CodeActor | null): Promise<CodeLookup> {
    const found = await this.find(slug, rawCode);
    const record = found
      ? await this.deps.recommendationCodeRepository.setConfirmed(found.restaurantId, found.day, found.code, by ? this.deps.clock.now() : null, by)
      : null;
    if (!found || !record) throw new NotFoundError('Code', CODE_NOT_FOUND, 'There is no such code today in this restaurant.');
    return this.withWine(found.restaurantId, record);
  }

  /** The restaurant, the current service day and the code in its stored form, or null for a malformed code or an unknown slug. */
  private async find(slug: string, rawCode: string): Promise<{ restaurantId: string; day: string; code: string } | null> {
    const code = normalizeCode(rawCode);
    if (!code) return null;
    const restaurant = await this.deps.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    return { restaurantId: restaurant.id, day: serviceDay(this.deps.clock.now()), code };
  }

  private async withWine(restaurantId: string, record: RecommendationCodeRecord): Promise<CodeLookup> {
    return { record, wine: await this.deps.wineRepository.findById(restaurantId, record.wineId) };
  }
}
