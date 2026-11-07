---
started: 2026-11-06 16:30
ended: 2026-11-06 17:10
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-staff-accounts-and-roles.md
outcome: success (script, guard, tests and docs done; no PR opened, nothing merged)
related: [.ai/runs/2026-11-06-e12-f2-invitations.md]
---

# E12 F2: „skrypt demo” jako `npm run user:invite`

## Zadanie
Domknięcie punktu F2 „skrypt demo” (Q-F2 pkt 1 w specyfikacji): polecenie operatora wystawiające zaproszenie i drukujące jednorazowy link. Mały krok bez nowego modelu danych, bez zmiany serwisów.

## Przebieg
- `scripts/user-invite.ts`: `run(argv, env, deps)` + wejście; kontener z `app/src/server/container.ts`, `InvitationService.invite` z `actor` = konto z `--as`, link z `invitationLink` (`PUBLIC_BASE_URL`). Link jedyny na stdout; komunikaty na stderr; błąd niedomenowy bez treści; `PUBLIC_BASE_URL` sprawdzany przed wystawieniem tokenu; odmowa dla `DATA_SOURCE=memory`.
- `packages/db/src/seeders/seed-guard.ts`: `assertInviteCommandAllowed` (ta sama definicja „chronionego” co seeder, jawne `ALLOW_DEMO_DATA=true`; bez reguły „prawdziwa restauracja”: decyzja własna, do potwierdzenia przez właściciela).
- Znalezisko: GM zaprasza tylko rolę niższą (sommelier), nie manager; test zaczynał od złej roli.

## Weryfikacja
PostgreSQL 16 (Homebrew) na porcie 50301, `TEST_DATABASE_URL`. - `npm run lint`: 0. `npm run typecheck`: bez błędów; sam `scripts/user-invite.ts` sprawdzony tymczasowym tsconfig (czysto, plik usunięty), bo żaden pakiet go nie obejmuje.
- `npm test`: core 741, db 83, ui 62, app 475, testkit 165 zielone (nowe: `app/tests/unit/user-invite.test.ts` 11, `db/tests/invite-guard.test.ts` 10).
- `npm run test:db`: 177 zielone, w tym `user-invite.integration.test.ts` (prawdziwy proces `tsx`, hash tokenu w bazie = SHA-256 tokenu z linku, odmowa przy `production`, odmowa serwisu). 14 padnięć w `seed-guard.integration.test.ts`: środowiskowe, niezwiązane ze zmianą (`npm run seed` ładuje `@mikro-orm/*` 7.2.2 z `node_modules` nadrzędnego checkoutu `wine/` zamiast 7.2.5 z worktree; CLI MikroORM).
- `npm run build`: OK. `npm run check:context`: 0 błędów (11 ostrzeżeń o rozmiarze, istniejące). `npm run secrets:scan`: OK.
- Nie zrobione: pełne `test:e2e` i `smoke` (bez zmian w stronach/API); ręczny przebieg na działającej instancji poza testem integracyjnym.
