import { describe, expect, it } from 'vitest';
import { changeText, percentInterval, percentWhole } from '@/app/(admin)/admin/_components/proof-format';

/** Spec 2026-11-18-owner-proof-report, R4: the screen rounds intervals outward and never shows "+0" for an increase. */
describe('proof number formatting', () => {
  it('rounds a point value to the nearest whole percent', () => {
    expect(percentWhole(0.35, 'en')).toBe('35%');
    expect(percentWhole(0.476, 'pl')).toBe('48%');
    expect(percentWhole(0, 'en')).toBe('0%');
    expect(percentWhole(1, 'en')).toBe('100%');
  });

  it('rounds a Wilson interval outward and keeps it inside 0..100', () => {
    expect(percentInterval(0.271, 0.439, 'en')).toBe('27%–44%');
    expect(percentInterval(0.2701, 0.4301, 'en')).toBe('27%–44%');
    expect(percentInterval(0, 0.0912, 'pl')).toBe('0%–10%');
    expect(percentInterval(0.9, 1, 'en')).toBe('90%–100%');
  });

  it('writes the change of H2 (+15.0 pp, [+2.73, +26.62]) with the ends rounded outward', () => {
    expect(changeText({ deltaPp: 15, lowPp: 2.73, highPp: 26.62 }, 'increase', 'en')).toEqual({ delta: '+15', low: '+2', high: '+27' });
  });

  it('writes an inconclusive change with a real minus sign and outward ends (H5)', () => {
    expect(changeText({ deltaPp: 10, lowPp: -10.16, highPp: 28.81 }, 'inconclusive', 'pl')).toEqual({ delta: '+10', low: '−11', high: '+29' });
    expect(changeText({ deltaPp: -6, lowPp: -19.3, highPp: 7.6 }, 'inconclusive', 'en')).toEqual({ delta: '−6', low: '−20', high: '+8' });
  });

  it('shows an increase whose lower end is under one point with one decimal, never as "+0"', () => {
    expect(changeText({ deltaPp: 9, lowPp: 0.4, highPp: 18 }, 'increase', 'en').low).toBe('+0.4');
    expect(changeText({ deltaPp: 9, lowPp: 0.96, highPp: 18 }, 'increase', 'en').low).toBe('+0.9');
    expect(changeText({ deltaPp: 9, lowPp: 0.001, highPp: 18 }, 'increase', 'pl').low).toBe('+0,1');
    expect(changeText({ deltaPp: 9, lowPp: 1.2, highPp: 18 }, 'increase', 'en').low).toBe('+1');
  });

  it('mirrors that for a decrease whose upper end is above minus one point', () => {
    expect(changeText({ deltaPp: -9, lowPp: -18, highPp: -0.4 }, 'decrease', 'en').high).toBe('−0.4');
    expect(changeText({ deltaPp: -9, lowPp: -18, highPp: -2.2 }, 'decrease', 'en').high).toBe('−2');
  });
});
