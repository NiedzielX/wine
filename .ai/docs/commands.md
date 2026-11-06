# Polecenia

Przeniesione z `AGENTS.md` §1.5 bez zmiany treści.

### 1.5 Polecenia

| Polecenie | Do czego |
|---|---|
| `npm install` | instalacja całego monorepo (wymaga npm ≥ 11.6 — npm 10 nie zainstaluje Vitest 5) |
| `npm run dev` | aplikacja Next.js (`DATA_SOURCE` z `.env`) |
| `npm run dev:mockups` | statyczne mockupy |
| `npm run lint` | `oxlint`: brak `any`, pustych `catch`, `console.*`, ograniczenia importów między pakietami (bramka jakości; w CI) |
| `npm run typecheck` | TypeScript we wszystkich pakietach |
| `npm test` | testy jednostkowe wszystkich pakietów z raportem pokrycia (bez progu; `npm test` pada tylko na nieudanym teście) |
| `npm run test:db` | testy integracyjne na PostgreSQL: sam startuje kontener (testcontainers), albo bierze serwer z `TEST_DATABASE_URL` (lokalnie bez Dockera) |
| `npm run test:e2e` | testy end-to-end: zbudowana aplikacja na PostgreSQL, sterowana przez `agent-browser` 0.39.1 (strona główna, panel). Wymaga `npm run build` i `agent-browser` w `PATH` (lub `AGENT_BROWSER_BIN`) |
| `npm run check:boundaries` | granice pakietów |
| `npm run audit:gate` | audyt zależności produkcyjnych: wysokie i krytyczne blokują, wyjątki tylko jawne i z terminem (`scripts/audit-gate.mjs`) |
| `npm run secrets:scan` | skan sekretów w plikach śledzonych przez git, bez zależności: wzorce kluczy, tokenów, connection stringów z hasłem; wyjątki tylko w `scripts/secret-scan.allowlist.json`, każdy z powodem i skrótem wartości; wartości nigdy nie są drukowane; w CI job `secrets` |
| `npm run check:context` | rozmiary i spójność plików, które agent wczytuje: budżety `AGENTS.md` (root, pakiety, łańcuch Codex 32 KiB), `.ai/lessons.md`, `.ai/docs`, opisy i długość `SKILL.md`, ścieżki w bloku routingu, importy `CLAUDE.md`, linki lekcji, nazwy plików w `.ai/`, odwołania `AGENTS.md §N`, polecenia `npm run …` z instrukcji istnieją w `package.json`; kod 1 przy błędzie, ostrzeżenia nie przerywają; tokeny to szacunek (bajty/3,5), pomiar to `/context all`; w CI w jobie `lint` (`scripts/check-context.mjs`) |
| `npm run verify:regression -- <test> [--base origin/main] [--markdown]` | dowód naprawy błędu: test(y) poprawki uruchomione na kodzie sprzed poprawki (muszą paść) i po niej (muszą przejść); pliki poprawki cofa do bazy i przywraca w `finally`; wymaga czystego drzewa i zacommitowanej poprawki z testem; testy integracyjne potrzebują PostgreSQL jak `test:db`; `--markdown` daje blok do opisu PR (`scripts/verify-regression.mjs`) |
| `GET /api/v1/metrics` | metryki procesu (Prometheus, `METRICS_TOKEN`, domyślnie 404); test e2e `observability.e2e.test.ts` uruchamia aplikację z tokenem testowym |
| `npm run boot:check` | start zbudowanej aplikacji bez bazy: zła konfiguracja zatrzymuje serwer, demo tylko świadomie, ogólne 500 bez sekretów (po `npm run build`) |
| `npm run smoke -- <url> <slug>` | smoke test uruchomionej aplikacji: strony gościa, panel (po zalogowaniu kontem demo), uwierzytelnianie, uprawnienia, API; domyślnie `http://localhost:3000 halka`. **Zmienia dane** (przełącza `active` wina, tworzy anulowane importy): tylko instancja próbna |
| `npm run smoke -- --production <url> <slug>` | smoke prawdziwej instalacji: wyłącznie GET, bez logowania, bez zależności od treści menu (health, `/`, `/r/{slug}`, kształt API menu, `/admin/login`, 401 dla trasy z sesją, nagłówki); skrypt sam odmawia innej metody. Oba tryby wysyłają `X-Wine-Match-Synthetic: 1` (`scripts/lib/synthetic-fetch.mjs`, test w `packages/testkit/tests/smoke-script.test.ts`) |
| `npm run smoke -- --showcase <url>` | smoke publicznego kalkulatora (E22 F1): tylko GET, instancja z `SHOWCASE_MODE=calculator`; `/demo/roi` PL i EN, link z liczbami, niepoprawne wartości, `/demo/roi/summary`; wymaga słowa „założenie”, braku „AI”, `noindex`, `no-store` i braku cookie |
| `npm run user:create -- --email … --name … --role … --restaurant …` | tworzy konto do panelu (hasło z `USER_PASSWORD`, min. 12 znaków) |
| `npm run restaurant:create -- --name … --slug … --address … --city … --wine-director … --owner-email … --owner-name … [--allow-existing-account]` | zakłada restaurację (`onboarding`) i jej właściciela (rola `owner`) w jednej transakcji na PostgreSQL, bez danych demo; wymaga `DATABASE_URL` i zastosowanych migracji, hasło z `USER_PASSWORD` (min. 12 znaków); kod 1 przy każdym błędzie |
| `npm run build` | granice + build mockupów i aplikacji (z typecheckiem Next.js) |
| `npm run engine:matrix` | przegląd kalibracji silnika: najlepsze wina dla każdego dania demo |
| `npm run db:migration:create` / `db:migrate` / `db:seed` | migracje i dane demo |

