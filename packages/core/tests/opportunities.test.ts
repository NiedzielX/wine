import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDataset } from '../src/demo/dataset';
import type { CodeContext, Dish, DishCategory, Pairing, PairingRole, PairingStatus, Wine } from '../src/domain/types';
import { MIN_MODEL_SCORE } from '../src/engine/recommend';
import { NotFoundError, ValidationError } from '../src/errors';
import { createMemoryRepositories, MemoryStore } from '../src/memory/memory-repositories';
import type { GuestInteractionInput, GuestInteractionRepository, PairingStat, RecommendationCodeRepository } from '../src/ports/repositories';
import { MIN_RATE_SAMPLE } from '../src/services/analytics/compare-metric';
import {
  DISMISS_DAYS, LOW_RATE_FACTOR, MIN_ORDERS, MIN_OTHER_CHOSEN, MIN_SHOWN, STRONG_MATCH, WINDOW_DAYS, findOpportunities, opportunityCandidates,
  opportunityKey, scoreKey, type OpportunityInput
} from '../src/services/opportunities/opportunity-rules';
import { OpportunityService, buildScoreMatrix } from '../src/services/opportunities/opportunity-service';
import { SommelierService } from '../src/services/pairings/sommelier-service';
import { seedUsageEvents } from '../src/testing/usage-events';
import { opportunityKeySchema } from '../src/validators/opportunities/opportunity-key.schema';

/* ---------------- pure rules on a small, hand-made menu ---------------- */

const demo = buildDemoDataset();
const dish = (id: string, over: Partial<Dish> = {}): Dish => ({ ...structuredClone(demo.dishes[0]), id, name: id, category: 'Mains', status: 'published', ...over });
const wine = (id: string, over: Partial<Wine> = {}): Wine => ({ ...structuredClone(demo.wines[0]), id, name: id, active: true, glassPrice: 40, ...over });
let pid = 0;
const pairing = (dishId: string, wineId: string, status: PairingStatus, role: PairingRole | null = null): Pairing => ({
  id: `p${String(++pid).padStart(3, '0')}`, dishId, wineId, status, role, rank: null, comment: null, commentTranslations: {}, modelScore: 80,
  source: 'engine', updatedBy: 'Test', updatedAt: '2026-10-16T10:00:00.000Z', dirty: false
});
const scores = (entries: Array<[string, string, number]>) => new Map(entries.map(([d, w, s]) => [scoreKey(d, w), s]));
const input = (over: Partial<OpportunityInput>): OpportunityInput => ({ dishes: [], wines: [], pairings: [], scores: new Map(), ...over });
const keys = (i: OpportunityInput) => findOpportunities(i).map((o) => o.key);

describe('opportunity keys', () => {
  it('name the subject of each rule and match the key schema', () => {
    const all = [
      opportunityKey({ rule: 'dish_no_primary', dishId: 'd1', reason: 'primary_hidden' }),
      opportunityKey({ rule: 'glass_match_unpaired', dishId: 'd1' }),
      opportunityKey({ rule: 'wine_unpaired', wineId: 'w1' }),
      opportunityKey({ rule: 'shown_rarely_chosen', dishId: 'd1', wineId: 'w1' }),
      opportunityKey({ rule: 'ordered_not_reviewed', dishId: '0a1b2c3d-0000-4000-8000-000000000001', wineId: 'w_1' })
    ];
    expect(all.slice(0, 3)).toEqual(['dish_no_primary:d1:primary_hidden', 'glass_match_unpaired:d1', 'wine_unpaired:w1']);
    for (const key of all) expect(opportunityKeySchema.safeParse({ key }).success).toBe(true);
    for (const key of ['dish_no_primary:d1', 'dish_no_primary:d1:other', 'glass_match_unpaired:d1:w1', 'wine_unpaired:', 'nope:d1', 'wine_unpaired:a b', `wine_unpaired:${'x'.repeat(65)}`, 'wine_unpaired:__proto__ ']) {
      expect(opportunityKeySchema.safeParse({ key }).success).toBe(false);
    }
    expect(opportunityKeySchema.safeParse({ key: 'wine_unpaired:w1', extra: 1 }).success).toBe(false);
  });
});

describe('S1 dish_no_primary', () => {
  const d = dish('d1');
  const w = wine('w1');
  const hidden = wine('w_hidden', { active: false });

  it('fires for a published dish without pairings (none)', () => {
    const [o] = findOpportunities(input({ dishes: [d], wines: [w] }));
    expect(o).toMatchObject({ key: 'dish_no_primary:d1:none', rule: 'dish_no_primary', dishId: 'd1', wineId: null, action: 'open_dish', evidence: { reason: 'none' } });
  });

  it('fires when the dish has approved pairings but none is the primary (no_primary)', () => {
    expect(keys(input({ dishes: [d], wines: [w], pairings: [pairing('d1', 'w1', 'approved', 'alternative')] }))).toEqual(['dish_no_primary:d1:no_primary']);
  });

  it('fires when the primary wine is hidden (primary_hidden) and names the wine, without proposing it', () => {
    const list = findOpportunities(input({ dishes: [d], wines: [hidden], pairings: [pairing('d1', 'w_hidden', 'modified', 'primary')], scores: scores([['d1', 'w_hidden', 95]]) }));
    expect(list).toEqual([expect.objectContaining({ key: 'dish_no_primary:d1:primary_hidden', wineId: 'w_hidden', action: 'open_dish' })]);
  });

  it('is silent while the dish has suggestions (the review queue leads it)', () => {
    expect(keys(input({ dishes: [d], wines: [w], pairings: [pairing('d1', 'w1', 'suggested')] }))).toEqual([]);
    expect(keys(input({ dishes: [d], wines: [hidden, w], pairings: [pairing('d1', 'w_hidden', 'approved', 'primary'), pairing('d1', 'w1', 'suggested')] }))).toEqual([]);
  });

  it('is silent when the primary wine is active, and for dishes guests do not see', () => {
    expect(keys(input({ dishes: [d], wines: [w], pairings: [pairing('d1', 'w1', 'approved', 'primary')] }))).toEqual([]);
    expect(keys(input({ dishes: [dish('d2', { status: 'draft' }), dish('d3', { status: 'hidden' })], wines: [w] }))).toEqual([]);
  });

  it('a rejected pairing is not a decision for the primary', () => {
    expect(keys(input({ dishes: [d], wines: [w], pairings: [pairing('d1', 'w1', 'rejected')] }))).toEqual(['dish_no_primary:d1:none']);
  });

  it('another reason is another opportunity: ignoring "none" does not hide "primary_hidden"', () => {
    const dismissedKeys = new Set(['dish_no_primary:d1:none']);
    expect(keys(input({ dishes: [d], wines: [w], dismissedKeys }))).toEqual([]);
    expect(keys(input({ dishes: [d], wines: [hidden], pairings: [pairing('d1', 'w_hidden', 'approved', 'primary')], dismissedKeys }))).toEqual(['dish_no_primary:d1:primary_hidden']);
  });
});

