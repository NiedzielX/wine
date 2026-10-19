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

Pełna tabela tokenów (wartości z `guest.css`, kontrast liczony na tle `paper` `#f5f3f4` i `surface` `#ffffff`):

| Token (warstwa 1) | Hex | Rola (warstwa 2) | Na `paper` | Na `surface` | Do czego |
|---|---|---|---|---|---|
| `ink` | `#22181d` | tekst główny | 15,6:1 | 17,3:1 | nagłówki, treść, ceny |
| `ink-2` | `#5e5258` | tekst drugorzędny | 6,7:1 | 7,4:1 | wyjaśnienia, podpisy, opisy |
| `ink-3` | `#6f646a` | tekst pomocniczy (AA) | 5,1:1 | 5,7:1 | drobne etykiety |
| `line` | `#e4dee1` | obramowanie dekoracyjne | 1,2:1 | 1,3:1 | separatory, obrys karty (nie obrys pola) |
| `paper` | `#f5f3f4` | tło strony | — | — | tło ekranu |
| `surface` | `#ffffff` | powierzchnia karty | — | — | karty, panele, arkusz filtrów |
| `wine` | `#5a1a2c` | akcja główna | 11,7:1 | 13,0:1 | przycisk główny, aktywny stan |
| `wine-deep` | `#3b0f1c` | tło marki (hero) | 15,0:1 | 16,5:1 | nagłówek restauracji |
| `on-wine` | `#f3e9eb` | tekst na marce i akcji | 1,1:1 (na `paper`, nie używać) | 1,2:1 | tekst na `wine` i `wine-deep` (tam 10,9:1 i 13,9:1) |
| `brass` | `#8a6a30` | pieczęć sommeliera | 4,5:1 | 5,0:1 | tylko pieczęć i ikona, nie długi tekst |
| `brass-soft` | `#f3ede1` | tło uwagi | — | — | `Notice` przy informacji o zmianie |
| `sage` | `#3b6a52` | status „dopasowane” | 5,6:1 | 6,2:1 | tekst i ikona statusu pozytywnego |
| `sage-soft` | `#e5efe9` | tło statusu pozytywnego | — | — | tło chipa statusu |

Zasady granic: obramowanie pola formularza ma kontrast co najmniej 3:1 (`ink-3`, nie `line`). `line` to tylko dekoracja, nie granica elementu interaktywnego.

Ciemnego motywu i widoku desktopowego nie ma w tej wersji dokumentu. Wyjaśnione w sekcji 8.

Warstwa 3 — komponenty biorą kolor z roli, nigdy z surowej wartości (`text-ink-2`, nie `text-[#5e5258]`).

Zmiana w tej iteracji: `ink-3` z `#857a80` (3,73:1, poniżej AA) na `#6f646a`. Skrypt sprawdza kontrast wszystkich tokenów tekstowych na tle `paper` i `surface`.

## 3. Skale

- **Odstępy:** 4 / 8 / 16 / 24 / 32 / 48 px. Zamiast dowolnych wartości. Odstęp między powiązanym tekstem to 8, między akapitami 16, wewnątrz paneli 24, między komponentami 32, między sekcjami 48.
- **Promienie:** 8 (`rounded-lg`, małe kontrolki), 12 (`rounded-xl`, przyciski, karty), 16 (`rounded-2xl`, panele), pełne (`rounded-full`, pigułki).
- **Typografia:** siedem stylów zdefiniowanych w `guest.css` (`--text-*`): caption 12, small 13, body 15, lead 17, h2 24, h1 30, display 40. Nowe wartości px nie wchodzą do kodu. Hierarchia przez grubość i kolor, nie tylko rozmiar. Linia tekstu 45–75 znaków. Rodziny: `serif` (Bodoni Moda, nagłówki i nazwy) i `sans` (Hanken Grotesk, reszta).
- **Ruch:** bez animacji sukcesu przed potwierdzeniem z serwera. Przy ograniczeniu ruchu w systemie animacje znikają.
- **Ikony:** jeden zestaw na produkt, grubość linii dopasowana do fontu. Emoji nie są ikonami.

Każdy styl ma rozmiar, wagę i wysokość linii:

| Styl | Rozmiar | Waga | Wysokość linii | Krój |
|---|---|---|---|---|
| `text-display` | 40 px | 400 | 1,05 | serif |
| `text-h1` | 30 px | 400 | 1,1 | serif |
| `text-h2` | 24 px | 400 | 1,2 | serif |
| `text-lead` | 17 px | 500 | 1,4 | sans |
| `text-body` | 15 px | 400 | 1,5 | sans |
| `text-small` | 13 px | 400 | 1,45 | sans |
| `text-caption` | 12 px | 500 | 1,4 | sans, nie krócej niż 12 px |

