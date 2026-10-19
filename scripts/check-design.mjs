#!/usr/bin/env node
/**
 * Design guard for the guest app (docs/DESIGN_SYSTEM.md, lesson 06). Fails the build when:
 *  - a text colour token in guest.css is below WCAG AA (4.5:1) on the paper or surface background;
 *  - the guest screens use more distinct raw colours, text sizes or radii than the baseline.
 * The baselines are a ratchet: they only go down. When a value is removed, lower its baseline here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const guestDir = join(root, 'packages/app/src/app/(guest)');
const css = readFileSync(join(guestDir, 'guest.css'), 'utf8');

/** baselines measured on 2026-10-19; lower them when the screens get simpler */
const BASELINE = { hex: 8, textSizes: 24, radii: 9 };

const failures = [];

// 1. contrast of text tokens (guest.css @theme)
const tokens = Object.fromEntries([...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const contrast = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const TEXT_TOKENS = ['ink', 'ink-2', 'ink-3', 'wine', 'brass', 'sage'];
for (const name of TEXT_TOKENS) {
  for (const bg of ['paper', 'surface']) {
    const ratio = contrast(tokens[name], tokens[bg]);
    if (ratio < 4.5) failures.push(`contrast: --color-${name} on ${bg} is ${ratio.toFixed(2)}:1 (need 4.5:1)`);
  }
}

// 2. raw values in guest screens (everything under (guest) except the theme file)
const sources = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(entry)) sources.push(readFileSync(p, 'utf8'));
  }
};
walk(guestDir);
const all = sources.join('\n');
const distinct = (re) => new Set([...all.matchAll(re)].map((m) => m[0])).size;
const measured = {
  hex: distinct(/#[0-9a-fA-F]{6}\b/g),
  textSizes: distinct(/text-\[[0-9.]+px\]|text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g),
  radii: distinct(/rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl))?(?:-\[[0-9.]+px\])?(?=[\s"'`}])/g)
};
for (const key of Object.keys(BASELINE)) {
  if (measured[key] > BASELINE[key]) failures.push(`${key}: ${measured[key]} distinct values, baseline ${BASELINE[key]} (use a token or a role)`);
}

if (failures.length) {
  console.error('check-design failed:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(`check-design ok: contrast of ${TEXT_TOKENS.length} text tokens ≥ 4.5:1; hex ${measured.hex}/${BASELINE.hex}, text sizes ${measured.textSizes}/${BASELINE.textSizes}, radii ${measured.radii}/${BASELINE.radii}`);
