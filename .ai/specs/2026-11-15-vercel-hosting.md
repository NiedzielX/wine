---
status: draft
created: 2026-11-15
owner: Filip
related: [.ai/specs/2026-10-15-production-deployment.md, docs/DEPLOYMENT.md, docs/RELEASING.md, .ai/runs/2026-11-15-vercel-hosting-spec.md]
superseded_by:
---

# Wine Match na Vercelu: produkcja i demo

## Problem
Decyzja D10 (2026-10-15) ustaliła hosting na jednej VM w UE z Docker Compose, PostgreSQL 16 i reverse proxy. Tę decyzję zaproponował agent, a właściciel ją potwierdził; Vercel nigdy nie był z nią porównany. Po lekcji 24 właściciel chce zacząć od całości na Vercelu, produkcji też (2026-11-15). Aplikacja jest Next.js 16, więc Vercel jest jej naturalnym środowiskiem, ale kilka rzeczy w naszym kodzie i runbooku zakłada własną VM (pula połączeń, migracje poza aplikacją, limit importu 11 MB, adres klienta z zaufanego proxy, kopie zapasowe i rollback w `DEPLOYMENT.md`).

## Cel i zakres
Wdrożyć produkcję i publiczne demo na Vercelu z zarządzaną bazą PostgreSQL w UE, ze środowiskami podglądowymi bez danych produkcyjnych i z opisanym, powtarzalnym przebiegiem wydania.

**Poza zakresem:** Railway, Dokploy, Coolify i inne cele (można je dodać osobnym specem); publikacja pakietów do npm (wszystkie są prywatne); usunięcie `Dockerfile` i `docker-compose.yml` (zostają dla lokalnego uruchomienia i jako ścieżka awaryjna, D10 ulega zmianie tylko co do celu referencyjnego); środowiska podglądowe z kopią danych produkcyjnych; wdrożenie przez agenta z kluczem API w prompcie.

## Wymagania
- **R1 Cel.** Produkcja i demo działają jako dwa projekty Vercela z jednego repozytorium; integracja przez GitHub (aplikacja Vercel w repozytorium), bez tokenu Vercela dla agenta.
- **R2 Baza.** PostgreSQL zarządzany (rekomendacja: Neon przez Vercel Marketplace) w regionie UE, ten sam region co funkcje (do sprawdzenia, że Vercel pozwala ustawić region funkcji, np. `fra1`). Produkcyjny `DATABASE_URL` jest sekretem środowiska Vercela i środowiska GitHub `production`, nie trafia do promptów, logów ani repozytorium.
- **R3 Pula połączeń.** Połączenia z bazą nie mogą wyczerpać limitu bazy przy wielu instancjach funkcji. Rozwiązanie wybrane po spike'u (Q4): `pg` Pool zarejestrowany w `attachDatabasePool` z `@vercel/functions` albo zbiorcza adresacja puli (pooler dostawcy) z małym `DB_POOL_MAX`.
- **R4 Migracje.** Aplikacja nadal nigdy nie migruje sama. Migracje uruchamia ręczny workflow GitHub (`workflow_dispatch`) w środowisku `production` z wymaganym przeglądem, **przed** promocją wdrożenia; tylko do przodu (`migration:down` poza produkcją), jak w §10.1 `DEPLOYMENT.md`.
- **R5 Import plików.** Limit żądania funkcji Vercela (4,5 MB wg dokumentacji Vercela, do potwierdzenia) jest niższy niż dzisiejsze 11 MB akcji importu. Limit akcji i komunikat dla użytkownika dopasowane do rzeczywistego limitu (rekomendacja: 4 MB, osobny komunikat „plik za duży, zapisz jako CSV lub podziel”), z testem; plik nadal nie jest przechowywany (`import-conventions`).
- **R6 Adres klienta i limity zapytań (E21 F3).** Adres klienta dla limitów zapytań czytany z nagłówka, któremu ufamy na Vercelu (konfiguracja zaufanych hopów); test na nagłówkach Vercela; bez zaufania nagłówkowi od klienta.
- **R7 Adres publiczny.** `PUBLIC_BASE_URL` to domena produkcyjna z `https://` (zawodzi zamykająco jak dziś); domena i adres QR ustalone przed drukiem kodów. Demo na osobnej domenie. Środowiska podglądowe nie wydają kodów QR.
- **R8 Podglądy PR.** Środowiska podglądowe używają danych demonstracyjnych w pamięci (`DATA_SOURCE=memory`, tryb pokazowy), nigdy produkcyjnej bazy; zmienne produkcyjne nie są dostępne w środowisku Preview.
- **R9 Demo.** Osobny projekt z `DATA_SOURCE=memory` i trybem pokazowym tylko do odczytu, bez bazy i migracji.
- **R10 Wydanie.** Wydanie pozostaje decyzją człowieka (lekcja `release-is-a-human-decision`): scalenie do `main` buduje wdrożenie bez przypisania do domeny produkcyjnej, a właściciel promuje je po przeglądzie wydania (do sprawdzenia, że Vercel pozwala wyłączyć automatyczne przypisanie domen). Tag i GitHub Release robi `release.yml` w trybie szkicu.
- **R11 Rollback.** Wycofanie kodu = promocja poprzedniego wdrożenia w Vercelu; baza tylko do przodu (kolejność: najpierw migracja kompatybilna wstecz, potem kod). Runbook w `DEPLOYMENT.md` (nowa sekcja) i odtworzenie bazy z mechanizmu dostawcy (sprawdzić okres przechowywania i PITR w planie).
- **R12 Sekrety i bezpieczeństwo.** Zmienne środowiska jako „sensitive”; zero sekretów w promptach; rozdzielone zmienne Production i Preview; nagłówki bezpieczeństwa z `next.config.ts` działają bez zmian; przegląd `docs/security/threat-model.md` pod kątem nowego łańcucha (dostawca hostingu, baza zarządzana).
- **R13 Plan i koszty.** Plan Vercela dopuszczający użycie komercyjne (Hobby jest tylko na użytek osobisty, niekomercyjny wg dokumentacji i regulaminu Vercela), czyli co najmniej Pro; właściciel zakłada konto i płaci. Rozmiar funkcji, czas wykonania i pamięć mieszczą się w limitach planu (do sprawdzenia, zwłaszcza import PDF).
- **R14 Dokumentacja i testy.** `docs/DEPLOYMENT.md` dostaje sekcję „Vercel” (instalacja, zmienne, domena, migracje, promocja, rollback, podglądy); wpis o zmianie D10 w briefie; test jednostkowy zmian R5 i R6; `npm run smoke` uruchamialny na adresie podglądu.

