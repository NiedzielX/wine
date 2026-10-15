import type { Dish, ProteinType, Wine } from '../domain/types';
import type { Locale, Localized } from '../i18n/locale';

/**
 * Wine Matching Engine v1 — pairing_score(dish, wine).
 *
 * Pure, deterministic function: same input always gives the same score and the same
 * explanation. No network, no LLM. Every rule is a named factor so a sommelier can
 * see why a score moved and engineers can unit-test each rule. See RECOMMENDATION_ENGINE.md.
 */

export interface Factor {
  /** stable rule id, used in tests and analytics */
  rule: string;
  delta: number;
  /** guest-facing phrase in English, used to build "Why it works" (only for positive factors); the public API shows it */
  why?: string;
  /** the same phrase in Polish (spec 2026-10-15-polish-language R8); every rule with `why` has one */
  whyPl?: string;
}

export interface PairingScore {
  score: number;
  factors: Factor[];
  why: string;
}

export const BASE_SCORE = 72;
export const ENGINE_VERSION = 'wm-rules-1.0.0';

/** Classic grape / dish affinities, the sommelier knowledge layer. Keyed by protein. */
const AFFINITIES: Record<ProteinType, Array<{ match: (w: Wine, d: Dish) => boolean; delta: number; why: Localized }>> = {
  beef: [
    { match: (w) => hasGrape(w, 'Cabernet Sauvignon'), delta: 7, why: { en: 'Cabernet is the classic partner for aged beef', pl: 'Cabernet to klasyczny partner dojrzewającej wołowiny' } },
    { match: (w) => hasGrape(w, 'Syrah'), delta: 4, why: { en: 'peppery Syrah echoes the char', pl: 'pieprzne Syrah podkreśla nuty z grilla' } },
    { match: (w, d) => d.profile.cooking === 'raw' && hasGrape(w, 'Gamay'), delta: 8, why: { en: 'juicy Gamay keeps raw beef bright', pl: 'soczyste Gamay dodaje surowej wołowinie świeżości' } },
    { match: (w, d) => d.profile.cooking === 'raw' && w.profile.style === 'sparkling', delta: 4, why: { en: 'fine bubbles refresh the palate between bites', pl: 'drobne bąbelki odświeżają podniebienie między kęsami' } }
  ],
  game: [
    { match: (w) => hasGrape(w, 'Syrah'), delta: 8, why: { en: 'Syrah\u2019s pepper and dark fruit love game and juniper', pl: 'pieprz i ciemne owoce Syrah świetnie łączą się z dziczyzną i jałowcem' } },
    { match: (w) => hasGrape(w, 'Nebbiolo'), delta: 5, why: { en: 'Nebbiolo\u2019s structure stands up to venison', pl: 'struktura Nebbiolo dorównuje dziczyźnie' } }
  ],
  poultry: [
    { match: (w) => hasGrape(w, 'Pinot Noir'), delta: 8, why: { en: 'Pinot Noir\u2019s red fruit mirrors the cherry and roasted skin', pl: 'czerwone owoce Pinot Noir odpowiadają wiśni i pieczonej skórce' } },
    { match: (w) => hasGrape(w, 'Gamay'), delta: 5, why: { en: 'bright Gamay fruit lifts the dish', pl: 'żywe owoce Gamay ożywiają danie' } }
  ],
  pork: [
    { match: (w) => hasGrape(w, 'Riesling'), delta: 7, why: { en: 'Riesling\u2019s touch of sweetness tames glaze and spice', pl: 'nuta słodyczy Rieslinga łagodzi glazurę i przyprawy' } },
    { match: (w) => w.profile.style === 'rose', delta: 3, why: { en: 'a structured rosé handles sweet and savoury together', pl: 'wyraziste wino różowe łączy słodkie i wytrawne smaki' } }
  ],
  fish: [
    { match: (w) => w.profile.style === 'white' || w.profile.style === 'sparkling', delta: 4, why: { en: 'a crisp white keeps the fish delicate', pl: 'rześkie białe wino nie przytłacza delikatnej ryby' } },
    { match: (w, d) => d.profile.creaminess >= 3 && hasGrape(w, 'Chardonnay') && w.profile.body >= 3, delta: 5, why: { en: 'Chardonnay\u2019s texture meets the butter sauce', pl: 'tekstura Chardonnay współgra z sosem maślanym' } },
    { match: (w, d) => d.profile.cooking === 'cured' && hasGrape(w, 'Grüner Veltliner'), delta: 6, why: { en: 'Grüner\u2019s white pepper is made for cured fish and dill', pl: 'biały pieprz Grünera jest stworzony do solonej ryby i koperku' } }
  ],
  shellfish: [
    { match: (w) => w.profile.style === 'white' || w.profile.style === 'sparkling', delta: 4, why: { en: 'clean acidity lets the sweetness of the shellfish show', pl: 'czysta kwasowość wydobywa słodycz owoców morza' } },
    { match: (w) => hasGrape(w, 'Chardonnay') && w.profile.body >= 3, delta: 4, why: { en: 'Chardonnay echoes brown butter and hazelnut', pl: 'Chardonnay podkreśla nuty palonego masła i orzecha laskowego' } }
  ],
  mushroom: [
    { match: (w) => hasGrape(w, 'Pinot Noir'), delta: 7, why: { en: 'earthy Pinot Noir matches porcini', pl: 'ziemiste Pinot Noir pasuje do borowików' } },
    { match: (w) => hasGrape(w, 'Chardonnay') && w.profile.oak >= 1, delta: 6, why: { en: 'a rounded Chardonnay mirrors the creamy risotto', pl: 'krągłe Chardonnay współgra z kremowym risotto' } }
  ],
  vegetable: [
    { match: (w) => w.profile.style === 'orange', delta: 7, why: { en: 'skin-contact texture loves miso and roasted roots', pl: 'tekstura wina macerowanego na skórkach świetnie łączy się z miso i pieczonymi warzywami korzeniowymi' } },
    { match: (w) => w.profile.style === 'white' && w.profile.body >= 3, delta: 3, why: { en: 'a textured white carries the nutty, savoury flavours', pl: 'treściwe białe wino niesie orzechowe, wytrawne smaki' } }
  ],
  dairy: [
    { match: (w) => hasGrape(w, 'Chardonnay'), delta: 4, why: { en: 'Chardonnay mirrors creamy textures', pl: 'Chardonnay współgra z kremową teksturą' } },
    { match: (w) => w.profile.style === 'sparkling', delta: 3, why: { en: 'bubbles cut through the cream', pl: 'bąbelki przełamują kremowość' } },
    { match: (w, d) => d.profile.salt >= 4 && w.profile.sweetness >= 4, delta: 6, why: { en: 'sweet wine and salty cheese are a classic contrast', pl: 'słodkie wino i słony ser to klasyczny kontrast' } }
  ],
  dessert: [
    { match: (w, d) => w.profile.style === 'sweet' && w.profile.sweetness >= d.profile.sweetness, delta: 9, why: { en: 'the wine is at least as sweet as the dessert', pl: 'wino jest co najmniej tak słodkie jak deser' } }
  ]
};

