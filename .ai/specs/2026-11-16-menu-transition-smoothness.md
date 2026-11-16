---
status: draft
created: 2026-11-16
owner: Filip Niedziela
related: [.ai/runs/2026-11-16-menu-transition-diagnosis.md, .ai/lessons/2026-11-16-measuring-layout-jumps-in-headless-chromium.md, .ai/lessons/2026-10-14-nextjs-loading-streams-and-http-status.md, .ai/lessons/2026-10-14-server-action-layout-revalidate.md, .ai/lessons/2026-10-14-sticky-bars-scroll-padding.md, .ai/lessons/2026-10-14-css-grid-min-width.md]
superseded_by:
author_model: "not recorded"
reviewed_by: "not recorded (autor sam przeszedł listę kontrolną poniżej; pod-agent nie był dostępny w tej sesji, patrz „Ryzyka i otwarte pytania”)"
---

# Płynniejsze przejścia w menu panelu i aplikacji gościa

## Problem
Zgłoszenie właściciela (dosłownie): „Klikam coś w menu i chciałbym, żeby te przejścia były bardziej płynne. Teraz to skakanie ekranu jest denerwujące.” Nie podano, które menu, więc zbadano oba: panel (pasek boczny, listy, zapisy) i aplikację gościa (menu dań, dania, filtry), przy 390 px i 1440 px.

### Jak mierzono (do powtórzenia)
- Zbudowana aplikacja (`npm run build`, `next start`, `DATA_SOURCE=memory`), konto demo `marta@halka.pl`, Chromium z Playwrighta (`/opt/pw-browsers`). **Ważne:** Playwright domyślnie uruchamia Chromium z `--hide-scrollbars`, co ukrywa pierwszą przyczynę; sondy uruchamiają przeglądarkę z klasycznym paskiem przewijania (15 px), jak na Windowsie i Linuksie.
- Sondy w `.ai/analysis/menu-transition-probes/` (`admin1`–`admin5`, `guest2`, `guest3`, `cold`): `requestAnimationFrame` zapisuje w każdej klatce `clientWidth`, `scrollY`, `scrollTop` paska bocznego, obecność `<aside>` i `<h1>`, wysokość dokumentu; `PerformanceObserver('layout-shift')` zbiera przesunięcia. Zmienna `DELAY=500|600` dokłada opóźnienie do dokumentów i zapytań RSC (symulacja sieci; lokalnie odpowiedź trwa 40–100 ms).
- Uwaga o metryce: CLS z definicji **nie liczy** przesunięć w ciągu 500 ms od kliknięcia (`hadRecentInput`). Przy szybkim serwerze każde przejście ma więc „CLS = 0”, mimo że ekran skacze; dlatego sondy raportują też przesunięcia surowe i zmiany `clientWidth` / `scrollY`. Przy opóźnieniu > 500 ms przesunięcia liczą się normalnie.

### Wyniki: potwierdzone przyczyny

