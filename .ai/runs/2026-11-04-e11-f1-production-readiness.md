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
- `npm run test:e2e`: 6 plików przechodzi (w tym nowe `health.e2e.test.ts`, 3 testy: 200, 503 i powrót bez restartu, `smoke --production` bez zdarzeń gościa); 11 plików wymagających przeglądarki padło wyłącznie na `spawn agent-browser ENOENT` (agent-browser nie jest zainstalowany; żadna asercja nie padła).
- `npm run smoke` na `next start`: `DATA_SOURCE=memory` (`ALLOW_DEMO_DATA`, `ALLOW_LOCAL_BASE_URL`) exit 0; `DATA_SOURCE=postgres` (świeża baza, migracje + seed) exit 0, 265 sprawdzeń ok. `npm run smoke -- --production http://127.0.0.1:<port> halka` na obu: „All production smoke checks passed”.
- `npm run check:context`: 0 błędów (9 ostrzeżeń o rozmiarze cudzych specyfikacji). `npm run check:qa`: 68 scenariuszy. `npm run secrets:scan`: bez nowych znalezisk (po zbudowaniu adresu z części).
- `npm run verify:regression -- packages/core/tests/env.test.ts packages/app/tests/unit/gaps.test.ts packages/db/tests/seed-guard.integration.test.ts packages/testkit/tests/smoke-script.test.ts packages/db/tests/system-health.integration.test.ts packages/app/tests/unit/health-postgres.test.ts`: BEFORE FAIL, AFTER PASS, verdict OK. Uczciwie: czerwone przed zmianą są odmowy R4 (22 z 34 w `env.test.ts`), start-up i health (10 w pozostałych testach app) oraz 4 odmowy seeda, w tym `npm run db:seed` z `NODE_ENV=production` kończące się kodem 0 na kodzie sprzed zmiany; `smoke-script.test.ts` i `system-health.*` są czerwone tylko dlatego, że brakuje modułu.
- Nie zweryfikowane: `schema:check` (schemat bazy nie zmieniony), przeglądarkowe testy e2e, job CI `image` i obraz (Faza 2), `npm run audit:gate` (bez zmiany zależności).

## Wynik
Faza 1 gotowa: AC4 i AC5 spełnione i odhaczone; AC2, AC7, AC8 mają kod i testy, ale ich pełne brzmienie wymaga obrazu i jobu `image` (Faza 2); AC1, AC3, AC6 i R1, R2, R8, R9 czekają na Fazy 2-3. Spec zostaje `in-progress`. Dług i pytania: odmowa seeda poza produkcją (pytanie do właściciela), `GET /api/v1/health` liczy 503 do wskaźnika 5xx (zamierzone, w `OPERATIONS.md`).

## Lekcje
- [`2026-11-05-mikroorm-init-does-not-connect`](../lessons/2026-11-05-mikroorm-init-does-not-connect.md)
- [`2026-11-05-fail-closed-breaks-local-production-starts`](../lessons/2026-11-05-fail-closed-breaks-local-production-starts.md)

## Review PR #120 (2026-11-05): zmiany po review niezależnej sesji
Decyzje właściciela (delegat, 2026-11-05): seeder chroni każde niepuste `NODE_ENV` inne niż `development` i `test`, przy nieustawionym ostrzega i działa; drugi warunek R5 tylko w środowiskach chronionych (lokalne `restaurant:create` + `db:seed` działa).
- MAJOR 1: potwierdzone czerwone (`HTTPS://...` zapisywało `http://localhost:3000`). Zapisywany adres pochodzi teraz wyłącznie z sparsowanego `URL` (protokół, host bez końcowej kropki, port, ścieżka bez końcowego `/`); `@`, backslash, białe znaki i znaki sterujące odrzucane w każdym środowisku (to obejmuje `https://wine.example.com\@localhost` i userinfo, MINOR 3). Nowe sufiksy `.invalid`, `.localdomain`, `.intranet`, `.corp`; `.test` zostaje, bo spec (AC3) i e2e używają `wine.example.test`.
- MAJOR 2: czerwone (`Production`, `prod`, `staging`, brak ostrzeżenia przy nieustawionym); zielone testy z prawdziwym `npm run db:seed`.
- MINOR 4: jedno współdzielone sprawdzenie i bufor 2 s (`server/health.ts`, wstrzykiwany zegar); test: 8 równoległych żądań, jedno zapytanie, jeden wiersz błędu, powrót widoczny po wygaśnięciu bufora. Statement timeout dla `select 1` nie ustawiony (sterownik daje go tylko na sesję lub w transakcji); ogranicza 2 s w `PgSystemHealth`. E2e 200 -> 503 -> 200 czeka 2,3 s po każdej zmianie.
- MINOR 5: `dataSource` usunięte z odpowiedzi (jest w logu przy awarii). MINOR 6: `gaps.test.ts` przywraca klucze zamiast podmieniać `process.env`; `health-postgres.test.ts` przywraca `DATA_SOURCE`/`DATABASE_URL`; `smoke.mjs` anuluje ciała odpowiedzi sond nagłówków i waliduje slug (exit 2, zero żądań). NITS: README poprawione, notatka o Compose bez `ALLOW_LOCAL_BASE_URL` / `AUTH_COOKIE_SECURE=false` w specyfikacji (Faza 2).
- Czerwone przed poprawką (kod z `1fcddac`, nowe testy): env 15 z 53, seed-guard 9 z 18, health 9 z 11, smoke-script 6 z 19.
- Bramka po poprawkach: lint i typecheck czyste; `npm test` core 622, db 73, ui 62, app 395, testkit 152; `test:db` 136; `build` ok; `boot:check` ok; e2e: 6 plików ok (w tym `health`), 11 tylko `agent-browser ENOENT`; `smoke` i `smoke --production` na `memory` i `postgres` ok; `check:context`, `check:qa`, `secrets:scan` czyste.
