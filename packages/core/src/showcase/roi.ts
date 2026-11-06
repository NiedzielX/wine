/**
 * The return calculator for a restaurant owner (spec 2026-11-04-sales-demo-and-roi-calculator, R2, Q6, Q8). Pure functions,
 * no I/O, no clock: the page reads the numbers from the URL (`parseRoiInputs`) and shows what `computeRoi` derives from them.
 *
 * EVERY number here is an ASSUMPTION of the Wine Match team (decision D19), never a measurement: the defaults are either
 * taken from the product concept (`origin: 'concept'`) or are working values with no source (`origin: 'working'`). The one
 * place to change them is `ROI_FIELDS`. The model attributes the WHOLE change in the share of guests and in their spend to the
 * product, with no seasonality, ramp-up or restaurant-side cost: that is an assumption, not a causal claim.
 */

export const ROI_KEYS = ['customers', 'attachRate', 'wineSpend', 'margin', 'attachChange', 'spendChange', 'planPrice'] as const;
export type RoiKey = (typeof ROI_KEYS)[number];

/** The seven inputs. Percentages are in percent (30 = 30%), changes of a share in percentage points, money in zloty. */
export type RoiInputs = Record<RoiKey, number>;

/** Where a default value comes from: the product concept (PRODUCT_CONCEPT section 5) or a working value of the team with no source. */
export type RoiOrigin = 'concept' | 'working';
export type RoiUnit = 'count' | 'percent' | 'points' | 'pln';

export interface RoiField {
  key: RoiKey;
  unit: RoiUnit;
  /** inclusive bounds of a value accepted from the URL */
  min: number;
  max: number;
  default: number;
  origin: RoiOrigin;
}

/** The inputs in the order the form shows them: the restaurant's numbers first, then the team's assumptions. */
export const ROI_FIELDS: readonly RoiField[] = Object.freeze([
  { key: 'customers', unit: 'count', min: 1, max: 200_000, default: 1_500, origin: 'concept' },
  { key: 'attachRate', unit: 'percent', min: 0, max: 100, default: 30, origin: 'working' },
  { key: 'wineSpend', unit: 'pln', min: 0, max: 5_000, default: 150, origin: 'working' },
  { key: 'margin', unit: 'percent', min: 0, max: 100, default: 60, origin: 'working' },
  { key: 'attachChange', unit: 'points', min: -100, max: 100, default: 5, origin: 'concept' },
  { key: 'spendChange', unit: 'pln', min: -1_000, max: 1_000, default: 10, origin: 'concept' },
  { key: 'planPrice', unit: 'pln', min: 0, max: 50_000, default: 790, origin: 'concept' }
].map((f) => Object.freeze(f) as RoiField));

export const ROI_DEFAULTS: Readonly<RoiInputs> = Object.freeze(Object.fromEntries(ROI_FIELDS.map((f) => [f.key, f.default])) as RoiInputs);

export interface ParsedRoiInputs {
  inputs: RoiInputs;
  /** fields that were in the query but unusable (not a plain number, out of range, repeated): the default was used instead */
  replaced: RoiKey[];
  /** fields whose value came from the query and was accepted (their origin is the person's own assumption) */
  provided: RoiKey[];
}

/** A plain decimal: digits with an optional `.` or `,` fraction and an optional minus; no exponent, no sign plus, no spaces inside. */
const DECIMAL = /^-?\d+([.,]\d+)?$/;

function parseDecimal(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!DECIMAL.test(text)) return null;
  const n = Number(text.replace(',', '.'));
  // a string of 400 digits is a valid pattern and an infinite number
  if (!Number.isFinite(n)) return null;
  return n + 0; // "-0" becomes 0
}

/**
 * The calculator's inputs from a query (`searchParams` or any list of pairs). Keys are looked up in a `Map`, never read from a
 * plain object, so `__proto__` or `constructor` in a link change nothing. A missing key is the default, silently; a present but
 * unusable value is the default too and the key is listed in `replaced` so the page can say so.
 */
