---
started: 2026-10-25 13:26
ended: 2026-10-25 13:35
agent: Claude Code
spec: .ai/specs/implemented/2026-10-15-restaurant-bootstrap-cli.md
outcome: success
related: [issue #24]
---

# Polecenie npm run restaurant:create (E05-S01, Faza 1 i 2)

## Zadanie
Wdrożyć zatwierdzoną specyfikację E05-S01: `validateSlug()` w `core` (Faza 1) oraz polecenie operatora `restaurant:create` z testami i dokumentacją (Faza 2), AC1-AC10. E2E (AC2) wymaga `agent-browser`, którego środowisko nie ma.

## Przebieg
- Worktree `/home/user/wine-e05-s01` na gałęzi `feat/e05-s01-restaurant-create` z `origin/main` (6f343f9). Status specyfikacji ustawiony na `in-progress`.
- Przeczytane: AGENTS.md, AGENTS pakietów db/core/app, indeks lekcji, lekcje postgres-without-docker, posix-shell-in-scripts, auth-conventions, specyfikacja, `create-user.ts`.

- Faza 1: test `packages/core/tests/validate-slug.test.ts`, potem `validateSlug()` w `restaurant-service.ts` (`updateDetails` ją woła; istniejące testy `RestaurantService` bez zmian).
- Faza 2: `packages/db/scripts/restaurant-bootstrap.ts` (`parseInput`, `run(argv, env, { openOrm })`) i cienki `create-restaurant.ts`; skrypt `restaurant:create` w obu `package.json`. Testy bez bazy (`create-restaurant-cli.test.ts`, 21 przypadków) napisane razem z modułem; testy integracyjne na PostgreSQL (`restaurant-bootstrap.integration.test.ts`, 10 przypadków, w tym dwa równoległe wywołania i częściowo zastosowane migracje); AC8 w `packages/app/tests/unit/restaurant-owner-scope.test.ts`.
- Odstępstwo od A6: `migrator.getPending()` na bazie bez migracji sam zakłada tabelę `mikro_orm_migrations` (`Migrator.init` → `storage.ensureTable()`), co łamie AC6 („brak tabel utworzonych przez polecenie”). Dlatego najpierw `select to_regclass('mikro_orm_migrations')`: brak tabeli = oczekujące migracje; dopiero gdy tabela istnieje, `getPending()`.
- AC2 (e2e): środowisko nie ma `agent-browser`, ale scenariusz nie wymaga przeglądarki. `global-setup.ts` uruchamia prawdziwe `restaurant:create` po `seed` (`dbScript` dostał argumenty i env), a `restaurant-create.e2e.test.ts` używa samego `fetch` na zbudowanej aplikacji (logowanie, `/auth/me`, Setup, 403 dla panelu i API Halki). Uruchomiony osobno na własnym klastrze: 4/4. Pozostałych plików e2e (z przeglądarką) nie dało się uruchomić.
- Testy integracyjne wyłączają zapis snapshotu migratora (`snapshot: false`), żeby nie zostawiać `.snapshot-<baza>.json` w repozytorium (migrator.up zapisuje je dla każdej nazwy bazy).
- Dokumentacja: AGENTS §1.5 (§1.3 miało już `restaurant:create` w wyjątku dla poleceń operatora na `main`), `packages/db/AGENTS.md`, README (użycie, kontener, przekazanie hasła, SQL cofnięcia), `docs/USER_ROLES.md`, `BACKWARD_COMPATIBILITY.md` §5.
- Środowisko: własny klaster PostgreSQL 16 na porcie 54330 (`/var/tmp/pg-e05`), serwisu na 5432 nie ruszano. `npm ci` z `npm@11.20.0 --engine-strict=false`. `secrets:scan` nie istnieje w tej wersji repo.
- Ręczny test prawdziwego CLI (`npm run restaurant:create` z katalogu głównego) na świeżej bazie: bez migracji i hasła kod 1 z listą błędów, po `migration:up` sukces z czterema liniami, drugie wywołanie z tym samym slugiem kod 1.

## Weryfikacja
- `npm run lint`: kod 0, bez ostrzeżeń.
- `npm run check:boundaries`: „Package boundaries OK”.
- `npm run typecheck`: kod 0, bez błędów (wszystkie pakiety).
- `npm test`: kod 0; pięć zestawów pakietów: 579, 70, 62, 356 i 10 testów zaliczonych (pliki: 21, 5, 4, 26, 2), w tym nowe `validate-slug` (core), `create-restaurant-cli` (db), `restaurant-owner-scope` (app).
- `npm run test:db` (`TEST_DATABASE_URL=postgres://postgres@localhost:54330/postgres`): kod 0, 2 pliki, 112 testów zaliczonych; `restaurant-bootstrap.integration.test.ts` dodatkowo uruchomiony 4 razy z rzędu (testy wyścigu stabilne), 10/10 za każdym razem.
- `npm run build`: kod 0 (granice, mockupy, Next.js z typecheckiem).
- E2E: tylko `restaurant-create.e2e.test.ts` (4/4, własny klaster, zbudowana aplikacja). `npm run test:e2e` w całości NIE uruchomiony (brak `agent-browser`).
- `npm run schema:check`: nie dotyczy (bez zmian encji i migracji).
- `npm run secrets:scan`: nie istnieje w tej wersji repo.

## Wynik
AC1-AC10 spełnione (AC2 scenariuszem HTTP bez przeglądarki). Nie uruchomiono: reszty zestawu e2e z przeglądarką (zmiana `global-setup.ts` dodaje tylko drugą restaurację do bazy e2e, więc nie powinna ich dotknąć, ale to niezweryfikowane) oraz `npm run smoke`. Proces SDLC dla zmian auth (risk-high): drugi recenzent, `needs-qa` i brak self-QA należą do PR. Dług techniczny: brak.

## Lekcje
brak (`getPending()` zakładające tabelę migracji i zapis snapshotów przez `migrator.up` opisane w tym logu i w „Realizacji” specyfikacji; nie uznano za wymagające osobnej lekcji)
