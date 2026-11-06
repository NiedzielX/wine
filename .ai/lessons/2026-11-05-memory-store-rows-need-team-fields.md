---
date: 2026-11-05
updated:
area: tooling
status: active
source: .ai/runs/2026-11-04-e12-f1-team-and-audit.md
promoted:
---

# Wiersz `MemoryStore.memberships` bez `status` nie daje dostępu: testy dopisujące członkostwo podają pola zespołu

## Kontekst
Po E12 F1 trzy testy `restaurant-owner-scope.test.ts` padły, choć nie dotykały zespołu: dopisywały `{ userId, restaurantId, restaurantSlug, restaurantName, role }` do `store.memberships` bez nowych pól.

## Przyczyna
`MemoryAuthRepository.membershipsOf` zwraca tylko członkostwa ze `status === 'active'` (tak jak `PgAuthRepository`), więc wiersz bez statusu jest dla pamięci nieaktywny. Testy nie są sprawdzane przez `tsc` (vitest nie sprawdza typów), więc brak pól `StoredMembership` nie dał błędu kompilacji.

## Reguła
Test, który dopisuje członkostwo do `MemoryStore`, podaje pełny `StoredMembership` (`membershipId`, `status: 'active'`, `version: 1`, `createdAt`, `deactivatedAt: null`, `deactivatedBy: null`); wzór: `addSecondRestaurant` w `core/src/testing/team-contract.ts`. Magazyn nie zakłada „brak statusu = aktywny”: dostęp zawodzi zamykająco. Gałąź, która dopisuje członkostwa w testach i scala `main` po E12 F1, naprawia je tym samym polem.

## Jak sprawdzić
`npm test -w @wine-match/app` (`restaurant-owner-scope.test.ts`, `team.test.ts`).