| # | Przyczyna | Dowód (liczby) |
|---|---|---|
| P1 | **Pasek przewijania znika i wraca (brak `scrollbar-gutter`).** Dokument skraca się do wysokości widoku, gdy `loading.tsx` podmienia stronę na szkielet, i znów rośnie po załadowaniu. | Panel 1440 px, przejście Menu → Wine list: `clientWidth` 1425 → **1440** (szkielet) → 1425 (strona). Prawa krawędź przełącznika języka: 1385 → 1400 → 1385 px, czyli **dwa skoki o 15 px w ~300 ms**; cała treść zmienia szerokość. To samo w Review i Dashboard (3 z 3 ekranów z `loading.tsx`, wysokość dokumentu 1598 / 4707 / 2403 → 800 → z powrotem). Bez szkieletu też: przy oknie 900 px wysokości Opportunities → Publish → QR przełącza `clientWidth` 1425 ↔ 1440, bo Publish (854 px) jest krótszy niż okno. Nie ma ani jednego `scrollbar-gutter` w repozytorium. |
| P2 | **Szkielet zastępuje całą stronę, nie jej kształt.** Dowolna lista pokazuje ten sam szkielet (~560 px: pasek tytułu, linia, 4 kafle, blok 288 px), a nagłówek `<h1>` znika. | `h1` = `null` przez 18–19 klatek (~300 ms) na każdym przejściu do list (Menu, Wines, Review, Dashboard), po czym wraca. Przy Postgresie (wolniejszy odczyt) szkielet trwa dłużej. Pasek boczny i jego `scrollTop` **nie** znikają ani się nie resetują (0 klatek bez `<aside>`; `scrollTop` 214 przed i po). |
| P3 | **Brak jakiejkolwiek informacji zwrotnej po kliknięciu poza listami.** Aktywny element menu zmienia się dopiero po zatwierdzeniu trasy; w repozytorium nie ma `useLinkStatus` ani `useTransition`. | Opóźnienie 500 ms: Opportunities, Publish, QR, Setup, Import — przez **~500–600 ms nic się nie zmienia** (ani podświetlenie, ani wskaźnik), potem następuje skok. Gość ma to samo: stuknięcie dania, chipa filtra lub „Filtry” czeka 685–735 ms (przy 600 ms opóźnienia) bez reakcji. |
| P4 | **Zapis w panelu resetuje przewijanie i dosuwa baner.** Akcja serwerowa kończy się `redirect(?saved=…)`; Next przewija na górę, gdy segment strony nie jest widoczny w oknie (dok. `Link` → `scroll`). | Ekran Pairings, „Save note” stuknięte przy `scrollY` 625: po zapisie `scrollY` = **0**, wysokość dokumentu +66 px (baner `Flash` wstawiany nad treścią). Użytkownik traci miejsce, w którym pracował. |
| P5 | **Gość: strzałka „wstecz” z paska górnego zawsze przewija na górę.** To zwykły `Link` do `/menu`, czyli nowa nawigacja; przycisk „wstecz” przeglądarki przywraca pozycję. | Menu przewinięte do 991 px (390 px) / 808 px (1440 px) → danie → strzałka: `scrollY` = **0**; to samo przez `history.back()`: 991 / 808 (przywrócone). |
| P6 | **Pierwsze wejście: zamiana czcionki (FOUT).** `font-display: swap` w `@fontsource-variable/*`; zapasowa czcionka ma inne metryki. Dotyczy zimnego wczytania (np. po zeskanowaniu QR), nie przejść. | CLS zimnego wczytania przy 390 px: gość / danie **0,0686**, panel / Review **0,0589** (przesunięcie tekstu o 6–7 px po 137–141 ms); 1440 px: ≤ 0,0042. Pozostałe ekrany ≤ 0,0017. |
| P7 | Gość: filtr (chip) przestawia długość listy. | `serving=glass` przy opóźnieniu 600 ms: CLS **0,0824** (390 px), 0,0178 (1440 px); lista 1330 → 1264 px. To poniżej progu „dobrego” (0,1); problemem jest brak reakcji (P3), nie sama wysokość. |

### Hipotezy sprawdzone i odrzucone
- Reset przewijania paska bocznego / zniknięcie układu po `revalidatePath(..., 'layout')`: nie występuje (pasek boczny zostaje, `scrollTop` 214 → 214; liczniki bez migotania).
- Pasek nawigacji panelu na 390 px (`overflow-x-auto`): pozycja przewijania zachowana po przejściu (`scrollLeft` 20 → 20, 214 → 214, 797 → 797), `scrollWidth` dokumentu = 390 (brak poziomego przewijania). Zaobserwowano tylko, że aktywna zakładka bywa poza widokiem po wejściu z linku (np. bezpośrednio na QR) — mała sprawa, R9.
- Obrazy bez wymiarów: jedyny `<img>` (QR) ma `width`/`height`.
- Chipy gościa gubią przewijanie: nie — `scroll={false}` działa (150 → 150). Wcześniejszy pomiar 200 → 171 / 0 był artefaktem automatycznego przewijania Playwrighta przy `click()`; powtórzony przez `element.click()` w DOM.
- Skakanie szerokości u gościa przy 1440 px: wszystkie ekrany gościa są wyższe niż 1000 px (clientWidth stałe 1425), więc u gościa występuje dopiero przy bardzo wysokich oknach (> 1171 px, ekran dania). Gutter i tak jest tani (R1).
- Sama sieć lokalna (40–100 ms) nie pokazuje CLS > 0,001 na żadnym przejściu; skakanie widać na wolniejszym łączu i na prawdziwych urządzeniach z klasycznym paskiem przewijania. Na macOS z paskami nakładkowymi P1 jest niewidoczny, za to P2–P5 pozostają.

