# Reguły architektury — szczegóły

Przeniesione z `AGENTS.md` (§1.2–§1.4, §1.6) bez zmiany treści. Czytaj przed zmianą w kodzie aplikacji; niezmienniki „zawsze” są w `AGENTS.md` §1 i §7.

### 1.2 Pakiety i kierunek zależności

```
packages/
├─ core     domena, silnik, porty repozytoriów, serwisy, dane demo   (zależy od: nic)
├─ db       MikroORM: encje, konfiguracja, migracje, seedery, repozytoria   (→ core)
├─ ui       komponenty shadcn/ui, komponenty marki, motyw panelu   (→ nic z projektu)
├─ app      Next.js: strony gościa, panel, API, kompozycja DI   (→ core, db, ui)
└─ mockups  statyczne mockupy Vite do pokazów   (→ core)
```

Każdy pakiet ma własny `AGENTS.md` ze szczegółami — **przeczytaj go przed zmianą w pakiecie**.

Granice, sprawdzane automatycznie przez `npm run check:boundaries` (część `npm run build`):
- `core` **NIE importuje** React, Next.js, MikroORM, `pg`, Awilix, `node:*` ani innych pakietów projektu. Działa w przeglądarce i w Node.
- `db` nie importuje React, Next.js, Awilix, `ui` ani `app`. Encje MikroORM **nie wychodzą** poza `db` — repozytoria zwracają typy domenowe z `core`.
- `ui` nie importuje `core`, `db`, `app`, Next.js ani MikroORM.
- W `app/src/app` (strony, layouty, route handlery) nie importuj `@wine-match/db` ani `@mikro-orm/*` — dostęp do danych wyłącznie przez serwisy z kontenera DI.
- Strony gościa (`app/src/app/(guest)`) nie używają shadcn/ui: wolno im importować z `@wine-match/ui` tylko `@wine-match/ui/brand/*`.

Pakiety wewnętrzne eksportują źródła TypeScript (bez kroku build); Next.js kompiluje je przez `transpilePackages`. Nie dodawaj `dist/` ani `tsc --build` do pakietów wewnętrznych.

### 1.3 Logika, dane i Dependency Injection

- **Logika biznesowa żyje w `core`:** czysty silnik (`core/src/engine`) i serwisy aplikacyjne (`core/src/services`). Strony i route handlery tylko parsują wejście, wołają serwis i renderują wynik — nie wołają silnika ani repozytoriów bezpośrednio.
- **Porty i adaptery:** dostęp do danych przez interfejsy z `core/src/ports`. Implementacje: w pamięci (`core/src/memory`, dane demo) i PostgreSQL (`db/src/repositories`). Źródło wybiera zmienna `DATA_SOURCE=memory|postgres`.
- **Izolacja tenantów jest częścią kontraktu:** każda metoda repozytorium poza wyszukaniem restauracji po slugu przyjmuje `restaurantId`. Nie dodawaj zapytań bez zakresu restauracji.
- **Kontrakt repozytoriów:** każda implementacja portów przechodzi `repositoryContract` z `core/src/testing`. Nowa metoda portu = nowy przypadek w kontrakcie + implementacja w pamięci i w PostgreSQL.
- **Awilix:** jedyny root kompozycji to `app/src/server/container.ts`. Klasy dostają zależności przez konstruktor jako obiekt (`constructor(deps: { dishRepository: DishRepository })`), bez dekoratorów i bez importu Awilix poza `app`. Czasy życia: singleton — ORM i pula połączeń; scoped — `em` (fork), repozytoria i serwisy. Serwisy rozwiązuj **z zakresu żądania** (`getRequestScope()` w komponentach serwerowych, `createRequestScope()` + `dispose()` w route handlerach), nigdy z kontenera głównego.
- **Zapisy (komendy):** wyłącznie przez serwisy z `core` (`SommelierService`, `PublishService`), które planują zmianę czystymi regułami (`pairing-rules.ts`) i zatwierdzają ją atomowo przez port zapisu. Każda komenda przyjmuje `actor` (autor w historii decyzji) i opcjonalnie `expectedVersion`; błędy to `DomainError`, zgłaszane jako odrzucona obietnica. Goście czytają **opublikowaną migawkę** (`listPublished*`), panel dane bieżące (`list*`) — nowa funkcja dla gości używa wersji opublikowanej. Szczegóły: lekcja `write-path-conventions`. Dwa wyjątki od konwencji komend (zatwierdzone 2026-10-15): (1) **telemetria** — zapis zdarzeń użycia (`UsageEventService`, spec `2026-10-15-guest-usage-events`) nie jest komendą: bez `actor`, `expectedVersion` i `DomainError`, a błąd zapisu tylko trafia do `logger`. Ten sam wyjątek obejmuje (zatwierdzone 2026-10-16, spec `2026-10-16-recommendation-code` Q7) **wydanie kodu polecenia** (`RecommendationCodeService.issue`) — zapis w renderze strony (G8), który zwraca wartość: bez `actor` i `expectedVersion`, każda przeszkoda daje `null`, a błąd lub przekroczony czas zapisu (`issueCodeForPage`) tylko `logger.warn`, nigdy inny status strony; oznaczenie kodu „Zamówione”/„Cofnij” pozostaje komendą (`actor`, `DomainError`); (2) **polecenia operatora** w `packages/db/scripts/` (`user:create`, `restaurant:create`, seedery) mogą pisać bezpośrednio przez MikroORM, bez portu i `actor` — nigdy kod uruchamiany przez aplikację.
- **Uwierzytelnianie i uprawnienia:** sesje i blokada konta w `core` (`AuthService`), uprawnienia w jednej tabeli (`core/src/auth/permissions.ts`: `can()` / `authorize()`), skróty haseł (scrypt) i tokeny w `@wine-match/db/auth`. **Każde drzwi sprawdzają same:** layout panelu (`requireAccess`), akcje serwerowe (`authorizeAction`), route handlery (`handle()`); ukrycie przycisku w UI nie jest zabezpieczeniem. Błędów domenowych w `app` nie rozpoznajemy przez `instanceof` (tylko `domainError()`; pilnuje tego `check:boundaries`). Konta demo mają publiczne hasło i istnieją tylko w danych demo; prawdziwe konta: `npm run user:create`. Szczegóły: lekcje `auth-conventions`, `nextjs-duplicate-module-instanceof`.
- **Import:** logika (mapowanie kolumn PL/EN, normalizacja, walidacja, plan zapisu, `ImportService`) w `core/src/import`; parsery plików (CSV, XLSX na `fflate`, PDF na `unpdf`) w `@wine-match/db/import` — osobne wejście bez MikroORM, `core` nie ma bibliotek plikowych. Typ pliku po zawartości, plik **nie jest przechowywany**, zatwierdzenie atomowe i jednorazowe. Parsery testujemy na prawdziwych plikach z `packages/db/tests/fixtures`. Szczegóły: lekcja `import-conventions`.
- **QR:** adres `PUBLIC_BASE_URL/r/{slug}`; ustaw `PUBLIC_BASE_URL` przed drukiem kodów, a zmiana sluga unieważnia wydrukowane kody.
- **MikroORM:** encje przez `defineEntity` (bez dekoratorów i `reflect-metadata`). Każda zmiana encji wymaga migracji (`npm run db:migration:create`) w tym samym przebiegu; ręcznie wolno tylko dopisać kod do wygenerowanej migracji. Zastosowanych migracji nie edytuj. `npm run schema:check -w @wine-match/db` musi zgłaszać zgodność schematu.

