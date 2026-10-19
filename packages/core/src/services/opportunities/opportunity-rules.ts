import { OPPORTUNITY_RULES, type Dish, type OpportunityRule, type Pairing, type Wine } from '../../domain/types';
import { MIN_MODEL_SCORE } from '../../engine/recommend';
import type { PairingStat } from '../../ports/repositories';
import { MIN_RATE_SAMPLE } from '../analytics/compare-metric';
import { isReviewed } from '../pairings/pairing-rules';

/**
 * The sommelier's opportunities (spec 2026-10-16-sommelier-opportunities, D17): deterministic signals computed on read
 * from one restaurant's menu, wine list, pairings and match scores. "Look here", never "I know better": an
 * opportunity changes nothing by itself — the sommelier adds a suggestion, ignores it, or does nothing.
 *
 * Pure functions: no clock, no randomness, no I/O. The match scores come in as a matrix computed once by the caller
 * (`OpportunityService`), so the rules never call the engine themselves. Not engine rules: they never change a score or
 * the order of a recommendation (R02).
 *
 * S1–S3 come from the menu and the scores (phase 1), S4 (`shown_rarely_chosen`, guests' choices) from E04's
 * `pairingStats` (phase 3), S5 (`ordered_not_reviewed`, orders with a recommendation code) from E09 (phase 4).
 */

/** A wine that is "one of the 2–3 best for the dish" (Halka, `npm run engine:matrix`); recalibrate when ENGINE_VERSION changes. */
export const STRONG_MATCH = 85;
/** An ignored opportunity comes back after this many days at the earliest. */
export const DISMISS_DAYS = 30;
/** S5: orders with a recommendation code in the window — more than once a week, more than one table of regulars. */
export const MIN_ORDERS = 5;
/** The window of S4/S5: the last 28 full days (S4: E04's KPI window in Warsaw; S5: service days, `lastFullServiceDays`). */
export const WINDOW_DAYS = 28;
/** S4: the primary pairing was shown at least this often — E04's small-sample threshold (`MIN_RATE_SAMPLE`). */
export const MIN_SHOWN = MIN_RATE_SAMPLE;
/** S4: guests chose the dish's other wines at least this often; without that there is nothing to compare with. */
export const MIN_OTHER_CHOSEN = 5;
/** S4: the primary is chosen at most this fraction of the other wines' rate — at least twice as rarely. */
export const LOW_RATE_FACTOR = 0.5;

export type S1Reason = 'none' | 'no_primary' | 'primary_hidden';
export type OpportunityAction = 'add_suggestion' | 'open_dish' | 'approve';

/** The numbers behind the sentence; the app builds the sentence from its dictionary (R2). */
export type OpportunityEvidence =
  | { rule: 'dish_no_primary'; reason: S1Reason }
  | { rule: 'glass_match_unpaired'; score: number; glassPrice: number }
  | { rule: 'wine_unpaired'; score: number }
  | { rule: 'shown_rarely_chosen'; shown: number; chosen: number; otherShown: number; otherChosen: number }
  | { rule: 'ordered_not_reviewed'; orders: number };

export interface Opportunity {
  key: string;
  rule: OpportunityRule;
  /** the dish the opportunity is about (S3: the dish the wine matches best) */
  dishId: string;
  /** the wine to add (S2, S3), the hidden primary wine (S1 `primary_hidden`, evidence only), otherwise null */
  wineId: string | null;
  action: OpportunityAction;
  /** S5 "Approve": the suggested pairing and the version the sommelier saw (`expectedVersion`); S4: the primary pairing (A6 anchor) */
  pairingId?: string;
  pairingVersion?: number;
  evidence: OpportunityEvidence;
}

/** Match scores of (dish, wine), keyed by `scoreKey`. Pairs without an entry are never proposed. */
export type ScoreMatrix = ReadonlyMap<string, number>;
export const scoreKey = (dishId: string, wineId: string) => `${dishId}:${wineId}`;