function hasGrape(w: Wine, grape: string): boolean {
  return w.grapes[0] === grape;
}

// every rule below is guarded so that its delta is never zero (the property sweep in the tests checks it)
// a phrase is an { en, pl } pair at the rule itself, so a rule cannot ship without its Polish text
function add(factors: Factor[], rule: string, delta: number, why?: Localized): void {
  factors.push(why ? { rule, delta, why: why.en, whyPl: why.pl } : { rule, delta });
}

export function pairingScore(dish: Dish, wine: Wine, locale: Locale = 'en'): PairingScore {
  const d = dish.profile;
  const w = wine.profile;
  const f: Factor[] = [];

  // 1. Weight: wine body should mirror dish intensity.
  const weightGap = Math.abs(w.body - d.intensity);
  if (weightGap <= 1) add(f, 'weight.match', 4, { en: 'its weight matches the dish', pl: 'jego budowa pasuje do dania' });
  else add(f, 'weight.gap', -5 * (weightGap - 1));

  // 2. Acidity: the wine must be at least as acidic as the dish; extra acidity cuts fat.
  if (w.acidity < d.acidity) add(f, 'acid.under', -6 * (d.acidity - w.acidity));
  if (w.acidity >= 4 && w.acidity >= d.acidity + 1 && d.fat >= 3) add(f, 'acid.cuts_fat', 5, { en: 'fresh acidity cuts through the richness', pl: 'świeża kwasowość równoważy bogactwo potrawy' });

  // 3. Sweetness: a wine less sweet than the dish tastes thin and sour.
  const sweetTolerance = d.protein === 'dessert' ? 1 : 2;
  const sweetGap = d.sweetness - w.sweetness - sweetTolerance;
  if (sweetGap > 0) add(f, 'sweet.under', -7 * sweetGap);
  const saltyCheese = d.protein === 'dairy' && d.salt >= 4;
  if (d.protein !== 'dessert' && w.sweetness >= 4 && !saltyCheese) {
    add(f, 'sweet.savoury_clash', d.sweetness <= 1 ? -25 : -14);
  }
  if (d.protein === 'dessert' && w.sweetness <= 1) add(f, 'sweet.dry_with_dessert', -10);

  // 4. Tannin with protein and fat.
  const delicateProtein = d.protein === 'fish' || d.protein === 'shellfish';
  if (delicateProtein && w.tannin >= 2) add(f, 'tannin.fish', -8 * (w.tannin - 1));
  if ((d.protein === 'beef' || d.protein === 'game') && w.tannin >= 3) add(f, 'tannin.red_meat', 6, { en: 'firm tannins hold up to the meat', pl: 'wyraźne taniny dorównują mięsu' });
  if (w.tannin >= 3 && d.fat >= 4) add(f, 'tannin.fat', 3, { en: 'tannin and fat soften each other', pl: 'taniny i tłuszcz nawzajem się łagodzą' });
  if (d.intensity <= 2 && w.tannin >= 4) add(f, 'tannin.overpowers', -8);
  if (d.protein === 'dessert' && w.tannin >= 2) add(f, 'tannin.dessert', -6);

  // 5. Heat: alcohol and tannin amplify spice; off-dry aromatic wines calm it.
  if (d.spice >= 2) {
    if (w.alcohol > 13.5) add(f, 'spice.alcohol', -4 * (d.spice - 1));
    if (w.tannin >= 3) add(f, 'spice.tannin', -3 * (d.spice - 1));
    if (w.sweetness >= 1 && w.sweetness <= 2 && w.aromatic >= 4) add(f, 'spice.offdry', 7, { en: 'a touch of sweetness calms the heat', pl: 'odrobina słodyczy łagodzi ostrość' });
  }

  // 6. Umami: makes tannin taste harsher, rewards fruit.
  if (d.umami >= 4) {
    if (w.tannin >= 4) add(f, 'umami.tannin', -5);
    if (w.fruitiness >= 3 && w.tannin <= 3) add(f, 'umami.fruit', 2);
  }

  // 7. Smoke and char want oak and structure; delicate wines get lost.
  if (d.smoke >= 3) {
    if (w.oak >= 2) add(f, 'smoke.oak', 4, { en: 'oak and char speak the same language', pl: 'beczka i nuty z grilla mówią tym samym językiem' });
    if (w.body <= 2) add(f, 'smoke.delicate', -4);
  }

  // 8. Salt loves bubbles and acidity, makes tannin bitter.
  if (d.salt >= 4) {
    if (w.style === 'sparkling') add(f, 'salt.bubbles', 5, { en: 'bubbles and salt are a natural match', pl: 'bąbelki i sól to naturalne połączenie' });
    if (w.acidity >= 4) add(f, 'salt.acid', 2);
    if (w.tannin >= 4) add(f, 'salt.tannin', -3);
  }

  // 9. Creamy textures want texture or bubbles.
  if (d.creaminess >= 3) {
    if ((w.style === 'white' || w.style === 'orange') && w.body >= 3) add(f, 'cream.texture', 4, { en: 'its texture meets the creaminess', pl: 'jego tekstura dorównuje kremowości dania' });
    if (w.style === 'sparkling') add(f, 'cream.bubbles', 3, { en: 'bubbles lift the creamy texture', pl: 'bąbelki odświeżają kremową teksturę' });
    if (w.tannin >= 3) add(f, 'cream.tannin', -3);
  }

  // 10. Raw and cured dishes dislike heady alcohol.
  if ((d.cooking === 'raw' || d.cooking === 'cured') && w.alcohol >= 14) add(f, 'raw.alcohol', -3);

  // 10b. Whites and rosés rarely carry the biggest red-meat dishes.
  if ((d.protein === 'beef' || d.protein === 'game') && d.intensity >= 5 && (w.style === 'white' || w.style === 'rose' || w.style === 'sparkling')) {
    add(f, 'style.light_with_red_meat', -6);
  }

  // 11. Flavour intensity: a quiet wine disappears next to a loud dish.
  if (w.aromatic < d.intensity - 2) add(f, 'aroma.quiet', -4);

  // 12. Classic affinities (sommelier knowledge).
  for (const a of AFFINITIES[d.protein]) {
    if (a.match(wine, dish)) add(f, `affinity.${d.protein}`, a.delta, a.why);
  }

  const raw = BASE_SCORE + f.reduce((s, x) => s + x.delta, 0);
  const score = Math.max(0, Math.min(99, Math.round(raw)));
  return { score, factors: f, why: explain(f, wine, locale) };
}