### 1.4 Frontend

- **Strony gościa:** Tailwind CSS z motywem `app/src/app/(guest)/guest.css`, mobile-first, komponenty serwerowe; filtry jako linki i parametry URL, tak aby działały bez JavaScriptu.
- **Panel:** komponenty shadcn/ui z `@wine-match/ui` i motyw `@wine-match/ui/styles.css`, desktop-first. Nowy komponent shadcn dodawaj do `packages/ui` (`npx shadcn add <komponent>` w `packages/ui`), nie kopiuj go do `app`.
- Gość i panel mają **osobne layouty główne** (grupy tras `(guest)` i `(admin)`), żeby motywy się nie mieszały. Nie dodawaj `src/app/layout.tsx`.
- Fonty wyłącznie lokalnie (`@fontsource-variable/*`). **NIE WOLNO** używać `next/font/google` ani zasobów z CDN.
- Komponenty klienckie (`'use client'`) tylko tam, gdzie potrzebna jest interakcja; nie importują nic z `app/src/server`.

### 1.6 Standardy inżynieryjne

Pełny dokument, z mapowaniem każdej reguły z oryginału (który opisuje inny produkt, DevMentor): **`.ai/docs/engineering-standards.md`**. Najważniejsze, co musisz wiedzieć pisząc kod:

- **Konwencja pojęć domenowych.** Kod nie jest dzielony na `modules/`. Każde pojęcie (`auth`, `catalog`, `pairings`, `publishing`, `restaurants`, `imports`, `guests`) to podkatalog o tej samej nazwie w warstwach, które go potrzebują: `core/src/services/<pojęcie>/`, `core/src/validators/<pojęcie>/`, `db/src/entities/<pojęcie>/`. Tworzysz go dopiero z pierwszym plikiem, nigdy pustego. To konwencja katalogów, nie system modułów: brak `setup.ts`, ACL-i i automatycznego wykrywania.
- **Warstwa API w `app/src/server/`.** Każda trasa to `handle()` (z sesją) lub `handlePublic()` (bez), a ciało żądania wchodzi **wyłącznie** przez `parseBody(req, schemat)` ze schematem Zod z `core/validators/` (obiekty `strictObject`: nieznane pole = 422). Trasa nie ma własnego `try/catch`: błędy mapuje jedno `guarded()`. Błędy domenowe rozpoznajemy przez `domainError()`, nigdy `instanceof`.
- **Logowanie tylko przez `logger`** (`server/logger.ts`), który redaguje sekrety. `console.*` jest zabronione (`npm run lint`).
- **Konfiguracja tylko przez `env()`** (`server/env.ts`), czytana leniwie; `next build` nie może wymagać środowiska ani bazy. Konfiguracja decydująca o tym, kto co zobaczy, zawodzi zamykająco (`DATA_SOURCE` jest jawne w produkcji, demo w produkcji wymaga `ALLOW_DEMO_DATA=true`).
- **Klucze wybierane przez klienta nie trafiają do zwykłego obiektu jako słownika** (`constructor`, `__proto__`): użyj `Map` lub `Object.fromEntries`.
- **Stany pusty / błąd / ładowanie:** `EmptyState`, `ErrorMessage`, `LoadingMessage` z `@wine-match/ui`, nie własny kod strony.
