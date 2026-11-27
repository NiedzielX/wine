import { can } from '../../auth/permissions';
import type { Role } from '../../auth/types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../errors';
import type { ProofLaunchEntry } from '../../ports/proof';
import type { Repositories } from '../../ports/repositories';
import type { Clock, IdGenerator } from '../../ports/runtime';
import { serviceDay, shiftServiceDay } from '../../recommendation-code/service-day';
import { parseWith } from '../../validators/parse';
import { launchDaySchema } from '../../validators/proof/launch-day.schema';
import { proofWindowQuerySchema } from '../../validators/proof/window.schema';
import { businessDayTime } from '../../validators/sales/sales-period.schema';
import { computeProofReport, PROOF_MAX_WINDOW, PROOF_WINDOW_DAYS, proofWindows, type ProofReport } from './proof-report';

export type ProofReportServiceDeps = Pick<Repositories, 'restaurantRepository' | 'salesRepository' | 'recommendationCodeRepository' | 'proofLaunchRepository'> & {
  /** the only source of `now` (the report itself is a pure function of it) */
  clock: Clock;
  idGenerator: IdGenerator;
};

/** Who writes the launch day: the role is stored, the membership is the audit link; never a name. */
export interface ProofActor {
  role: Role;
  membershipId: string | null;
}

/** An entry of the log with what the screen says about it (R5). */
export interface ProofLaunchView extends ProofLaunchEntry {
  /** a later entry made after window 1 (of the day it replaced) had ended: "L changed after window 1 ended" */
  afterWindow1: boolean;
}

export interface ProofReportResult {
  report: ProofReport;
  /** the window shown (the newest complete one when the caller chose none) */
  window: number;
  /** the launch day log: the current entry, the history newest first, how many times the day was changed */
  launch: { current: ProofLaunchView | null; history: ProofLaunchView[]; changes: number };
}

const DAY_MS = 86_400_000;

/**
 * The results report of the owner (spec 2026-11-18-owner-proof-report, R1, R5, R7, R10 to R12): reads the checks of the
 * baseline and of all windows in ONE query (`checkTotalsMarked`), the launch day log and the code summary, and hands
 * them with `now` from the clock to the pure `computeProofReport`. Nothing is stored: the report is computed on every
 * call from the active POS lines. Reading needs `proof.view` and the one command `setLaunchDay` needs `proof.manage`;
 * the entry points (page, action, route) check the permission, as with every command, and `setLaunchDay` checks the
 * actor's role once more. The restaurant is always the one the slug names, never a value from the body.
 */
export class ProofReportService {
  private readonly d: ProofReportServiceDeps;

  constructor(deps: ProofReportServiceDeps) {
    this.d = deps;
  }

  private async restaurantId(slug: string): Promise<string> {
    const r = await this.d.restaurantRepository.findBySlug(slug);
    if (!r) throw new NotFoundError('Restaurant');
    return r.id;
  }

  /**
   * The report of one window (1 to 12; absent = the newest complete one). NotFoundError for an unknown slug;
   * `invalid_window` (ValidationError) for a window outside 1..12, not a whole number, or one that starts in the future.
   */
  async getReport(slug: string, window?: unknown): Promise<ProofReportResult> {
    const query = parseQuery(window);
    const restaurantId = await this.restaurantId(slug);
    const now = this.d.clock.now();
    const history = await this.d.proofLaunchRepository.history(restaurantId);
    const current = history[0] ?? null;
    const launchDay = current?.launchDay ?? null;
    const index = query ?? (launchDay ? newestCompleteWindow(launchDay, now) : 1);
    if (launchDay && proofWindows(launchDay, index, now).window.from > serviceDay(now)) {
      throw new ValidationError('invalid_window', 'This window has not started yet.');
    }

    const dataRange = await this.d.salesRepository.dataRange(restaurantId);
    let checks: Awaited<ReturnType<Repositories['salesRepository']['checkTotalsMarked']>> = [];
    let codes: ProofReport['codes'] = null;
    if (launchDay) {
      const w = proofWindows(launchDay, index, now);
      if (dataRange) checks = await this.d.salesRepository.checkTotalsMarked(restaurantId, w.span);
      codes = await this.codeSummary(restaurantId, w.window);
    }
    const report = computeProofReport({ launchDay, window: index, now, dataRange, baselineChecks: checks, windowChecks: checks, codes });
    const views = withFlags(history);
    return { report, window: index, launch: { current: views[0] ?? null, history: views, changes: Math.max(history.length - 1, 0) } };
  }

