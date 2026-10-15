---
status: implemented
created: 2026-10-15
owner: Filip
related: [.ai/specs/product-brief.md, .ai/specs/2026-10-15-guest-usage-events.md, docs/SCREEN_SPECIFICATION.md, docs/USER_FLOWS.md]
---

# Krótsza ścieżka gościa i widok desktop

## 📝 TLDR
Dziś gość potrzebuje 3 kliknięć od kodu QR do win (landing „Choose your dish” → danie → ekran preferencji „Show matching wines”), a na komputerze widzi wąską kolumnę 480 px. **Proponujemy**: kod QR otwiera stronę z menu od razu pod nagłówkiem restauracji, kliknięcie dania pokazuje wina (1 kliknięcie), preferencje są opcjonalne w „Refine” i przechodzą między daniami w URL, a od 1024 px aplikacja gościa ma układ dwukolumnowy (menu | wina).

## Problem
- Ekran dania (G2) wita gościa grupami chipów (kieliszek/butelka, kolor, budżet) przy każdym daniu. Właściciel produktu: „nie chcę za każdym razem wybierać ulubionego koloru”. Preferencje są opcjonalne, ale wyglądają na obowiązkowy krok.
- Landing (G0) zajmuje 78% wysokości ekranu i wymaga „Choose your dish”, zanim gość zobaczy menu.
- Wybrane preferencje giną przy powrocie do menu: linki dań nie niosą parametrów, więc przy kolejnym daniu gość ustawia je od nowa.
- Layout gościa ma `max-w-[480px]` (`(guest)/layout.tsx`): na desktopie (podgląd z linku, rezerwacja z domu, tablet przy barze) to telefon na środku pustego ekranu.

Wpływ: zasada „trzy dotknięcia” z `docs/PRODUCT_CONCEPT.md` §8 p.4 jest spełniona tylko przy pominięciu preferencji; A03 z briefu (goście używają aplikacji przy stoliku) zależy od tego, ile tarcia ma pierwsza minuta.

## Cel i zakres
Ścieżka „jedno danie” od QR do win w 1 kliknięciu, preferencje ustawiane raz i pamiętane w URL, układ desktop dla G0–G3 i czytelne strony G5–G9 na szerokim ekranie.
**Poza zakresem:** pamiętanie preferencji między wizytami (wymagałoby ciasteczka lub pamięci przeglądarki — zabronione dla gościa, `packages/app/AGENTS.md`), zmiany silnika i treści rekomendacji, panel (`(admin)`), ścieżka „cały stolik” poza układem.

## Wymagania
- **R1** G0 `/r/{slug}` pokazuje nagłówek restauracji (adres, nazwa, „Find the wine…”) i **od razu pod nim listę dań** (te same wiersze co G1). Wiersz dania prowadzi wprost do G3. „Pair a bottle for the table” i link „For staff” zostają.
- **R2** Kliknięcie dania w G0, G1 i w kolumnie menu na desktopie prowadzi do `/r/{slug}/dish/{dishId}/wines` (G3) — z bieżącymi preferencjami w query.
- **R3** G2 `/r/{slug}/dish/{dishId}` przestaje być ekranem: wpis w `redirects()` w `packages/app/next.config.ts` (`source: '/r/:slug/dish/:dishId'`, `destination: '/r/:slug/dish/:dishId/wines'`, `permanent: true` → 308). Next.js przenosi cały query (także `sid` z E02, `dish`, `sheet`), bez kodu strony; plik `dish/[dishId]/page.tsx` znika (`BACKWARD_COMPATIBILITY.md` §1 — stare linki działają).
- **R4** G3 pokazuje nad rekomendacjami kontekst dania: nazwę, cenę, opis i „taste chips” (dziś na G2), w zwartej formie.
- **R5** Szybkie preferencje na G3: jeden przewijany poziomo rząd chipów — **„More…” pierwszy** (otwiera istniejący arkusz „Refine” `?sheet=filters`; pokazuje liczbę aktywnych filtrów spoza szybkiego rzędu, np. „More · 2”, gdy aktywne są Rosé, budżet, body lub mood), dalej „By the glass”, „By the bottle”, „Red”, „White”, „Sparkling”. Chipy to linki (bez JS). Ponowne kliknięcie aktywnego chipa wyłącza go: serwowanie przez `withServing(prefs, prefs.serving === 'glass' ? 'any' : 'glass')` (analogicznie bottle), style przez `withStyleToggled`.
- **R6** Preferencje przechodzą dalej w URL: linki dań (G0, G1, kolumna menu), „Back” i przełącznik One dish / Whole table niosą `serving`, `styles`, `maxPrice`, `weight`, `mood` (`hrefWith`). Ścieżka stolika też: formularz GET na `/table` dostaje ukryte pola preferencji, linki z `/table/result` je niosą. G0 czyta preferencje z `searchParams` (`guestContext`). Bez ciasteczek i pamięci przeglądarki.
- **R7** Desktop (≥ `lg`, 1024 px): kontener do 1200 px. G0 i G1 — dwie kolumny: nagłówek restauracji (lewa, przyklejona) | menu (prawa). G3 — dwie kolumny: menu z zaznaczonym bieżącym daniem (lewa, przyklejona, przewijana) | rekomendacje (prawa). Arkusz „Refine” na desktopie to panel przy prawej krawędzi zamiast arkusza od dołu (ten sam URL).
- **R8** Pozostałe strony gościa (G5–G9 i wino G7) na `lg`: treść w kolumnie do 720 px na środku; przyklejony dolny pasek akcji (`BottomBar`) staje się zwykłym blokiem pod treścią.
- **R9** Mobile (< 1024 px) wygląda jak dziś poza R1, R3–R5: bez poziomego przewijania przy 390 px, sticky top bar i `scroll-padding` bez zmian.
- **R10** Wszystko działa bez JavaScriptu (server components, linki, formularze GET) i bez nowych zależności.

