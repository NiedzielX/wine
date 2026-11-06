---
date: 2026-11-05
updated:
area: db
status: active
source: .ai/runs/2026-11-04-e12-f1-team-and-audit.md
promoted:
---

# W transakcji MikroORM `em.getConnection().execute` omija transakcję: używaj `em.execute`

## Kontekst
`PgTeamRepository.applyChange` robi w `em.transactional(async (em) => …)` blokadę wierszy (`select … for update`), `update` i odczyt zmienionej osoby. Test kontraktu zwrócił starą rolę, choć `update` się powiódł, a `test:db` przechodził przy zapisie, który nie zdążył jeszcze zatwierdzić.

## Przyczyna
`em.execute(sql, params)` używa kontekstu transakcji forka `em`. `em.getConnection().execute(sql, params)` (wzorzec w `registerFailedLogin` i zapytaniach agregujących) bierze osobne połączenie z puli, poza transakcją: nie widzi niezatwierdzonego `update`, a `select … for update` na nim nie trzyma blokady w transakcji, którą potem zatwierdzamy.

## Reguła
W kodzie, który działa wewnątrz `em.transactional`, każde surowe zapytanie idzie przez `em.execute` (na `em` przekazanym do callbacka). `getConnection().execute` zostaw dla jednorazowych zapytań poza transakcją (jeden `UPDATE … RETURNING`, agregaty). Test, który udowadnia blokadę, nie może być sekwencyjny: dwa połączenia i `Promise.allSettled`; sprawdź go mutacją (usuń `for update` i zobacz, że test pada).

## Jak sprawdzić
`packages/db/tests/repositories.integration.test.ts`: „two owners demoting each other at the same moment …” (osiem rund; bez `for update` oba żądania się udają).
