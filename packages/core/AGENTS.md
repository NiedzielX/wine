# packages/core — AGENTS.md

Zasady ogólne: `../../AGENTS.md` (§1.2–1.3 i §7). Tu tylko to, co dotyczy tego pakietu. Szczegóły architektury: `../../.ai/docs/architecture-rules.md`.

**Co tu jest:** typy domenowe (`src/domain`), deterministyczny silnik (`src/engine`), porty repozytoriów (`src/ports`), serwisy aplikacyjne (`src/services`), repozytoria w pamięci (`src/memory`), dane demo Halka (`src/demo`), kontrakt repozytoriów dla testów (`src/testing`).

**Zasady:**
- Kod musi działać w przeglądarce i w Node: tylko ES2023, bez `node:*`, DOM ani bibliotek frameworków. Globalne API wspólne dla obu środowisk deklaruj w `src/globals.d.ts`.
- Silnik to czyste funkcje: te same dane wejściowe → ten sam wynik, remisy rozstrzygane jawnie (np. po `id`). Zmiana reguł, wag lub progów wymaga specyfikacji, testu i `npm run engine:matrix`.
- Serwis = klasa z zależnościami w konstruktorze (`constructor(deps: XServiceDeps)`), typ zależności to `Pick<Repositories, ...>`. Serwis nie wie o Awilix ani o bazie.
- Nowa metoda portu: dopisz przypadek do `src/testing/repository-contract.ts`, implementację w `src/memory` i w `packages/db/src/repositories`.
- **Walidacja wejścia:** `src/validators/<pojęcie>/<nazwa>.schema.ts` (Zod, `strictObject`), `parseWith()` zamienia błąd schematu w `ValidationError` z `fields`. Schemat jest jedynym źródłem dla trasy i (w przyszłości) formularza klienta. Słowniki z kluczami od klienta budujemy `Map` / `Object.fromEntries`.
- **Logowanie i konfiguracja bez I/O:** `src/logging` (`createLogger`, `redact`; wzorce sekretów w tekście i klucze wrażliwe), `src/config/env.ts` (`parseEnv`, Zod; zawodzi zamykająco). `core` niczego nie drukuje: ujście logów daje aplikacja.
- **Pojęcia:** `src/services/<pojęcie>/` (`analytics`, `catalog`, `dashboard`, `guest`, `opportunities`, `pairings`, `publishing`, `recommendations`, `restaurants`, `sales` — typy sprzedaży z POS, czyste `aggregateChecks` / `computeSalesKpis` i `SalesKpiService` (`getSalesKpis` / `dataRange`, kontrakt dla E04; okres przez `salesPeriodSchema` w `validators/sales`)); `auth/` i `import/` to osobne foldery z własnym serwisem i typami. Czyste reguły kodu polecenia (format, dzień serwisu) leżą w `recommendation-code/`.
- Uwierzytelnianie: `src/auth` (`AuthService`, `permissions.ts`, typy) i porty `AuthRepository`, `PasswordHasher`, `SessionTokens`. Brak `node:crypto` w `core` — implementacje w `@wine-match/db/auth`. Każda klasa błędu ustawia `this.name` jako literał (nie `new.target.name`).
- Publiczne API pakietu = `src/index.ts`. Eksportuj tam wszystko, czego używają inne pakiety.

**Testy:** `npm test -w @wine-match/core` (`tests/engine.test.ts`, `tests/services.test.ts`).
