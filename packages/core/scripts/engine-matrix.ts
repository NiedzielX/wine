/**
 * Engine calibration review (lesson 2026-10-14-engine-calibration-matrix):
 * prints the top wines for every demo dish. Run after any change to the engine rules:
 *   npm run engine:matrix            (top 5)
 *   npm run engine:matrix -- 8       (top 8)
 */
import { DISHES, WINES } from '../src/demo/halka';
import { pairingScore } from '../src/engine/scoring';

const top = Number(process.argv[2] ?? 5) || 5;
for (const d of DISHES) {
  const ranked = WINES.filter((w) => w.active)
    .map((w) => ({ w: `${w.producer} ${w.name}`, s: pairingScore(d, w).score }))
    .sort((a, b) => b.s - a.s || a.w.localeCompare(b.w))
    .slice(0, top);
  console.log(d.name.padEnd(28), ranked.map((x) => `${x.w}: ${x.s}`).join(' | '));
}