/**
 * Builds the guest-facing "Why it works" sentence from the two strongest positive factors, in the given
 * language (English by default: the public API never passes one). A missing Polish phrase falls back to English.
 */
export function explain(factors: Factor[], wine: Wine, locale: Locale = 'en'): string {
  const positives = factors
    .filter((x) => x.delta > 0 && x.why)
    .sort((a, b) => b.delta - a.delta || a.rule.localeCompare(b.rule))
    .slice(0, 2)
    .map((x) => (locale === 'pl' ? x.whyPl ?? x.why : x.why) as string);
  if (positives.length === 0) {
    return locale === 'pl'
      ? `Wszechstronne, zrównoważone ${styleWord(wine, 'pl')}, które dobrze pasuje do tego dania.`
      : `A balanced, food-friendly ${styleWord(wine)} for this dish.`;
  }
  const joiner = locale === 'pl' ? ', a ' : ', and ';
  const sentence = positives.length === 2 ? `${positives[0]}${joiner}${positives[1]}.` : `${positives[0]}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

const STYLE_WORDS: Record<Wine['profile']['style'], Localized> = {
  sparkling: { en: 'sparkling wine', pl: 'wino musujące' },
  white: { en: 'white wine', pl: 'wino białe' },
  rose: { en: 'rosé', pl: 'wino różowe' },
  orange: { en: 'orange wine', pl: 'wino pomarańczowe' },
  red: { en: 'red wine', pl: 'wino czerwone' },
  sweet: { en: 'dessert wine', pl: 'wino deserowe' }
};

export function styleWord(w: Wine, locale: Locale = 'en'): string {
  return STYLE_WORDS[w.profile.style][locale];
}