export function parseRoiInputs(raw: Iterable<readonly [string, unknown]> | Readonly<Record<string, unknown>>): ParsedRoiInputs {
  const entries = Symbol.iterator in raw ? (raw as Iterable<readonly [string, unknown]>) : Object.entries(raw);
  const query = new Map<string, unknown>(entries);
  const values = new Map<RoiKey, number>();
  const replaced: RoiKey[] = [];
  const provided: RoiKey[] = [];
  for (const field of ROI_FIELDS) {
    if (!query.has(field.key)) {
      values.set(field.key, field.default);
      continue;
    }
    const n = parseDecimal(query.get(field.key));
    if (n === null || n < field.min || n > field.max) {
      values.set(field.key, field.default);
      replaced.push(field.key);
    } else {
      values.set(field.key, n);
      provided.push(field.key);
    }
  }
  return { inputs: Object.fromEntries(values) as RoiInputs, replaced, provided };
}

export interface RoiResult {
  inputs: RoiInputs;
  /** share of guests who order wine after the change, in percent, kept within 0..100 */
  attachRateAfter: number;
  /** the change of the share that actually applies after the cut at 0 and 100, in percentage points */
  effectiveAttachChange: number;
  /** average wine spend of a guest who orders wine after the change, never below 0 */
  wineSpendAfter: number;
  /** the change of the spend that actually applies after the cut at 0 */
  effectiveSpendChange: number;
  /** customers x effective change of the share x today's spend: more guests ordering wine */
  attachEffect: number;
  /** customers x share after x effective change of the spend: the same guests spending more */
  spendEffect: number;
  /** attachEffect + spendEffect = customers x (a1 x s1 - a0 x s) */
  revenueChange: number;
  /** margin x revenueChange */
  marginChange: number;
  /** marginChange minus the plan price: extra gross margin from wine after the fee, NOT a profit (no rollout cost, staff time or other effects) */
  netAfterFee: number;
  /** revenue that pays for the plan at this margin (price / margin), in zloty; null when the margin is 0 */
  breakEvenRevenue: number | null;
  /** extra guests ordering wine that pay for the plan at today's spend and margin; null when the margin or the spend is 0 */
  breakEvenGuests: number | null;
}

/**
 * Binary floating point cannot hold 0.35 - 0.30, so every figure is cleaned to 14 significant digits (which removes the noise of
 * the last bits and not a single real digit of money) and `-0` becomes `0`. The products are formed BEFORE the division by 100, so
 * whole-number inputs stay exact all the way. Rounding to whole zloty is the page's job, at display time.
 */
const clean = (n: number): number => Number(n.toPrecision(14)) + 0;

/**
 * The model of Q6: `a1 = clamp(a0 + da, 0, 100)`, `s1 = max(0, s + ds)`, `revenue = C x (a1 x s1 - a0 x s)`, split into the two
 * effects, `margin = m x revenue`, `after the fee = margin - P`. A negative result is a result and is shown. The inputs are
 * expected to come from `parseRoiInputs`; a value that is not a finite number is a programming error and throws.
 */
export function computeRoi(inputs: RoiInputs): RoiResult {
  for (const key of ROI_KEYS) {
    if (!Number.isFinite(inputs[key])) throw new RangeError(`computeRoi: ${key} is not a finite number`);
  }
  const { customers: c, attachRate: a0, wineSpend: s, margin: m, attachChange: da, spendChange: ds, planPrice: p } = inputs;
  const a1 = Math.min(100, Math.max(0, a0 + da));
  const s1 = Math.max(0, s + ds);
  const effectiveAttachChange = a1 - a0;
  const effectiveSpendChange = s1 - s;

  const attachEffect = (c * effectiveAttachChange * s) / 100;
  const spendEffect = (c * a1 * effectiveSpendChange) / 100;
  const revenueChange = attachEffect + spendEffect;
  const marginChange = (revenueChange * m) / 100;
  const netAfterFee = marginChange - p;

  const finiteOrNull = (n: number) => (Number.isFinite(n) ? clean(n) : null);
  return {
    inputs: { ...inputs },
    attachRateAfter: clean(a1),
    effectiveAttachChange: clean(effectiveAttachChange),
    wineSpendAfter: clean(s1),
    effectiveSpendChange: clean(effectiveSpendChange),
    attachEffect: clean(attachEffect),
    spendEffect: clean(spendEffect),
    revenueChange: clean(revenueChange),
    marginChange: clean(marginChange),
    netAfterFee: clean(netAfterFee),
    breakEvenRevenue: m > 0 ? finiteOrNull((p * 100) / m) : null,
    breakEvenGuests: m > 0 && s > 0 ? finiteOrNull((p * 100) / (m * s)) : null
  };
}