describe('S2 glass_match_unpaired', () => {
  // d1 has an approved primary by the bottle (w_bottle), so S1 is silent and only S2/S3 matter
  const d = dish('d1');
  const bottle = wine('w_bottle', { glassPrice: null });
  const glass = wine('w_glass', { glassPrice: 46 });
  const base = (over: Partial<OpportunityInput> = {}) => input({
    dishes: [d], wines: [bottle, glass], pairings: [pairing('d1', 'w_bottle', 'approved', 'primary')],
    scores: scores([['d1', 'w_bottle', 90], ['d1', 'w_glass', STRONG_MATCH]]), ...over
  });
  const s2 = (i: OpportunityInput) => findOpportunities(i).filter((o) => o.rule === 'glass_match_unpaired');

  it('fires for a strong by-the-glass wine without a decision when no approved pairing is by the glass', () => {
    expect(s2(base())).toEqual([{
      key: 'glass_match_unpaired:d1', rule: 'glass_match_unpaired', dishId: 'd1', wineId: 'w_glass', action: 'add_suggestion',
      evidence: { rule: 'glass_match_unpaired', score: 85, glassPrice: 46 }
    }]);
  });

  it('needs a score of at least STRONG_MATCH: 84 does not fire, 85 does', () => {
    expect(s2(base({ scores: scores([['d1', 'w_glass', 84]]) }))).toEqual([]);
    expect(s2(base({ scores: scores([['d1', 'w_glass', 85]]) }))).toHaveLength(1);
  });

  it('is silent when an approved pairing of the dish is an active wine by the glass', () => {
    const other = wine('w_other', { glassPrice: 30 });
    expect(s2(base({ wines: [bottle, glass, other], pairings: [pairing('d1', 'w_bottle', 'approved', 'primary'), pairing('d1', 'w_other', 'approved', 'alternative')] }))).toEqual([]);
    // the same pairing with a hidden wine does not count: guests cannot order it
    expect(s2(base({ wines: [bottle, glass, { ...other, active: false }], pairings: [pairing('d1', 'w_bottle', 'approved', 'primary'), pairing('d1', 'w_other', 'approved', 'alternative')] }))).toHaveLength(1);
  });

  it('never proposes a bottle-only wine, a hidden wine, or a wine with any decision for the dish (a rejection blocks it for good)', () => {
    expect(s2(base({ wines: [bottle, { ...glass, glassPrice: null }] }))).toEqual([]);
    expect(s2(base({ wines: [bottle, { ...glass, active: false }] }))).toEqual([]);
    for (const status of ['suggested', 'rejected'] as const) {
      expect(s2(base({ pairings: [pairing('d1', 'w_bottle', 'approved', 'primary'), pairing('d1', 'w_glass', status)] }))).toEqual([]);
    }
  });

  it('is silent for a dish guests do not see', () => {
    expect(s2(base({ dishes: [{ ...d, status: 'draft' }] }))).toEqual([]);
  });

  it('proposes one wine per dish: the best score, ties broken by wine id', () => {
    const a = wine('w_a'); const b = wine('w_b'); const c = wine('w_c');
    const i = base({ wines: [bottle, c, b, a], scores: scores([['d1', 'w_c', 92], ['d1', 'w_b', 92], ['d1', 'w_a', 88]]) });
    expect(s2(i).map((o) => o.wineId)).toEqual(['w_b']);
  });
});

describe('S3 wine_unpaired', () => {
  const d1 = dish('d1'); const d2 = dish('d2');
  const lonely = wine('w_lonely', { glassPrice: null });
  const prim = wine('w_prim', { glassPrice: null });
  // both dishes have a primary (no S1) by the bottle; w_lonely is bottle-only too, so S2 stays out of the way
  const base = (over: Partial<OpportunityInput> = {}) => input({
    dishes: [d1, d2], wines: [prim, lonely],
    pairings: [pairing('d1', 'w_prim', 'approved', 'primary'), pairing('d2', 'w_prim', 'approved', 'primary')],
    scores: scores([['d1', 'w_lonely', 86], ['d2', 'w_lonely', 90]]), ...over
  });

  it('fires for an active wine without an approved pairing, at its best undecided published dish', () => {
    expect(findOpportunities(base())).toEqual([{
      key: 'wine_unpaired:w_lonely', rule: 'wine_unpaired', dishId: 'd2', wineId: 'w_lonely', action: 'add_suggestion', evidence: { rule: 'wine_unpaired', score: 90 }
    }]);
  });

  it('needs the best dish at STRONG_MATCH or more: 84 does not fire, 85 does', () => {
    expect(keys(base({ scores: scores([['d1', 'w_lonely', 84], ['d2', 'w_lonely', 80]]) }))).toEqual([]);
    expect(keys(base({ scores: scores([['d1', 'w_lonely', 85], ['d2', 'w_lonely', 80]]) }))).toEqual(['wine_unpaired:w_lonely']);
  });

  it('is silent when the wine has an approved pairing with a published dish, not with a draft one', () => {
    expect(keys(base({ pairings: [...base().pairings, pairing('d1', 'w_lonely', 'approved', 'alternative')] }))).toEqual([]);
    const draft = dish('d0', { status: 'draft' });
    expect(keys(base({ dishes: [draft, d1, d2], pairings: [...base().pairings, pairing('d0', 'w_lonely', 'approved', 'primary')] }))).toEqual(['wine_unpaired:w_lonely']);
  });

  it('skips dishes with a decision: a rejected or suggested best dish moves the proposal to the next one, or ends it', () => {
    expect(findOpportunities(base({ pairings: [...base().pairings, pairing('d2', 'w_lonely', 'rejected')] }))[0]).toMatchObject({ dishId: 'd1', evidence: { score: 86 } });
    expect(keys(base({ pairings: [...base().pairings, pairing('d2', 'w_lonely', 'rejected')], scores: scores([['d1', 'w_lonely', 70], ['d2', 'w_lonely', 90]]) }))).toEqual([]);
    expect(findOpportunities(base({ pairings: [...base().pairings, pairing('d2', 'w_lonely', 'suggested')] }))[0]).toMatchObject({ dishId: 'd1' });
  });

  it('never proposes a hidden wine; ties between dishes go to the lower dish id', () => {
    expect(keys(base({ wines: [prim, { ...lonely, active: false }] }))).toEqual([]);
    expect(findOpportunities(base({ scores: scores([['d2', 'w_lonely', 88], ['d1', 'w_lonely', 88]]) }))[0].dishId).toBe('d1');
  });
});

