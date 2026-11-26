import type { EngineFacts, ProofCaveat, ProofReason, Role } from '@wine-match/core';
import { showcasePl } from './showcase-pl';
import type { Dictionary, ExplainContext, HowItWorksSection, IssueParams, RestaurantExplainContext, TableFitText, TableQuantityText, UsageExplainFacts, WineExplainContext } from './en';

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
  showcase: showcasePl,
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
      restaurantPick: 'Wybór restauracji',
      pickNote: 'Wybór restauracji to oznaczenie samej restauracji; nie zmienia wyniku dopasowania.',
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
          'Filtry działają jak u gościa.',
          '„Zamówienie z kodu”: wpisz kod z ekranu gościa i oznacz wino jako zamówione (można cofnąć). Działają tylko dzisiejsze kody.'
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
      noDishesText: 'Menu jest właśnie aktualizowane.',
      code: {
        title: 'Zamówienie z kodu',
        label: 'Kod z ekranu gościa',
        find: 'Znajdź',
        notFound: (code: string) => `Nie ma dziś kodu ${code} w tej restauracji. Sprawdź znaki z ekranu gościa.`,
        tooMany: 'Zbyt wiele prób z tej sieci. Spróbuj ponownie za kilka minut.',
        forDish: (dish: string) => `Danie: ${dish}`,
        forTable: (dishes: string) => `Dla stołu: ${dishes}`,
        noDish: 'Wybrane bez dania',
        dishOffMenu: 'Danie spoza obecnej karty',
        wineGone: 'Wina nie ma już w karcie',
        issuedAt: (code: string, time: string) => `Kod ${code}, pokazany o ${time}`,
        confirm: 'Zamówione',
        markedAt: (time: string) => `Oznaczone o ${time}`,
        undo: 'Cofnij',
        confirmed: 'Oznaczono jako zamówione.',
        undone: 'Cofnięto oznaczenie.'
      }
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
        {
          id: 'picks',
          title: 'Wybór restauracji',
          text: ['Restauracja może oznaczyć część win jako swój wybór i pokazać je wyżej wśród propozycji. Oznaczenie nie zmienia wyniku dopasowania, a para sommeliera zawsze zostaje na górze.']
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
      importSales: 'Import sprzedaży',
      opportunities: 'Okazje',
      picks: 'Wybory restauracji',
      proof: 'Raport wyników',
      team: 'Zespół',
      acceptInvitation: 'Dołącz do restauracji'
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
      demoStart: 'Start dema',
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
      picks: 'Wybory restauracji',
      proof: 'Raport wyników',
      publish: 'Publikacja',
      restaurant: 'Restauracja',
      importMenu: 'Import menu',
      importWines: 'Import win',
      importSales: 'Import sprzedaży',
      setup: 'Ustawienia',
      qr: 'Kod QR',
      team: 'Zespół',
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
        unexpected: 'Logowanie nie powiodło się. Spróbuj ponownie za chwilę.',
        showcase_read_only: 'To demo jest tylko do odczytu: logowanie jest wyłączone, więc nie ma hasła do wpisania.',
        rate_limited: 'Zbyt wiele prób logowania z tej sieci. Spróbuj ponownie za kilka minut.'
      },
      showcaseBack: 'Wróć do przewodnika po demo',
      demo: {
        title: 'Konta demo',
        text: 'Dane demonstracyjne: restauracja i jej ludzie są zmyśleni, a zmiany mogą zniknąć. Zaloguj się jednym kliknięciem albo skopiuj poniższy e-mail i hasło do formularza.',
        signInAs: (name: string, role: string) => `Zaloguj jako ${name} (${role})`,
        lock: 'Hasło demo jest publiczne, więc zablokowane konto jest zablokowane dla każdego odwiedzającego: po 5 błędnych próbach konto jest blokowane na 15 minut.',
        start: 'Start dema'
      },
      notices: { account_created: 'Konto zostało założone i dołączyłeś do restauracji. Zaloguj się hasłem, które przed chwilą wybrałeś.' } as Record<'account_created', string>
    },
    accept: {
      title: 'Dołącz do zespołu',
      description: (restaurant: string, role: string) => `Zaproszono Cię do restauracji ${restaurant} jako ${role}.`,
      email: 'Adres e-mail z zaproszenia',
      newText: 'Podaj imię i hasło, żeby założyć konto.',
      name: 'Twoje imię',
      password: 'Hasło',
      passwordHelp: (min: number) => `Co najmniej ${min} znaków.`,
      submitNew: 'Załóż konto i dołącz',
      existingText: 'Ten adres e-mail ma już konto. Dołączenie tylko dodaje tę restaurację do konta: hasło się nie zmienia.',
      submitExisting: 'Dołącz do restauracji',
      signInText: 'Ten adres e-mail ma już konto. Zaloguj się na nie, potem otwórz ten link jeszcze raz, żeby dołączyć.',
      signIn: 'Zaloguj się',
      wrongAccountText: (email: string) => `Jesteś zalogowany na inne konto. To zaproszenie jest dla ${email}: wyloguj się i otwórz link ponownie.`,
      signOut: 'Wyloguj się',
      errors: {
        name_required: 'Wpisz swoje imię.',
        password_too_short: (min: number) => `Hasło musi mieć co najmniej ${min} znaków.`,
        password_too_long: 'Hasło jest za długie.',
        sign_in_required: 'Najpierw zaloguj się na konto z tego adresu e-mail.',
        wrong_account: 'To zaproszenie jest dla innego konta. Wyloguj się i otwórz link ponownie.',
        account_exists: 'Konto z tym adresem e-mail już istnieje. Najpierw się na nie zaloguj.',
        already_member: 'Jesteś już w zespole tej restauracji.',
        unexpected: 'Nie udało się przyjąć zaproszenia. Spróbuj ponownie za chwilę.'
      } as Record<string, string | ((min: number) => string)>,
      invalidTitle: 'Ten link już nie jest ważny',
      invalidText: 'Mógł zostać użyty, anulowany albo wygasnąć. Poproś osobę, która Cię zaprosiła, o nowy link.',
      toSignIn: 'Przejdź do logowania'
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
        imported_sales: (created: number, replaced: number, skipped: number) => `Zapisano pozycje: ${created}, zastąpione rachunki: ${replaced}, pominięte pozycje: ${skipped}.`,
        details: () => 'Dane zapisane.',
        details_slug: () => 'Dane zapisane. Adres aplikacji gościa się zmienił: wydrukuj nowe kody QR, stare już nie działają.',
        suggestions: (n: number) => `Dodano propozycje silnika: ${n}.`,
        profile_confirmed: () => 'Profil zapisany i potwierdzony. Goście zobaczą go po publikacji.',
        profile_draft: () => 'Profil zapisany jako szkic. Goście zobaczą go po publikacji.',
        profile_unchanged: () => 'Nic do zmiany: profil jest już taki.',
        catalog_saved: (languages: string) => `Zapisano. Goście widzą zmianę od razu. Tłumaczenia zostają jak w publikacji: sprawdź je.${languages ? ` Tłumaczenia (${languages.toUpperCase().split(',').join(', ')}) mogą być nieaktualne.` : ''}`,
        catalog_unchanged: () => 'Nic do zmiany: dane są już takie.',
        catalog_created: () => 'Dodano. Profil smaku to szkic: sprawdź go i potwierdź.',
        dish_hidden: () => 'Danie jest ukryte przed gośćmi. Nie widzą go już.',
        dish_shown: (suggestions: number) => `Danie wróciło do menu. Goście już je widzą.${suggestions > 0 ? ` Dodano propozycje silnika do przeglądu: ${suggestions}.` : ''}`,
        translations: () => 'Tłumaczenia zapisane. Goście zobaczą je po publikacji.',
        content: () => 'Język treści i tłumaczenia zapisane. Goście zobaczą je po publikacji.',
        suggestion_added: () => 'Dodano do propozycji — zatwierdź je w „Propozycjach silnika”. Goście zobaczą zmianę dopiero po zatwierdzeniu i publikacji.',
        opportunity_dismissed: (days: number) => `Okazja zignorowana. Wróci najwcześniej po ${days} dniach, jeśli nadal będzie aktualna.`,
        opportunity_restored: () => 'Okazja przywrócona.',
        member_role_changed: () => 'Rola zmieniona. Działa od kolejnego żądania tej osoby.',
        member_deactivated: () => 'Dostęp odebrany. Osoba zostaje od razu wylogowana z tej restauracji.',
        member_reactivated: () => 'Dostęp przywrócony. Osoba może znów korzystać z panelu.',
        invitation_revoked: () => 'Zaproszenie anulowane. Jego link już nie działa.',
        pick_marked: () => 'Wino oznaczone jako wybór restauracji. Goście zobaczą to po publikacji.',
        pick_unmarked: () => 'Wybór usunięty. Goście przestaną go widzieć po publikacji.',
        pick_unchanged: () => 'Nic do zmiany: wino już jest w tym stanie.',
        launch_day_saved: () => 'Dzień uruchomienia zapisany. Raport używa go teraz jako bazy.'
      },
      errors: {
        version_conflict: 'Ktoś przed chwilą to zmienił. Strona pokazuje teraz najnowszą wersję, spróbuj ponownie.',
        dish_transition: 'Tego dania nie można teraz ukryć ani pokazać. Danie, które jest jeszcze szkicem, wychodzi przy publikacji.',
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
        invalid_kind: 'Importuj menu, kartę win albo sprzedaż.',
        no_header: 'W pliku brakuje kolumn potrzebnych do importu sprzedaży: data, numer rachunku, typ pozycji, ilość i kwota netto.',
        no_complete_checks: 'Żadnego rachunku nie da się zapisać: każda zaznaczona pozycja należy do rachunku z odznaczoną pozycją albo błędem.',
        slug_taken: 'Inna restauracja używa już tej nazwy w adresie. Wybierz inną.',
        validation_failed: 'Sprawdź dane. Nazwa w adresie może zawierać tylko małe litery, cyfry i myślniki (od 2 do 40 znaków) i nie może być słowem zastrzeżonym.',
        profile_invalid: 'Sprawdź profil: skale to liczby całkowite od 0 do 5, alkohol od 0 do 25. Nic nie zapisano.',
        translation_invalid: 'Sprawdź tłumaczenia: któreś jest za długie.',
        already_suggested: 'To wino jest już w propozycjach tego dania.',
        already_rejected: 'To parowanie zostało odrzucone — przywróć je w sekcji „Odrzucone”.',
        dish_not_published: 'To danie nie jest widoczne dla gości.',
        low_match: 'To wino słabo pasuje do dania.',
        opportunity_stale: 'Ta okazja jest już nieaktualna.',
        opportunity_not_dismissed: 'Ta okazja nie jest zignorowana.',
        last_owner: 'Restauracja musi mieć co najmniej jednego aktywnego właściciela. Najpierw ustaw kogoś innego jako właściciela.',
        team_hierarchy: 'Twoja rola nie pozwala zmienić tej osoby ani nadać tej roli. Poproś właściciela.',
        self_change: 'Nie możesz zmienić własnej roli ani odebrać sobie dostępu.',
        member_deactivated: 'Dostęp tej osoby jest odebrany. Przywróć go przed zmianą roli.',
        already_member: 'Ta osoba jest już w zespole tej restauracji. Jeśli odebrano jej dostęp, przywróć go na liście.',
        invitation_conflict: 'Inne zaproszenie na ten adres powstało w tej samej chwili. Spróbuj ponownie.',
        catalog_conflict: 'Ktoś zmienił menu lub kartę win, gdy ten import był otwarty, i jedna z nowych pozycji już istnieje. Nic nie zaimportowano: zacznij import od nowa.',
        too_many_picks: 'Restauracja może oznaczyć najwyżej 5 win jako swoje wybory. Najpierw usuń jeden.',
        invalid_launch_day: 'Dzień uruchomienia musi być prawdziwą datą od 2020-01-01 i nie późniejszą niż dziś.',
        reason_required: 'Zmiana dnia uruchomienia wymaga krótkiego powodu.',
        reason_too_long: 'Powód może mieć najwyżej 200 znaków.',
        wine_inactive: 'Wyborem może być tylko wino widoczne dla gości. Najpierw pokaż je na karcie win.',
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
      roles: { primary: 'Podstawowe', alternative: 'Alternatywa', best_value: 'Najlepsza cena' },
      pick: 'Wybór restauracji',
      pickWaiting: 'Wybór, czeka na publikację',
      pickRemoved: 'Wybór usunięty, czeka na publikację'
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
      sales: {
        title: 'Sprzedaż',
        attachRate: 'Wine Attach Rate',
        attachDetail: (n: string, of: string) => `${n} z ${of} rachunków z jedzeniem`,
        perGuest: 'Przychód z wina na gościa',
        perGuestDetail: 'Rachunki z jedzeniem z liczbą gości',
        perTable: 'Przychód z wina na stolik',
        perTableDetail: 'Na rachunek z jedzeniem',
        averageBottle: 'Średnia butelka',
        averageBottleDetail: 'Cena netto sprzedanej butelki',
        averageGlass: 'Średni kieliszek',
        averageGlassDetail: 'Cena netto sprzedanego kieliszka',
        noData: 'Brak danych',
        through: (day: string) => `Dane sprzedaży do ${day}`,
        emptyTitle: 'Wgraj eksport z POS, aby zobaczyć Wine Attach Rate',
        emptyText: (days: number) => `Wine Attach Rate i przychód z wina liczymy ze sprzedaży z POS z ostatnich ${days} dni.`,
        importSales: 'Importuj sprzedaż',
        noImportAccess: 'Może go wgrać osoba z uprawnieniem do importu.',
        latest: (day: string) => `Ostatnie dane sprzedaży: ${day}.`
      },
      usage: {
        title: 'Korzystanie gości',
        window: (days: number, from: string, to: string) => `Ostatnie ${days} dni · ${from} – ${to}`,
        sessions: 'Sesje gości',
        sessionsDetail: 'Goście, którzy otworzyli aplikację z kodu QR lub linku',
        views: 'Wyświetlone rekomendacje do dań',
        viewsDetail: 'Każde danie liczone raz na sesję',
        conversion: 'Rekomendacja → wybór',
        conversionDetail: (n: string, of: string) => `${n} z ${of} sesji · tylko rekomendacje do dań`,
        staffLookups: 'Wyszukiwania kelnera',
        staffLookupsDetail: 'Ekran obsługi, danie lub cały stół · poza liczbami gości',
        noData: 'Brak danych',
        emptyTitle: 'Goście jeszcze nie korzystali z Wine Match',
        emptyText: 'Liczby pojawią się, gdy goście zeskanują kod QR.',
        getQr: 'Pobierz kod QR',
        openGuestApp: 'Otwórz aplikację gościa'
      },
      delta: {
        vsPrevious: (change: string, days: number) => `${change} wobec poprzednich ${days} dni`,
        points: (n: string) => `${n} p.p.`,
        up: 'Wzrost',
        down: 'Spadek',
        noChange: 'Bez zmian',
        noComparison: 'Brak porównania',
        smallSample: 'Za mało danych do porównania'
      },
      pairings: {
        title: 'Skuteczność par',
        caption: 'Jak często goście widzieli i wybierali każdą parę, ze źródłem z chwili wyświetlenia',
        dish: 'Danie',
        wine: 'Wino',
        source: 'Źródło',
        match: 'Dopasowanie',
        shown: 'Pokazane',
        chosen: 'Wybrane',
        conversion: 'Konwersja',
        sources: { sommelier: 'Sommelier', engine: 'Silnik' },
        noViews: 'Bez wyświetleń',
        showAll: (n: number) => `Pokaż wszystkie pary (${n})`,
        showTop: (n: number) => `Pokaż pierwsze ${n}`,
        omitted: (n: number) => `${n} ${plural(n, 'para ukryta', 'pary ukryte', 'par ukrytych')}: danie lub wino zostało usunięte.`,
        emptyTitle: 'Nie ma jeszcze par do zmierzenia',
        emptyText: 'Zatwierdź pary do dań; tu pojawią się wyświetlenia i wybory gości.',
        openReview: 'Przejrzyj propozycje'
      },
      analyticsUnavailable: 'Analityka jest chwilowo niedostępna.',
      analyticsUnavailableText: 'Parowania i aplikacja gościa działają normalnie.'
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
      moreDetails: 'Pozostałe dane',
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
      show: 'Pokaż',
      pick: 'Wybór'
    },
    wine: {
      pickTitle: 'Wybór restauracji',
      pickText: 'Wybór przesuwa wino wyżej wśród propozycji silnika, ze zwykłą etykietą. Nigdy nie zmienia wyniku dopasowania i nigdy nie staje nad parą sommeliera. Goście widzą zmianę po publikacji.',
      pickYes: 'To wino jest jednym z wyborów restauracji.',
      pickWaiting: 'Wino jest oznaczone, ale goście nie widzą go jako wyboru do publikacji.',
      pickRemoved: 'Wino nie jest już oznaczone, ale goście widzą je jako wybór do publikacji.',
      pickNo: 'To wino nie jest oznaczone.',
      pickSeeAll: 'Wszystkie wybory i symulator',
      moreDetails: 'Styl i podawanie',
      bottleSize: 'Pojemność butelki',
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
      renamedTitle: 'Zmieniono nazwę: sprawdź pary',
      renamedText: 'Nazwa zmieniła się po decyzjach o tych parowaniach. Sprawdź, czy nadal pasują, potem zdecyduj ponownie albo zostaw je.',
      renamedItem: (pairs: number) => `Zmieniono nazwę, sprawdź pary: ${pairs}`,
      openPairings: 'Otwórz parowania',
      approve: 'Zatwierdź',
      reject: 'Odrzuć'
    },
    pairings: {
      title: (dish: string) => `Parowania: ${dish}`,
      noDishes: 'Nie ma jeszcze dań.',
      pickTitle: 'Wybory restauracji w tym daniu',
      pickMoved: 'przesuwa się wyżej w tym daniu',
      pickLabel: 'ma tu etykietę, kolejność bez zmian',
      pickAfterPublish: 'To zobaczą goście po publikacji. Wyborami zarządzasz na ekranie Wybory restauracji.',
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
    /**
     * A27 „Wybory restauracji” (spec 2026-11-18-restaurant-picks, R17). Etykieta jest restauracji, nigdy sommeliera;
     * liczby ze stałych warstwy; panel mówi „silnik”, nigdy „AI”.
     */
    picks: {
      title: 'Wybory restauracji',
      description: (n: number, max: number) => `Wybrane wina: ${n} z ${max}.`,
      howTitle: 'Jak działają wybory',
      howPoints: (f: { minScore: number; window: number; promoted: number }) => [
        'Wybór przesuwa wino wyżej wśród propozycji silnika i pokazuje etykietę „Wybór restauracji”. Wynik dopasowania nigdy się nie zmienia.',
        'Para sommeliera zawsze zostaje na górze, a wybór nigdy nie dostaje pieczęci sommeliera.',
        `Przesunąć się może tylko wino z wynikiem co najmniej ${f.minScore}, nie więcej niż ${f.window} pkt poniżej najlepszej propozycji; na początek listy trafiają najwyżej ${f.promoted} wybory.`,
        'Goście widzą zmianę dopiero po publikacji. Symulator poniżej pokazuje, co by się zmieniło.'
      ],
      readOnly: 'Widzisz wybory i możesz użyć symulatora. Wybory zmieniają tylko właściciel i dyrektor generalny.',
      waiting: (added: number, removed: number) => `Goście jeszcze tego nie widzą: do dodania ${added}, do usunięcia ${removed}. Opublikuj, żeby zastosować.`,
      goPublish: 'Przejdź do publikacji',
      unreviewedHidden: 'Ustawienia gościa ukrywają propozycje silnika, których nikt nie sprawdził. Wybory są takimi propozycjami, więc goście ich nie widzą. Możesz to zmienić na ekranie Publikacja.',
      search: 'Szukaj wina',
      searchLabel: 'Szukaj win do oznaczenia',
      noneTitle: 'Nie znaleziono win',
      noneEmpty: 'Restauracja nie ma jeszcze win. Najpierw zaimportuj kartę win, potem oznacz do 5 wyborów.',
      noneFiltered: 'Spróbuj innego wyszukiwania.',
      importWines: 'Importuj kartę win',
      wine: 'Wino',
      status: 'Stan',
      effect: 'Skutek po publikacji',
      action: 'Zmiana',
      marked: 'Wybór restauracji',
      markedWaiting: 'Wybór restauracji, czeka na publikację',
      unmarkedWaiting: 'Już nie jest wyborem, goście widzą to do publikacji',
      inactivePick: 'Ukryte przed gośćmi, nadal zajmuje jedno z miejsc',
      notPick: '—',
      mark: 'Oznacz jako wybór',
      unmark: 'Usuń wybór',
      full: 'Wszystkie miejsca są zajęte. Najpierw usuń jeden wybór.',
      showFirst: 'Najpierw pokaż wino na karcie win.',
      effectMoved: (n: number) => `Przesuwa wyżej w ${n} ${plural(n, 'daniu', 'daniach', 'daniach')}`,
      effectLabel: (n: number) => `Etykieta w ${n} ${plural(n, 'daniu', 'daniach', 'daniach')}, kolejność bez zmian`,
      effectNone: 'Bez skutku',
      effectUnknown: 'Oznacz wino, żeby zobaczyć skutek',
      noEffect: (reason: string, f: { minScore: number; window: number; promoted: number }) => {
        switch (reason) {
          case 'inactive': return 'Wino jest ukryte przed gośćmi.';
          case 'not_in_list': return 'Goście jeszcze nie widzą tego wina (dodane po ostatniej publikacji) albo silnik nie proponuje go do żadnego dania.';
          case 'sommelier_pair': return 'To para sommeliera: zachowuje pieczęć i nie dostaje etykiety wyboru.';
          case 'unreviewed_hidden': return 'Ustawienia ukrywają propozycje, których nikt nie sprawdził.';
          case 'below_min_score': return `Wynik dopasowania w tych daniach jest poniżej ${f.minScore}.`;
          case 'outside_window': return `Wino jest o więcej niż ${f.window} pkt poniżej najlepszej propozycji.`;
          case 'over_cap': return `${f.promoted} inne wybory są już na początku.`;
          default: return 'Bez skutku dla dań.';
        }
      },
      simTitle: 'Przed i po',
      simText: 'Układa każde danie dwa razy tą samą funkcją, którą obsługiwani są goście: przed (to, co goście widzą teraz) i po (z wyborami poniżej, po publikacji). Nic się nie zapisuje. Porównywane są tylko wybory: inne niepublikowane zmiany (parowania, profile) nie są uwzględnione, więc „po” jest równe liście gościa tylko wtedy, gdy wybory to jedyna niepublikowana zmiana.',
      simWines: 'Wina do sprawdzenia (do 5)',
      simDish: 'Danie',
      allDishes: 'Wszystkie dania',
      simulate: 'Symuluj',
      simReset: 'Wróć do bieżących wyborów',
      simInvalid: 'Sprawdź symulację: wybierz najwyżej 5 win i danie z listy.',
      simNotPublished: 'Restauracja nie była jeszcze publikowana, więc goście nie widzą wyborów. „Przed” to lista bez wyborów.',
      simSummary: (reordered: number, dishes: number, without: number) => `Kolejność zmienia się w ${reordered} z ${dishes} ${plural(dishes, 'dania', 'dań', 'dań')}. Wybory bez skutku: ${without}.`,
      simNone: 'Brak wyborów do sprawdzenia. Oznacz wino albo zaznacz wina powyżej.',
      simPicks: 'Co robi każdy wybór',
      simDishes: 'Dania ze zmianą',
      simUnchanged: (n: number) => `Bez zmian: ${n} ${plural(n, 'danie', 'dania', 'dań')}.`,
      before: 'Przed: goście teraz',
      after: 'Po: po publikacji',
      sommelierPair: 'Para sommeliera',
      engineList: 'Propozycja silnika',
      emptyList: 'Brak win',
      up: (n: number) => `wyżej o ${n}`,
      down: (n: number) => `niżej o ${n}`,
      entered: 'wchodzi na listę',
      left: 'znika z listy'
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
      draftWineProfiles: (n: number) => `Profile win, które są jeszcze szkicami: ${n}`,
      allWineProfilesConfirmed: 'Wszystkie profile win potwierdzone',
      allWineProfilesConfirmedText: 'Wyniki win opierają się na profilach, które sprawdzono.',
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
      pendingText: (pairings: number, dishes: number, profiles: number) => `Parowania: ${pairings}, nowe dania: ${dishes}, profile smaku (zmienione lub pozycji dodanych po ostatniej publikacji): ${profiles}. Publikacja od razu aktualizuje aplikację gościa; kod QR się nie zmienia.`,
      nothing: 'Nie ma nic do opublikowania.',
      preview: 'Podgląd aplikacji gościa',
      submit: 'Opublikuj zmiany',
      upToDate: 'Wszystko aktualne',
      upToDateText: 'Wprowadź zmianę w Parowaniach lub w kolejce Do przeglądu, potem wróć tutaj, aby ją opublikować.',
      versionBadge: (n: number) => `Wersja ${n}`,
      picks: (added: number, removed: number) => `Wybory restauracji: +${added} / −${removed}`,
      picksText: 'Czekają na publikację. Goście zobaczą wybory dopiero po publikacji.',
      picksOpen: 'Otwórz wybory'
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
      usage: {
        summary: 'Co liczą te liczby?',
        points: (k: UsageExplainFacts) => [
          `Ostatnie ${k.days} pełnych dni do wczoraj, w porównaniu z ${k.days} dniami wcześniej.`,
          'Sesje gości: goście, którzy otworzyli aplikację z kodu QR lub linku. Nasze testy, boty i podglądy linków nie są zapisywane.',
          'Wyświetlone rekomendacje do dań: każde danie raz na sesję. Ścieżka „Cały stół” nie jest tu liczona.',
          `Rekomendacja → wybór: spośród sesji, które obejrzały wina do dania, te, w których gość wybrał wino. Poniżej ${k.minSample} sesji w którymkolwiek okresie zmiana nie jest pokazywana.`,
          'Wyszukiwania kelnera: ekran obsługi, dla dania lub całego stołu. Nigdy nie liczą się jako sesje gości.'
        ]
      },
      salesKpis: {
        summary: 'Jak liczymy sprzedaż?',
        points: (k: UsageExplainFacts) => [
          `Sprzedaż z eksportów POS z ostatnich ${k.days} pełnych dni do wczoraj, w porównaniu z ${k.days} dniami wcześniej.`,
          'Wine Attach Rate: rachunki z jedzeniem, na których było też wino, spośród wszystkich rachunków z jedzeniem. Rachunki barowe z samym winem liczą się do przychodu z wina, nie do wskaźnika.',
          `Poniżej ${k.minSample} rachunków z jedzeniem w którymkolwiek okresie zmiana nie jest pokazywana.`,
          'Kwoty netto. Przychód na gościa korzysta z kolumny gości w eksporcie. Sesji gości w aplikacji nigdy nie dzielimy przez rachunki.'
        ]
      },
      performance: {
        summary: 'Co liczy ta tabela?',
        points: (k: UsageExplainFacts) => [
          `Sesje gości z ostatnich ${k.days} pełnych dni do wczoraj. Ekran kelnera i ścieżka „Cały stół” nie są liczone.`,
          'Pokazane: sesje, w których gość zobaczył wino wśród rekomendacji do dania. Wybrane: spośród nich sesje, w których wybrał je do tego dania.',
          'Źródło: Sommelier, jeśli wino było Twoją zatwierdzoną parą, gdy gość je zobaczył; Silnik, jeśli było propozycją silnika — nie według dzisiejszego statusu.',
          'Dopasowanie: wynik silnika dla dania i wina, bez preferencji gościa. „Bez wyświetleń”: zatwierdzona para, której goście jeszcze nie widzieli.'
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
      },
      sales: {
        summary: 'Jak liczony jest plik?',
        points: (maxRows: number) => [
          'Jeden wiersz to jedna pozycja rachunku. Rachunek to jego dzień biznesowy i numer, więc ten sam numer innego dnia to inny rachunek.',
          'Zapisujemy tylko całe rachunki: rachunek z odznaczoną pozycją albo błędem jest pomijany i zostaje jego zapisana wersja.',
          'Ponowny import tych samych rachunków zastępuje ich zapisane pozycje zamiast je dodawać, więc poprawiony eksport można bezpiecznie wgrać jeszcze raz.',
          'Wine Attach Rate: rachunki z jedzeniem, na których było też wino, wśród wszystkich rachunków z jedzeniem. Rachunki barowe z samym winem liczą się tylko do przychodu z wina. Zwrócona butelka znosi sprzedaż.',
          `Nazwiska gości, płatności i nazwy pozycji nie są zapisywane. Do ${maxRows} pozycji w pliku: większe eksporty dziel po całych dniach.`
        ]
      }
    },
    /**
     * A33 „Raport wyników” (spec 2026-11-18-owner-proof-report, R4 do R9, R15). Zasady języka (R8): bez słowa „AI”, bez
     * „gwarantowane”, bez przyczyny („dzięki Wine Match”, „efekt Wine Match”); zdania werdyktu są stałe; „zmierzone z eksportu POS”
     * i „z Twoich rachunków” są dozwolone. Raport mówi, co się zmieniło i jak pewny jest wniosek, nigdy dlaczego.
     */
    proof: {
      title: 'Raport wyników',
      description: 'Co pokazują Twoje rachunki z kasy przed uruchomieniem i po nim, i jak pewny jest ten wniosek. Raport nie ustala, co spowodowało zmianę.',
      window: (k: number, from: string, to: string) => `Okno ${k}: ${from} – ${to}`,
      windowShort: (k: number) => `Okno ${k}`,
      windowNav: 'Wybierz okno',
      prev: 'Poprzednie okno',
      next: 'Następne okno',
      print: 'Wersja do druku',
      launchSet: (day: string, role: string, changes: number) => `Dzień uruchomienia ustawiony ${day} przez rolę: ${role}${changes > 0 ? `; zmieniony ${changes} ${changes === 1 ? 'raz' : 'razy'}` : ''}.`,
      launchChangedLate: 'Dzień uruchomienia zmieniony po zakończeniu okna 1',
      dataThrough: (day: string, lastImport: string) => `Dane POS do dnia ${day}${lastImport ? `, ostatni import ${lastImport}` : ''}.`,
      emptyNoLaunchTitle: 'Najpierw ustaw dzień uruchomienia',
      emptyNoLaunchText: 'Raport porównuje 28 dni przed uruchomieniem z 28-dniowymi oknami po nim. Wpisz pierwszy dzień, w którym goście mogli korzystać z Wine Match przy stolikach.',
      emptyNoLaunchReadOnly: 'Dzień uruchomienia nie jest ustawiony. Poproś właściciela lub dyrektora generalnego o jego wpisanie.',
      emptyNoImportTitle: 'Wgraj eksport POS',
      emptyNoImportText: 'Raport jest zmierzony z Twojej sprzedaży w kasie. Nie zaimportowano jeszcze żadnej sprzedaży.',
      emptyNoImportAction: 'Importuj sprzedaż',
      invalidWindowTitle: 'Takie okno nie istnieje',
      invalidWindowText: (max: number) => `Okno to liczba całkowita od 1 do ${max}, a samo okno musi się już zacząć.`,
      invalidWindowAction: 'Pokaż najnowsze okno',
      resultTitle: 'Wynik',
      before: 'Przed',
      after: 'Po',
      checksOf: (n: number, m: number) => `${n} z ${m} rachunków z jedzeniem zawierało wino`,
      tradingDays: (d: number, days: number) => `dni z danymi: ${d} z ${days}`,
      changeLine: (delta: string, low: string, high: string) => `${delta} punktów procentowych, przedział od ${low} do ${high}`,
      minimumChange: (pp: number) => `Przy takiej liczbie rachunków raport może pokazać wzrost od około ${pp} punktów procentowych.`,
      verdict: {
        increase: 'Odsetek rachunków z winem jest wyższy niż w oknie bazowym i różnica jest większa niż zwykłe wahania przy tej liczbie rachunków. Raport nie ustala, co ją spowodowało.',
        decrease: 'Odsetek rachunków z winem jest niższy niż w oknie bazowym i różnica jest większa niż zwykłe wahania przy tej liczbie rachunków. Raport nie ustala, co ją spowodowało.',
        inconclusive: 'Z tych danych nie da się powiedzieć, czy odsetek wzrósł, spadł, czy został bez zmian.'
      },
      notEnoughTitle: 'Za mało danych, żeby pokazać zmianę',
      notEnoughText: 'Poniżej same liczby. Zmiana, jej przedział i werdykt pojawią się, gdy oba okresy będą miały dość danych.',
      rateHidden: (min: number) => `poniżej ${min} rachunków: bez procentu`,
      baselineLabel: 'Baza',
      reasons: {
        no_launch_day: () => ({ what: 'Nie ustawiono dnia uruchomienia.', todo: 'Wpisz dzień uruchomienia poniżej.' }),
        no_sales_import: () => ({ what: 'Nie zaimportowano sprzedaży z POS.', todo: 'Wgraj eksport POS.' }),
        baseline_no_data: (f: { from: string; to: string }) => ({ what: 'Baza nie ma sprzedaży.', todo: `Wgraj eksport POS za ${f.from} – ${f.to}.` }),
        baseline_too_few_checks: (f: { minChecks: number }) => ({ what: `Baza ma mniej niż ${f.minChecks} rachunków z jedzeniem.`, todo: 'Dłuższa baza nie jest możliwa: raport bierze 28 dni przed uruchomieniem. Sprawdź, czy cały okres jest zaimportowany.' }),
        baseline_too_few_days: (f: { minDays: number }) => ({ what: `Baza ma dane z mniej niż ${f.minDays} dni.`, todo: 'Sprawdź, czy eksport obejmuje każdy dzień, w którym lokal był otwarty.' }),
        window_incomplete: (f: { to: string }) => ({ what: 'To okno jeszcze trwa.', todo: `Wróć po ${f.to}; liczby wyżej są częściowe.` }),
        window_not_imported: (f: { to: string; dataThrough: string }) => ({ what: `Dane POS kończą się ${f.dataThrough}, przed końcem okna.`, todo: `Wgraj eksport POS do ${f.to}.` }),
        window_too_few_checks: (f: { minChecks: number }) => ({ what: `Okno ma mniej niż ${f.minChecks} rachunków z jedzeniem.`, todo: 'Poczekaj na następne okno albo sprawdź import.' }),
        window_too_few_days: (f: { minDays: number }) => ({ what: `Okno ma dane z mniej niż ${f.minDays} dni.`, todo: 'Sprawdź, czy eksport obejmuje każdy dzień, w którym lokal był otwarty.' })
      } as Record<ProofReason, (f: { from: string; to: string; minChecks: number; minDays: number; dataThrough: string }) => { what: string; todo: string }>,
      oldBaseline: 'Baza jest starsza niż trzy okna. Pora roku, zmiana karty lub cen mogą tłumaczyć różnicę.',
      tableTitle: 'Wszystkie okna',
      colPeriod: 'Okres',
      colChecks: 'Rachunki z winem',
      colRate: 'Odsetek',
      colInterval: 'Przedział',
      colChange: 'Zmiana',
      colDays: 'Dni z danymi',
      noValue: '–',
      incomplete: 'okno trwa',
      groupsTitle: 'Rachunki z kodem i bez',
      groupsCaveat: 'To zestawienie, nie dowód przyczyny. Stoliki, które użyły kodu, same sięgnęły po rekomendację; mogły zamówić wino i bez niej. Brak kodu w kasie nie znaczy, że stolik nie użył Wine Match. Kod wpisuje się przy zamówieniu polecanego wina, więc odsetek w grupie z kodem jest wysoki z definicji.',
      groupWithCode: 'Z kodem',
      groupWithoutCode: 'Bez kodu',
      groupNotEnough: 'za mało danych',
      groupRevenue: 'Przychód z wina na rachunek z jedzeniem',
      groupNone: 'Baza nie ma grup: kodów wtedy jeszcze nie było.',
      codesTitle: 'Kody polecenia w oknie',
      codesIssued: 'Wydane',
      codesConfirmed: 'Potwierdzone przez kelnera',
      codesInSales: 'Znalezione w sprzedaży',
      codesOrdered: 'Zamówione',
      codesUnmatched: 'W POS bez polecenia',
      howTitle: 'Jak to liczymy',
      howText: (f: { minChecks: number; minDays: number }) => `Baza to 28 dni przed dniem uruchomienia, a każde okno to kolejne 28 dni (cztery pełne tygodnie), zmierzone z Twojego eksportu POS. Rachunek liczy się, gdy ma jedzenie; ma wino, gdy suma linii z winem po zwrotach jest większa od zera; rachunki tylko barowe są pominięte. Odsetek to rachunki z winem podzielone przez rachunki z jedzeniem. Okres potrzebuje co najmniej ${f.minChecks} rachunków z jedzeniem i danych z co najmniej ${f.minDays} dni. Przedział jest co najmniej tak szeroki, jak pokazany: rachunki jednego dnia są do siebie podobne, a okna ogląda się jedno po drugim bez poprawki. To nie jest test statystyczny ani podstawa do automatycznych decyzji.`,
      notTitle: 'Czego ten raport nie mówi',
      notPoints: {
        not_causal: 'Dlaczego odsetek się zmienił: raport pokazuje, co się zmieniło, nie przyczynę.',
        no_control_group: 'Nie ma grupy porównawczej, innej restauracji ani stolików bez aplikacji.',
        season_menu_prices: 'Pora roku, nowa karta, zmiany cen, pogoda i wydarzenia mogą same przesunąć odsetek.',
        checks_of_a_day_are_alike: 'Rachunki jednego dnia są do siebie podobne (weekend, pogoda), więc prawdziwa niepewność jest większa niż przedział.',
        looks_are_not_corrected: 'Okna ogląda się jedno po drugim, a przedziały nie są o to poprawione.'
      } as Record<ProofCaveat, string>,
      launchTitle: 'Dzień uruchomienia',
      launchHelp: 'Pierwszy dzień, w którym goście mogli korzystać z Wine Match przy stolikach. Wyznacza bazę. Zmiana trafia do historii z powodem, nigdy nie nadpisuje wpisu.',
      launchLabel: 'Dzień uruchomienia',
      reasonLabel: 'Powód zmiany',
      reasonFirst: 'Przy pierwszym wpisie nieobowiązkowy.',
      reasonLater: 'Wymagany: krótki powód, do 200 znaków.',
      save: 'Zapisz dzień uruchomienia',
      readOnly: 'Dzień uruchomienia zmieniają tylko właściciel i dyrektor generalny.',
      historyTitle: 'Historia',
      historyEntry: (n: number, day: string, role: string, when: string) => `${n}. ${day}, rola: ${role}, ${when}`,
      historyReason: (reason: string) => `Powód: ${reason}`
    },
    team: {
      title: 'Zespół',
      description: 'Wszyscy, którzy mają dostęp do tej restauracji. Zmiana działa od kolejnego żądania tej osoby: nie ma czego publikować.',
      count: (active: number, total: number) => (total === active ? `Osób: ${active}` : `Aktywnych ${active} z ${total}`),
      listLabel: 'Członkowie zespołu',
      lastSignIn: (when: string) => `Ostatnie logowanie: ${when}`,
      you: 'To Ty',
      deactivated: 'Dostęp odebrany',
      active: 'Aktywny',
      deactivatedOn: (when: string) => `Dostęp odebrany ${when}`,
      roleLabel: (name: string) => `Rola: ${name}`,
      saveRole: 'Zapisz rolę',
      deactivate: 'Odbierz dostęp',
      reactivate: 'Przywróć dostęp',
      ownerOnly: 'Właściciela i General Managera może zmienić tylko właściciel.',
      yourself: 'Nie możesz zmienić własnej roli ani dostępu.',
      roleHelp: 'General Manager może nadać role Wine Director i Kelner. Rolę Właściciel lub General Manager nadaje tylko właściciel.',
      invite: {
        title: 'Zaproś osobę',
        description: 'Wysyłki e-maili jeszcze nie ma: dostajesz link i przekazujesz go sam. Działa raz, przez 72 godziny, a nowe zaproszenie na ten sam adres zastępuje poprzednie.',
        email: 'Adres e-mail',
        role: 'Rola',
        submit: 'Utwórz link zaproszenia',
        noRoles: 'Twoja rola nie pozwala nikogo zapraszać.',
        createdTitle: 'Link zaproszenia utworzony',
        createdText: 'Dla {email}, jako {role}. Działa raz i przez 72 godziny. Widzisz go tylko teraz: skopiuj i przekaż tej osobie samodzielnie.',
        linkLabel: 'Link zaproszenia',
        pendingTitle: 'Oczekujące zaproszenia',
        pendingLabel: 'Oczekujące zaproszenia',
        pendingNone: 'Brak oczekujących zaproszeń.',
        invitedBy: (name: string) => `Zaprasza: ${name}`,
        validUntil: (when: string) => `Link ważny do ${when}`,
        expired: 'Wygasło',
        revoke: 'Anuluj zaproszenie',
        revokeOwnerOnly: 'To zaproszenie może anulować tylko właściciel.',
        errors: {
          validation_failed: 'Wpisz poprawny adres e-mail i wybierz rolę.',
          already_member: 'Ta osoba jest już w zespole tej restauracji. Jeśli odebrano jej dostęp, przywróć go na liście.',
          team_hierarchy: 'Twoja rola nie pozwala nadać tej roli. General Manager może zaprosić Wine Directora, właściciel każdego.',
          forbidden: 'Nie masz uprawnień do tej czynności.',
          invitation_conflict: 'Inne zaproszenie na ten adres powstało w tej samej chwili. Spróbuj ponownie.',
          unexpected: 'Nie udało się utworzyć zaproszenia. Nic nie zostało zmienione, spróbuj ponownie.'
        } as Record<string, string>
      },
      roleDescriptions: {
        owner: 'Wszystko, także zespół.',
        manager: 'Prowadzi restaurację i zespół, nie rozstrzyga parowań.',
        sommelier: 'Rozstrzyga parowania, importuje i publikuje.',
        waiter: 'Korzysta z podpowiedzi win, bez panelu.'
      } as Record<Role, string>
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
    profileEditor: {
      title: 'Edytuj profil smaku',
      textDish: 'Skale, które silnik czyta przy każdym Match Score tego dania. Zmień je, zobacz, co stanie się z wynikami, i zapisz.',
      textWine: 'Skale, które silnik czyta przy każdym Match Score tego wina. Zmień je, zobacz, co stanie się z wynikami, i zapisz.',
      afterPublish: 'Goście zobaczą zmieniony profil dopiero po publikacji.',
      readOnly: 'Twoja rola nie może zmieniać profili smaku.',
      scale: (label: string) => `${label} (0 do 5)`,
      alcohol: 'Alkohol (% obj.)',
      style: 'Styl',
      adventurous: 'Charakter',
      yes: 'Nieoczywiste',
      no: 'Klasyczne',
      protein: 'Główny składnik',
      cooking: 'Obróbka',
      showPreview: 'Pokaż, jak zmieni się dopasowanie',
      reset: 'Wróć do zapisanych wartości',
      stateDraft: 'Szkic',
      stateDraftText: (source: string) => `Jeszcze niepotwierdzony (${source}). Sprawdź skale, zanim zaczniesz polegać na wynikach.`,
      sources: { draft: 'szkic z importu', grape_defaults: 'wartości domyślne dla szczepu', catalog: 'z katalogu' } as Record<string, string>,
      stateConfirmed: 'Potwierdzony',
      stateConfirmedText: (by: string | null, at: string | null) => (by && at ? `Potwierdził(a) ${by}, ${at}.` : by ? `Potwierdził(a) ${by}.` : 'Potwierdzony przez zespół restauracji.'),
      saveConfirm: 'Zapisz i potwierdź',
      saveDraft: 'Zapisz jako szkic',
      confirmOnly: 'Potwierdź bez zmian',
      saveText: 'Zapisuje wartości pokazane powyżej (te z podglądu).',
      invalid: 'Część wartości jest niepoprawna: skale to liczby całkowite od 0 do 5, alkohol od 0 do 25 z krokiem 0,1. Nic nie zapisano.',
      previewTitle: 'Jak zmieni się dopasowanie',
      previewTextDish: 'Match Score tego dania z każdym aktywnym winem, przed zmianą i po niej, na Twoich bieżących parowaniach. Nic jeszcze nie jest zapisane.',
      previewTextWine: 'Match Score tego wina z każdym daniem z karty, przed zmianą i po niej, na Twoich bieżących parowaniach. Nic jeszcze nie jest zapisane.',
      unpublished: (n: number) => `Niepublikowane decyzje o parowaniach: ${n}. Podgląd pokazuje stan po następnej publikacji.`,
      noChange: 'Te wartości są równe zapisanemu profilowi: żaden wynik się nie zmienia.',
      summary: (pairs: number, crossing: number) => `Zatwierdzone parowania ze zmienionym wynikiem: ${pairs}; z nich ${crossing} przekracza próg, poniżej którego silnik nie proponuje wina.`,
      noPairsChange: 'Żadne zatwierdzone parowanie nie zmienia wyniku.',
      colWine: 'Wino',
      colDish: 'Danie',
      colScore: 'Match Score',
      colDecision: 'Twoja decyzja',
      change: (before: number, after: number, delta: number) => `${before} → ${after}, ${delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : 'bez zmiany'}`,
      noDecision: 'Brak decyzji',
      guestBefore: 'Goście widzą teraz (najlepsze propozycje)',
      guestAfter: 'Goście zobaczą po publikacji',
      guestRank: (before: number | null, after: number | null) => `${before === null ? 'poza najlepszymi propozycjami' : `miejsce ${before}`} → ${after === null ? 'poza najlepszymi propozycjami' : `miejsce ${after}`}`,
      guestWineTitle: 'Gdzie wino wchodzi do najlepszych propozycji lub z nich wypada',
      guestWineNone: 'Wino zachowuje miejsce w najlepszych propozycjach każdego dania.',
      error: 'Podgląd wymaga poprawnych wartości.'
    },
    catalog: {
      dish: {
        title: 'Dane dania',
        text: 'Nazwa, opis, kategoria i cena, które goście czytają w menu. Zmiana jest od razu widoczna dla gości.',
        name: 'Nazwa', description: 'Opis', category: 'Kategoria', price: 'Cena (zł)',
        baseHint: 'To tekst bazowy. Tłumaczenia są niżej.',
        renameHint: 'Zmiana nazwy zmienia dopasowanie importu z pliku: późniejszy import starej nazwy utworzy nowe danie.'
      },
      wine: {
        title: 'Pozycja na karcie',
        text: 'Producent, nazwa, rocznik, region, ceny i numer na karcie. Zmiana jest od razu widoczna dla gości.',
        producer: 'Producent', name: 'Wino', vintage: 'Rocznik (rok albo NV)', region: 'Region', country: 'Kraj', tastingNote: 'Nota degustacyjna',
        listNumber: 'Nr na karcie', listNumberHint: 'Zostaw puste, jeśli wina nie ma na drukowanej karcie.', bottlePrice: 'Cena butelki (zł)',
        pouredByGlass: 'Na kieliszki', glassPrice: 'Cena kieliszka (zł)', glassHint: 'Liczy się tylko, gdy wino jest na kieliszki; w przeciwnym razie zostaw bez zmian.',
        baseHint: 'To tekst bazowy. Tłumaczenia są niżej.'
      },
      save: 'Zapisz zmiany',
      create: {
        addDish: 'Dodaj danie', addWine: 'Dodaj wino',
        dishTitle: 'Nowe danie', dishText: 'Nowe danie zaczyna jako szkic: goście zobaczą je po publikacji. Jego profil smaku to też szkic; sprawdź go i potwierdź na stronie dania.',
        wineTitle: 'Nowe wino', wineText: 'Nowe wino trafia do karty win ze szkicem profilu smaku; goście zobaczą je po publikacji. Sprawdź profil i potwierdź go na stronie wina.',
        submitDish: 'Dodaj danie', submitWine: 'Dodaj wino', cancel: 'Anuluj',
        style: 'Styl', grape: 'Szczep (opcjonalnie)', grapeHint: 'Służy tylko do przygotowania szkicu profilu smaku; kilka szczepów oddziel przecinkiem.',
        listNumberHint: 'Zostaw puste, żeby wziąć następny wolny numer.'
      },
      visibility: {
        hide: 'Ukryj przed gośćmi', show: 'Pokaż gościom',
        hideHint: 'Goście przestają widzieć danie od razu; jego parowania i propozycje zostają.',
        showHint: 'To danie jest ukryte. Goście znów je widzą od razu, bez publikacji.'
      },
      readOnly: 'Twoja rola nie może zmieniać tych danych.',
      identity: {
        dish: 'To danie ma {n} parowań sommeliera. Zmień nazwę tylko po to, by ją poprawić, nie by zastąpić danie.',
        wine: 'To wino ma {n} parowań sommeliera. Zmień producenta, nazwę lub rocznik tylko po to, by je poprawić, nie by zastąpić wino.',
        confirm: 'Poprawiam, nie zastępuję'
      },
      lastEditBy: 'Ostatnia zmiana: {name}, {date}',
      lastEdit: 'Ostatnia zmiana: {date}',
      stale: 'Tłumaczenia ({languages}) mogą być nieaktualne.',
      staleLink: 'Sprawdź tłumaczenia',
      checkAfterRename: 'Sprawdź po zmianie nazwy',
      pairsToCheck: 'Parowania do sprawdzenia po zmianie nazwy: {n}',
      errors: {
        required: 'Uzupełnij to pole.', too_long: 'Za długie.', not_positive: 'Musi być większe od zera.', too_many_decimals: 'Najwyżej dwa miejsca po przecinku.',
        glass_not_below_bottle: 'Kieliszek musi kosztować mniej niż butelka.', duplicate: 'Inna pozycja ma już tę nazwę.', transition: 'Ta zmiana nie jest dozwolona.',
        not_a_number: 'Wpisz liczbę, np. 58 albo 58,50.', not_allowed: 'Włącz „Na kieliszki”, aby ustawić cenę kieliszka.', out_of_range: 'Poza dozwolonym zakresem.',
        invalid: 'Niepoprawna wartość.', invalid_chars: 'Usuń znaki sterujące lub niewidoczne.', identity_unconfirmed: 'Potwierdź, że poprawiasz nazwę.',
        unknown_field: 'Nieznane pole.'
      } as Record<string, string>,
      formErrors: {
        version_conflict_dish: 'Ktoś w międzyczasie zmienił to danie. Odśwież stronę.',
        version_conflict_wine: 'Ktoś w międzyczasie zmienił to wino. Odśwież stronę.',
        forbidden: 'Nie masz uprawnień do tej zmiany.', not_found: 'Ta pozycja już nie istnieje.', validation_failed: 'Sprawdź zaznaczone niżej pola. Nic nie zapisano.',
        unexpected: 'Nie udało się zapisać zmiany. Nic nie zostało zmienione; spróbuj ponownie.'
      } as Record<string, string>
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
        wines: { noun: (n: number) => plural(n, 'wino', 'wina', 'win'), columns: 'Producent, Wino, Rocznik, Region, Szczep, Styl, Cena kieliszka, Cena butelki', hint: 'Nowe wina od razu trafiają do karty i dostają propozycje parowań do Twojego przeglądu. Goście zobaczą je po następnej publikacji.', updates: 'ceny' },
        sales: {
          noun: (n: number) => plural(n, 'pozycję', 'pozycje', 'pozycji'), columns: 'Data (dzień biznesowy), Nr rachunku, Goście (opcjonalnie), Kategoria, Pozycja (opcjonalnie), Ilość, Kwota netto',
          hint: 'Wyeksportuj z kasy pozycje rachunków jako CSV albo Excel. Użyj kolumny dnia biznesowego, nie znacznika czasu. Duże pliki dziel po całych dniach. Nazwiska gości i dane kart nie są potrzebne — takie kolumny są pomijane.',
          updates: ''
        }
      },
      columns: {
        name_pl: 'Nazwa (PL)', name_en: 'Nazwa (EN)', description_pl: 'Opis (PL)', description_en: 'Opis (EN)',
        tasting_note_pl: 'Notatka degustacyjna (PL)', tasting_note_en: 'Notatka degustacyjna (EN)', region_pl: 'Region (PL)', region_en: 'Region (EN)', country_pl: 'Kraj (PL)', country_en: 'Kraj (EN)',
        category: 'Kategoria', name: 'Nazwa', description: 'Opis', price: 'Cena (zł)',
        producer: 'Producent', wineName: 'Wino', vintage: 'Rocznik', region: 'Region', country: 'Kraj', grape: 'Szczep', style: 'Styl', glassPrice: 'Kieliszek', bottlePrice: 'Butelka',
        businessDate: 'Data', checkId: 'Rachunek', covers: 'Goście', itemType: 'Typ', itemName: 'Pozycja', recommendationCode: 'Kod polecenia', quantity: 'Ilość', netAmount: 'Netto (zł)'
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
      sales: {
        title: 'Import sprzedaży',
        description: 'Wczytaj pozycje rachunków z kasy, żeby zmierzyć, jak często goście, którzy jedzą, zamawiają też wino. Sprawdzasz każdą pozycję, zanim cokolwiek zostanie zapisane.',
        uploadText: 'CSV albo Excel (.xlsx), do 10 MB i 2000 pozycji. Nic nie jest zapisywane przed zatwierdzeniem.',
        pricesText: 'Kwoty netto w postaci 58,50 albo 58.50 zł. Zwroty i storna to pozycje ujemne.',
        missingColumns: (columns: string) => `Nie znaleziono kolumn: ${columns}.`,
        fieldWords: { businessDate: 'data', checkId: 'numer rachunku', covers: 'goście', itemType: 'typ pozycji', itemName: 'pozycja', quantity: 'ilość', netAmount: 'kwota netto' } as Record<string, string>,
        types: { food: 'Jedzenie', wine_glass: 'Wino na kieliszki', wine_bottle: 'Wino w butelce', other: 'Inne' } as Record<string, string>,
        keepValue: (value: string) => `${value} (wybierz typ)`,
        summaryTitle: 'Co zapisze ten plik',
        summaryEmpty: 'Nie zaznaczono jeszcze żadnego pełnego rachunku.',
        period: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
        checks: (n: number) => `${n} ${plural(n, 'rachunek', 'rachunki', 'rachunków')}`,
        lines: (food: number, glass: number, bottle: number, other: number) => `Pozycje: jedzenie ${food}, wino na kieliszki ${glass}, wino w butelce ${bottle}, inne ${other}.`,
        incomplete: (n: number) => `Niepełne rachunki (zostaną pominięte, bo pozycja jest odznaczona albo ma błąd): ${n}.`,
        replaced: (n: number) => `Rachunki już zapisane dla tych dni, które zostaną zastąpione: ${n}.`,
        checkText: 'Popraw to, co zaznaczono na czerwono, odznacz niepotrzebne pozycje i zaimportuj. Rachunek zapisuje się tylko wtedy, gdy wszystkie jego pozycje są zaznaczone i poprawne.',
        rateLabel: 'Wine Attach Rate tego pliku',
        rateText: (withWine: number, food: number) => `${withWine} z ${food} rachunków z jedzeniem miało wino`,
        noRate: 'W tym pliku nie ma rachunków z jedzeniem.',
        unmappedTitle: 'Nierozpoznane kategorie',
        unmappedText: 'Wybierz typ raz dla każdej kategorii: obejmie wszystkie jej pozycje po „Sprawdź ponownie” albo przy imporcie.',
        unmappedLines: (n: number) => `${n} ${plural(n, 'pozycja', 'pozycje', 'pozycji')}`,
        unmappedChoose: (value: string) => `Typ dla ${value}`,
        notChosen: 'Wybierz…',
        resultLines: 'Zapisane pozycje',
        resultReplaced: 'Zastąpione rachunki',
        doneText: 'Pozycje są zapisane. Nowszy eksport tych samych rachunków je zastępuje, więc ponowny import poprawionego pliku jest bezpieczny.',
        seeRate: 'Zobacz Wine Attach Rate',
        codeNote: (checks: number, unmatched: number) => `${checks} ${plural(checks, 'rachunek ma kod polecenia', 'rachunki mają kod polecenia', 'rachunków ma kod polecenia')}. ${unmatched === 0 ? 'Każdy pasuje do polecenia z tego dnia.' : `${unmatched} ${plural(unmatched, 'kod nie pasuje', 'kody nie pasują', 'kodów nie pasuje')} do poleceń z tego dnia.`}`,
        recommendation: {
          title: 'Wino z polecenia',
          description: 'Kody poleceń wydane w wybranych dniach biznesowych i to, ile z nich zamówiono.',
          ordered: (ordered: number, issued: number) => `Zamówione: ${ordered} z ${issued} ${issued === 1 ? 'polecenia' : 'poleceń'}`,
          split: (waiter: number, till: number) => `(kelner ${waiter}, kasa ${till}). Każde polecenie liczy się raz.`,
          unmatched: (n: number) => `Kody w kasie bez polecenia: ${n}`,
          noneTitle: 'Brak danych',
          none: 'W tym okresie nie wydano ani nie zaimportowano kodów poleceń.',
          note: 'Kod pokazuje, że gość zamówił polecane wino. Nie dowodzi, że zrobiło to polecenie.',
          invalidTitle: 'Tego okresu nie można pokazać',
          invalid: 'Wybierz daty oddalone najwyżej o 366 dni, z końcem nie przed początkiem.'
        },
        attach: {
          title: 'Wine Attach Rate',
          description: 'Rachunki z jedzeniem, na których było też wino, spośród wszystkich rachunków z jedzeniem, w wybranych dniach.',
          range: (from: string, to: string) => `Zaimportowana sprzedaż: ${from} – ${to}.`,
          noRange: 'Nie zaimportowano jeszcze sprzedaży.',
          from: 'Od',
          to: 'Do',
          show: 'Pokaż',
          period: (from: string, to: string) => (from === to ? from : `${from} – ${to}`),
          rateText: (withWine: number, food: number) => `${withWine} z ${food} ${food === 1 ? 'rachunku' : 'rachunków'} z jedzeniem miało wino`,
          noDataTitle: 'Brak danych',
          noData: 'Brak danych sprzedaży w tym okresie.',
          noFood: (checks: number) => `W tym okresie nie ma rachunków z jedzeniem (${checks} ${plural(checks, 'rachunek', 'rachunki', 'rachunków')} tylko z napojami), więc nie ma wskaźnika.`,
          invalidTitle: 'Nie można pokazać tego okresu',
          invalid: 'Wybierz daty odległe najwyżej o 366 dni, z końcem nie wcześniejszym niż początek.',
          perGuest: 'Przychód z wina na gościa',
          perTable: 'Przychód z wina na stolik',
          averageBottle: 'Średnia butelka',
          averageGlass: 'Średni kieliszek',
          guests: (n: number) => `${n} ${plural(n, 'gość', 'gości', 'gości')} przy rachunkach z jedzeniem`,
          noGuests: 'Eksport nie ma liczby gości',
          tables: (n: number) => `${n} ${plural(n, 'rachunek', 'rachunki', 'rachunków')} z jedzeniem`,
          none: '—',
          noneLabel: 'Brak danych',
          net: 'Kwoty netto.'
        }
      },
      notes: {
        pdf: 'Ten PDF został odczytany jako tekst. PDF nie ma prawdziwych kolumn, więc przed importem sprawdź każdy wiersz.',
        noCategory: 'Brak kolumny z kategorią: dania bez kategorii trafiają do dań głównych. Sprawdź je w podglądzie.',
        unused: (columns: string) => `Nieużyte kolumny: ${columns}.`,
        noHeader: (order: string) => `Nie znaleziono wiersza nagłówka, więc kolumny odczytano w tej kolejności: ${order}.`,
        noCovers: 'Brak kolumny z liczbą gości: z tego pliku nie da się policzyć przychodu z wina na gościa.',
        dayMonth: 'Daty typu 03/04/2026 odczytano jako dzień/miesiąc (3 kwietnia 2026).',
        monthDay: 'Daty typu 04/13/2026 odczytano jako miesiąc/dzień (13 kwietnia 2026).',
        repeatedChecks: 'Numery rachunków powtarzają się w różnych dniach. To w porządku, jeśli kasa numeruje paragony od nowa każdego dnia.'
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
        translation_too_long: () => 'Tłumaczenie jest za długie.',
        date_missing: () => 'Brak daty.',
        date_invalid: (p: IssueParams) => `„${p.value}” to nie data.`,
        date_timestamp: () => 'Użyj kolumny dnia biznesowego, nie znacznika czasu.',
        date_future: () => 'Data jest w przyszłości.',
        date_order_conflict: () => 'W pliku są daty dzień/miesiąc i miesiąc/dzień. Wpisz datę jako 2026-10-14.',
        check_missing: () => 'Brak numeru rachunku.',
        check_too_long: () => 'Numer rachunku jest za długi (najwyżej 64 znaki).',
        covers_invalid: (p: IssueParams) => `„${p.value}” to nie liczba gości (0–999).`,
        covers_missing: () => 'Rachunek bez liczby gości: nie liczy się do przychodu z wina na gościa.',
        covers_differ: () => 'Pozycje tego rachunku mają różne liczby gości: liczy się największa.',
        item_type_missing: () => 'Brak typu pozycji.',
        unmapped_category: (p: IssueParams) => `Nierozpoznana kategoria „${p.value}”: wybierz jej typ w sekcji „Nierozpoznane kategorie”.`,
        generic_wine: (p: IssueParams) => `„${p.value}” odczytano jako wino w butelce.`,
        quantity_missing: () => 'Brak ilości.',
        quantity_invalid: (p: IssueParams) => `„${p.value}” to nie ilość.`,
        quantity_zero: () => 'Ilość nie może być zerem.',
        amount_missing: () => 'Brak kwoty netto.',
        amount_invalid: (p: IssueParams) => `„${p.value}” to nie kwota.`,
        amount_too_high: () => 'Kwota wygląda na za wysoką (najwyżej 100 000).',
        return_line: () => 'Zwrot albo storno: odejmowane od rachunku.',
        check_incomplete: () => 'Niepełny rachunek: cały rachunek zostanie pominięty.'
      }
    }
  }
} satisfies Dictionary;
