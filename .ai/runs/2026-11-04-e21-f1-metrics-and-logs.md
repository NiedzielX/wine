---
started: 2026-11-04 12:00
ended: 2026-11-05
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-platform-quality-and-compliance.md (on main)
outcome: success (F1 AC1-AC3 met; spec stays in-progress: F2-F7 open)
related: []
---

# E21 F1: metryki i strukturalne logowanie żądań

## Zadanie
Faza F1 specyfikacji E21 (risk: medium): R1 (endpoint metryk), R2 (wiersz logu na żądanie API w `guarded()`), R3 (`onRequestError` i handlery procesu), R4 (`docs/OPERATIONS.md`), kryteria AC1, AC2, AC3. Bez nowych zależności. Specyfikacji nie edytuję (status ustawiony na in-progress).

## Przebieg
- Gałąź `feat/e21-f1-metrics-and-logs` z `origin/main` (16fbba5). Przeczytane: AGENTS.md, packages/app/AGENTS.md, `.ai/lessons.md`, SDLC, spec E21 i plan.
- Weryfikacje „do zweryfikowania” ze specyfikacji:
  - `onRequestError`: zainstalowany Next to 16.3.8 (AGENTS.md mówi 16.3.7). Sygnatura z `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` i `dist/server/instrumentation/types.d.ts`: `(error: unknown, request: {path, method, headers}, context: {routerKind, routePath, routeType, renderSource, revalidateReason, renderType})`. `request.path` zawiera query string, a `headers` zawierają cookie: hook nie loguje nagłówków i obcina query.
  - Redakcja: `core/src/logging/redact.ts` maskuje a connection string with a password w komunikacie, stosie i `cause` (potwierdza test w tym PR).
  - Next (`router-server.js`) sam rejestruje `uncaughtException` i tylko loguje: proces nie ginie. Nasze handlery także tylko logują i liczą (bez `process.exit`), żeby nie zmienić zachowania.

## Kontynuacja (2026-11-05)
Przejęcie po przerwanym przebiegu: commit WIP, merge origin/main bez konfliktów. Poprawiono testy (`route` w `handle`/`handlePublic` w `server.test.ts`, `NEXT_RUNTIME` w teście `onRequestError`, uproszczony test 500), dodano e2e `observability.e2e.test.ts` (aplikacja z `METRICS_TOKEN` testowym), scenariusze `.ai/qa/ops/`, `docs/OPERATIONS.md`, wpisy w API_SPECIFICATION, README, commands.md, lekcję.

## Weryfikacja
- `npm run lint`, `npm run typecheck`: czyste.
- `npm test`: core 582, db 70, ui 62, app 368 zielone; testkit pada na `agent-guardrails.test.ts` (znany, niezwiązany, PR #115).
- `npm run test:db` (PostgreSQL 16 na 50302): 114 zielone. `npm run build`: OK. `npm run boot:check`: All boot checks passed.
- e2e (`observability`, `unknown-ids`, `tenant-isolation`, plain fetch): 5 zielone.
- `check:context` 0 błędów (ostrzeżenia o rozmiarze specyfikacji nie moje), `check:qa` 65 scenariuszy OK, `secrets:scan` OK.
- `verify:regression -- packages/app/tests/unit/metrics.test.ts`: czerwony przed (brak modułów metryk: czerwień z braku importu, nie z semantyki), zielony po.
- Niewykonane: `npm run smoke` (spec go dla F1 nie wymaga), `next start` w trybie memory + curl ręcznie, testy z przeglądarką.

## Dług i uwagi
- `observeDbHealthCheck` i `rate_limit_denied_total` nie mają jeszcze wywołań: czekają na health (E11) i F3.
- Wydanie kodu: wynik `rate_limited` w `CodeIssueResult` dla F3.

## Poprawki po review niezależnym (2026-11-05)
Zakres: `instrumented()` w `api-auth.ts` obejmuje każdą ścieżkę (wczesne 403 CSRF, 401, błąd `createRequestScope`/`dispose`): jeden wiersz `api request` i jedna próbka `http_requests_total`; błąd nieoczekiwany to ten sam wiersz na poziomie `error` z `err` (bez drugiego wiersza `api request failed`). `/api/v1/metrics` bez `handlePublic`: bez zakresu, bez bazy, bez logu i licznika (scrape nie zaniża wskaźnika 5xx). Etykieta `limit` zastąpiona przez `declined` (serwis nie odróżnia limitu od odrzuconego wejścia), `timedOut` opisany. Komentarz w `request-errors.ts`: po `uncaughtException` stan procesu jest nieokreślony (runbook restartuje repliki); **nasz listener `unhandledRejection` zmienia domyślne zachowanie Node (crash przy nieobsłużonym odrzuceniu) na log-i-kontynuuj: zamierzone.**
- Brak emiterów: `db_health_check_duration_seconds` (czeka na health E11) i `rate_limit_denied_total` (czeka na F3) nie mają jeszcze żadnych wywołań; seria jest pusta.
- RED na kodzie sprzed poprawek (ac11914, `git stash` plików src): 7 testów padło (500 jednym wierszem, 403 CSRF, 500 w gałęzi błędu, awaria zakresu, awaria dispose, metryki przy padającym `createRequestScope`, etykiety wyniku kodu). Testy handlerów procesu i etykiet były już zielone: to uzupełnienie pokrycia (finding 3), nie dowód błędu.
