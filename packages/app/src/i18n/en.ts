import type { CookingMethod, EngineFacts, ImportIssueCode, ProteinType, Role, SetupStepKey } from '@wine-match/core';

/** Values quoted in an import issue (`ImportIssue.params`): the cell text, the guessed style, a row number. */
export type IssueParams = Readonly<Record<string, string | undefined>>;

/**
 * What an explanation needs to know about the restaurant (spec 2026-10-16-how-it-works-explanations, R6): the live
 * guest settings and the name of the person who signs the pairings. The engine's numbers come separately, always
 * from `ENGINE_FACTS` (R4) — never as a literal in a text.
 */
/** The numbers the "Guest usage" explanation states: the KPI window and the smallest sample with a change (E04). */
export interface UsageExplainFacts {
  days: number;
  minSample: number;
}

export interface ExplainContext {
  /** the restaurant shows match percentages (otherwise only the glass) */
  showScores: boolean;
  /** engine picks fill the places the sommelier has not decided (otherwise only the sommelier's pairings) */
  showUnreviewed: boolean;
  /** `restaurant.wineDirector`; may be empty */
  director: string;
}

/** G0 and the "How we pick your wine" page (G12) also name the restaurant. */
export interface RestaurantExplainContext extends ExplainContext {
  /** `restaurant.name` */
  restaurant: string;
}

/**
 * One section of the "How we pick your wine" page (G12): a heading, its paragraphs, an optional list and a closing
 * sentence after the list. `id` names the section for tests (`data-section`).
 */
export interface HowItWorksSection {
  id: 'list' | 'sommelier' | 'rules' | 'score' | 'table' | 'choices' | 'fair';
  title: string;
  text: string[];
  points?: string[];
  after?: string;
}

/** The G7 explanation: the score shown for this wine, if any, and the dish it belongs to. */
export interface WineExplainContext {
  /** the Match Score on screen, or null when the screen shows none (no dish, from the table, not suggested) */
  score: number | null;
  /** the dish the guest came from, if any */
  dish: string | null;
  showScores: boolean;
}

/**
 * The "works with n of m dishes" line of a table bottle (spec 2026-10-16-whole-table-waiter-path, R12): the engine's
 * `table.fit` with the weaker dishes already named, weakest first. The dictionary picks the sentence; screens only show it.
 */
export interface TableFitText {
  fits: number;
  of: number;
  /** names of the dishes it suits less, weakest first */
  weaker: string[];
  /** one bottle is a compromise for this table (the test behind "Or by the glass") */
  compromise: boolean;
}