  /**
   * Adds a launch day entry (R5, R11). Needs `proof.manage` (ForbiddenError otherwise). `invalid_launch_day` for a bad
   * format, a day before 2020-01-01 or after today's service day; `reason_required` from the second entry;
   * `version_conflict` when `expectedCurrent` is not the current entry (the port decides under its lock). Returns the entry.
   */
  async setLaunchDay(slug: string, input: unknown, actor: ProofActor): Promise<ProofLaunchEntry> {
    if (!can(actor.role, 'proof.manage')) throw new ForbiddenError();
    const restaurantId = await this.restaurantId(slug);
    const body = parseBody(input);
    const now = this.d.clock.now();
    if (body.launchDay > serviceDay(now)) throw new ValidationError('invalid_launch_day', 'The launch day cannot be in the future.', { launchDay: 'in_future' });
    return this.d.proofLaunchRepository.append(restaurantId, {
      id: this.d.idGenerator.uuid(), launchDay: body.launchDay, reason: body.reason ?? null, setByRole: actor.role, setByMembershipId: actor.membershipId,
      at: now.toISOString(), expectedCurrent: body.expectedCurrent
    });
  }

  /** The same totals `RecommendationCodeService.summary` returns for the window (R7), read from the same port. */
  private async codeSummary(restaurantId: string, period: { from: string; to: string }) {
    const codes = this.d.recommendationCodeRepository;
    const [totals, unmatchedPosCodes] = await Promise.all([codes.totals(restaurantId, period), codes.unmatchedPosCodes(restaurantId, period)]);
    return { period: { from: period.from, to: period.to }, ...totals, unmatchedPosCodes };
  }
}

function parseQuery(window: unknown): number | undefined {
  try {
    return parseWith(proofWindowQuerySchema, { window: window ?? undefined }).window;
  } catch (e) {
    if (e instanceof ValidationError) throw new ValidationError('invalid_window', `The window must be a whole number from 1 to ${PROOF_MAX_WINDOW}.`, e.fields);
    throw e;
  }
}

/** A problem in the launch day itself is `invalid_launch_day`; any other problem of the body keeps the generic code. */
function parseBody(input: unknown) {
  try {
    return parseWith(launchDaySchema, input);
  } catch (e) {
    if (e instanceof ValidationError && e.fields && 'launchDay' in e.fields) {
      throw new ValidationError('invalid_launch_day', 'The launch day must be a real date from 2020-01-01 (YYYY-MM-DD).', e.fields);
    }
    throw e;
  }
}

/** The newest window that has ended (data may still be missing: the report says so), at least 1 and at most 12. */
function newestCompleteWindow(launchDay: string, now: Date): number {
  const last = businessDayTime(shiftServiceDay(serviceDay(now), -1));
  const first = businessDayTime(launchDay);
  if (last === null || first === null) return 1;
  const days = Math.round((last - first) / DAY_MS) + 1;
  return Math.min(Math.max(Math.floor(days / PROOF_WINDOW_DAYS), 1), PROOF_MAX_WINDOW);
}

/** `history` is newest first; an entry is flagged when it was made after window 1 of the day it replaced had ended. */
function withFlags(history: ProofLaunchEntry[]): ProofLaunchView[] {
  return history.map((entry, i) => {
    const replaced = history[i + 1];
    const afterWindow1 = replaced ? serviceDay(new Date(entry.setAt)) > shiftServiceDay(replaced.launchDay, PROOF_WINDOW_DAYS - 1) : false;
    return { ...entry, afterWindow1 };
  });
}