## Kryteria akceptacji
- [ ] AC1 (R1, R7) Adres produkcyjny i adres demo odpowiadają po https; `GET /api/v1/health` zwraca 200 z bazą na produkcji, a demo działa bez bazy.
- [ ] AC2 (R2, R12) Produkcyjna baza w UE; `DATABASE_URL` nie występuje w repozytorium, logach, promptach ani środowisku Preview (sprawdzone skanem sekretów i przeglądem ustawień).
- [ ] AC3 (R3) Test obciążeniowy lub opisany pomiar: 50 równoległych żądań do strony wymagającej bazy nie przekracza limitu połączeń bazy; wynik w logu przebiegu.
- [ ] AC4 (R4) Workflow migracji uruchomiony na pustej bazie i na bazie z poprzednią wersją schematu; `migration:pending` zgłasza brak zaległych migracji; aplikacja bez migracji nie startuje (zachowanie jak dziś).
- [ ] AC5 (R5) Import pliku poniżej limitu działa, powyżej daje czytelny komunikat, nie 413 z Vercela; test w `app/tests/unit`.
- [ ] AC6 (R6) Test: limit zapytań liczony po adresie z zaufanego nagłówka Vercela, a nagłówek podany przez klienta nie omija limitu.
- [ ] AC7 (R8, R9) Podgląd PR otwiera się z danymi demo, nie ma dostępu do bazy produkcyjnej; demo jest tylko do odczytu.
- [ ] AC8 (R10, R11) Przeprowadzone na próbie: scalenie do `main` nie zmienia produkcji, promocja zmienia, rollback do poprzedniego wdrożenia przywraca poprzedni kod; zapis w logu.
- [ ] AC9 (R13) Plan i limity sprawdzone w dokumentacji Vercela, link i data w specyfikacji; import PDF największego pliku testowego mieści się w czasie wykonania funkcji.
- [ ] AC10 (R14) `DEPLOYMENT.md` zaktualizowany; `lint`, `typecheck`, `test`, `build`, `check:context`, `secrets:scan` zielone; CI zielone w PR.