Skrypty npm uruchamiają się przez `/bin/sh`, który na Linuksie bywa `dash`: w skryptach i poleceniach powłoki **NIE używaj bashizmów** (`{a,b}`, `${PIPESTATUS}`, `[[ ]]`, `time`). Pisz POSIX albo skrypt Node (`scripts/*.mjs`).

## Testy: wykluczenia z pokrycia i miejsce testów

Przeniesione z `AGENTS.md` §7 bez zmiany treści.

- **Wykluczenia z raportu pokrycia są jawne, w konfiguracji każdego pakietu** (`vitest.config.ts`), z uzasadnieniem: pliki stron i komponentów React (`app/src/app/**.tsx`, pokrywa je E2E), kod shadcn/ui, pakiet `mockups` (prototyp do wycofania), wspólne zestawy testów (`core/src/testing`), repozytoria i encje (pokrywa je `test:db`). Nowe wykluczenie wymaga zgody właściciela.
- **Gdzie piszemy testy:** `core/tests/` (logika domeny), `db/tests/` (bez bazy: `*.test.ts`; z bazą: `*.integration.test.ts`), `app/tests/unit/` (trasy API, akcje, serwer), `app/tests/e2e/` (przeglądarka), `ui/tests/`, `testkit/tests/` (narzędzia testowe i skrypty repozytorium: hook agenta, skaner sekretów, `check:context`).

## Środowisko testowe

Jedna komenda stawia jednorazowe środowisko do testów ręcznych i agentowych (skill `om-prepare-test-env`, skrypty POSIX `sh`).

| Polecenie | Do czego |
|---|---|
| `npm run test-env:up` (`sh .ai/scripts/test-env-up.sh`) | stawia środowisko albo podłącza się do działającego; wypisuje `TEST_ENV_BASE_URL=…` i zapisuje deskryptor `.ai/qa/test-env.json` |
| `npm run test-env:down` (`sh .ai/scripts/test-env-down.sh`) | zatrzymuje dokładnie to, co uruchomił `up` (aplikację, kontener albo bazę); można uruchomić dwa razy |

- **Co powstaje:** świeża baza PostgreSQL z prawdziwymi migracjami, dane demo (`halka`) i druga restauracja `bistro-e2e` z polecenia operatora (jak w `packages/app/tests/e2e/global-setup.ts`), potem ZBUDOWANA aplikacja na wolnym porcie `127.0.0.1` z `DATA_SOURCE=postgres`, `AUTH_COOKIE_SECURE=false`, `ALLOW_DEMO_DATA=true`.
- **Baza:** gdy działa Docker, kontener `postgres:16` na losowym porcie (`wm-qa-pg-<runId>`); w przeciwnym razie nowa baza `winematch_qa_<runId>` na serwerze z `TEST_DATABASE_URL` (ta sama zmienna musi być ustawiona przy `down`, który usuwa tę bazę i nie rusza innych). Wynik mówi, którą drogą poszło: `TEST_ENV_DATABASE=docker|TEST_DATABASE_URL`.
- **Szybka ścieżka:** `npm run build` tylko gdy zmieniły się źródła (cache `.ai/qa/test-env-build-cache.json`, wymuszenie: `--force-rebuild`). Drugie `up` używa działającego środowiska (żywy proces, sondy HTTP, logowanie kontem demo, wiek ≤ `TEST_ENV_CACHE_TTL_SECONDS`, domyślnie 600 s, brak nowszych źródeł); `--force` stawia od nowa.
- **Dane logowania:** deskryptor wskazuje zmienne (`TEST_SOMMELIER_PASSWORD` …) w gitignorowanym `.ai/qa/test-env.env`; wartości to publiczne hasła demo, nie przepisuj ich do plików śledzonych.
- **Stan lokalny, poza gitem:** `.ai/qa/test-env.json`, `test-env.env`, `test-env-build-cache.json`, `test-env-app.log`, `test-env.lock/`.