/** Up to three weaker dishes by name, then how many more (R12). */
const weakerNamesEn = (names: string[]) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} ${names.length - 3 === 1 ? 'other' : 'others'}`;

/** A share of the table score as a whole percentage (0.6 → 60). */
const pct = (weight: number) => Math.round(weight * 100);

/**
 * How much wine for the table (spec whole-table-waiter-path, F4, R16): `table.quantity` for the chosen number of people,
 * with the total already formatted. Only shown after an explicit choice (`table.people_default`, owner's decision Q4).
 */
export interface TableQuantityText {
  people: number;
  bottles: number;
  glasses: number;
  /** the total price, formatted (`formatPrice`) */
  total: string;
}

/**
 * The point E08 F4 adds to the table explanations (G5, G6, G11): the amount per person, if everyone drinks the same wine
 * (spec whole-table-waiter-path, UI/UX, Q3, Q4). G11 adds how the glasses top up the bottles.
 */
const quantityPointEn = (f: EngineFacts) => `Amount: about ${f.tableMlPerPerson} ml a person, if everyone drinks the same wine.`;
const quantityGlassesEn = (f: EngineFacts) =>
  `Up to ${f.tableMaxExtraGlasses} glasses top up the full bottles instead of another bottle; no amount until you choose how many people drink.`;

const directorEn = (name: string) => name.trim() || 'the restaurant’s sommelier';

/** G3 point 5 and the G4 sheet: hard filters leave wines out, soft ones reorder, the budget fallback. */
const filterPointsEn = (f: EngineFacts) => [
  '“By the glass”, colour and budget leave wines out; body and mood reorder them, sometimes off the list.',
  `With nothing in budget, we say so and show the ${f.budgetFallbackCount} best-matching wines above it.`
];

/**
 * English interface texts: the source of the keys (spec 2026-10-15-polish-language, R6). `pl.ts` must
 * `satisfies Dictionary`, so a missing Polish key is a TypeScript error. Texts with values are functions.
 * Restaurant content (dish and wine names, notes) never goes through here.
 */
export const en = {
  common: {
    language: 'Language',
    languageNames: { pl: 'Polski', en: 'English' },
    languageShort: { pl: 'PL', en: 'EN' },
    back: 'Back',
    close: 'Close'
  },
  guest: {
    meta: {
      description: 'Find the wine for what you are eating tonight, from the restaurant’s own list.',
      menu: 'Menu',
      wines: 'Wines for your dish',
      wine: 'Wine',
      selected: 'Your wine',
      table: 'Pair for the table',
      tableResult: 'Best wine for your table',
      staff: 'Pairing lookup',
      staffTable: 'Whole table — staff',
      howItWorks: 'How we pick your wine'
    },
    categories: { Starters: 'Starters', Mains: 'Mains', Desserts: 'Desserts' },
    hero: {
      promise: 'Find the wine for what you’re eating tonight, from our own list.',
      wineListBy: (name: string) => `Wine list by ${name}`,
      directorLine: 'The Wine Director’s pairings always lead a dish’s list.',
      staffLink: 'For staff: quick pairing lookup',
      /** the link to G12 (not the same words as the G0 explanation's question) */
      howLink: 'More on how we pick wines',
      tableAction: 'Pair a bottle for the table',
      restaurant: 'Restaurant'
    },
    landing: {
      tableCardTitle: 'Several dishes on the table?',
      tableCardText: 'We’ll find one bottle for all of them and tell you honestly where it’s weaker.',
      tableCardAction: 'Find a bottle for the table',
      pickDish: 'Pick your dish',
      pickDishLead: 'We’ll show the wines from our list that go with it.',
      menuUpdating: 'Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.'
    },
    menu: {
      updatingTitle: 'Tonight’s menu is being updated',
      updatingText: 'Your waiter can suggest a wine in the meantime.',
      pickLead: 'Pick the dish you’re ordering.',
      sections: 'Menu sections',
      sommelierAvailable: 'Sommelier’s pairing',
      mode: 'Pairing mode',
      oneDish: 'One dish',
      wholeTable: 'Whole table',
      aside: 'Menu'
    },
    prefs: {
      quick: 'Quick preferences',
      more: 'More…',
      moreCount: (n: number) => `More · ${n}`,
      glass: 'By the glass',
      bottle: 'By the bottle',
      glassOrBottle: 'Glass or bottle',
      either: 'Either',
      colour: 'Colour or style',
      budget: 'Budget',
      budgetPerGlass: 'Budget per glass',
      any: 'Any',
      upTo: (price: string) => `Up to ${price}`,
      body: 'Body',
      noPreference: 'No preference',
      lighter: 'Lighter',
      fuller: 'Fuller',
      mood: 'Mood',
      classic: 'Classic',
      adventurous: 'Adventurous'
    },
    wines: {
      refine: 'Refine',
      closeFilters: 'Close filters',
      reset: 'Reset',
      show: (n: number) => `Show ${n} ${n === 1 ? 'wine' : 'wines'}`,
      noneTitle: 'No wine fits all your choices',
      noneFiltered: 'Try fewer filters, or a different budget.',
      noneYet: 'Our sommelier is still preparing pairings for this dish. Your waiter can help.',
      clearFilters: 'Clear filters',
      alsoGood: 'Also good with this dish',
      recommended: 'Recommended for your dish',
      sommelierPairing: 'Sommelier’s pairing',
      bestValue: 'Best value',
      match: 'match',
      /** accessible name of the match glass */
      matchLabel: (n: number) => `Match ${n} percent`,
      /** accessible name of the glass when the restaurant hides percentages: no number */
      glassLabel: 'Match shown by how full the glass is',
      glassPrice: (price: string) => `Glass ${price}`,
      bottlePrice: (price: string) => `Bottle ${price}`,
      nonVintage: 'non-vintage',
      /** the trust note under the wines (Q5): true to the `showUnreviewed` setting */
      footer: (restaurant: string, director: string, showUnreviewed: boolean) => showUnreviewed
        ? `Every wine comes from ${restaurant}’s list. Wines with the seal are recommended by ${directorEn(director)}; the others are matched by our pairing rules.`
        : `Every wine comes from ${restaurant}’s list and is recommended by ${directorEn(director)}.`
    },
    /**
     * "How it works" explanations, one per screen (spec 2026-10-16-how-it-works-explanations). Numbers only from the
     * `facts` parameter (`ENGINE_FACTS`), variants from the live settings. Other specs add their paragraphs to the same
     * screen key instead of a second explanation (Q15).
     */
    explain: {
      wines: {
        summary: 'Why these wines?',
        points: (f: EngineFacts, c: ExplainContext) => [
          `Sommelier’s pairing: chosen for this dish by ${directorEn(c.director)}; always listed first.`,
          ...(c.showUnreviewed
            ? [`Recommended for your dish: matched by pairing rules (body, acidity, sweetness, tannin, spice, classic pairings); ${c.showScores ? `shown from ${f.minModelScore}%.` : 'only good fits are shown.'}`]
            : []),
          c.showScores
            ? `The percentage (0–${f.maxScore}%) rates the wine’s fit with the dish. A sommelier’s choice changes the order, not the number; price never raises it.`
            : 'A fuller glass means a better fit. A sommelier’s choice changes the order, not the rating; price never raises it.',
          `Best value: the sommelier’s value pick, or the cheapest bottle priced below the first${c.showScores ? `, within ${f.bestValueWindow} points of the top wine` : ', fitting almost as well as the top wine'}.`,
          filterPointsEn(f).join(' ')
        ]
      },
      filters: {
        summary: 'How do the filters work?',
        points: (f: EngineFacts) => filterPointsEn(f)
      },
      /** G0, under "Pick your dish" (no explanation without a published menu; the link to G12 stays). */
      landing: {
        summary: 'How do we pick your wine?',
        points: (f: EngineFacts, c: RestaurantExplainContext) => [
          `Pick a dish and we show up to ${f.dishLimit} wines from ${c.restaurant}’s list that go with it.`,
          `Wines with the seal are sommelier’s pairings, recommended by ${directorEn(c.director)}.`,
          ...(c.showUnreviewed ? ['The others are matched by our pairing rules.'] : []),
          'No producer pays to be listed.'
        ]
      },
      /** G1, under "Pick the dish you’re ordering": the seal next to a dish. */
      menu: {
        summary: 'What does the seal next to a dish mean?',
        points: (c: Pick<ExplainContext, 'showUnreviewed'>) => [
          'The sommelier has already chosen a wine for this dish: you’ll see it first (unless your filters, such as “By the glass”, leave it out).',
          c.showUnreviewed
            ? 'For the other dishes we match wines from the list by our pairing rules.'
            : 'For the other dishes we show only wines the sommelier has already approved; if there are none yet, your waiter will gladly help.'
        ]
      },
      /** G5, under the lead: how one bottle is chosen for several dishes. */
      table: {
        summary: 'How do we pick one bottle for the table?',
        points: (f: EngineFacts) => [
          `We rate every wine on the list with each dish you tick; mains count more (×${f.tableMainsWeight}).`,
          'The average counts, and so does the weakest dish: we’d rather pick a bottle good with everything than great with one dish and poor with the rest.',
          'Desserts are paired separately (unless the table orders only desserts).',
          `Only wines in your colour and budget count; if no bottle fits the budget, we say so and show the ${f.budgetFallbackCount} best-matching ones above it.`,
          quantityPointEn(f)
        ]
      },
      /**
       * G6: E08's paragraph about the table bottle (spec whole-table-waiter-path, R11) and E07's points (phase 2) in one
       * explanation (E07 Q15): bars are each dish's raw score, the sommelier's bonus is in the overall match only, and
       * when a glass per dish is suggested. No "%" when the restaurant hides percentages.
       */
      tableResult: {
        summary: 'How is the overall match worked out?',
        points: (f: EngineFacts, c: Pick<ExplainContext, 'showScores'>) => c.showScores
          ? [
              `Bars show each dish’s own match. Overall is ${pct(f.tableMeanWeight)}% the average (mains ×${f.tableMainsWeight}) plus ${pct(f.tableMinWeight)}% the weakest dish.`,
              `“Works with” means at least ${f.tableFitThreshold}%; a pairing the sommelier rejected never counts. Desserts are paired separately.`,
              `A sommelier’s pairing has the seal and adds ${f.tableSommelierBonus} points to the overall match, not the dish’s percentage; a rejected one counts ${f.tableRejectedCap}% at most.`,
              `Below ${f.compromiseThreshold}% overall, or ${f.weakDishThreshold}% for the weakest dish, we also suggest a glass for each dish.`,
              quantityPointEn(f)
            ]
          : [
              'Bars show each dish’s own match. The bottle is chosen on the dishes’ average (mains count more) and the weakest dish.',
              '“Works with” means a good fit for that dish; a pairing the sommelier rejected never counts. Desserts are paired separately.',
              'A sommelier’s pairing has the seal and lifts the bottle a little, not the dish’s bar; a rejected one pulls it down hard.',
              'When one bottle is a compromise, we also suggest a glass for each dish.',
              quantityPointEn(f)
            ]
      },
      /** G9, under the lead. The waiter always sees the percentage, also when guests do not. */
      staff: {
        summary: 'Why this order?',
        points: (f: EngineFacts, c: Pick<ExplainContext, 'showUnreviewed'>) => [
          c.showUnreviewed
            ? `Same order as the guest sees: the sommelier’s first choice, then the sommelier’s other pairings in their set order, then wines matched by pairing rules (from ${f.minModelScore}%). Up to ${f.dishLimit} wines.`
            : `Same order as the guest sees: the sommelier’s first choice, then the sommelier’s other pairings in their set order; the restaurant shows no other wines. Up to ${f.dishLimit} wines.`,
          'The percentage rates the fit with the dish; a sommelier’s pairing gets no higher percentage. You always see it, even when guests don’t.',
          '“Say:” is the sommelier’s note, or the reason from the pairing rules.',
          'Filters work as for the guest.',
          // spec 2026-10-16-recommendation-code, G9: the one "i" of the screen also explains marking a code
          '“Order from a code” marks the guest’s wine as ordered (undo is possible). Only today’s codes work.'
        ]
      },
      /**
       * G8, under the choice and the code: what happens next (the choice is not an order). When a code is shown, the page
       * adds `guest.selected.code.explain` as the last point (spec 2026-10-16-recommendation-code, G8) — one "i" (Q15).
       */
      selected: {
        summary: 'What happens next?',
        points: [
          'Choosing a wine is not an order, and you pay nothing in the app.',
          'Show this screen to your waiter, who will take your order.'
        ]
      },
      /**
       * G11, the waiter's whole table (spec 2026-10-16-whole-table-waiter-path, R11, UI/UX): the screen's one
       * explanation. Numbers from ENGINE_FACTS; no promise of "first in the order" (a table has no tiers).
       */
      staffTable: {
        summary: 'How is the table bottle chosen?',
        points: (f: EngineFacts) => [
          `Each dish gets its own match. The table score combines the average (${pct(f.tableMeanWeight)}%, mains ×${f.tableMainsWeight}) with the weakest dish (${pct(f.tableMinWeight)}%), so the bottle isn’t great with one dish and poor with another.`,
          `“Works with” means at least ${f.tableFitThreshold}%; a pairing the sommelier rejected never counts. Desserts are paired separately.`,
          `A sommelier’s pairing has the seal and adds ${f.tableSommelierBonus} points to the table score, not to the dish’s percentage; a rejected one counts as ${f.tableRejectedCap}% at most.`,
          `Below ${f.compromiseThreshold}% for the table, or ${f.weakDishThreshold}% for the weakest dish, we also suggest a glass for each dish.`,
          `${quantityPointEn(f)} ${quantityGlassesEn(f)}`
        ]
      },
      wine: {
        summary: 'What does this score mean?',
        points: (c: WineExplainContext) => [
          c.score === null
            ? c.dish === null
              ? 'There is no rating here: we only rate a wine against a particular dish.'
              : `This wine is not among the wines we suggest for “${c.dish}”, so there is no rating here.`
            : c.showScores
              ? `${c.score}% rates how well this wine suits “${c.dish ?? ''}”. The box above says why: the sommelier’s own words (signed) or the pairing rules that decided.`
              : `The glass shows how well this wine suits “${c.dish ?? ''}”: the fuller, the better. The box above says why: the sommelier’s own words (signed) or the pairing rules that decided.`,
          'The dots show the wine’s profile on a 0–5 scale, from the restaurant’s description of the wine.'
        ]
      }
    },
    wine: {
      unavailableTitle: 'This wine is no longer available',
      unavailableText: 'It may have sold out tonight. Your other matches are still waiting.',
      seeOther: 'See other wines',
      director: (name: string) => `${name}, Wine Director`,
      whyWith: (dish: string) => `Why it works with the ${dish.toLowerCase()}`,
      region: 'Region',
      vintage: 'Vintage',
      nonVintage: 'Non-vintage',
      grapes: 'Grapes',
      style: 'Style',
      abv: (style: string, alcohol: number) => `${style}, ${alcohol}% abv`,
      body: 'Body',
      acidity: 'Acidity',
      tannin: 'Tannin',
      sweetness: 'Sweetness',
      dots: (n: number) => `${n} of 5`,
      howServed: 'How would you like it?',
      glass: (ml: number) => `Glass, ${ml} ml`,
      bottle: (ml: number) => `Bottle, ${ml} ml`,
      bottleOnly: 'Bottle only',
      notByGlass: 'Not poured by the glass',
      choose: 'Choose this wine'
    },
    selected: {
      unavailableText: 'It may have sold out tonight. Please choose another.',
      backToMenu: 'Back to menu',
      showWaiter: 'Show this to your waiter.',
      listNo: (n: number) => `List no. ${n}`,
      oneGlass: (ml: number, price: string) => `1 glass, ${ml} ml, ${price}`,
      oneBottle: (ml: number, price: string) => `1 bottle, ${ml} ml, ${price}`,
      withDish: (dish: string) => `With the ${dish.toLowerCase()}`,
      forTable: 'For the table',
      pairAnother: 'Pair another dish',
      done: 'Done',
      /** the recommendation code (spec 2026-10-16-recommendation-code, G8) */
      code: {
        title: 'Code for your waiter',
        hint: 'Show it to your waiter with the wine.',
        /** what a screen reader says: the characters one by one */
        spoken: (code: string) => code.split('').join(', '),
        unavailable: 'Code unavailable — name the wine to your waiter.',
        /**
         * The last point of the screen's one explanation (`guest.explain.selected`, E07 Q15), only when a code is shown;
         * the code block has no "i" of its own.
         */
        explain: 'The code links this wine to the recommendation, so the restaurant knows what guests enjoy. It holds no information about you.'
      }
    },
    table: {
      lead: 'Tick everything your table is ordering. We’ll find one bottle that works across all of it.',
      colourAndBudget: 'Colour and budget',
      budgetPerBottle: 'Budget per bottle',
      submit: 'Find a bottle for the table',
      countInitial: (min: number) => `Choose at least ${min} dishes`,
      countNone: 'No dishes selected',
      countOne: (n: number) => `${n} dish selected, add one more`,
      countMany: (n: number) => `${n} dishes selected`
    },
    tableResult: {
      needTwoTitle: 'Add at least two dishes',
      needTwoText: 'A table pairing needs two or more dishes. For a single dish, use the menu.',
      chooseDishes: 'Choose dishes',
      title: 'Best wine for your table',
      dishes: (n: number, names: string) => `${n} dishes: ${names}`,
      dessertsApart: (names: string) => `Desserts are paired separately. Tap ${names} in the menu after your mains.`,
      or: ' or ',
      noneTitle: 'No bottle fits these filters',
      noneText: 'Try another colour or budget.',
      changePrefs: 'Change preferences',
      recommended: 'Recommended for your table',
      sommelierPairing: 'Sommelier’s pairing',
      overall: 'Overall match',
      others: 'Other bottles that work',
      splitTitle: 'Or by the glass, dish by dish',
      splitText: 'These dishes pull in different directions, so a glass each may suit you better.'
    },
    /** "Works with n of m dishes" (spec whole-table-waiter-path, R12): G6 now, G11 with phase 2. */
    tableFit: {
      line: (f: TableFitText) => {
        if (f.of === 1) return f.fits === 1 ? 'Works with this dish.' : `Less of a match for: ${f.weaker[0] ?? ''}.`;
        if (f.fits === 0) return `Not a strong match for any of the ${f.of} dishes.`;
        if (f.fits < f.of) return `Works with ${f.fits} of ${f.of} dishes, less so with: ${weakerNamesEn(f.weaker)}.`;
        const all = f.of === 2 ? 'Works with both dishes' : `Works with all ${f.of} dishes`;
        return f.compromise ? `${all}, though it’s a compromise.` : `${all}.`;
      }
    },
    /** How much wine for the table (spec whole-table-waiter-path, F4, R16): G5, G6, G11 and G8 "For the table". */
    tableQuantity: {
      question: 'How many people are drinking wine?',
      /** the "not saying" option of the form (no quantity: there is no default, Q4) */
      skip: 'Skip',
      /** the label of the last option, which stands for 10 people */
      more: '8+',
      /** under the result before a choice: no amount is shown until someone picks a number (Q4) */
      hint: 'Choose how many people are drinking to see how much wine to order.',
      /** the accessible name of one number link */
      peopleLabel: (n: number) => `${n} people`,
      line: (q: TableQuantityText) =>
        `For ${q.people} people: ${q.bottles} ${q.bottles === 1 ? 'bottle' : 'bottles'}${q.glasses > 0 ? ` + ${q.glasses} ${q.glasses === 1 ? 'glass' : 'glasses'}` : ''} · ${q.total}`
    },
    staff: {
      title: 'Pairing lookup',
      lead: 'For the floor team. Same pairings the guest sees, ordered by the Wine Director’s picks.',
      dish: 'Dish',
      show: 'Show',
      nothingTitle: 'Nothing fits',
      nothingText: 'Relax the budget or colour.',
      firstChoice: 'Sommelier’s pairing · first choice',
      pick: 'Sommelier’s pairing',
      matchPct: (n: number) => `${n}% match`,
      listNo: (n: number) => `no. ${n}`,
      say: (why: string) => `Say: “${why}”`,
      noDishesTitle: 'No dishes on the menu',
      noDishesText: 'The menu is being updated.',
      /** "Order from a code" (spec 2026-10-16-recommendation-code, phase 2, R6, R7): find the guest's code, mark it ordered */
      code: {
        title: 'Order from a code',
        label: 'Code from the guest’s screen',
        find: 'Find',
        /** one answer for an unknown, foreign, yesterday's or malformed code (R6: no hint that it existed) */
        notFound: (code: string) => `There is no code ${code} today in this restaurant. Check the characters on the guest’s screen.`,
        forDish: (dish: string) => `Dish: ${dish}`,
        forTable: (dishes: string) => `For the table: ${dishes}`,
        noDish: 'Chosen without a dish',
        dishOffMenu: 'Dish not on the current menu',
        wineGone: 'Wine no longer on the list',
        issuedAt: (code: string, time: string) => `Code ${code}, shown at ${time}`,
        confirm: 'Ordered',
        markedAt: (time: string) => `Marked at ${time}`,
        undo: 'Undo',
        confirmed: 'Marked as ordered.',
        undone: 'Mark removed.'
      }
    },
    /** G11, the waiter's whole table (spec 2026-10-16-whole-table-waiter-path, R5–R7). */
    staffTable: {
      title: 'Whole table',
      lead: 'Tick the table’s dishes and show the bottle. Same pairings the guest sees.',
      search: 'Find a dish',
      dessertsApart: 'paired separately',
      colour: 'Colour',
      submit: 'Show the bottle',
      needTwo: 'Tick at least two dishes.',
      truncated: (n: number) => `We worked out the first ${n} dishes.`,
      /** the sentence the waiter reads to the table, with the wine-list number when there is one (R6) */
      thisBottle: (listNumber: number | undefined, name: string) => listNumber === undefined ? `This bottle: ${name}.` : `This bottle: No. ${listNumber} ${name}.`,
      others: 'Other bottles',
      listNo: (n: number) => `No. ${n}`,
      fitsOf: (fits: number, of: number) => `${fits} of ${of}`,
      choose: 'Choose this one',
      dessertsNote: (names: string) => `Desserts are paired separately: ${names}.`,
      changeTable: 'Change the table',
      newTable: 'New table',
      nothingTitle: 'Nothing fits',
      nothingText: 'Change the colour, or leave it open.',
      /** the recommendation code next to the bottle (E09, `source: 'staff'`) */
      code: {
        title: 'Code',
        hint: 'Put it in the order comment.',
        spoken: (code: string) => code.split('').join(', '),
        unavailable: 'No code for this one — order as usual.'
      }
    },
    notFound: {
      title: 'This menu isn’t available',
      text: 'The link doesn’t match a restaurant or a dish on tonight’s menu. Scan the QR code on your table again or ask your waiter.',
      action: 'Open the menu'
    },
    /**
     * G12 "How we pick your wine" (spec 2026-10-16-how-it-works-explanations, R9): the long, calm version. Numbers from
     * `facts` (ENGINE_FACTS), variants from the live settings, at most 350 words in every variant.
     */
    howItWorks: {
      title: 'How we pick your wine',
      lead: (restaurant: string) => `In plain words: how ${restaurant} suggests a wine for your dish.`,
      back: 'Back to the menu',
      sections: (f: EngineFacts, c: RestaurantExplainContext): HowItWorksSection[] => [
        {
          id: 'list',
          title: `Only from ${c.restaurant}’s list`,
          text: [`Every wine we suggest is on ${c.restaurant}’s own wine list and available tonight. We show up to ${f.dishLimit} wines for a dish.`]
        },
        {
          id: 'sommelier',
          title: 'The sommelier has the last word',
          text: [`A wine with the seal is a sommelier’s pairing: recommended for that dish by ${directorEn(c.director)} and always first on the dish’s list. A wine the sommelier rejected for a dish is never suggested with it; for the whole table, a rejection only pulls the bottle down hard.`]
        },
        ...(c.showUnreviewed
          ? [{
              id: 'rules' as const,
              title: 'Pairing rules',
              text: [c.showScores
                ? `Where the sommelier hasn’t chosen yet, wines are matched by pairing rules and shown from ${f.minModelScore}%. The main rules:`
                : 'Where the sommelier hasn’t chosen yet, wines are matched by pairing rules, and only good fits are shown. The main rules:'],
              points: [
                'the wine’s body suits the strength of the dish;',
                'fresh acidity with rich, fatty dishes;',
                'with dessert, a wine at least as sweet as the dessert; with savoury dishes, a dry one;',
                'gentle tannins with fish and seafood;',
                'with spicy dishes, less alcohol, and a touch of sweetness helps;',
                'classic pairings, such as pinot noir with duck.'
              ],
              after: 'The same dish and wine always get the same result.'
            }]
          : []),
        c.showScores
          ? { id: 'score', title: 'What the percentage means', text: [`The percentage (0–${f.maxScore}%) rates how well a wine suits the dish. A sommelier’s choice changes the order, not the number.`] }
          : { id: 'score', title: 'What the glass means', text: ['The fuller the glass, the better the wine suits the dish. A sommelier’s choice changes the order, not the rating.'] },
        {
          id: 'table',
          title: 'The whole table',
          text: [`For several dishes we look for one bottle that works with all of them: the average counts (mains ×${f.tableMainsWeight}), and so does the weakest dish. The bottle comes from the whole list; desserts are paired separately (unless the table orders only desserts). When one bottle is a compromise, we also suggest a glass for each dish.`]
        },
        {
          id: 'choices',
          title: 'Your choices',
          text: ['“By the glass”, colour and budget leave wines out; body and mood change the order. If nothing fits your budget, we say so and show the best-matching wines above it.']
        },
        {
          id: 'fair',
          title: 'Fair to you',
          text: ['Price never raises a wine’s rating. No producer pays to be listed. You don’t need an account.']
        }
      ]
    }
  },
  admin: {
    meta: {
      titleTemplate: '%s | Wine Match dashboard',
      dashboard: 'Dashboard',
      signIn: 'Sign in',
      menu: 'Menu',
      dish: 'Dish',
      wines: 'Wine list',
      wine: 'Wine',
      pairings: 'Pairings',
      review: 'Review queue',
      publish: 'Publish',
      qr: 'QR code',
      setup: 'Setup',
      importMenu: 'Import menu',
      importWines: 'Import wine list',
      importSales: 'Import sales',
      opportunities: 'Opportunities'
    },
    language: {
      label: 'Dashboard language'
    },
    roles: { owner: 'Owner', manager: 'General Manager', sommelier: 'Wine Director', waiter: 'Waiter' } as Record<Role, string>,
    categories: { Starters: 'Starters', Mains: 'Mains', Desserts: 'Desserts' } as Record<string, string>,
    proteins: {
      beef: 'beef', game: 'game', poultry: 'poultry', pork: 'pork', fish: 'fish', shellfish: 'shellfish',
      vegetable: 'vegetables', mushroom: 'mushrooms', dairy: 'dairy', dessert: 'dessert'
    } as Record<ProteinType, string>,
    cooking: {
      raw: 'raw', cured: 'cured', poached: 'poached', seared: 'seared', roasted: 'roasted', grilled: 'grilled',
      braised: 'braised', fried: 'fried', baked: 'baked', none: 'none'
    } as Record<CookingMethod, string>,
    common: {
      never: 'Never',
      nonVintage: 'Non-vintage',
      filter: 'Filter',
      clear: 'Clear',
      scale: 'Scale 0–5',
      levelOf: (n: number) => `${n} of 5`,
      matchPercent: (n: number) => `Match ${n} percent`,
      engineScore: 'Engine match score',
      wineRemoved: 'Wine removed',
      viewAsGuest: 'View as guest',
      openGuestApp: 'Open guest app',
      lastPublished: (when: string) => `Last published ${when}`
    },
    nav: {
      label: 'Dashboard',
      dashboard: 'Dashboard',
      menu: 'Menu',
      wines: 'Wine list',
      pairings: 'Pairings',
      review: 'Review queue',
      opportunities: 'Opportunities',
      publish: 'Publish',
      restaurant: 'Restaurant',
      importMenu: 'Import menu',
      importWines: 'Import wines',
      importSales: 'Import sales',
      setup: 'Setup',
      qr: 'QR code',
      signOut: 'Sign out'
    },
    login: {
      brandTitle: 'Your list. Your pairings.',
      brandText: 'Review the pairings guests see, keep the wine list current and follow how your tables order wine.',
      brandFooter: 'For restaurant teams',
      title: 'Sign in',
      description: 'Use your work e-mail.',
      email: 'Work e-mail',
      password: 'Password',
      submit: 'Sign in',
      errors: {
        invalid_credentials: 'The e-mail or password is incorrect, or the account is temporarily locked.',
        no_panel_access: 'This account has no access to the dashboard. Waiters use the pairing lookup instead.',
        unexpected: 'Sign-in failed. Try again in a moment.'
      } as Record<'invalid_credentials' | 'no_panel_access' | 'unexpected', string>
    },
    forbidden: {
      title: 'No access',
      text: 'Your account has no access to this restaurant’s dashboard. Ask the owner to add you, or sign in with another account.',
      back: 'Back'
    },
    notFound: {
      title: 'Not found',
      text: 'This restaurant, dish or wine doesn’t exist. It may have been removed in a recent import.',
      back: 'Back to the dashboard'
    },
    error: {
      title: 'This page didn’t load',
      text: 'Something went wrong while loading the data. Guests are not affected. Try again in a moment.',
      retry: 'Try again'
    },
    loading: 'Loading the page',
    flash: {
      notSaved: 'Not saved',
      viewOnly: 'View only',
      saved: {
        approved: () => 'Pairing approved.',
        rejected: () => 'Pairing rejected. It won’t be recommended with this dish once you publish.',
        restored: () => 'Pairing restored as a suggestion.',
        role: () => 'Role updated.',
        note: () => 'Note saved.',
        moved: () => 'Order updated.',
        added: () => 'Pairing added.',
        deleted: () => 'Pairing deleted.',
        approved_all: (n: number) => `${n} pairings approved.`,
        wine_shown: () => 'The wine is back on the list. Guests can see it now.',
        wine_hidden: () => 'The wine is hidden from guests. They no longer see it.',
        published: (n: number) => `Published version ${n}. Guests see the changes now.`,
        settings: () => 'Setting saved. It applies to guests right away.',
        import_uploaded: () => 'File read. Check the rows below, correct what needs it, then import.',
        import_checked: () => 'Rows checked again.',
        imported: (created: number, updated: number, suggestions: number) => `Imported: ${created} new, ${updated} updated. ${suggestions} engine suggestions are ready for review.`,
        import_cancelled: () => 'Import cancelled. Nothing was changed.',
        imported_sales: (created: number, replaced: number, skipped: number) => `Saved ${created} lines, replaced ${replaced} checks, skipped ${skipped}.`,
        details: () => 'Details saved.',
        details_slug: () => 'Details saved. The address of your guest app changed: print new QR codes, the old ones no longer work.',
        suggestions: (n: number) => `${n} engine suggestions added.`,
        translations: () => 'Translations saved. Guests see them after you publish.',
        content: () => 'Content language and translations saved. Guests see them after you publish.',
        suggestion_added: () => 'Added to suggestions — approve it in “Engine suggestions”. Guests see the change only after you approve it and publish.',
        opportunity_dismissed: (days: number) => `Opportunity ignored. It comes back after ${days} days at the earliest if it still applies.`,
        opportunity_restored: () => 'Opportunity restored.'
      },
      errors: {
        version_conflict: 'This pairing was changed by someone else a moment ago. The page now shows the latest version, please try again.',
        forbidden: 'You don’t have permission to do that.',
        comment_too_long: 'The note can have at most 140 characters.',
        already_paired: 'This wine is already paired with the dish.',
        wine_required: 'Choose a wine to pair.',
        wine_not_available: 'This wine is hidden from guests. Show it on the wine list first.',
        invalid_role: 'Choose primary, alternative or best value.',
        primary_is_pinned: 'The primary pairing always stays first.',
        cannot_move: 'This pairing cannot move further in that direction.',
        not_rejected: 'Only a rejected pairing can be restored.',
        pairing_rejected: 'Restore the pairing first.',
        only_manual_pairings_can_be_deleted: 'Engine pairings can be rejected, not deleted.',
        nothing_to_publish: 'There are no unpublished changes.',
        multiple_primary: 'A dish can have only one primary pairing.',
        duplicate_pairing: 'A dish and a wine can be paired only once.',
        not_found: 'That item no longer exists.',
        no_file: 'Choose a file to upload.',
        file_too_large: 'The file is larger than 10 MB, or too large once unpacked.',
        empty_file: 'The file is empty or has no data.',
        unsupported_format: 'This kind of file is not supported. Upload a CSV, Excel (.xlsx) or PDF file.',
        legacy_xls: 'Old Excel files (.xls) are not supported. Save the file as .xlsx or CSV and upload it again.',
        format_mismatch: 'The file is not what its name says (for example a text file named .xlsx). Export it again from your system.',
        corrupt_file: 'The file could not be opened. It may be damaged or password-protected. Try saving it again, or use CSV.',
        scanned_pdf: 'This PDF has no text (it looks like a scan or a photo). Reading images is not supported: export a CSV or Excel file from your system.',
        too_many_rows: 'The file has more than 2000 rows. Split it and import in parts.',
        no_rows: 'The file has a header but no rows.',
        job_closed: 'This import is already finished. Start a new one.',
        no_rows_selected: 'Tick at least one row to import.',
        unknown_row: 'That row does not exist in this import.',
        invalid_kind: 'Import the menu, the wine list or sales.',
        no_header: 'The file is missing columns the sales import needs: date, check number, item type, quantity and net amount.',
        no_complete_checks: 'No check can be saved: each ticked line belongs to a check with an unticked line or an error.',
        slug_taken: 'Another restaurant already uses this address name. Choose another.',
        validation_failed: 'Check the details. The address name can use only lowercase letters, digits and hyphens (2 to 40 characters) and must not be a reserved word.',
        translation_invalid: 'Check the translations: one of them is too long.',
        already_suggested: 'This wine is already among the suggestions for this dish.',
        already_rejected: 'This pairing was rejected — restore it in the Rejected section.',
        dish_not_published: 'This dish is not visible to guests.',
        low_match: 'This wine is a weak match for the dish.',
        opportunity_stale: 'This opportunity no longer applies.',
        opportunity_not_dismissed: 'This opportunity is not ignored.',
        unexpected: 'The change could not be saved. Nothing was changed; try again.'
      }
    },
    badges: {
      published: 'Published',
      draft: 'Draft',
      hidden: 'Hidden',
      confirmed: 'Confirmed',
      draftProfile: 'Draft, needs check',
      active: 'Active',
      hiddenFromGuests: 'Hidden from guests',
      status: { approved: 'Sommelier approved', modified: 'Sommelier modified', suggested: 'Suggested', rejected: 'Rejected' },
      roles: { primary: 'Primary', alternative: 'Alternative', best_value: 'Best value' }
    },
    dashboard: {
      title: 'Dashboard',
      description: (restaurant: string, when: string) => `${restaurant}. Last published ${when}.`,
      dataSource: (source: string) => `Data source: ${source}`,
      guestView: 'Guest view',
      waitingTitle: (n: number) => `${n} engine suggestions are waiting for your review`,
      waitingText: 'Guests see a suggestion as “Recommended for your dish”, never as a sommelier’s pairing, until it is approved.',
      reviewNow: 'Review now',
      program: 'Wine program',
      sommelierLed: 'Sommelier-led dishes',
      sommelierLedValue: (n: number, of: number) => `${n} of ${of}`,
      sommelierLedDetail: 'Published dishes with an approved primary pairing',
      publishedDishes: 'Published dishes',
      publishedDishesDetail: (total: number, draft: number, hidden: number) => `${total} on the menu, ${draft} draft, ${hidden} hidden`,
      winesOnList: 'Wines on the list',
      winesDetail: (byGlass: number, hidden: number) => `${byGlass} by the glass${hidden ? `, ${hidden} hidden from guests` : ''}`,
      approvedPairings: 'Approved pairings',
      approvedDetail: (suggested: number, rejected: number) => `${suggested} suggested, ${rejected} rejected`,
      attention: 'Needs your attention',
      attentionText: (reviewed: number, of: number) => `${reviewed} of ${of} dishes have at least one approved pairing.`,
      upToDate: 'Nothing to review. The program is up to date.',
      menuEmpty: 'The menu is empty.',
      importMenu: 'Import your menu',
      winesEmpty: 'The wine list is empty.',
      importWines: 'Import your wine list',
      unpublished: (n: number) => `${n} unpublished ${n === 1 ? 'change' : 'changes'}.`,
      publish: 'Publish',
      noPrimary: (n: number) => `${n} dishes have no primary pick`,
      andMore: (n: number) => `and ${n} more`,
      draftProfiles: (n: number) => `${n} taste profiles are still drafts.`,
      openMenu: 'Open the menu',
      hiddenWines: (n: number) => `${n} ${n === 1 ? 'wine is' : 'wines are'} hidden from guests.`,
      openWines: 'Open the wine list',
      opportunities: (n: number) => `Opportunities: ${n}`,
      openOpportunities: 'Open opportunities',
      /** "Guest usage" (spec 2026-10-15-kpi-dashboard, phase 1) */
      usage: {
        title: 'Guest usage',
        window: (days: number, from: string, to: string) => `Last ${days} days · ${from} – ${to}`,
        sessions: 'Guest sessions',
        sessionsDetail: 'Guests who opened the app from the QR code or a link',
        views: 'Dish recommendations viewed',
        viewsDetail: 'Each dish counted once per session',
        conversion: 'Recommendation → selection',
        conversionDetail: (n: string, of: string) => `${n} of ${of} sessions · dish recommendations only`,
        staffLookups: 'Waiter lookups',
        staffLookupsDetail: 'Staff screen, a dish or a whole table · not in the guest figures',
        noData: 'No data',
        emptyTitle: 'No guests have used Wine Match yet',
        emptyText: 'Usage figures appear once guests scan the QR code.',
        getQr: 'Get the QR code',
        openGuestApp: 'Open the guest app'
      },
      /** the change of a KPI against the previous window (R5, R6) */
      delta: {
        vsPrevious: (change: string, days: number) => `${change} vs previous ${days} days`,
        points: (n: string) => `${n} pp`,
        up: 'Up',
        down: 'Down',
        noChange: 'No change',
        noComparison: 'No comparison',
        smallSample: 'Too few to compare'
      },
      /** "Pairing performance" (spec 2026-10-15-kpi-dashboard, phase 3, #22) */
      pairings: {
        title: 'Pairing performance',
        caption: 'How often guests saw and chose each pairing, with its source when they saw it',
        dish: 'Dish',
        wine: 'Wine',
        source: 'Source',
        match: 'Match',
        shown: 'Shown',
        chosen: 'Chosen',
        conversion: 'Conversion',
        sources: { sommelier: 'Sommelier', engine: 'Engine' },
        noViews: 'No views',
        showAll: (n: number) => `Show all ${n} pairings`,
        showTop: (n: number) => `Show top ${n}`,
        omitted: (n: number) => n === 1 ? '1 pairing hidden: the dish or wine was removed.' : `${n} pairings hidden: the dish or wine was removed.`,
        emptyTitle: 'No pairings to measure yet',
        emptyText: 'Approve pairings for your dishes; guests’ views and choices appear here.',
        openReview: 'Review suggestions'
      },
      analyticsUnavailable: 'Analytics are temporarily unavailable.',
      analyticsUnavailableText: 'Pairings and guest app work normally.'
    },
    menu: {
      title: 'Menu',
      description: (n: number) => `${n} dishes. Taste profiles drive the pairing engine; check each draft profile before relying on it.`,
      search: 'Search dishes',
      category: 'Category',
      allCategories: 'All categories',
      noneTitle: 'No dishes found',
      noneEmpty: 'This restaurant has no dishes yet.',
      noneFiltered: 'Try another search or category.',
      importMenu: 'Import your menu',
      dish: 'Dish',
      price: 'Price',
      status: 'Status',
      profile: 'Taste profile',
      pairings: 'Pairings',
      approved: 'approved',
      toReview: (n: number) => `${n} to review`
    },
    dish: {
      back: 'Menu',
      managePairings: 'Manage pairings',
      details: 'Details',
      category: 'Category',
      price: 'Price',
      status: 'Status',
      protein: 'Main ingredient',
      cooking: 'Cooking method',
      pairings: 'Pairings',
      pairingsSummary: (approved: number, hasPrimary: boolean) => `${approved} approved${hasPrimary ? ', with a primary' : ', no primary yet'}`,
      pairingsDetail: (suggested: number, rejected: number) => `${suggested} to review, ${rejected} rejected`,
      topMatches: 'Top matches with this profile',
      topMatchesText: 'Engine ranking among active wines, before any sommelier decision.',
      profile: 'Taste profile',
      profileDraft: 'Drafted from the imported description. Check it before relying on the scores.',
      profileConfirmed: 'Confirmed by the restaurant team.',
      scales: {
        intensity: 'Intensity', fat: 'Fat', salt: 'Salt', sweetness: 'Sweetness', acidity: 'Acidity',
        spice: 'Spice', umami: 'Umami', smoke: 'Smoke, char', creaminess: 'Creaminess'
      }
    },
    wines: {
      title: 'Wine list',
      description: (active: number, byGlass: number) => `${active} active wines, ${byGlass} poured by the glass.`,
      search: 'Search producer, wine, region, grape',
      searchLabel: 'Search wines',
      style: 'Style',
      allStyles: 'All styles',
      noneTitle: 'No wines found',
      noneEmpty: 'This restaurant has no wines yet.',
      noneFiltered: 'Try another search or style.',
      importWines: 'Import your wine list',
      producerAndWine: 'Producer and wine',
      vintage: 'Vintage',
      region: 'Region',
      grape: 'Grape',
      serving: 'Serving',
      glass: 'Glass',
      bottle: 'Bottle',
      availability: 'Availability',
      changeAvailability: 'Change availability',
      approvedPairings: (n: number) => `${n} approved pairings`,
      glassAndBottle: 'Glass and bottle',
      bottleOnly: 'Bottle only',
      hide: 'Hide',
      show: 'Show'
    },
    wine: {
      back: 'Wine list',
      listing: 'Listing and prices',
      style: 'Style',
      abv: (style: string, alcohol: number) => `${style}, ${alcohol}% abv`,
      listNo: 'List no.',
      serving: 'Serving',
      glassAndBottle: (ml: number) => `Glass (${ml} ml) and bottle`,
      bottleOnly: 'Bottle only',
      glassPrice: 'Glass price',
      bottlePrice: 'Bottle price',
      character: 'Character',
      adventurous: 'Adventurous',
      classic: 'Classic',
      bestDishes: 'Best dishes for this wine',
      bestDishesText: 'Engine ranking among the menu, before any sommelier decision.',
      profile: 'Wine profile',
      profileText: 'Scale 0–5.',
      approved: 'Approved pairings',
      approvedText: 'Dishes where the sommelier chose this wine.',
      noApproved: 'No approved pairings yet.',
      scales: {
        body: 'Body', acidity: 'Acidity', tannin: 'Tannin', sweetness: 'Sweetness',
        fruitiness: 'Fruit', oak: 'Oak', aromatic: 'Aromatics', freshness: 'Freshness'
      }
    },
    review: {
      title: 'Review queue',
      description: 'Pairings the engine proposed for your list. Nothing here is labelled as a sommelier’s pairing until you approve it.',
      approveAll: (n: number) => `Approve all ${n}`,
      readOnly: 'You can follow the review queue. Only the Wine Director approves or rejects pairings.',
      progress: (reviewed: number, of: number) => `${reviewed} of ${of} dishes have at least one approved pairing`,
      left: (n: number) => `${n} suggestions left`,
      progressLabel: 'Review progress',
      doneTitle: 'Everything is reviewed',
      doneText: 'Guests see your approved pairings first, with the engine filling any remaining places.',
      noPrimary: 'No primary pick yet',
      approveDish: 'Approve all for this dish',
      openPairings: 'Open pairings',
      approve: 'Approve',
      reject: 'Reject'
    },
    pairings: {
      title: (dish: string) => `Pairings: ${dish}`,
      noDishes: 'There are no dishes yet.',
      readOnly: 'You can see every pairing, the history and what guests see. Only the Wine Director decides pairings.',
      dishes: 'Dishes',
      approvedTitle: 'Approved for guests',
      approvedText: 'In this order. The primary pick always comes first; guests see your note as “Why it works”.',
      noneApproved: 'No approved pairings yet. Approve an engine suggestion below, or add your own.',
      prices: (glass: string | null, bottle: string) => `${glass !== null ? `${glass} glass, ` : 'Bottle only, '}${bottle} bottle`,
      hiddenFromGuests: ' · hidden from guests',
      unpublished: 'Unpublished',
      roleOf: (name: string) => `Role of ${name}`,
      setRole: 'Set role',
      moveUp: 'Move up',
      up: '↑ Up',
      moveDown: 'Move down',
      down: '↓ Down',
      reject: 'Reject',
      rejectTitle: 'Never recommend this wine with the dish',
      delete: 'Delete',
      deleteTitle: 'Delete this pairing',
      editNote: 'Edit note for guests',
      addNote: 'Add a note for guests',
      notePlaceholder: 'Shown as “Why it works”. 140 characters.',
      noteLabel: 'Note for guests',
      saveNote: 'Save note',
      noteIn: (lang: string) => `Note in ${lang}`,
      noteBase: 'Base note',
      noteTranslationsHelp: 'Guests see the note in their language; an empty field shows the base note.',
      suggestionsTitle: 'Engine suggestions',
      suggestionsText: 'Guests see these as “Recommended for your dish”, never as your pairing, until you approve them.',
      approveAll: (n: number) => `Approve all ${n}`,
      allReviewed: 'All suggestions reviewed.',
      approve: 'Approve',
      addTitle: 'Add your own pairing',
      addText: 'Pick any wine on the list. The engine score is shown for reference; your choice always wins.',
      wine: 'Wine',
      chooseWine: 'Choose a wine',
      engineScore: (n: number) => `engine ${n}%`,
      role: 'Role',
      primaryRecommendation: 'Primary recommendation',
      noteOptional: 'Note for guests (optional)',
      notePlaceholderShort: 'Why it works, in your words',
      add: 'Add pairing',
      rejectedTitle: 'Rejected',
      rejectedText: 'Never recommended with this dish once published.',
      restore: 'Restore as suggestion',
      historyTitle: 'History',
      historyText: 'The latest decisions on this dish. The trail is kept even when a pairing is deleted.',
      noHistory: 'No decisions yet.',
      actions: {
        approve: 'approved', modify: 'modified', reject: 'rejected', restore: 'restored', set_role: 'changed the role of',
        reorder: 'reordered', comment: 'edited the note of', create: 'added', delete: 'deleted'
      } as Record<string, string>,
      guestsTitle: 'What guests see now',
      guestsText: 'The published version, no filters.',
      unpublishedBefore: 'This dish has changes guests don’t see yet.',
      unpublishedLink: 'Publish',
      unpublishedAfter: ' to show them.',
      notShown: 'Not shown to guests: the dish is not published or nothing passes the threshold.',
      sommelier: 'Sommelier’s pairing',
      bestValue: 'Best value'
    },
    opportunities: {
      title: 'Opportunities',
      description: 'Places on your menu and wine list worth a look, grouped by dish.',
      readOnly: 'You can see every opportunity. Only the Wine Director adds suggestions or ignores opportunities.',
      badge: 'Opportunity',
      dishTitle: 'Opportunities for this dish',
      dishText: 'Worth a look. Nothing changes for guests until you approve a pairing and publish.',
      all: 'All opportunities',
      openPairings: 'Open pairings',
      current: 'Current pairings',
      noCurrent: 'none',
      add: 'Add to suggestions',
      approve: 'Approve',
      ignore: 'Ignore',
      restore: 'Restore',
      emptyTitle: 'Nothing to check.',
      emptyText: 'When a dish or a wine is worth a look, it shows up here.',
      degraded: 'Some opportunities are temporarily unavailable.',
      dismissed: (n: number) => `Ignored (${n})`,
      dismissedBy: (name: string, until: string) => `${name} · back on ${until}`,
      rules: {
        dish_no_primary: 'Dish without a primary pick',
        glass_match_unpaired: 'By-the-glass match',
        wine_unpaired: 'Wine without a pairing',
        shown_rarely_chosen: 'Rarely chosen pairing',
        ordered_not_reviewed: 'Ordered, not approved'
      },
      sentences: {
        none: () => 'This dish has no approved pairing yet.',
        no_primary: () => 'This dish has approved pairings, but none of them is the Primary.',
        primary_hidden: (wine: string) => `This dish’s Primary wine (${wine}) is hidden, so guests don’t see it.`,
        glass_match_unpaired: (wine: string, score: number, price: string) => `${wine} matches this dish at ${score}%, is served by the glass (${price}), and none of this dish’s pairings is available by the glass.`,
        wine_unpaired: (wine: string, dish: string, score: number) => `${wine} is on your list but has no approved pairing. It matches “${dish}” best (${score}%).`,
        shown_rarely_chosen: (wine: string, shown: number, days: number, chosen: number, rate: number, otherRate: number) => `When guests saw ${wine} with this dish (${shown} times in the last ${days} days), they chose it ${chosen} ${chosen === 1 ? 'time' : 'times'} (${rate}%); they chose the other wines for this dish ${otherRate}% of the time.`,
        ordered_not_reviewed: (wine: string, orders: number, days: number) => `${wine} was ordered with a recommendation code for this dish ${orders} ${orders === 1 ? 'time' : 'times'} in the last ${days} days, and this pairing isn’t approved.`
      }
    },
    publish: {
      title: 'Publish',
      description: (when: string, version: string) => `Last published ${when}${version}. Guests see the published version through the QR code.`,
      version: (n: number, by: string) => ` (version ${n}, ${by})`,
      readOnly: 'Your role cannot publish.',
      checklist: 'Before you publish',
      checklistText: 'Recommended, not required.',
      noPrimary: (n: number) => `${n} dishes have no primary pick`,
      allPrimary: 'Every dish has a primary pick',
      allPrimaryText: 'Guests always see your first choice first.',
      fix: 'Fix',
      unreviewed: (n: number) => `${n} engine suggestions not reviewed`,
      allReviewed: 'All suggestions reviewed',
      unreviewedShown: 'Unreviewed suggestions can still appear as “Recommended for your dish”, never as a sommelier’s pairing.',
      unreviewedHidden: 'Unreviewed suggestions are hidden from guests.',
      review: 'Review',
      draftProfiles: (n: number) => `${n} taste profiles are still drafts`,
      allConfirmed: 'All taste profiles confirmed',
      allConfirmedText: 'Scores are based on profiles you checked.',
      check: 'Check',
      newDishes: (n: number) => `${n} new dishes will go live`,
      noNewDishes: 'No new dishes',
      noNewDishesText: 'The menu is unchanged since the last publish.',
      names: (list: string, more: number) => (more > 0 ? `${list} and ${more} more` : list),
      settings: 'Guest settings',
      settingsText: 'These apply right away; they are not part of a published version.',
      showUnreviewed: 'Fill empty places with engine picks',
      showUnreviewedText: 'When off, a dish’s wine list shows only pairings you approved. The “Whole table” bottle still comes from the whole list.',
      showScores: 'Show match percentages to guests',
      showScoresText: 'The glass icon is always shown.',
      saveSettings: 'Save settings',
      pending: (n: number) => `${n} unpublished ${n === 1 ? 'change' : 'changes'}`,
      latest: 'Guests see the latest version',
      pendingText: (pairings: number, dishes: number) => `${pairings} pairings and ${dishes} new dishes. Publishing updates the guest app immediately; the QR code stays the same.`,
      nothing: 'There is nothing to publish.',
      preview: 'Preview guest app',
      submit: 'Publish changes',
      upToDate: 'Up to date',
      upToDateText: 'Make a change on the Pairings or Review queue screens, then come back to publish it.',
      versionBadge: (n: number) => `Version ${n}`
    },
    /**
     * "How it works" on the dashboard (spec 2026-10-16-how-it-works-explanations, phase 3): one explanation per card,
     * as list points. Numbers only from ENGINE_FACTS (R4); the dashboard may say "engine", never "AI" (R5). A3 and A5
     * share `score`. Texts describe today's code: the table result (E08 F1, `wm-rules-1.1.0`) still uses the whole
     * active list and ranks with the sommelier bonus / rejected cap; E08 changes these keys when it changes that (Q15).
     */
    explain: {
      dashboard: {
        summary: 'What do these tiles count?',
        points: (f: EngineFacts) => [
          'Sommelier-led dishes: published dishes with an approved primary pairing. On these, guests always see your choice first.',
          'Approved pairings: approved and modified ones. Once published, guests see them as “Sommelier’s pairing”.',
          `Engine suggestions wait in the review queue. With “Fill empty places with engine picks” on, guests see them from ${f.minModelScore}% as “Recommended for your dish”, never as a sommelier’s pairing.`,
          'Wines on the list: active wines. A hidden wine is never shown to guests.'
        ]
      },
      /** the "Guest usage" section of A1 (spec 2026-10-15-kpi-dashboard; E07: the guest figures' explanation belongs to E04) */
      usage: {
        summary: 'What do these figures count?',
        points: (k: UsageExplainFacts) => [
          `The last ${k.days} full days up to yesterday, compared with the ${k.days} days before.`,
          'Guest sessions: guests who opened the app from the QR code or a link. Our own tests, bots and link previews are not recorded.',
          'Dish recommendations viewed: each dish once per session. The whole-table path is not counted here.',
          `Recommendation → selection: of the sessions that viewed wines for a dish, those that chose one. Below ${k.minSample} sessions in either period the change is not shown.`,
          'Waiter lookups: the staff screen, for a dish or a whole table. Never counted as guest sessions.'
        ]
      },
      /** the "Pairing performance" table of A1 (spec 2026-10-15-kpi-dashboard, phase 3) */
      performance: {
        summary: 'What does this table count?',
        points: (k: UsageExplainFacts) => [
          `Guest sessions of the last ${k.days} full days up to yesterday. The waiter’s screen and the whole-table path are not counted.`,
          'Shown: sessions that saw the wine among the recommendations for the dish. Chosen: of those, sessions that chose it for that dish.',
          'Source: Sommelier if the wine was your approved pairing when the guest saw it, Engine if it was an engine suggestion — not its status today.',
          'Match: the engine’s score for the dish and the wine, without guest preferences. “No views”: an approved pairing guests have not seen yet.'
        ]
      },
      menu: {
        summary: 'How does a taste profile affect pairings?',
        points: [
          'The taste profile is the only dish data the engine scores from: intensity, fat, salt, sweetness, acidity, spice, umami, smoke and creaminess on a 0–5 scale, plus the main ingredient and the cooking method.',
          'A “Draft” profile was drafted from the description at import. The same profile always gives the same scores, so a wrong profile gives wrong pairings: check it first.'
        ]
      },
      score: {
        summary: 'How does the engine score a pairing?',
        points: (f: EngineFacts) => [
          `Every pairing starts at ${f.baseScore}. Sommelier rules add or take away points: weight, acidity against fat, sweetness, tannin against fish, spice against alcohol, smoke and oak, salt and bubbles, creaminess, umami and classic pairings.`,
          `The score runs from 0 to ${f.maxScore}. The same profiles always give the same score, so check a draft profile before relying on it.`,
          `Guests see an engine suggestion only from ${f.minModelScore}%. Your approval changes a wine’s place on the list, never its score.`
        ]
      },
      wines: {
        summary: 'What does hiding a wine do?',
        points: [
          'A hidden wine leaves the guests’ recommendations at once, your pairings with it included. No publishing needed.',
          '“Show” brings it back at once.'
        ]
      },
      pairings: {
        summary: 'How do guests see your pairings?',
        points: (f: EngineFacts) => [
          `Order: the primary pick, your other approved pairings in your order, then engine suggestions (from ${f.minModelScore}%, with “Fill empty places with engine picks” on). Guests see at most ${f.dishLimit} wines.`,
          'The percentage is always the engine’s score: approving changes the order, never the number. Your note replaces the engine’s reason.',
          `A rejected pairing never appears with this dish. At the “Whole table” it only lowers this dish’s score to ${f.tableRejectedCap} in the bottle ranking.`,
          'Guest filters can hide even the primary pick (a bottle-only wine with “By the glass”, say).',
          `Best value: your pairing with that role, if it is on the list; otherwise the cheapest bottle priced below the first wine, within ${f.bestValueWindow} points of the top one.`
        ]
      },
      suggestions: {
        summary: 'How do guests see engine suggestions?',
        points: (f: EngineFacts) => [
          `Until you decide, guests see a suggestion from ${f.minModelScore}% as “Recommended for your dish” (with “Fill empty places with engine picks” on), never as your pairing.`,
          'Approve: once published, it becomes a sommelier’s pairing and goes ahead of engine picks. Reject: never recommended with this dish.'
        ]
      },
      review: {
        summary: 'What does approving do?',
        points: (f: EngineFacts) => [
          'Once published, an approved pairing carries the “Sommelier’s pairing” label for guests and comes before engine suggestions.',
          `A rejected pairing is never recommended with that dish. At the “Whole table” it only lowers the dish’s score to ${f.tableRejectedCap} in the bottle ranking.`,
          `Guests see unreviewed suggestions from ${f.minModelScore}% as “Recommended for your dish”, when “Fill empty places with engine picks” is on.`
        ]
      },
      publish: {
        summary: 'What do these settings change?',
        points: (f: EngineFacts) => [
          `Fill empty places with engine picks: when on, guests also see engine suggestions from ${f.minModelScore}%; when off, a dish’s wine list shows only your pairings.`,
          'The “Whole table” bottle is always chosen from the whole active wine list, whatever this setting.',
          'Show match percentages: when off, guests see a glass filled to the level of the match, without a number — on “Whole table” too (bars without numbers); the waiter’s screen always shows them.',
          'Both settings apply at once, without publishing.'
        ]
      },
      opportunities: {
        summary: 'What are opportunities?',
        points: (days: number) => [
          'Opportunities point to places worth a look. We find them in your wine list and match scores and, once there is data, in guests’ choices and orders with a recommendation code — from this restaurant only.',
          `Nothing changes without your decision; an ignored opportunity comes back after ${days} days at the earliest.`
        ]
      },
      /** A13 (spec 2026-10-15-pos-sales-import-attach-rate): not the engine, so no ENGINE_FACTS; the numbers are the import's own rules */
      sales: {
        summary: 'How is the file counted?',
        points: (maxRows: number) => [
          'One row is one line of a check. A check is its business day and its number, so the same number on another day is another check.',
          'Only whole checks are saved: a check with an unticked line or an error is skipped and keeps its saved version.',
          'Importing the same checks again replaces their saved lines instead of adding them, so a corrected export is safe to import.',
          'Wine Attach Rate: checks with food that also had wine, out of all checks with food. Bar checks with wine only count for wine revenue. A returned bottle cancels the sale.',
          `Guest names, payments and item names are not saved. Up to ${maxRows} lines per file: split larger exports by whole days.`
        ]
      }
    },
    qr: {
      title: 'QR code',
      description: 'Put it on every table. Guests scan it, choose a dish and see the wines that go with it.',
      print: 'Print table tent',
      unpublishedBefore: 'The guest app shows an empty menu until you',
      unpublishedLink: 'publish',
      unpublishedAfter: '. You can print the code now: it will not change.',
      localBefore: 'This code points to',
      localAfter: ', an address that only works on this computer. Set',
      localEnd: 'to your real address before printing.',
      tentLine: 'Find the wine for what you’re eating.',
      alt: (name: string) => `QR code that opens ${name}`,
      scan: 'Scan with your phone’s camera',
      download: 'Download',
      downloadText: 'SVG is sharp at any size: best for a print shop.',
      link: 'Link',
      linkText: 'The same address, for a menu, a website or a message.'
    },
    translations: {
      title: 'Translations',
      text: 'Guests and the dashboard show the version in their language. An empty field shows the base text.',
      base: (lang: string) => `Base text (${lang})`,
      field: (field: string, lang: string) => `${field} (${lang})`,
      fields: { name: 'Name', description: 'Description', tastingNote: 'Tasting note', region: 'Region', country: 'Country', tagline: 'Tagline', city: 'City' },
      save: 'Save translations',
      afterPublish: 'Guests see changes after you publish.',
      readOnly: 'Your role cannot change translations.',
      contentTitle: 'Content language and translations',
      contentText: 'The language your menu, wine list and notes were written in (the base texts), and the tagline and city in both languages.',
      contentLocale: 'Language of the base texts',
      contentWarning: 'Changing this language translates nothing: it only says which language the base texts are in.',
      saveContent: 'Save'
    },
    setup: {
      title: 'Setup',
      description: 'Everything that takes a restaurant from an empty account to guests scanning a code.',
      checklist: 'Checklist',
      next: (step: string) => `Next: ${step.toLowerCase()}.`,
      allDone: 'Everything is done.',
      steps: {
        details: 'Restaurant details', menu: 'Import your menu', wines: 'Import your wine list', profiles: 'Check the taste profiles',
        pairings: 'Review the pairings', publish: 'Publish', qr: 'Print the QR code'
      } as Record<SetupStepKey, string>,
      states: {
        details: (r: { name: string; address: string; city: string; slug: string }) => `${r.name}, ${r.address}, ${r.city}. Guest address name: ${r.slug}.`,
        menu_done: (v: Record<string, number>) => `${v.dishes} dishes on the menu.`,
        menu_empty: () => 'Upload a CSV, Excel or PDF file.',
        wines_done: (v: Record<string, number>) => `${v.active} wines on the list, ${v.byGlass} by the glass.`,
        wines_empty: () => 'Upload a CSV, Excel or PDF file.',
        profiles_no_menu: () => 'Import a menu first.',
        profiles_done: () => 'Every dish profile is confirmed.',
        profiles_drafts: (v: Record<string, number>) => `${v.drafts} of ${v.dishes} dish profiles are still drafts.`,
        pairings: (v: Record<string, number>) => `${v.approved} approved, ${v.suggestions} suggestions to review.`,
        publish_never: () => 'Not published yet.',
        publish_pending: (v: Record<string, number>) => `${v.changes} unpublished changes.`,
        publish_done: () => 'Guests see the latest version.',
        qr_done: () => 'Put the code on your tables.',
        qr_wait: () => 'Publish first, then print the code.'
      },
      links: { menu: 'Import menu', wines: 'Import wines', profiles: 'Open menu', pairings: 'Review', publish: 'Publish', qr: 'QR code' } as Partial<Record<SetupStepKey, string>>,
      details: 'Restaurant details',
      detailsText: 'Shown to guests on the landing page.',
      readOnly: 'Only the owner or general manager changes these details.',
      name: 'Name',
      address: 'Address',
      city: 'City',
      wineDirector: 'Wine director',
      slug: 'Address name',
      slugHelpBefore: 'Guests open',
      slugWarning: 'Changing the address name stops every printed QR code from working.',
      save: 'Save details',
      suggestions: 'Pairing suggestions',
      suggestionsText: 'Prepares engine suggestions for dishes and wines that have none yet. It never changes a decision you made.',
      generate: 'Generate suggestions',
      live: 'Live for guests',
      noBaseUrl: 'PUBLIC_BASE_URL is not set: the QR code points to localhost. Set it to your real address before printing.'
    },
    import: {
      menuTitle: 'Import menu',
      menuDescription: 'Bring your dishes in from a file. You check every row before anything is saved.',
      winesTitle: 'Import wine list',
      winesDescription: 'Bring your wines in from a file. You check every row before anything is saved.',
      readOnly: 'Your role cannot import files.',
      kinds: {
        menu: { noun: (n: number): string => (n === 1 ? 'dish' : 'dishes'), columns: 'Category, Name, Description, Price', hint: 'New dishes arrive as drafts with a draft taste profile. They go live when you publish.', updates: 'description, category and price' },
        wines: { noun: (n: number): string => (n === 1 ? 'wine' : 'wines'), columns: 'Producer, Wine, Vintage, Region, Grape, Style, Glass price, Bottle price', hint: 'New wines are on your list at once and get engine pairing suggestions for your review.', updates: 'prices' },
        sales: {
          noun: (n: number): string => (n === 1 ? 'line' : 'lines'), columns: 'Date (business day), Check number, Guests (optional), Category, Item (optional), Quantity, Net amount',
          hint: 'Export item lines from your POS as CSV or Excel. Use the business day column, not a time stamp. Split large files by whole days. Guest names and card data are not needed — such columns are ignored.',
          updates: ''
        }
      },
      columns: {
        name_pl: 'Name (PL)', name_en: 'Name (EN)', description_pl: 'Description (PL)', description_en: 'Description (EN)',
        tasting_note_pl: 'Tasting note (PL)', tasting_note_en: 'Tasting note (EN)', region_pl: 'Region (PL)', region_en: 'Region (EN)', country_pl: 'Country (PL)', country_en: 'Country (EN)',
        category: 'Category', name: 'Name', description: 'Description', price: 'Price (zł)',
        producer: 'Producer', wineName: 'Wine', vintage: 'Vintage', region: 'Region', country: 'Country', grape: 'Grape', style: 'Style', glassPrice: 'Glass', bottlePrice: 'Bottle',
        businessDate: 'Date', checkId: 'Check', covers: 'Guests', itemType: 'Type', itemName: 'Item', quantity: 'Qty', netAmount: 'Net (zł)'
      },
      uploadTitle: '1. Upload a file',
      uploadText: 'CSV, Excel (.xlsx) or PDF, up to 10 MB. Nothing is saved until you confirm.',
      file: 'File',
      upload: 'Upload and check',
      formatTitle: 'What the file should look like',
      formatText: 'The first row names the columns. English or Polish names both work.',
      columnsLabel: 'Columns:',
      pricesBefore: 'Prices like',
      pricesAnd: 'and',
      pricesAfter: 'are fine. PDFs are read as text and are less precise: check every row.',
      sample: 'Download a sample CSV',
      translationsHint: 'Optional translation columns: add _pl or _en to a column name (name_pl, description_en, tasting_note_pl, region_en, country_pl).',
      recent: 'Recent imports',
      recentResult: (created: number, updated: number) => `${created} new, ${updated} updated`,
      continue: 'Continue',
      status: { confirmed: 'Imported', preview_ready: 'Waiting for you', cancelled: 'Cancelled' } as Record<string, string>,
      rowsRead: (n: number) => `${n} rows read`,
      willImport: (n: number) => `${n} will be imported`,
      withErrors: (n: number) => `${n} with errors`,
      exist: (n: number) => `${n} already exist`,
      toCheck: (n: number) => `${n} to check`,
      checkTitle: '2. Check and correct',
      checkText: (updates: string) => `Fix anything marked in red, untick rows you do not want, then import. Rows that already exist are not ticked; tick one to update it (${updates} only).`,
      colImport: 'Import',
      colCheck: 'Check',
      importRow: (n: number) => `Import row ${n}`,
      cellLabel: (column: string, n: number) => `${column}, row ${n}`,
      update: 'Update',
      new: 'New',
      fine: 'Looks fine.',
      fix: 'Fix: ',
      submit: (n: number, noun: string) => `Import ${n} ${noun}`,
      checkAgain: 'Check again',
      cancel: 'Cancel import',
      cancelledTitle: 'This import was cancelled',
      cancelledText: 'Nothing was changed.',
      startNew: 'Start a new one',
      doneTitle: '3. Imported',
      doneText: (file: string, when: string, by: string) => `${file}, ${when} by ${by}.`,
      resultNew: 'New',
      resultUpdated: 'Updated',
      resultSkipped: 'Skipped',
      resultSuggestions: 'Suggestions',
      doneMenu: 'New dishes are drafts: check their taste profiles, review the engine’s pairing suggestions, then publish to show them to guests.',
      doneWines: 'New wines are on your list. Review the engine’s pairing suggestions, then publish.',
      reviewSuggestions: 'Review suggestions',
      openMenu: 'Open the menu',
      openWines: 'Open the wine list',
      another: 'Import another file',
      sales: {
        title: 'Import sales',
        description: 'Bring in item lines exported from your POS to measure how often guests who eat also order wine. You check every line before anything is saved.',
        uploadText: 'CSV or Excel (.xlsx), up to 10 MB and 2000 lines. Nothing is saved until you confirm.',
        pricesText: 'Net amounts like 58,50 or 58.50 zł. Returns and voids are negative lines.',
        missingColumns: (columns: string) => `Could not find the columns: ${columns}.`,
        fieldWords: { businessDate: 'date', checkId: 'check number', covers: 'guests', itemType: 'item type', itemName: 'item', quantity: 'quantity', netAmount: 'net amount' } as Record<string, string>,
        types: { food: 'Food', wine_glass: 'Wine by the glass', wine_bottle: 'Wine by the bottle', other: 'Other' } as Record<string, string>,
        keepValue: (value: string) => `${value} (choose a type)`,
        summaryTitle: 'What this file will save',
        summaryEmpty: 'No complete check is ticked yet.',
        period: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
        checks: (n: number) => `${n} ${n === 1 ? 'check' : 'checks'}`,
        lines: (food: number, glass: number, bottle: number, other: number) => `Lines: ${food} food, ${glass} wine by the glass, ${bottle} wine by the bottle, ${other} other.`,
        incomplete: (n: number) => `${n} ${n === 1 ? 'check is' : 'checks are'} incomplete and will be skipped: a line is unticked or has an error.`,
        replaced: (n: number) => `${n} ${n === 1 ? 'check' : 'checks'} already saved for these dates will be replaced.`,
        checkText: 'Fix anything marked in red and untick lines you do not want, then import. A check is saved only when all its lines are ticked and correct.',
        rateLabel: 'Wine Attach Rate of this file',
        rateText: (withWine: number, food: number) => `${withWine} of ${food} checks with food had wine`,
        noRate: 'No checks with food in this file.',
        unmappedTitle: 'Unrecognised categories',
        unmappedText: 'Choose a type once for each category: it applies to all its lines when you check again or import.',
        unmappedLines: (n: number) => `${n} ${n === 1 ? 'line' : 'lines'}`,
        unmappedChoose: (value: string) => `Type for ${value}`,
        notChosen: 'Choose…',
        resultLines: 'Saved lines',
        resultReplaced: 'Replaced checks',
        doneText: 'The lines are saved. A newer export of the same checks replaces them, so importing a corrected file again is safe.',
        seeRate: 'See Wine Attach Rate',
        attach: {
          title: 'Wine Attach Rate',
          description: 'Checks with food that also had wine, out of all checks with food, for the business days you choose.',
          range: (from: string, to: string) => `Imported sales: ${from} – ${to}.`,
          noRange: 'No sales imported yet.',
          from: 'From',
          to: 'To',
          show: 'Show',
          period: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
          rateText: (withWine: number, food: number) => `${withWine} of ${food} ${food === 1 ? 'check' : 'checks'} with food had wine`,
          noDataTitle: 'No data',
          noData: 'No sales data for this period.',
          noFood: (checks: number) => `No checks with food in this period (${checks} ${checks === 1 ? 'check' : 'checks'} with drinks only), so there is no rate.`,
          invalidTitle: 'This period cannot be shown',
          invalid: 'Choose dates up to 366 days apart, with the end not before the start.',
          perGuest: 'Wine revenue per guest',
          perTable: 'Wine revenue per table',
          averageBottle: 'Average bottle',
          averageGlass: 'Average glass',
          guests: (n: number) => `${n} ${n === 1 ? 'guest' : 'guests'} at checks with food`,
          noGuests: 'No guest counts in the export',
          tables: (n: number) => `${n} ${n === 1 ? 'check' : 'checks'} with food`,
          none: '—',
          noneLabel: 'No data',
          net: 'Net amounts.'
        }
      },
      notes: {
        pdf: 'This PDF was read as text. A PDF has no real columns, so check every row before importing.',
        noCategory: 'No category column: dishes without a category are set to Mains. Check them in the preview.',
        unused: (columns: string) => `Columns not used: ${columns}.`,
        noHeader: (order: string) => `No header row was found, so the columns were read in this order: ${order}.`,
        noCovers: 'No guests column: wine revenue per guest cannot be calculated from this file.',
        dayMonth: 'Dates like 03/04/2026 were read as day/month (3 April 2026).',
        monthDay: 'Dates like 04/13/2026 were read as month/day (13 April 2026).',
        repeatedChecks: 'Check numbers repeat across days. That is fine if your POS numbers receipts per day.'
      },
      issues: {
        exists_menu: () => 'Already on the menu: importing will update its description, category and price.',
        exists: () => 'Already on the wine list: importing will update its prices.',
        duplicate_in_file: (p: IssueParams) => `Appears more than once in this file (first in row ${p.row}).`,
        name_missing: () => 'Name is missing.',
        name_too_long: () => 'Name is too long (120 characters at most).',
        price_missing: () => 'Price is missing.',
        price_invalid: (p: IssueParams) => `“${p.value}” is not a price.`,
        price_not_positive: () => 'Price must be more than zero.',
        price_too_high: () => 'Price looks too high (10 000 at most).',
        category_unknown: (p: IssueParams) => `Unknown category “${p.value}”: set to Mains.`,
        category_missing: () => 'No category: set to Mains.',
        description_long: () => 'The description is very long.',
        producer_missing: () => 'Producer is missing.',
        wine_name_from_grape: () => 'No wine name: the grape is used as the name.',
        wine_name_missing: () => 'Wine name is missing.',
        wine_name_too_long: () => 'Producer or wine name is too long.',
        vintage_missing: () => 'No vintage: set to NV (non-vintage).',
        vintage_invalid: (p: IssueParams) => `“${p.value}” is not a year or NV.`,
        grape_missing: () => 'No grape: the taste profile uses the style only.',
        style_unknown: (p: IssueParams) => `Unknown style “${p.value}”: assumed ${p.guess}.`,
        style_missing: (p: IssueParams) => `No style: assumed ${p.guess}.`,
        style_missing_from_grape: (p: IssueParams) => `No style: assumed ${p.guess} from the grape.`,
        bottle_price_missing: () => 'Bottle price is missing.',
        bottle_price_invalid: (p: IssueParams) => `“${p.value}” is not a price.`,
        glass_price_invalid: (p: IssueParams) => `“${p.value}” is not a price.`,
        glass_price_not_lower: () => 'The glass price must be lower than the bottle price.',
        translation_empty: () => 'Empty translation: the current one is kept.',
        translation_too_long: () => 'The translation is too long.',
        date_missing: () => 'Date is missing.',
        date_invalid: (p: IssueParams) => `“${p.value}” is not a date.`,
        date_timestamp: () => 'Use the business day column, not a time stamp.',
        date_future: () => 'The date is in the future.',
        date_order_conflict: () => 'This file mixes day/month and month/day dates. Write the date as 2026-10-14.',
        check_missing: () => 'Check number is missing.',
        check_too_long: () => 'The check number is too long (64 characters at most).',
        covers_invalid: (p: IssueParams) => `“${p.value}” is not a number of guests (0–999).`,
        covers_missing: () => 'No guests on this check: it is left out of wine revenue per guest.',
        covers_differ: () => 'The lines of this check have different numbers of guests: the largest is used.',
        item_type_missing: () => 'Item type is missing.',
        unmapped_category: (p: IssueParams) => `Unrecognised category “${p.value}”: choose its type under “Unrecognised categories”.`,
        generic_wine: (p: IssueParams) => `“${p.value}” was read as a bottle of wine.`,
        quantity_missing: () => 'Quantity is missing.',
        quantity_invalid: (p: IssueParams) => `“${p.value}” is not a quantity.`,
        quantity_zero: () => 'Quantity cannot be zero.',
        amount_missing: () => 'Net amount is missing.',
        amount_invalid: (p: IssueParams) => `“${p.value}” is not an amount.`,
        amount_too_high: () => 'The amount looks too high (100 000 at most).',
        return_line: () => 'Return or void: it is subtracted from the check.',
        check_incomplete: () => 'Check incomplete: the whole check will be skipped.'
      } as Record<ImportIssueCode | 'exists_menu', (p: IssueParams) => string>
    }
  }
};

export type Dictionary = typeof en;