/** Orders with a recommendation code for one (dish, wine) in the window: E09 `pairStats`, rows of context `dish` only. */
export interface OrderedPair {
  dishId: string;
  wineId: string;
  /** E09 `ordered` (staff-confirmed, later also POS-matched) */
  orders: number;
}

export interface OpportunityInput {
  dishes: Dish[];
  wines: Wine[];
  pairings: Pairing[];
  scores: ScoreMatrix;
  /** keys ignored and not yet expired */
  dismissedKeys?: ReadonlySet<string>;
  /** S5; absent (scope `dish`, or the read failed) means no S5 */
  orders?: OrderedPair[];
  /** S4: E04 `pairingStats` of the window; absent (scope `dish`, or the read failed) means no S4 */
  pairingStats?: PairingStat[];
}

export type OpportunitySubject =
  | { rule: 'dish_no_primary'; dishId: string; reason: S1Reason }
  | { rule: 'glass_match_unpaired'; dishId: string }
  | { rule: 'wine_unpaired'; wineId: string }
  | { rule: 'shown_rarely_chosen' | 'ordered_not_reviewed'; dishId: string; wineId: string };

/**
 * The key names the opportunity's subject, not one proposal: ignoring S2 for a dish does not reveal the next wine,
 * and a new S1 reason is a new opportunity. Format checked by `opportunityKeySchema`.
 */
export function opportunityKey(s: OpportunitySubject): string {
  switch (s.rule) {
    case 'dish_no_primary': return `${s.rule}:${s.dishId}:${s.reason}`;
    case 'glass_match_unpaired': return `${s.rule}:${s.dishId}`;
    case 'wine_unpaired': return `${s.rule}:${s.wineId}`;
    default: return `${s.rule}:${s.dishId}:${s.wineId}`;
  }
}

/** Code-point order: the same everywhere, unlike `localeCompare` without a locale. */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const RULE_ORDER = new Map<OpportunityRule, number>(OPPORTUNITY_RULES.map((r, i) => [r, i]));
const CATEGORY_ORDER = new Map<string, number>([['Starters', 0], ['Mains', 1], ['Desserts', 2]]);
const pairKey = (dishId: string, wineId: string) => `${dishId}:${wineId}`;

/**
 * Every opportunity whose condition holds, before ignored keys are filtered out: one per key (S1 and S2 per dish,
 * S3 per wine). `dismiss` accepts only these keys (R6). The order is not meaningful; `findOpportunities` sorts.
 */
