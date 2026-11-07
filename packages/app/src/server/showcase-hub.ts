import type { Dish, Locale } from '@wine-match/core';
import { inMenuOrder } from './guest-page';

/**
 * The steps of the demo guide (DM0, R6). A new step is ONE entry in `hubSteps` (spec 2026-11-04-sales-demo-and-roi-calculator,
 * "Fazy": F3 and F4 add steps this way). A step without a `href` is shown as "coming", never as a link to a page that does not exist.
 */
export type HubStepId = 'guest' | 'table' | 'waiter' | 'panel' | 'kpi';

export interface HubStep {
  id: HubStepId;
  /** the address of the page, or null while the page does not exist in this version of the demo */
  href: string | null;
}

/**
 * The dish that shows the sommelier's seal: the first dish in menu order with an approved or modified pairing and a chosen
 * primary (`pairingCoverage`). Without one the guide falls back to the dish list, so the link never points at a dish with an empty page.
 */
export function pickShowcaseDish(dishes: Pick<Dish, 'id' | 'category'>[], coverage: Map<string, { approved: number; hasPrimary: boolean }>): string | null {
  return inMenuOrder(dishes).find((d) => (coverage.get(d.id)?.approved ?? 0) > 0 && coverage.get(d.id)?.hasPrimary)?.id ?? null;
}

/** Links carry `lang` and nothing else: no `sid` (a guide visit is not a guest session) and no preferences. F3 turns `panelReady` and `kpiReady` on. */
export function hubSteps({ slug, dishId, locale, panelReady = false, kpiReady = false }: { slug: string; dishId: string | null; locale: Locale; panelReady?: boolean; kpiReady?: boolean }): HubStep[] {
  const q = `?lang=${locale}`;
  return [
    { id: 'guest', href: dishId ? `/r/${slug}/dish/${dishId}/wines${q}` : `/r/${slug}/menu${q}` },
    { id: 'table', href: `/r/${slug}/table${q}` },
    { id: 'waiter', href: `/r/${slug}/staff/table${q}` },
    { id: 'panel', href: panelReady ? `/demo/panel${q}` : null },
    { id: 'kpi', href: kpiReady ? `/demo/kpi${q}` : null }
  ];
}
