# Design system — aplikacja gościa

Źródło: lekcja 06 „Design system — warstwa wizualna w nowym podejściu” (materiały AI Tech Leaders). Dokument jest zasadą dla agentów i ludzi: każda wartość wizualna w aplikacji gościa ma być decyzją stąd, a nie przypadkiem. Panel (`packages/ui`, shadcn) ma osobny motyw i nie jest objęty tą specyfikacją, poza zasadami kontrastu i dostępności.

Egzekwowanie: `npm run check:design` (część `npm run build`, skrypt `scripts/check-design.mjs`).

## 1. Referencje (zasady, nie wygląd)

Referencje wybieramy z działających aplikacji, nie z konceptów (Dribbble). Z każdej bierzemy zasadę, nie całość. Wartości poniżej są hipotezami do sprawdzenia wizualnego w Mobbin lub Refero przed wdrożeniem (zapis w PR).

| Referencja | Bierzemy | Nie bierzemy | Gdzie u nas |
|---|---|---|---|
| OpenTable (rezerwacja stolika) | jedna akcja główna na ekranie; przejrzysty wybór godziny i liczby osób | banery promocyjne i oznaczenia sponsorowane | „Cały stół” (G5), wybór liczby osób (E08 F4) |
| Vivino (aplikacja o winie) | karta wina: nazwa, producent, region, ocena z kontekstem liczby | gęsty, społecznościowy feed i reklamy | karta wina (G3), strona wina (G7) |
| Resy (rezerwacja, minimalizm) | mało elementów na ekranie; stan pusty z wyjaśnieniem, nie pusta plansza | nadmiar kolorowych odznak | stany pusta/brak wyników (G3, G11) |

Zasada z lekcji: każda referencja ma pole „nie podoba mi się”. Bez niego zbieramy średnią.

## 2. Tokeny w trzech warstwach

Warstwa 1 — surowe wartości (tylko `guest.css`, `@theme`): `ink`, `ink-2`, `ink-3`, `line`, `paper`, `surface`, `wine`, `wine-deep`, `on-wine`, `brass`, `brass-soft`, `sage`, `sage-soft`.

Warstwa 2 — role (nazwa mówi, kiedy użyć):

| Rola | Wartość | Kontrast na `paper` |
|---|---|---|
| tekst główny | `ink` | 15,6:1 |
| tekst drugorzędny | `ink-2` | 6,7:1 |
| tekst pomocniczy (AA) | `ink-3` (`#6f646a`) | 5,1:1 |
| obramowanie | `line` | dekoracyjne |
| tło strony | `paper` | |
| powierzchnia karty | `surface` | |
| akcja główna | `wine` | 11,7:1 |
| tekst na akcji głównej | `on-wine` na `wine` | 10,9:1 |
| pieczęć sommeliera | `brass` | 4,5:1 (na granicy) |
| status: dopasowane | `sage` | 5,6:1 |

Warstwa 3 — komponenty biorą kolor z roli, nigdy z surowej wartości (`text-ink-2`, nie `text-[#5e5258]`).

Zmiana w tej iteracji: `ink-3` z `#857a80` (3,73:1, poniżej AA) na `#6f646a`. Skrypt sprawdza kontrast wszystkich tokenów tekstowych na tle `paper` i `surface`.

## 3. Skale

- **Odstępy:** 4 / 8 / 16 / 24 / 32 / 48 px. Zamiast dowolnych wartości. Odstęp między powiązanym tekstem to 8, między akapitami 16, wewnątrz paneli 24, między komponentami 32, między sekcjami 48.
- **Promienie:** 8 (małe kontrolki), 12 (przyciski, karty), 16 (panele), pełne (pigułki). Dziś na stronach gościa jest 9 różnych wartości; cel to cztery.
- **Typografia:** dziś 24 rozmiary tekstu, cel to około sześć stylów: display, nagłówek 1, nagłówek 2, treść, drobny tekst, podpis. Hierarchia przez grubość i kolor, nie tylko rozmiar. Linia tekstu 45–75 znaków. Rodziny: `serif` (Bodoni Moda, nagłówki i nazwy) i `sans` (Hanken Grotesk, reszta).
- **Ruch:** bez animacji sukcesu przed potwierdzeniem z serwera. Przy ograniczeniu ruchu w systemie animacje znikają.
- **Ikony:** jeden zestaw na produkt, grubość linii dopasowana do fontu. Emoji nie są ikonami.

## 4. Zasady dostępności (stałe)

- Kontrast tekstu co najmniej 4,5:1, dużego tekstu, ikon i obramowań pól co najmniej 3:1 (sprawdza `check:design` dla tokenów tekstowych).
- Cel dotykowy co najmniej 44 px na telefonie (zalecenie Apple; Material daje 48). Mała ikona w przezroczystej ramce zwiększa obszar kliknięcia, ale ramka ma mieć co najmniej 44 px.
- Treść działa przy zwiększonym odstępie tekstu: interlinia 1,5, odstęp po akapicie 2×.
- Kolor nigdy nie jest jedynym sygnałem statusu: zawsze tekst albo ikona.
- Każdy ekran działa bez JavaScriptu; komponent „i” (`<details>`) jest natywny.

## 5. Komponenty: kiedy nie używać

Każdy komponent gościa ma opis w tym dokumencie, zanim trafi do ekranu. Pierwsza wersja dotyczy komponentów istniejących już na stronach:

- **Explain (`<details>`):** jedno wyjaśnienie na ekran lub kartę. Nie w linku, nie w przycisku akcji.
- **MatchGlass / wynik:** tylko z prawdziwym wynikiem silnika. Bez wyniku nie rysujemy szklanki.
- **Pieczęć sommeliera (`brass`):** tylko przy parach zatwierdzonych przez sommeliera. Nigdy przy wynikach silnika.
- **Przycisk główny (`wine`):** jeden na ekran. Drugi i kolejne to przycisk pomocniczy, nie główny.

Pełny kontrakt każdego komponentu (API, stany, dostępność) dopisujemy przy okazji kolejnych zmian w tym komponencie.

## 6. Stan prac (lekcja 06)

- [x] Krok 1: referencje (sekcja 1).
- [x] Krok 2: tokeny w trzech warstwach (sekcja 2).
- [x] Krok 3: kontrast tekstu (`ink-3`).
- [x] Krok 7: automatyczna kontrola (`check:design`, ratchet na liczbę wartości).
- [ ] Krok 4: konsolidacja typografii do sześciu stylów.
- [ ] Krok 5: konsolidacja promieni do czterech wartości i jednego zestawu ikon.
- [ ] Krok 6: kontrakty komponentów gościa w tym dokumencie.
- [ ] Krok 8: test z agentem: ekran zbudowany tylko z tego dokumentu, z listą miejsc, w których agent zgadywał.

Ratchet w `scripts/check-design.mjs`: obecne wartości (8 kolorów hex poza tokenami, 24 rozmiary tekstu, 9 promieni) są limitem. Po każdym kroku 4–5 obniżamy limit, nigdy nie podnosimy.