describe('pipeline: ignored keys, one per pair, order', () => {
  const d = dish('d1');
  const bottle = wine('w_bottle', { glassPrice: null });
  const w1 = wine('w1'); const w2 = wine('w2');
  const base = (over: Partial<OpportunityInput> = {}) => input({
    dishes: [d], wines: [bottle, w1, w2], pairings: [pairing('d1', 'w_bottle', 'approved', 'primary')],
    scores: scores([['d1', 'w1', 90], ['d1', 'w2', 88]]), ...over
  });

  it('keeps one opportunity per (dish, wine): S2 wins over S3 for the same pair', () => {
    expect(findOpportunities(base()).map((o) => `${o.rule}:${o.wineId}`)).toEqual(['glass_match_unpaired:w1', 'wine_unpaired:w2']);
    // the candidates still include S3 for w1: it can be ignored
    expect(opportunityCandidates(base()).map((o) => o.key).sort()).toEqual(['glass_match_unpaired:d1', 'wine_unpaired:w1', 'wine_unpaired:w2']);
  });

  it('ignoring S2 for a dish does not reveal its next wine, while S3 of the wine shows', () => {
    const list = findOpportunities(base({ dismissedKeys: new Set(['glass_match_unpaired:d1']) }));
    expect(list.map((o) => `${o.rule}:${o.wineId}`)).toEqual(['wine_unpaired:w1', 'wine_unpaired:w2']);
  });

  it('sorts by category (Starters, Mains, Desserts), dish name in Polish order, then rule (S1, S2, S3), then wine id', () => {
    const dishes = [dish('d_dessert', { name: 'Sernik', category: 'Desserts' }), dish('d_main_z', { name: 'Żurek', category: 'Mains' }), dish('d_main_a', { name: 'Zupa', category: 'Mains' }), dish('d_start', { name: 'Śledź', category: 'Starters' as DishCategory })];
    const wines = [wine('w_b'), wine('w_a')];
    const sc = scores([['d_main_a', 'w_a', 90], ['d_main_a', 'w_b', 89]]);
    const list = findOpportunities(input({ dishes, wines, scores: sc }));
    expect(list.map((o) => `${o.dishId}:${o.rule}:${o.wineId ?? '-'}`)).toEqual([
      'd_start:dish_no_primary:-',
      'd_main_a:dish_no_primary:-', 'd_main_a:glass_match_unpaired:w_a', 'd_main_a:wine_unpaired:w_b',
      'd_main_z:dish_no_primary:-',
      'd_dessert:dish_no_primary:-'
    ]);
  });

  it('gives the same list for any order of the input arrays (R1)', () => {
    const ds = buildDemoDataset({ ids: 'uuid' });
    const sc = buildScoreMatrix(ds.dishes, ds.wines);
    const reference = findOpportunities({ dishes: ds.dishes, wines: ds.wines, pairings: ds.pairings, scores: sc });
    expect(reference.length).toBeGreaterThan(0);
    const rotate = <T>(a: T[], n: number) => [...a.slice(n), ...a.slice(0, n)];
    for (const n of [1, 5, 11]) {
      const shuffled = { dishes: rotate([...ds.dishes].reverse(), n), wines: rotate(ds.wines, n), pairings: rotate([...ds.pairings].reverse(), n), scores: new Map([...sc].reverse()) };
      expect(findOpportunities(shuffled)).toEqual(reference);
    }
  });
});

/* ---------------- the service, on the demo data with a fixed clock ---------------- */

