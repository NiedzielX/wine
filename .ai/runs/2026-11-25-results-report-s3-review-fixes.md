---
started: 2026-11-25 09:00
ended: 2026-11-25 11:00
agent: Claude Code
spec: .ai/specs/2026-11-18-owner-proof-report.md
outcome: success
related: [.ai/runs/2026-11-22-results-report-s2-s4.md, .ai/specs/2026-11-18-owner-proof-report.md]
---

# Raport wyników, krok 3: poprawki po przeglądzie PR #191 (W2, D1, D3, D4)

## Zadanie
Poprawki punktów W2, D1, D3, D4 z przeglądu niezależnego recenzenta na gałęzi `feat/results-report-s3-fixes` (z `origin/feat/results-report-s3-rebased`). Migracja `proof_launch_day` nie jest zastosowana na współdzielonej bazie, więc wolno ją poprawić. Pominięte: W3 (kod 409, decyzja w kroku 4), W4 (test picks-panel, osobno), D2, D5, D6, D7. Bez push i PR.

## Przebieg
- W2: przypadek kontraktu „two existing restaurants keep separate logs” w `proof-launch-contract.ts` (pamięć i PostgreSQL). Restauracja B (`SECOND_RESTAURANT`) dopisuje pierwszy wpis i dostaje `seq: 1`, gdy log A ma już wpisy; historia i `current` każdej strony bez wpisów drugiej, całe ładunki porównane; kolejny wpis A ma `seq` po własnych; wpis B z `expectedCurrent` równym id wpisu A daje `VersionConflictError`. `repositoryContract` dostał `secondRestaurant()` w wyniku `setup` (pamięć: `addSecondRestaurant`, PostgreSQL: `seedSecondRestaurant`; teardown PG usuwa drugą restaurację, bo późniejsze testy liczą użytkowników demo).
- D1: `CHECK` powodu na `char_length(btrim(reason)) > 0` w encji i w migracji. Reguły w `launch-rules.ts` już przycinają powód (`normalizeReason`: `trim`), więc powód z samych spacji daje `reason_required` także w pamięci (pokryte przypadkiem kontraktu z `'   '`). `btrim` obcina tylko spacje (JS `trim` także tabulatory i nowe linie): baza jest tu minimalnie luźniejsza niż serwis, serwis jest pierwszą linią. `DATA_MODEL.md` zaktualizowany.
- D4: `set_by_role` jako `p.enum(['owner','manager','sommelier','waiter'])` jak `membership.role` (kolumna `text` plus `proof_launch_day_set_by_role_check`). Typ `setByRole` w porcie `proof.ts` zawężony do `Role` (wymusił to typ encji); test współbieżności dostał `as const`.
- Migracja: generator (`migration:create` na bazie z poprzednią wersją migracji) zrobił osobną migrację ze zmianą ograniczeń i typu kolumny; wycofana (plik skasowany), zmiana naniesiona ręcznie w `Migration20261122161134_proof_launch_day` (`set_by_role text`, `btrim`, nowy check). Snapshot `winematch` pochodzi z generatora, cztery pozostałe (`_test`, `_e2e`, `_db_test`, `_db_recode_test`) dostały ten sam obiekt tabeli.
- D3: test ograniczeń sprawdza kod błędu PostgreSQL i nazwę ograniczenia: `23514` + `proof_launch_day_reason_check` (null, pusty, same spacje), `23505` + `proof_launch_day_restaurant_id_seq_unique`, `23514` + `proof_launch_day_seq_check`, `23514` + `proof_launch_day_set_by_role_check` (`''`, `admin`, `Owner`), `22001` (powód 201 znaków); przypadek akceptujący cztery role.
- Środowisko: system PostgreSQL 16 przez `runuser`, port 54461, katalog `/var/tmp/wm-s3fix`; dowiązania `@mikro-orm/*` w korzeniu worktree; cache Vite wyczyszczony przed `test:db`.

## Weryfikacja
- Dowód mutacyjny W2: z `newest` w `PgProofLaunchRepository.append` usunięty filtr `restaurant: restaurantId`; `vitest run … tests/repositories.integration.test.ts -t "repository contract: postgres"`: 1 failed | 41 passed, czerwony tylko przypadek „two existing restaurants…” (`VersionConflictError`: `newest` zwrócił wpis drugiej restauracji). Po przywróceniu pliku: 42 passed.
- `npm run typecheck`: czysto. `npm run lint`: czysto.
- `npm test`: core 947, db 126, 62, app 652, 675 (+1 pominięty), wszystkie zielone.
- `npm run test:db` (PostgreSQL 16): 9 plików, 259 testów zielone (w tym test migracji up/down/up i test ograniczeń tabeli).
- `schema:check` (`migration:up` na świeżej bazie, potem `migration:check`) dla `winematch`, `winematch_test`, `winematch_e2e`, `winematch_db_test`, `winematch_db_recode_test`: „No changes required, schema is up-to-date”.
- `npm run build`: pierwsze uruchomienie `SecurityFatalError` (tekst o podatności Next.js, nie wykonywany), drugie exit 0.
- `check:context` (0 błędów), `check:qa` (151 scenariuszy), `secrets:scan` (bez nowych trafień): zielone.