## Cel i zakres
Przejścia w panelu i u gościa nie przesuwają układu poziomo, nie gubią miejsca użytkownika i od razu pokazują, że kliknięcie zostało przyjęte.

**Poza zakresem:** animacje przejść widoków (`<ViewTransition>`, `experimental.viewTransition` — możliwy kolejny krok po tej poprawce); przepisanie zapisów panelu na `useActionState` bez przekierowania; zmiana czasu odczytu danych w serwisach; prefetch stron dynamicznych; zmiana stosu (czcionki dalej lokalne z `@fontsource-variable/*`, bez `next/font/google`); układ stron gościa poza paskiem górnym.

## Wymagania
- **R1 (P1).** `scrollbar-gutter: stable` na `html` w panelu (`packages/ui/src/styles.css`, `@layer base`) i u gościa (`guest.css`). `clientWidth` dokumentu jest stały podczas każdego przejścia.
- **R2 (P2).** Ekrany list panelu (Dashboard, Menu, Wines, Review) mają szkielet o kształcie strony: prawdziwy `<h1>` (z słownika, w języku panelu) i opis w tym samym miejscu i rozmiarze co `PageHeader`, a szkielet tylko pod nim. Kolumna treści ma `min-height: 100dvh`, żeby wysokość dokumentu nie spadała poniżej okna. Lekcja `nextjs-loading-streams-and-http-status` zostaje: `loading.tsx` nadal wyłącznie w `[slug]/(lists)/`.
- **R3 (P3).** Pasek boczny panelu pokazuje stan oczekiwania klikniętej pozycji natychmiast (≤ 100 ms), także gdy trasa nie ma `loading.tsx` — `useLinkStatus` w małym komponencie klienckim wewnątrz `Link` w `AdminNav`; aktywna pozycja (`aria-current`) nie zmienia znaczenia. U gościa to samo dla dania na liście, chipów (`Chip`, `PeopleLinks`) i „Filtry”: komponent kliencki `PendingMark` z `useLinkStatus`, bez zmiany działania bez JavaScriptu.
- **R4 (P4).** Po zapisie w panelu pozycja przewijania wraca do wartości sprzed zapisu (±50 px), a wynik zapisu jest widoczny bez przewijania: `Flash` w kolumnie treści jest `sticky` przy górnej krawędzi okna (z `scroll-margin`/`scroll-padding` zgodnie z lekcją `sticky-bars-scroll-padding`), nie wstawia się nad treścią i nie zwiększa wysokości dokumentu. Bez JavaScriptu zachowanie jak dziś (przekierowanie, przewinięcie na górę, baner widoczny).
- **R5 (P5).** Strzałka „wstecz” w `TopBar` gościa wraca do poprzedniego wpisu historii, gdy ten wpis to ten sam adres (pozycja przewijania przywrócona przez przeglądarkę); w przeciwnym razie (wejście z linku, brak historii) działa jak zwykły link. Bez JavaScriptu: zwykły link.
- **R6 (P6, priorytet niski).** Zapasowa czcionka nagłówków (`Bodoni Moda`) i tekstu (`Hanken Grotesk`) ma metryki zbliżone do docelowej (`@font-face` z `size-adjust`/`ascent-override` w CSS), tak aby zimne wczytanie przy 390 px miało CLS < 0,05.
- **R7.** Zmiany nie łamią: statusów HTTP 404/redirect (smoke), działania bez JavaScriptu u gościa, `scroll-padding` pasków, granic pakietów (`ui` bez Next.js: `useLinkStatus` jest w `app`, nie w `@wine-match/ui`).
- **R8.** Dokumentacja: `docs/` opisuje zachowanie pasków, stanów oczekiwania i powrotu u gościa; `packages/app/AGENTS.md` dostaje regułę „`scrollbar-gutter`, szkielet o kształcie strony, `useLinkStatus` dla nowych nawigacji” (lub lekcja).
- **R9 (mała).** Aktywna zakładka paska nawigacji panelu na 390 px jest doprowadzana do widoku po wejściu na stronę (`scrollIntoView({ inline: 'nearest' })` w `AdminNav`, bez efektu na przewijanie strony).