export function opportunityCandidates(input: OpportunityInput): Opportunity[] {
  const published = input.dishes.filter((d) => d.status === 'published');
  const active = input.wines.filter((w) => w.active);
  const wineById = new Map(input.wines.map((w) => [w.id, w]));
  const publishedIds = new Set(published.map((d) => d.id));
  const byDish = new Map<string, Pairing[]>();
  for (const p of input.pairings) byDish.set(p.dishId, [...(byDish.get(p.dishId) ?? []), p]);
  // "no decision" = no pairing of the dish and wine in any status, so a rejected pairing blocks S2/S3 for good (R4)
  const decided = new Set(input.pairings.map((p) => pairKey(p.dishId, p.wineId)));
  const score = (dishId: string, wineId: string) => input.scores.get(scoreKey(dishId, wineId));
  const out: Opportunity[] = [];

  for (const dish of published) {
    const pairings = byDish.get(dish.id) ?? [];
    const reviewed = pairings.filter(isReviewed).sort((a, b) => byId(a.id, b.id));

    // S1 dish_no_primary — silent while the dish has suggestions: the review queue (A7) leads it then
    if (!pairings.some((p) => p.status === 'suggested')) {
      const primary = reviewed.find((p) => p.role === 'primary');
      const primaryWine = primary ? wineById.get(primary.wineId) : undefined;
      if (!primaryWine?.active) {
        const reason: S1Reason = primaryWine ? 'primary_hidden' : reviewed.length === 0 ? 'none' : 'no_primary';
        out.push({
          key: opportunityKey({ rule: 'dish_no_primary', dishId: dish.id, reason }), rule: 'dish_no_primary', dishId: dish.id,
          wineId: reason === 'primary_hidden' ? primaryWine!.id : null, action: 'open_dish', evidence: { rule: 'dish_no_primary', reason }
        });
      }
    }

    // S2 glass_match_unpaired — none of the dish's approved pairings is a wine guests can order by the glass
    const glassPaired = reviewed.some((p) => { const w = wineById.get(p.wineId); return !!w && w.active && w.glassPrice !== null; });
    if (!glassPaired) {
      let best: { wine: Wine; score: number } | null = null;
      for (const wine of active) {
        if (wine.glassPrice === null || decided.has(pairKey(dish.id, wine.id))) continue;
        const s = score(dish.id, wine.id);
        if (s === undefined || s < STRONG_MATCH) continue;
        if (!best || s > best.score || (s === best.score && byId(wine.id, best.wine.id) < 0)) best = { wine, score: s };
      }
      if (best) {
        out.push({
          key: opportunityKey({ rule: 'glass_match_unpaired', dishId: dish.id }), rule: 'glass_match_unpaired', dishId: dish.id, wineId: best.wine.id,
          action: 'add_suggestion', evidence: { rule: 'glass_match_unpaired', score: best.score, glassPrice: best.wine.glassPrice! }
        });
      }
    }
  }

  // S5 ordered_not_reviewed — guests order the wine with a code for the dish, and the sommelier has not approved the pair
  const activeIds = new Set(active.map((w) => w.id));
  const orders = new Map<string, OrderedPair>();
  for (const o of input.orders ?? []) {
    const k = pairKey(o.dishId, o.wineId);
    const prev = orders.get(k);
    orders.set(k, { dishId: o.dishId, wineId: o.wineId, orders: (prev?.orders ?? 0) + o.orders });
  }
  const pairingOf = new Map(input.pairings.map((p) => [pairKey(p.dishId, p.wineId), p]));
  for (const o of orders.values()) {
    if (o.orders < MIN_ORDERS || !publishedIds.has(o.dishId) || !activeIds.has(o.wineId)) continue;
    const existing = pairingOf.get(pairKey(o.dishId, o.wineId));
    // an approved pair is done; a rejected one is the sommelier's decision and never comes back as a proposal (R4)
    if (existing && existing.status !== 'suggested') continue;
    const s = score(o.dishId, o.wineId);
    // without a pairing: "Add to suggestions" only where the command accepts it (MIN_MODEL_SCORE), otherwise the dish's page
    const action: OpportunityAction = existing ? 'approve' : s !== undefined && s >= MIN_MODEL_SCORE ? 'add_suggestion' : 'open_dish';
    out.push({
      key: opportunityKey({ rule: 'ordered_not_reviewed', dishId: o.dishId, wineId: o.wineId }), rule: 'ordered_not_reviewed',
      dishId: o.dishId, wineId: o.wineId, action,
      ...(existing ? { pairingId: existing.id, pairingVersion: existing.version } : {}),
      evidence: { rule: 'ordered_not_reviewed', orders: o.orders }
    });
  }

  // S4 shown_rarely_chosen — the approved primary pairing, shown often under the sommelier's label, chosen rarely compared
  // with the dish's other wines. Primary only: lower slots lose to the rest by position, which pairingStats cannot correct.
  const stats = input.pairingStats;
  if (stats) {
    for (const p of input.pairings) {
      if (!isReviewed(p) || p.role !== 'primary' || !publishedIds.has(p.dishId) || !activeIds.has(p.wineId)) continue;
      let shown = 0, chosen = 0, otherShown = 0, otherChosen = 0;
      for (const s of stats) {
        if (s.dishId !== p.dishId) continue;
        if (s.wineId === p.wineId) {
          // the pair's own figures come from the sommelier's rows; an engine row of the same wine (before it was approved)
          // is neither the primary's nor "another wine", so it counts nowhere
          if (s.source === 'sommelier') { shown += s.shown; chosen += s.chosen; }
        } else {
          otherShown += s.shown;
          otherChosen += s.chosen;
        }
      }
      if (shown < MIN_SHOWN || otherChosen < MIN_OTHER_CHOSEN) continue;
      // chosen / shown ≤ LOW_RATE_FACTOR × otherChosen / otherShown, without dividing (otherShown ≥ otherChosen ≥ 5)
      if (chosen * otherShown > LOW_RATE_FACTOR * otherChosen * shown) continue;
      out.push({
        key: opportunityKey({ rule: 'shown_rarely_chosen', dishId: p.dishId, wineId: p.wineId }), rule: 'shown_rarely_chosen',
        dishId: p.dishId, wineId: p.wineId, action: 'open_dish', pairingId: p.id,
        evidence: { rule: 'shown_rarely_chosen', shown, chosen, otherShown, otherChosen }
      });
    }
  }

  // S3 wine_unpaired — an active wine with no approved pairing with any published dish, strong with its best undecided dish
  const pairedWines = new Set(input.pairings.filter((p) => isReviewed(p) && publishedIds.has(p.dishId)).map((p) => p.wineId));
  for (const wine of active) {
    if (pairedWines.has(wine.id)) continue;
    let best: { dish: Dish; score: number } | null = null;
    for (const dish of published) {
      if (decided.has(pairKey(dish.id, wine.id))) continue;
      const s = score(dish.id, wine.id);
      if (s === undefined) continue;
      if (!best || s > best.score || (s === best.score && byId(dish.id, best.dish.id) < 0)) best = { dish, score: s };
    }
    if (best && best.score >= STRONG_MATCH) {
      out.push({
        key: opportunityKey({ rule: 'wine_unpaired', wineId: wine.id }), rule: 'wine_unpaired', dishId: best.dish.id, wineId: wine.id,
        action: 'add_suggestion', evidence: { rule: 'wine_unpaired', score: best.score }
      });
    }
  }
  return out;
}

