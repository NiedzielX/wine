---
started: 2026-11-08 17:40
ended: 2026-11-08 19:45
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: .ai/specs/2026-10-15-production-deployment.md
outcome: partial (kod, CI i dokumentacja gotowe; `docker build` i job `image` niewykonane: brak Dockera; AC1/2/3/6/7/8 niezaznaczone)
related: [.ai/runs/2026-11-04-e11-f1-production-readiness.md]
---

# E11 Fazy 2 i 3: obraz, Compose, job `image`, runbook wdrożenia i wycofania, ciągłość pracy

## Zadanie
Zaimplementować Fazy 2 i 3 specyfikacji produkcyjnego wdrożenia: `Dockerfile` (cele `runtime`, `migrator`), `.dockerignore`, `docker-compose.yml` (produkcja + opcjonalny profil `demo`), job CI `image` (nie wymagany check), `docs/DEPLOYMENT.md` (R8) z jawnym ROLLBACKIEM, `docs/CONTINUITY.md`, odnośniki w README i `docs/OPERATIONS.md`, aktualizacja specyfikacji. Bez push i bez PR. Docker nie jest zainstalowany.

## Status specyfikacji (AGENTS.md §3)
`status: in-progress` (zatwierdzona przez właściciela 2026-10-15, Faza 1 scalona): wolno implementować. Faza 1 zależała od E05-S01, które jest na `main` (`restaurant:create`).

## Przebieg
- Pierwsza próba tego przebiegu została przerwana limitem; jej worktree zniknął bez commitów, więc zaczęto od nowa: worktree `.claude/worktrees/e11-f2-f3`, gałąź `feat/e11-f2-f3-image-and-runbook` z `main` (`4aeeee2`). `npm ci` wymagał npm 11 (Node 22 dostarcza npm 10): lokalnie `npm@11.20.0` w katalogu tymczasowym.
- Digest `node:22.22-bookworm-slim` (zgodny z `.nvmrc`) i `postgres:16.14-bookworm` pobrano z publicznego rejestru (metadane); PostgreSQL 16.15 jest młodszy niż 14 dni, więc wybrano 16.14 (AGENTS.md §1.1).
- Weryfikacja bez Dockera: skopiowano pliki śledzone (bez `.md`, `.ai`, `.claude`, `.agents`, `.github`, jak `.dockerignore`) do katalogu tymczasowego i wykonano kroki obrazu ręcznie: `npm ci`, `check:boundaries` + `build -w app` (build przechodzi bez `.md` i bez env), `npm ci --omit=dev` i układ plików stage'u `runtime` (źródła `core`, `db`, `ui`, `packages/app/{package.json,next.config.ts,tsconfig.json,.next}`), PostgreSQL 16 lokalnie na porcie 50440.
- **Znalezione błędy w pierwszej wersji Dockerfile (poprawione):** `COPY --from=prod-deps /app/packages/app/node_modules` nie istnieje (padłby build): teraz `COPY --from=prod-deps /app ./` i nałożenie źródeł; `COPY packages/app/public` nie istnieje; `migration:up` zapisuje `.snapshot-<baza>.json` w źródłach (cel `migrator` dostał `--chown=node:node`, lekcja `2026-11-08-migration-up-writes-snapshot-into-source`); `# syntax=` usunięte (zbędna zależność od zewnętrznego frontendu).
- Skrypt `.dockerignore` wyklucza `*.md` (build ich nie czyta, potwierdzone), `.env*` poza `.env.example`, `node_modules`, `.next`, `.git`, `.ai`, `.claude`.
- Compose: osobne `.env` (zmienne z `.env.example`) i wartości bezpieczne na stałe; `${POSTGRES_PASSWORD:?}` i `${PUBLIC_BASE_URL:?}` zawodzą zamykająco przy ładowaniu; `app` czeka na `migrate` (`service_completed_successfully`); `app-demo` w profilu `demo` bez `env_file`.
- CI: job `image` (hadolint, build obu celów, AC6, AC2, baza A: migrate, pending, odmowa seeda, restaurant:create, app, `smoke --production`; baza B: seed z `ALLOW_DEMO_DATA`, pełny smoke, strona QR i SVG). Składnia YAML i `bash -n` każdego kroku sprawdzone.
- Dokumentacja: `docs/DEPLOYMENT.md` (instalacja, tabela env wymagane/niebezpieczne/opcjonalne, migracje, pierwsza restauracja, proxy z D1 i przykładem nginx, health/metryki, kopie i próba odtworzenia, ROLLBACK z drzewem decyzyjnym i adnotacjami E12 F1/E14 F1, aktualizacja, demo, próba, CI, decyzje właściciela, problemy), `docs/CONTINUITY.md`, README (sekcja „Wdrożenie produkcyjne”, tabela dokumentacji, odwołanie do `docker compose` teraz prawdziwe), `docs/OPERATIONS.md` (odnośniki, lista przed pierwszym najemcą, instancja demo), `.ai/docs/commands.md`, `.env.example` (blok Compose).

