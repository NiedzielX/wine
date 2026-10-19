/*
 * WCAG 2.x contrast of the dashboard tokens (src/styles.css). Used by the Foundations story and by tests, so the
 * table and the check read the same numbers. Plain functions, no framework.
 */

export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

export type Theme = Record<string, string>;
export type Kind = 'text' | 'ui' | 'surface' | 'decoration';
export interface Role {
  kind: Kind;
  /** token name the contrast is measured against; `background` for page-level tokens */
  against: string;
  /** minimum ratio, undefined when the token has no contrast requirement */
  min?: number;
}

const SURFACES = ['background', 'card', 'popover', 'secondary', 'muted', 'accent', 'sidebar', 'brass-soft', 'sage-soft'];

/** Hex colours declared in one selector block, e.g. `:root` or `.dark`. Non-colour values (radius, var()) are skipped. */
export function tokensOf(source: string, selector: string): Theme {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const tokens: Theme = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * What a token is for, read from its name: `*-foreground` is text on its base surface; `input` and `ring` are UI
 * boundaries (1.4.11); `border` is decoration; surfaces have no requirement; other colours are text or fills
 * next to the page background (4.5:1).
 */
export function roleOf(name: string, theme: Theme): Role {
  if (name === 'input' || name === 'ring') return { kind: 'ui', against: 'background', min: UI_MIN };
  if (name === 'border' || name === 'sidebar-border') return { kind: 'decoration', against: 'background' };
  if (name.endsWith('-foreground')) {
    const base = name.slice(0, -'-foreground'.length);
    return theme[base] ? { kind: 'text', against: base, min: TEXT_MIN } : { kind: 'text', against: 'background', min: TEXT_MIN };
  }
  if (SURFACES.includes(name)) return { kind: 'surface', against: 'background' };
  return { kind: 'text', against: 'background', min: TEXT_MIN };
}

export interface TokenRow {
  name: string;
  role: Role;
  light: string;
  lightOn: string;
  lightRatio: number;
  dark: string | null;
  darkOn: string;
  darkRatio: number | null;
  /** true when every theme passes, false when one fails, null when the token has no requirement */
  passes: boolean | null;
}

/** One row per colour token of `:root`, with its contrast in the light and in the dark theme. */
export function buildRows(source: string): TokenRow[] {
  const light = tokensOf(source, ':root');
  const dark = tokensOf(source, '.dark');
  return Object.keys(light).map((name) => {
    const role = roleOf(name, light);
    const lightOn = light[role.against] ?? light.background;
    const darkOn = dark[role.against] ?? dark.background;
    const lightRatio = contrast(light[name], lightOn);
    const darkValue = dark[name] ?? null;
    const darkRatio = darkValue ? contrast(darkValue, darkOn) : null;
    const passes =
      role.min === undefined ? null : lightRatio >= role.min && (darkRatio === null || darkRatio >= role.min);
    return { name, role, light: light[name], lightOn, lightRatio, dark: darkValue, darkOn, darkRatio, passes };
  });
}
