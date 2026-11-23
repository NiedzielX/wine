---
started: 2026-11-24 09:00
ended:
agent: Claude Code
spec: .ai/specs/2026-11-18-owner-proof-report.md
outcome: partial
related: [.ai/specs/2026-11-18-owner-proof-report.md, .ai/runs/2026-11-22-results-report-s2-s4.md, .ai/runs/2026-11-19-results-report-core.md]
---

# Raport wyników, kroki 5–7: trasy API, ekran A33, wersja do druku A34

## Zadanie
Kroki 5–7 z „Kolejności kroków” specyfikacji `2026-11-18-owner-proof-report.md` (status `in-progress`) jako trzy gałęzie ułożone jedna na drugiej, każda gotowa na osobny PR: (5) `feat/results-report-s5-routes`, (6) `feat/results-report-s6-screen-a33`, (7) `feat/results-report-s7-print-a34`. Pierwsza z `origin/feat/results-report-s4-rebased` (kroki 3–4 nie są jeszcze na `main`). „Treść handlowa” nie jest implementowana. Bez push i PR. Pliki pod CODEOWNERS (`AGENTS.md`, `packages/*/AGENTS.md`, `.github/`, `scripts/`) bez zmian.

## Przebieg
- Przeczytane: lekcje (indeks, `postgres-without-docker`, `2026-11-17-*`, `e2e-without-javascript`, `access-boundary-three-checks`, `mikro-orm-cli-in-nested-worktree`), spec w całości, skille `wine-match-new-api-route` i `wine-match-access-boundary-test`, `ProofReportService` i walidatory z kroku 4, wzorce tras i testu granicy (`picks`).
- Środowisko: `npm ci` (npm 11.6.2), dowiązania `@mikro-orm/*` w korzeniu worktree, PostgreSQL 16 systemowy przez `runuser`, port 54421, katalog `/var/tmp/wm-s5s7`.
- Numeracja (sprawdzona na `origin/main`): `T-41` zajęte na `main` (edycja widoczności dania), T-42 rezerwuje katalog C3, więc ten krok używa **T-43**; QA security: `security-034` (granica API) i `security-035` (formularz), zajęte 033, 036, 037, 038; `kpi-009…014` wolne.
- Gałąź (5) `feat/results-report-s5-routes` (z `origin/feat/results-report-s4-rebased`): trasy `GET …/proof-report?window=` (`proof.view`, `ETag` = id bieżącego wpisu albo `"none"`) i `POST …/proof-launch` (`proof.manage`, 201), obie przez `handle()` z literalnym `route`, bez `try/catch`; ciało przez `parseBody(req, launchDayRequestSchema)` (nowy schemat `strictObject` w `core/validators/proof/`: ten sam co `launchDaySchema`, ale z opcjonalnym `expectedCurrent`, bo warunek może iść w `If-Match`). Warunek wstępny: `If-Match: "<id>"` / `"none"` (nowy `ifMatchEntry` w `api-auth.ts`) albo `expectedCurrent` w ciele; brak obu 428, zły nagłówek 400, oba i różne 422, nieaktualny 409 (z portu). Odpowiedź budują `server/proof-json.ts` (agregaty + rola autora wpisu; bez membership i identyfikatorów POS). `authorizeAction` i `Ctx` akcji zwracają teraz także `membership` (addytywnie; potrzebne w kroku 6 do roli autora wpisu).
- Test granicy `proof-boundary.e2e.test.ts` (T-43, QA `security-034`) wg skilla: seed linii POS z rozpoznawalnymi `check_id` i kodem w obu lokalach, kontrola pozytywna obu stron, odmowy (obcy slug, sommelier obu lokali, pole spoza schematu, data z przyszłości i zły format, drugi wpis bez powodu, brak/zły/nieaktualny warunek, brak CSRF i sesji, złe okna), stan po próbie jako pełne ładunki raportów (okna 1 i 2 obu lokali) i skrót wszystkich tabel. Profile fuzz dla obu ttras w `api-robustness.test.ts`; testy tras w pamięci `proof-routes.test.ts`.
- Dowód mutacyjny (AC11): z `PgProofLaunchRepository.read` usunięty filtr `restaurant` (`em.find(ProofLaunchDayEntity, {}, …)`) i przebudowana aplikacja: test czerwony (`expected 422 to be 201` przy kontroli pozytywnej Bistro: widzi wpis Halki jako bieżący, więc drugi wpis wymaga powodu), po przywróceniu filtra i przebudowie zielony.
- Odstępstwa gałąź (5): (a) `set_by_membership_id` zostaje `null` — `Principal.memberships` nie niesie id członkostwa, a spec dopuszcza `null`; rola jest zapisana (do dopisania, gdy sesja będzie nieść id); (b) `If-Match` jest dodatkiem do `expectedCurrent` z specyfikacji R11 (polecenie zadania), ciało bez `expectedCurrent` jest legalne tylko z nagłówkiem; (c) wiersz w `threat-model.md` to T-43 (T-41 zajęte na `main`, T-42 rezerwuje C3), więc w tej gałęzi numer T-41/T-42 pozostaje w tabeli pusty do czasu scalenia tamtych PR-ów.
- Do dopisania w `scripts/smoke.mjs` (pod CODEOWNERS, nie zmieniałem): po zalogowaniu `tomasz` (manager) `GET /api/v1/restaurants/halka/proof-report` → 200 z `report.reasons` zawierającym `no_launch_day` lub okno z danymi; to samo `marta` (sommelier) → 403; `GET /api/v1/restaurants/halka/proof-report?window=0` → 422; `POST …/proof-launch` bez nagłówka CSRF → 403.

## Weryfikacja
### Gałąź (5) `feat/results-report-s5-routes`
`npm run lint` 0; `npm run typecheck` 0; `npm test` zielone (core 951, db 126 bez bazy, app 675 + 1 pominięty, testkit 62, ui 16); `npm run build` 0 (pierwsze uruchomienie po zmianie czasem `SecurityFatalError`, ponowione bez `next upgrade`); `check:context` (0 błędów, 13 ostrzeżeń w cudzych plikach), `check:qa`, `check:pages`, `check:routes`, `check:boundaries`, `check:design`, `secrets:scan` zielone; `npm run test:db` na PostgreSQL 16 (system, port 54421, cache Vite wyczyszczony) 256 testów zielone; e2e HTTP na PostgreSQL: `proof-boundary`, `access-boundaries*`, `tenant-isolation` 25 testów zielone (agent-browser nie jest dostępny w środowisku, pliki e2e z przeglądarką nie były uruchamiane); smoke w `DATA_SOURCE=memory` (`ALLOW_LOCAL_BASE_URL=true`): "All smoke checks passed". Bez migracji w tej gałęzi.

## Wynik
(uzupełniane)

## Lekcje
(uzupełniane)