## Weryfikacja
Uruchomione lokalnie (wszystko na kopii układu obrazu, PostgreSQL 16 na `localhost:50440`, aplikacja na `127.0.0.1:50450/50451`):
- `npm ci`; `check:boundaries && build -w @wine-match/app`: build przechodzi bez `.md`, `.ai`, bez `.env`, bez zmiennych środowiska.
- Cel `migrator` (NODE_ENV=production): `migration:pending` wypisał 12 zaległych, `db:migrate` kod 0 („Successfully migrated up to the latest version”), `migration:pending` potem „No pending migrations”; `db:seed` bez `ALLOW_DEMO_DATA` kod ≠ 0, zero wierszy w `restaurant`/`app_user`; `restaurant:create` (hasło z `USER_PASSWORD`) założył `pilot` i właściciela; `db:seed` z `ALLOW_DEMO_DATA=true` na bazie z `pilot` odmawia (kod 1); na pustej bazie przechodzi (baza B).
- Układ `runtime` (`npm ci --omit=dev`, źródła + `.next`): `next start` z `NODE_ENV=production`, `DATA_SOURCE=postgres`, `PUBLIC_BASE_URL=https://wine.example.test`, bez `ALLOW_LOCAL_BASE_URL`, `DEMO_RESTAURANT_SLUG=pilot`: `GET /api/v1/health` 200, log `server starting` z adresem; polecenie `HEALTHCHECK` (`node -e fetch`) zwraca 0; `npm run smoke -- --production http://127.0.0.1:50450 pilot` → „All production smoke checks passed”.
- Baza B (seed demo): pełny `npm run smoke -- http://127.0.0.1:50451 halka` → „All smoke checks passed”.
- Odmowy startu (AC2): `next start` z NODE_ENV=production bez env, na `memory` bez `ALLOW_DEMO_DATA`, na `postgres` bez `PUBLIC_BASE_URL`, z `http://wine.example.com`: kod 1 i komunikaty z nazwami `DATA_SOURCE`, `ALLOW_DEMO_DATA`, `PUBLIC_BASE_URL` (te same napisy sprawdza job `image`).
- `pg_dump -Fc`, `pg_restore` do nowej bazy (`--no-owner --exit-on-error`), liczby wierszy zgodne, `migration:pending` na odtworzonej bazie „No pending migrations”, `pg_restore --clean --if-exists` na istniejącej bazie kod 0 (polecenia z `docs/DEPLOYMENT.md` sekcja 9, bez `docker compose exec`).
- Składnia: `docker-compose.yml` i `ci.yml` parsują się jako YAML (po rozwinięciu kotwic każdy serwis ma oczekiwane zmienne), każdy blok `run` jobu `image` przechodzi `bash -n`; wyrażenie `sed` z próby odtworzenia sprawdzone.
- Polecenia repozytorium (lint, typecheck, `npm test`, `check:*`, `secrets:scan`, `check:context`, `build`, `boot:check`): wyniki w sekcji „Wynik” (uzupełnione po uruchomieniu).

**Tylko do zweryfikowania w CI (nigdy nie uruchomione):** `docker build` obu celów, hadolint, każdy krok jobu `image` w kontenerach (AC6, AC2 w `docker run`, AC8 w obrazie `migrator`, uprawnienia zapisu `node` w `packages/db`, `HEALTHCHECK` w Dockerze, `docker compose config` i `up`, `depends_on: service_completed_successfully`, `init: true`, `cap_drop: ALL` z `next start`), `docker compose --profile demo`, przykład nginx (`nginx -t`), pełna ręczna próba na czystej VM (krok 11 specyfikacji).

