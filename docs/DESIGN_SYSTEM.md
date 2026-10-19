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
- **Promienie:** 8 (`rounded-lg`, małe kontrolki), 12 (`rounded-xl`, przyciski, karty), 16 (`rounded-2xl`, panele), pełne (`rounded-full`, pigułki).
- **Typografia:** siedem stylów zdefiniowanych w `guest.css` (`--text-*`): caption 12, small 13, body 15, lead 17, h2 24, h1 30, display 40. Nowe wartości px nie wchodzą do kodu. Hierarchia przez grubość i kolor, nie tylko rozmiar. Linia tekstu 45–75 znaków. Rodziny: `serif` (Bodoni Moda, nagłówki i nazwy) i `sans` (Hanken Grotesk, reszta).
- **Ruch:** bez animacji sukcesu przed potwierdzeniem z serwera. Przy ograniczeniu ruchu w systemie animacje znikają.
- **Ikony:** jeden zestaw na produkt, grubość linii dopasowana do fontu. Emoji nie są ikonami.

## 4. Zasady dostępności (stałe)

- Kontrast tekstu co najmniej 4,5:1, dużego tekstu, ikon i obramowań pól co najmniej 3:1 (sprawdza `check:design` dla tokenów tekstowych).
- Cel dotykowy co najmniej 44 px na telefonie (zalecenie Apple; Material daje 48). Mała ikona w przezroczystej ramce zwiększa obszar kliknięcia, ale ramka ma mieć co najmniej 44 px.
- Treść działa przy zwiększonym odstępie tekstu: interlinia 1,5, odstęp po akapicie 2×.
- Kolor nigdy nie jest jedynym sygnałem statusu: zawsze tekst albo ikona.
- Każdy ekran działa bez JavaScriptu; komponent „i” (`<details>`) jest natywny.

## 5. Komponenty gościa: kontrakty

Każdy komponent z `packages/app/src/app/(guest)/_components/guest-ui.tsx` ma tu: do czego służy, czego używać zamiast, stany i dostępność. Nowy komponent dopisujemy tu w tym samym PR.

| Komponent | Służy do | Kiedy NIE używać (zamiast) | Stany i dostępność |
|---|---|---|---|
| `Button` (`primary` / `secondary` / `ghost`) | akcja przechodząca na inny ekran (link z `href`) | akcja zmieniająca dane (użyj formularza POST); drugi `primary` na ekranie (użyj `secondary`) | link, więc fokus i klawiatura natywne; min. 44 px wysokości |
| `Explain` (`<details>`) | jedno wyjaśnienie na ekran lub kartę | w linku lub w przycisku akcji; drugie „i” na tym samym ekranie (dopisz akapit do istniejącego) | zamknięte domyślnie, działa bez JS, fokus widoczny |
| `Seal` (pieczęć, `brass`) | para zatwierdzona przez sommeliera | wynik silnika bez zatwierdzenia; ozdoba | ikona z tekstem alternatywnym (`sr-only`), status nie tylko kolorem |
| `Score` / szklanka dopasowania | prawdziwy wynik silnika (`showScores` włączone) | brak wyniku; wynik podbity premią (pokazujemy wynik surowy) | przy `showScores=false` bez liczby; etykieta czytnika ekranu w języku strony |
| `BestCard` / `WineRow` | wino z listy wyników | wino bez wyniku (użyj `EmptyState`) | cały kafelek jest linkiem; cena i styl jako osobne elementy |
| `EmptyState` | brak wyników lub brak menu | błąd techniczny (użyj komunikatu błędu) | nagłówek i jedno zdanie; zawsze z wyjaśnieniem, dlaczego pusto |
| `Notice` | informacja o zmianie zachowania (np. luzowanie budżetu) | komunikat o błędzie; dekoracja | tekst, nie kolor |
| `TableDishPicker` | wybór dań stołu (G5, G11) | wybór jednego dania (użyj listy `DishList`) | checkbox natywny; wiersz kotwic bez JS |
| `PeopleChoice` / `PeopleLinks` | liczba osób, tylko po jawnym wyborze | ustawianie domyślnej liczby (decyzja Q4: bez domyślnej) | grupa z `legend`; linki 2–8 |

Dla agentów: wybieraj komponent po tabeli, nie po wyglądzie. Jeśli żaden nie pasuje, zapytaj zamiast wymyślać nowy.

## 6. Stan prac (lekcja 06)

- [x] Krok 1: referencje (sekcja 1).
- [x] Krok 2: tokeny w trzech warstwach (sekcja 2).
- [x] Krok 3: kontrast tekstu (`ink-3`).
- [x] Krok 7: automatyczna kontrola (`check:design`, ratchet na liczbę wartości).
- [x] Krok 4: typografia w siedmiu stylach (`text-caption`, `text-small`, `text-body`, `text-lead`, `text-h2`, `text-h1`, `text-display`); siedem zamiast sześciu, bo nagłówek 2 i treść wiodąca różnią się realnie.
- [x] Krok 5: promienie 8 / 12 / 16 / pełne (`rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`); ikony jednej grubości linii (1,5).
- [x] Krok 6: kontrakty komponentów gościa (sekcja 5).
- [ ] Krok 8: test z agentem: ekran zbudowany tylko z tego dokumentu, z listą miejsc, w których agent zgadywał.

Ratchet w `scripts/check-design.mjs`: limit to 8 kolorów hex poza tokenami, 7 stylów tekstu i 4 promienie. Po każdym kroku 4–5 obniżamy limit, nigdy nie podnosimy.
