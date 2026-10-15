---
status: in-progress
created: 2026-10-14
owner: Filip
related: [.ai/specs/implemented/2026-10-14-monorepo-nextjs-architecture.md, .ai/runs/2026-10-14-guest-app-parity.md]
superseded_by:
---

# Plan migracji: z mockupów (Vite) do produkcyjnej aplikacji w `packages/app`

> Zakres zatwierdzony przez właściciela poleceniem z 2026-10-14 („wdróż migrację projektu do monorepo… zacznij od pierwszej nieukończonej fazy”). Wcześniejsza specyfikacja architektury (w `implemented/`) objęła szkielet i pionowy przekrój; ten plan obejmuje przeniesienie zachowania aplikacji.

## Problem
Szkielet monorepo działa, ale produkt wciąż istnieje głównie jako mockupy: `packages/mockups` ma ~1600 linii widoków (guest + dashboard, stan w `localStorage`), a `packages/app` tylko rekomendacje dania, listę dań i pairingi dania w panelu (tylko odczyt). Mockupy nie są kodem produkcyjnym.

## Cel i zakres
Przenieść zachowanie mockupów do `packages/app` fazami, z zachowaniem granic pakietów z `AGENTS.md` §1 (logika w `core`, dane przez porty i DI, gość = Tailwind bez shadcn, panel = shadcn z `packages/ui`). Każda faza kończy się działającą, sprawdzoną aplikacją.

**Poza zakresem:** zmiany reguł silnika, nowe funkcje produktu poza `docs/SCREEN_SPECIFICATION.md`.

## Fazy i kryteria ukończenia

### Faza 0 — szkielet monorepo — ZAKOŃCZONA
Workspaces, `core` / `db` / `ui` / `app` / `mockups`, DI (Awilix), MikroORM + migracja początkowa + seeder, granice pakietów, `AGENTS.md`, `README.md`. Szczegóły: spec w `implemented/`.

### Faza 1 — aplikacja gościa: pełna zgodność z mockupami (G0–G9) — ZAKOŃCZONA
Ekrany: landing (G0), lista dań (G1), szczegóły dania z szybkimi preferencjami (G2), rekomendacje (G3), filtry (G4), cały stolik (G5), najlepsze wino dla stolika (G6), szczegóły wina (G7), potwierdzenie (G8), widok kelnera (G9), stany nieznanej restauracji / dania / wina.
Stan gościa (preferencje, wybór dań) w parametrach URL — działa bez JavaScriptu i bez `localStorage`.
- [x] F1.1 Wszystkie 10 ekranów dostępne pod adresami z `docs/SCREEN_MAP.md` (`/r/{slug}/…`), bez zmian działania względem mockupów (ten sam silnik, te same wyniki).
- [x] F1.2 Port `WineRepository.findById` (z kontraktem, pamięć, PostgreSQL); serwis zwraca wino z dopasowaniem do dania; numer pozycji z karty (`listNumber`) w modelu domenowym.
- [x] F1.3 Logika parametrów gościa (`parse` / `serialize`) w `core` z testami; bez logiki w komponentach.
- [x] F1.4 `POST /api/v1/recommendations/table` i `GET /api/v1/public/restaurants/{slug}/menu` zgodnie z `API_SPECIFICATION.md`.
- [x] F1.5 `check:boundaries`, `typecheck`, `test`, `test:db`, `build` przechodzą; strony gościa przeklikane w obu trybach danych (`memory`, `postgres`) przy 390 px bez poziomego przewijania i bez błędów konsoli.
- [x] F1.6 Skrypt `npm run smoke` sprawdza wszystkie trasy gościa i API na uruchomionej aplikacji.

