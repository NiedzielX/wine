/**
 * Mock analytics for the dashboard (last 28 days, Halka). In production these come from
 * GuestInteraction events (usage) and the optional sales CSV (attach rate, revenue).
 */

export const PERIOD = { label: 'Last 28 days', from: '2026-09-16', to: '2026-10-13' };

export const KPIS = {
  attachRate: { value: 0.46, baseline: 0.34 },
  winePerGuest: { value: 118, prev: 99 },
  avgBottle: { value: 312, prev: 286 },
  avgGlass: { value: 54, prev: 51 },
  sessions: { value: 1284, prev: 1102 },
  recommendationViews: { value: 3410, prev: 2875 },
  conversion: { value: 0.38, prev: 0.33 },
  winePerTable: { value: 296, prev: 251 }
};

/** Daily Wine Match sessions vs. wine selections. */
export const DAILY: Array<{ d: string; sessions: number; selections: number }> = [
  31, 28, 36, 52, 61, 58, 29, 33, 30, 38, 55, 66, 60, 27, 34, 35, 41, 57, 63, 59, 31, 36, 33, 44, 59, 70, 64, 30
].map((s, i) => {
  const date = new Date(Date.UTC(2026, 8, 16 + i));
  return { d: date.toISOString().slice(5, 10), sessions: s, selections: Math.round(s * (0.33 + ((i * 7) % 10) / 100)) };
});

export const TOP_DISHES = [
  { dishId: 'd_duck', lookups: 412 },
  { dishId: 'd_ribeye', lookups: 368 },
  { dishId: 'd_tartare', lookups: 341 },
  { dishId: 'd_risotto', lookups: 287 },
  { dishId: 'd_pikeperch', lookups: 233 },
  { dishId: 'd_venison', lookups: 198 }
];

export const TOP_RECOMMENDED = [
  { wineId: 'w_savigny', shown: 1180 },
  { wineId: 'w_lapierre', shown: 1032 },
  { wineId: 'w_graillot', shown: 954 },
  { wineId: 'w_gimonnet', shown: 811 },
  { wineId: 'w_leflaive', shown: 702 },
  { wineId: 'w_kumeu', shown: 655 }
];

export const TOP_SELECTED = [
  { wineId: 'w_lapierre', selected: 214 },
  { wineId: 'w_savigny', selected: 188 },
  { wineId: 'w_graillot', selected: 171 },
  { wineId: 'w_gimonnet', selected: 96 },
  { wineId: 'w_turnau', selected: 91 },
  { wineId: 'w_batailley', selected: 64 }
];

export const PAIRING_PERFORMANCE = [
  { dishId: 'd_duck', wineId: 'w_savigny', shown: 398, selected: 151, source: 'sommelier' },
  { dishId: 'd_tartare', wineId: 'w_lapierre', shown: 330, selected: 129, source: 'sommelier' },
  { dishId: 'd_ribeye', wineId: 'w_graillot', shown: 301, selected: 104, source: 'sommelier' },
  { dishId: 'd_risotto', wineId: 'w_kumeu', shown: 270, selected: 77, source: 'sommelier' },
  { dishId: 'd_herring', wineId: 'w_turnau', shown: 160, selected: 58, source: 'sommelier' },
  { dishId: 'd_pierogi', wineId: 'w_savigny', shown: 142, selected: 39, source: 'engine' },
  { dishId: 'd_scallops', wineId: 'w_gimonnet', shown: 128, selected: 31, source: 'engine' },
  { dishId: 'd_venison', wineId: 'w_produttori', shown: 96, selected: 12, source: 'engine' }
];
