# Audyt generycznego wyglądu (lekcja 06, ćwiczenie 1)

Data: 2026-10-19. Zakres: aplikacja gościa (`packages/app/src/app/(guest)`), panel (`packages/app/src/app/(admin)`, `packages/ui/src`). Metoda: ręczny przegląd kodu i zrzutów, wzorce z listy lekcji, `scripts/check-design.mjs`. Przeglądarki nie użyto w tym przebiegu; kontrast liczony z tokenów. Wykrywacz jako agent (prompt z lekcji) nie był jeszcze uruchomiony na tym raporcie.

## 1. Znaki generycznego wyglądu

| Znak | Gość | Panel | Uwagi |
|---|---|---|---|
| indygo lub fiolet jako akcja | nie | nie | akcja to bordo `wine` |
| gradient w nagłówku | nie | nie | gradient tylko jako wygaszenie pod dolnym paskiem (funkcja, nie ozdoba) |
| karty z cieniem jako jedyny podział | nie | nie | gość: płaskie powierzchnie z linią 1 px; cień tylko arkusz filtrów (nakładka) |
| pigułka nad nagłówkiem | nie | nie | |
| wyróżnione kolorem słowo w nagłówku | nie | nie | |
| rząd wielkich liczb | nie | nie | |
| wymyślone liczby, opinie, oceny | nie | nie | sprawdzone grepem po tekstach (`4,9`, `opinii`, `klientów`) |
| emoji zamiast ikon | nie | tak, naprawione | `✓` i `!` na Ustawieniach i Publikacji zamienione na `StatusIcon` (PR #81) |
| pigułki na większości elementów | częściowo | nie | chipy i przyciski gościa są pigułkami (`rounded-full`, 29 miejsc). Świadoma decyzja, do rozważenia |

## 2. Błędy UX i dostępności

| Problem | Gdzie | Status |
|---|---|---|
| tekst pomocniczy `ink-3` poniżej 4,5:1 (3,73:1) | cały gość, 13 miejsc | naprawione: `#6f646a`, 5,1:1 |
| obramowania chipów i przycisków poniżej 3:1 (1,57:1 na białym) | chipy, przyciski, pola | naprawione: token `control` `#8c8087`, 3,8:1 (WCAG 1.4.11) |
| menu bez dań: pusty formularz i przycisk, który nic nie zwraca | G5 (stolik) | naprawione: komunikat jak na G1 (PR #82, do sprawdzenia) |
| fokus i kontrast przycisku „Indigo” z lekcji | n/d | nie dotyczy, bo kolor marki |
| stany ładowania, pusto, błąd | wszystkie ekrany gościa | sprawdzone grepem: pusto i błąd są na ekranach z listami i wynikami; zostaje G5 (PR #82) |
| linie tekstu dłuższe niż 75 znaków | G3, G7, G12 | nie zmierzone w przeglądarce. Do sprawdzenia przy 1440 px |
| komunikaty błędów bez wskazówki | formularze panelu | przegląd: pola z komunikatem co zrobić (np. „podaj cenę w złotych”); bez zmian w tym przebiegu |

## 3. Rozrzut wartości (liczby unikalne)

| Miara | Przed | Po |
|---|---|---|
| kolory hex poza tokenami (gość) | 21 | 1 (theme-color w `layout.tsx`, wymagany literał) |
| rozmiary tekstu na ekranach gościa | 27 | 7 (`text-caption` … `text-display`) |
| promienie zaokrąglenia | 11 | 4 |
| kontrast tekstów gościa < 4,5:1 | 1 (`ink-3`) | 0 |
| kontrast tekstów panelu < 4,5:1 (jasny i ciemny motyw) | nie sprawdzano | 0 (`check:design`) |

## 4. Pięć decyzji, które zamykają ten raport

1. **Tokeny kontrolek** (zasada): każda granica interaktywna ma kolor `control` z kontrastem ≥ 3:1. Token, nie literał.
2. **Siedem stylów tekstu** (token): `text-caption`, `text-small`, `text-body`, `text-lead`, `text-h2`, `text-h1`, `text-display`.
3. **Cztery promienie** (token): `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`.
4. **Jeden zestaw ikon w panelu** (zasada): Lucide, także znaczniki statusu (`StatusIcon`).
5. **Strażnik w CI** (zasada): `check:design` blokuje nowe literały, nowe rozmiary, kontrast poniżej 4,5:1 i cienie/emoji na ekranach gościa.

## 5. Otwarte

- Pigułki jako świadoma decyzja (sekcja 1): zostają, do przeglądu przez człowieka.
- Kontrast odznaki „Sommelier’s pairing” (brąz na `brass-soft`, 4,30:1): naprawiony tekstem `brass-ink` (7,54:1) w odznace gościa, na stronie wina, na G9 i w nagłówku restauracji. `check:design` od teraz to łapie: para `text-*` i `bg-*` w jednym literale klas musi mieć kontrast ≥ 4,5:1 (test negatywny: przywrócenie `text-brass` na `brass-soft` daje błąd).
- Wykrywacz jako agent na tym samym raporcie: do zrobienia w kolejnym przebiegu, nie blokuje tego PR.
- Ciemny motyw gościa: poza zakresem (decyzja właściciela).

## 6. Wykrywacz generycznego wyglądu (przebieg agenta)

Data: 2026-10-20. Zakres: `/r/halka`, `/menu`, `/table`, `/how-it-works`, `/staff` (serwer lokalny :3100, dane demo). Pomiar: computed style na wyrenderowanych stronach, 375 px (zamiast 390 px) na pięciu stronach, 1440 px tylko na `/r/halka`. Kod: `packages/app/src/app/(guest)`, `packages/ui/src/brand`. Pliki źródłowe nie zmienione, bez commitu. Kontrast z wzoru WCAG na kolorach obliczonych; tła z przezroczystością (oklab, alfa) nie policzono.

### 6.1 Znaki generycznego wyglądu (17 znaków)

| Znak | Stan | Dowód (plik:linia / element) | Status |
|---|---|---|---|
| indygo/fiolet jako akcja | nie obecny | brak w kodzie; akcja to `bg-wine` (#5a1a2c) | checked |
| gradient w tekście | nie obecny | brak `bg-clip-text` / `text-transparent` | checked |
| gradient w tle | obecny, funkcjonalny | `guest-ui.tsx:88`, `r/[slug]/table/page.tsx:56`, `staff/table/page.tsx:181`: wygaszenie pod paskiem akcji | checked |
| ciemna granatowa poświata | nie obecny | hero to płaska bordo, bez poświaty (375 i 1440 px) | checked |
| pigułki na większości elementów | obecny, częściowo | `rounded-full` w 29 miejscach: chipy, przyciski, segmenty; karty `rounded-xl`/`2xl` | checked |
| karty z cieniem jako jedyny podział | nie obecny | separatory `border-line`; cień tylko na arkuszu i stanie aktywnym | checked |
| karta w karcie | nie obecny | `/r/halka`: jedna karta „Several dishes…”, reszta płaska; inne ekrany tylko w kodzie | checked (1 ekran) |
| przezroczyste rozmyte panele | obecny, funkcjonalny | `guest-ui.tsx:26` `bg-paper/95 backdrop-blur` na sticky nagłówku; jedyny element z blur na każdej stronie | checked |
| pigułka „nowe”/licznik nad nagłówkiem | nie obecny | `/r/halka`: nad H1 nic | checked (1 ekran) |
| wyróżnione słowo w nagłówku | nie obecny | nagłówki bez spanów w kolorze (kod, `how-it-works`, `wines`, `wine`) | checked (kod) |
| para „Zacznij za darmo” / „Zobacz demo” | nie obecny | grep: 0 trafień; jeden CTA „Find a bottle for the table” | checked |
| rzędy wielkich liczb | nie obecny | match % to małe pigułki, `staff/page.tsx:88`, `text-small` | checked (kod) |
| trzy identyczne karty z ikonami | nie obecny | `how-it-works/page.tsx`: sekcje tekstowe, bez siatki kart | checked (kod, bez zrzutu) |
| hero-karta nad pierwszym ekranem | nie obecny | `/r/halka` 375 px: karta pod hero, bez nakładania | checked |
| zmyślone opinie i liczby | nie obecny | grep „opinii”, „4,9”, „klientów”: 0; „Wine List by Marta Wierzbicka” to dane demo, nie referencja | checked |
| emoji | nie obecny | skan zakresów emoji: 0 w DOM 5 stron i w kodzie | checked |
| cienie (utility) na ekranach gościa | obecny, stanowy | `guest-ui.tsx:251` `shadow-sm`; `:358`, `:428` inset jako wskaźnik wyboru; `wines/page.tsx:108` cień arkusza; `layout.tsx:18` ring 1 px | checked (kod) |

Wynik: obecne 4 z 17 (gradient tła, blur nagłówka, cienie stanowe, pigułki częściowo). Żaden nie jest ozdobny; pigułki to świadoma decyzja z sekcji 1.

### 6.2 Błędy UX i dostępności (zaobserwowane)

| Problem | Gdzie | Pomiar | Status |
|---|---|---|---|
| tekst brąz `#8a6a30` na `#f3ede1`: 4,30:1 (< 4,5:1), 13 px | odznaka „Sommelier’s pairing”: `/r/halka`, `/staff` | computed | checked |
| chipy i filtry 36 px wysokości (< 44 px) | `/r/halka` Starters/Mains/Desserts; `/staff` „By the glass” 100×36 | computed | checked |
| „One dish” / „Whole table” 164×43 (1 px pod progiem) | `/r/halka`, `/table` | computed | checked |
| etykiety wyboru 20 px wysokości | `/staff` „Code from the guest’s screen” (301×20), „Dish” | computed; obszar inputu nieznany | checked |
| checkboxy 24×24 | `/table`, 12 inputów | computed; obszar etykiety nie sprawdzony | checked (rozmiar) |
| opisy dań 13 px (poniżej 15 px body) | `/table`: 37 węzłów 13 px | computed; czy to „body”, ocena | checked (rozmiar) |
| tekst z alfą na ciemnym nagłówku (PL/EN, adres) | `/r/halka`, `/menu` | nie policzono (alfa 0,4 / 0,7) | assumed |
| pola bez etykiet | 5 stron | 0 niepodpisanych inputów | checked |
| poziomy scroll przy 375 px | 5 stron | scrollWidth = 375 | checked |
| stany ładowania, pusto, błąd | wszystkie ekrany | nie oglądane | cannot verify |
| overlay „N” Next.js zasłania sekcję | `/r/halka` 375 px | artefakt dev, nie produkt | checked |

### 6.3 Liczby z kodu (24 pliki `(guest)` + `brand`, bez stories)

- Rozmiary tekstu: 7 tokenów (caption 12, small 13, body 15, lead 17, h2 24, h1 30, display 40) + 2 arbitrary `text-[clamp(…)]`. Razem 9. Użycia: body 60, small 47, lead 17, h2 14, h1 10, display 4, caption 2. W renderze zmierzono też 16 px bez tokenu (źródło nieustalone).
- Kolory: 17 tokenów (`ink`, `ink-2`, `ink-3`, `line`, `paper`, `surface`, `wine`, `wine-deep`, `on-wine`, `brass`, `brass-soft`, `brass-ink`, `sage`, `sage-soft`, `control`, `wine-soft`, `page`) użytych w 33 klasach (text/bg/border/ring/outline/accent/from). Literały hex: 20 różnych; 17 to wartości tokenów w `guest.css`, 3 w komentarzach lub `themeColor` (`#857a80`, `#d4ccd0`, `#7D2234`). Literały rgba: 1 wartość (`rgba(34,24,29,0.16)`) w dwóch cieniach.
- Promienie: 4 tokeny (`rounded-lg` 8, `rounded-xl` 12, `rounded-2xl` 16, `rounded-full`) + `rounded-none` i `rounded-t` = 6 klas. Użycia: full 29, xl 10, lg 7, 2xl 7. Literałów px brak. W renderze: 8, 12, 16, pigułka.
- Odstępy: 19 różnych wartości skali Tailwind (0, 0,5, 1 … 10, 12, 16, 28, 32) + 4 literały px w `calc()` safe-area (6, 14, 18, 28 px).

### 6.4 Podsumowanie

Najważniejsze znaleziska (checked): (1) kontrast odznaki sommeliera 4,30:1, a token `brass-ink` (`#5d4720`) wyliczony na ok. 7,5:1 już istnieje; (2) chipy, filtry i etykiety poniżej 44 px; (3) opisy dań 13 px na `/table`.
Ograniczenia: 375 px zamiast 390 px; 1440 px tylko na jednym ekranie; stany ładowania i błędu nieoglądane; kontrast tekstów z alfą na ciemnym nagłówku to tylko przypuszczenie.
