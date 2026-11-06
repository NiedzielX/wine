---
date: 2026-11-05
updated:
area: db
status: active
source: .ai/runs/2026-11-04-e11-f1-production-readiness.md
promoted:
---

# `MikroORM.init` nie łączy się z bazą, a po `close()` łączy się sam: „baza leży” testuj przekaźnikiem TCP

## Kontekst
Spec E11 (R3, Q5) zakładał, że nieudana inicjalizacja ORM odrzuci obietnicę kontenera, i zostawił to jako „niezweryfikowane”. Sprawdzone na PostgreSQL 16 i MikroORM 7.2.2.

## Co odkryto
- `MikroORM.init` z adresem nieosiągalnego serwera (`postgres://…@127.0.0.1:1/x`) **kończy się sukcesem**. Odrzuca dopiero konfigurację, której nie umie użyć (brak `clientUrl` / `driver`, `clientUrl: 'nonsense'`). Awaria bazy objawia się przy pierwszym zapytaniu, nie przy budowie kontenera. Proces więc startuje przy martwej bazie, `/api/v1/health` jest wtedy 503 (zapytanie `select 1` pada), a zwykłe żądanie danych dostaje ogólne 500.
- Po `orm.close(true)` kolejne zapytanie **otwiera połączenie od nowa** (zwraca `ok`). „Zamknięte połączenie” nie symuluje niedostępnej bazy.
- Pula po powrocie serwera sama odzyskuje połączenia: test z przekaźnikiem TCP (`createTcpRelay` w `@wine-match/testkit`) daje kolejno `ok`, `unreachable`, `ok` na tej samej puli, bez restartu.

## Reguła
- Do sprawdzenia bazy używaj zapytania (`select 1` z limitem czasu), nie samego powodzenia `init`.
- „Baza zniknęła i wróciła” testuj przekaźnikiem TCP przed bazą (zatrzymaj i uruchom go na tym samym porcie), nie zamykaniem ORM ani zabijaniem procesu bazy.
- Brak buforowania odrzuconej obietnicy kontenera i `getOrm()` zostaje jako obrona przed innymi błędami budowy; nie liczymy na nią przy awarii bazy.

## Jak sprawdzić
`packages/db/tests/system-health.integration.test.ts` (przekaźnik, nieosiągalny port, `getOrm` po błędnej konfiguracji) i `packages/app/tests/e2e/health.e2e.test.ts` (to samo na zbudowanej aplikacji).