### Faza 2 — panel: ekrany tylko do odczytu — ZAKOŃCZONA
Dashboard, lista dań, szczegóły dania, lista win, szczegóły wina, kolejka review i pairingi dania (odczyt). shadcn z `packages/ui`.
- [x] F2.1 Ekrany A1–A5, A7 i A6 (odczyt) pod `/admin/{slug}/…` zgodnie z `SCREEN_SPECIFICATION.md`, z nawigacją boczną, stanami empty / error / loading i filtrami (formularze GET).
- [x] F2.2 Modele odczytu w `core` (`AdminService`: overview, menu, dishDetail, wines, wineDetail, reviewQueue) z testami; strony bez logiki.
- [x] F2.3 Nowe komponenty shadcn w `packages/ui` (progress, alert, skeleton, native-select) i `LevelMeter`; brak `@wine-match/db` w stronach (granice).
- [x] F2.4 `typecheck`, `test`, `test:db`, `schema:check`, `build` zielone; `npm run smoke` obejmuje panel (47 sprawdzeń) w trybach `memory` i `postgres`; przeklikanie przy 1440 px i 390 px bez przepełnienia i błędów konsoli.
- **Zakres zmieniony świadomie:** KPI użycia i sprzedaży z dashboardu (sesje, konwersja, attach rate, przychód, wykresy) przeniesione do Fazy 6, bo nie ma jeszcze danych (nie zapisujemy eventów). Dashboard pokazuje KPI programu winnego z katalogu oraz stan pusty „Guest activity” zgodny ze specyfikacją.

### Faza 3 — panel: zapisy sommeliera — ZAKOŃCZONA
Zatwierdzanie / odrzucanie / rola / kolejność / notatka / ręczne pary / przełączanie dostępności wina, historia decyzji, blokada optymistyczna, publikacja z migawką. Szczegółowa specyfikacja: `.ai/specs/implemented/2026-10-14-phase3-sommelier-writes.md`.
- [x] F3.1 Komendy sommeliera i publikacja w `core` (reguły w czystych funkcjach) z testami; kontrakt zapisu przechodzi na pamięci i PostgreSQL.
- [x] F3.2 Testy integracyjne na PostgreSQL: konflikt wersji (dwie sesje), unikalność Primary i pary, historia po usunięciu, niezmienna migawka do publikacji.
- [x] F3.3 Goście widzą zmiany dopiero po publikacji (test na obu źródłach danych).
- [x] F3.4 Formularze w panelu (A4, A6, A7, A11) działają z JavaScriptem i bez; zapisy wyłączone w produkcji bez `ADMIN_WRITES_ENABLED`.
- [x] F3.5 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone.
- **Zmiana zakresu (świadoma):** **REST API zapisu** przesunięte do Fazy 4 — niezabezpieczony publiczny endpoint zapisu byłby ryzykiem, a specyfikacja API i tak wymaga sesji i CSRF. Zapisy działają przez akcje serwerowe panelu.

### Faza 4 — uwierzytelnianie i role — ZAKOŃCZONA
Logowanie, sesje, role, ochrona panelu, akcji i API, REST API zapisu, prawdziwy autor w historii. Specyfikacja: `.ai/specs/implemented/2026-10-14-phase4-authentication.md`.
- [x] F4.1 `AuthService` (logowanie, sesje, blokada) i uprawnienia z macierzy ról w `core`; kontrakt `AuthRepository` na pamięci i PostgreSQL.
- [x] F4.2 Żaden adres `/admin/**` ani endpoint zapisu nie działa bez sesji; brak członkostwa = 403; Owner / GM bez decyzji o pairingach, Waiter bez logowania.
- [x] F4.3 W bazie tylko hash tokenu sesji i hash hasła; cookie httpOnly + SameSite (+ Secure w produkcji).
- [x] F4.4 Autor w historii decyzji (`actor`, `actor_id`); REST API zapisu z CSRF, `If-Match` i mapowaniem błędów.
- [x] F4.5 Sfałszowane formularze akcji z konta bez uprawnień i bez sesji są odrzucane przez serwer (test z przeglądarki, z próbą kontrolną).
- [x] F4.6 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone.

### Faza 5 — import i QR — ZAKOŃCZONA
Import menu i karty win (CSV / XLSX / PDF) po stronie serwera z podglądem, `ImportJob`, QR (SVG / PNG), ekran Setup. Specyfikacja: `.ai/specs/implemented/2026-10-14-phase5-import-and-qr.md`.
- [x] F5.1 Parsery CSV, XLSX i PDF przechodzą testy na prawdziwych plikach; błędne pliki dają czytelne komunikaty.
- [x] F5.2 Test integracyjny importu na PostgreSQL: podgląd, poprawki, atomowe i jednorazowe zatwierdzenie, duplikaty, izolacja restauracji.
- [x] F5.3 Nowe dania jako szkice, nowe wina aktywne, propozycje silnika; goście nie widzą zmian przed publikacją.
- [x] F5.4 Ekrany A8 / A9 / A10 / A12 w przeglądarce na prawdziwych plikach; kod QR odczytany dekoderem.
- [x] F5.5 Uprawnienia: import i QR dla ról z macierzy, dane restauracji i slug tylko Owner / GM.
- [x] F5.6 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone.

