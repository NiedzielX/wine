---
started: 2026-11-10
ended: 2026-11-10
agent: Claude Code / claude-opus-5-5 (sub-agent)
spec: .ai/specs/2026-11-04-platform-quality-and-compliance.md (status in-progress; F3)
outcome: success (F3: R7–R9, AC5, AC7, AC8 met; AC6 partly, by decision D3; spec stays in-progress: F2, F4–F7 open). Committed locally, not pushed, no PR.
related: [.ai/runs/2026-11-04-e21-f1-metrics-and-logs.md]
---

# E21 F3: limity żądań (per klient, trasy publiczne i logowanie)

## Zadanie
Faza F3 specyfikacji E21 (risk: high, security): R7 (port `RateLimiter`, reguły w `core`, adapter w pamięci i PostgreSQL), R8 (klucz klienta HMAC, `TRUSTED_PROXY_HOPS`), R9 (429 + `Retry-After` w `handlePublic`, wydanie kodu, G9), AC5–AC8. Gałąź `feat/e21-f3-rate-limits` z `origin/main` (a5b6dff), worktree agenta. Bez pushu i PR.

## Przebieg
- Przeczytane: AGENTS.md, `.ai/lessons.md` (+ `schema-check-snapshot-per-database`, `mikro-orm-cli-in-nested-worktree`, `postgres-without-docker`, `config-fails-closed`), spec E21 (Q5–Q7, R7–R9, AC5–AC8, F3, Ryzyka, Realizacja F1), `docs/DEPLOYMENT.md` §6, `docs/OPERATIONS.md`, `docs/security/threat-model.md` (D1, D4, T-07, T-13), `server/api-auth.ts`, `container.ts`, `env.ts`, trasy logowania i menu, akcje logowania i G9.
- Środowisko: brak Dockera, PostgreSQL 16 z Homebrew na porcie 54371 (katalog w scratchpadzie, bez gniazda Unix: ścieżka za długa, `-k ''`); npm 10 w systemie, instalacja `npx -y npm@11.20.0 ci`; symlinki `@mikro-orm/*` do korzenia worktree (lekcja).
- `core`: `ratelimit/rules.ts` (reguły, `decide()`, `ruleForClient()`, `parseRateLimits()`), `ratelimit/rate-limit-guard.ts` (`RateLimitGuard`: zegar z zewnątrz, połowa limitu dla nieidentyfikowanego klienta, awaria magazynu przepuszcza z `warn`), port `RateLimiter` (`ports/runtime.ts`), `memory/rate-limiter.ts` (LRU, 10 000), kontrakt `testing/rate-limiter-contract.ts`, `env.ts` (`RATE_LIMIT_SECRET`, `TRUSTED_PROXY_HOPS`, `RATE_LIMITS`).
- `db`: encja `RateLimitBucket`, migracja `Migration20261110205126_rate_limit_bucket` (wygenerowana, przejrzana), `PgRateLimiter`, test `rate-limiter.integration.test.ts`. Snapshoty `_e2e` i `_test` po `migration:up` z CLI zostały przepisane w postaci znormalizowanej przez Postgresa (szum 158 linii); odtworzyłem je z HEAD i dopisałem tylko tabelę (102 linie w każdym z pięciu snapshotów), `schema:check` zielony na trzech bazach.
- `app`: `server/client-key.ts`, `server/rate-limit.ts`, `handlePublic(…, { rateLimit })` (pole obowiązkowe: nowa trasa publiczna musi wybrać regułę), trasy (login: `login`; menu, rekomendacje dania, stół: `public-api`), akcja logowania panelu, `issueCodeForPage`, strona i akcja G9, ostrzeżenia startu, teksty PL/EN, `RATE_LIMITS` hojne w `tests/unit/setup.ts` i w `global-setup.ts` e2e (cały zestaw to jeden nieidentyfikowany klient).
- Dokumentacja: `docs/API_SPECIFICATION.md` (429), `docs/DEPLOYMENT.md` (§4 zmienne, §6 sprzeczność usunięta, nginx `limit_req`), `docker-compose.yml`, `.env.example`, `docs/OPERATIONS.md`, `docs/DATA_MODEL.md`, `docs/security/threat-model.md` (TB2, D4, T-07, T-13), `dast-coverage.md`, `security-notes.md` §11, `packages/{core,db,app}/AGENTS.md`, backlog, CHANGELOG, spec (Realizacja F3). Scenariusze `.ai/qa/security/security-027…031` (po scaleniu z main przenumerowane z 018…022, które zajął PR 146; `check:qa` pilnuje teraz unikalności numeru w obszarze).