## Resolved assumptions (autonomous defaults)
| # | Pytanie | Odpowiedź | Uzasadnienie |
|---|---|---|---|
| A1 | Usunąć G2 czy zostawić? | Zastąpić przekierowaniem 308 (R3). | Najmniej kroków; BC §1 wymaga, by stare adresy działały — przekierowanie to droga z BC. |
| A2 | Gdzie preferencje? | Rząd chipów + „More…” na G3 (R5). | Gość widzi wina od razu; zawężenie to jedno kliknięcie, nie ekran. |
| A3 | Jak „pamiętać” preferencje? | Tylko URL (R6). | Gość nie może mieć ciasteczek ani pamięci przeglądarki; URL przeżywa całą wizytę od QR. |
| A4 | Które style w szybkim rzędzie? | Red, White, Sparkling (najczęstsze w karcie demo Halki: 8 red, 6 white, 2 sparkling); reszta w „More…”. | Krótki rząd mieści się na 390 px po przewinięciu; pełna lista bez zmian w arkuszu. |
| A5 | Czy G1 `/menu` zostaje? | Tak, jako ta sama lista (z przełącznikiem trybu), cel „Back” z G3 i G5. | QR wskazuje G0 (BC §1); `/menu` zostaje jako cel nawigacji i dla istniejących linków. |
| A6 | Próg desktopu | `lg` (1024 px) Tailwind. | Tablety w pionie (768) zostają w układzie mobilnym — jedna kolumna jest tam czytelniejsza. |
| A7 | Zdarzenia E02 (spec approved, niezaimplementowany) | `dish_viewed` **znika** z katalogu zdarzeń: G3 renderuje się też przy każdym kliknięciu chipa, więc nie da się go emitować raz na wejście; lejek liczy wejście w danie z `recommendations_viewed` (ma `dishId`). `menu_viewed` także na G0, gdy pokazuje menu. | Zmienia approved spec E02 (tabela zdarzeń, AC1) — wymaga zgody właściciela razem z tą specyfikacją. |