### Faza 6 — analityka i wycofanie mockupów — NASTĘPNA
Zapis `GuestInteraction`, KPI użycia i sprzedaży oraz wykresy w dashboardzie z prawdziwych danych (przeniesione z Fazy 2), import sprzedaży (CSV). Mockupy zostają tylko jako materiał pokazowy albo są archiwizowane (decyzja właściciela).

## Ryzyka i otwarte pytania
- Parametry URL jako stan gościa dają dłuższe adresy; akceptowalne w MVP (QR otwiera zawsze czysty adres).
- Faza 4 zmienia kontrakt portów (kontekst użytkownika) — zaplanować przed Fazą 3, jeśli zapisy mają od początku znać autora.

## Realizacja

### Faza 0 — szkielet monorepo (2026-10-14)
Patrz spec w `implemented/` i `.ai/runs/2026-10-14-monorepo-foundation.md`.

### Faza 1 — aplikacja gościa (2026-10-14)
Log: `.ai/runs/2026-10-14-guest-app-parity.md`.
- **Strony** (`packages/app/src/app/(guest)/r/[slug]/`): landing, `menu`, `dish/[dishId]`, `dish/[dishId]/wines` (+ filtry `?sheet=filters`), `wine/[wineId]`, `selected/[wineId]`, `table`, `table/result`, `staff`; wspólne komponenty w `(guest)/_components`.
- **API:** `POST /api/v1/recommendations/table`, `GET /api/v1/public/restaurants/{slug}/menu` (+ istniejący `GET /dishes/{id}/recommendations`).
- **`core`:** `listNumber` w `Wine`; `WineRepository.findById` (pamięć, PostgreSQL, kontrakt); `RecommendationService.wineDetails`; `CatalogService.publishedDish` i `hasPrimary`; moduł `guest/` (`parseGuestPrefs`, `prefsToQuery`, `with*`, `tasteWords`, `parseDishIds`) z testami.
- **Stan gościa w URL** zamiast `localStorage` — wszystkie ścieżki działają bez JavaScriptu; JS tylko dla licznika wybranych dań.
- **Narzędzia:** `npm run smoke` (28 sprawdzeń stron gościa i API na uruchomionej aplikacji).
- **Odstępstwa od mockupów** (opisane w `docs/SCREEN_SPECIFICATION.md`): filtry i wybór dań przez URL i formularze GET; arkusz filtrów zamykany linkiem (bez klawisza Escape); brak stanów `?demo=` (są tylko w mockupach).
- **Błąd znaleziony przez weryfikację:** przyklejony dolny pasek zasłaniał pola wyboru (lekcja `sticky-bars-scroll-padding`); naprawiony przez `scroll-padding` i `pointer-events`.
- **Weryfikacja:** typecheck, 49 testów jednostkowych, 9 integracyjnych na PostgreSQL, `schema:check`, `build` z granicami pakietów, `npm run smoke` 28/28 w trybach `memory` i `postgres`, przeklikanie ścieżki gościa w przeglądarce przy 390 px z JavaScriptem i bez, brak przepełnienia i błędów konsoli.

### Faza 2 — panel, odczyt (2026-10-14)
Log: `.ai/runs/2026-10-14-admin-readonly-screens.md`.
- **`core`:** `AdminService` z modelami odczytu i 11 testami (60 testów w pakiecie).
- **`ui`:** `progress` (z lokalną poprawką `value` → `aria-valuenow`), `alert`, `skeleton`, `native-select`, `LevelMeter`.
- **`app`:** układ panelu z nawigacją boczną (`AdminShell`, `AdminNav`), 8 stron: dashboard, menu, szczegóły dania, wina, szczegóły wina, pairingi (+ indeks), review; `error.tsx`, `not-found.tsx`, `loading.tsx` (w grupie `(lists)`).
- **Przeniesione trasy:** `/admin/[slug]/dishes/[dishId]` → `/admin/[slug]/pairings/[dishId]`; lista dań z `/admin/[slug]` → `/admin/[slug]/menu` (dashboard pod `/admin/[slug]`), zgodnie z `SCREEN_MAP.md`.
- **Błędy znalezione weryfikacją:** (1) `loading.tsx` powodował status 200 przy `notFound()` / `redirect()` — naprawione grupą tras; (2) pasek postępu shadcn bez `aria-valuenow` — poprawka lokalna; (3) kolizja nazw `MenuRow` / `WineRow` w `core` — zmienione na `AdminMenuRow` / `AdminWineRow`.
- **Ograniczenia:** ekrany list panelu wymagają JavaScriptu (strumieniowanie); brak uwierzytelniania — każdy z dostępem do adresu widzi panel (Faza 4); brak zapisów (Faza 3).