/**
 * The opportunities to show: candidates → without ignored keys → one per (dish, wine), the earlier rule winning in the
 * order S1, S5, S2, S3, S4 → sorted. Sorting: dish category (Starters, Mains, Desserts), dish name (Polish collation),
 * dish id; within a dish: rule in the order above, then wine id. The same input in any array order gives the same list.
 */
export function findOpportunities(input: OpportunityInput): Opportunity[] {
  const dismissed = input.dismissedKeys ?? new Set<string>();
  const ruleRank = (o: Opportunity) => RULE_ORDER.get(o.rule) ?? RULE_ORDER.size;
  const open = opportunityCandidates(input)
    .filter((o) => !dismissed.has(o.key))
    .sort((a, b) => ruleRank(a) - ruleRank(b) || byId(a.key, b.key));
  const seen = new Set<string>();
  const kept: Opportunity[] = [];
  for (const o of open) {
    if (o.wineId !== null) {
      const pair = pairKey(o.dishId, o.wineId);
      if (seen.has(pair)) continue;
      seen.add(pair);
    }
    kept.push(o);
  }
  const dishById = new Map(input.dishes.map((d) => [d.id, d]));
  const category = (id: string) => CATEGORY_ORDER.get(dishById.get(id)?.category ?? '') ?? CATEGORY_ORDER.size;
  const name = (id: string) => dishById.get(id)?.name ?? '';
  return kept.sort((a, b) =>
    category(a.dishId) - category(b.dishId)
    || name(a.dishId).localeCompare(name(b.dishId), 'pl')
    || byId(a.dishId, b.dishId)
    || ruleRank(a) - ruleRank(b)
    || byId(a.wineId ?? '', b.wineId ?? ''));
}