## Decyzje
Kopia w specyfikacji, sekcja Realizacja (D1–D9). Uzasadnienia:
- **D1 magazyn (Q5, R7):** AC5 wymaga kontraktu w pamięci i na PostgreSQL ze współbieżnością, więc oba adaptery; proxy zostaje warstwą ogólną (spec Q5 „obie warstwy”). `DEPLOYMENT.md` §6 kazał ustawić limity per trasa w proxy „do czasu E21 F3”: zastąpione opisem dwóch warstw.
- **D2 `TRUSTED_PROXY_HOPS` domyślnie 0:** Next.js nie daje trasie adresu gniazda, więc jedynym źródłem jest nagłówek; zaufanie domyślne pozwoliłoby klientowi bez proxy wybrać dowolny adres. Compose ustawia 1, bo port jest związany z `127.0.0.1` i runbook wymaga proxy. Przy 0 cała instancja to jeden klient z limitem o połowę (bezpieczne zamknięcie, start w produkcji ostrzega). Wpis N-ty od prawej, bo nginx `$proxy_add_x_forwarded_for` dopisuje na końcu, a lewa część pochodzi od klienta.
- **D3 sekret opcjonalny:** zlecenie zabrania nowej wymaganej zmiennej (UPGRADE_NOTES), AC6 chciał kodu 1. Wybrałem losowy klucz procesu + ostrzeżenie: limity działają od pierwszego startu po aktualizacji, ceną jest osobne liczenie instancji do czasu ustawienia sekretu.
- **D5 awaria magazynu przepuszcza:** spec Q7 wprost („awaria limitera nie może wyłączyć logowania ani strony”); konfiguracja natomiast zawodzi zamykająco (`RATE_LIMITS`, `TRUSTED_PROXY_HOPS`, krótki sekret = kod 1).
- **D6 formularz logowania:** prawdziwe drzwi logowania to akcja serwerowa `/admin/login`; limit tylko na API dałoby się obejść. Wspólny licznik z trasą (test).
- **D7 nagłówek syntetyczny:** dowolny klient może go wysłać, więc nie może omijać kontroli bezpieczeństwa.
- **D8 HSTS:** decyzja właściciela D1 (2026-11-07) jest późniejsza niż spec i przypisuje HSTS do proxy.
- Ochrona pamięci: LRU w pamięci; na PostgreSQL usuwanie wierszy > 2 dób przy trafieniu, najwyżej raz na 10 minut na proces (do czasu rejestru retencji F4).

## Weryfikacja
- `npm run lint`: 0 uwag. `npm run typecheck`: czysto.
- `npm test`: core 757, db 126, ui 62, app 519, testkit 534: zielone.
- `npm run test:db` (PostgreSQL 16, `TEST_DATABASE_URL`): 8 plików, 210 testów zielone (w tym kontrakt limitera, 10 połączeń naraz, sprzątanie, roundtrip migracji).
- `schema:check` na `winematch`, `winematch_test`, `winematch_e2e`: „No changes required”.
- `npm run build`: OK (w tym `check:boundaries`, `check:design`). `npm run boot:check`: All boot checks passed.
- `check:routes` OK (25 handlerów), `check:boundaries` OK, `check:qa` 110 scenariuszy OK, `check:context` 0 błędów (9 ostrzeżeń o rozmiarze specyfikacji, wcześniejsze), `secrets:scan` OK (21 trafień, wszystkie na allowliście), `release:notes -- check` OK, `audit:process` PASS 46 / FAIL 6 / PARTIAL 1 (FAIL: TEST-04, TEST-05, TEST-06, SEC-08, REL-04, PROD-02: wszystkie niezwiązane, bez nowych).
- `check:pages`: **nie istnieje** w `package.json` (brak takiego skryptu).
- e2e: `rate-limits`, `health`, `observability` (10 testów) zielone; pełny zestaw: 71 zielonych, 39 pominiętych, 11 plików czerwonych wyłącznie z powodu braku `agent-browser` lokalnie (`spawn agent-browser ENOENT`): testy z przeglądarką nie uruchomione. Tabela `rate_limit_bucket` po pliku e2e porównana z wcześniejszą: identyczna.
- Dowody mutacyjne: (1) `decide()` z `allowed: true` zamiast `count <= r.limit`: 7 testów core czerwonych, 5 z 6 testów PostgreSQL czerwonych; (2) usunięte `if (!decision.allowed) return tooManyRequests(decision)` w `handlePublic`: 8 z 18 testów app czerwonych. Po przywróceniu zielone.
- Uruchomienie zbudowanej aplikacji (`next start`, `TRUSTED_PROXY_HOPS=1`, `RATE_LIMITS=public-api=2/60,login=2/600`): memory i postgres: menu 200, 200, 429 (`Retry-After`), health 200, strona gościa 200, logowanie 422, 422, 429; adres IP nie pojawia się w logu; start ostrzega o braku `RATE_LIMIT_SECRET`. Wiersze z próby usunięte z lokalnej bazy.
- Niewykonane: `npm run smoke` na żywym serwerze, testy z przeglądarką (brak `agent-browser`), UI G9 przy 390 px (zmiana to jeden komunikat w istniejącym miejscu), obciążenie.