## Projekt rozwiązania
Fazy (każda jako osobny PR po akceptacji):
- **F0 (właściciel, bez agenta):** konto Vercel w planie Pro, projekty `wine-match` i `wine-match-demo` z integracją GitHub, baza Neon przez Marketplace w UE, domeny, środowisko GitHub `production` z wymaganym przeglądem i sekretem bazy, zmienne środowiska (Production, Preview osobno). Opis kroków trafia do `DEPLOYMENT.md` w F1.
- **F1 (kod i dokumentacja):** konfiguracja projektu (katalog główny `packages/app`, instalacja z korzenia monorepo, polecenie budowania), zmiany R3 (pula), R5 (limit importu i komunikat), R6 (adres klienta), workflow migracji (R4), wyłączenie automatycznego przypisania domen (R10), sekcja Vercel w `DEPLOYMENT.md`, wpis w briefie o zmianie D10, aktualizacja wiersza routingu w `AGENTS.md` jeśli dojdą pliki.
- **F2 (weryfikacja):** próba wdrożenia na podglądzie przez właściciela, `npm run smoke -- <adres> <slug>`, test rollbacku, pomiar AC3, zapis w logu.
- **F3 (przełączenie):** domena produkcyjna, przegląd modelu zagrożeń, pierwsze wydanie przez `release.yml` (szkic), drukowanie QR dopiero po stałej domenie.

Pliki do zmiany (F1): `packages/app/next.config.ts`, `packages/db/src/config.ts` (pula), `packages/app/src/server/` (adres klienta, konfiguracja), akcje importu w `packages/app/src/app/(admin)/admin/[slug]/import-actions.ts`, `.github/workflows/` (migracje), `docs/DEPLOYMENT.md`, `.env.example`, testy w `packages/app/tests/unit`.

## Ryzyka i otwarte pytania
Rekomendacje wykonuję bez czekania; poniżej wartości domyślne, do zmiany przez właściciela.
- **Q1 Baza.** Rekomendacja: Neon przez Vercel Marketplace, region UE. Alternatywa: zarządzany PostgreSQL u innego dostawcy w UE. Koszt i okres przechowywania kopii (PITR) zależą od planu; do sprawdzenia przed zakupem.
- **Q2 Plan.** Rekomendacja: Pro (użycie komercyjne). Hobby wyklucza użycie komercyjne wg regulaminu, więc nie nadaje się na produkcję.
- **Q3 Limit importu.** Rekomendacja: 4 MB z czytelnym komunikatem. Alternatywa: bezpośrednie wgranie do magazynu obiektów (łamie zasadę „plik nie jest przechowywany”) albo import dzielony po stronie klienta. Wybór wymaga danych: jak duże są realne pliki restauracji (nieznane, C01).
- **Q4 Pula.** Do rozstrzygnięcia spike'iem: czy MikroORM 7 pozwala zarejestrować własną pulę `pg` w `attachDatabasePool`; jeśli nie, pooler dostawcy i `DB_POOL_MAX` małe. Nowa zależność `@vercel/functions` wymaga zgody (§1.1) i wydania starszego niż 14 dni.
- **Q5 Wydanie ręczne.** Rekomendacja: scalenie do `main` nie zmienia produkcji, właściciel promuje. Wymaga sprawdzenia w dokumentacji Vercela, jak wyłączyć automatyczne przypisanie domen dla gałęzi produkcyjnej.
- **Q6 Czas i pamięć funkcji.** Nieznane dla naszego importu PDF i dla zimnych startów z `instrumentation.ts`; spike w F2.
- **Q7 Dane i umowy.** Region UE funkcji i bazy, umowa powierzenia przetwarzania z dostawcami: do sprawdzenia przez właściciela (dane restauracji i gości).
- **Ograniczenie desk researchu (2026-11-15).** Fakty o Vercelu (limit 4,5 MB żądania, Hobby tylko niekomercyjne, wzorzec `pg` Pool z `attachDatabasePool`, integracja z Neon) pochodzą ze streszczeń wyszukiwarki, bo `vercel.com` jest poza dozwolonymi domenami tej sesji; każdy z nich ma być potwierdzony w dokumentacji Vercela z datą przed implementacją (AC9).
- **Ryzyko zmiany D10.** Dostawca hostingu przestaje być zamienny jednym plikiem (obraz OCI pozostaje, ale runbook i przebieg wydania są pod Vercel). Łagodzenie: `Dockerfile` i Compose zostają i są sprawdzane przez job `image`.
- **Ryzyko danych na podglądach.** Zmienna produkcyjna wpisana omyłkowo do Preview ujawniłaby bazę; AC2 i AC7 to sprawdzają.

## Realizacja
(Uzupełnia agent po implementacji.)
