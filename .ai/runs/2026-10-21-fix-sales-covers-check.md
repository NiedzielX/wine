---
started: 2026-10-21 21:40
ended: 2026-10-21 22:00
agent: Claude Code / claude-haiku-5-5
spec: brak — poprawka driftu schematu (bez zmiany zachowania aplikacji)
outcome: success
related: [.ai/lessons/2026-10-21-schema-check-snapshot-per-database.md]
---

# Wyrównanie checka `sales_record_covers_check` z encją

## Zadanie
`npm run schema:check -w @wine-match/db` zgłasza zmiany dla `sales_record_covers_check`: encja mówi `between 0 and 999`, baza normalizuje do `>=` / `<=`. Naprawa na gałęzi `fix/sales-covers-check-drift` z `origin/main`, PR bez merge.

## Przebieg
- Odtworzenie: `schema:check` z `DATABASE_URL` na bazie `winematch` przechodzi, a na `winematch_test` zgłasza zmianę. Porównanie idzie z plikiem `.snapshot-<nazwa bazy>.json`, a snapshoty `_test`, `_e2e` i `_db_test` zawierały postać znormalizowaną przez bazę.
- Encja: `check('covers >= 0 and covers <= 999')` (źródło prawdy).
- Migracja `Migration20261021194427_fix_sales_covers_check`: drop + add tego samego checka w kanonicznej postaci; `down` przywraca `between`. Zakres ograniczeń się nie zmienia.
- Snapshoty: `.snapshot-winematch.json` zaktualizowany przez `migration:create`; `_test`, `_e2e`, `_db_test` ręcznie na tę samą postać (to, co zapisałby `storeCurrentSchema`).
- Test: rozszerzenie integracyjne `repositories.integration.test.ts` (`covers 0 i 999 przyjęte, -1 i 1000 odrzucone`).

## Weryfikacja
- `schema:check` przed (`winematch_test`): `Changes detected. Please create migration to update schema.`, exit 1. Po: `No changes required, schema is up-to-date` (`winematch`, `winematch_test`, `winematch_e2e`, `winematch_db_test`).
- Świeża baza `winematch_fresh`: `db:migrate` OK, `schema:check` OK, `migration:down` cofa tylko tę migrację (OK), ponowny `db:migrate` OK.
- `npm run lint`, `npm run typecheck`, `npm test` (19+4+4+23+2 plików, 547+48+62+337+10 testów), `npm run build`, `npm run check:boundaries`, `npm run test:db` (99/99) — zielone.

## Wynik
Naprawione. Poza zakresem: snapshot `.snapshot-wm_smoke.json` nie zawiera tabeli `sales_record` (nie był testowany tym zadaniem).

## Lekcje
- [2026-10-21-schema-check-snapshot-per-database](../lessons/2026-10-21-schema-check-snapshot-per-database.md)
