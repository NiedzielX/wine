---
started: 2026-10-21 19:00
ended: 2026-10-21 21:12
agent: Claude Code / claude-haiku-5-5
spec: .ai/specs/2026-10-16-recommendation-code.md (faza F3, issue #49)
outcome: partial
related: [.ai/specs/2026-10-16-recommendation-code.md, .ai/specs/implemented/2026-10-15-pos-sales-import-attach-rate.md, .ai/lessons/2026-10-21-test-ids-and-migration-replay.md]
---

# E09 F3: dopasowanie kodów poleceń w imporcie sprzedaży i wynik na A13

## Zadanie
Zrealizować issue #49 (E09 F3) według specyfikacji `.ai/specs/2026-10-16-recommendation-code.md`, fazy 3 (kroki 8–10). Polecenie wskazywało plik `2026-10-15-pos-sales-import-attach-rate.md`; jest on już w `implemented/` i nie zawiera F3, więc właściwym źródłem jest spec E09. Gałąź `feat/e09-f3-pos-code-matching` istniała, ale była w worktree `e09-f3`; utworzono `feat/e09-f3-pos-code-matching-r2` z `origin/main`.

## Przebieg
- Start: `origin/main` (1deeeee). `npx npm@11.20.0 ci` przeszło. Docker nieobecny, więc PostgreSQL 17 z `embedded-postgres` uruchomiony poza repozytorium na porcie 54329 (lekcja `postgres-without-docker`).
- Core: kolumna `recommendationCode` w imporcie (R8), kod z komentarza przez `findCodeInText` w `mapSalesTable` (tekst komentarza nie trafia do rekordu), walidacja poprawki przez `normalizeCode`, `completeChecks` zwraca kody i liczbę rachunków z kodem, `summary` w `RecommendationCodeService`.
- Pamięć i PostgreSQL: `totals`, `pairStats`, `unmatchedPosCodes` z dopasowaniem w POS (R9, liczone przy odczycie, `ordered` = potwierdzone lub dopasowane, raz, R10).
- Migracja: `Migration20261021190119_sales_record_recommendation_code` (kolumna `varchar(4)` null i częściowy indeks). Zastosowana na `winematch`, `winematch_test`, `winematch_e2e`; cztery snapshoty zaktualizowane.
- Błąd w kontrakcie: drugi import reużywał identyfikatorów linii, co dało naruszenie klucza głównego, które `translate()` pokazał jako `duplicate_pairing`. Naprawa w kontrakcie; zapisana lekcja.
- Test migracji up/down musiał odtworzyć późniejszą migrację (kolumna).
- App: karta „Wino z polecenia” na A13, notatka w podglądzie importu, kolumna w podglądzie, teksty PL/EN.
- Dokumentacja: `docs/DATA_MODEL.md`, `docs/SCREEN_SPECIFICATION.md`, `docs/API_SPECIFICATION.md`, `BACKWARD_COMPATIBILITY.md`.
- Weryfikacja w przeglądarce: built app (`next start`, `DATA_SOURCE=memory`, `ALLOW_DEMO_DATA=true`, lokalnie, konto demo) — import `sales-pos-codes.csv` z podglądu do zapisu, karta A13 przy 390 px i 1440 px.

## Weryfikacja
- `npm run lint`: PASS (bez wyjścia, brak błędów).
- `npm run typecheck`: PASS.
- `npm test` (wszystkie pakiety): PASS — core 557/557, db 49/49, app 339/339 (24 pliki), testkit 62/62, ui 10/10. Nowe testy: `core/tests/sales-recommendation-code.test.ts`, `app/tests/unit/recommendation-code-sales.test.ts`, zmienione `core/tests/sales-import.test.ts`, `db/tests/sales-import.test.ts`.
- `npm run check:boundaries`: PASS (Package boundaries OK).
- `npm run build`: PASS (exit 0).
- `DATABASE_URL=… npm run schema:check -w @wine-match/db`: „No changes required, schema is up-to-date” (po zastosowaniu migracji na `winematch`).
- `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres npm run test:db`: PASS, 100/100 (po poprawce kontraktu i testu migracji).
- Przeglądarka, built app, konto demo lokalnie, pamięć: 390 px — podgląd z notatką „4 checks have a recommendation code. 4 codes do not match a recommendation of that day.” i kolumną „Recommendation code”, bez poziomego przewijania (scrollWidth 390); po zapisie komunikat `saved=imported_sales&n=7-0-0`; karta „Wine from a recommendation”: „Ordered: 0 of 0 recommendations”, „Codes on the till without a recommendation: 4”, bez poziomego przewijania. 1440 px — ta sama karta w układzie dwukolumnowym, bez przewijania (scrollWidth 1440).
- Nieuruchomione: `npm run test:e2e` (wymaga `agent-browser`), `npm run smoke` (nie uruchamiane), E2E bez JS dla G8/G9 (AC5, AC6, AC13, AC14 — poza zakresem F3, w specyfikacji nie zaznaczone).

## Wynik
- Zrobione: F3 kroki 8–10 — pole importu i ekstrakcja kodu, walidacja, kolumna i notatka w podglądzie, kolumna `sales_record.recommendation_code` z migracją, dopasowanie w POS (R9, R10), `summary`, karta na A13, kontrakty pamięć i PostgreSQL, testy, dokumentacja.
- Specyfikacja: AC9, AC10, AC11, AC12 zaznaczone. AC1–AC8, AC13–AC15 nie są częścią tego PR-u (F1/F2 — nie zaznaczone w poprzednich przebiegach i nie przeweryfikowane tutaj). Status `in-progress`, bez przeniesienia do `implemented/`.
- Odstępstwa: `summary` istnieje w serwisie (specyfikacja podawała go w kontrakcie, nie było implementacji); `unmatchedPosCodes` liczy pary (dzień, kod), nie rachunki; karta A13 zawsze widoczna pod kartą sprzedaży.
- Nieweryfikowane lub do sprawdzenia: E2E z agent-browser (`test:e2e`), smoke produkcyjny, ręczne wdrożenie za proxy (runbook), decyzja właściciela o dopasowaniu `Q3`/`Q20`.
- Dług: brak E2E dla zapisu kodu w imporcie w przeglądarce bez JS (testy SSR i integracyjne pokrywają łańcuch).

## Lekcje
- `.ai/lessons/2026-10-21-test-ids-and-migration-replay.md`
