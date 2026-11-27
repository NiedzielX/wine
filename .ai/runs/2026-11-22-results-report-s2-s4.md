---
started: 2026-11-22 09:00
ended: 2026-11-22 18:00
agent: Claude Code
spec: .ai/specs/2026-11-18-owner-proof-report.md
outcome: success
related: [.ai/specs/2026-11-18-owner-proof-report.md, .ai/runs/2026-11-19-results-report-core.md]
---

# Raport wyników, kroki 2–4: port `checkTotalsMarked`, tabela `proof_launch_day`, `ProofReportService`

## Zadanie
Kroki 2–4 z „Kolejności kroków” specyfikacji `2026-11-18-owner-proof-report.md` (status `in-progress`, krok 1 na `main`, #184) jako trzy gałęzie ułożone jedna na drugiej, każda gotowa na osobny PR: (1) `feat/results-report-s2-port`, (2) `feat/results-report-s3-launch-day`, (3) `feat/results-report-s4-service`. Bez tras API, ekranów i słowników (kroki 5–7). Bez push i PR.

## Przebieg
- Przeczytane: lekcje (indeks, `postgres-without-docker`, `2026-11-17-*`, `concurrency-tests-and-migration-roundtrip`, `mikro-orm-cli-in-nested-worktree`), spec w całości, `ports/sales.ts`, `sales-contract.ts`, repozytoria sprzedaży (pamięć, PostgreSQL), `proof-report.ts`.
- Gałąź (1) z `origin/main` (`git fetch origin main:refs/remotes/origin/main`). Specyfikacja miała już `status: in-progress`, więc nie zmieniałem jej statusu.

- Gałąź (1): `SalesRepository.checkTotalsMarked(restaurantId, period)` w porcie; `MarkedCheckTotals` przeniesione z `proof-report.ts` do `ports/sales.ts` (moduł raportu importuje je z portu, test też). `hasCode` = aktywna linia z kodem i `quantity > 0` (rekomendacja przeglądu, pkt 18: linia zwrotu nie oznacza rachunku). Pamięć: oznaczenie z aktywnych linii; PostgreSQL: `bool_or(recommendation_code is not null and quantity > 0)` w tym samym `GROUP BY`; `checkTotals` korzysta z tego samego zapytania (jedno źródło sum). Przypadek kontraktu (AC3) w `sales-contract.ts` biegnie na pamięci i PostgreSQL.
- Środowisko: PostgreSQL 16 systemowy przez `runuser`, port 54411, katalog `/var/tmp/wm-s2s4`; dowiązania `@mikro-orm/*` w korzeniu worktree (lekcja `mikro-orm-cli-in-nested-worktree`).
- Gałąź (2) z gałęzi (1): port `ProofLaunchRepository` (`current`, `history`, `append`; `ports/proof.ts`), czyste reguły `services/proof/launch-rules.ts` (`checkLaunchAppend`: najpierw `expectedCurrent` -> `VersionConflictError`, potem `reason_required` od wpisu 2, `reason_too_long`; wspólne dla pamięci i PostgreSQL). Tabela `proof_launch_day` (encja `defineEntity`, unikat `(restaurant_id, seq)`, `CHECK` powodu i `seq >= 1`), migracja z generatora (`mikro-orm migration:create --name=proof_launch_day`, `up` i `down`), zastosowana na `winematch`, `winematch_test`, `winematch_e2e`; cztery snapshoty (pięć plików z `winematch_db_recode_test`) odświeżone. `append` pod `pg_advisory_xact_lock(hashtext('proof_launch:' || id))` (`lockProofLaunch` w `locks.ts`), idempotencja przez `expectedCurrent` (powtórzenie udanego zapisu jest nieaktualne: 409). Kontrakt `proof-launch-contract.ts` (pamięć i PostgreSQL), AC19 w `concurrency.integration.test.ts` (dwie sceny po 10 rund), test ograniczeń tabeli, test kształtu portu (brak update/delete). Dowód mutacji: bez wywołania `lockProofLaunch` oba testy współbieżności są czerwone, z blokadą zielone. Up/down/up: istniejący `migrations-roundtrip` cofa i stosuje każdą migrację, w tym nową (pusta baza i z danymi). Dopisano `proof_launch_day` do `TABLES` w `app/tests/e2e/boundaries.ts` i do `truncate` w `tests/support/pg.ts`. Docs: `DATA_MODEL.md`, `BACKWARD_COMPATIBILITY.md`.
- Odstępstwa gałąź (2): wiersz T-… w `threat-model.md` i scenariusze QA zostają na krok 5 (spec: „Kroki” pkt 5); AC5 w części e2e na krok 6.
- Gałąź (3) z gałęzi (2): `ProofReportService` (`getReport(slug, window?)`, `setLaunchDay(slug, input, actor)`; zależności `clock`, `idGenerator` i cztery repozytoria jak w specyfikacji), uprawnienia `proof.view` i `proof.manage` w `BUSINESS` (owner, manager), walidatory `strictObject` `launch-day.schema.ts` i `window.schema.ts`, rejestracja `proofReportService` w `container.ts`, `USER_ROLES.md`. Serwis czyta sumy rachunków jednym `checkTotalsMarked` dla `[baza, koniec okna]`, kody z tych samych metod portu co `RecommendationCodeService.summary`; bez zapisu wyniku. Domyślne okno = najnowsze zakończone (1..12). Decyzje: (a) serwis jak `PicksService` nie sprawdza `proof.view` (robią to wejścia), ale `setLaunchDay` sprawdza `proof.manage` jeszcze raz po roli aktora; (b) `invalid_window` także dla okna, które jeszcze się nie zaczęło (spec R11), a `invalid_launch_day` także dla dnia po dzisiejszym dniu usługi; (c) widok zwraca `launch.history` z flagą `afterWindow1` (zapis po końcu okna 1 zastąpionego dnia) i `changes`; (d) `window` przyjmuje tekst z adresu tylko jako cyfry (`1e9`, `0x2`, `+3`, `2.0` odrzucone).
- Wolne numery: `T-41` w `threat-model.md` (ostatni `T-40`); QA `kpi-009…014`, `security-034/035` wolne (zajęte `security-036`, `admin-026/027`); wiersz T-41 i scenariusze zostają na krok 5/6 (trasy i ekrany), bo dotyczą drzwi, których te kroki nie otwierają.

## Weryfikacja
### Gałąź (1) `feat/results-report-s2-port`
`npm run lint` 0; `npm run typecheck` 0; `npm test` zielone (core 923, app 675 + 1 pominięty, db 126 bez bazy, pozostałe pakiety); `npm run build` 0 (pierwsze uruchomienie: znane `SecurityFatalError`, ponowione bez `next upgrade`); `check:context` 0 błędów (13 ostrzeżeń w cudzych plikach), `check:qa`, `check:boundaries`, `check:routes`, `secrets:scan` zielone; `npm run test:db` na PostgreSQL 243 testy zielone (w tym nowy przypadek kontraktu `checkTotalsMarked`). Bez migracji, `schema:check` nie dotyczy.
### Gałąź (2) `feat/results-report-s3-launch-day`
`npm run lint` 0; `typecheck` 0; `npm test` zielone (core 930, app 675 + 1 pominięty, db 126 bez bazy); `npm run build` 0 (pierwsze uruchomienie: znane `SecurityFatalError`, ponowione bez `next upgrade`); `check:context`, `check:qa`, `check:boundaries`, `check:routes`, `secrets:scan` zielone; `npm run test:db` na PostgreSQL 254 testy zielone (w tym kontrakt, współbieżność, ograniczenia tabeli, round trip migracji); `schema:check` na `winematch`: "No changes required".
### Gałąź (3) `feat/results-report-s4-service`
`npm run lint` 0; `typecheck` 0; `npm test` zielone (core 943, app 675 + 1 pominięty, db 126 bez bazy); `npm run build` 0 (pierwsze uruchomienie: znane `SecurityFatalError`, ponowione bez `next upgrade`); `check:context`, `check:qa`, `check:boundaries`, `check:routes`, `secrets:scan` zielone; `npm run test:db` na PostgreSQL 256 testów zielone (nowy `proof-report-service.integration.test.ts`: ten sam raport z pamięci i PostgreSQL, kody równe `RecommendationCodeService.summary`, odmowa roli). Bez migracji w tej gałęzi (`schema:check` z gałęzi (2) bez zmian).

## Wynik
Trzy gałęzie gotowe lokalnie (bez push i PR), ułożone: `feat/results-report-s2-port` -> `feat/results-report-s3-launch-day` -> `feat/results-report-s4-service`. Spec zostaje `in-progress` (kroki 5–7 przed nami; „Realizacja” uzupełni ostatni krok). Do zrobienia: trasy API z `handle()` i testem granicy (AC11–AC13, wiersz T-41), A33 i słowniki, QA/e2e, docs, A34.
(uzupełniane)

## Lekcje
brak (nowe tylko potwierdzenia istniejących: `new-migration-stale-vite-glob`, `next-build-security-nudge-alternates`, `mikro-orm-cli-in-nested-worktree`, `concurrency-tests-and-migration-roundtrip`)
