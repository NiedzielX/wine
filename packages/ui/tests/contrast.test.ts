import { describe, expect, it } from 'vitest';
import { buildRows, contrast, roleOf, tokensOf } from '../src/stories/contrast';

const CSS = `
:root { --radius: 0.625rem; --background: #ffffff; --foreground: #000000; --primary: #5a1a2c; --primary-foreground: #f3e9eb; --input: #d4ccd0; }
.dark { --background: #111111; --foreground: #ffffff; --primary: #d9a3b1; --primary-foreground: #2a0b15; }
`;

/** Contrast math: WCAG 2.x reference values. */
describe('contrast: WCAG 2.x ratio', () => {
  it('black on white is 21:1, a colour on itself is 1:1, and the order does not matter', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#5a1a2c', '#5a1a2c')).toBeCloseTo(1, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(contrast('#000000', '#ffffff'), 10);
  });
});

/** Token extraction: only hex colours of the named block count. */
describe('tokensOf: reads the colour tokens of one block', () => {
  it('takes :root and .dark separately and skips non-colour values', () => {
    expect(tokensOf(CSS, ':root')).toEqual({
      background: '#ffffff',
      foreground: '#000000',
      primary: '#5a1a2c',
      'primary-foreground': '#f3e9eb',
      input: '#d4ccd0'
    });
    expect(tokensOf(CSS, '.dark')).toMatchObject({ background: '#111111', primary: '#d9a3b1' });
  });
});

/** Roles decide the requirement: text 4.5:1, UI boundary 3:1, surfaces and decoration none. */
describe('roleOf: what each token must reach', () => {
  const light = tokensOf(CSS, ':root');
  it('pairs *-foreground with its base surface and gives input 3:1', () => {
    expect(roleOf('primary-foreground', light)).toEqual({ kind: 'text', against: 'primary', min: 4.5 });
    expect(roleOf('input', light)).toEqual({ kind: 'ui', against: 'background', min: 3 });
    expect(roleOf('card', light).min).toBeUndefined();
    expect(roleOf('border', light).min).toBeUndefined();
  });
});

/** The table reports failures instead of hiding them: #d4ccd0 is a border on white and does not reach 3:1. */
describe('buildRows: contrast per token in both themes', () => {
  it('computes the ratio from the CSS and marks tokens below their threshold', () => {
    const rows = buildRows(CSS);
    const input = rows.find((r) => r.name === 'input');
    expect(input?.lightRatio).toBeLessThan(3);
    expect(input?.passes).toBe(false);
    const fg = rows.find((r) => r.name === 'primary-foreground');
    expect(fg?.lightOn).toBe('#5a1a2c');
    expect(fg?.darkRatio).not.toBeNull();
  });
});
