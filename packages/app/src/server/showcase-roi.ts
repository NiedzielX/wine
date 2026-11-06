import { isLocale, ROI_FIELDS, ROI_KEYS, type Locale, type ParsedRoiInputs, type RoiInputs, type RoiKey, type RoiOrigin, type RoiResult, type RoiUnit } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';
import { formatNumber, formatPrice } from './i18n';

/**
 * What the calculator pages show, derived from the parsed inputs and the result (spec 2026-11-04-sales-demo-and-roi-calculator,
 * R3, R4, R5): the form fields with where each default comes from, the steps of the formula with the person's numbers
 * substituted, and the links that carry the numbers in the URL. Pure: texts come in, strings go out, no request state.
 */

type Texts = Dictionary['showcase'];

/** Whole zloty for display only (the maths keeps its decimals); `-0` and `0` print the same. */
const whole = (n: number) => Math.round(n) + 0;

export interface Formatters {
  money: (n: number) => string;
  percent: (n: number) => string;
  points: (n: number) => string;
  plain: (n: number) => string;
  /** a value of one input with its unit: "1 500 gości", "30%", "5 pp", "150 zł" */
  value: (unit: RoiUnit, n: number) => string;
}

export function formatters(locale: Locale, t: Texts): Formatters {
  const money = (n: number) => formatPrice(whole(n), locale);
  const percent = (n: number) => `${formatNumber(n, locale)}%`;
  const points = (n: number) => `${formatNumber(n, locale)} pp`;
  const plain = (n: number) => formatNumber(n, locale);
  const value = (unit: RoiUnit, n: number) =>
    unit === 'count' ? t.roi.guests(n, plain(n)) : unit === 'percent' ? percent(n) : unit === 'points' ? points(n) : money(n);
  return { money, percent, points, plain, value };
}

/** `a + b` or `a − b` with the sign taken out of the number, so a negative value reads as a subtraction. */
const plus = (n: number, show: (n: number) => string) => (n < 0 ? `− ${show(-n)}` : `+ ${show(n)}`);

/** The explicit language of the request (`?lang`), kept in the links so the page stays in it; undefined when the browser's choice applies. */
export function explicitLang(raw: unknown): Locale | undefined {
  return isLocale(raw) ? raw : undefined;
}

/** All seven numbers in canonical form (decimal point, no exponent: `parseRoiInputs` keeps six decimals), plus the extras that are set. */
export function roiQuery(inputs: RoiInputs, extra: Readonly<Record<string, string | undefined>> = {}): string {
  const q = new URLSearchParams();
  for (const key of ROI_KEYS) q.set(key, String(inputs[key]));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') q.set(k, v);
  return q.toString();
}

export interface RoiFieldView {
  key: RoiKey;
  symbol: string;
  label: string;
  help: string;
  unit: RoiUnit;
  unitText: string;
  /** what the input holds: the number with the language's decimal sign */
  inputValue: string;
  /** the value with its unit, as the summary shows it */
  valueText: string;
  defaultText: string;
  origin: RoiOrigin | 'own';
  originText: string;
  min: number;
  max: number;
}

export function roiFieldViews(parsed: ParsedRoiInputs, locale: Locale, t: Texts): RoiFieldView[] {
  const f = formatters(locale, t);
  const provided = new Set<RoiKey>(parsed.provided);
  return ROI_FIELDS.map((field) => {
    const text = t.roi.fields[field.key];
    const defaultText = f.value(field.unit, field.default);
    const own = provided.has(field.key);
    return {
      key: field.key,
      symbol: text.symbol,
      label: text.label,
      help: text.help,
      unit: field.unit,
      unitText: t.roi.units[field.unit],
      inputValue: locale === 'pl' ? String(parsed.inputs[field.key]).replace('.', ',') : String(parsed.inputs[field.key]),
      valueText: f.value(field.unit, parsed.inputs[field.key]),
      defaultText,
      origin: own ? 'own' : field.origin,
      originText: own ? t.roi.origin.own(defaultText) : t.roi.origin[field.origin],
      min: field.min,
      max: field.max
    };
  });
}