Nagłówek i nazwa dania są stylem `text-h2` (serif). Cena to `text-body` z cyframi tabelarycznymi (`tabular-nums`) i wagą 600. Tytuł karty wina to `text-lead` w serif.

## 4. Zasady dostępności (stałe)

- Kontrast tekstu co najmniej 4,5:1, dużego tekstu, ikon i obramowań pól co najmniej 3:1 (sprawdza `check:design` dla tokenów tekstowych).
- Cel dotykowy co najmniej 44 px na telefonie (zalecenie Apple; Material daje 48). Mała ikona w przezroczystej ramce zwiększa obszar kliknięcia, ale ramka ma mieć co najmniej 44 px.
- Treść działa przy zwiększonym odstępie tekstu: interlinia 1,5, odstęp po akapicie 2×.
- Kolor nigdy nie jest jedynym sygnałem statusu: zawsze tekst albo ikona.
- Każdy ekran działa bez JavaScriptu; komponent „i” (`<details>`) jest natywny.

## 5a. Elementy ekranu gościa

Tabela, z której składa się ekran. Nowy ekran bierze te elementy, nie wymyśla nowych.

| Element | Komponent / styl | Uwagi |
|---|---|---|
| nagłówek restauracji | `RestaurantHero`, `text-display` / `text-h1`, tło `wine-deep` | adres `text-small`, nazwa w serif |
| nazwa dania | `text-h2` (serif) | jedna linia, obcinanie z `line-clamp-2` |
| cena | `text-body` 600, `tabular-nums` | format zależny od języka (`formatPrice`), bez „zł” w tekście, z jednostką w formacie |
| karta wina | `BestCard` (pierwsza), `WineRow` (kolejne) | `surface`, obrys `line`, cały kafelek to link |
| tytuł sekcji | `text-lead` 600 | np. „Polecane do Twojego dania” |
| wyjaśnienie | `Explain` (`<details>`), `text-small`, `ink-2` | wyzwalacz: tekst „Skąd te wina?” i ikona „i” |
| szklanka dopasowania | `Score`, skala 5 szklanek (4 z 5 = 80%) | bez liczby, gdy `showScores` wyłączone |
| pieczęć sommeliera | `Seal`, `brass` | tylko przy parze zatwierdzonej |
| stan pusty | `EmptyState` | copy: nagłówek „Brak win do tego dania”, zdanie wyjaśnienia, co zrobić (np. zmień filtry) |

Wzorcowy copy dla stanów pustych i wyjaśnień jest w `en.ts`/`pl.ts` (klucze `guest.wines.noneTitle`, `guest.explain.*`). Agent używa tych kluczy, nie pisze nowego tekstu.

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

## 8. Ograniczenia tej wersji dokumentu

- Układ: mobile-first. Szerokość kolumny na telefonie 100%; od 768 px kolumna rozciąga się (bez maksymalnej szerokości 480 px), od 1024 px dwie kolumny (menu i treść). Szerokość treści tekstowej do 75 znaków.
- Fonty: `Bodoni Moda` i `Hanken Grotesk` są lokalne (`@fontsource`). Fallbacki: `Didot` / `Times New Roman` (serif), `Helvetica Neue` / `system-ui` (sans).
- Ciemny motyw: nie w tej wersji. Każdy token miałby drugą wartość; do dodania osobnym krokiem.
- Animacje: brak. Zasada z sekcji 3 obowiązuje, a `<details>` nie ma animacji.

## 6. Stan prac (lekcja 06)

- [x] Krok 1: referencje (sekcja 1).
- [x] Krok 2: tokeny w trzech warstwach (sekcja 2).
- [x] Krok 3: kontrast tekstu (`ink-3`).
- [x] Krok 7: automatyczna kontrola (`check:design`, ratchet na liczbę wartości).
- [x] Krok 4: typografia w siedmiu stylach (`text-caption`, `text-small`, `text-body`, `text-lead`, `text-h2`, `text-h1`, `text-display`); siedem zamiast sześciu, bo nagłówek 2 i treść wiodąca różnią się realnie.
- [x] Krok 5: promienie 8 / 12 / 16 / pełne (`rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`); ikony jednej grubości linii (1,5).
- [x] Krok 6: kontrakty komponentów gościa (sekcja 5).
- [x] Krok 8: test z agentem (ekran „Lista win do dania”, tylko z dokumentu). Wynik: ponad 20 wyborów bez podstawy w pierwszej wersji; uzupełnione tabelami tokenów, stylów i elementów ekranu w tej iteracji. Raport testu w `scratchpad/design-test/report.md` (poza repo).

Ratchet w `scripts/check-design.mjs`: limit to 8 kolorów hex poza tokenami, 7 stylów tekstu i 4 promienie. Po każdym kroku 4–5 obniżamy limit, nigdy nie podnosimy.