## Kryteria akceptacji
Pomiar: sondy z `.ai/analysis/menu-transition-probes/` (lub ich odpowiednik w `packages/app/tests/e2e/`), zbudowana aplikacja, klasyczny pasek przewijania, każdy scenariusz przy opóźnieniu 0 i 600 ms.

- [ ] **AC1 (R1).** Dla każdego przejścia Dashboard → Menu → Wines → Pairings → Review → Opportunities → Publish → Import → Setup → QR przy 1440×800 i 1440×900 `clientWidth` ma jedną wartość (zbiór wartości w klatkach ma rozmiar 1) i prawa krawędź przełącznika języka jest stała. Dziś przy 1440×800: 2 wartości (1425/1440) w 7 z 10 przejść.
- [ ] **AC2 (R2).** Na przejściach do list `<h1>` jest obecny w 100% klatek (dziś `null` w ~18 klatkach), `<aside>` w 100% klatek, wysokość dokumentu ≥ wysokość okna we wszystkich klatkach.
- [ ] **AC3 (R1, R2).** CLS (surowe przesunięcia, także te w oknie 500 ms) < 0,05 na każdym przejściu panelu przy 0 i 600 ms; `scrollTop` paska bocznego niezmieniony (regresja: dziś 214 → 214).
- [ ] **AC4 (R3).** Przy opóźnieniu 600 ms w ciągu 100 ms od kliknięcia klikana pozycja paska bocznego ma `data-pending="true"` (lub równoważny, opisany w teście stan) na trasach bez `loading.tsx` (Opportunities, Publish, QR, Setup, Import menu) oraz u gościa na chipie filtra i na daniu; znika po załadowaniu.
- [ ] **AC5 (R4).** Pairings, „Save note” przy `scrollY` ≥ 500: po zapisie `|scrollY_po − scrollY_przed| ≤ 50`, baner `role="status"` jest w oknie (jego `top` ≥ 0 i < wysokości okna), wysokość dokumentu rośnie o ≤ 2 px. Bez JavaScriptu: URL `?saved=note` i baner obecne.
- [ ] **AC6 (R5).** Gość 390 i 1440 px: menu przewinięte o ≥ 800 px → danie → strzałka „wstecz”: `|scrollY_po − scrollY_przed| ≤ 50`. Wejście bezpośrednio na stronę dania (brak historii) → strzałka prowadzi do `/menu` (200). Bez JavaScriptu strzałka jest zwykłym linkiem.
- [ ] **AC7 (R6).** Zimne wczytanie przy 390 px: CLS < 0,05 dla gość / danie i panel / Review (dziś 0,0686 i 0,0589); wszystkie ekrany przy 1440 px ≤ 0,01.
- [ ] **AC8 (R7).** `npm run lint`, `typecheck`, `npm test`, `npm run build`, `npm run smoke` (404 dla nieistniejącego dania, przekierowanie `/pairings`) i `npm run test:e2e` zielone; `scrollWidth ≤ innerWidth` przy 390 px na każdym ekranie; brak błędów w konsoli.
- [ ] **AC9 (R9).** Wejście bezpośrednie na `/admin/halka/qr` przy 390 px: aktywna zakładka w całości w oknie (`left ≥ 0`, `right ≤ innerWidth`).
- [ ] **AC10 (R8).** `docs/` i `packages/app/AGENTS.md` zaktualizowane; scenariusze QA `.ai/qa/admin/admin-015-…` (przejścia panelu: stała szerokość, pending, scroll po zapisie) i `.ai/qa/guest/guest-016-…` (powrót do pozycji, pending) z testami w `packages/app/tests/e2e/transitions.e2e.test.ts`; `node scripts/check-qa-scenarios.mjs` przechodzi.