export interface RoiStepView {
  id: 'attachAfter' | 'spendAfter' | 'attachEffect' | 'spendEffect' | 'revenue' | 'margin' | 'net' | 'breakEvenRevenue' | 'breakEvenGuests';
  label: string;
  /** the formula with symbols */
  formula: string;
  /** the same with the person's numbers */
  filled: string;
  /** the outcome, with its unit */
  value: string;
  note?: string;
}

/** The steps of the formula in the order of the calculation, each with symbols, then with the numbers, then the outcome (R3). */
export function roiSteps(r: RoiResult, locale: Locale, t: Texts): RoiStepView[] {
  const f = formatters(locale, t);
  const s = t.roi.steps;
  const i = r.inputs;
  const guestsRounded = r.breakEvenGuests === null ? null : Math.round(r.breakEvenGuests * 10) / 10;
  const attachClamped = r.effectiveAttachChange !== i.attachChange;
  const spendClamped = r.effectiveSpendChange !== i.spendChange;
  return [
    {
      id: 'attachAfter', label: s.after.attach, formula: s.symbolic.attachAfter,
      filled: `min(100%, max(0%, ${f.percent(i.attachRate)} ${plus(i.attachChange, f.points)}))`, value: f.percent(r.attachRateAfter),
      note: attachClamped ? s.clamped(f.points(i.attachChange), f.points(r.effectiveAttachChange)) : undefined
    },
    {
      id: 'spendAfter', label: s.after.spend, formula: s.symbolic.spendAfter,
      filled: `max(0, ${f.money(i.wineSpend)} ${plus(i.spendChange, f.money)})`, value: f.money(r.wineSpendAfter),
      note: spendClamped ? s.clampedSpend(f.money(i.spendChange), f.money(r.effectiveSpendChange)) : undefined
    },
    {
      id: 'attachEffect', label: s.effect.attach, formula: s.symbolic.attachEffect,
      filled: `${f.plain(i.customers)} × (${f.percent(r.attachRateAfter)} − ${f.percent(i.attachRate)}) × ${f.money(i.wineSpend)}`, value: f.money(r.attachEffect)
    },
    {
      id: 'spendEffect', label: s.effect.spend, formula: s.symbolic.spendEffect,
      filled: `${f.plain(i.customers)} × ${f.percent(r.attachRateAfter)} × (${f.money(r.wineSpendAfter)} − ${f.money(i.wineSpend)})`, value: f.money(r.spendEffect)
    },
    {
      id: 'revenue', label: s.revenue, formula: s.symbolic.revenue,
      filled: `${f.money(r.attachEffect)} ${plus(r.spendEffect, f.money)}`, value: f.money(r.revenueChange)
    },
    {
      id: 'margin', label: s.margin, formula: s.symbolic.margin,
      filled: `${f.percent(i.margin)} × ${f.money(r.revenueChange)}`, value: f.money(r.marginChange)
    },
    {
      id: 'net', label: s.net, formula: s.symbolic.net,
      filled: `${f.money(r.marginChange)} − ${f.money(i.planPrice)}`, value: f.money(r.netAfterFee)
    },
    {
      id: 'breakEvenRevenue', label: s.breakEvenRevenue, formula: s.symbolic.breakEvenRevenue,
      filled: `${f.money(i.planPrice)} ÷ ${f.percent(i.margin)}`,
      value: r.breakEvenRevenue === null ? s.noneMargin : s.perMonthSuffix(f.money(r.breakEvenRevenue))
    },
    {
      id: 'breakEvenGuests', label: s.breakEvenGuests, formula: s.symbolic.breakEvenGuests,
      filled: `${f.money(i.planPrice)} ÷ (${f.percent(i.margin)} × ${f.money(i.wineSpend)})`,
      value: guestsRounded === null ? s.noneSpend : s.guestsMore(t.roi.guests(guestsRounded, f.plain(guestsRounded)))
    }
  ];
}
