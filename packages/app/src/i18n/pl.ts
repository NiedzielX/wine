import type { EngineFacts } from '@wine-match/core';
import type { Dictionary, ExplainContext, HowItWorksSection, IssueParams, RestaurantExplainContext, TableFitText, TableQuantityText, WineExplainContext } from './en';

/** Polish plural: 1 wino, 2–4 wina (but 12–14 win), 5+ win. */
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Do trzech słabszych dań z nazwy, potem ile jeszcze (R12 E08); nazwy dań bez odmiany. */
const weakerNamesPl = (names: string[]) =>
  names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} i ${names.length - 3} ${names.length - 3 === 1 ? 'innego' : 'innych'}`;

/** Udział w wyniku stołu w procentach (0,6 → 60); waga z przecinkiem dziesiętnym (1,5). */
const pctPl = (weight: number) => Math.round(weight * 100);
const decimalPl = (n: number) => String(n).replace('.', ',');

const directorPl = (name: string) => name.trim() || 'sommelier restauracji';

/** Punkt E08 F4 w wyjaśnieniach stołu (G5, G6, G11): ilość na osobę, jeśli wszyscy piją to samo wino (Q3, Q4); G11 dodaje kieliszki. */
const quantityPointPl = (f: EngineFacts) => `Ilość: ok. ${f.tableMlPerPerson} ml na osobę, jeśli wszyscy piją to samo wino.`;
const quantityGlassesPl = (f: EngineFacts) =>
  `Do pełnych butelek doliczamy najwyżej ${f.tableMaxExtraGlasses} ${plural(f.tableMaxExtraGlasses, 'kieliszek', 'kieliszki', 'kieliszków')} zamiast kolejnej butelki; ilość podajemy dopiero po wyborze liczby osób.`;

/** Punkt 5 G3 i arkusz G4: filtry twarde wykluczają, miękkie zmieniają kolejność; luzowanie budżetu. */
const filterPointsPl = (f: EngineFacts) => [
  '„Na kieliszki”, kolor i budżet wykluczają wina; budowa i nastrój zmieniają kolejność (czasem poza listę).',
  `Gdy nic nie mieści się w budżecie, pokazujemy ${f.budgetFallbackCount} ${plural(f.budgetFallbackCount, 'najlepiej pasujące wino', 'najlepiej pasujące wina', 'najlepiej pasujących win')} spoza budżetu i o tym piszemy.`
];

/**
 * Polish interface texts. `satisfies Dictionary` makes a missing or misspelt key a TypeScript error.
 * Tone: the restaurant's voice, never "AI" (N02). Dish names stay as written, so Polish sentences quote them
 * instead of declining them.
 */
export const pl = {
  common: {
    language: 'Język',
    languageNames: { pl: 'Polski', en: 'English' },
    languageShort: { pl: 'PL', en: 'EN' },
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
      staff: 'Podgląd par',
      staffTable: 'Cały stolik — obsługa',
      howItWorks: 'Jak dobieramy wino'
    },
    categories: { Starters: 'Przystawki', Mains: 'Dania główne', Desserts: 'Desery' },
    hero: {
      promise: 'Znajdź wino do tego, co dziś jesz — z naszej karty win.',
      wineListBy: (name: string) => `Kartę win układa ${name}`,
      directorLine: 'Pary Wine Directora zawsze otwierają listę dania.',
      staffLink: 'Dla obsługi: szybki podgląd par',
      howLink: 'Więcej o doborze win',
      tableAction: 'Dobierz butelkę do stolika',
      restaurant: 'Restauracja'
    },
    landing: {
      tableCardTitle: 'Kilka dań na stole?',
      tableCardText: 'Dobierzemy jedną butelkę do wszystkich i powiemy uczciwie, do czego pasuje słabiej.',
      tableCardAction: 'Dobierz butelkę do stołu',
      pickDish: 'Wybierz danie',
      pickDishLead: 'Pokażemy wina z naszej karty, które do niego pasują.',
      menuUpdating: 'Dzisiejsze menu jest właśnie aktualizowane. W międzyczasie kelner chętnie poleci wino.'
    },
    menu: {
      updatingTitle: 'Dzisiejsze menu jest właśnie aktualizowane',
      updatingText: 'W międzyczasie kelner chętnie poleci wino.',
      pickLead: 'Wybierz danie, które zamawiasz.',
      sections: 'Sekcje menu',
      sommelierAvailable: 'Para sommeliera',
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
      recommended: 'Polecane do Twojego dania',
      sommelierPairing: 'Para sommeliera',
      bestValue: 'Najlepsza cena',
      match: 'dopasowanie',
      matchLabel: (n: number) => `Dopasowanie ${n} procent`,
      glassLabel: 'Dopasowanie pokazuje wypełnienie kieliszka',
      glassPrice: (price: string) => `Kieliszek ${price}`,
      bottlePrice: (price: string) => `Butelka ${price}`,
      nonVintage: 'bez rocznika',
      footer: (restaurant: string, director: string, showUnreviewed: boolean) => showUnreviewed
        ? `Wszystkie wina pochodzą z karty win restauracji ${restaurant}. Wina z pieczęcią poleca ${directorPl(director)}, pozostałe dobieramy według zasad łączenia wina z jedzeniem.`
        : `Wszystkie wina pochodzą z karty win restauracji ${restaurant} i poleca je ${directorPl(director)}.`
    },
    explain: {
      wines: {
        summary: 'Skąd te wina?',
        points: (f: EngineFacts, c: ExplainContext) => [
          `Para sommeliera — wino, które do tego dania poleca ${directorPl(c.director)}; zawsze przed pozostałymi.`,
          ...(c.showUnreviewed
            ? [`Polecane do Twojego dania — dobrane według zasad łączenia wina z jedzeniem (budowa, kwasowość, słodycz, taniny, ostrość, klasyczne połączenia); ${c.showScores ? `pokazujemy je od ${f.minModelScore}%.` : 'pokazujemy tylko dostatecznie dobrze pasujące.'}`]
            : []),
          c.showScores
            ? `Procent (0–${f.maxScore}%) to ocena dopasowania wina do dania. Wybór sommeliera zmienia kolejność, nie liczbę; cena jej nie podnosi.`
            : 'Im pełniejszy kieliszek, tym lepiej wino pasuje do dania. Wybór sommeliera zmienia kolejność, nie ocenę; cena jej nie podnosi.',
          `Najlepsza cena — wybór sommeliera w tej roli, a bez niego najtańsza butelka tańsza od pierwszego wina, ${c.showScores ? `najwyżej ${f.bestValueWindow} pkt słabsza od najlepszej` : 'pasująca prawie tak dobrze jak najlepsza'}.`,
          filterPointsPl(f).join(' ')
        ]
      },
      filters: {
        summary: 'Jak działają filtry?',
        points: (f: EngineFacts) => filterPointsPl(f)
      },
      landing: {
        summary: 'Jak dobieramy wino?',
        points: (f: EngineFacts, c: RestaurantExplainContext) => [
          `Wybierasz danie, a my pokazujemy do ${f.dishLimit} ${f.dishLimit === 1 ? 'wina' : 'win'} z karty win restauracji ${c.restaurant}, które do niego pasują.`,
          `Wina z pieczęcią to pary sommeliera — poleca je ${directorPl(c.director)}.`,
          ...(c.showUnreviewed ? ['Pozostałe dobieramy według zasad łączenia wina z jedzeniem.'] : []),
          'Producenci nie płacą za miejsce na liście.'
        ]
      },
      menu: {
        summary: 'Co znaczy pieczęć przy daniu?',
        points: (c: Pick<ExplainContext, 'showUnreviewed'>) => [
          'Do tego dania sommelier wybrał już wino — zobaczysz je jako pierwsze (chyba że wykluczą je Twoje filtry, np. „Na kieliszki”).',
          c.showUnreviewed
            ? 'Do pozostałych dań dobieramy wina z karty według zasad łączenia wina z jedzeniem.'
            : 'Przy pozostałych daniach pokazujemy tylko wina, które sommelier już zatwierdził; gdy ich jeszcze nie ma, kelner chętnie pomoże.'
        ]
      },
      table: {
        summary: 'Jak wybieramy butelkę dla stolika?',
        points: (f: EngineFacts) => [
          `Każde wino z karty oceniamy do każdego zaznaczonego dania; dania główne liczą się mocniej (×${decimalPl(f.tableMainsWeight)}).`,
          'Liczy się średnia, ale też najsłabsze danie — wolimy butelkę dobrą do wszystkiego niż świetną do jednego dania i słabą do reszty.',
          'Desery wybierasz osobno, po daniach głównych (chyba że stół zamawia tylko desery).',
          `Bierzemy tylko wina w wybranym kolorze i budżecie; gdy żadna butelka nie mieści się w budżecie, piszemy o tym i pokazujemy ${f.budgetFallbackCount} ${plural(f.budgetFallbackCount, 'najlepiej pasującą butelkę', 'najlepiej pasujące butelki', 'najlepiej pasujących butelek')} spoza niego.`,
          quantityPointPl(f)
        ]
      },
      tableResult: {
        summary: 'Jak liczymy dopasowanie ogółem?',
        points: (f: EngineFacts, c: Pick<ExplainContext, 'showScores'>) => c.showScores
          ? [
              `Paski pokazują dopasowanie do każdego dania. Dopasowanie ogółem to ${pctPl(f.tableMeanWeight)}% średniej (dania główne ×${decimalPl(f.tableMainsWeight)}) i ${pctPl(f.tableMinWeight)}% wyniku najsłabszego dania.`,
              `„Pasuje” znaczy co najmniej ${f.tableFitThreshold}%, a para odrzucona przez sommeliera nigdy nie pasuje. Desery liczymy osobno.`,
              `Para sommeliera ma pieczęć i dodaje ${f.tableSommelierBonus} pkt do dopasowania ogółem, nie do procentu przy daniu; odrzucona liczy się najwyżej za ${f.tableRejectedCap}%.`,
              `Gdy ogółem wychodzi poniżej ${f.compromiseThreshold}% albo najsłabsze danie poniżej ${f.weakDishThreshold}%, proponujemy też osobny kieliszek do każdego dania.`,
              quantityPointPl(f)
            ]
          : [
              'Paski pokazują dopasowanie do każdego dania. Butelkę wybieramy według średniej z dań (dania główne liczą się bardziej) i najsłabszego dania.',
              '„Pasuje” znaczy, że wino dobrze pasuje do tego dania samo w sobie; para odrzucona przez sommeliera nigdy nie pasuje. Desery liczymy osobno.',
              'Para sommeliera ma pieczęć i trochę podnosi butelkę w wyborze (nie pasek przy daniu); odrzucona mocno ją obniża.',
              'Gdy jedna butelka jest kompromisem, proponujemy też kieliszki osobno do każdego dania.',
              quantityPointPl(f)
            ]
      },
      staff: {
        summary: 'Skąd ta kolejność?',
        points: (f: EngineFacts, c: Pick<ExplainContext, 'showUnreviewed'>) => [
          `Kolejność jak u gościa: najpierw pierwszy wybór sommeliera, potem pozostałe pary sommeliera w ustalonej kolejności${c.showUnreviewed ? `, potem wina dobrane według zasad (od ${f.minModelScore}%)` : '; innych win restauracja nie pokazuje'}. Najwyżej ${f.dishLimit} ${plural(f.dishLimit, 'wino', 'wina', 'win')}.`,
          'Procent to ocena dopasowania do dania — para sommeliera nie dostaje wyższego procentu. Widzisz go zawsze, także gdy gość go nie widzi.',
          '„Powiedz:” to notatka sommeliera albo uzasadnienie z zasad łączenia wina z jedzeniem.',
          'Filtry działają jak u gościa.'
        ]
      },
      selected: {
        summary: 'Co dalej?',
        points: [
          'Wybór wina nie jest zamówieniem i niczego nie płacisz w aplikacji.',
          'Pokaż ten ekran kelnerowi — przyjmie zamówienie.'
        ]
      },
      staffTable: {
        summary: 'Jak wybieramy butelkę do stolika?',
        points: (f: EngineFacts) => [
          `Każde danie dostaje własną ocenę dopasowania. Wynik stołu łączy średnią (${pctPl(f.tableMeanWeight)}%, dania główne ×${decimalPl(f.tableMainsWeight)}) z najsłabszym daniem (${pctPl(f.tableMinWeight)}%), żeby butelka nie była świetna do jednego dania i słaba do drugiego.`,
          `„Pasuje” znaczy co najmniej ${f.tableFitThreshold}%, a para odrzucona przez sommeliera nigdy nie pasuje. Desery liczymy osobno.`,
          `Para sommeliera ma pieczęć i podnosi wynik stołu o ${f.tableSommelierBonus} pkt (nie procent przy daniu); odrzucona liczy się najwyżej jako ${f.tableRejectedCap}%.`,
          `Gdy wynik stołu jest poniżej ${f.compromiseThreshold}% albo najsłabsze danie poniżej ${f.weakDishThreshold}%, proponujemy też kieliszki osobno do każdego dania.`,
          `${quantityPointPl(f)} ${quantityGlassesPl(f)}`
        ]
      },
      wine: {
        summary: 'Co znaczy ta ocena?',
        points: (c: WineExplainContext) => [
          c.score === null
            ? c.dish === null
              ? 'Tu nie pokazujemy oceny — oceniamy wino tylko do konkretnego dania.'
              : `Tego wina nie ma wśród win, które proponujemy do dania „${c.dish}”, więc nie pokazujemy tu oceny.`
            : c.showScores
              ? `${c.score}% to ocena, jak dobrze to wino pasuje do dania „${c.dish ?? ''}”. Wyżej uzasadnienie: słowa sommeliera (z podpisem) albo zasady, które zdecydowały.`
              : `Kieliszek pokazuje, jak dobrze to wino pasuje do dania „${c.dish ?? ''}”: im pełniejszy, tym lepiej. Wyżej uzasadnienie: słowa sommeliera (z podpisem) albo zasady, które zdecydowały.`,
          'Kropki to profil wina w skali 0–5 według opisu z karty restauracji.'
        ]
      }
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
      done: 'Gotowe',
      code: {
        title: 'Kod dla kelnera',
        hint: 'Pokaż go kelnerowi razem z winem.',
        spoken: (code: string) => code.split('').join(', '),
        unavailable: 'Kod niedostępny — poleć wino słownie.',
        explain: 'Kod łączy to wino z poleceniem, żeby restauracja wiedziała, co gościom smakuje. Nie zawiera żadnych danych o Tobie.'
      }
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
      sommelierPairing: 'Para sommeliera',
      overall: 'Dopasowanie ogółem',
      others: 'Inne butelki, które pasują',
      splitTitle: 'Albo na kieliszki, do każdego dania osobno',
      splitText: 'Te dania ciągną w różne strony, więc osobny kieliszek do każdego może sprawdzić się lepiej.'
    },
    tableFit: {
      line: (f: TableFitText) => {
        if (f.of === 1) return f.fits === 1 ? 'Pasuje do tego dania.' : `Słabiej pasuje do: ${f.weaker[0] ?? ''}.`;
        if (f.fits === 0) return `Nie pasuje dobrze do żadnego z ${f.of} dań.`;
        if (f.fits < f.of) return `Pasuje do ${f.fits} z ${f.of} dań, słabiej do: ${weakerNamesPl(f.weaker)}.`;
        const all = f.of === 2 ? 'Pasuje do obu dań' : `Pasuje do wszystkich ${f.of} dań`;
        return f.compromise ? `${all}, choć to kompromis.` : `${all}.`;
      }
    },
    tableQuantity: {
      question: 'Ile osób pije wino?',
      skip: 'Pomiń',
      more: '8+',
      hint: 'Wybierz, ile osób pije wino, a podamy, ile go zamówić.',
      peopleLabel: (n: number) => `${n} osób`,
      // „Dla N osób” — przy co najmniej 2 osobach dopełniacz liczby mnogiej jest zawsze ten sam
      line: (q: TableQuantityText) =>
        `Dla ${q.people} osób: ${q.bottles} ${plural(q.bottles, 'butelka', 'butelki', 'butelek')}${q.glasses > 0 ? ` + ${q.glasses} ${plural(q.glasses, 'kieliszek', 'kieliszki', 'kieliszków')}` : ''} · ${q.total}`
    },
    staff: {
      title: 'Podgląd par',
      lead: 'Dla obsługi sali. Te same pary, które widzi gość, w kolejności wyborów Wine Director.',
      dish: 'Danie',
      show: 'Pokaż',
      nothingTitle: 'Nic nie pasuje',
      nothingText: 'Poluzuj budżet albo kolor.',
      firstChoice: 'Para sommeliera · pierwszy wybór',
      pick: 'Para sommeliera',
      matchPct: (n: number) => `${n}% dopasowania`,
      listNo: (n: number) => `nr ${n}`,
      say: (why: string) => `Powiedz: „${why}”`,
      noDishesTitle: 'Brak dań w menu',
      noDishesText: 'Menu jest właśnie aktualizowane.'
    },
    staffTable: {
      title: 'Cały stolik',
      lead: 'Zaznacz dania stolika i pokaż butelkę. Te same pary, które widzi gość.',
      search: 'Szukaj dania',
      dessertsApart: 'liczone osobno',
      colour: 'Kolor',
      submit: 'Pokaż butelkę',
      needTwo: 'Zaznacz co najmniej dwa dania.',
      truncated: (n: number) => `Policzyliśmy pierwsze ${n} ${plural(n, 'danie', 'dania', 'dań')}.`,
      thisBottle: (listNumber: number | undefined, name: string) => listNumber === undefined ? `Ta butelka: ${name}.` : `Ta butelka: nr ${listNumber} ${name}.`,
      others: 'Inne butelki',
      listNo: (n: number) => `nr ${n}`,
      fitsOf: (fits: number, of: number) => `${fits} z ${of}`,
      choose: 'Wybierz tę',
      dessertsNote: (names: string) => `Desery dobieramy osobno: ${names}.`,
      changeTable: 'Zmień stolik',
      newTable: 'Nowy stolik',
      nothingTitle: 'Nic nie pasuje',
      nothingText: 'Zmień kolor albo zostaw go pusty.',
      code: {
        title: 'Kod',
        hint: 'Wpisz go w komentarzu zamówienia.',
        spoken: (code: string) => code.split('').join(', '),
        unavailable: 'Bez kodu — zamów jak zwykle.'
      }
    },
    notFound: {
      title: 'To menu jest niedostępne',
      text: 'Link nie prowadzi do restauracji ani do dania z dzisiejszego menu. Zeskanuj ponownie kod QR na stoliku albo zapytaj kelnera.',
      action: 'Otwórz menu'
    },
    howItWorks: {
      title: 'Jak dobieramy wino',
      lead: (restaurant: string) => `Prostymi słowami: jak dobieramy wino do Twojego dania w restauracji ${restaurant}.`,
      back: 'Wróć do menu',
      sections: (f: EngineFacts, c: RestaurantExplainContext): HowItWorksSection[] => [
        {
          id: 'list',
          title: `Tylko z karty restauracji ${c.restaurant}`,
          text: [`Każde wino, które proponujemy, jest w karcie win restauracji ${c.restaurant} i jest dziś dostępne. Do jednego dania pokazujemy najwyżej ${f.dishLimit} ${plural(f.dishLimit, 'wino', 'wina', 'win')}.`]
        },
        {
          id: 'sommelier',
          title: 'Sommelier ma ostatnie słowo',
          text: [`Wino z pieczęcią to para sommeliera: do tego dania poleca je ${directorPl(c.director)} i zawsze stoi pierwsze na liście dania. Wino odrzucone przez sommeliera nie pojawi się przy tym daniu; przy doborze dla całego stołu odrzucenie tylko mocno obniża wynik butelki.`]
        },
        ...(c.showUnreviewed
          ? [{
              id: 'rules' as const,
              title: 'Zasady łączenia wina z jedzeniem',
              text: [c.showScores
                ? `Tam, gdzie sommelier jeszcze nie wybrał, dobieramy wina według zasad łączenia wina z jedzeniem i pokazujemy je od ${f.minModelScore}%. Najważniejsze zasady:`
                : 'Tam, gdzie sommelier jeszcze nie wybrał, dobieramy wina według zasad łączenia wina z jedzeniem i pokazujemy tylko dostatecznie dobrze pasujące. Najważniejsze zasady:'],
              points: [
                'budowa wina pasuje do siły dania;',
                'świeża kwasowość do tłustych dań;',
                'do deseru wino co najmniej tak słodkie jak deser, do dań wytrawnych — wytrawne;',
                'delikatne taniny do ryb i owoców morza;',
                'do ostrych dań mniej alkoholu, a lekka słodycz pomaga;',
                'klasyczne połączenia, np. pinot noir do kaczki.'
              ],
              after: 'To samo danie i to samo wino zawsze dają ten sam wynik.'
            }]
          : []),
        c.showScores
          ? { id: 'score', title: 'Co znaczy procent', text: [`Procent (0–${f.maxScore}%) mówi, jak dobrze wino pasuje do dania. Wybór sommeliera zmienia kolejność, nie liczbę.`] }
          : { id: 'score', title: 'Co znaczy kieliszek', text: ['Im pełniejszy kieliszek, tym lepiej wino pasuje do dania. Wybór sommeliera zmienia kolejność, nie ocenę.'] },
        {
          id: 'table',
          title: 'Cały stolik',
          text: [`Do kilku dań szukamy jednej butelki, która pasuje do wszystkich: liczy się średnia (dania główne ×${decimalPl(f.tableMainsWeight)}) i najsłabsze danie. Butelkę wybieramy z całej karty; desery osobno (chyba że stół zamawia tylko desery). Gdy jedna butelka to kompromis, proponujemy też kieliszki osobno do każdego dania.`]
        },
        {
          id: 'choices',
          title: 'Twoje wybory',
          text: ['„Na kieliszki”, kolor i budżet wykluczają wina; budowa i nastrój zmieniają kolejność. Gdy nic nie mieści się w budżecie, piszemy o tym i pokazujemy najlepiej pasujące wina spoza niego.']
        },
        {
          id: 'fair',
          title: 'Uczciwie',
          text: ['Cena nigdy nie podnosi oceny wina. Producenci nie płacą za miejsce na liście. Nie zakładasz konta.']
        }
      ]
    }
  },
  admin: {
    meta: {
      titleTemplate: '%s | Panel Wine Match',
      dashboard: 'Pulpit',
      signIn: 'Logowanie',
      menu: 'Menu',
      dish: 'Danie',
      wines: 'Karta win',
      wine: 'Wino',
      pairings: 'Parowania',
      review: 'Do przeglądu',
      publish: 'Publikacja',
      qr: 'Kod QR',
      setup: 'Ustawienia',
      importMenu: 'Import menu',
      importWines: 'Import karty win',
      opportunities: 'Okazje'
    },
    language: {
      label: 'Język panelu'
    },
    roles: { owner: 'Właściciel', manager: 'General Manager', sommelier: 'Wine Director', waiter: 'Kelner' },
    categories: { Starters: 'Przystawki', Mains: 'Dania główne', Desserts: 'Desery' },
    proteins: {
      beef: 'wołowina', game: 'dziczyzna', poultry: 'drób', pork: 'wieprzowina', fish: 'ryba', shellfish: 'owoce morza',
      vegetable: 'warzywa', mushroom: 'grzyby', dairy: 'nabiał', dessert: 'deser'
    },
    cooking: {
      raw: 'na surowo', cured: 'peklowanie, wędzenie', poached: 'gotowanie', seared: 'obsmażanie', roasted: 'pieczenie', grilled: 'grillowanie',
      braised: 'duszenie', fried: 'smażenie', baked: 'pieczenie w piecu', none: 'brak'
    },
    common: {
      never: 'Nigdy',
      nonVintage: 'Bez rocznika',
      filter: 'Filtruj',
      clear: 'Wyczyść',
      scale: 'Skala 0–5',
      levelOf: (n: number) => `${n} z 5`,
      matchPercent: (n: number) => `Dopasowanie ${n} procent`,
      engineScore: 'Wynik dopasowania silnika',
      wineRemoved: 'Wino usunięte',
      viewAsGuest: 'Zobacz jak gość',
      openGuestApp: 'Otwórz aplikację gościa',
      lastPublished: (when: string) => `Ostatnia publikacja: ${when}`
    },
    nav: {
      label: 'Panel',
      dashboard: 'Pulpit',
      menu: 'Menu',
      wines: 'Karta win',
      pairings: 'Parowania',
      review: 'Do przeglądu',
      opportunities: 'Okazje',
      publish: 'Publikacja',
      restaurant: 'Restauracja',
      importMenu: 'Import menu',
      importWines: 'Import win',
      setup: 'Ustawienia',
      qr: 'Kod QR',
      signOut: 'Wyloguj'
    },
    login: {
      brandTitle: 'Twoja karta. Twoje parowania.',
      brandText: 'Sprawdzaj parowania, które widzą goście, dbaj o aktualną kartę win i śledź, jak stoliki zamawiają wino.',
      brandFooter: 'Dla zespołów restauracji',
      title: 'Zaloguj się',
      description: 'Użyj służbowego adresu e-mail.',
      email: 'Służbowy e-mail',
      password: 'Hasło',
      submit: 'Zaloguj się',
      errors: {
        invalid_credentials: 'Nieprawidłowy e-mail lub hasło albo konto jest chwilowo zablokowane.',
        no_panel_access: 'To konto nie ma dostępu do panelu. Kelnerzy korzystają z podglądu parowań.',
        unexpected: 'Logowanie nie powiodło się. Spróbuj ponownie za chwilę.'
      }
    },
    forbidden: {
      title: 'Brak dostępu',
      text: 'Twoje konto nie ma dostępu do panelu tej restauracji. Poproś właściciela o dodanie albo zaloguj się na inne konto.',
      back: 'Wstecz'
    },
    notFound: {
      title: 'Nie znaleziono',
      text: 'Ta restauracja, danie lub wino nie istnieje. Mogło zostać usunięte podczas ostatniego importu.',
      back: 'Wróć do panelu'
    },
    error: {
      title: 'Nie udało się wczytać strony',
      text: 'Coś poszło nie tak podczas wczytywania danych. Goście tego nie odczuwają. Spróbuj ponownie za chwilę.',
      retry: 'Spróbuj ponownie'
    },
    loading: 'Wczytywanie strony',
    flash: {
      notSaved: 'Nie zapisano',
      viewOnly: 'Tylko podgląd',
      saved: {
        approved: () => 'Parowanie zatwierdzone.',
        rejected: () => 'Parowanie odrzucone. Po publikacji nie będzie polecane do tego dania.',
        restored: () => 'Parowanie przywrócone jako propozycja.',
        role: () => 'Rola zmieniona.',
        note: () => 'Notatka zapisana.',
        moved: () => 'Kolejność zmieniona.',
        added: () => 'Parowanie dodane.',
        deleted: () => 'Parowanie usunięte.',
        approved_all: (n: number) => `Zatwierdzono ${n} ${plural(n, 'parowanie', 'parowania', 'parowań')}.`,
        wine_shown: () => 'Wino wróciło do karty. Goście już je widzą.',
        wine_hidden: () => 'Wino jest ukryte przed gośćmi. Nie widzą go już.',
        published: (n: number) => `Opublikowano wersję ${n}. Goście już widzą zmiany.`,
        settings: () => 'Ustawienie zapisane. Goście widzą je od razu.',
        import_uploaded: () => 'Plik wczytany. Sprawdź wiersze poniżej, popraw, co trzeba, i zaimportuj.',
        import_checked: () => 'Wiersze sprawdzone ponownie.',
        imported: (created: number, updated: number, suggestions: number) => `Zaimportowano: nowe ${created}, zaktualizowane ${updated}. Propozycje silnika do przeglądu: ${suggestions}.`,
        import_cancelled: () => 'Import anulowany. Nic nie zostało zmienione.',
        details: () => 'Dane zapisane.',
        details_slug: () => 'Dane zapisane. Adres aplikacji gościa się zmienił: wydrukuj nowe kody QR, stare już nie działają.',
        suggestions: (n: number) => `Dodano propozycje silnika: ${n}.`,
        translations: () => 'Tłumaczenia zapisane. Goście zobaczą je po publikacji.',
        content: () => 'Język treści i tłumaczenia zapisane. Goście zobaczą je po publikacji.',
        suggestion_added: () => 'Dodano do propozycji — zatwierdź je w „Propozycjach silnika”. Goście zobaczą zmianę dopiero po zatwierdzeniu i publikacji.',
        opportunity_dismissed: (days: number) => `Okazja zignorowana. Wróci najwcześniej po ${days} dniach, jeśli nadal będzie aktualna.`,
        opportunity_restored: () => 'Okazja przywrócona.'
      },
      errors: {
        version_conflict: 'Ktoś przed chwilą zmienił to parowanie. Strona pokazuje teraz najnowszą wersję, spróbuj ponownie.',
        forbidden: 'Nie masz uprawnień do tej czynności.',
        comment_too_long: 'Notatka może mieć najwyżej 140 znaków.',
        already_paired: 'To wino jest już sparowane z tym daniem.',
        wine_required: 'Wybierz wino do parowania.',
        wine_not_available: 'To wino jest ukryte przed gośćmi. Najpierw pokaż je w karcie win.',
        invalid_role: 'Wybierz: podstawowe, alternatywa albo najlepsza cena.',
        primary_is_pinned: 'Parowanie podstawowe jest zawsze pierwsze.',
        cannot_move: 'Tego parowania nie da się przesunąć dalej w tym kierunku.',
        not_rejected: 'Przywrócić można tylko odrzucone parowanie.',
        pairing_rejected: 'Najpierw przywróć parowanie.',
        only_manual_pairings_can_be_deleted: 'Parowania silnika można odrzucić, ale nie usunąć.',
        nothing_to_publish: 'Nie ma nieopublikowanych zmian.',
        multiple_primary: 'Danie może mieć tylko jedno parowanie podstawowe.',
        duplicate_pairing: 'Danie i wino można sparować tylko raz.',
        not_found: 'Ten element już nie istnieje.',
        no_file: 'Wybierz plik do przesłania.',
        file_too_large: 'Plik jest większy niż 10 MB albo zbyt duży po rozpakowaniu.',
        empty_file: 'Plik jest pusty albo nie ma danych.',
        unsupported_format: 'Ten rodzaj pliku nie jest obsługiwany. Prześlij plik CSV, Excel (.xlsx) albo PDF.',
        legacy_xls: 'Stare pliki Excela (.xls) nie są obsługiwane. Zapisz plik jako .xlsx lub CSV i prześlij ponownie.',
        format_mismatch: 'Plik nie jest tym, na co wskazuje nazwa (np. plik tekstowy nazwany .xlsx). Wyeksportuj go ponownie ze swojego systemu.',
        corrupt_file: 'Nie udało się otworzyć pliku. Może być uszkodzony albo chroniony hasłem. Zapisz go ponownie albo użyj CSV.',
        scanned_pdf: 'Ten PDF nie zawiera tekstu (wygląda na skan lub zdjęcie). Obrazy nie są odczytywane: wyeksportuj plik CSV lub Excel ze swojego systemu.',
        too_many_rows: 'Plik ma ponad 2000 wierszy. Podziel go i importuj w częściach.',
        no_rows: 'Plik ma nagłówek, ale nie ma wierszy.',
        job_closed: 'Ten import jest już zakończony. Rozpocznij nowy.',
        no_rows_selected: 'Zaznacz co najmniej jeden wiersz do importu.',
        unknown_row: 'Tego wiersza nie ma w tym imporcie.',
        invalid_kind: 'Importuj menu albo kartę win.',
        slug_taken: 'Inna restauracja używa już tej nazwy w adresie. Wybierz inną.',
        validation_failed: 'Sprawdź dane. Nazwa w adresie może zawierać tylko małe litery, cyfry i myślniki (od 2 do 40 znaków) i nie może być słowem zastrzeżonym.',
        translation_invalid: 'Sprawdź tłumaczenia: któreś jest za długie.',
        already_suggested: 'To wino jest już w propozycjach tego dania.',
        already_rejected: 'To parowanie zostało odrzucone — przywróć je w sekcji „Odrzucone”.',
        dish_not_published: 'To danie nie jest widoczne dla gości.',
        low_match: 'To wino słabo pasuje do dania.',
        opportunity_stale: 'Ta okazja jest już nieaktualna.',
        opportunity_not_dismissed: 'Ta okazja nie jest zignorowana.',
        unexpected: 'Nie udało się zapisać zmiany. Nic nie zostało zmienione, spróbuj ponownie.'
      }
    },
    badges: {
      published: 'Opublikowane',
      draft: 'Szkic',
      hidden: 'Ukryte',
      confirmed: 'Potwierdzony',
      draftProfile: 'Szkic, do sprawdzenia',
      active: 'Aktywne',
      hiddenFromGuests: 'Ukryte przed gośćmi',
      status: { approved: 'Zatwierdzone przez sommeliera', modified: 'Zmienione przez sommeliera', suggested: 'Propozycja', rejected: 'Odrzucone' },
      roles: { primary: 'Podstawowe', alternative: 'Alternatywa', best_value: 'Najlepsza cena' }
    },
    dashboard: {
      title: 'Pulpit',
      description: (restaurant: string, when: string) => `${restaurant}. Ostatnia publikacja: ${when}.`,
      dataSource: (source: string) => `Źródło danych: ${source}`,
      guestView: 'Widok gościa',
      waitingTitle: (n: number) => `Propozycje silnika czekające na Twój przegląd: ${n}`,
      waitingText: 'Goście widzą propozycję jako „Polecane do Twojego dania”, nigdy jako „Para sommeliera”, dopóki jej nie zatwierdzisz.',
      reviewNow: 'Przejrzyj teraz',
      program: 'Program win',
      sommelierLed: 'Dania z parowaniem sommeliera',
      sommelierLedValue: (n: number, of: number) => `${n} z ${of}`,
      sommelierLedDetail: 'Opublikowane dania z zatwierdzonym parowaniem podstawowym',
      publishedDishes: 'Opublikowane dania',
      publishedDishesDetail: (total: number, draft: number, hidden: number) => `W menu: ${total}, szkice: ${draft}, ukryte: ${hidden}`,
      winesOnList: 'Wina w karcie',
      winesDetail: (byGlass: number, hidden: number) => `Na kieliszki: ${byGlass}${hidden ? `, ukryte przed gośćmi: ${hidden}` : ''}`,
      approvedPairings: 'Zatwierdzone parowania',
      approvedDetail: (suggested: number, rejected: number) => `Propozycje: ${suggested}, odrzucone: ${rejected}`,
      attention: 'Wymaga uwagi',
      attentionText: (reviewed: number, of: number) => `${reviewed} z ${of} dań ma co najmniej jedno zatwierdzone parowanie.`,
      upToDate: 'Nie ma nic do przejrzenia. Program jest aktualny.',
      menuEmpty: 'Menu jest puste.',
      importMenu: 'Zaimportuj menu',
      winesEmpty: 'Karta win jest pusta.',
      importWines: 'Zaimportuj kartę win',
      unpublished: (n: number) => `Nieopublikowane zmiany: ${n}.`,
      publish: 'Opublikuj',
      noPrimary: (n: number) => `Dania bez podstawowego wyboru: ${n}`,
      andMore: (n: number) => `i ${n} więcej`,
      draftProfiles: (n: number) => `Profile smaku wciąż w szkicu: ${n}.`,
      openMenu: 'Otwórz menu',
      hiddenWines: (n: number) => `Wina ukryte przed gośćmi: ${n}.`,
      openWines: 'Otwórz kartę win',
      opportunities: (n: number) => `Okazje: ${n}`,
      openOpportunities: 'Otwórz okazje',
      activity: 'Aktywność gości',
      activityText: 'Sesje, pokazane rekomendacje, wybrane wina i przychód z wina.',
      noGuests: 'Goście jeszcze nie korzystali z Wine Match',
      noGuestsText: 'Dane o korzystaniu i sprzedaży pojawią się tutaj, gdy goście zaczną używać aplikacji. Na razie nic nie zarejestrowano.',
      getQr: 'Pobierz kod QR',
      openGuestApp: 'Otwórz aplikację gościa'
    },
    menu: {
      title: 'Menu',
      description: (n: number) => `${n} ${plural(n, 'danie', 'dania', 'dań')}. Profile smaku sterują doborem win; sprawdź każdy szkic profilu, zanim na nim polegasz.`,
      search: 'Szukaj dań',
      category: 'Kategoria',
      allCategories: 'Wszystkie kategorie',
      noneTitle: 'Nie znaleziono dań',
      noneEmpty: 'Ta restauracja nie ma jeszcze dań.',
      noneFiltered: 'Spróbuj innego wyszukiwania lub kategorii.',
      importMenu: 'Zaimportuj menu',
      dish: 'Danie',
      price: 'Cena',
      status: 'Status',
      profile: 'Profil smaku',
      pairings: 'Parowania',
      approved: 'zatwierdzone',
      toReview: (n: number) => `do przeglądu: ${n}`
    },
    dish: {
      back: 'Menu',
      managePairings: 'Zarządzaj parowaniami',
      details: 'Szczegóły',
      category: 'Kategoria',
      price: 'Cena',
      status: 'Status',
      protein: 'Główny składnik',
      cooking: 'Obróbka',
      pairings: 'Parowania',
      pairingsSummary: (approved: number, hasPrimary: boolean) => `Zatwierdzone: ${approved}${hasPrimary ? ', z podstawowym' : ', bez podstawowego'}`,
      pairingsDetail: (suggested: number, rejected: number) => `do przeglądu: ${suggested}, odrzucone: ${rejected}`,
      topMatches: 'Najlepsze dopasowania do tego profilu',
      topMatchesText: 'Ranking silnika wśród aktywnych win, przed decyzją sommeliera.',
      profile: 'Profil smaku',
      profileDraft: 'Szkic na podstawie zaimportowanego opisu. Sprawdź go, zanim zaczniesz polegać na wynikach.',
      profileConfirmed: 'Potwierdzony przez zespół restauracji.',
      scales: {
        intensity: 'Intensywność', fat: 'Tłustość', salt: 'Słoność', sweetness: 'Słodycz', acidity: 'Kwasowość',
        spice: 'Pikantność', umami: 'Umami', smoke: 'Dym, przypieczenie', creaminess: 'Kremowość'
      }
    },
    wines: {
      title: 'Karta win',
      description: (active: number, byGlass: number) => `Aktywne wina: ${active}, na kieliszki: ${byGlass}.`,
      search: 'Szukaj producenta, wina, regionu, szczepu',
      searchLabel: 'Szukaj win',
      style: 'Styl',
      allStyles: 'Wszystkie style',
      noneTitle: 'Nie znaleziono win',
      noneEmpty: 'Ta restauracja nie ma jeszcze win.',
      noneFiltered: 'Spróbuj innego wyszukiwania lub stylu.',
      importWines: 'Zaimportuj kartę win',
      producerAndWine: 'Producent i wino',
      vintage: 'Rocznik',
      region: 'Region',
      grape: 'Szczep',
      serving: 'Podanie',
      glass: 'Kieliszek',
      bottle: 'Butelka',
      availability: 'Dostępność',
      changeAvailability: 'Zmień dostępność',
      approvedPairings: (n: number) => `zatwierdzone parowania: ${n}`,
      glassAndBottle: 'Kieliszek i butelka',
      bottleOnly: 'Tylko butelka',
      hide: 'Ukryj',
      show: 'Pokaż'
    },
    wine: {
      back: 'Karta win',
      listing: 'Karta i ceny',
      style: 'Styl',
      abv: (style: string, alcohol: number) => `${style}, ${alcohol}% alk.`,
      listNo: 'Nr w karcie',
      serving: 'Podanie',
      glassAndBottle: (ml: number) => `Kieliszek (${ml} ml) i butelka`,
      bottleOnly: 'Tylko butelka',
      glassPrice: 'Cena kieliszka',
      bottlePrice: 'Cena butelki',
      character: 'Charakter',
      adventurous: 'Odważne',
      classic: 'Klasyczne',
      bestDishes: 'Najlepsze dania do tego wina',
      bestDishesText: 'Ranking silnika wśród dań z menu, przed decyzją sommeliera.',
      profile: 'Profil wina',
      profileText: 'Skala 0–5.',
      approved: 'Zatwierdzone parowania',
      approvedText: 'Dania, do których sommelier wybrał to wino.',
      noApproved: 'Brak zatwierdzonych parowań.',
      scales: {
        body: 'Ciało', acidity: 'Kwasowość', tannin: 'Taniny', sweetness: 'Słodycz',
        fruitiness: 'Owocowość', oak: 'Beczka', aromatic: 'Aromatyczność', freshness: 'Świeżość'
      }
    },
    review: {
      title: 'Do przeglądu',
      description: 'Parowania zaproponowane przez silnik do Twojej karty. Nic tutaj nie jest oznaczone jako para sommeliera, dopóki tego nie zatwierdzisz.',
      approveAll: (n: number) => `Zatwierdź wszystkie (${n})`,
      readOnly: 'Możesz śledzić kolejkę. Parowania zatwierdza lub odrzuca tylko Wine Director.',
      progress: (reviewed: number, of: number) => `${reviewed} z ${of} dań ma co najmniej jedno zatwierdzone parowanie`,
      left: (n: number) => `Pozostałe propozycje: ${n}`,
      progressLabel: 'Postęp przeglądu',
      doneTitle: 'Wszystko przejrzane',
      doneText: 'Goście widzą najpierw Twoje zatwierdzone parowania, a pozostałe miejsca uzupełnia silnik.',
      noPrimary: 'Brak podstawowego wyboru',
      approveDish: 'Zatwierdź wszystkie dla dania',
      openPairings: 'Otwórz parowania',
      approve: 'Zatwierdź',
      reject: 'Odrzuć'
    },
    pairings: {
      title: (dish: string) => `Parowania: ${dish}`,
      noDishes: 'Nie ma jeszcze dań.',
      readOnly: 'Widzisz wszystkie parowania, historię i to, co widzą goście. O parowaniach decyduje tylko Wine Director.',
      dishes: 'Dania',
      approvedTitle: 'Zatwierdzone dla gości',
      approvedText: 'W tej kolejności. Wybór podstawowy jest zawsze pierwszy; goście widzą Twoją notatkę jako „Dlaczego pasuje”.',
      noneApproved: 'Brak zatwierdzonych parowań. Zatwierdź propozycję silnika poniżej albo dodaj własne.',
      prices: (glass: string | null, bottle: string) => `${glass !== null ? `kieliszek ${glass}, ` : 'Tylko butelka, '}butelka ${bottle}`,
      hiddenFromGuests: ' · ukryte przed gośćmi',
      unpublished: 'Nieopublikowane',
      roleOf: (name: string) => `Rola: ${name}`,
      setRole: 'Ustaw rolę',
      moveUp: 'Przesuń wyżej',
      up: '↑ Wyżej',
      moveDown: 'Przesuń niżej',
      down: '↓ Niżej',
      reject: 'Odrzuć',
      rejectTitle: 'Nigdy nie polecaj tego wina do tego dania',
      delete: 'Usuń',
      deleteTitle: 'Usuń to parowanie',
      editNote: 'Edytuj notatkę dla gości',
      addNote: 'Dodaj notatkę dla gości',
      notePlaceholder: 'Wyświetlana jako „Dlaczego pasuje”. 140 znaków.',
      noteLabel: 'Notatka dla gości',
      saveNote: 'Zapisz notatkę',
      noteIn: (lang: string) => `Notatka — ${lang}`,
      noteBase: 'Notatka bazowa',
      noteTranslationsHelp: 'Goście widzą notatkę w swoim języku; puste pole pokazuje notatkę bazową.',
      suggestionsTitle: 'Propozycje silnika',
      suggestionsText: 'Goście widzą je jako „Polecane do Twojego dania”, nigdy jako Twoją parę, dopóki ich nie zatwierdzisz.',
      approveAll: (n: number) => `Zatwierdź wszystkie (${n})`,
      allReviewed: 'Wszystkie propozycje przejrzane.',
      approve: 'Zatwierdź',
      addTitle: 'Dodaj własne parowanie',
      addText: 'Wybierz dowolne wino z karty. Wynik silnika jest tylko podpowiedzią; Twój wybór zawsze wygrywa.',
      wine: 'Wino',
      chooseWine: 'Wybierz wino',
      engineScore: (n: number) => `silnik ${n}%`,
      role: 'Rola',
      primaryRecommendation: 'Rekomendacja podstawowa',
      noteOptional: 'Notatka dla gości (opcjonalnie)',
      notePlaceholderShort: 'Dlaczego pasuje, własnymi słowami',
      add: 'Dodaj parowanie',
      rejectedTitle: 'Odrzucone',
      rejectedText: 'Po publikacji nigdy nie polecane do tego dania.',
      restore: 'Przywróć jako propozycję',
      historyTitle: 'Historia',
      historyText: 'Ostatnie decyzje dotyczące tego dania. Ślad zostaje także po usunięciu parowania.',
      noHistory: 'Brak decyzji.',
      actions: {
        approve: 'zatwierdza', modify: 'zmienia', reject: 'odrzuca', restore: 'przywraca', set_role: 'zmienia rolę:',
        reorder: 'zmienia kolejność:', comment: 'edytuje notatkę:', create: 'dodaje', delete: 'usuwa'
      },
      guestsTitle: 'Co teraz widzą goście',
      guestsText: 'Opublikowana wersja, bez filtrów.',
      unpublishedBefore: 'To danie ma zmiany, których goście jeszcze nie widzą.',
      unpublishedLink: 'Opublikuj',
      unpublishedAfter: ', aby je pokazać.',
      notShown: 'Niewidoczne dla gości: danie nie jest opublikowane albo żadne wino nie przekracza progu.',
      sommelier: 'Para sommeliera',
      bestValue: 'Najlepsza cena'
    },
    opportunities: {
      title: 'Okazje',
      description: 'Miejsca w menu i karcie win, w które warto zajrzeć, pogrupowane po daniach.',
      readOnly: 'Widzisz wszystkie okazje. Do propozycji dodaje i okazje ignoruje tylko Wine Director.',
      badge: 'Okazja',
      dishTitle: 'Okazje dla tego dania',
      dishText: 'Warto zajrzeć. Dla gości nic się nie zmienia, dopóki nie zatwierdzisz parowania i nie opublikujesz zmian.',
      all: 'Wszystkie okazje',
      openPairings: 'Otwórz parowania',
      current: 'Obecne parowania',
      noCurrent: 'brak',
      add: 'Dodaj do propozycji',
      approve: 'Zatwierdź',
      ignore: 'Ignoruj',
      restore: 'Przywróć',
      emptyTitle: 'Nic do sprawdzenia.',
      emptyText: 'Gdy w daniu albo winie będzie coś wartego uwagi, pojawi się tutaj.',
      degraded: 'Część okazji jest chwilowo niedostępna.',
      dismissed: (n: number) => `Zignorowane (${n})`,
      dismissedBy: (name: string, until: string) => `${name} · wróci ${until}`,
      rules: {
        dish_no_primary: 'Danie bez podstawowego wyboru',
        glass_match_unpaired: 'Dopasowanie na kieliszki',
        wine_unpaired: 'Wino bez parowania',
        shown_rarely_chosen: 'Rzadko wybierane parowanie',
        ordered_not_reviewed: 'Zamawiane, niezatwierdzone'
      },
      sentences: {
        none: () => 'To danie nie ma jeszcze zatwierdzonego parowania.',
        no_primary: () => 'To danie ma zatwierdzone parowania, ale żadne nie jest podstawowe.',
        primary_hidden: (wine: string) => `Wino podstawowe tego dania (${wine}) jest ukryte, więc goście go nie widzą.`,
        glass_match_unpaired: (wine: string, score: number, price: string) => `${wine} pasuje do tego dania na ${score}%, jest na kieliszki (${price}), a żadne z parowań tego dania nie jest na kieliszki.`,
        wine_unpaired: (wine: string, dish: string, score: number) => `${wine} jest w karcie, ale nie ma żadnego zatwierdzonego parowania. Najlepiej pasuje do „${dish}” (${score}%).`,
        shown_rarely_chosen: (wine: string, shown: number, days: number, chosen: number, rate: number, otherRate: number) => `Gdy goście widzieli ${wine} przy tym daniu (${shown} ${plural(shown, 'raz', 'razy', 'razy')} w ostatnich ${days} dniach), wybrali je ${chosen} ${plural(chosen, 'raz', 'razy', 'razy')} (${rate}%); pozostałe wina do tego dania wybierali w ${otherRate}% przypadków.`,
        ordered_not_reviewed: (wine: string, orders: number, days: number) => `${wine} zamówiono z kodem polecenia do tego dania ${orders} ${plural(orders, 'raz', 'razy', 'razy')} w ostatnich ${days} dniach, a to parowanie nie jest zatwierdzone.`
      }
    },
    publish: {
      title: 'Publikacja',
      description: (when: string, version: string) => `Ostatnia publikacja: ${when}${version}. Goście widzą opublikowaną wersję przez kod QR.`,
      version: (n: number, by: string) => ` (wersja ${n}, ${by})`,
      readOnly: 'Twoja rola nie pozwala publikować.',
      checklist: 'Przed publikacją',
      checklistText: 'Zalecane, nie wymagane.',
      noPrimary: (n: number) => `Dania bez podstawowego wyboru: ${n}`,
      allPrimary: 'Każde danie ma podstawowy wybór',
      allPrimaryText: 'Goście zawsze widzą najpierw Twój pierwszy wybór.',
      fix: 'Popraw',
      unreviewed: (n: number) => `Nieprzejrzane propozycje silnika: ${n}`,
      allReviewed: 'Wszystkie propozycje przejrzane',
      unreviewedShown: 'Nieprzejrzane propozycje mogą się pojawić jako „Polecane do Twojego dania”, nigdy jako „Para sommeliera”.',
      unreviewedHidden: 'Nieprzejrzane propozycje są ukryte przed gośćmi.',
      review: 'Przejrzyj',
      draftProfiles: (n: number) => `Profile smaku wciąż w szkicu: ${n}`,
      allConfirmed: 'Wszystkie profile smaku potwierdzone',
      allConfirmedText: 'Wyniki opierają się na sprawdzonych profilach.',
      check: 'Sprawdź',
      newDishes: (n: number) => `Nowe dania, które trafią do gości: ${n}`,
      noNewDishes: 'Brak nowych dań',
      noNewDishesText: 'Menu się nie zmieniło od ostatniej publikacji.',
      names: (list: string, more: number) => (more > 0 ? `${list} i ${more} więcej` : list),
      settings: 'Ustawienia dla gości',
      settingsText: 'Działają od razu; nie są częścią publikowanej wersji.',
      showUnreviewed: 'Uzupełniaj puste miejsca propozycjami silnika',
      showUnreviewedText: 'Po wyłączeniu lista win do dania pokazuje tylko zatwierdzone przez Ciebie parowania. Butelkę dla „Całego stolika” silnik nadal wybiera z całej karty.',
      showScores: 'Pokazuj gościom procent dopasowania',
      showScoresText: 'Ikona kieliszka jest widoczna zawsze.',
      saveSettings: 'Zapisz ustawienia',
      pending: (n: number) => `Nieopublikowane zmiany: ${n}`,
      latest: 'Goście widzą najnowszą wersję',
      pendingText: (pairings: number, dishes: number) => `Parowania: ${pairings}, nowe dania: ${dishes}. Publikacja od razu aktualizuje aplikację gościa; kod QR się nie zmienia.`,
      nothing: 'Nie ma nic do opublikowania.',
      preview: 'Podgląd aplikacji gościa',
      submit: 'Opublikuj zmiany',
      upToDate: 'Wszystko aktualne',
      upToDateText: 'Wprowadź zmianę w Parowaniach lub w kolejce Do przeglądu, potem wróć tutaj, aby ją opublikować.',
      versionBadge: (n: number) => `Wersja ${n}`
    },
    explain: {
      dashboard: {
        summary: 'Co liczą te kafelki?',
        points: (f: EngineFacts) => [
          'Dania z parowaniem sommeliera: opublikowane dania z zatwierdzoną parą podstawową. Przy nich gość zawsze widzi najpierw Twój wybór.',
          'Zatwierdzone parowania: zatwierdzone i zmienione. Po publikacji gość widzi je jako „Para sommeliera”.',
          `Propozycje silnika czekają w kolejce. Gdy włączone „Uzupełniaj puste miejsca propozycjami silnika”, gość widzi je od ${f.minModelScore}% jako „Polecane do Twojego dania”, nigdy jako „Para sommeliera”.`,
          'Wina w karcie: aktywne wina. Ukrytego wina gość nigdy nie zobaczy.'
        ]
      },
      menu: {
        summary: 'Jak profil smaku wpływa na pary?',
        points: [
          'Profil smaku to jedyne dane dania, z których silnik liczy ocenę: intensywność, tłuszcz, sól, słodycz, kwasowość, ostrość, umami, dym i kremowość w skali 0–5 oraz główny składnik i technika.',
          'Profil „Szkic” powstał z opisu przy imporcie. Ten sam profil zawsze daje te same oceny, więc błędny profil daje błędne pary: najpierw go sprawdź.'
        ]
      },
      score: {
        summary: 'Jak silnik liczy ocenę?',
        points: (f: EngineFacts) => [
          `Każda para startuje od ${f.baseScore}. Reguły sommelierskie dodają lub odejmują punkty: waga, kwasowość wobec tłuszczu, słodycz, taniny wobec ryby, ostrość wobec alkoholu, dym i beczka, sól i bąbelki, kremowość, umami oraz klasyczne połączenia.`,
          `Wynik mieści się w skali 0–${f.maxScore}. Te same profile zawsze dają tę samą ocenę, więc sprawdź profil szkicowy, zanim mu zaufasz.`,
          `Gość widzi propozycję silnika dopiero od ${f.minModelScore}%. Twoje zatwierdzenie zmienia miejsce wina na liście, nigdy jego ocenę.`
        ]
      },
      wines: {
        summary: 'Co znaczy ukrycie wina?',
        points: [
          'Ukryte wino od razu znika z rekomendacji dla gości, także z Twoich par. Publikacja nie jest potrzebna.',
          '„Pokaż” od razu je przywraca.'
        ]
      },
      pairings: {
        summary: 'Jak gość widzi Twoje pary?',
        points: (f: EngineFacts) => [
          `Kolejność: para podstawowa, pozostałe zatwierdzone w Twojej kolejności, potem propozycje silnika (od ${f.minModelScore}%, gdy włączone „Uzupełniaj puste miejsca…”). Gość widzi najwyżej ${f.dishLimit} ${plural(f.dishLimit, 'wino', 'wina', 'win')}.`,
          'Procent to zawsze ocena silnika: zatwierdzenie zmienia kolejność, nie liczbę. Twoja notatka zastępuje uzasadnienie silnika.',
          `Odrzucona para nigdy nie pojawi się przy tym daniu. Przy „Całym stoliku” tylko obniża wynik tego dania do ${f.tableRejectedCap} w rankingu butelek.`,
          'Filtry gościa mogą ukryć nawet parę podstawową (np. wino tylko na butelki przy filtrze „Na kieliszki”).',
          `Najlepsza cena: Twoja para w tej roli, jeśli jest na liście; bez niej najtańsza butelka tańsza od pierwszego wina, najwyżej ${f.bestValueWindow} pkt słabsza od najlepszej.`
        ]
      },
      suggestions: {
        summary: 'Jak gość widzi propozycje silnika?',
        points: (f: EngineFacts) => [
          `Dopóki nie zdecydujesz, gość widzi propozycję od ${f.minModelScore}% jako „Polecane do Twojego dania” (gdy włączone „Uzupełniaj puste miejsca…”), nigdy jako Twoją parę.`,
          'Zatwierdź: po publikacji staje się „Parą sommeliera” i wyprzedza propozycje silnika. Odrzuć: nigdy nie będzie polecana do tego dania.'
        ]
      },
      review: {
        summary: 'Co daje zatwierdzenie?',
        points: (f: EngineFacts) => [
          'Po publikacji zatwierdzona para ma u gościa etykietę „Para sommeliera” i stoi przed propozycjami silnika.',
          `Odrzucona para nigdy nie będzie polecana do tego dania. Przy „Całym stoliku” tylko obniża wynik dania do ${f.tableRejectedCap} w rankingu butelek.`,
          `Nieprzejrzane propozycje gość widzi od ${f.minModelScore}% jako „Polecane do Twojego dania”, gdy włączone „Uzupełniaj puste miejsca…”.`
        ]
      },
      publish: {
        summary: 'Co zmieniają te ustawienia?',
        points: (f: EngineFacts) => [
          `Uzupełniaj puste miejsca: gdy włączone, gość widzi też propozycje silnika od ${f.minModelScore}%; gdy wyłączone, lista win do dania pokazuje tylko Twoje pary.`,
          'Butelkę dla „Całego stolika” silnik zawsze wybiera z całej aktywnej karty, niezależnie od tego ustawienia.',
          'Pokazuj procent: gdy wyłączone, gość widzi kieliszek wypełniony do poziomu dopasowania, bez liczby — także na „Całym stoliku” (paski bez liczb); ekran kelnera pokazuje procent zawsze.',
          'Oba ustawienia działają od razu, bez publikacji.'
        ]
      },
      opportunities: {
        summary: 'Czym są okazje?',
        points: (days: number) => [
          'Okazje to podpowiedzi, gdzie warto zajrzeć. Liczymy je z Twojej karty i ocen dopasowania, a gdy są dane — z wyborów gości i zamówień z kodem polecenia, tylko w tej restauracji.',
          `Nic się nie zmienia bez Twojej decyzji; zignorowana okazja wraca najwcześniej po ${days} dniach.`
        ]
      }
    },
    qr: {
      title: 'Kod QR',
      description: 'Postaw go na każdym stoliku. Goście go skanują, wybierają danie i widzą pasujące wina.',
      print: 'Drukuj stojak na stolik',
      unpublishedBefore: 'Aplikacja gościa pokazuje puste menu, dopóki nie',
      unpublishedLink: 'opublikujesz zmian',
      unpublishedAfter: '. Kod możesz wydrukować już teraz: nie zmieni się.',
      localBefore: 'Ten kod prowadzi do',
      localAfter: ', adresu, który działa tylko na tym komputerze. Przed drukiem ustaw',
      localEnd: 'na prawdziwy adres.',
      tentLine: 'Znajdź wino do tego, co jesz.',
      alt: (name: string) => `Kod QR otwierający ${name}`,
      scan: 'Zeskanuj aparatem telefonu',
      download: 'Pobierz',
      downloadText: 'SVG jest ostry w każdym rozmiarze: najlepszy dla drukarni.',
      link: 'Link',
      linkText: 'Ten sam adres do menu, na stronę internetową albo do wiadomości.'
    },
    translations: {
      title: 'Tłumaczenia',
      text: 'Goście i panel widzą wersję w swoim języku. Puste pole pokazuje tekst bazowy.',
      base: (lang: string) => `Tekst bazowy (${lang})`,
      field: (field: string, lang: string) => `${field} (${lang})`,
      fields: { name: 'Nazwa', description: 'Opis', tastingNote: 'Notatka degustacyjna', region: 'Region', country: 'Kraj', tagline: 'Hasło', city: 'Miasto' },
      save: 'Zapisz tłumaczenia',
      afterPublish: 'Goście zobaczą zmiany po publikacji.',
      readOnly: 'Twoja rola nie może zmieniać tłumaczeń.',
      contentTitle: 'Język treści i tłumaczenia',
      contentText: 'Język, w którym napisano menu, kartę win i notatki (teksty bazowe), oraz hasło i miasto w obu językach.',
      contentLocale: 'Język tekstów bazowych',
      contentWarning: 'Zmiana tego języka niczego nie tłumaczy: mówi tylko, w jakim języku są teksty bazowe.',
      saveContent: 'Zapisz'
    },
    setup: {
      title: 'Ustawienia',
      description: 'Wszystko, co prowadzi restaurację od pustego konta do gości skanujących kod.',
      checklist: 'Lista kroków',
      next: (step: string) => `Następny krok: ${step.toLowerCase()}.`,
      allDone: 'Wszystko gotowe.',
      steps: {
        details: 'Dane restauracji', menu: 'Zaimportuj menu', wines: 'Zaimportuj kartę win', profiles: 'Sprawdź profile smaku',
        pairings: 'Przejrzyj parowania', publish: 'Opublikuj', qr: 'Wydrukuj kod QR'
      },
      states: {
        details: (r: { name: string; address: string; city: string; slug: string }) => `${r.name}, ${r.address}, ${r.city}. Nazwa w adresie dla gości: ${r.slug}.`,
        menu_done: (v: Record<string, number>) => `W menu: ${v.dishes} ${plural(v.dishes, 'danie', 'dania', 'dań')}.`,
        menu_empty: () => 'Prześlij plik CSV, Excel lub PDF.',
        wines_done: (v: Record<string, number>) => `W karcie: ${v.active} ${plural(v.active, 'wino', 'wina', 'win')}, na kieliszki: ${v.byGlass}.`,
        wines_empty: () => 'Prześlij plik CSV, Excel lub PDF.',
        profiles_no_menu: () => 'Najpierw zaimportuj menu.',
        profiles_done: () => 'Każdy profil dania jest potwierdzony.',
        profiles_drafts: (v: Record<string, number>) => `W szkicu: ${v.drafts} z ${v.dishes} profili dań.`,
        pairings: (v: Record<string, number>) => `Zatwierdzone: ${v.approved}, propozycje do przeglądu: ${v.suggestions}.`,
        publish_never: () => 'Jeszcze nie opublikowano.',
        publish_pending: (v: Record<string, number>) => `Nieopublikowane zmiany: ${v.changes}.`,
        publish_done: () => 'Goście widzą najnowszą wersję.',
        qr_done: () => 'Postaw kod na stolikach.',
        qr_wait: () => 'Najpierw opublikuj, potem wydrukuj kod.'
      },
      links: { menu: 'Importuj menu', wines: 'Importuj wina', profiles: 'Otwórz menu', pairings: 'Przejrzyj', publish: 'Opublikuj', qr: 'Kod QR' },
      details: 'Dane restauracji',
      detailsText: 'Widoczne dla gości na stronie startowej.',
      readOnly: 'Te dane zmienia tylko właściciel lub General Manager.',
      name: 'Nazwa',
      address: 'Adres',
      city: 'Miasto',
      wineDirector: 'Wine Director',
      slug: 'Nazwa w adresie',
      slugHelpBefore: 'Goście otwierają',
      slugWarning: 'Zmiana nazwy w adresie unieważnia wszystkie wydrukowane kody QR.',
      save: 'Zapisz dane',
      suggestions: 'Propozycje parowań',
      suggestionsText: 'Przygotowuje propozycje silnika dla dań i win, które ich jeszcze nie mają. Nigdy nie zmienia Twoich decyzji.',
      generate: 'Utwórz propozycje',
      live: 'Widoczne dla gości',
      noBaseUrl: 'Nie ustawiono PUBLIC_BASE_URL: kod QR prowadzi do localhost. Przed drukiem ustaw prawdziwy adres.'
    },
    import: {
      menuTitle: 'Import menu',
      menuDescription: 'Wczytaj dania z pliku. Sprawdzasz każdy wiersz, zanim cokolwiek zostanie zapisane.',
      winesTitle: 'Import karty win',
      winesDescription: 'Wczytaj wina z pliku. Sprawdzasz każdy wiersz, zanim cokolwiek zostanie zapisane.',
      readOnly: 'Twoja rola nie pozwala importować plików.',
      kinds: {
        menu: { noun: (n: number) => plural(n, 'danie', 'dania', 'dań'), columns: 'Kategoria, Nazwa, Opis, Cena', hint: 'Nowe dania trafiają jako szkice ze szkicem profilu smaku. Goście zobaczą je po publikacji.', updates: 'opis, kategoria i cena' },
        wines: { noun: (n: number) => plural(n, 'wino', 'wina', 'win'), columns: 'Producent, Wino, Rocznik, Region, Szczep, Styl, Cena kieliszka, Cena butelki', hint: 'Nowe wina od razu trafiają do karty i dostają propozycje parowań do Twojego przeglądu.', updates: 'ceny' }
      },
      columns: {
        name_pl: 'Nazwa (PL)', name_en: 'Nazwa (EN)', description_pl: 'Opis (PL)', description_en: 'Opis (EN)',
        tasting_note_pl: 'Notatka degustacyjna (PL)', tasting_note_en: 'Notatka degustacyjna (EN)', region_pl: 'Region (PL)', region_en: 'Region (EN)', country_pl: 'Kraj (PL)', country_en: 'Kraj (EN)',
        category: 'Kategoria', name: 'Nazwa', description: 'Opis', price: 'Cena (zł)',
        producer: 'Producent', wineName: 'Wino', vintage: 'Rocznik', region: 'Region', country: 'Kraj', grape: 'Szczep', style: 'Styl', glassPrice: 'Kieliszek', bottlePrice: 'Butelka'
      },
      uploadTitle: '1. Prześlij plik',
      uploadText: 'CSV, Excel (.xlsx) lub PDF, do 10 MB. Nic nie zostanie zapisane, dopóki nie potwierdzisz.',
      file: 'Plik',
      upload: 'Prześlij i sprawdź',
      formatTitle: 'Jak powinien wyglądać plik',
      formatText: 'Pierwszy wiersz nazywa kolumny. Działają nazwy polskie i angielskie.',
      columnsLabel: 'Kolumny:',
      pricesBefore: 'Ceny takie jak',
      pricesAnd: 'i',
      pricesAfter: 'są w porządku. PDF jest czytany jako tekst i jest mniej dokładny: sprawdź każdy wiersz.',
      sample: 'Pobierz przykładowy plik CSV',
      translationsHint: 'Opcjonalne kolumny z tłumaczeniami: dodaj _pl lub _en do nazwy kolumny (name_pl, description_en, tasting_note_pl, region_en, country_pl).',
      recent: 'Ostatnie importy',
      recentResult: (created: number, updated: number) => `nowe ${created}, zaktualizowane ${updated}`,
      continue: 'Kontynuuj',
      status: { confirmed: 'Zaimportowano', preview_ready: 'Czeka na Ciebie', cancelled: 'Anulowano' },
      rowsRead: (n: number) => `Wczytane wiersze: ${n}`,
      willImport: (n: number) => `Do importu: ${n}`,
      withErrors: (n: number) => `Z błędami: ${n}`,
      exist: (n: number) => `Już istnieją: ${n}`,
      toCheck: (n: number) => `Do sprawdzenia: ${n}`,
      checkTitle: '2. Sprawdź i popraw',
      checkText: (updates: string) => `Popraw wszystko, co jest zaznaczone na czerwono, odznacz niechciane wiersze i zaimportuj. Wiersze, które już istnieją, nie są zaznaczone; zaznacz wiersz, aby go zaktualizować (tylko ${updates}).`,
      colImport: 'Import',
      colCheck: 'Kontrola',
      importRow: (n: number) => `Importuj wiersz ${n}`,
      cellLabel: (column: string, n: number) => `${column}, wiersz ${n}`,
      update: 'Aktualizacja',
      new: 'Nowe',
      fine: 'Wygląda dobrze.',
      fix: 'Popraw: ',
      submit: (n: number, noun: string) => `Importuj ${n} ${noun}`,
      checkAgain: 'Sprawdź ponownie',
      cancel: 'Anuluj import',
      cancelledTitle: 'Ten import został anulowany',
      cancelledText: 'Nic nie zostało zmienione.',
      startNew: 'Rozpocznij nowy',
      doneTitle: '3. Zaimportowano',
      doneText: (file: string, when: string, by: string) => `${file}, ${when}, ${by}.`,
      resultNew: 'Nowe',
      resultUpdated: 'Zaktualizowane',
      resultSkipped: 'Pominięte',
      resultSuggestions: 'Propozycje',
      doneMenu: 'Nowe dania są szkicami: sprawdź ich profile smaku, przejrzyj propozycje parowań silnika i opublikuj, aby pokazać je gościom.',
      doneWines: 'Nowe wina są w karcie. Przejrzyj propozycje parowań silnika i opublikuj.',
      reviewSuggestions: 'Przejrzyj propozycje',
      openMenu: 'Otwórz menu',
      openWines: 'Otwórz kartę win',
      another: 'Importuj kolejny plik',
      notes: {
        pdf: 'Ten PDF został odczytany jako tekst. PDF nie ma prawdziwych kolumn, więc przed importem sprawdź każdy wiersz.',
        noCategory: 'Brak kolumny z kategorią: dania bez kategorii trafiają do dań głównych. Sprawdź je w podglądzie.',
        unused: (columns: string) => `Nieużyte kolumny: ${columns}.`,
        noHeader: (order: string) => `Nie znaleziono wiersza nagłówka, więc kolumny odczytano w tej kolejności: ${order}.`
      },
      issues: {
        exists_menu: () => 'Już jest w menu: import zaktualizuje opis, kategorię i cenę.',
        exists: () => 'Już jest w karcie win: import zaktualizuje ceny.',
        duplicate_in_file: (p: IssueParams) => `Występuje w pliku więcej niż raz (pierwszy raz w wierszu ${p.row}).`,
        name_missing: () => 'Brak nazwy.',
        name_too_long: () => 'Nazwa jest za długa (najwyżej 120 znaków).',
        price_missing: () => 'Brak ceny.',
        price_invalid: (p: IssueParams) => `„${p.value}” nie jest ceną.`,
        price_not_positive: () => 'Cena musi być większa od zera.',
        price_too_high: () => 'Cena wygląda na zbyt wysoką (najwyżej 10 000).',
        category_unknown: (p: IssueParams) => `Nieznana kategoria „${p.value}”: ustawiono dania główne.`,
        category_missing: () => 'Brak kategorii: ustawiono dania główne.',
        description_long: () => 'Opis jest bardzo długi.',
        producer_missing: () => 'Brak producenta.',
        wine_name_from_grape: () => 'Brak nazwy wina: użyto nazwy szczepu.',
        wine_name_missing: () => 'Brak nazwy wina.',
        wine_name_too_long: () => 'Nazwa producenta lub wina jest za długa.',
        vintage_missing: () => 'Brak rocznika: ustawiono NV (bez rocznika).',
        vintage_invalid: (p: IssueParams) => `„${p.value}” nie jest rokiem ani NV.`,
        grape_missing: () => 'Brak szczepu: profil smaku opiera się tylko na stylu.',
        style_unknown: (p: IssueParams) => `Nieznany styl „${p.value}”: przyjęto ${p.guess}.`,
        style_missing: (p: IssueParams) => `Brak stylu: przyjęto ${p.guess}.`,
        style_missing_from_grape: (p: IssueParams) => `Brak stylu: przyjęto ${p.guess} na podstawie szczepu.`,
        bottle_price_missing: () => 'Brak ceny butelki.',
        bottle_price_invalid: (p: IssueParams) => `„${p.value}” nie jest ceną.`,
        glass_price_invalid: (p: IssueParams) => `„${p.value}” nie jest ceną.`,
        glass_price_not_lower: () => 'Cena kieliszka musi być niższa niż cena butelki.',
        translation_empty: () => 'Puste tłumaczenie: zostaje dotychczasowe.',
        translation_too_long: () => 'Tłumaczenie jest za długie.'
      }
    }
  }
} satisfies Dictionary;