## Architektura
- `(guest)/layout.tsx`: kontener `max-w-[480px] lg:max-w-[1200px]`; tło bez zmian.
- `_components/guest-ui.tsx`: nowe `DishList` (wiersze dań wyciągnięte z G1, z `hrefFor(dish)` i opcjonalnym `currentId` → `aria-current="page"`), `QuickPrefs` (rząd chipów R5 na bazie `Chip` i funkcji `with*` z `core`), `GuestColumns({ main, aside, stickyTop })` — `lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`, dzieci `min-w-0` (lekcja `css-grid-min-width`). **Kolejność w DOM: najpierw treść główna (`main`), potem `<aside aria-label="Menu">`**; na `lg` aside idzie w lewo przez `lg:order-first`, więc klawiatura i czytnik ekranu zaczynają od rekomendacji. Aside: `hidden lg:block lg:self-start lg:sticky lg:max-h-[calc(100dvh-var(--top))] lg:overflow-auto lg:scroll-pt-4`; `stickyTop` = 57 px pod `TopBar` (G1, G3) albo 0 na G0 (bez top bara). `BottomBar` dostaje `lg:static lg:bg-none lg:pointer-events-auto`. `ModeSwitch` przyjmuje gotowe `href` (z preferencjami).
- `r/[slug]/page.tsx` (G0): nagłówek `min-h` zmniejszony na mobile (bez 78dvh, bez przycisku „Choose your dish” — zastępuje go kotwica „Menu” przewijająca do listy); pod nim `DishList`. Na `lg` `GuestColumns`.
- `r/[slug]/menu/page.tsx` (G1): używa `DishList`; linki z preferencjami.
- `r/[slug]/dish/[dishId]/page.tsx` (G2): usunięty; przekierowanie w `next.config.ts` (R3).
- `r/[slug]/dish/[dishId]/wines/page.tsx` (G3): kontekst dania (R4), `QuickPrefs` (R5), na `lg` `GuestColumns` z `DishList currentId`; arkusz `?sheet=filters` jako panel boczny na `lg`: do obecnych klas `fixed bottom-0 left-1/2 -translate-x-1/2 max-w-[480px] rounded-t-[22px]` dochodzą `lg:left-auto lg:right-0 lg:top-0 lg:bottom-auto lg:h-dvh lg:max-h-none lg:w-[420px] lg:max-w-none lg:translate-x-0 lg:rounded-none`; uchwyt arkusza `lg:hidden`. Menu dla kolumny bocznej z `catalogService.publishedMenu` + `pairingCoverage` (dwa zapytania więcej na G3, także na mobile, gdzie aside jest ukryty — akceptowalne przy karcie restauracji; do optymalizacji później). Dane menu z `catalogService.publishedMenu` (już używane na G0/G1).
- G5–G9: klasa kolumny `lg:mx-auto lg:max-w-[720px]` w `main`.
- Brak zmian w `core`, `db`, API, silniku. Pomocnik `hrefWith` (`server/guest-page.ts`) już skleja preferencje z linkiem.

## Model danych
Bez zmian.

## Kontrakty
- Adresy (BC §1): `/r/{slug}/dish/{dishId}` → 308 na `/r/{slug}/dish/{dishId}/wines` z tym samym query; pozostałe adresy i parametry bez zmian. `BACKWARD_COMPATIBILITY.md` §1 dostaje zdanie o przekierowaniu.
- API `/api/v1` bez zmian.

## UI/UX
- **Mobile, G0:** nagłówek ~40% wysokości (adres, nazwa, jedno zdanie, „Pair a bottle for the table”), pod nim „Pick your dish” i lista dań z kategoriami (przyklejone chipy kategorii jak na G1).
- **Mobile, G3:** top bar (Back do menu z preferencjami, Refine), nazwa dania + cena + opis (2 linie) + taste chips, rząd szybkich preferencji, karta „Best match”, „Also good with this dish”.
- **Desktop G0/G1:** lewa kolumna — nagłówek restauracji w kolorze wina, przyklejony; prawa — menu. **Desktop G3:** lewa — menu, bieżące danie wyróżnione (`aria-current="page"`); prawa — jak mobile G3. Panel „Refine” wysuwa się z prawej (szer. 420 px), tło przyciemnione.
- Stany: pusta karta menu → istniejący komunikat „Tonight’s menu is being updated” w kolumnie menu; danie spoza menu na G3 → istniejące 404; brak win → istniejący `EmptyState`.
- Dostępność: kolejność fokusu menu → rekomendacje; widoczny fokus na wierszach dań; `aria-current` na bieżącym daniu i aktywnych chipach.

## Edge Cases & Failure Scenarios
| Sytuacja | Zachowanie |
|---|---|
| Stary link/QR do G2 z preferencjami | 308 na G3 z tym samym query. |
| Danie ukryte po zeskanowaniu (G2 → 308 → G3) | G3 zwraca dziś `notFound()` — bez zmian (404 z linkiem do menu). |
| Preferencje bez wyników na nowym daniu | Istniejąca logika: najbliższe opcje + notice albo `EmptyState` z „Clear filters”. |
| Bardzo długa karta (60+ dań) w lewej kolumnie | Kolumna przewija się niezależnie (`overflow-auto`), bieżące danie ma `scroll-margin`. |
| Szerokość 1024–1100 px | Proporcje 5/12 : 7/12, `min-w-0` — bez poziomego przewijania. |
| Udostępniony link z preferencjami | Odbiorca widzi te same filtry (jak dziś na G3), także na G0. |
| Aktywny styl spoza szybkiego rzędu (np. Rosé) | „More · 1” — filtr jest widoczny, nie „ukryty”. |
| Pomyłka przy wyborze dania (brak ekranu potwierdzenia) | „Back” z G3 wraca do menu z preferencjami; na desktopie kolejne danie jest jednym kliknięciem w lewej kolumnie. |