## Po scaleniu z main (2026-11-11)
- Koordynator scalił `origin/main` (z #146) do gałęzi. Moje scenariusze security-018…022 kolidowały numerami z #146: przenumerowane na 027…031 (pliki, `id`, INDEX.md, ten log). `scripts/check-qa-scenarios.mjs` ma nowe sprawdzenie (e): numer jest unikalny w obszarze; test w `packages/testkit/tests/check-qa-scenarios.test.ts` był czerwony przed zmianą skryptu, a test „repozytorium przechodzi” był czerwony do przenumerowania.

## Poprawki po dwóch review PR #148 (2026-11-11)
Oba review: „approve with changes”, bez blokera. Każda testowalna poprawka najpierw czerwona:
1. **Granica magazynu (MEDIUM):** sufit `RATE_LIMIT_MAX_CLIENTS` (domyślnie 10 000) klientów na regułę i okno; powyżej każdy nowy klient liczy się do wspólnego `~overflow` z tym samym limitem (`degraded`), licznik klientów okna w wierszu `~clients`; wiersze żyją jedno okno (sprzątanie reguły raz na minutę na proces) zamiast dwóch dób. Ta sama semantyka w `MemoryRateLimiter`. Kontrakt: nowy przypadek „ceiling” (pamięć i PostgreSQL); test PG: 300 nowych klientów przy suficie 20 → ≤ 22 wiersze, nadmiar ograniczony (5 dozwolonych). Czerwone na starym adapterze (4 z 9 testów PG), zielone po zmianie.
2. **Błąd sprzątania nie zmienia decyzji:** `cleanUp` łapie błąd, loguje `rate limit clean-up failed`, ponowna próba po 10 s, harmonogram przesuwa się o pełną minutę dopiero po sukcesie (test z EntityManagerem, którego `delete` rzuca).
3. **`countingUnit`:** adres ze strefą (`%`) odrzucany (był liczony jako `0:0:0:0::/64`); IPv4 z zerami wiodącymi odrzuca już `isIP` (test to utrwala, także w formie IPv4-mapped).
4. **Ostrzeżenia limitera najwyżej raz na minutę na proces:** `LogThrottle` (core, zegar z zewnątrz), jedna instancja w kontenerze; test: 100 awarii = 1 linia, następna po 60 s.
5. **Dokumentacja:** `DEPLOYMENT.md` §4 (oba błędy `TRUSTED_PROXY_HOPS` z dokładnym skutkiem, wdrożenie bez Compose musi ustawić hops, mnożnik instancji bez sekretu, `RATE_LIMIT_MAX_CLIENTS`), §6 (`limit_req_status 429`, NAT lokalu a burst), §8 (wiersz „Limity żądań”: port nieosiągalny z zewnątrz i 25 logowań z losowym `X-Forwarded-For` → 429 po 20), komentarze `docker-compose.yml`, `.env.example`, `OPERATIONS.md` (sufit, NAT sali a `code-mark`/`code-issue`, metryka), model zagrożeń T-07/T-13, `DATA_MODEL.md`, AGENTS pakietów. Specyfikacja: D10–D12 i „Do potwierdzenia przez właściciela” (D2, D3).
- e2e: po teście tabela odtwarzana z migawki w całości (aplikacja testu zwiększa też `~clients` i sprząta zakończone okna cudzych wierszy).
- Weryfikacja po poprawkach: `test:db` 213 zielonych (PostgreSQL 16 lokalnie), `npm test` core 762, db 126, ui 62, app 520, testkit 676; lint, typecheck, `build`, `check:context` (0 błędów), `check:qa` (119), `check:routes`, `check:pages`, `check:boundaries`, `secrets:scan`, `release:notes -- check` zielone; snapshoty migracji bez zmian; e2e `rate-limits`, `health`, `observability` 10 zielonych (tabela odtworzona i porównana).
- Dowody mutacyjne na nowym kodzie: `decide()` z `allowed: true`: 8 testów core i 8 z 9 PG czerwonych; sufit wyłączony (`degraded = false && …`): 2 testy PG czerwone (kontrakt i zalew); sprzątanie bez `try/catch`: test awarii sprzątania czerwony; bez odrzucania `%` w `countingUnit`: test stref czerwony. Po przywróceniu zielone.

## Delta review 7bb42b4 (2026-11-11): tylko dokumentacja
Akceptacja z uwagami niskimi; bez zmian logiki. (A) zawyżenie `~clients` przez równoległe pierwsze trafienia jednego klienta (do N, nie „dwa razy”): poprawione w opisie klasy `PgRateLimiter`, D10, `OPERATIONS.md`, T-13; nowy test PG dokumentuje granicę (10 równoległych pierwszych trafień: 1 ≤ `~clients` ≤ 10, własny licznik dokładnie 10). (B) rozjazd zegarów instancji a sprzątanie (tylko łagodniej): wiersz NTP w `DEPLOYMENT.md` §4. (C) parzystość pamięci z PostgreSQL doprecyzowana (wspólne LRU 10 000 dla wszystkich reguł, wyparty klient wraca jako nowy). (D) wariant nieidentyfikowany dzieli `~overflow` z identyfikowanym: kolejność decyduje (D10, OPERATIONS, T-13, opis klasy). (E) założenie „nikt inny nie używa limitera w czasie pliku e2e” w komentarzu testu i w pięciu scenariuszach QA.

## CI e2e na 667da80 (2026-11-11)
`access-boundaries-guest` i `-writes` (z #146) padły na `assertTablesCovered()`: nowa tabela `rate_limit_bucket` poza skrótem. Słusznie: liczniki zmienia każde publiczne żądanie (także odrzucone), więc nie mogą być w skrócie „żądanie niczego nie zmieniło”. `packages/app/tests/e2e/boundaries.ts`: jedna jawna lista `NOT_DIGESTED` z powodem; `assertTablesCovered()` przyjmuje tabelę spoza `TABLES` tylko z tej listy i pilnuje, że lista nie jest nieaktualna ani nie nakłada się na `TABLES`; pozostałe tabele nadal są w skrócie. Zawartość `rate_limit_bucket` (tylko skróty z kluczem) sprawdza `rate-limits.e2e`. Inne pliki e2e: aplikacja współdzielona ma limity 1 000 000/s (`global-setup.ts`), dodatkowe aplikacje (`health`, `showcase`) wysyłają po kilka żądań, poniżej połowy limitów domyślnych. Lokalnie pełny zestaw e2e: 15 plików zielonych (wszystkie bez przeglądarki, w tym cztery `access-boundaries*` i `rate-limits`), 11 czerwonych wyłącznie przez brak `agent-browser` (`spawn agent-browser ENOENT`).

## Dług i uwagi
- Retencja `rate_limit_bucket` jako wpis w rejestrze F4 (dziś sprzątanie w adapterze).
- Bez `RATE_LIMIT_SECRET` instancje liczą osobno; rozważyć wymaganie sekretu w kolejnym wydaniu łamiącym (z notą w UPGRADE_NOTES).
- `pin-login` czeka na E12 (PIN kelnera). Zdarzenia użycia gościa bez osobnej reguły.
- Okno stałe dopuszcza 2× limit na granicy okna; ewentualne okno przesuwne to osobna zmiana.
- Brak lekcji: nic nowego poza istniejącą lekcją o snapshotach (potwierdzona ponownie).
