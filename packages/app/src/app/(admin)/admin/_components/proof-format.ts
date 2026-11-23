import type { Locale, ProofReport } from '@wine-match/core';

/**
 * How the results report writes its numbers (spec 2026-11-18-owner-proof-report, R4): the API keeps full precision, the screen
 * rounds OUTWARD, so an interval never looks narrower than it is: the lower end down, the upper end up, to whole percentage
 * points; when a verdict says the change is above (below) zero and the end is less than one point from zero, it is shown with one
 * decimal and never as "+0" ("−0"). Point values round to the nearest whole number. Pure, so it is unit-tested.
 */
const EPS = 1e-9;
const MINUS = '−';

const format = (locale: Locale, digits: number) => new Intl.NumberFormat(locale === 'pl' ? 'pl-PL' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A rate 0..1 as a whole percent: "35%". */
export const percentWhole = (rate: number, locale: Locale): string => `${format(locale, 0).format(Math.round(rate * 100 + EPS))}%`;

/** A Wilson interval (rates 0..1) rounded outward to whole percents, clamped to 0..100: "27%–44%". */
export function percentInterval(low: number, high: number, locale: Locale): string {
  const lo = Math.max(0, Math.floor(low * 100 + EPS));
  const hi = Math.min(100, Math.ceil(high * 100 - EPS));
  return `${format(locale, 0).format(lo)}%–${format(locale, 0).format(hi)}%`;
}

/** A signed number of points: "+15", "−8", "0" (a real minus sign). */
function signed(value: number, digits: number, locale: Locale): string {
  const text = format(locale, digits).format(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `${MINUS}${text}`;
  return text;
}

export interface ChangeText {
  /** the point estimate, rounded to the nearest whole point: "+15" */
  delta: string;
  /** the interval end below, rounded down: "+3" */
  low: string;
  /** the interval end above, rounded up: "+27" */
  high: string;
}

/** The change of the report and its interval as text (the report must have a change: the verdict is not `insufficient`). */
export function changeText(change: NonNullable<ProofReport['change']>, verdict: ProofReport['verdict'], locale: Locale): ChangeText {
  const delta = signed(Math.round(change.deltaPp + EPS * Math.sign(change.deltaPp)), 0, locale);
  let low = Math.floor(change.lowPp + EPS);
  let high = Math.ceil(change.highPp - EPS);
  let lowText = signed(low, 0, locale);
  let highText = signed(high, 0, locale);
  if (verdict === 'increase' && change.lowPp < 1) {
    low = Math.max(Math.floor(change.lowPp * 10 + EPS) / 10, 0.1);
    lowText = signed(low, 1, locale);
  }
  if (verdict === 'decrease' && change.highPp > -1) {
    high = Math.min(Math.ceil(change.highPp * 10 - EPS) / 10, -0.1);
    highText = signed(high, 1, locale);
  }
  return { delta, low: lowText, high: highText };
}
