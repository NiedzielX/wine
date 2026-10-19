---
date: 2026-10-16
updated: 2026-10-19
area: tooling
status: active
source: .ai/runs/2026-10-16-e10-f1-opportunities-core.md
promoted:
---

# Bez Dockera uruchom PostgreSQL z `embedded-postgres` poza repozytorium; po migracji odśwież wszystkie cztery snapshoty

## Kontekst
Na maszynie agenta nie ma Dockera ani `psql`, więc `npm run test:db` (testcontainers), `db:migration:create` i `schema:check` wcześniej pomijano („pokryje CI”). Przy nowej tabeli migracja musi powstać z generatora i przejść `schema:check` w tym samym przebiegu (AGENTS §1.3).

## Przyczyna
`testcontainers` wymaga Dockera; `TEST_DATABASE_URL` wymaga działającego serwera. Migrator MikroORM zapisuje snapshot schematu per nazwa bazy (`.snapshot-<db>.json` w `packages/db/src/migrations`): `winematch` (CLI), `winematch_db_test` (`test:db`), `winematch_test`, `winematch_e2e`.

## Reguła
- Zainstaluj `embedded-postgres` (np. `17.10.0-beta.17`, binaria PostgreSQL z npm) w katalogu tymczasowym **poza repozytorium**, uruchom go skryptem Node w tle (port np. 54329) i podawaj `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres` do `npm run test:db`, a `DATABASE_URL=…/winematch` do `db:migrate`, `db:migration:create` i `schema:check`. Bazy zakładaj klientem `pg` z `node_modules` projektu.
- `npm run db:migration:create -- --name x` nie przekazuje nazwy; wołaj `npx mikro-orm migration:create --name=x` w `packages/db`.
- Po nowej migracji zastosuj ją też na bazach `winematch_test` i `winematch_e2e` (`db:migrate` z ich `DATABASE_URL`) i uruchom `test:db`, żeby wszystkie cztery snapshoty miały tę samą zmianę (tak jak w PR #34).

- (2026-10-17) Równoległe pod-agenty jednej sesji **dzielą katalog scratchpad**: każdy agent zakłada własny podkatalog (np. `scratchpad/<gałąź>/`) z własnym `databaseDir` i **własnym portem** (nie 54329). Wspólny `databaseDir` kończy się błędem `initdb … exists but is not empty` albo `postmaster.pid already exists`, a wspólny serwer — kolizją baz o stałych nazwach (`winematch_db_test`, `winematch_e2e`) przy równoległym `test:db`. Cudzego serwera nie zatrzymuj.
- (2026-10-19) Wspólny scratchpad bywa czyszczony przez inne agenty w trakcie przebiegu (zniknął katalog z danymi i działający serwer). Gdy `test:db` nagle daje `ECONNREFUSED`, sprawdź katalog: odtwórz go (kopia `node_modules` z `embedded-postgres`, `start.mjs` z własnym portem), uruchom ponownie, potem `db:migrate` na `winematch`, `winematch_test`, `winematch_e2e` i `db:seed`.
- E2E bez przeglądarki (żądania bez JS) da się uruchomić lokalnie: `TEST_DATABASE_URL=… npx vitest run --config vitest.e2e.config.ts tests/e2e/<plik> -t "<opis bloku>"` w `packages/app` po `npm run build` — bloki z `agent-browser` zostają pominięte.

## Jak sprawdzić
`git diff --stat packages/db/src/migrations/` pokazuje tę samą liczbę zmian w czterech snapshotach; `npm run schema:check -w @wine-match/db` → „No changes required”; `npm run test:db` przechodzi lokalnie.
