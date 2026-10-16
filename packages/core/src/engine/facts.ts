import { BEST_VALUE_WINDOW, BUDGET_FALLBACK_COUNT, DEFAULT_LIMIT, MIN_MODEL_SCORE, SOMMELIER_BOOST } from './recommend';
import { BASE_SCORE, MAX_SCORE } from './scoring';
import {
  COMPROMISE_THRESHOLD,
  TABLE_LIMIT,
  TABLE_MAINS_WEIGHT,
  TABLE_MEAN_WEIGHT,
  TABLE_MIN_WEIGHT,
  TABLE_REJECTED_CAP,
  TABLE_SOMMELIER_BONUS,
  WEAK_DISH_THRESHOLD
} from './table';

/** The named engine constants, one entry per fact a text may state. */
const FACTS = {
  /** every pairing starts here before the rules adjust it (`scoring.ts`) */
  baseScore: BASE_SCORE,
  /** top of the Match Score scale */
  maxScore: MAX_SCORE,
  /** an engine-only wine below this Match Score is not shown for a dish */
  minModelScore: MIN_MODEL_SCORE,
  /** ranking boost of a sommelier pick (does not change the displayed Match Score) */
  sommelierRankBoost: SOMMELIER_BOOST,
  /** wines listed for one dish */
  dishLimit: DEFAULT_LIMIT,
  /** closest options shown when nothing fits the budget */
  budgetFallbackCount: BUDGET_FALLBACK_COUNT,
  /** best value: a cheaper bottle within this many points of the top match */
  bestValueWindow: BEST_VALUE_WINDOW,
  /** bottles listed for the table */
  tableLimit: TABLE_LIMIT,
  /** table score = mean weight × weighted mean + min weight × weakest dish */
  tableMeanWeight: TABLE_MEAN_WEIGHT,
  tableMinWeight: TABLE_MIN_WEIGHT,
  /** a main course counts this much in the weighted mean (starters 1) */
  tableMainsWeight: TABLE_MAINS_WEIGHT,
  /** a sommelier-approved pairing adds this to the dish score at the table */
  tableSommelierBonus: TABLE_SOMMELIER_BONUS,
  /** a rejected pairing caps the dish score at the table */
  tableRejectedCap: TABLE_REJECTED_CAP,
  /** below this table score a split (one glass per dish) is suggested */
  compromiseThreshold: COMPROMISE_THRESHOLD,
  /** below this score for the weakest dish a split is suggested */
  weakDishThreshold: WEAK_DISH_THRESHOLD
};

/**
 * The shape of ENGINE_FACTS with plain numbers (not the literal types of today's values), so a text can be
 * tested with any set of facts, e.g. unique markers that prove a number comes from the parameter.
 */
export type EngineFacts = { readonly [K in keyof typeof FACTS]: number };

/**
 * The engine's numbers in one read-only object, for every text that explains the engine to guests,
 * waiters and the sommelier ("How it works", spec 2026-10-16-how-it-works-explanations, R8).
 * Texts take numbers from here as parameters, never as literals, so a calibration change cannot leave
 * an explanation behind. The values are the constants the engine itself uses — not copies.
 * A new threshold that a text describes is added here together with its named constant.
 */
export const ENGINE_FACTS: EngineFacts = Object.freeze(FACTS);
