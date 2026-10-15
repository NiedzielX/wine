import type { Dictionary } from './en';

/** Polish plural: 1 wino, 2–4 wina (but 12–14 win), 5+ win. */
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/**
 * Polish interface texts. `satisfies Dictionary` makes a missing or misspelt key a TypeScript error.
 * Tone: the restaurant's voice, never "AI" (N02). Dish names stay as written, so Polish sentences quote them
 * instead of declining them.
 */
export const pl = {
  common: {
    language: 'Język',
    languageNames: { pl: 'Polski', en: 'English' },
    back: 'Wstecz',
    close: 'Zamknij'
  },
  guest: {
    meta: {
      description: 'Znajdź wino do tego, co dziś jesz — z karty win restauracji.',
      menu: 'Menu',
      wines: 'Wina do Twojego dania',
      wine: 'Wino',
      selected: 'Twoje wino',
      table: 'Wino dla stolika',
      tableResult: 'Najlepsze wino dla stolika',
      staff: 'Podgląd par'
    },
    categories: { Starters: 'Przystawki', Mains: 'Dania główne', Desserts: 'Desery' },
    hero: {
      promise: 'Znajdź wino do tego, co dziś jesz — z naszej karty win.',
      wineListBy: (name: string) => `Kartę win układa ${name}`,
      directorLine: 'Wine Director. Każda rekomendacja opiera się na jej parach.',
      staffLink: 'Dla obsługi: szybki podgląd par',
      tableAction: 'Dobierz butelkę do stolika',
      restaurant: 'Restauracja'
    },
    landing: {
      pickDish: 'Wybierz danie',
      pickDishLead: 'Pokażemy wina z naszej karty, które do niego pasują.',
      menuUpdating: 'Dzisiejsze menu jest właśnie aktualizowane. W międzyczasie kelner chętnie poleci wino.'
    },
    menu: {
      updatingTitle: 'Dzisiejsze menu jest właśnie aktualizowane',
      updatingText: 'W międzyczasie kelner chętnie poleci wino.',
      pickLead: 'Wybierz danie, które zamawiasz.',
      sections: 'Sekcje menu',
      sommelierAvailable: 'Para od sommeliera',
      mode: 'Sposób doboru',
      oneDish: 'Jedno danie',
      wholeTable: 'Cały stolik',
      aside: 'Menu'
    },
    prefs: {
      quick: 'Szybkie preferencje',
      more: 'Więcej…',
      moreCount: (n: number) => `Więcej · ${n}`,
      glass: 'Na kieliszki',
      bottle: 'Na butelki',
      glassOrBottle: 'Kieliszek czy butelka',
      either: 'Obojętnie',
      colour: 'Kolor lub styl',
      budget: 'Budżet',
      budgetPerGlass: 'Budżet na kieliszek',
      any: 'Dowolny',
      upTo: (price: string) => `Do ${price}`,
      body: 'Budowa',
      noPreference: 'Bez znaczenia',
      lighter: 'Lżejsze',
      fuller: 'Pełniejsze',
      mood: 'Nastrój',
      classic: 'Klasyczne',
      adventurous: 'Odważne'
    },
    wines: {
      refine: 'Zawęź wybór',
      closeFilters: 'Zamknij filtry',
      reset: 'Wyczyść',
      show: (n: number) => `Pokaż ${n} ${plural(n, 'wino', 'wina', 'win')}`,
      noneTitle: 'Żadne wino nie spełnia wszystkich wyborów',
      noneFiltered: 'Spróbuj mniej filtrów albo innego budżetu.',
      noneYet: 'Nasz sommelier wciąż przygotowuje pary do tego dania. Kelner chętnie pomoże.',
      clearFilters: 'Wyczyść filtry',
      alsoGood: 'Też pasuje do tego dania',
      perfect: 'Pasuje do Twojego dania',
      sommelierRecommendation: 'Rekomendacja sommeliera',
      bestValue: 'Najlepsza cena',
      match: 'dopasowanie',
      glassPrice: (price: string) => `Kieliszek ${price}`,
      bottlePrice: (price: string) => `Butelka ${price}`,
      nonVintage: 'bez rocznika',
      footer: (restaurant: string, director: string) => `Pary pochodzą z karty win restauracji ${restaurant}, a sprawdza je ${director}, nasza Wine Director.`
    },
    wine: {
      unavailableTitle: 'To wino jest już niedostępne',
      unavailableText: 'Być może dziś się skończyło. Pozostałe propozycje wciąż czekają.',
      seeOther: 'Zobacz inne wina',
      director: (name: string) => `${name}, Wine Director`,
      whyWith: (dish: string) => `Dlaczego pasuje do dania „${dish}”`,
      region: 'Region',
      vintage: 'Rocznik',
      nonVintage: 'Bez rocznika',
      grapes: 'Szczepy',
      style: 'Styl',
      abv: (style: string, alcohol: number) => `${style}, ${String(alcohol).replace('.', ',')}% alk.`,
      body: 'Budowa',
      acidity: 'Kwasowość',
      tannin: 'Taniny',
      sweetness: 'Słodycz',
      dots: (n: number) => `${n} z 5`,
      howServed: 'Jak podać?',
      glass: (ml: number) => `Kieliszek, ${ml} ml`,
      bottle: (ml: number) => `Butelka, ${ml} ml`,
      bottleOnly: 'Tylko butelka',
      notByGlass: 'Nie podajemy na kieliszki',
      choose: 'Wybierz to wino'
    },
    selected: {
      unavailableText: 'Być może dziś się skończyło. Wybierz, proszę, inne.',
      backToMenu: 'Wróć do menu',
      showWaiter: 'Pokaż to kelnerowi.',
      listNo: (n: number) => `Nr w karcie ${n}`,
      oneGlass: (ml: number, price: string) => `1 kieliszek, ${ml} ml, ${price}`,
      oneBottle: (ml: number, price: string) => `1 butelka, ${ml} ml, ${price}`,
      withDish: (dish: string) => `Do dania „${dish}”`,
      forTable: 'Dla stolika',
      pairAnother: 'Dobierz wino do innego dania',
      done: 'Gotowe'
    },
    table: {
      lead: 'Zaznacz wszystko, co zamawia Twój stolik. Znajdziemy jedną butelkę, która pasuje do całości.',
      colourAndBudget: 'Kolor i budżet',
      budgetPerBottle: 'Budżet na butelkę',
      submit: 'Znajdź butelkę dla stolika',
      countInitial: (min: number) => `Wybierz co najmniej ${min} dania`,
      countNone: 'Nie wybrano dań',
      countOne: (n: number) => `Wybrano ${n} danie, dodaj jeszcze jedno`,
      countMany: (n: number) => `Wybrano ${n} ${plural(n, 'danie', 'dania', 'dań')}`
    },
    tableResult: {
      needTwoTitle: 'Dodaj co najmniej dwa dania',
      needTwoText: 'Dobór dla stolika wymaga dwóch lub więcej dań. Do jednego dania użyj menu.',
      chooseDishes: 'Wybierz dania',
      title: 'Najlepsze wino dla stolika',
      dishes: (n: number, names: string) => `${n} ${plural(n, 'danie', 'dania', 'dań')}: ${names}`,
      dessertsApart: (names: string) => `Desery dobieramy osobno. Po daniach głównych wybierz w menu ${names}.`,
      or: ' lub ',
      noneTitle: 'Żadna butelka nie spełnia tych filtrów',
      noneText: 'Spróbuj innego koloru albo budżetu.',
      changePrefs: 'Zmień preferencje',
      recommended: 'Polecamy dla Twojego stolika',
      sommelierPairing: 'Para od sommeliera',
      overall: 'Dopasowanie ogółem',
      others: 'Inne butelki, które pasują',
      splitTitle: 'Albo na kieliszki, do każdego dania osobno',
      splitText: 'Te dania ciągną w różne strony, więc osobny kieliszek do każdego może sprawdzić się lepiej.'
    },
    staff: {
      title: 'Podgląd par',
      lead: 'Dla obsługi sali. Te same pary, które widzi gość, w kolejności wyborów Wine Director.',
      dish: 'Danie',
      show: 'Pokaż',
      nothingTitle: 'Nic nie pasuje',
      nothingText: 'Poluzuj budżet albo kolor.',
      firstChoice: 'Pierwszy wybór Wine Director',
      pick: 'Wybór Wine Director',
      matchPct: (n: number) => `${n}% dopasowania`,
      listNo: (n: number) => `nr ${n}`,
      say: (why: string) => `Powiedz: „${why}”`,
      noDishesTitle: 'Brak dań w menu',
      noDishesText: 'Menu jest właśnie aktualizowane.'
    },
    notFound: {
      title: 'To menu jest niedostępne',
      text: 'Link nie prowadzi do restauracji ani do dania z dzisiejszego menu. Zeskanuj ponownie kod QR na stoliku albo zapytaj kelnera.',
      action: 'Otwórz menu'
    }
  }
} satisfies Dictionary;