## Projekt rozwiązania
Kolejność kroków (każdy jest osobnym commitem; krok 1 można wydać samodzielnie):
1. **Gutter (R1, AC1).** `packages/ui/src/styles.css`: `html { scrollbar-gutter: stable; }` w `@layer base`; `packages/app/src/app/(guest)/guest.css`: to samo. Test: sonda `admin1` + e2e `clientWidth`.
2. **Szkielet o kształcie strony (R2, AC2–3).** Wspólny komponent `ListSkeleton` (prop `title` ze słownika, `PageHeader`-podobny nagłówek i szkielet pod nim). `[slug]/(lists)/loading.tsx` staje się szkieletem Dashboardu (strona główna grupy); `(lists)/menu`, `(lists)/wines`, `(lists)/review` dostają własne `loading.tsx` (zagnieżdżony plik zastępuje grupowy). `AdminShell`: kolumna treści `min-h-dvh`. Uwaga: nowe pliki muszą zostać w zasięgu `(lists)`, żeby `notFound()`/`redirect()` stron szczegółów nadal dawały poprawne statusy.
3. **Stan oczekiwania (R3, AC4).** `admin/_components/nav-pending.tsx` (`'use client'`, `useLinkStatus`, `data-pending`) renderowany w `Link` w `AdminNav`; styl pending (przygaszenie + cienki wskaźnik) w klasach Tailwind panelu. U gościa: `_components/pending-mark.tsx` używany w `Chip`, `PeopleLinks`, wierszu dania i `Button` linkowym w `guest-ui.tsx`; domyślnie niewidoczny bez JS, brak zależności od `app/src/server`. Opóźnienie pokazania wskaźnika ≥ 100 ms w CSS (`transition-delay`), żeby szybkie przejścia nie migały.
4. **Powrót gościa (R5, AC6).** `_components/back-link.tsx` (`'use client'`): `onClick` — jeśli `document.referrer`/`navigation.entries()` wskazuje, że poprzedni wpis ma ten sam `pathname`+`search` co `href`, `preventDefault()` + `history.back()`; inaczej domyślne działanie linku. `TopBar` używa go zamiast `Link`. Test jednostkowy decyzji (czysta funkcja `shouldGoBack(previousUrl, href)`).
5. **Zapis w panelu (R4, AC5).** `Flash`: `sticky top-2 z-10` w kolumnie treści; `admin/_components/preserve-scroll.tsx` (`'use client'`, w `AdminShell`): w fazie przechwytywania `submit` zapisuje `scrollY` i `pathname` w `sessionStorage` (try/catch), po załadowaniu tej samej ścieżki z `?saved=`/`?error=` przywraca pozycję raz i czyści wpis. `sessionStorage` to wygoda widza, nie stan (zgodnie z zasadami).
6. **Czcionki (R6, AC7).** `@font-face` zapasowe z `size-adjust`/`ascent-override` w `guest.css` i `styles.css`, stos `--font-serif`/`--font-sans` z nimi; pomiar `cold.mjs`. Jeśli nie osiągnie < 0,05 bez zmiany stosu — zapisać dług i zostawić (R6 ma niski priorytet).
7. **Zakładka aktywna w widoku (R9, AC9).** `AdminNav`: `useEffect` z `scrollIntoView({ inline: 'nearest', block: 'nearest' })` na elemencie `aria-current` (przy `block: 'nearest'` strona nie przewija się w pionie, gdy element jest w oknie).
8. **Testy i dokumentacja (R7–R8).** `packages/app/tests/e2e/transitions.e2e.test.ts` (agent-browser; pomiary jak w sondach), scenariusze QA, `docs/` (SCREEN_SPECIFICATION lub odpowiednik: zachowanie przejść), lekcja o `scrollbar-gutter` i szkielecie o kształcie strony (lekcja o pomiarze już zapisana).

Pliki: `packages/ui/src/styles.css`, `(guest)/guest.css`, `(admin)/admin/_components/{admin-shell,admin-nav,flash}.tsx` + nowe `nav-pending.tsx`, `preserve-scroll.tsx`, `[slug]/(lists)/**/loading.tsx`, `(guest)/_components/guest-ui.tsx` + nowe `pending-mark.tsx`, `back-link.tsx`, testy w `packages/app/tests/`, `.ai/qa/`, `docs/`. Ekrany: panel A\* (wszystkie), gość G0, G3, G7. Bez zmian w `core`, `db`, modelu danych i API.

