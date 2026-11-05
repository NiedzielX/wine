---
started: 2026-11-04 12:00
ended: 2026-11-05 18:40
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-10-15-production-deployment.md
outcome: success
related: [.ai/specs/2026-10-15-production-deployment.md]
---

# E11 Phase 1: app ready for production (health, PUBLIC_BASE_URL guard, seeder guard, smoke --production)

## Zadanie
Implement Phase 1 (R3, R4, R5, R6, R7) of the approved spec. Owner delegated open decisions on 2026-11-04: Q6 confirmed (fail-closed PUBLIC_BASE_URL in production), all other spec defaults stand. Phases 2 and 3 (Dockerfile, CI image job, runbook) are out of scope and stay open (spec status `in-progress`).

## Przebieg
- Przejęcie po agencie przerwanym limitem wydatków: zostawił niezacommitowane `env.ts` (R4) i `env.test.ts`. Ocena: reguły R4 poprawne i kompletne (IP v4/v6, host jednoczłonowy, sufiksy lokalne, `ALLOW_LOCAL_BASE_URL`); błąd w teście (`base` poza zakresem, jedna asercja) i brak deklaracji `URL` w `core/src/globals.d.ts` (typecheck). Zachowane, poprawione. WIP commit, `git merge origin/main` (jeden konflikt w `env.test.ts` z `metricsToken`: rozwiązany, obie strony).
- R4: `startup.ts` ostrzega przy `ALLOW_LOCAL_BASE_URL`, braku adresu i `AUTH_COOKIE_SECURE=false` w produkcji; test startu na świeżym grafie modułów z podmienionym `process.exit` (`gaps.test.ts`). `ALLOW_LOCAL_BASE_URL=true` dopisane w e2e `global-setup.ts` i `.ai/scripts/test-env-up.sh`; `boot-check.mjs` ma nowe przypadki (brak adresu, `http://`, `https://localhost`, adres lokalny mimo `AUTH_COOKIE_SECURE=false`, ostrzeżenie przy wyjątku).
- R3: port `SystemHealth` (`core/ports/runtime.ts`), `MemorySystemHealth`, `PgSystemHealth` (limit 2 s), `server/health.ts`, trasa `api/v1/health` przez nowe `handleUnscoped` (bez zakresu żądania; log i metryki jak inne trasy), `db_health_check_duration_seconds` ma emitera. Odrzucona obietnica kontenera i `getOrm()` nie jest buforowana.
- R5: `seeders/seed-guard.ts` (przed pierwszym zapisem): produkcja bez `ALLOW_DEMO_DATA=true` odmawia; produkcja z nim odmawia na bazie z restauracją o innym slugu niż demo.
- R6/R7: `scripts/lib/synthetic-fetch.mjs` (nagłówek ustawiany ostatni; tryb `--production` odmawia metody ≠ GET przed wysłaniem), `smoke.mjs --production`.
- Odkrycie: `MikroORM.init` nie łączy się z bazą, a po `close()` łączy się sam (lekcja). Test „baza zniknęła i wróciła”: przekaźnik TCP w `@wine-match/testkit`.
- Rozbieżność od speca zapisana w „Ryzyka i otwarte pytania”: drugi warunek R5 tylko w produkcji (pytanie do właściciela).

## Weryfikacja
Środowisko: Node 22.23.3, PostgreSQL 16 na porcie 50304 (własny serwer), `TEST_DATABASE_URL=postgres://wmadmin@127.0.0.1:50304/postgres`.
- `npm run lint`: czysto. `npm run typecheck`: czysto (wszystkie pakiety).
- `npm test`: core 603/603, db 73/73, ui 62/62, app 392/392, testkit 146/146 (przed ostatnią poprawką testu `health-postgres`, który po niej przeszedł osobno: 8/8).
- `npm run test:db`: 125/125 (w tym `seed-guard.integration.test.ts` 7, `system-health.integration.test.ts` 4).
- `npm run build`: exit 0. `npm run boot:check`: wszystkie przypadki ok (w tym nowe R4 i health 503 bez sekretu).
- `npm run test:e2e`: 6 plików przechodzi (w tym nowe `health.e2e.test.ts`, 3 testy: 200, 503 i powrót bez restartu, `smoke --production` bez zdarzeń gościa); 11 plików wymagających przeglądarki padło wyłącznie na `spawn agent-browser ENOENT` (agent-browser nie jest zainstalowany; żadnej asercji nie nieudało się samej).
- `npm run smoke` na `next start`: `DATA_SOURCE=memory` (`ALLOW_DEMO_DATA`, `ALLOW_LOCAL_BASE_URL`) exit 0; `DATA_SOURCE=postgres` (świeża baza, migracje + seed) exit 0, 265 sprawdzeń ok. `npm run smoke -- --production http://127.0.0.1:<port> halka` na obu: „All production smoke checks passed”.
- `npm run check:context`: 0 błędów (9 ostrzeżeń o rozmiarze cudzych specyfikacji). `npm run check:qa`: 68 scenariuszy. `npm run secrets:scan`: bez nowych znalezisk (po zbudowaniu adresu z części).
- `npm run verify:regression -- packages/core/tests/env.test.ts packages/app/tests/unit/gaps.test.ts packages/db/tests/seed-guard.integration.test.ts packages/testkit/tests/smoke-script.test.ts packages/db/tests/system-health.integration.test.ts packages/app/tests/unit/health-postgres.test.ts`: BEFORE FAIL, AFTER PASS, verdict OK. Uczciwie: czerwone przed zmianą są odmowy R4 (22 z 34 w `env.test.ts`), start-up i health (10 w pozostałych testach app) oraz 4 odmowy seeda, w tym `npm run db:seed` z `NODE_ENV=production` kończące się kodem 0 na kodzie sprzed zmiany; `smoke-script.test.ts` i `system-health.*` są czerwone tylko dlatego, że brakuje modułu.
- Nie zweryfikowane: `schema:check` (schemat bazy nie zmieniony), przeglądarkowe testy e2e, job CI `image` i obraz (Faza 2), `npm run audit:gate` (bez zmiany zależności).

## Wynik
Faza 1 gotowa: AC4 i AC5 spełnione i odhaczone; AC2, AC7, AC8 mają kod i testy, ale ich pełne brzmienie wymaga obrazu i jobu `image` (Faza 2); AC1, AC3, AC6 i R1, R2, R8, R9 czekają na Fazy 2-3. Spec zostaje `in-progress`. Dług i pytania: odmowa seeda poza produkcją (pytanie do właściciela), `AGENTS.md` §1.1 ma już poprawną wersję `next`, `GET /api/v1/health` liczy 503 do wskaźnika 5xx (zamierzone, w `OPERATIONS.md`).

## Lekcje
- [`2026-11-05-mikroorm-init-does-not-connect`](../lessons/2026-11-05-mikroorm-init-does-not-connect.md)
- [`2026-11-05-fail-closed-breaks-local-production-starts`](../lessons/2026-11-05-fail-closed-breaks-local-production-starts.md)
