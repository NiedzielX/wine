---
date: 2026-10-21
updated:
area: tooling
status: active
source: .ai/runs/2026-10-21-e09-f3-pos-code-matching.md
promoted:
---

# W testach kontraktu każdy import daje nowe identyfikatory linii; testy migracji odtwarzają późniejsze migracje

## Kontekst
Kontrakt repozytorium (`repositoryContract`) wykonał dwa importy tych samych obiektów `SalesRecord` z tym samym `id`. Pamięć to zniosła, PostgreSQL rzucił naruszenie klucza głównego. `translate()` w `packages/db/src/repositories/errors.ts` mapuje każde `UniqueConstraintViolationException` na `duplicate_pairing` („A dish and a wine can be paired only once.”), więc błąd wyglądał jak błąd parowań.

Drugi przypadek: test up/down pierwszej migracji `sales_record` cofa tabelę, a po odtworzeniu brakowało kolumny z późniejszej migracji.

## Przyczyna
Identyfikatory linii to klucze główne; import nie sprawdza duplikatów, bo w produkcji `ImportService` generuje nowe UUID. `translate()` nie rozróżnia kluczy od parowań.

## Reguła
- W testach kontraktu i fixture'ach każdy zapis `confirm` z nowymi liniami buduj nowymi identyfikatorami (licznik lub kolejna linia), nigdy ponownie tymi samymi obiektami.
- Test `down`/`up` jednej migracji odtwarza też wszystkie późniejsze migracje tej tabeli (`up` każdej w kolejności) przed dalszymi asercjami.
- Nie mapuj wszystkich naruszeń unikalności na jeden błąd domenowy bez sprawdzenia constraintu.

## Jak sprawdzić
`TEST_DATABASE_URL=… npm run test:db` przechodzi; kontrakt POS w `packages/core/src/testing/recommendation-code-contract.ts` (przypadek „matched in the POS once”) oraz test „the migration creates the table…” w `packages/db/tests/repositories.integration.test.ts`.
