import type { RoiKey, RoiUnit } from '@wine-match/core';
import type { RoiFieldText, showcaseEn } from './showcase-en';

/** Polish plural: 1 gość, 2–4 goście (but 12–14 gości), 5+ gości. */
const plural = (n: number, one: string, few: string, many: string) =>
  n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Texty publicznej strony sprzedażowej (spec 2026-11-04-sales-demo-and-roi-calculator); treść polska jest wiodąca (Q13). Każda liczba to założenie zespołu, nigdy pomiar ani obietnica. */
export const showcasePl = {
  meta: {
    roiTitle: 'Kalkulator zwrotu',
    summaryTitle: 'Podsumowanie założeń: kalkulator zwrotu Wine Match',
    description: 'Kalkulator dla właściciela restauracji: edytowalne założenia zespołu Wine Match i wzór za każdą liczbą.'
  },
  header: {
    brand: 'Wine Match',
    language: 'Język',
    skip: 'Przejdź do treści'
  },
  roi: {
    title: 'Kalkulator zwrotu',
    lead: 'Wpisz liczby swojej restauracji i zobacz, ile dodatkowej marży z wina dałyby założenia zespołu Wine Match. To rachunek na założeniach, nie obietnica wyniku.',
    what: {
      title: 'Czym to jest',
      points: [
        'To założenia własne zespołu Wine Match, niezweryfikowane z danymi Twojej restauracji. Nie są pomiarami i nie obiecują wyniku.',
        'Zakładamy, że cała zmiana wynika z Wine Match; nie uwzględniamy sezonowości, rozruchu ani kosztów po stronie restauracji.',
        'Wine Attach Rate w produkcie liczymy per rachunek; tu przybliżamy go odsetkiem gości.',
        'Każdą liczbę możesz zmienić. Wynik przelicza się z Twoich wartości, a wzór jest wypisany pod nim.'
      ]
    },
    replaced: (names: string[]) => `Zamiast tych wartości użyliśmy domyślnych, bo nie były zwykłą liczbą w dozwolonym zakresie: ${names.join(', ')}.`,
    groups: {
      restaurant: { title: 'Liczby Twojej restauracji', hint: 'Zastąp wartości robocze własnymi.' },
      assumptions: { title: 'Założenia dotyczące Wine Match', hint: 'Co zakładamy, że zmienia produkt, i cena planu.' }
    },
    fields: {
      customers: { label: 'Goście miesięcznie', symbol: 'C', help: 'Ilu gości obsługujecie w ciągu miesiąca.' },
      attachRate: { label: 'Odsetek gości zamawiających wino', symbol: 'a0', help: 'Przybliżenie Wine Attach Rate: jaki odsetek gości zamawia dziś wino.' },
      wineSpend: { label: 'Średnia wartość wina na gościa zamawiającego wino', symbol: 's', help: 'Ile wydaje na wino gość, który dziś je zamawia.' },
      margin: { label: 'Marża na winie', symbol: 'm', help: 'Jaka część przychodu z wina zostaje po koszcie wina.' },
      attachChange: { label: 'Zmiana odsetka zamawiających wino', symbol: 'Δa', help: 'W punktach procentowych (pp): +5 znaczy, że 30% zmienia się w 35%.' },
      spendChange: { label: 'Zmiana wartości wina na gościa zamawiającego wino', symbol: 'Δs', help: 'Dodatkowy wydatek na wino na gościa zamawiającego wino; minus jest dozwolony.' },
      planPrice: { label: 'Cena planu miesięcznie', symbol: 'P', help: 'Ile restauracja płaci za plan co miesiąc.' }
    } satisfies Record<RoiKey, RoiFieldText>,
    units: { count: 'gości', percent: '%', points: 'pp', pln: 'zł' } satisfies Record<RoiUnit, string>,
    default: (value: string) => `domyślnie: ${value}`,
    origin: {
      concept: 'założenie zespołu: z koncepcji produktu',
      working: 'założenie zespołu: wartość robocza, bez źródła',
      own: (value: string) => `założenie: Twoja wartość (domyślnie ${value})`,
      formula: 'wynik wzoru'
    },
    // a whole number takes the noun (1 gość, 2 goście, 5 gości, 22 goście); a fraction takes the genitive singular (8,8 gościa)
    guests: (n: number, formatted: string) => (Number.isInteger(n) ? `${formatted} ${plural(n, 'gość', 'goście', 'gości')}` : `${formatted} gościa`),
    actions: { submit: 'Pokaż wynik', reset: 'Przywróć domyślne', summary: 'Wersja do druku' },
    result: {
      title: 'Wynik wzoru',
      headline: 'Dodatkowa marża po opłacie za plan (założenie)',
      headlineNote: 'To dodatkowa marża brutto z wina minus cena planu. Nie obejmuje kosztów wdrożenia, czasu personelu ani innych skutków, więc nie jest wynikiem finansowym restauracji.',
      perMonth: 'miesięcznie',
      negative: 'Wartość jest ujemna: przy tych liczbach dodatkowa marża nie pokryłaby planu.',
      revenue: 'Dodatkowy przychód z wina',
      margin: 'Dodatkowa marża'
    },
    steps: {
      title: 'Jak liczymy',
      note: 'Każdy wiersz jest pokazany najpierw symbolami, potem Twoimi liczbami. Kwoty zaokrąglamy do pełnych złotych tylko przy wyświetlaniu.',
      clamped: (requested: string, effective: string) => `Zmiana odsetka jest ograniczona do zakresu 0–100%: stosujemy ${effective} zamiast ${requested}.`,
      clampedSpend: (requested: string, effective: string) => `Wartość nie może spaść poniżej 0: stosujemy ${effective} zamiast ${requested}.`,
      none: 'brak wyniku',
      noneMargin: 'brak wyniku: marża wynosi 0%',
      noneSpend: 'brak wyniku: marża albo wartość wina wynosi 0',
      after: { attach: 'Odsetek zamawiających wino po zmianie', spend: 'Wartość wina po zmianie' },
      effect: { attach: 'Efekt większego odsetka zamawiających wino', spend: 'Efekt wyższej wartości wina' },
      revenue: 'Dodatkowy przychód z wina',
      margin: 'Dodatkowa marża',
      net: 'Dodatkowa marża po opłacie za plan (założenie)',
      breakEvenRevenue: 'Punkt zwrotu: przychód, który pokrywa plan',
      breakEvenGuests: 'Punkt zwrotu: dodatkowi goście zamawiający wino, którzy pokrywają plan, przy dzisiejszej wartości wina',
      perMonthSuffix: (value: string) => `${value} miesięcznie`,
      guestsMore: (value: string) => `${value} więcej miesięcznie`,
      symbolic: {
        attachAfter: 'a1 = min(100%, max(0%, a0 + Δa))',
        spendAfter: 's1 = max(0, s + Δs)',
        attachEffect: 'C × (a1 − a0) × s',
        spendEffect: 'C × a1 × (s1 − s)',
        revenue: 'efekt odsetka + efekt wartości',
        margin: 'm × dodatkowy przychód',
        net: 'dodatkowa marża − P',
        breakEvenRevenue: 'P ÷ m',
        breakEvenGuests: 'P ÷ (m × s)'
      }
    }
  },
  summary: {
    title: 'Podsumowanie założeń: kalkulator zwrotu Wine Match',
    dateLabel: 'Data',
    dateEmpty: 'nie ustawiono',
    setDate: 'Ustaw datę',
    back: 'Wróć do kalkulatora',
    print: 'Drukuj / Zapisz jako PDF',
    printHint: 'Użyj Ctrl/Cmd+P, aby wydrukować lub zapisać jako PDF.',
    inputsTitle: 'Liczby i założenia',
    columns: { name: 'Liczba', value: 'Wartość', origin: 'Skąd pochodzi' },
    note: 'To założenia, nie pomiary: własne zespołu Wine Match, niezweryfikowane z danymi restauracji, bez obietnicy wyniku.',
    controls: 'Sterowanie wydrukiem'
  }
} satisfies typeof showcaseEn;
