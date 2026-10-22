---
date: 2026-10-21
updated:
area: tooling
status: active
source: .ai/runs/2026-10-21-fix-sales-covers-check.md
promoted:
---

# `schema:check` porównuje z plikiem snapshotu nazwanym od bazy, nie z samą bazą

## Kontekst
`npm run schema:check -w @wine-match/db` na `winematch` przechodził, a na `winematch_test` zgłaszał zmianę w `sales_record_covers_check`. Migracje były zastosowane poprawnie na obu.

## Przyczyna
`Migrator.checkSchema()` (`@mikro-orm/migrations`) porównuje encje z `.snapshot-<nazwa bazy z DATABASE_URL>.json`, a nie z introspekcją bazy. Snapshoty `_test`, `_e2e` i `_db_test` były zapisane w postaci, którą Postgres normalizuje (`(covers >= 0) AND (covers <= 999)`), więc różniły się tekstowo od encji. Postgres zapisuje `between` jako `>=` / `<=`, więc sama baza jest zgodna.

## Reguła
- Przy zmianie checka lub innego ograniczenia w encji zapisz je w postaci, którą zapisze snapshot (wartość z encji, bez normalizacji Postgresa) i uruchom `schema:check` z `DATABASE_URL` wskazującym na każdą nazwę bazy, której snapshot istnieje.
- Nowe migracje twórz w `packages/db`: `npm run db:migration:create -- --name=...` nie przekazuje `--name` do MikroORM (plik dostaje nazwę `Migration<timestamp>.ts`), więc nazwę nadaj ręcznie przez zmianę nazwy pliku i klasy.
- Lokalnie PostgreSQL 16 z Homebrew wymaga `LC_ALL=en_US.UTF-8` przed `pg_ctl start`, inaczej serwer pada z „postmaster became multithreaded”.

## Jak sprawdzić
`DATABASE_URL=postgres://localhost:5432/winematch_test npm run schema:check -w @wine-match/db` musi wypisać `No changes required`. Dla każdej nazwy z `packages/db/src/migrations/.snapshot-*.json` powtórz z jej bazą.