## Ryzyka
- **Analityka E02:** `dish_viewed` znika (A7); lejek E02/E04 liczy wejście w danie z `recommendations_viewed`. Spec E02 (approved) dostaje superseding wpis: wiersz G2 w tabeli zdarzeń usunięty, AC1 bez `dish_viewed` — zgoda właściciela razem z tą specyfikacją.
- **Zmiana dokumentów ekranów:** `docs/SCREEN_MAP.md`, `docs/SCREEN_SPECIFICATION.md` (G0–G3), `docs/USER_FLOWS.md` §1, `docs/USE_CASES.md` UC-01/UC-02 — aktualizacja w tym samym PR-ze (AGENTS §7).
- **Testy:** `scripts/smoke.mjs` (G2) i `tests/e2e/home.e2e.test.ts` (krok „Show matching wines”) zmieniają oczekiwania.
- Odwracalność: zmiana tylko w warstwie UI; przywrócenie G2 = przywrócenie pliku strony (przekierowanie znika).

## Decyzje w grze
- Brief: R05 (gość bez konta, bez ciasteczek), D01 (aplikacja gościa w MVP), N02 (bez „AI”). `docs/PRODUCT_CONCEPT.md` §8 p.4 „trzy dotknięcia” — spec go realizuje (QR → danie → wina).
- E02 (approved): zmiana miejsca `dish_viewed` (A7) — dopisek w changelogu E02, bez zmiany jego decyzji ⚠.

## User stories
- **Gość przy stoliku** (właśnie zamówił kaczkę, nie zna karty) skanuje QR → widzi nazwę restauracji i od razu menu → dotyka „Duck breast” → widzi rekomendację sommeliera z ceną i uzasadnieniem. System liczy rekomendacje bez żadnych preferencji. Dalej: wybiera wino albo dotyka „By the glass”, bo pije sam.
- **Ten sam gość przy deserze** wraca „Back” do menu → linki niosą „By the glass” → dotyka „Dark chocolate tart” → od razu wina na kieliszki, bez ponownego wybierania.
- **Gość na komputerze w domu** (link z rezerwacji) otwiera restaurację → po lewej nagłówek, po prawej menu → klika danie → po lewej menu z zaznaczonym daniem, po prawej wina → klika kolejne dania i porównuje bez wracania.
- **Gość z zapisanym starym linkiem** do ekranu dania → trafia prosto na wina tego dania.

## Kryteria akceptacji
- [x] AC1 (R1, R2) Na 390 px: `/r/halka` pokazuje listę dań bez przewijania poza nagłówek; dotknięcie „Duck breast” otwiera `/r/halka/dish/{duck}/wines` z rekomendacją sommeliera. E2E.
- [x] AC2 (R3) `GET /r/halka/dish/{duck}?serving=glass` → 308, `Location` = `/r/halka/dish/{duck}/wines?serving=glass`. Smoke.
- [x] AC3 (R4, R5) G3 pokazuje opis dania, taste chips i rząd „By the glass / By the bottle / Red / White / Sparkling / More…”; „By the glass” ustawia `serving=glass`, ponowne kliknięcie usuwa. Smoke + E2E bez JS.
- [x] AC4 (R6) Po „By the glass” na G3 link „Back” i linki dań w menu zawierają `serving=glass`. Test SSR / smoke.
- [x] AC5 (R7) Na 1440 px: G0 i G3 w dwóch kolumnach, bieżące danie z `aria-current="page"`, panel „Refine” po prawej; brak poziomego przewijania przy 1024 i 1440 px. Zrzuty w logu.
- [x] AC6 (R8, R9) G5–G9 przy 1440 px w kolumnie ≤ 720 px, przyciski pod treścią; przy 390 px bez zmian względem dziś. Zrzuty w logu.
- [x] AC7 (R10) Ścieżka QR → danie → wino → „Select” działa z wyłączonym JavaScriptem. E2E.
- [x] AC8 `npm run lint`, `typecheck`, `test`, `build`, smoke i E2E zielone; dokumenty ekranów zaktualizowane.