### Faza 3 — zapisy sommeliera (2026-10-14)
Log: `.ai/runs/2026-10-14-sommelier-writes.md`; spec: `implemented/2026-10-14-phase3-sommelier-writes.md`.
- Decyzje: Server Actions zamiast REST; migawka publikacji (goście czytają ostatnią wersję); historia decyzji bez klucza obcego; `ADMIN_WRITES_ENABLED` do czasu logowania; `actor` jako parametr komend.
- Wyniki: 96 testów jednostkowych, 21 integracyjnych, smoke 56/56 (`memory`, `postgres`), cykl sommeliera przeklikany w przeglądarce na PostgreSQL (z JS i bez), migracja `published_versions_and_decision_history`.
- Ograniczenia: panel bez logowania (Faza 4); edycja dania i wina (profile, ceny) nie jest zaplanowana w żadnej fazie — do decyzji; ekrany list wymagają JS.

### Faza 4 — uwierzytelnianie (2026-10-14)
Log: `.ai/runs/2026-10-14-authentication.md`; spec: `implemented/2026-10-14-phase4-authentication.md`.
- Decyzje: własne uwierzytelnianie (scrypt, sesje z hashem tokenu, blokada konta), role z `USER_ROLES.md`, trzy drzwi sprawdzają same, CSRF dla API, slug zamiast UUID w API.
- Wyniki: 122 + 7 testów, 31 integracyjnych, smoke 111/111 (`memory`, `postgres`), obrona akcji serwerowych potwierdzona z przeglądarki.
- Ograniczenia: limit prób per konto (nie per IP — wymaga współdzielonego magazynu); sesja bezwzględna 12 h; brak resetu hasła, 2FA, UI do zarządzania użytkownikami; `ADMIN_WRITES_ENABLED` usunięte.
- **Poza planem, zrobione:** `.github/workflows/ci.yml` (typecheck, testy, baza, build, smoke); plik **nie był uruchomiony** (brak dostępu do GitHub Actions), tylko zwalidowany jako YAML i oparty na lokalnie przetestowanych poleceniach.

### Faza 5 — import i QR (2026-10-14)
Log: `.ai/runs/2026-10-14-import-and-qr.md`; spec: `implemented/2026-10-14-phase5-import-and-qr.md`.
- Decyzje: parsery w `@wine-match/db/import` (własny czytnik XLSX na `fflate`, `unpdf` dla PDF), typ pliku po zawartości, plik nieprzechowywany, duplikaty jako niezaznaczone aktualizacje, atomowe zatwierdzenie z blokadą wiersza, QR pod `PUBLIC_BASE_URL/r/{slug}`.
- Wyniki: 208 + 25 testów, 45 integracyjnych, smoke 155/155 (`memory`, `postgres`); import przeklikany na prawdziwych plikach; kod QR odczytany dekoderem.
- Ograniczenia: PDF tylko jako tekst (bez OCR skanów i bez rozpoznawania tabel); `.xls` nieobsługiwane; zmiana sluga unieważnia wydrukowane kody (bez przekierowania ze starego adresu); import sprzedaży w Fazie 6.

### Poza planem faz — standardy inżynieryjne (2026-10-15)
Log: `.ai/runs/2026-10-15-engineering-standards.md`; spec: `implemented/2026-10-15-engineering-standards.md`; dokument: `.ai/docs/engineering-standards.md`.
- Wdrożone na polecenie właściciela między Fazą 5 a 6: bramka `lint` (`oxlint`), logger z redakcją sekretów, walidowana konfiguracja zawodząca zamykająco, walidatory Zod i jedna obsługa błędów w trasach API, scrypt na poziomie OWASP, aktualizacja Next.js (podatności), bramka audytu, podkatalogi pojęć, `boot:check` (start bez bazy).
- Faza 6 (analityka, import sprzedaży, wycofanie mockupów) pozostaje następna; od teraz obowiązuje ją `lint`, `audit:gate` i `boot:check` oraz konwencje z `.ai/docs/engineering-standards.md`.
