---
date: 2026-11-05
updated:
area: db
status: active
source: .ai/runs/2026-11-05-bughunt-url-ids.md
promoted:
---

# Id z adresu URL nie jest UUID-em: repozytorium zwraca „nie znaleziono”, nie błąd bazy

## Kontekst
Strony gościa (`/r/halka/wine/abc`, `/dish/abc/wines`, `/selected/abc`) i publiczne `GET /api/v1/dishes/abc/recommendations` odpowiadały 500 na identyfikator, który nie jest UUID-em (literówka, ucięty link, skaner). Wszystkie testy i CI były zielone.

## Przyczyna
`PgDishRepository`, `PgWineRepository` i `PgPairingRepository` przekazywały surowy `id` do kolumny `uuid`. PostgreSQL odpowiada błędem `22P02` (`invalid input syntax for type uuid`), którego nikt nie mapuje, więc aplikacja zwracała ogólne 500. Repozytoria w pamięci po prostu niczego nie znajdowały, więc kontrakt repozytoriów i testy w pamięci nie zauważały różnicy.

## Reguła
Każde wyszukiwanie po `id`, które może dostać wartość z URL-a, formularza lub API, musi traktować wartość niebędącą UUID-em jako „nie ma”: `null` albo pusta lista, nigdy błąd sterownika. Zachowanie przypinamy w `repositoryContract` (jeden kontrakt dla pamięci i PostgreSQL), nie w teście jednej strony. Nowe metody `findById` i `listBy…` w `packages/db` dostają ten sam strażnik (`isUuid`).

## Jak sprawdzić
`packages/core/src/testing/repository-contract.ts`: test „treats an id that is not a UUID as unknown” (uruchamiany w `core` na pamięci i w `db` na PostgreSQL). Dowód „czerwony przed poprawką, zielony po”: `npm run verify:regression` (skrypt z PR „fix-verification-gates”).