const ACTOR = { id: '00000000-0000-4000-8000-0000000000aa', name: 'Marta Wierzbicka' };
const NOW = Date.parse('2026-10-16T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function build() {
  const data = buildDemoDataset({ ids: 'uuid' });
  const store = MemoryStore.from(data);
  const repos = createMemoryRepositories(store);
  const clock = { at: NOW, now: () => new Date(clock.at) };
  let seq = 0;
  const idGenerator = { uuid: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}` };
  return { data, store, repos, clock, svc: new OpportunityService({ ...repos, clock, idGenerator }), som: new SommelierService({ ...repos, clock, idGenerator }) };
}
type Built = ReturnType<typeof build>;
const dishId = (b: Built, name: string) => b.data.dishes.find((x) => x.name === name)!.id;
const wineId = (b: Built, name: string) => b.data.wines.find((x) => x.name === name)!.id;
const flat = async (b: Built, opts: { dishId?: string; scope: 'dish' | 'all' } = { scope: 'all' }) =>
  (await b.svc.list('halka', opts))!.groups.flatMap((g) => g.items.map((o) => `${o.rule} | ${g.dish.name} | ${o.wine?.name ?? '-'} | ${JSON.stringify(o.evidence)}`));

describe('OpportunityService on the Halka demo data', () => {
  let b: Built;
  beforeEach(() => { b = build(); });

  it('Halka: the opportunities a sommelier sees on first opening (reviewed list, see the PR)', async () => {
    // S1 = 0 (every dish has suggestions or a primary), S2 = 2, S3 = 4; the cheese selection is a draft, so it stays out.
    // Scallops and pike-perch: Solaris, Riesling Kabinett and Sancerre all score 85 by the glass; the tie goes to the lowest wine id.
    expect(await flat(b)).toEqual([
      'wine_unpaired | Baltic herring | Sancerre | {"rule":"wine_unpaired","score":87}',
      'wine_unpaired | Baltic herring | Graacher Himmelreich Riesling Kabinett | {"rule":"wine_unpaired","score":87}',
      'glass_match_unpaired | Seared scallops | Solaris | {"rule":"glass_match_unpaired","score":85,"glassPrice":38}',
      'glass_match_unpaired | Pike-perch | Solaris | {"rule":"glass_match_unpaired","score":85,"glassPrice":38}',
      'wine_unpaired | Wild mushroom risotto | De Nit Rosé | {"rule":"wine_unpaired","score":86}',
      'wine_unpaired | Wild mushroom risotto | Bannockburn Pinot Noir | {"rule":"wine_unpaired","score":85}'
    ]);
    const view = (await b.svc.list('halka', { scope: 'all' }))!;
    expect(view.degraded).toEqual([]);
    expect(view.dismissed).toEqual([]);
  });

  it('shows the dish\'s approved pairings in guest order (primary first)', async () => {
    const herring = (await b.svc.list('halka', { scope: 'dish', dishId: dishId(b, 'Baltic herring') }))!;
    expect(herring.groups).toHaveLength(1);
    expect(herring.groups[0].current.map((c) => `${c.wine.name}:${c.role}`)).toEqual(['Kamptaler Terrassen Grüner Veltliner:primary', 'Solaris:best_value']);
  });

  it('scope "dish" with a dish id narrows to that dish, S3 included where the wine matches it best', async () => {
    expect(await flat(b, { scope: 'dish', dishId: dishId(b, 'Wild mushroom risotto') })).toEqual([
      'wine_unpaired | Wild mushroom risotto | De Nit Rosé | {"rule":"wine_unpaired","score":86}',
      'wine_unpaired | Wild mushroom risotto | Bannockburn Pinot Noir | {"rule":"wine_unpaired","score":85}'
    ]);
    expect(await flat(b, { scope: 'dish', dishId: dishId(b, 'Duck breast') })).toEqual([]);
  });

  it('localizes dishes and wines for the panel language', async () => {
    const view = (await b.svc.list('halka', { scope: 'all' }, 'pl'))!;
    const herring = b.data.dishes.find((x) => x.name === 'Baltic herring')!;
    expect(view.groups[0].dish.name).toBe(herring.translations.pl?.name ?? herring.name);
  });

  it('returns null for an unknown restaurant; commands report it as NotFoundError', async () => {
    expect(await b.svc.list('nowhere', { scope: 'all' })).toBeNull();
    await expect(b.svc.dismiss('nowhere', `wine_unpaired:${wineId(b, 'Sancerre')}`, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    await expect(b.svc.restore('nowhere', `wine_unpaired:${wineId(b, 'Sancerre')}`, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('dismiss and restore (fixed clock)', () => {
  let b: Built;
  beforeEach(() => { b = build(); });
  const sancerre = (x: Built) => `wine_unpaired:${wineId(x, 'Sancerre')}`;
  const shown = async (x: Built, key: string) => (await x.svc.list('halka', { scope: 'all' }))!.groups.some((g) => g.items.some((o) => o.key === key));

  it('hides an ignored opportunity until expiresAt (now + DISMISS_DAYS) and shows it again after, if the condition still holds', async () => {
    const key = sancerre(b);
    await b.svc.dismiss('halka', key, ACTOR);
    expect(await shown(b, key)).toBe(false);
    const view = (await b.svc.list('halka', { scope: 'all' }))!;
    expect(view.dismissed).toEqual([expect.objectContaining({
      key, rule: 'wine_unpaired', dismissedBy: ACTOR.name, expiresAt: new Date(NOW + DISMISS_DAYS * DAY).toISOString()
    })]);
    expect(view.dismissed[0].wine?.name).toBe('Sancerre');
    expect(view.dismissed[0].dish?.name).toBe('Baltic herring');
    const [row] = await b.repos.opportunityDismissalRepository.listActive(b.data.restaurant.id, new Date(NOW));
    expect(row).toMatchObject({ dismissedById: ACTOR.id, dismissedAt: new Date(NOW).toISOString() });
    b.clock.at = NOW + DISMISS_DAYS * DAY - 1;
    expect(await shown(b, key)).toBe(false);
    b.clock.at = NOW + DISMISS_DAYS * DAY;
    expect(await shown(b, key)).toBe(true);
    expect((await b.svc.list('halka', { scope: 'all' }))!.dismissed).toEqual([]);
  });

  it('ignoring again extends the term and keeps one row', async () => {
    const key = sancerre(b);
    await b.svc.dismiss('halka', key, ACTOR);
    b.clock.at = NOW + 10 * DAY;
    await b.svc.dismiss('halka', key, { id: '00000000-0000-4000-8000-0000000000bb', name: 'Tomasz Lis' });
    const rows = await b.repos.opportunityDismissalRepository.listActive(b.data.restaurant.id, new Date(b.clock.at));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key, dismissedBy: 'Tomasz Lis', expiresAt: new Date(NOW + (10 + DISMISS_DAYS) * DAY).toISOString() });
  });

  it('accepts only the key of a current candidate: anything else is opportunity_stale and stores nothing', async () => {
    const stale = async (key: string) => {
      await expect(b.svc.dismiss('halka', key, ACTOR)).rejects.toMatchObject({ name: 'ValidationError', code: 'opportunity_stale' });
    };
    await stale(`wine_unpaired:${wineId(b, 'Morgon')}`);                         // Morgon has approved pairings
    await stale(`glass_match_unpaired:${dishId(b, 'Duck breast')}`);              // the duck has a primary by the glass
    await stale(`dish_no_primary:${dishId(b, 'Duck breast')}:none`);
    await stale('wine_unpaired:00000000-0000-4000-8000-00000000beef');          // a wine of another restaurant (or none)
    await stale(`shown_rarely_chosen:${dishId(b, 'Duck breast')}:${wineId(b, 'Morgon')}`); // phase 3 signal
    expect(await b.repos.opportunityDismissalRepository.listActive(b.data.restaurant.id, new Date(NOW))).toEqual([]);
  });

  it('a malformed key is a ValidationError from the schema', async () => {
    for (const key of ['', 'wine_unpaired', 'constructor', '__proto__:x']) {
      await expect(b.svc.dismiss('halka', key, ACTOR)).rejects.toMatchObject({ code: 'validation_failed' });
      await expect(b.svc.restore('halka', key, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('ignoring an already ignored opportunity is allowed (the condition holds before the filter)', async () => {
    const key = sancerre(b);
    await b.svc.dismiss('halka', key, ACTOR);
    await expect(b.svc.dismiss('halka', key, ACTOR)).resolves.toBeUndefined();
  });

  it('restore shows the opportunity at once; restoring what is not ignored is opportunity_not_dismissed', async () => {
    const key = sancerre(b);
    await expect(b.svc.restore('halka', key, ACTOR)).rejects.toMatchObject({ name: 'NotFoundError', code: 'opportunity_not_dismissed' });
    await b.svc.dismiss('halka', key, ACTOR);
    await b.svc.restore('halka', key, ACTOR);
    expect(await shown(b, key)).toBe(true);
  });

  it('a pairing added from the opportunity ends it; its key is stale afterwards', async () => {
    const key = sancerre(b);
    await b.som.addSuggestion('halka', { dishId: dishId(b, 'Baltic herring'), wineId: wineId(b, 'Sancerre') }, ACTOR);
    // the wine still has no approved pairing, so S3 moves to its next best dish if that one is strong enough
    const after = (await b.svc.list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items).find((o) => o.key === key);
    expect(after?.dishId).not.toBe(dishId(b, 'Baltic herring'));
  });

  it('keeps ignored opportunities within their restaurant (D18)', async () => {
    const other = buildDemoDataset({ ids: 'uuid' });
    const second = { ...other, restaurant: { ...other.restaurant, id: '00000000-0000-4000-8000-0000000000f2', slug: 'druga' }, users: [] };
    const store = MemoryStore.from(b.data, second);
    const repos = createMemoryRepositories(store);
    const svc = new OpportunityService({ ...repos, clock: b.clock, idGenerator: { uuid: () => '00000000-0000-4000-8000-0000000000c1' } });
    const key = sancerre(b);
    await svc.dismiss('halka', key, ACTOR);
    const keysOf = async (slug: string) => (await svc.list(slug, { scope: 'all' }))!.groups.flatMap((g) => g.items.map((o) => o.key));
    expect(await keysOf('halka')).not.toContain(key);
    expect(await keysOf('druga')).toContain(key);
    expect((await svc.list('druga', { scope: 'all' }))!.dismissed).toEqual([]);
    await expect(svc.restore('druga', key, ACTOR)).rejects.toMatchObject({ code: 'opportunity_not_dismissed' });
  });
});

describe('performance budget', () => {
  it('computes 100 dishes × 500 wines on read well within a second', () => {
    const dishes = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(demo.dishes[i % demo.dishes.length]), id: `d${i}`, status: 'published' as const }));
    const wines = Array.from({ length: 500 }, (_, i) => ({ ...structuredClone(demo.wines[i % demo.wines.length]), id: `w${i}`, active: true }));
    const started = Date.now();
    const list = findOpportunities({ dishes, wines, pairings: [], scores: buildScoreMatrix(dishes, wines) });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(list.length).toBeGreaterThan(0);
  });
});

/* ---------------- phase 4: S5 ordered_not_reviewed (orders with a recommendation code, E09) ---------------- */

describe('S5 ordered_not_reviewed (pure rule)', () => {
  const d = dish('d1');
  const w = wine('w1', { glassPrice: null });
  const primary = wine('w_p', { glassPrice: null });
  // the dish has an approved primary bottle-only wine, so S1 is silent; bottle-only wines keep S2 out
  const base = (over: Partial<OpportunityInput> = {}) => input({
    dishes: [d], wines: [w, primary], pairings: [pairing('d1', 'w_p', 'approved', 'primary')],
    scores: scores([['d1', 'w1', 70], ['d1', 'w_p', 80]]), orders: [{ dishId: 'd1', wineId: 'w1', orders: MIN_ORDERS }], ...over
  });
  const s5 = (i: OpportunityInput) => findOpportunities(i).filter((o) => o.rule === 'ordered_not_reviewed');

  it('fires from MIN_ORDERS orders for a pair without a pairing: 4 does not, 5 does, with "Add to suggestions"', () => {
    expect(MIN_ORDERS).toBe(5);
    expect(WINDOW_DAYS).toBe(28);
    expect(s5(base({ orders: [{ dishId: 'd1', wineId: 'w1', orders: MIN_ORDERS - 1 }] }))).toEqual([]);
    expect(s5(base())).toEqual([{
      key: 'ordered_not_reviewed:d1:w1', rule: 'ordered_not_reviewed', dishId: 'd1', wineId: 'w1', action: 'add_suggestion',
      evidence: { rule: 'ordered_not_reviewed', orders: MIN_ORDERS }
    }]);
  });

  it('a suggested pairing gets "Approve" with the pairing id and the version the sommelier saw', () => {
    const suggested = { ...pairing('d1', 'w1', 'suggested'), version: 3 };
    expect(s5(base({ pairings: [pairing('d1', 'w_p', 'approved', 'primary'), suggested] }))).toEqual([expect.objectContaining({
      action: 'approve', pairingId: suggested.id, pairingVersion: 3, evidence: { rule: 'ordered_not_reviewed', orders: MIN_ORDERS }
    })]);
  });

  it('skips approved, modified and rejected pairs (R4)', () => {
    for (const status of ['approved', 'modified', 'rejected'] as const) {
      const p = pairing('d1', 'w1', status, status === 'rejected' ? null : 'alternative');
      expect(s5(base({ pairings: [pairing('d1', 'w_p', 'approved', 'primary'), p] }))).toEqual([]);
    }
  });

  it('skips a dish guests do not see and a hidden or unknown wine', () => {
    expect(s5(base({ dishes: [dish('d1', { status: 'draft' })] }))).toEqual([]);
    expect(s5(base({ wines: [wine('w1', { active: false, glassPrice: null }), primary] }))).toEqual([]);
    expect(s5(base({ orders: [{ dishId: 'd1', wineId: 'w_unknown', orders: 9 }] }))).toEqual([]);
  });

  it('without a pairing and below MIN_MODEL_SCORE, it opens the dish instead of offering an add the command would refuse', () => {
    expect(s5(base({ scores: scores([['d1', 'w1', MIN_MODEL_SCORE - 1], ['d1', 'w_p', 80]]) }))[0].action).toBe('open_dish');
    expect(s5(base({ scores: scores([['d1', 'w1', MIN_MODEL_SCORE], ['d1', 'w_p', 80]]) }))[0].action).toBe('add_suggestion');
  });

  it('wins over S2 and S3 for the same pair; both stay candidates, so each can still be ignored', () => {
    const glass = wine('w1', { glassPrice: 40 });
    const i = base({ wines: [glass, primary], scores: scores([['d1', 'w1', 90], ['d1', 'w_p', 80]]) });
    expect(findOpportunities(i).map((o) => `${o.rule}:${o.wineId}`)).toEqual(['ordered_not_reviewed:w1']);
    expect(opportunityCandidates(i).map((o) => o.key).sort()).toEqual(['glass_match_unpaired:d1', 'ordered_not_reviewed:d1:w1', 'wine_unpaired:w1']);
  });

  it('is silent without orders (scope "dish") and gives the same list for any order of the order rows', () => {
    expect(s5(base({ orders: undefined }))).toEqual([]);
    const w2 = wine('w2', { glassPrice: null });
    const rows = [{ dishId: 'd1', wineId: 'w1', orders: 6 }, { dishId: 'd1', wineId: 'w2', orders: 7 }];
    const i = base({ wines: [w, w2, primary], scores: scores([['d1', 'w1', 70], ['d1', 'w2', 75], ['d1', 'w_p', 80]]), orders: rows });
    expect(findOpportunities(i).map((o) => o.wineId)).toEqual(['w1', 'w2']);
    expect(findOpportunities({ ...i, orders: [...rows].reverse() })).toEqual(findOpportunities(i));
  });
});

describe('OpportunityService: S5 from the recommendation codes', () => {
  let b: Built;
  beforeEach(() => { b = build(); });
  let seq = 0;
  /** `n` codes for (dishes, wine) on `day`, confirmed by the waiter unless `confirmed: false` */
  async function codes(x: Built, dishIds: string[], wine: string, day: string, n: number, opts: { confirmed?: boolean; context?: CodeContext } = {}) {
    const repo = x.repos.recommendationCodeRepository;
    for (let i = 0; i < n; i++) {
      seq++;
      const id = `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`;
      const code = `C${(seq % 8) + 2}${'ACDEFGHJKLMNPRTUVWXY'[Math.floor(seq / 8) % 20]}${(Math.floor(seq / 160) % 8) + 2}`;
      const res = await repo.tryIssue(x.data.restaurant.id, {
        id, code, serviceDay: day, sessionId: id, source: 'guest', context: opts.context ?? (dishIds.length === 1 ? 'dish' : 'table'), wineId: wine,
        dishIds: [...dishIds].sort(), serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: `${day}T19:00:00.000Z`
      });
      expect(res.status).toBe('created');
      if (opts.confirmed !== false) await repo.setConfirmed(x.data.restaurant.id, day, code, new Date(`${day}T19:05:00.000Z`), 'staff_view');
    }
  }
  /** a pair of the demo data without any pairing, strong enough for "Add to suggestions" */
  const unpaired = (x: Built) => {
    const sc = buildScoreMatrix(x.data.dishes, x.data.wines);
    const decided = new Set(x.data.pairings.map((p) => `${p.dishId}:${p.wineId}`));
    const ok = (dishId: string, wineId: string) => !decided.has(`${dishId}:${wineId}`) && (sc.get(scoreKey(dishId, wineId)) ?? 0) >= MIN_MODEL_SCORE;
    const d = x.data.dishes.find((dd) => dd.status === 'published' && x.data.wines.some((ww) => ww.active && ok(dd.id, ww.id)))!;
    const w = x.data.wines.find((ww) => ww.active && ok(d.id, ww.id))!;
    return { dish: d.id, wine: w.id };
  };
  const s5 = async (x: Built, svc: OpportunityService = x.svc) =>
    (await svc.list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items).filter((o) => o.rule === 'ordered_not_reviewed');
  const withCodes = (x: Built, codesRepo: RecommendationCodeRepository) =>
    new OpportunityService({ ...x.repos, recommendationCodeRepository: codesRepo, clock: x.clock, idGenerator: { uuid: () => '00000000-0000-4000-8000-0000000000c2' } });
  // NOW = 2026-10-16 12:00 in Warsaw: the window is the service days 2026-09-18 … 2026-10-15
  const FIRST = '2026-09-18';
  const LAST = '2026-10-15';

  it('counts staff-confirmed orders of context "dish" in the last 28 full service days', async () => {
    const p = unpaired(b);
    await codes(b, [p.dish], p.wine, FIRST, 2);
    await codes(b, [p.dish], p.wine, LAST, 2);
    await codes(b, [p.dish], p.wine, '2026-10-16', 3);   // today: not a full day yet
    await codes(b, [p.dish], p.wine, '2026-09-17', 3);   // the 29th day back
    await codes(b, [p.dish], p.wine, LAST, 3, { confirmed: false });   // issued, never ordered
    expect(await s5(b)).toEqual([]);
    await codes(b, [p.dish], p.wine, '2026-10-01', 1);
    const [o] = await s5(b);
    expect(o).toMatchObject({ key: `ordered_not_reviewed:${p.dish}:${p.wine}`, action: 'add_suggestion', evidence: { orders: 5 } });
    expect(o.wine?.id).toBe(p.wine);
  });

  it('ignores rows of context "table": one table order would count for every dish of the table', async () => {
    const p = unpaired(b);
    const other = b.data.dishes.find((d) => d.status === 'published' && d.id !== p.dish)!;
    await codes(b, [p.dish, other.id], p.wine, LAST, 9);
    expect(await s5(b)).toEqual([]);
  });

  it('is not computed for scope "dish" (A6, A1): no query on the codes', async () => {
    const p = unpaired(b);
    await codes(b, [p.dish], p.wine, LAST, 6);
    const repo = b.repos.recommendationCodeRepository;
    let calls = 0;
    const counting: RecommendationCodeRepository = Object.assign(Object.create(repo) as RecommendationCodeRepository, {
      pairStats: async (...a: Parameters<RecommendationCodeRepository['pairStats']>) => { calls++; return repo.pairStats(...a); }
    });
    const svc = withCodes(b, counting);
    const dishView = (await svc.list('halka', { scope: 'dish', dishId: p.dish }))!;
    expect(dishView.groups.flatMap((g) => g.items).some((o) => o.rule === 'ordered_not_reviewed')).toBe(false);
    expect(calls).toBe(0);
    expect((await s5(b, svc)).length).toBe(1);
    expect(calls).toBe(1);
  });

  it('a failed read keeps S1–S3 and reports degraded: ["orders"]; ignoring an S5 key then stores nothing', async () => {
    const before = await flat(b);
    const failing: RecommendationCodeRepository = Object.assign(Object.create(b.repos.recommendationCodeRepository) as RecommendationCodeRepository, {
      pairStats: async () => { throw new Error('db down'); }
    });
    const svc = withCodes(b, failing);
    const view = (await svc.list('halka', { scope: 'all' }))!;
    expect(view.degraded).toEqual(['orders']);
    expect(view.groups.flatMap((g) => g.items.map((o) => `${o.rule} | ${g.dish.name} | ${o.wine?.name ?? '-'} | ${JSON.stringify(o.evidence)}`))).toEqual(before);
    expect((await svc.list('halka', { scope: 'dish' }))!.degraded).toEqual([]);
    const p = unpaired(b);
    await expect(svc.dismiss('halka', `ordered_not_reviewed:${p.dish}:${p.wine}`, ACTOR)).rejects.toThrow('db down');
    expect(await b.repos.opportunityDismissalRepository.listActive(b.data.restaurant.id, new Date(NOW))).toEqual([]);
  });

  it('a suggested pairing: "Approve" with the version ends the opportunity; a stale version is a VersionConflictError', async () => {
    const published = new Set(b.data.dishes.filter((d) => d.status === 'published').map((d) => d.id));
    const active = new Set(b.data.wines.filter((w) => w.active).map((w) => w.id));
    const suggested = b.data.pairings.find((p) => p.status === 'suggested' && published.has(p.dishId) && active.has(p.wineId))!;
    await codes(b, [suggested.dishId], suggested.wineId, LAST, MIN_ORDERS);
    const [o] = await s5(b);
    expect(o).toMatchObject({ action: 'approve', pairingId: suggested.id, evidence: { orders: MIN_ORDERS } });
    expect(o.pairingVersion).toEqual(expect.any(Number));
    // a version the pairing no longer has (the form is older than the pairing) is a conflict, and nothing changes
    await expect(b.som.approve('halka', o.pairingId!, ACTOR, o.pairingVersion! + 1)).rejects.toMatchObject({ name: 'VersionConflictError', code: 'version_conflict' });
    expect(await s5(b)).toEqual([o]);
    // the form's version approves it and ends the opportunity
    await b.som.approve('halka', o.pairingId!, ACTOR, o.pairingVersion);
    expect(await s5(b)).toEqual([]);
    // a second sommelier submitting the same form afterwards gets the conflict, not a second decision
    await expect(b.som.approve('halka', o.pairingId!, ACTOR, o.pairingVersion)).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('an approved or rejected pair never gives S5 (R4)', async () => {
    const published = new Set(b.data.dishes.filter((d) => d.status === 'published').map((d) => d.id));
    const approved = b.data.pairings.find((p) => p.status === 'approved' && published.has(p.dishId))!;
    await codes(b, [approved.dishId], approved.wineId, LAST, 9);
    const p = unpaired(b);
    await b.som.addSuggestion('halka', { dishId: p.dish, wineId: p.wine }, ACTOR);
    const added = (await b.repos.pairingRepository.listByRestaurant(b.data.restaurant.id)).find((x) => x.dishId === p.dish && x.wineId === p.wine)!;
    await b.som.reject('halka', added.id, ACTOR, added.version);
    await codes(b, [p.dish], p.wine, LAST, 9);
    expect(await s5(b)).toEqual([]);
  });

  it('"Add to suggestions" turns it into "Approve"; ignoring the S5 key hides it and "Restore" shows it again', async () => {
    const p = unpaired(b);
    await codes(b, [p.dish], p.wine, LAST, MIN_ORDERS);
    const key = `ordered_not_reviewed:${p.dish}:${p.wine}`;
    await b.som.addSuggestion('halka', { dishId: p.dish, wineId: p.wine }, ACTOR);
    expect((await s5(b))[0]).toMatchObject({ key, action: 'approve' });
    await b.svc.dismiss('halka', key, ACTOR);
    expect(await s5(b)).toEqual([]);
    expect((await b.svc.list('halka', { scope: 'all' }))!.dismissed).toEqual([expect.objectContaining({ key, rule: 'ordered_not_reviewed' })]);
    await b.svc.restore('halka', key, ACTOR);
    expect((await s5(b)).map((o) => o.key)).toEqual([key]);
  });

  it('an S5 key without enough orders is stale', async () => {
    const p = unpaired(b);
    await codes(b, [p.dish], p.wine, LAST, MIN_ORDERS - 1);
    await expect(b.svc.dismiss('halka', `ordered_not_reviewed:${p.dish}:${p.wine}`, ACTOR)).rejects.toMatchObject({ code: 'opportunity_stale' });
  });
});

/* ---------------- phase 3: S4 shown_rarely_chosen ---------------- */

describe('S4 shown_rarely_chosen (pure rule)', () => {
  const d = dish('d1');
  const prim = wine('w_p', { glassPrice: null });
  const alt = wine('w_a', { glassPrice: null });
  const eng = wine('w_e', { glassPrice: null });
  const stat = (wineId: string, source: PairingStat['source'], shown: number, chosen: number): PairingStat => ({ dishId: 'd1', wineId, source, shown, chosen });
  const primary = pairing('d1', 'w_p', 'approved', 'primary');
  const alternative = pairing('d1', 'w_a', 'approved', 'alternative');
  // bottle-only wines keep S2 out; the primary 2 of 30 (6.7%), the other wines 5 of 20 (25%): at most half of it fires
  const base = (over: Partial<OpportunityInput> = {}) => input({
    dishes: [d], wines: [prim, alt, eng], pairings: [primary, alternative],
    scores: scores([['d1', 'w_p', 80], ['d1', 'w_a', 75], ['d1', 'w_e', 70]]),
    pairingStats: [stat('w_p', 'sommelier', 30, 2), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 2)], ...over
  });
  const s4 = (i: OpportunityInput) => findOpportunities(i).filter((o) => o.rule === 'shown_rarely_chosen');

  it('uses the thresholds of Q7; MIN_SHOWN is E04’s small-sample threshold', () => {
    expect([MIN_SHOWN, MIN_OTHER_CHOSEN, LOW_RATE_FACTOR]).toEqual([30, 5, 0.5]);
    expect(MIN_SHOWN).toBe(MIN_RATE_SAMPLE);
  });

  it('fires for the approved primary with the numbers of the sentence and the pairing to open on A6', () => {
    const [o] = s4(base());
    expect(o).toEqual({
      key: 'shown_rarely_chosen:d1:w_p', rule: 'shown_rarely_chosen', dishId: 'd1', wineId: 'w_p', action: 'open_dish', pairingId: primary.id,
      evidence: { rule: 'shown_rarely_chosen', shown: 30, chosen: 2, otherShown: 20, otherChosen: 5 }
    });
    expect(opportunityKeySchema.safeParse({ key: o.key }).success).toBe(true);
  });

  it('needs shown ≥ 30 (29 is silent) and otherChosen ≥ 5 (4 is silent)', () => {
    expect(s4(base({ pairingStats: [stat('w_p', 'sommelier', 29, 2), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 2)] }))).toEqual([]);
    expect(s4(base({ pairingStats: [stat('w_p', 'sommelier', 30, 2), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 1)] }))).toEqual([]);
  });

  it('a rate exactly at LOW_RATE_FACTOR × the others’ rate fires, one choice more does not; the pair is not among "the others"', () => {
    // 3 of 30 = 10% against 5 of 25 = 20%: exactly half. Counting the primary among the others (8 of 55) would hide it.
    const at = (chosen: number) => base({ pairingStats: [stat('w_p', 'sommelier', 30, chosen), stat('w_a', 'sommelier', 15, 3), stat('w_e', 'engine', 10, 2)] });
    expect(s4(at(3)).map((o) => o.evidence)).toEqual([{ rule: 'shown_rarely_chosen', shown: 30, chosen: 3, otherShown: 25, otherChosen: 5 }]);
    expect(s4(at(4))).toEqual([]);
  });

  it('counts only the sommelier rows of the pair; an engine row of the same wine counts nowhere', () => {
    expect(s4(base({ pairingStats: [stat('w_p', 'engine', 40, 0), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 2)] }))).toEqual([]);
    const both = s4(base({ pairingStats: [stat('w_p', 'sommelier', 30, 2), stat('w_p', 'engine', 40, 0), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 2)] }));
    expect(both.map((o) => o.evidence)).toEqual([{ rule: 'shown_rarely_chosen', shown: 30, chosen: 2, otherShown: 20, otherChosen: 5 }]);
  });

  it('never fires for an Alternative or a best_value pairing (the position effect), nor for a pairing that is not approved', () => {
    for (const role of ['alternative', 'best_value'] as const) {
      const i = base({
        pairings: [primary, pairing('d1', 'w_a', 'approved', role)],
        pairingStats: [stat('w_a', 'sommelier', 60, 1), stat('w_p', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 2)]
      });
      expect(s4(i)).toEqual([]);
    }
    expect(s4(base({ pairings: [{ ...primary, status: 'suggested', role: null }, alternative] }))).toEqual([]);
    expect(s4(base({ pairings: [{ ...primary, status: 'rejected' }, alternative] }))).toEqual([]);
    expect(s4(base({ pairings: [{ ...primary, status: 'modified' }, alternative] }))).toHaveLength(1);
  });

  it('is silent for a dish guests do not see, a hidden wine, and without usage data (scope "dish", or the read failed)', () => {
    expect(s4(base({ dishes: [dish('d1', { status: 'hidden' })] }))).toEqual([]);
    expect(s4(base({ wines: [wine('w_p', { active: false, glassPrice: null }), alt, eng] }))).toEqual([]);
    expect(s4(base({ pairingStats: undefined }))).toEqual([]);
    expect(s4(base({ pairingStats: [] }))).toEqual([]);
  });

  it('counts only rows of the same dish, and gives the same list for any order of the rows (R1)', () => {
    const foreign: PairingStat = { dishId: 'd2', wineId: 'w_a', source: 'sommelier', shown: 50, chosen: 40 };
    const i = base({ dishes: [d, dish('d2')], pairingStats: [stat('w_p', 'sommelier', 30, 2), stat('w_a', 'sommelier', 12, 3), stat('w_e', 'engine', 8, 1), foreign] });
    expect(s4(i)).toEqual([]);
    const ok = base();
    expect(findOpportunities({ ...ok, pairingStats: [...ok.pairingStats!].reverse() })).toEqual(findOpportunities(ok));
  });
});

describe('OpportunityService: S4 from guests’ usage events (seedUsageEvents, E02)', () => {
  let b: Built;
  beforeEach(() => { b = build(); });
  let n = 0;
  // NOW = 2026-10-16 12:00 in Warsaw: E04's window is 18 Sep – 15 Oct (calendar days, today out)
  const IN = '2026-10-01T12:00:00.000Z';
  const ev = (sessionId: string, name: GuestInteractionInput['name'], at: string, extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
    ({ sessionId, name, props: { menuVersion: null }, engineVersion: 'wm-test', createdAt: new Date(at), ...extra });
  /** `k` guest sessions that saw `wine` for `dishId` with `tier`; the first `chosen` of them chose it */
  const sessions = (k: number, chosen: number, dishId: string, wine: string, tier: string, at = IN) => Array.from({ length: k }, (_, i) => {
    const s = `dd000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    return [
      ev(s, 'guest_session_started', at, { props: { source: 'qr', menuVersion: null } }),
      ev(s, 'recommendations_viewed', at, { dishId, props: { wineIds: [wine], items: [{ wineId: wine, tier }], menuVersion: null } }),
      ...(i < chosen ? [ev(s, 'wine_selected', at, { dishId, wineId: wine, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
    ];
  }).flat();
  /** a published dish with an approved primary pairing of an active wine, and another active wine for "the others" */
  const target = (x: Built) => {
    const published = new Set(x.data.dishes.filter((d) => d.status === 'published').map((d) => d.id));
    const active = new Set(x.data.wines.filter((w) => w.active).map((w) => w.id));
    const primary = x.data.pairings.find((p) => (p.status === 'approved' || p.status === 'modified') && p.role === 'primary' && published.has(p.dishId) && active.has(p.wineId))!;
    const other = x.data.wines.find((w) => w.active && w.id !== primary.wineId)!;
    return { primary, dish: primary.dishId, wine: primary.wineId, other: other.id, key: `shown_rarely_chosen:${primary.dishId}:${primary.wineId}` };
  };
  const seed = (x: Built, events: GuestInteractionInput[]) => seedUsageEvents(x.repos.guestInteractionRepository, x.data.restaurant.id, events);
  const s4 = async (x: Built, svc: OpportunityService = x.svc) =>
    (await svc.list('halka', { scope: 'all' }))!.groups.flatMap((g) => g.items).filter((o) => o.rule === 'shown_rarely_chosen');
  const withUsage = (x: Built, repo: GuestInteractionRepository, codes: RecommendationCodeRepository = x.repos.recommendationCodeRepository) =>
    new OpportunityService({ ...x.repos, guestInteractionRepository: repo, recommendationCodeRepository: codes, clock: x.clock, idGenerator: { uuid: () => '00000000-0000-4000-8000-0000000000d4' } });

  it('AC11: fires for the primary from 30 views and 5 choices of the other wines; 29 views or 4 choices are silent', async () => {
    const t = target(b);
    await seed(b, [...sessions(29, 2, t.dish, t.wine, 'sommelier_primary'), ...sessions(20, 5, t.dish, t.other, 'engine')]);
    expect(await s4(b)).toEqual([]);
    await seed(b, sessions(1, 0, t.dish, t.wine, 'sommelier'));
    const [o] = await s4(b);
    expect(o).toMatchObject({ key: t.key, action: 'open_dish', pairingId: t.primary.id, evidence: { shown: 30, chosen: 2, otherShown: 20, otherChosen: 5 } });
    expect(o.wine?.id).toBe(t.wine);

    const c = build();
    const tc = target(c);
    await seed(c, [...sessions(30, 2, tc.dish, tc.wine, 'sommelier_primary'), ...sessions(20, 4, tc.dish, tc.other, 'engine')]);
    expect(await s4(c)).toEqual([]);
  });

  it('AC11: a rate of exactly half the others’ fires, one choice more does not; the pair is left out of "the others"', async () => {
    const t = target(b);
    await seed(b, [...sessions(30, 3, t.dish, t.wine, 'sommelier_primary'), ...sessions(25, 5, t.dish, t.other, 'engine')]);
    expect((await s4(b)).map((o) => o.evidence)).toEqual([{ rule: 'shown_rarely_chosen', shown: 30, chosen: 3, otherShown: 25, otherChosen: 5 }]);
    const c = build();
    const tc = target(c);
    await seed(c, [...sessions(30, 4, tc.dish, tc.wine, 'sommelier_primary'), ...sessions(25, 5, tc.dish, tc.other, 'engine')]);
    expect(await s4(c)).toEqual([]);
  });

  it('AC11: only the sommelier rows count — the wine seen as an engine pick is no S4; an Alternative never gives S4', async () => {
    const t = target(b);
    await seed(b, [...sessions(40, 0, t.dish, t.wine, 'engine'), ...sessions(20, 10, t.dish, t.other, 'engine')]);
    expect(await s4(b)).toEqual([]);
    // the same numbers under the sommelier's label fire while the pairing is the primary, and stop once it is an alternative
    const c = build();
    const tc = target(c);
    await seed(c, [...sessions(30, 0, tc.dish, tc.wine, 'sommelier'), ...sessions(20, 10, tc.dish, tc.other, 'engine')]);
    expect((await s4(c)).length).toBe(1);
    await c.som.setRole('halka', tc.primary.id, 'alternative', ACTOR);
    expect(await s4(c)).toEqual([]);
  });

  it('counts only E04’s window: views on the day before it and today are out', async () => {
    const t = target(b);
    await seed(b, [
      ...sessions(30, 0, t.dish, t.wine, 'sommelier_primary', '2026-09-17T12:00:00.000Z'),
      ...sessions(30, 0, t.dish, t.wine, 'sommelier_primary', '2026-10-16T08:00:00.000Z'),
      ...sessions(20, 10, t.dish, t.other, 'engine')
    ]);
    expect(await s4(b)).toEqual([]);
  });

  it('is not computed for scope "dish" (A6, A1): no usage query; scope "all" queries once', async () => {
    const t = target(b);
    await seed(b, [...sessions(30, 0, t.dish, t.wine, 'sommelier_primary'), ...sessions(20, 10, t.dish, t.other, 'engine')]);
    const repo = b.repos.guestInteractionRepository;
    let calls = 0;
    const counting: GuestInteractionRepository = Object.assign(Object.create(repo) as GuestInteractionRepository, {
      pairingStats: async (...a: Parameters<GuestInteractionRepository['pairingStats']>) => { calls++; return repo.pairingStats(...a); }
    });
    const svc = withUsage(b, counting);
    const dishView = (await svc.list('halka', { scope: 'dish', dishId: t.dish }))!;
    expect(dishView.groups.flatMap((g) => g.items).some((o) => o.rule === 'shown_rarely_chosen')).toBe(false);
    expect(calls).toBe(0);
    expect((await s4(b, svc)).length).toBe(1);
    expect(calls).toBe(1);
  });

  it('AC11: a failed read keeps S1–S3 and reports degraded: ["usage"]; ignoring an S4 key then stores nothing', async () => {
    const before = await flat(b);
    const failing: GuestInteractionRepository = Object.assign(Object.create(b.repos.guestInteractionRepository) as GuestInteractionRepository, {
      pairingStats: async () => { throw new Error('db down'); }
    });
    const svc = withUsage(b, failing);
    const view = (await svc.list('halka', { scope: 'all' }))!;
    expect(view.degraded).toEqual(['usage']);
    expect(view.groups.flatMap((g) => g.items.map((o) => `${o.rule} | ${g.dish.name} | ${o.wine?.name ?? '-'} | ${JSON.stringify(o.evidence)}`))).toEqual(before);
    expect((await svc.list('halka', { scope: 'dish' }))!.degraded).toEqual([]);
    await expect(svc.dismiss('halka', target(b).key, ACTOR)).rejects.toThrow('db down');
    expect(await b.repos.opportunityDismissalRepository.listActive(b.data.restaurant.id, new Date(NOW))).toEqual([]);
    // both sources down: both named, in a fixed order
    const failingCodes: RecommendationCodeRepository = Object.assign(Object.create(b.repos.recommendationCodeRepository) as RecommendationCodeRepository, {
      pairStats: async () => { throw new Error('db down'); }
    });
    expect((await withUsage(b, failing, failingCodes).list('halka', { scope: 'all' }))!.degraded).toEqual(['usage', 'orders']);
  });

  it('Ignore hides the S4 opportunity and Restore shows it again; a key below the thresholds is stale', async () => {
    const t = target(b);
    await expect(b.svc.dismiss('halka', t.key, ACTOR)).rejects.toMatchObject({ code: 'opportunity_stale' });
    await seed(b, [...sessions(30, 0, t.dish, t.wine, 'sommelier_primary'), ...sessions(20, 10, t.dish, t.other, 'engine')]);
    await b.svc.dismiss('halka', t.key, ACTOR);
    expect(await s4(b)).toEqual([]);
    expect((await b.svc.list('halka', { scope: 'all' }))!.dismissed).toEqual([expect.objectContaining({ key: t.key, rule: 'shown_rarely_chosen' })]);
    await b.svc.restore('halka', t.key, ACTOR);
    expect((await s4(b)).map((o) => o.key)).toEqual([t.key]);
  });
});