Weryfikacja końcowa: `lint`, `typecheck`, `test`, `build`, `smoke` (memory i postgres), `test:e2e`, sondy przy 390 i 1440 px z opóźnieniem 0 i 600 ms, tabela „przed/po” w logu przebiegu.

## Ryzyka i otwarte pytania
- **Q1 (rekomendacja: tak).** Czy trzymać `loading.tsx` dla list (szkielet o kształcie strony), czy go usunąć na rzecz zachowania starej strony do czasu odpowiedzi + R3? Usunięcie przywróciłoby poprawne statusy HTTP i działanie list bez JS (lekcja `nextjs-loading-streams-and-http-status`), ale każde przejście do wolnej listy (Postgres) wyglądałoby na „zawieszone” aż do odpowiedzi. Rekomendacja: zostawić szkielet i go ustabilizować (R2); powrócić do pytania, jeśli pomiary na Postgresie pokażą szkielet > 1 s.
- **Q2.** Pomiar na Postgresie nie został wykonany (tylko `DATA_SOURCE=memory`, lokalna sieć, opóźnienie symulowane). Czas szkieletu u właściciela może być dłuższy; przed akceptacją warto zmierzyć `npm run test:db`-owym zestawem lub na wdrożeniu demo.
- **Q3.** Nie ustalono, czy właściciel pracuje na macOS (paski nakładkowe, P1 niewidoczny) czy na Windowsie/Linuksie; poprawka obejmuje oba przypadki, ale skala „skakania” zależy od tego. Jeśli właściciel odtworzy skakanie bez klasycznego paska, najważniejsze są R2–R5.
- **Q4.** `useLinkStatus` jest w Next.js 16.3 (`next/link`); dokumentacja zaleca go dla tras dynamicznych bez `loading.js` — to dokładnie przypadek tras poza `(lists)` i całej aplikacji gościa. Działa tylko z JavaScriptem (wymaganie z `AGENTS.md` dla gościa: tylko dodatek, każda ścieżka działa bez niego — spełnione).
- **Q5.** Czas pokazania wskaźnika (100 ms) i wygląd pending: do akceptacji właściciela (propozycja: przygaszenie etykiety + 2 px pasek u dołu pozycji).
- **Q6.** Zapis bez przekierowania (`useActionState`) rozwiązałby P4 u źródła, ale zmienia kontrakt akcji (`act()` w `[slug]/actions.ts`) i działanie bez JS; odłożone jako osobna specyfikacja.
- **Ocena „bez specyfikacji”.** Samo `scrollbar-gutter` (krok 1) byłoby oczywistą poprawką w 2 plikach, ale to tylko jedna z pięciu przyczyn (P1–P5) i pozostałe wymagają nowych komponentów i testów (> 3 plików, widoczne dla użytkownika), więc całość idzie ścieżką specyfikacji. Krok 1 można wydać pierwszy, jeśli właściciel chce szybkiej poprawy.
- **Przegląd specyfikacji.** `AGENTS.md` §3 wymaga przeglądu niezależnym agentem; w tej sesji agent nie miał narzędzia do uruchomienia pod-agenta. Przed akceptacją trzeba zlecić przegląd w nowej sesji (brakujące przypadki brzegowe, konflikty z §7, nietestowalne AC). Ręcznie sprawdzono: każdy AC ma pomiar i liczbę wyjściową; konflikty z §7 (bez „AI” w UI gościa, lokalne czcionki, brak CDN, `ui` bez Next.js) nie występują; `Flash` sticky wymaga sprawdzenia z paskiem górnym panelu na 390 px (panel nie ma przyklejonego paska).

## Changelog
- 2026-11-16 — Autor: not recorded (Claude Code, sesja diagnostyczna); recenzent: brak, do zlecenia (źródło dowodu: `.ai/runs/2026-11-16-menu-transition-diagnosis.md`).
