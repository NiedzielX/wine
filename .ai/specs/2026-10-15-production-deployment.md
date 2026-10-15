---
status: draft
created: 2026-10-15
owner: Filip
related: [issue #23, #24, #25, .ai/specs/product-brief.md, .ai/specs/2026-10-15-restaurant-bootstrap-cli.md, .ai/specs/2026-10-15-guest-usage-events.md, .ai/specs/2026-10-15-pos-sales-import-attach-rate.md]
---

# Powtarzalne wdrożenie produkcyjne Wine Match (E05-S02)

## 📝 TLDR
Maintainer nie ma dziś jak wdrożyć Wine Match poza swoją maszyną: brak obrazu, opisu migracji przy wdrożeniu, endpointu zdrowia i instrukcji dla produkcji, więc pilotaż (Q08) nie może ruszyć. **Proponujemy** (stan przyszły) jeden niezależny od dostawcy obraz kontenera z celami `runtime` i `migrator`, migracje jako osobny jednorazowy krok przed przełączeniem ruchu, `GET /api/v1/health`, fail-closed `PUBLIC_BASE_URL` w produkcji (https, host publiczny; wyjątek tylko przez jawne `ALLOW_LOCAL_BASE_URL=true`), blokadę `DemoSeeder` w produkcji oraz runbook `docs/DEPLOYMENT.md` (VM + Docker Compose). Restaurację bez danych demo zakłada `npm run restaurant:create` z E05-S01 — ten spec od niego zależy w Fazach 2–3.

## Resolved assumptions (autonomous defaults)
| # | Pytanie | Przyjęta odpowiedź | Uzasadnienie |
|---|---|---|---|
| Q1 | Rozdzielić spec? Zależność od #24? | Jeden spec, trzy fazy = trzy osobno scalane PR-y. **Faza 1 nie zależy od E05-S01**; Fazy 2 (AC7 w jobie `image`) i 3 (runbook, ręczna próba, historia GM/QR) wymagają scalonego `restaurant:create` (E05-S01). Kolejność PR: E05-S01 → E05-S02 F1 → E02 → E03 → E05-S02 F2/F3 (F2/F3 mogą iść równolegle z E02/E03 po E05-S01). | Wcześniejsze „działa bez #24” było sprzeczne z AC7 i historią GM. |
| Q2 | Dostawca hostingu (product brief Q08) | Obraz OCI niezależny od dostawcy + runbook. Cel referencyjny: jedna VM w UE (np. Hetzner/OVH), Docker Compose, PostgreSQL 16 w kontenerze z wolumenem lub zarządzany, TLS na reverse proxy operatora. **⚠ NEEDS HUMAN CONFIRMATION** | Decyzja produktowa (Q08). Od odpowiedzi zależą tylko sekcje runbooka, nie kod. |
| Q3 | Migracje przy starcie aplikacji czy osobno? | Osobny jednorazowy krok (`migrator`, `npm run db:migrate`) przed startem nowej wersji; aplikacja nigdy nie migruje sama. | Jawny kod wyjścia, brak wyścigu przy >1 replice, punkt na `pg_dump` przed migracją. |
| Q4 | Next.js `output: 'standalone'`? | Nie w tej iteracji: `next start` na zależnościach produkcyjnych (ta sama ścieżka co `boot:check` i e2e). | MikroORM ładuje sterowniki dynamicznie (`serverExternalPackages`); odwracalne. |
| Q5 | Healthcheck | `GET /api/v1/health`; jednometodowy port `SystemHealth` rejestrowany w kontenerze DI (bez osobnej klasy serwisu); awaria budowy kontenera → 503, nie 500; nieudana inicjalizacja kontenera/ORM nie jest buforowana. `HEALTHCHECK` obrazu = żywotność (proces odpowiada), 200 = gotowość. | Zgodne z §1.3 (trasy bez `@wine-match/db`); odzyskanie po awarii bazy bez restartu. |
| Q6 | `PUBLIC_BASE_URL` w produkcji | Fail-closed: w produkcji (każde `DATA_SOURCE`) `PUBLIC_BASE_URL` musi być ustawiony, mieć schemat `https://` i host publiczny (R4); inaczej kod 1. Jedyny wyjątek: nowa zmienna `ALLOW_LOCAL_BASE_URL=true` (loguje ostrzeżenie przy starcie). `AUTH_COOKIE_SECURE` nie wpływa już na tę regułę. **⚠ NEEDS HUMAN CONFIRMATION** | Zaostrzenie kontraktu BC §4 (dziś tylko ostrzeżenie) + nowa zmienna (addytywna wg BC §4). Wyjątek przez `AUTH_COOKIE_SECURE=false` był fail-open: to flaga, którą operator przełącza, gdy „logowanie nie działa” za proxy. |
| Q7 | Smoke na produkcji | Pełny smoke tylko na **instancji próbnej** (czysta baza, migracje, `db:seed` z `ALLOW_DEMO_DATA=true`); na produkcji tryb `--production` (tylko GET, bez kont demo, niezależny od treści menu). | Konta demo nie mogą istnieć na prawdziwej instalacji; pełny smoke przełącza `active` wina i tworzy anulowane importy. |
| Q8 | Publikacja obrazu do rejestru | Poza zakresem: CI buduje i testuje obraz w PR, maintainer buduje go z tagu git na hoście. Push do GHCR = follow-up. | Żadne AC nie wymaga rejestru. |
| Q9 | Kopie zapasowe | Runbook wymaga `pg_dump` przed każdą migracją; polityka kopii dostawcy po stronie operatora. | Bez nowej infrastruktury w repo. |
| Q10 | Ochrona przed danymi demo w produkcji | Strażnik w `DemoSeeder`: odmowa (wyjątek, kod ≠ 0, nic nie zapisane), gdy `NODE_ENV=production` bez `ALLOW_DEMO_DATA=true` **albo** gdy w bazie istnieje restauracja o slugu innym niż demo. Cel `migrator` ma `NODE_ENV=production`. | Granica demo/produkcja egzekwowana kodem, jak w aplikacji i E05-S01, nie konwencją runbooka. `DemoSeeder` jest poza kontraktem BC. |
| Q11 | Wycofanie | Produkcja: (1) poprzedni tag obrazu bez ruszania schematu (działa, dopóki wydanie nie zawiera migracji *contract*); (2) poprawka w przód; (3) odtworzenie `pg_dump` sprzed migracji. `migration:down` **tylko na instancji próbnej** — `down` może usuwać dane (np. E03 usuwa `sales_record`). | Bez utraty danych sprzedaży na produkcji. |
| Q12 | Ruch syntetyczny (smoke, runbook, CI) | Każde żądanie `smoke.mjs` (oba tryby), `curl` z runbooka i job `image` wysyła nagłówek `X-Wine-Match-Synthetic: 1`. E02 (`trackUsage`) **musi** nie zapisywać zdarzeń dla żądań z tym nagłówkiem (E02 dziś go nie definiuje — do dopisania tam). | Smoke nie zawyża analityki pilota. |

## Problem
- Jedyna udokumentowana ścieżka startu to `npm run build && npm start` w sklonowanym repo (README); brak `Dockerfile`, `.dockerignore`, opisu hostingu i kolejności „migracje → start”.
- `PUBLIC_BASE_URL` w produkcji tylko ostrzega (`packages/app/src/server/startup.ts`) — QR wydrukowane z `http://localhost:3000/r/{slug}` to nieodwracalny błąd (BC §1).
- Brak endpointu zdrowia; `boot:check` sprawdza tylko lokalny proces.
- `npm run smoke` loguje się kontem demo i oczekuje dań Halki — nie działa na prawdziwej restauracji.
- `DemoSeeder` (`packages/db/src/seeders/DemoSeeder.ts`) nie ma strażnika produkcji; jedno `npm run db:seed` na produkcyjnym `DATABASE_URL` tworzy konta z publicznym hasłem.
- Product brief: Q08 blokuje pilotaż; D09 każe przygotować pilotaż teraz.

## Cel i zakres
Powtarzalne wdrożenie jednej instancji produkcyjnej na PostgreSQL z weryfikacją po starcie.
**Poza zakresem:** zakładanie restauracji i właściciela (E05-S01 — tu tylko wywołanie), panel administratora systemu, wiele lokali, Next.js standalone, rejestr obrazów, automatyczny CD, monitoring/alerting poza endpointem zdrowia, filtr botów (E02 Q11).

## Wymagania
- **R1** `Dockerfile` z celami `runtime` i `migrator`, budowany bez zmiennych środowiska i sekretów; oba działają jako nie-root; obraz nie zawiera `.env`.
- **R2** Migracje to osobny krok (`migrator`) przed startem nowej wersji; przełączenie ruchu tylko przy pustym `migration:pending`. Aplikacja nigdy nie migruje.
- **R3** `GET /api/v1/health`: 200 gdy proces działa i (dla `postgres`) `select 1` odpowiada w ≤ 2 s; inaczej 503 bez szczegółów połączenia. Po powrocie bazy zwraca 200 bez restartu procesu.
- **R4** W produkcji (każde `DATA_SOURCE`), bez `ALLOW_LOCAL_BASE_URL=true`, start kończy się kodem 1, gdy `PUBLIC_BASE_URL`: nie jest ustawiony; nie ma schematu `https`; host jest literałem IP (v4/v6, w tym `0.0.0.0`); host jest jednoczłonowy (bez kropki, np. `localhost`, `app`); host kończy się na `.localhost`, `.local`, `.internal`, `.lan` lub `.home.arpa`. Komunikat nazywa zmienną i `ALLOW_LOCAL_BASE_URL`. Z `ALLOW_LOCAL_BASE_URL=true` start przechodzi i loguje `warn`.
- **R5** `DemoSeeder` odmawia (nic nie zapisuje, kod ≠ 0) przy `NODE_ENV=production` bez `ALLOW_DEMO_DATA=true` oraz gdy w bazie jest restauracja o slugu innym niż demo.
- **R6** `npm run smoke -- --production <url> <slug>` wysyła wyłącznie GET, nie loguje się, nie zależy od treści menu; sprawdza: `health` 200, `/` 200 po przekierowaniach (wymaga `DEMO_RESTAURANT_SLUG` = slug pilota), `/r/{slug}` 200, kształt publicznego menu API, `/admin/login` 200, 401 dla trasy z sesją, nagłówki bezpieczeństwa.
- **R7** Każde żądanie `smoke.mjs` (oba tryby) niesie `X-Wine-Match-Synthetic: 1`.
- **R8** Runbook `docs/DEPLOYMENT.md`: budowa, env, `pg_dump` → `migrate` → `migration:pending` → `app`, `restaurant:create` z bezpiecznym hasłem, weryfikacja (health, smoke `--production`, adres QR), próba, wycofanie wg Q11.
- **R9** Job CI `image` odtwarza AC1, AC2, AC3, AC6, AC7 na zbudowanym obrazie.

## Kryteria akceptacji
- [ ] AC1 — Given czysta instancja i PostgreSQL, When wykonuje się kroki z `docs/DEPLOYMENT.md`, Then `migrate` kończy się kodem 0, `migration:pending` jest pusty, aplikacja startuje z `DATA_SOURCE=postgres`, a pełny `npm run smoke -- <url> halka` przechodzi (instancja próbna z `db:seed` + `ALLOW_DEMO_DATA=true`; job `image` + ręczna próba, krok 11).
- [ ] AC2 — Given brak `DATA_SOURCE` albo `DATA_SOURCE=memory` bez `ALLOW_DEMO_DATA`, When serwer startuje w produkcji (proces i kontener `runtime`), Then kod 1 z komunikatem (`boot:check` + job `image`).
- [ ] AC3 — Given `PUBLIC_BASE_URL=https://wine.example.test`, When GM otwiera `/admin/halka/qr`, Then strona pokazuje `https://wine.example.test/r/halka`, a `GET /api/v1/restaurants/halka/qr` zwraca SVG 200 (job `image`, drugi przebieg; test jednostkowy `guestUrl`).
- [ ] AC4 — Given produkcja bez `ALLOW_LOCAL_BASE_URL`, When `PUBLIC_BASE_URL` jest pusty, `http://wine.example.com`, `https://localhost`, `https://127.0.0.1`, `https://[::1]`, `https://0.0.0.0`, `https://192.168.1.10`, `https://app` lub `https://pilot.local`, Then start kończy się kodem 1; dla `https://wine.example.com` start przechodzi; z `ALLOW_LOCAL_BASE_URL=true` i `http://localhost:3000` start przechodzi z ostrzeżeniem (`env.test.ts`, `boot:check`).
- [ ] AC5 — Given działająca instancja, When woła się `GET /api/v1/health`, Then 200; przy niedostępnej bazie 503 bez hosta, hasła i komunikatu sterownika; po przywróceniu bazy 200 bez restartu (testy jednostkowe, `boot:check`, test integracyjny).
- [ ] AC6 — Given zbudowane obrazy, When się je sprawdza, Then nie zawierają `.env`, `whoami` ≠ root (job `image`).
- [ ] AC7 — Given baza po `migrate` i `restaurant:create` (bez `db:seed`), When uruchamia się `npm run smoke -- --production <url> <slug>`, Then wszystkie sprawdzenia przechodzą, a serwer odnotował wyłącznie żądania GET z nagłówkiem `X-Wine-Match-Synthetic: 1` (job `image`; zależy od E05-S01).
- [ ] AC8 — Given obraz `migrator` z `NODE_ENV=production` (domyślnie) i bez `ALLOW_DEMO_DATA`, When uruchamia się `npm run db:seed`, Then kod ≠ 0 i zero wierszy w `restaurant`/`app_user`; z `ALLOW_DEMO_DATA=true` na pustej bazie seed przechodzi; na bazie z restauracją `pilot` odmawia mimo `ALLOW_DEMO_DATA=true` (`repositories.integration.test.ts` lub nowy test seedera + job `image`).

## Projekt rozwiązania
1. **Obraz** (`Dockerfile`, multi-stage, `node:22.22-bookworm-slim` przypięty digestem, npm 11.20.0 jak w CI, `NEXT_TELEMETRY_DISABLED=1`):
   - `deps`: `npm ci` (bez `NODE_ENV=production`, żeby zainstalować devDependencies) → `build`: `npm run check:boundaries && npm run build -w @wine-match/app` (bez makiet, bez env, bez `.env`).
   - `runtime`: `npm ci --omit=dev`, źródła pakietów (eksportują TS), `packages/app/.next`; `ENV NODE_ENV=production`; `USER node`; `WORKDIR /app/packages/app`; `CMD ["node", "../../node_modules/next/dist/bin/next", "start", "-p", "3000"]` (`next` jest hoistowany do korzenia; exec form; zalecane `--init`); `HEALTHCHECK` przez `node -e` z `fetch` na `/api/v1/health` — zdrowy przy **dowolnej** odpowiedzi HTTP (żywotność), niezdrowy tylko bez odpowiedzi.
   - `migrator`: pełne `npm ci` (CLI MikroORM i `tsx` to devDependencies), **potem** `ENV NODE_ENV=production`; `USER node`; `WORKDIR /app`; domyślnie `npm run db:migrate`. Tym samym obrazem: `npm run migration:pending -w @wine-match/db`, `npm run restaurant:create -- …` (E05-S01). `db:seed` odmawia bez `ALLOW_DEMO_DATA=true` (Q10).
2. **Migracje** w Compose: `app` zależy od `migrate` z `condition: service_completed_successfully`; migracje są już `transactional` + `allOrNothing`.
3. **Health:** port `SystemHealth { database(): Promise<'ok' | 'skipped' | 'unreachable'> }` w `core/src/ports/runtime.ts` (nie repozytorium tenanta — świadomy wyjątek od `restaurantId`, bez przypadku w `repositoryContract`); implementacje: w pamięci (`skipped`) w `core/src/memory`, `PgSystemHealth` w `db` (`em.getConnection().execute('select 1')`, limit 2 s); rejestracja `systemHealth` w `container.ts`. `app/src/server/health.ts`: `checkHealth()` łapie błąd `getContainer()`/`database()` → `unreachable` + `logger.error` (redakcja). Trasa `app/src/app/api/v1/health/route.ts` (`force-dynamic`, `Cache-Control: no-store`) woła tylko `checkHealth()`. `getContainer()` i `getOrm()` czyszczą bufor `globalThis`, gdy obietnica zostanie odrzucona (następne żądanie próbuje ponownie).
4. **`PUBLIC_BASE_URL`** (R4) w `core/src/config/env.ts` + `ALLOW_LOCAL_BASE_URL` w schemacie i `AppEnv` (`allowLocalBaseUrl`); `startup.ts` loguje `warn` przy `allowLocalBaseUrl` w produkcji i przy `secureCookies=false` w produkcji; dotychczasowe ostrzeżenie o braku adresu zostaje dla trybu z wyjątkiem.
5. **`DemoSeeder`** (R5): sprawdzenie na początku `run()` przed jakimkolwiek zapisem; komunikat nazywa `ALLOW_DEMO_DATA`.
6. **`smoke.mjs`**: nagłówek R7 we wspólnym `check()`/`json()`/`apiLogin()`; tryb `--production` (R6).
7. **Wdrożenie:** `.dockerignore` (`.env*` poza `.env.example`, `node_modules`, `.next`, `coverage`, `.ai`, `agent`, `.claude`, `.git`), `deploy/compose.example.yml` (`db` postgres:16 + wolumen + `pg_isready`; `migrate` z `env_file: deploy/migrate.env`; `app` z `env_file: deploy/app.env`; oba pliki w `.gitignore`; runbook zaleca osobne role bazy: właściciel schematu dla `migrate`, tylko DML dla `app` — opcjonalne w pilocie).
8. **Runbook** `docs/DEPLOYMENT.md` (sekcja niżej), sekcja „Wdrożenie produkcyjne” w README, blok „Produkcja” w `.env.example`, BC §4 (reguła R4, `ALLOW_LOCAL_BASE_URL`), `docs/API_SPECIFICATION.md` (health).

**Odrzucone:** migracje przy starcie (`instrumentation.ts`/entrypoint — pętla restartów przy złej migracji); PaaS jako jedyny cel (przed decyzją Q08); `NEXT_PUBLIC_*` z adresem (wymusza przebudowę; u nas `PUBLIC_BASE_URL` czytany w runtime).

**Research (krótko).** Umami: standalone, nie-root, `migrate deploy` przed startem, lekki `/api/heartbeat`. Cal.com: zmienne wypalane w buildzie. Plausible CE: Compose z `migrate && run`. Bierzemy: nie-root, lekki healthcheck, Compose jako referencja, konfiguracja tylko w runtime.

### API i kontrakt środowiska
**`GET /api/v1/health`** (publiczne, bez sesji, `Cache-Control: no-store`):
- 200 `{ "status": "ok", "dataSource": "postgres", "checks": { "database": "ok" } }` (`"skipped"` dla `memory`).
- 503 `{ "status": "unavailable", "dataSource": "postgres", "checks": { "database": "unreachable" } }`.
- Bez wersji, liczby restauracji, stanu migracji. Addytywne wg BC §2.

| Zmienna | Produkcja | Uwagi |
|---|---|---|
| `NODE_ENV` | `production` (w obu celach obrazu) | jedyna wartość wypalona w obrazie |
| `DATA_SOURCE` | `postgres` — wymagane | bez zmian |
| `DATABASE_URL` | wymagane | sekret; tylko z pliku env operatora / menedżera sekretów |
| `PUBLIC_BASE_URL` | wymagane, `https://`, host publiczny (R4) | **nowe:** naruszenie → kod 1 |
| `ALLOW_LOCAL_BASE_URL` | nieustawione | **nowa** (addytywna); `true` tylko lokalnie/CI/e2e |
| `AUTH_COOKIE_SECURE` | nieustawione (domyślnie `true`) | `false` tylko lokalnie; nie zwalnia już z R4 |
| `ALLOW_DEMO_DATA` | nieustawione | teraz też odblokowuje `db:seed` przy `NODE_ENV=production` (tylko próba) |
| `DEMO_RESTAURANT_SLUG` | slug restauracji pilotażowej (wymagane przez runbook) | inaczej `/` przekierowuje na 404 (R6 to wykrywa); w `env.ts` dalej opcjonalne |
| `LOG_LEVEL`, `DB_POOL_MIN/MAX`, `DB_DEBUG` | opcjonalne | bez zmian |

### Runbook `docs/DEPLOYMENT.md`
(1) wymagania: Docker ≥ 24, PostgreSQL ≥ 16, domena z TLS; ustal domenę przed drukiem QR. (2) `docker build --target runtime|migrator` z tagu git (`--platform` dla arm64). (3) `deploy/app.env` i `deploy/migrate.env` wg tabeli. (4) `pg_dump` → `docker compose run --rm migrate` → `docker compose run --rm migrate npm run migration:pending -w @wine-match/db` (pusty) → `docker compose up -d app`. (5) Pierwsza restauracja (E05-S01), hasło nigdy w argumentach ani historii powłoki:
```sh
stty -echo; printf 'Hasło właściciela: '; read -r USER_PASSWORD; stty echo; echo
export USER_PASSWORD
docker compose run --rm -e USER_PASSWORD migrate npm run restaurant:create -- --name … --slug … --city … --owner-email … --owner-name …
unset USER_PASSWORD
```
(`-e USER_PASSWORD` bez wartości dziedziczy zmienną; do `ps` trafia tylko nazwa.) (6) Weryfikacja: `curl -fsS -H 'X-Wine-Match-Synthetic: 1' $URL/api/v1/health`, `npm run smoke -- --production $URL <slug>`, `/admin/{slug}/qr` pokazuje `PUBLIC_BASE_URL/r/{slug}`. (7) Próba: osobna czysta baza, `ALLOW_DEMO_DATA=true` dla `db:seed`, pełny smoke, potem usunięcie bazy próbnej; tylko tu wolno ćwiczyć `migration:down`. (8) Wycofanie wg Q11; ostrzeżenie: wydanie z migracją *contract* (BC §3) unieważnia krok „poprzedni obraz” — takie wydanie zapowiada to w notach i wymaga `pg_dump`. Każdy krok: oczekiwany wynik i co zrobić, gdy go nie ma. Polecenia POSIX.

## User stories
- **Maintainer, pierwsze wdrożenie pilota.** Buduje obraz z tagu, uzupełnia env, `migrate`, `app` → `migrate` kod 0, `health` 200, log `server starting` z `publicBaseUrl` → `restaurant:create` (E05-S01) → właściciel loguje się do `/admin/{slug}`.
- **Maintainer, pomyłka w konfiguracji.** Brak `PUBLIC_BASE_URL`, `http://` albo `DATA_SOURCE` → kontener kończy się kodem 1 z listą problemów → poprawia env.
- **Maintainer, nowa wersja z migracją.** `pg_dump`, `migrate` nowego obrazu → przy błędzie kod ≠ 0, schemat bez zmian (transakcja), stara wersja działa dalej.
- **Maintainer, próba przed pilotem.** Czysta baza z `db:seed` (`ALLOW_DEMO_DATA=true`) → pełny smoke zielony → baza próbna usunięta.
- **GM restauracji pilotażowej.** `/admin/{slug}/qr` → kod wskazuje `https://<adres-pilota>/r/{slug}` → druk.

## Edge Cases & Failure Scenarios
- **Baza niedostępna przy starcie `app`:** proces startuje; żądania danych → ogólne 500, `health` → 503; po powrocie bazy oba działają bez restartu (brak buforowania odrzuconej obietnicy). `HEALTHCHECK` (żywotność) nie oznacza kontenera jako niezdrowego, więc nie ma pętli restartów; load balancer kieruje ruch tylko przy 200.
- **`migrate` bez dostępu do bazy / bez uprawnień DDL:** kod ≠ 0, `app` nie startuje.
- **Migracja pada w połowie:** `allOrNothing` cofa cały przebieg.
- **Nowy obraz na starszym schemacie:** Compose wymusza kolejność; runbook i job `image` wymagają pustego `migration:pending`.
- **Dwie repliki `app`:** bezpieczne (stan i sesje w PostgreSQL); `migrate` raz.
- **`.env` w kontekście budowania:** `.dockerignore`; job `image` sprawdza brak `.env`.
- **`db:seed` na produkcji przez pomyłkę:** R5 odmawia; na bazie z prawdziwą restauracją odmawia nawet z `ALLOW_DEMO_DATA=true`.
- **Publiczna instalacja demo (`memory` + `ALLOW_DEMO_DATA=true`):** też podlega R4 — potrzebuje adresu https albo jawnego `ALLOW_LOCAL_BASE_URL=true`.
- **Świeża restauracja (`onboarding`, nieopublikowana):** `/r/{slug}` zwraca 200 z komunikatem „menu is being updated” (zachowanie opisane w E05-S01) — smoke `--production` sprawdza tylko status i kształt API.
- **Zmiana `PUBLIC_BASE_URL` po druku QR:** stary host przekierowuje 308 (BC §1).
- **SIGTERM:** exec form + `--init`; pula MikroORM zamykana z procesem.
- **arm64:** obraz bazowy multi-arch; CI buduje `linux/amd64`.

## Ryzyka i otwarte pytania
- **Wycofanie** wg Q11; `migration:down` na produkcji zabronione w runbooku (utrata danych, np. `sales_record` z E03). PR z migracją dalej niesie plan wycofania (SDLC).
- **R4 zmienia kontrakt BC §4** (`risk-high`, `security`): instalacja bez `PUBLIC_BASE_URL`, z `http://` lub hostem lokalnym przestanie startować; e2e (`global-setup.ts`), `boot:check` (przypadki d, e), testy jednostkowe (`gaps.test.ts`) i CI muszą dostać `ALLOW_LOCAL_BASE_URL=true`. Dziś brak instalacji produkcyjnych; wpis „💥 Breaking” w PR i README. ⚠ Q6.
- **Nieodwracalność QR** — dlatego R4 i krok weryfikacji QR w runbooku.
- **Sekrety:** żadna wartość env w obrazie ani argumentach budowania; hasło właściciela przez dziedziczone `-e USER_PASSWORD`; logi redagują `DATABASE_URL`.
- **Zależność od E05-S01** (Q1) i od E02 dla R7 (nagłówek działa dopiero, gdy E02 go respektuje).
- **Wspólne pliki z innymi specami:** README, BC §4/§5 (E05-S01), `docs/API_SPECIFICATION.md` (E03) — kolejność PR z Q1, reszta to rebase.
- **Rozmiar obrazu** większy niż standalone — akceptowane w pilocie. Obraz bazowy Node przypięty digestem.
- **Rozbieżność wersji:** `next` 16.3.8 w `packages/app/package.json` vs 16.3.7 w AGENTS.md §1.1 — wyrównać w AGENTS.md przy implementacji.
- **Niezweryfikowane:** czy `MikroORM.init` rzuca przy niedostępnej bazie (test AC5 „po przywróceniu bazy” to rozstrzygnie); czy MikroORM CLI działa z `NODE_ENV=production` (job `image`, AC8).

## Decisions in play
- **D09** (active) — przygotować pilotaż teraz; ten spec go realizuje.
- **D05** (active) — Halka tylko jako demo: wymuszone kodem (R5).
- **Q08** (open) — wybór dostawcy u Filipa (⚠ Q2).
- **BC §1** (adres QR), **BC §4** (fail-closed) — §4 zaostrzane przez R4 (⚠ Q6).

## 📋 Phasing
- **Faza 1 — aplikacja gotowa na produkcję (PR 1, bez zależności):** R3, R4, R5, R6, R7. Kroki 1–2 czekają na ⚠ Q6; kroki 3–6 tylko na zatwierdzenie speca.
- **Faza 2 — obraz i próba (PR 2, po E05-S01):** R1, R2, R9.
- **Faza 3 — runbook (PR 3, po E05-S01):** R8, ręczna próba; sekcja hostingu czeka na ⚠ Q2.

## 📋 Implementation Plan
**Faza 1**
1. `env.ts`: R4 + `ALLOW_LOCAL_BASE_URL` (`allowLocalBaseUrl`). Testy w `packages/core/tests/env.test.ts`: wszystkie przypadki AC4 + `memory`/`ALLOW_DEMO_DATA=true` bez adresu → kod 1. `startup.ts`: ostrzeżenia z p. 4 Projektu. `ALLOW_LOCAL_BASE_URL=true` w `packages/app/tests/e2e/global-setup.ts`, `packages/app/tests/unit/setup.ts` (jeśli test ustawia produkcję) i istniejących przypadkach `boot-check.mjs` (d, e).
2. `boot-check.mjs`: dopisz `ALLOW_LOCAL_BASE_URL` do `BLANK`; nowe przypadki — postgres bez `PUBLIC_BASE_URL` → kod 1 i komunikat; `http://wine.example.com` → kod 1; `https://localhost` → kod 1. Sprawdzenie: `npm run build && npm run boot:check`.
3. Port `SystemHealth`, implementacja w pamięci, `PgSystemHealth` (test w `packages/db/tests/*.integration.test.ts`: `ok`; zamknięte połączenie → `unreachable` ≤ 2 s), rejestracja w `container.ts`; reset bufora odrzuconej obietnicy w `getContainer()` i `getOrm()` (test jednostkowy: pierwsze wywołanie rzuca, drugie buduje od nowa).
4. `server/health.ts` + trasa `api/v1/health/route.ts`; testy w `app/tests/unit/` (200 memory; 503 przy `unreachable` i przy błędzie budowy kontenera, treść bez hosta/hasła); `boot-check.mjs`: przypadek e → `health` 503 bez `TopSecretPw9`; wpis w `docs/API_SPECIFICATION.md`.
5. `DemoSeeder` (R5) + test (AC8) w `packages/db/tests/`.
6. `smoke.mjs`: nagłówek R7 wszędzie; tryb `--production` (R6), zapisuje metody wysłanych żądań i kończy się błędem, gdy którakolwiek ≠ GET. Sprawdzenie: na `npm start` (`memory`, `ALLOW_DEMO_DATA=true`, `ALLOW_LOCAL_BASE_URL=true`) oba tryby przechodzą. README: popraw opis `npm run smoke` (pełny tryb zmienia dane: przełącza `active` wina, tworzy anulowane importy).

**Faza 2**
7. `.dockerignore`, `Dockerfile` (p. 1 Projektu). Sprawdzenie: `docker build --target runtime .` bez env; `docker run` bez env → kod 1.
8. `deploy/compose.example.yml` (p. 7 Projektu), `deploy/*.env` w `.gitignore`.
9. Job CI `image` (`.github/workflows/ci.yml`), PostgreSQL jako usługa, wszystkie żądania z `X-Wine-Match-Synthetic: 1`:
   - (a) AC6: brak `.env` w obu obrazach, `whoami` ≠ root; AC2: `runtime` bez `DATA_SOURCE` → kod 1.
   - (b) AC8: `migrator` `db:seed` bez `ALLOW_DEMO_DATA` → kod ≠ 0.
   - (c) AC7: baza A — `migrate` → `migration:pending` pusty → `restaurant:create` (`USER_PASSWORD` z sekretu jobu, dziedziczone) → `app` z `PUBLIC_BASE_URL=https://wine.example.test`, `AUTH_COOKIE_SECURE=false` (bez `ALLOW_LOCAL_BASE_URL` — dowód, że R4 przepuszcza poprawny adres) → `health` 200 → `smoke --production`.
   - (d) AC1 + AC3: baza B — `migrate` → `db:seed` z `ALLOW_DEMO_DATA=true` → `app` jak w (c) → pełny `smoke` → `/admin/halka/qr` (logowanie demo) zawiera `https://wine.example.test/r/halka`, `GET /api/v1/restaurants/halka/qr` = SVG 200.

**Faza 3**
10. `docs/DEPLOYMENT.md` (sekcja Runbook), README „Wdrożenie produkcyjne”, `.env.example` blok produkcji (`ALLOW_LOCAL_BASE_URL`, `DEMO_RESTAURANT_SLUG`), BC §4 (R4, nowa zmienna, rozszerzone `ALLOW_DEMO_DATA`).
11. Ręczna próba wg runbooka na czystej VM (AC1, AC7), dowody w logu przebiegu `.ai/runs/`.

## Grill log
| # | Pytanie | Odpowiedź | Zaakceptował |
|---|---|---|---|
| 1 | Jeden spec z trzema PR-ami zamiast podziału? | Tak (Q1) | agent-default |
| 2 | Wyjątek R4 przez nową `ALLOW_LOCAL_BASE_URL`, nie `AUTH_COOKIE_SECURE=false`? | Tak (Q6) | ⚠ owner |
| 3 | W produkcji wymagać `https://` (błąd, nie ostrzeżenie)? | Tak (R4) | ⚠ owner (część Q6) |
| 4 | Strażnik produkcji w `DemoSeeder`? | Tak (Q10, R5) | agent-default |
| 5 | Jawna zależność od E05-S01 i kolejność PR? | Tak (Q1) | agent-default |
| 6 | Wycofanie na produkcji = poprzedni obraz / poprawka w przód / `pg_dump`; `down` tylko w próbie? | Tak (Q11) | agent-default |
| 7 | Nagłówek `X-Wine-Match-Synthetic: 1` na ruchu syntetycznym? | Tak (Q12, R7) | agent-default |
| 8 | Dostawca hostingu? | VM w UE + Compose | ⚠ owner (Q2) |
| 9 | Hosty odrzucane przez R4: IP, jednoczłonowe, `.localhost/.local/.internal/.lan/.home.arpa`? | Tak | agent-default |
| 10 | `ALLOW_LOCAL_BASE_URL` w produkcji loguje `warn`? | Tak | agent-default |
| 11 | R4 obejmuje też `memory` + `ALLOW_DEMO_DATA=true`? | Tak | agent-default |
| 12 | Health bez klasy serwisu: port + `server/health.ts`, błąd kontenera → 503? | Tak (Q5) | agent-default |
| 13 | Nie buforować odrzuconej obietnicy kontenera/ORM? | Tak | agent-default |
| 14 | `HEALTHCHECK` = żywotność, 200 = gotowość? | Tak | agent-default |
| 15 | Osobne pliki env dla `migrate` i `app`, osobne role bazy zalecane? | Tak | agent-default |
| 16 | `USER_PASSWORD` przez `stty -echo; read` + dziedziczone `-e USER_PASSWORD`? | Tak | agent-default |
| 17 | `WORKDIR packages/app` + hoistowany `next`; build bez makiet? | Tak | agent-default |
| 18 | `DEMO_RESTAURANT_SLUG` wymagany przez runbook i smoke, nie przez `env.ts`? | Tak | agent-default |
| 19 | Sprawdzenie QR w CI: strona `/admin/halka/qr` + SVG 200 + test `guestUrl`? | Tak (AC3) | agent-default |
| 20 | AC7 w jobie `image` przez `restaurant:create`? | Tak | agent-default |
| 21 | `NODE_ENV=production` w `migrator` dopiero po `npm ci`? | Tak | agent-default |
| 22 | Runbook ostrzega, że migracja *contract* unieważnia powrót do poprzedniego obrazu? | Tak | agent-default |
| 23 | Poprawić opis smoke w README? | Tak | agent-default |
| 24 | Bramki: F1 kroki 1–2 czekają na Q6, F3 hosting na Q2? | Tak | agent-default |
| 25 | `smoke --production` sam pilnuje, że wysłał tylko GET? | Tak | agent-default |

## Changelog
- 2026-10-15 — draft (om-spec-writing --autonomous)
- 2026-10-15 — cross-model review (Sonnet 5.5): 15 accepted, 1 rejected. Accepted: Decision Q6 (osobna zmienna), Decision Q2 (zostaje ⚠), High seeder (Q10/R5), High Q6 fail-open + https + LAN (R4/AC4), Medium start command + build bez makiet, Medium health (503, reset bufora, liveness/readiness, test odzyskania), Medium zależność od E05-S01 + `restaurant:create`, Medium smoke a zdarzenia (R7), Medium uproszczenie sprawdzenia QR, Low osobne pliki env, Low wycofanie/contract/`down`, Low README smoke, Low R4 dla `memory`+demo, Low `DEMO_RESTAURANT_SLUG`, Low `USER_PASSWORD`; z Medium „scope cohesion” przyjęte uproszczenie health. Rejected: podział na osobne specy — fazy są już osobnymi PR-ami (Q1), a jeden plik trzyma wspólne decyzje (R4, Q11). Cross-spec: 1, 2, 3, 4, 5, 6, 7, 9, 10, 11 uwzględnione.
- 2026-10-15 — grill: 25 questions, 3 left for owner (Q2, Q6 obejmujące #2 i #3)

## Realizacja
(Uzupełnia agent po implementacji.)
