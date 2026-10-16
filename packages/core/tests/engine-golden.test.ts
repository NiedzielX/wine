import { describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import type { GuestPreferences, Pairing, WineStyle } from '../src/domain/types';
import { DEFAULT_PREFS } from '../src/domain/types';
import { recommendForDish, type RecommendationResult } from '../src/engine/recommend';
import { pairingScore } from '../src/engine/scoring';
import { recommendForTable, type TableResult } from '../src/engine/table';

/**
 * Golden test of the ranking layer (spec 2026-10-16-how-it-works-explanations, R8 / AC7).
 *
 * `npm run engine:matrix` covers only `pairingScore`; this test pins everything built on top of it —
 * hard filters, preference adjustments, sommelier tiers, the best-value window, the budget fallback,
 * the table weights, the sommelier bonus, the rejected cap and the split suggestion — for every demo dish,
 * every pair and every trio of demo dishes, under a fixed set of guest preferences.
 *
 * The snapshots were written on `main` before the engine constants were named. They must not change
 * unless a spec changes the engine results (and then `ENGINE_VERSION` goes up, BACKWARD_COMPATIBILITY.md §7).
 * Update deliberately: `npx vitest run tests/engine-golden.test.ts -u` in packages/core, and review the diff.
 */

const STYLES: WineStyle[] = ['sparkling', 'white', 'rose', 'orange', 'red', 'sweet'];

const PREFS: Array<[string, GuestPreferences]> = [
  ['default', DEFAULT_PREFS],
  ['glass', { ...DEFAULT_PREFS, serving: 'glass' }],
  ['bottle', { ...DEFAULT_PREFS, serving: 'bottle' }],
  ...STYLES.map((s): [string, GuestPreferences] => [`style=${s}`, { ...DEFAULT_PREFS, styles: [s] }]),
  ['max=0', { ...DEFAULT_PREFS, maxPrice: 0 }],
  ['max=60', { ...DEFAULT_PREFS, maxPrice: 60 }],
  ['max=200', { ...DEFAULT_PREFS, maxPrice: 200 }],
  ['glass+max=60', { ...DEFAULT_PREFS, serving: 'glass', maxPrice: 60 }],
  ['lighter', { ...DEFAULT_PREFS, weight: 'lighter' }],
  ['fuller', { ...DEFAULT_PREFS, weight: 'fuller' }],
  ['classic', { ...DEFAULT_PREFS, mood: 'classic' }],
  ['adventurous', { ...DEFAULT_PREFS, mood: 'adventurous' }]
];

const { dishes, wines, pairings } = buildDemoDataset({ ids: 'raw' });

function dishLine(r: RecommendationResult): string {
  const items = r.items.map((i) =>
    [i.wine.id, i.matchScore, i.rankScore, `t${i.tier}`, i.bestValue ? 'bv' : '', `${i.displayPrice}${i.displayServing[0]}`, i.servings.map((s) => s[0]).join(''), i.sommelier?.role ?? '']
      .filter((x) => x !== '').join(' ')
  );
  return `${items.join(' ; ')} | out=${r.filteredOut}${r.notice ? ` | notice=${r.notice}` : ''}`;
}

function tableLine(r: TableResult): string {
  const items = r.items.map((i) => `${i.wine.id} ${i.overall} [${i.perDish.map((d) => `${d.score}${d.sommelierPick ? '*' : ''}`).join(',')}] ${i.price}${i.serving[0]}`);
  const aside = r.setAside.map((d) => d.id).join(',');
  const split = r.split.map((s) => `${s.dish.id}>${s.wine.id} ${s.score}`).join(',');
  return `${items.join(' ; ')}${aside ? ` | aside=${aside}` : ''}${r.splitSuggested ? ` | split=${split}` : ''}`;
}

/** FNV-1a (64-bit, BigInt, over UTF-16 code units): a stable digest that keeps the trio snapshot small without node:crypto. */
function digest(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return h.toString(16).padStart(16, '0');
}

function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}

describe('engine golden results (snapshot from main before the ENGINE_FACTS refactor)', () => {
  it('recommendForDish: every demo dish × preference set', async () => {
    const lines: string[] = [];
    for (const dish of dishes) for (const [label, prefs] of PREFS) {
      lines.push(`${dish.id} | ${label} | ${dishLine(recommendForDish(dish, wines, pairings, prefs))}`);
    }
    // the Polish texts go through the same ranking; pin them once per dish
    for (const dish of dishes) {
      const r = recommendForDish(dish, wines, pairings, { ...DEFAULT_PREFS, maxPrice: 0 }, undefined, 'pl');
      lines.push(`${dish.id} | pl max=0 | ${dishLine(r)} | why=${r.items.map((i) => i.why).join(' / ')}`);
    }
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/engine-golden.dish.txt');
  });

  it('recommendForTable: every pair of demo dishes × preference set', async () => {
    const lines = combinations(dishes, 2).flatMap((combo) => PREFS.map(([label, prefs]) =>
      `${combo.map((d) => d.id).join('+')} | ${label} | ${tableLine(recommendForTable(combo, wines, pairings, prefs))}`));
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/engine-golden.table-pairs.txt');
  });

  // 455 trios × 18 preference sets would be a 1 MB file: one digest per trio over the same lines as the pairs.
  // When a digest changes, print that trio's lines locally (tableLine) to see what moved.
  it('recommendForTable: every trio of demo dishes × preference set', async () => {
    const lines = combinations(dishes, 3).map((combo) => {
      const body = PREFS.map(([label, prefs]) => `${label} | ${tableLine(recommendForTable(combo, wines, pairings, prefs))}`).join('\n');
      return `${combo.map((d) => d.id).join('+')} | ${digest(body)}`;
    });
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/engine-golden.table-trios.txt');
  });

  // The demo has a single rejected pairing, which already scores under the table cap; so that the cap and the
  // exclusion of rejected wines are pinned too, the sommelier here also rejects each dish's three best engine wines.
  it('rejected pairings: every demo dish and every pair of demo dishes', async () => {
    const rejected: Pairing[] = pairings.map((p) => ({ ...p }));
    for (const dish of dishes) {
      const best = [...wines]
        .map((w) => ({ w, s: pairingScore(dish, w).score }))
        .sort((a, b) => b.s - a.s || a.w.id.localeCompare(b.w.id))
        .slice(0, 3);
      for (const { w } of best) {
        const existing = rejected.find((p) => p.dishId === dish.id && p.wineId === w.id);
        if (existing) Object.assign(existing, { status: 'rejected', role: null, rank: null });
        else rejected.push({ ...pairings[0], id: `p_rej_${dish.id}_${w.id}`, dishId: dish.id, wineId: w.id, status: 'rejected', role: null, rank: null, comment: null });
      }
    }
    const lines = [
      ...dishes.map((dish) => `${dish.id} | ${dishLine(recommendForDish(dish, wines, rejected, DEFAULT_PREFS))}`),
      // every bottle, not the top three: a capped wine ranks low, and its capped score is what this pins
      ...combinations(dishes, 2).map((combo) => `${combo.map((d) => d.id).join('+')} | ${tableLine(recommendForTable(combo, wines, rejected, DEFAULT_PREFS, wines.length))}`)
    ];
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/engine-golden.rejected.txt');
  });
});
