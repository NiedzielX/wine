/**
 * English interface texts: the source of the keys (spec 2026-10-15-polish-language, R6). `pl.ts` must
 * `satisfies Dictionary`, so a missing Polish key is a TypeScript error. Texts with values are functions.
 * Restaurant content (dish and wine names, notes) never goes through here.
 */
export const en = {
  common: {
    language: 'Language',
    languageNames: { pl: 'Polski', en: 'English' },
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
      staff: 'Pairing lookup'
    },
    categories: { Starters: 'Starters', Mains: 'Mains', Desserts: 'Desserts' },
    hero: {
      promise: 'Find the wine for what you’re eating tonight, from our own list.',
      wineListBy: (name: string) => `Wine list by ${name}`,
      directorLine: 'Wine Director. Every recommendation follows her pairings.',
      staffLink: 'For staff: quick pairing lookup',
      tableAction: 'Pair a bottle for the table',
      restaurant: 'Restaurant'
    },
    landing: {
      pickDish: 'Pick your dish',
      pickDishLead: 'We’ll show the wines from our list that go with it.',
      menuUpdating: 'Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.'
    },
    menu: {
      updatingTitle: 'Tonight’s menu is being updated',
      updatingText: 'Your waiter can suggest a wine in the meantime.',
      pickLead: 'Pick the dish you’re ordering.',
      sections: 'Menu sections',
      sommelierAvailable: 'Sommelier pairing available',
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
      perfect: 'Perfect with your dish',
      sommelierRecommendation: 'Sommelier recommendation',
      bestValue: 'Best value',
      match: 'match',
      glassPrice: (price: string) => `Glass ${price}`,
      bottlePrice: (price: string) => `Bottle ${price}`,
      nonVintage: 'non-vintage',
      footer: (restaurant: string, director: string) => `Pairings are chosen from ${restaurant}’s list and reviewed by ${director}, our Wine Director.`
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
      done: 'Done'
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
      sommelierPairing: 'Sommelier pairing',
      overall: 'Overall match',
      others: 'Other bottles that work',
      splitTitle: 'Or by the glass, dish by dish',
      splitText: 'These dishes pull in different directions, so a glass each may suit you better.'
    },
    staff: {
      title: 'Pairing lookup',
      lead: 'For the floor team. Same pairings the guest sees, ordered by the Wine Director’s picks.',
      dish: 'Dish',
      show: 'Show',
      nothingTitle: 'Nothing fits',
      nothingText: 'Relax the budget or colour.',
      firstChoice: 'Wine Director’s first choice',
      pick: 'Wine Director’s pick',
      matchPct: (n: number) => `${n}% match`,
      listNo: (n: number) => `no. ${n}`,
      say: (why: string) => `Say: “${why}”`,
      noDishesTitle: 'No dishes on the menu',
      noDishesText: 'The menu is being updated.'
    },
    notFound: {
      title: 'This menu isn’t available',
      text: 'The link doesn’t match a restaurant or a dish on tonight’s menu. Scan the QR code on your table again or ask your waiter.',
      action: 'Open the menu'
    }
  }
};

export type Dictionary = typeof en;
