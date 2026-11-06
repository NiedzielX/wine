import { describe, expect, it } from 'vitest';
import { ROI_DEFAULTS, ROI_FIELDS, ROI_KEYS, computeRoi, parsePrintDate, parseRoiInputs, type RoiInputs, type RoiKey } from '../src/showcase/roi';

/** Spec 2026-11-04-sales-demo-and-roi-calculator, phase F1: the calculator's maths (R2, Q6; AC3, AC4, AC5). */

const roi = (over: Partial<RoiInputs> = {}) => computeRoi({ ...ROI_DEFAULTS, ...over });
const FIELD = (key: RoiKey) => ROI_FIELDS.find((f) => f.key === key)!;

describe('defaults (R2, Q8)', () => {
  it('are the team assumptions of Q8, each with its origin, and lie inside their own range', () => {
    expect(ROI_DEFAULTS).toEqual({ customers: 1500, attachRate: 30, wineSpend: 150, margin: 60, attachChange: 5, spendChange: 10, planPrice: 790 });
    expect(Object.fromEntries(ROI_FIELDS.map((f) => [f.key, f.origin]))).toEqual({
      customers: 'concept', attachRate: 'working', wineSpend: 'working', margin: 'working', attachChange: 'concept', spendChange: 'concept', planPrice: 'concept'
    });
    expect(ROI_FIELDS.map((f) => f.key)).toEqual([...ROI_KEYS]);
    for (const f of ROI_FIELDS) {
      expect(f.default, f.key).toBeGreaterThanOrEqual(f.min);
      expect(f.default, f.key).toBeLessThanOrEqual(f.max);
    }
  });

  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(ROI_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(ROI_FIELDS)).toBe(true);
    expect(() => { (ROI_DEFAULTS as RoiInputs).customers = 1; }).toThrow();
  });
});

describe('computeRoi with the defaults (AC3)', () => {
  const r = roi();

  it('splits 16 500 zl of revenue into 11 250 (more guests ordering wine) and 5 250 (the same guests spending more), exactly', () => {
    expect(r.attachEffect).toBe(11_250);
    expect(r.spendEffect).toBe(5_250);
    expect(r.revenueChange).toBe(16_500);
  });

  it('takes 60% as the margin, 9 900, and 790 for the plan: 9 110 after the fee', () => {
    expect(r.marginChange).toBe(9_900);
    expect(r.netAfterFee).toBe(9_110);
  });

  it('pays the plan back at 790 / 0.6 = 1 316.67 zl of revenue, or 8.78 extra guests ordering wine at 150 zl', () => {
    expect(r.breakEvenRevenue).toBeCloseTo(1_316.67, 2);
    expect(r.breakEvenGuests).toBeCloseTo(8.78, 2);
  });

  it('shows the state after the change and the effective changes', () => {
    expect(r).toMatchObject({ attachRateAfter: 35, effectiveAttachChange: 5, wineSpendAfter: 160, effectiveSpendChange: 10 });
  });

  it('keeps the inputs it was given, as a copy', () => {
    const inputs = { ...ROI_DEFAULTS };
    const out = computeRoi(inputs);
    inputs.customers = 1;
    expect(out.inputs).toEqual(ROI_DEFAULTS);
  });

  it('the two effects add up to C x (a1 x s1 - a0 x s) for a spread of inputs (algebraic identity of Q6)', () => {
    const cases: Array<Partial<RoiInputs>> = [{}, { attachRate: 98 }, { attachRate: 3, attachChange: -50 }, { wineSpend: 0 }, { spendChange: -1000 }, { customers: 17, attachRate: 12.5, wineSpend: 87.25, spendChange: -3.5 }];
    for (const over of cases) {
      const i = { ...ROI_DEFAULTS, ...over };
      const a1 = Math.min(100, Math.max(0, i.attachRate + i.attachChange));
      const s1 = Math.max(0, i.wineSpend + i.spendChange);
      const direct = (i.customers * (a1 * s1 - i.attachRate * i.wineSpend)) / 100;
      const out = computeRoi(i);
      expect(out.revenueChange, JSON.stringify(over)).toBeCloseTo(direct, 6);
      expect(out.attachEffect + out.spendEffect, JSON.stringify(over)).toBeCloseTo(direct, 6);
      expect(out.marginChange).toBeCloseTo((direct * i.margin) / 100, 6);
      expect(out.netAfterFee).toBeCloseTo((direct * i.margin) / 100 - i.planPrice, 6);
    }
  });
});