## 📋 Phasing
- **Faza 1 — krótsza ścieżka (mobile):** R1–R6, R9, R10; dokumenty G0–G3; smoke i E2E. Samodzielnie wartościowa.
- **Faza 2 — desktop:** R7, R8; zrzuty 1024/1440. Zależy od fazy 1 (komponenty `DishList`, `QuickPrefs`).

## 📋 Implementation Plan
1. `guest-ui.tsx`: `DishList`, `QuickPrefs`, `ModeSwitch` z `href`; `BottomBar` `lg:static`. Test SSR komponentów (render do HTML) w `app/tests/unit/`.
2. G2 → `redirects()` w `next.config.ts`, usunięcie strony G2; smoke AC2 (308, `Location` z całym query, także `sid=`).
3. G0 i G1 na `DishList` z preferencjami; G0 bez 78dvh i bez „Choose your dish”.
4. G3: kontekst dania, `QuickPrefs`, linki „Back” z preferencjami.
5. Dokumenty: SCREEN_MAP, SCREEN_SPECIFICATION G0–G3, USER_FLOWS §1, USE_CASES UC-01/02, BC §1 (przekierowanie G2); changelog E02 (A7).
6. Smoke i E2E pod nową ścieżkę; zrzuty 390 px.
7. Faza 2: `layout.tsx` `lg:max-w-[1200px]`, `GuestColumns` na G0/G1/G3, panel „Refine” `lg:`, kolumna 720 px na G5–G9; zrzuty 1024/1440.

## Grill log
| # | Pytanie | Odpowiedź | Przyjęte przez |
|---|---|---|---|
| 1 | Przekierowanie G2 w `next.config` zamiast strony? | Tak (pełny query, prawdziwy 308) | agent-default |
| 2 | „By the glass” klikane drugi raz → `any`? | Tak | agent-default |
| 3 | „More…” pierwszy, z licznikiem ukrytych filtrów? | Tak | agent-default |
| 4 | Preferencje także w ścieżce stolika? | Tak (ukryte pola GET) | agent-default |
| 5 | `dish_viewed` usunąć zamiast emitować na G3? | Tak — zmienia approved E02 | owner ✅ (Filip, 2026-10-15) |
| 6 | Rekomendacje przed menu w DOM, menu w `aside`? | Tak | agent-default |
| 7 | Menu w kolumnie bocznej renderowane także na mobile (ukryte)? | Tak, optymalizacja później | agent-default |
| 8 | Próg desktopu `lg` 1024 px? | Tak | agent-default |

## Changelog
- 2026-10-15 — draft (om-spec-writing --autonomous, prośba właściciela o desktop i krótszą ścieżkę).
- 2026-10-15 — cross-model review (Sonnet 5.5): 3 High, 6 Medium, 5 Low — wszystkie przyjęte (przełączanie serwowania, przekierowanie w `next.config` z pełnym query, `dish_viewed` usunięty, `self-start`/`top-0` na G0, preferencje w ścieżce stolika, klasy panelu Refine, „More…” pierwszy z licznikiem, kolejność DOM + `aside`, G0 czyta preferencje, liczba kroków 3, klasy `BottomBar`, grill log).
- 2026-10-15 — grill: 8 pytań, 1 dla właściciela (#5).
- 2026-10-15 — approved: właściciel (Filip) zatwierdził specyfikację wraz z usunięciem `dish_viewed` z E02; obie fazy do implementacji.

## Realizacja
- Branch `feat/guest-desktop-short-path`; log `.ai/runs/2026-10-15-guest-short-path-and-desktop.md`.
- Nowe: `_components/restaurant-hero.tsx` (`RestaurantHero`, `WineDirectorNote`), w `guest-ui.tsx`: `DishList`, `QuickPrefs` (+ `hiddenPrefCount`), `GuestColumns`; `ModeSwitch` dostaje `href` z preferencjami; `BottomBar` statyczny na `lg`.
- G2: plik strony usunięty, `redirects()` w `next.config.ts` (308, pełny query).
- Odstępstwa od projektu: na telefonie linia Wine Director i link „For staff” przeszły pod menu (krótszy nagłówek, menu widoczne na pierwszym ekranie 390×844); na desktopie zostają w nagłówku. `GuestColumns` przyjmuje `underTopBar` zamiast dowolnych klas sticky.
- Weryfikacja: lint, typecheck, check:boundaries, test, build, smoke na buildzie produkcyjnym (memory) — zielone; brak poziomego przewijania na G0, G1, G3, G4, G5, G9 przy 390/1024/1440 px; G2 → 308 z `sid`/`sheet`; chip „By the glass” przełącza; linki menu i „Back” niosą preferencje.