## Wynik
Dostarczone: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, job `image`, `docs/DEPLOYMENT.md`, `docs/CONTINUITY.md`, aktualizacje README, OPERATIONS, commands, `.env.example`, specyfikacji (Realizacja, adnotacje AC, decyzje), lekcja. Polecenia repozytorium na gałęzi (npm 11.20.0, Node 22.23): `lint` czysto; `typecheck` czysto; `npm test` (core 743, db 84, ui 62, app 500, testkit 252 testów) zielone; `check:boundaries`, `check:qa` (97 scenariuszy), `check:routes`, `check:context` (0 błędów, 11 ostrzeżeń o rozmiarach cudzych specyfikacji, istniejące wcześniej), `secrets:scan` (po poprawce jobu `image`, który miał literalne adresy `postgres://…:…@`: adres składany w czasie przebiegu, bez nowych wpisów allowlisty), `audit:gate` (0 high, 0 critical), `npm run build` i `npm run boot:check` zielone. `npm run test:db` i `test:e2e` nie uruchamiane (testcontainers wymagają Dockera; zmiany nie dotykają kodu `db` ani aplikacji).

Dług i ryzyka: (1) `docker compose` wymaga, by przy `--profile demo` istniał `.env` (opisane w runbooku, sekcja 12); (2) przykład nginx i Caddy nieprzetestowane; (3) `cap_drop: ALL` + `no-new-privileges` bez `read_only` (twardsze `read_only: true` wymaga zapisywalnego `.next/cache`, do sprawdzenia na Dockerze); (4) `docker image prune` i retencja starych obrazów zależą od operatora; (5) rejestr obrazów poza zakresem (Q8).

Pliki zmieniane pod CODEOWNERS: `.github/workflows/ci.yml`, `.ai/docs/commands.md` (`/.ai/docs/`); `Dockerfile`, `.dockerignore`, `docker-compose.yml` nie są dziś w `.github/CODEOWNERS`: zalecane dopisanie (`/Dockerfile`, `/docker-compose.yml`, `/.dockerignore`) w PR właściciela, bo definiują granicę obrazu i sekretów (zmiana `.github/CODEOWNERS` wymaga jego review). Nie zmieniano `scripts/`.

## Lekcje
- `.ai/lessons/2026-11-08-migration-up-writes-snapshot-into-source.md`

## Poprawki po review PR #136 (2026-11-09)
- `.dockerignore`: wzorce sekretów na każdej głębokości (`**/.env`, `**/.env.*`, `**/*.pem`, `**/*.key`, `**/id_rsa*`); job `image` podkłada takie pliki (korzeń, `packages/app/.env.local`, `packages/db/.env`, klucz `.pem`, `id_rsa_test`) przed budową i sprawdza system plików `/app` oraz każdą warstwę (`docker save`; tylko ścieżki pod `app/`, bo obraz bazowy ma własne certyfikaty). Logikę skanu warstw sprawdzono lokalnie na sztucznym archiwum.
- `docs/DEPLOYMENT.md` 10.3 i 10.4: krok 5 używa jawnie migratora NOWEGO tagu (`WINE_MATCH_TAG=<nowy-tag>` tylko dla tego polecenia); zakaz `build`/`up --build` przy rozjechanym checkoucie i tagu; stary obraz tylko z osobnego worktree starego tagu.
- Cel `migrator`: jawny `RUN chown -R node:node /app/packages/db/src/migrations`; CI: próba zapisu jako `node` i sprawdzenie właściciela.
- Compose: koniec z `env_file: .env` (aplikacja dostaje wyliczone z nazwy zmienne; `migrate` tylko zmienne bazowe); `.env` służy tylko do podstawiania. Sprawdzenie hasła bazy (litery i cyfry, min. 24 znaki) jako polecenie POSIX w DEPLOYMENT.md krok 3 przed pierwszym startem (Compose nie koduje URL).
- hadolint przypięty digestem; job `image` ma jawne `permissions: contents: read` (najmniejsze uprawnienia, bez rejestru i sekretów); komentarz o `HEALTHCHECK` poprawiony (Docker sam nie restartuje za „unhealthy”).
- Nadal tylko w CI: wszystko, co wymaga Dockera (patrz „Tylko do zweryfikowania w CI”), w tym nowe kroki (warstwy, próba zapisu migratora).