describe('computeRoi at the boundaries (AC4)', () => {
  it('a0 = 98% and +5 points stops at 100%, and the attach effect uses the 2 points that actually apply', () => {
    const r = roi({ attachRate: 98, attachChange: 5 });
    expect(r.attachRateAfter).toBe(100);
    expect(r.effectiveAttachChange).toBe(2);
    expect(r.attachEffect).toBe((1500 * 2 * 150) / 100); // 4 500, not 11 250
    expect(r.spendEffect).toBe((1500 * 100 * 10) / 100);
  });

  it('a decrease gives a negative revenue and a negative result, shown and not hidden, without an exception', () => {
    const r = roi({ attachChange: -5, spendChange: 0 });
    expect(r.attachEffect).toBe(-11_250);
    expect(r.spendEffect).toBe(0);
    expect(r.revenueChange).toBe(-11_250);
    expect(r.marginChange).toBe(-6_750);
    expect(r.netAfterFee).toBe(-7_540);
    expect(Number.isFinite(r.netAfterFee)).toBe(true);
  });

  it('a share of 30% cut by 50 points stops at 0, not below', () => {
    const r = roi({ attachRate: 30, attachChange: -50 });
    expect(r.attachRateAfter).toBe(0);
    expect(r.effectiveAttachChange).toBe(-30);
    expect(r.spendEffect).toBe(0); // nobody orders wine after the change: nothing left to spend more
    expect(r.attachEffect).toBe(-(1500 * 30 * 150) / 100);
  });

  it('a spend of 150 cut by 1 000 stops at 0, not below', () => {
    const r = roi({ spendChange: -1000 });
    expect(r.wineSpendAfter).toBe(0);
    expect(r.effectiveSpendChange).toBe(-150);
    expect(r.spendEffect).toBe((1500 * 35 * -150) / 100);
  });

  it('a margin of 0 or a spend of 0 has no break-even point instead of a division by zero', () => {
    const noMargin = roi({ margin: 0 });
    expect(noMargin.breakEvenRevenue).toBeNull();
    expect(noMargin.breakEvenGuests).toBeNull();
    expect(noMargin.marginChange).toBe(0);
    expect(noMargin.netAfterFee).toBe(-790);

    const noSpend = roi({ wineSpend: 0 });
    expect(noSpend.breakEvenGuests).toBeNull();
    expect(noSpend.breakEvenRevenue).toBeCloseTo(1_316.67, 2); // depends on the margin only
  });

  it('no customers: every amount that depends on them is 0 (the plan price still stands, as a loss)', () => {
    const r = roi({ customers: 0 });
    expect(r).toMatchObject({ attachEffect: 0, spendEffect: 0, revenueChange: 0, marginChange: 0, netAfterFee: -790 });
    const free = roi({ customers: 0, planPrice: 0 });
    expect(free).toMatchObject({ attachEffect: 0, spendEffect: 0, revenueChange: 0, marginChange: 0, netAfterFee: 0 });
    expect(Object.is(free.netAfterFee, -0)).toBe(false);
    expect(Object.is(free.attachEffect, -0)).toBe(false);
  });

  it('a free plan has a zero break-even point, not null', () => {
    const r = roi({ planPrice: 0 });
    expect(r.breakEvenRevenue).toBe(0);
    expect(r.breakEvenGuests).toBe(0);
    expect(r.netAfterFee).toBe(r.marginChange);
  });

  it('the largest values the form accepts stay finite and exact in whole zloty', () => {
    const r = roi({ customers: 200_000, attachRate: 0, attachChange: 100, wineSpend: 5_000, spendChange: 1_000, margin: 100, planPrice: 50_000 });
    // a1 = 100%, s1 = 6 000: 200 000 x (100 x 6 000 - 0) / 100
    expect(r.revenueChange).toBe(1_200_000_000);
    expect(r.attachEffect).toBe(1_000_000_000); // 200 000 x 100 points x 5 000 zl / 100
    expect(r.spendEffect).toBe((200_000 * 100 * 1_000) / 100);
    expect(r.marginChange).toBe(r.revenueChange);
    expect(r.netAfterFee).toBe(r.revenueChange - 50_000);
    for (const v of Object.values(r)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });

  it('whole-number inputs give whole-number results with no binary noise (0.1 + 0.2 style)', () => {
    for (const customers of [1, 3, 7, 999, 1_501, 123_457]) {
      for (const margin of [1, 7, 33, 60, 99]) {
        const r = roi({ customers, margin });
        for (const v of [r.attachEffect, r.spendEffect, r.revenueChange]) expect(Number.isInteger(v * 100), `${customers}/${margin}: ${v}`).toBe(true);
        expect(r.marginChange, `${customers}/${margin}`).toBe(Number((r.revenueChange * margin / 100).toFixed(8)));
      }
    }
    // the classic: 3 guests x 20 points x 0.1 zl is 0.06, not 0.06000000000000001
    expect(roi({ customers: 3, attachRate: 10, attachChange: 20, wineSpend: 0.1, spendChange: 0 }).attachEffect).toBe(0.06);
  });

  it('refuses a number that is not finite instead of returning NaN', () => {
    expect(() => roi({ customers: Number.NaN })).toThrow(RangeError);
    expect(() => roi({ margin: Number.POSITIVE_INFINITY })).toThrow(/margin/);
  });
});

describe('parseRoiInputs (AC5)', () => {
  const parse = (raw: Record<string, unknown>) => parseRoiInputs(raw);

  it('an empty query is all defaults, nothing replaced, nothing provided', () => {
    expect(parse({})).toEqual({ inputs: ROI_DEFAULTS, replaced: [], provided: [] });
  });

  it("'1500' is 1500 and counts as provided", () => {
    const p = parse({ customers: '1500' });
    expect(p.inputs.customers).toBe(1500);
    expect(p.provided).toEqual(['customers']);
    expect(p.replaced).toEqual([]);
  });

  it('for customers: negative, text, empty, a list, an exponent, a huge number and "__proto__" are the default and are listed', () => {
    for (const bad of ['-5', 'abc', '', ['1', '2'], '1e3', '1e9', '__proto__', '0', '200001', '1,,5', '1.', '.5', '+5', '0x10', 'Infinity', 'NaN', '9'.repeat(400), undefined, 7, null, {}]) {
      const p = parse({ customers: bad });
      expect(p.inputs.customers, JSON.stringify(bad)).toBe(1500);
      // an explicit `undefined` is an absent value, not a bad one; every other bad value is reported
      if (bad === undefined) continue;
      expect(p.replaced, JSON.stringify(bad)).toEqual(['customers']);
      expect(p.provided).toEqual([]);
    }
  });

  it('for the share change a negative number is allowed', () => {
    expect(parse({ attachChange: '-5' }).inputs.attachChange).toBe(-5);
    expect(parse({ attachChange: '-100' }).inputs.attachChange).toBe(-100);
    expect(parse({ attachChange: '-101' }).replaced).toEqual(['attachChange']);
    expect(parse({ spendChange: '-1000' }).inputs.spendChange).toBe(-1000);
    expect(parse({ spendChange: '-1000,5' }).replaced).toEqual(['spendChange']);
  });

  it('a Polish decimal comma is accepted, as is a point', () => {
    expect(parse({ attachRate: '12,5' }).inputs.attachRate).toBe(12.5);
    expect(parse({ attachRate: '12.5' }).inputs.attachRate).toBe(12.5);
    expect(parse({ wineSpend: '149,99' }).inputs.wineSpend).toBe(149.99);
  });

  it('the bounds of every field are inclusive and one step beyond is replaced', () => {
    for (const f of ROI_FIELDS) {
      const at = (v: number) => parse({ [f.key]: String(v) });
      expect(at(f.min).inputs[f.key], `${f.key} min`).toBe(f.min);
      expect(at(f.max).inputs[f.key], `${f.key} max`).toBe(f.max);
      expect(at(f.min - 1).replaced, `${f.key} below`).toEqual([f.key]);
      expect(at(f.max + 1).replaced, `${f.key} above`).toEqual([f.key]);
    }
  });

  it('minus zero becomes zero', () => {
    const v = parse({ attachChange: '-0' }).inputs.attachChange;
    expect(Object.is(v, 0)).toBe(true);
  });

  it('surrounding spaces are ignored, spaces inside are not', () => {
    expect(parse({ customers: ' 1200 ' }).inputs.customers).toBe(1200);
    expect(parse({ customers: '1 200' }).replaced).toEqual(['customers']);
  });

  it('unknown keys are skipped; every field is read independently', () => {
    const p = parse({ nope: '1', customers: '800', margin: 'x', planPrice: '390' });
    expect(p.inputs).toEqual({ ...ROI_DEFAULTS, customers: 800, planPrice: 390 });
    expect(p.provided).toEqual(['customers', 'planPrice']);
    expect(p.replaced).toEqual(['margin']);
    expect(Object.keys(p.inputs).sort()).toEqual([...ROI_KEYS].sort());
  });

  it('a "__proto__" or "constructor" key in the query changes nothing and the prototype stays clean', () => {
    const hostile = Object.fromEntries([['__proto__', '{"polluted":true}'], ['constructor', 'x'], ['toString', '1'], ['customers', '900']]);
    const p = parse(hostile);
    expect(p.inputs).toEqual({ ...ROI_DEFAULTS, customers: 900 });
    expect(p.replaced).toEqual([]);
    expect(Object.getPrototypeOf(p.inputs)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('reads a list of pairs and a Map the same way as an object (the page passes the pairs of the query)', () => {
    const fromUrl = parseRoiInputs([['customers', '2000'], ['margin', '45,5'], ['bogus', '1']]);
    expect(fromUrl.inputs).toMatchObject({ customers: 2000, margin: 45.5 });
    expect(fromUrl.provided).toEqual(['customers', 'margin']);
    expect(parseRoiInputs(new Map([['planPrice', '390']])).inputs.planPrice).toBe(390);
  });

  it('the result always has all seven finite numbers, whatever the input', () => {
    const junk = ['', '-', '--1', '1e400', '١٢٣', '１２３', '1\n2', '%00', '1;2', ' ', '1_000', '-0.0000001', '5%'];
    for (const key of ROI_KEYS) {
      for (const value of junk) {
        const { inputs } = parse({ [key]: value });
        for (const k of ROI_KEYS) expect(Number.isFinite(inputs[k]), `${key}=${value}`).toBe(true);
      }
    }
    expect(FIELD('margin').max).toBe(100);
  });

  it('what parse accepts, compute can always evaluate: the extremes of every field together', () => {
    const lows = parse(Object.fromEntries(ROI_FIELDS.map((f) => [f.key, String(f.min)]))).inputs;
    const highs = parse(Object.fromEntries(ROI_FIELDS.map((f) => [f.key, String(f.max)]))).inputs;
    for (const inputs of [lows, highs]) {
      const r = computeRoi(inputs);
      for (const v of Object.values(r)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('parseRoiInputs: a value read back from a link we built (the page links to itself)', () => {
  it('is kept to six decimals, so printing it never uses an exponent and it reads back as the same number', () => {
    expect(parseRoiInputs({ attachChange: '0.0000001' }).inputs.attachChange).toBe(0);
    expect(parseRoiInputs({ attachChange: '0.0000004' }).provided).toEqual(['attachChange']);
    expect(parseRoiInputs({ wineSpend: '12.3456789' }).inputs.wineSpend).toBe(12.345679);
    for (const text of ['0.000001', '1', '1,5', '149.99', '99.999999', '-12.5', '0']) {
      const once = parseRoiInputs({ attachChange: text }).inputs.attachChange;
      expect(String(once), text).not.toMatch(/e/i);
      expect(parseRoiInputs({ attachChange: String(once) }).inputs.attachChange, text).toBe(once);
    }
  });

  it('a value that only rounds into range is accepted at the edge and one that rounds out of it is not', () => {
    expect(parseRoiInputs({ customers: '0.9999996' }).inputs.customers).toBe(1);
    expect(parseRoiInputs({ customers: '0.9999994' }).replaced).toEqual(['customers']);
  });
});

describe('parsePrintDate (R5: the date on the printout is typed, never read from the clock)', () => {
  it('keeps a real calendar day as YYYY-MM-DD and nothing else', () => {
    expect(parsePrintDate('2026-11-06')).toBe('2026-11-06');
    expect(parsePrintDate('2028-02-29')).toBe('2028-02-29');
    expect(parsePrintDate('2000-02-29')).toBe('2000-02-29');
    for (const bad of ['2026-02-29', '2100-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-4-5', '06.11.2026', '2026-11-06T10:00', ' 2026-11-06', '1899-12-31', '', undefined, null, 20261106, ['2026-11-06'], '<script>']) {
      expect(parsePrintDate(bad), String(bad)).toBeNull();
    }
  });
});
