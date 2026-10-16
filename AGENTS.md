# AGENTS.md — zasady pracy agentów AI w projekcie Wine Match

Ten plik obowiązuje każdego agenta AI (Claude Code, Codex, Cursor, Copilot, Aider i inne) pracującego w tym repozytorium. Jest **jedynym źródłem prawdy** o procesie pracy; `CLAUDE.md` go importuje. Słowa **MUSISZ / NIE WOLNO / POWINIENEŚ** mają znaczenie normatywne.

## 1. Projekt i architektura

Wine Match: platforma B2B2C rekomendacji win dla restauracji — aplikacja gościa (mobile-first), panel sommeliera i restauracji (desktop-first) oraz REST API na wspólnym, deterministycznym silniku dopasowań. Dokumentacja produktu: `docs/`, opis architektury i uruchomienie: `README.md`. Decyzje architektoniczne: `.ai/specs/implemented/2026-10-14-monorepo-nextjs-architecture.md`.

### 1.1 Stos technologiczny

| Obszar | Technologia | Wersja |
|---|---|---|
| Aplikacja | Next.js (App Router, Turbopack), React | 16.3.7, 19.3.0 |
| Język | TypeScript (natywny kompilator) | 7.0.2 |
| Baza danych | PostgreSQL + MikroORM (migracje, seedery, pula połączeń) | PG ≥ 16, MikroORM 7.2.2 |
| Dependency Injection | Awilix (tryb `PROXY`) | 13.0.5 |
| CSS | Tailwind CSS (strony gościa) / shadcn/ui na Tailwind (panel) | 4.3.3 / new-york-v4 |
| Testy | Vitest | 5.0.2 |
| Monorepo | npm workspaces | npm ≥ 11.6, Node ≥ 22.17 |

**MUSISZ** trzymać się tego stosu. Nowa biblioteka, zmiana wersji głównej albo zamiana narzędzia (np. inny ORM, kontener DI, biblioteka komponentów, pnpm) wymaga specyfikacji (§3). Wersje są przypięte dokładnie (`.npmrc`: `save-exact`); nowe zależności wybieraj spośród wydań opublikowanych co najmniej 14 dni temu.

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
- **Zapisy (komendy):** wyłącznie przez serwisy z `core` (`SommelierService`, `PublishService`), które planują zmianę czystymi regułami (`pairing-rules.ts`) i zatwierdzają ją atomowo przez port zapisu. Każda komenda przyjmuje `actor` (autor w historii decyzji) i opcjonalnie `expectedVersion`; błędy to `DomainError`, zgłaszane jako odrzucona obietnica. Goście czytają **opublikowaną migawkę** (`listPublished*`), panel dane bieżące (`list*`) — nowa funkcja dla gości używa wersji opublikowanej. Szczegóły: lekcja `write-path-conventions`. Dwa wyjątki od konwencji komend (zatwierdzone 2026-10-15): (1) **telemetria** — zapis zdarzeń użycia (`UsageEventService`, spec `2026-10-15-guest-usage-events`) nie jest komendą: bez `actor`, `expectedVersion` i `DomainError`, a błąd zapisu tylko trafia do `logger`; (2) **polecenia operatora** w `packages/db/scripts/` (`user:create`, `restaurant:create`, seedery) mogą pisać bezpośrednio przez MikroORM, bez portu i `actor` — nigdy kod uruchamiany przez aplikację.
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
| `npm run boot:check` | start zbudowanej aplikacji bez bazy: zła konfiguracja zatrzymuje serwer, demo tylko świadomie, ogólne 500 bez sekretów (po `npm run build`) |
| `npm run smoke -- <url> <slug>` | smoke test uruchomionej aplikacji: strony gościa, panel (po zalogowaniu kontem demo), uwierzytelnianie, uprawnienia, API; domyślnie `http://localhost:3000 halka` |
| `npm run user:create -- --email … --name … --role … --restaurant …` | tworzy konto do panelu (hasło z `USER_PASSWORD`, min. 12 znaków) |
| `npm run build` | granice + build mockupów i aplikacji (z typecheckiem Next.js) |
| `npm run engine:matrix` | przegląd kalibracji silnika: najlepsze wina dla każdego dania demo |
| `npm run db:migration:create` / `db:migrate` / `db:seed` | migracje i dane demo |

Skrypty npm uruchamiają się przez `/bin/sh`, który na Linuksie bywa `dash`: w skryptach i poleceniach powłoki **NIE używaj bashizmów** (`{a,b}`, `${PIPESTATUS}`, `[[ ]]`, `time`). Pisz POSIX albo skrypt Node (`scripts/*.mjs`).

### 1.6 Standardy inżynieryjne

Pełny dokument, z mapowaniem każdej reguły z oryginału (który opisuje inny produkt, DevMentor): **`.ai/docs/engineering-standards.md`**. Najważniejsze, co musisz wiedzieć pisząc kod:

- **Konwencja pojęć domenowych.** Kod nie jest dzielony na `modules/`. Każde pojęcie (`auth`, `catalog`, `pairings`, `publishing`, `restaurants`, `imports`, `guests`) to podkatalog o tej samej nazwie w warstwach, które go potrzebują: `core/src/services/<pojęcie>/`, `core/src/validators/<pojęcie>/`, `db/src/entities/<pojęcie>/`. Tworzysz go dopiero z pierwszym plikiem, nigdy pustego. To konwencja katalogów, nie system modułów: brak `setup.ts`, ACL-i i automatycznego wykrywania.
- **Warstwa API w `app/src/server/`.** Każda trasa to `handle()` (z sesją) lub `handlePublic()` (bez), a ciało żądania wchodzi **wyłącznie** przez `parseBody(req, schemat)` ze schematem Zod z `core/validators/` (obiekty `strictObject`: nieznane pole = 422). Trasa nie ma własnego `try/catch`: błędy mapuje jedno `guarded()`. Błędy domenowe rozpoznajemy przez `domainError()`, nigdy `instanceof`.
- **Logowanie tylko przez `logger`** (`server/logger.ts`), który redaguje sekrety. `console.*` jest zabronione (`npm run lint`).
- **Konfiguracja tylko przez `env()`** (`server/env.ts`), czytana leniwie; `next build` nie może wymagać środowiska ani bazy. Konfiguracja decydująca o tym, kto co zobaczy, zawodzi zamykająco (`DATA_SOURCE` jest jawne w produkcji, demo w produkcji wymaga `ALLOW_DEMO_DATA=true`).
- **Klucze wybierane przez klienta nie trafiają do zwykłego obiektu jako słownika** (`constructor`, `__proto__`): użyj `Map` lub `Object.fromEntries`.
- **Stany pusty / błąd / ładowanie:** `EmptyState`, `ErrorMessage`, `LoadingMessage` z `@wine-match/ui`, nie własny kod strony.

## 2. Struktura `.ai/`

```
.ai/
├─ specs/                 specyfikacje do Spec-Driven Development (SDD)
│  ├─ YYYY-MM-DD-slug.md  specyfikacje aktywne: draft, approved, in-progress
│  ├─ implemented/        specyfikacje w pełni zrealizowane
│  └─ archive/            specyfikacje porzucone lub zastąpione
├─ runs/
│  └─ YYYY-MM-DD-slug.md  log każdego autonomicznego przebiegu agenta
├─ lessons.md             indeks lekcji: jedna linia na lekcję, najnowsze na górze
└─ lessons/
   └─ YYYY-MM-DD-slug.md  pełna treść lekcji
```

### Konwencja nazw (wszystkie trzy obszary)

- Format: `YYYY-MM-DD-slug.md`, np. `2026-10-14-table-pairing-desserts.md`.
- Data: dzień utworzenia pliku, w lokalnej strefie czasowej projektu (Europe/Warsaw). Data **nie zmienia się** przy przenoszeniu ani edycji pliku.
- Slug: małe litery ASCII, cyfry i myślniki, 2–6 słów, bez polskich znaków (`ą` → `a`), np. `import-csv-semicolon`.
- Jeśli nazwa jest zajęta tego samego dnia, dodaj sufiks: `2026-10-14-slug-2.md`.
- Plik niezgodny z formatem jest błędem — popraw nazwę, zanim zrobisz cokolwiek innego.

## 3. Specyfikacje (SDD) — `.ai/specs/`

**MUSISZ** pracować według specyfikacji przy każdej zmianie, która spełnia choć jeden warunek:
- dodaje lub zmienia funkcję widoczną dla użytkownika (gość, kelner, sommelier, GM),
- zmienia reguły, wagi lub progi silnika w `packages/core/src/engine/`,
- zmienia model danych, API (`docs/API_SPECIFICATION.md`) lub kontrakt między modułami,
- obejmuje więcej niż ok. 3 pliki lub zajmie więcej niż jedną sesję.

Bez specyfikacji wolno: poprawić literówkę, oczywisty błąd w jednym miejscu, formatowanie, zależności bez zmiany zachowania. Taką poprawkę i tak opisz w logu przebiegu (sekcja 4).

### Cykl życia

| Status | Gdzie leży | Kto zmienia |
|---|---|---|
| `draft` | `.ai/specs/` | agent lub człowiek |
| `approved` | `.ai/specs/` | **tylko człowiek** |
| `in-progress` | `.ai/specs/` | agent, po rozpoczęciu implementacji |
| `implemented` | `.ai/specs/implemented/` | agent, po spełnieniu kryteriów akceptacji |
| `superseded` / `abandoned` | `.ai/specs/archive/` | agent lub człowiek, z powodem w pliku |

Reguły:
1. Przed implementacją **MUSISZ** sprawdzić `.ai/specs/` (także `implemented/`), czy dana funkcja nie ma już specyfikacji.
2. Jeśli specyfikacji brak, **MUSISZ** utworzyć ją w statusie `draft` i poprosić człowieka o akceptację. W trybie autonomicznym bez możliwości zapytania: zapisz draft, opisz go w logu przebiegu i **nie implementuj** zmian wymagających specyfikacji.
3. **NIE WOLNO** implementować specyfikacji w statusie `draft`. Implementujesz tylko `approved` lub `in-progress`.
4. Jeśli implementacja zbacza z planu — założenie okazało się błędne, dwie próby naprawy tego samego problemu nie zadziałały albo zakres rośnie — **zatrzymaj się i wróć do planowania** zamiast forsować rozwiązanie: dopisz ustalenia w „Ryzyka i otwarte pytania”, popraw „Projekt rozwiązania” i zapytaj. Nie zmieniaj po cichu zakresu.
5. Po spełnieniu wszystkich kryteriów akceptacji: ustaw `status: implemented`, uzupełnij sekcję „Realizacja”, przenieś plik do `implemented/` (`git mv`), bez zmiany nazwy.
6. Specyfikacja zastąpiona nowszą trafia do `archive/` z polem `superseded_by`.

### Planowanie złożonych zadań

Specyfikacja jest planem. Wysiłek wkładaj w plan, tak aby implementacja przeszła w jednym podejściu:
- „Projekt rozwiązania” wymienia pliki do zmiany, kolejność kroków i to, jak zostanie sprawdzone każde kryterium akceptacji (test, polecenie, ekran).
- Niejasności rozstrzygaj przed akceptacją — im dokładniejszy spec, tym mniej poprawek.
- Zanim poprosisz o akceptację, zleć przegląd specyfikacji niezależnemu agentowi (świeży kontekst lub pod-agent) w roli doświadczonego inżyniera: brakujące przypadki brzegowe, konflikty z sekcją 7, nietestowalne kryteria. Wnioski wpisz do specyfikacji.

### Szablon specyfikacji

```markdown
---
status: draft            # draft | approved | in-progress | implemented | superseded | abandoned
created: YYYY-MM-DD
owner: <człowiek odpowiedzialny>
related: []              # inne specyfikacje, runs, lessons
superseded_by:           # tylko w archive/
---

# <Tytuł>

## Problem
Co jest nie tak lub czego brakuje, dla kogo, skąd wiemy.

## Cel i zakres
Co zmieniamy. **Poza zakresem:** czego świadomie nie robimy.

## Wymagania
Ponumerowane (R1, R2…), testowalne.

## Kryteria akceptacji
- [ ] AC1 …   (każde sprawdzalne testem lub opisanym krokiem w UI)

## Projekt rozwiązania
Pliki, moduły, zmiany w modelu danych / API / regułach silnika, wpływ na ekrany (ID z docs/SCREEN_MAP.md).

## Ryzyka i otwarte pytania

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
```

## 4. Logi przebiegów — `.ai/runs/`

**MUSISZ** utworzyć log `.ai/runs/YYYY-MM-DD-slug.md` dla każdego przebiegu, w którym działasz autonomicznie, czyli wykonujesz zmiany w plikach lub polecenia bez zatwierdzania każdego kroku przez człowieka. Log zakładasz **na początku** przebiegu i uzupełniasz na bieżąco — przerwany przebieg też musi zostawić ślad.

Nie dotyczy rozmów, w których tylko odpowiadasz na pytania bez zmian w repozytorium.

Log jest dziennikiem: **nie edytuj logów innych przebiegów**. Kontynuacja pracy z poprzedniego przebiegu = nowy plik z odnośnikiem w `related`.

### Szablon logu

```markdown
---
started: YYYY-MM-DD HH:MM
ended: YYYY-MM-DD HH:MM   # puste, jeśli przebieg został przerwany
agent: <np. Claude Code / claude-opus-5-5>
spec: .ai/specs/...md     # lub "brak — drobna poprawka"
outcome: success | partial | failed | aborted
related: []
---

# <Co było do zrobienia, jednym zdaniem>

## Zadanie
Polecenie człowieka lub spec, własnymi słowami.

## Przebieg
Chronologicznie, krótko: decyzje i dlaczego, ślepe uliczki, zmienione pliki.

## Weryfikacja
Uruchomione polecenia i wyniki (typecheck, testy, build, ręczne sprawdzenie ekranów).

## Wynik
Co działa, co nie, co zostało do zrobienia.

## Lekcje
Odnośniki do lekcji utworzonych w tym przebiegu (albo „brak”).
```

## 5. Lekcje — `.ai/lessons.md` i `.ai/lessons/`

To pamięć długoterminowa projektu dla wszystkich agentów i ludzi.

**Na początku każdej sesji MUSISZ przeczytać `.ai/lessons.md`**, a pełną treść lekcji, których tytuły dotyczą bieżącego zadania, w `.ai/lessons/`.

**MUSISZ** zapisać lekcję, gdy:
- naprawiłeś błąd, którego przyczyna nie była oczywista lub może wrócić,
- odkryłeś nieudokumentowane zachowanie narzędzia, biblioteki lub środowiska,
- człowiek cię poprawił lub wskazał preferencję, która powinna obowiązywać dalej,
- przyjęto decyzję projektową, której uzasadnienia nie widać w kodzie,
- znalazłeś skuteczniejszy sposób wykonania powtarzalnej czynności.

**NIE zapisuj** jako lekcji: przebiegu pracy (to jest log), oczywistości, informacji, które już są w `docs/` lub w komentarzu w kodzie, ani niczego, czego nie zweryfikowałeś.

Procedura:
1. Sprawdź w `.ai/lessons.md`, czy podobna lekcja już istnieje. Jeśli tak — **zaktualizuj ją** zamiast tworzyć duplikat (dopisz datę aktualizacji).
2. Utwórz `.ai/lessons/YYYY-MM-DD-slug.md` według szablonu.
3. Dopisz jedną linię **na górze** listy w `.ai/lessons.md`: `- [YYYY-MM-DD] [tytuł](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`.
4. Jeśli lekcja jest już nieaktualna, nie usuwaj jej: dodaj w pliku `status: obsolete` z powodem i przenieś linię w indeksie do sekcji „Nieaktualne”.

Po poprawce od człowieka zapisz lub zaktualizuj lekcję **od razu**, zanim wrócisz do zadania — nie na końcu przebiegu.

**Awans do zasad.** Lekcję, która dotyczy każdego zadania, albo błąd, który powtórzył się mimo istniejącej lekcji, zamień w zwięzłą regułę w odpowiedniej sekcji tego pliku (najczęściej 6.1 lub 7). W lekcji ustaw `promoted: AGENTS.md §<nr>`. Celem jest malejąca liczba powtarzanych błędów; reguły, które przestały być potrzebne, usuwaj z tego pliku, żeby pozostał krótki.

### Szablon lekcji

```markdown
---
date: YYYY-MM-DD
updated:                 # data ostatniej aktualizacji
area: engine | guest-ui | admin-ui | import | build | tooling | process | docs
status: active           # active | obsolete
source: .ai/runs/...md   # przebieg, w którym powstała
promoted:                # np. AGENTS.md §6.1, jeśli lekcja stała się regułą
---

# <Tytuł jako reguła, np. „Dzieci siatki CSS muszą mieć min-width: 0”>

## Kontekst
Co się stało, gdzie, objawy.

## Przyczyna

## Reguła
Co robić odtąd. Konkretnie, w trybie rozkazującym.

## Jak sprawdzić
Test, polecenie lub krok weryfikacji.
```

## 6. Obowiązkowy przebieg pracy

1. Przeczytaj `.ai/lessons.md` (i istotne lekcje).
2. Ustal, czy zadanie wymaga specyfikacji (sekcja 3). Znajdź ją lub utwórz draft.
3. Jeśli działasz autonomicznie — załóż log w `.ai/runs/`.
4. Implementuj tylko zatwierdzony zakres.
5. Zweryfikuj zgodnie z sekcją 6.1 (w tym `npm test`).
6. Zapisz lekcje (sekcja 5).
7. Zaktualizuj spec (status, „Realizacja”, przeniesienie do `implemented/`) i zamknij log (`ended`, `outcome`).
8. W odpowiedzi dla człowieka wskaż ścieżki do specyfikacji, logu i nowych lekcji.

### 6.1 Weryfikacja zmian

Praca nie jest skończona, dopóki jej działania nie udowodnisz. „Powinno działać” nie jest weryfikacją.

- **Minimum przy każdej zmianie kodu:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Przy zmianach UI: ekran przy 390 px i 1440 px, bez poziomego przewijania i bez błędów w konsoli. Przy zmianach silnika: także `npm run engine:matrix` i przegląd wyników oczami sommeliera. Przy zmianach w `db`, portach lub serwisach: także `npm run test:db` na PostgreSQL. Przy zmianach stron lub API: `next build` i sprawdzenie w trybie `DATA_SOURCE=memory` oraz `postgres`.
- **Błędy naprawiaj od reprodukcji:** najpierw test, który pada (albo zapisane kroki odtworzenia), potem poprawka; test zostaje w repozytorium. Mając zgłoszenie, padający test lub log, doprowadź naprawę do końca samodzielnie; pytaj tylko o decyzje dotyczące zakresu lub zachowania produktu.
- **Dowody w logu:** w sekcji „Weryfikacja” logu przebiegu wpisz uruchomione polecenia i ich wyniki.
- **Przegląd własnego diffu przed zakończeniem**, jak recenzent: czy spełnione jest każde kryterium akceptacji, czy nie złamano sekcji 7, czy zaktualizowano `docs/`.
- **Najpierw działające, potem właściwe:** jeśli poprawka działa, ale jest doraźna, zadaj sobie pytanie „wiedząc to, co wiem teraz, jak wyglądałoby eleganckie rozwiązanie?” i wdróż je, jeśli mieści się w zakresie. Jeśli nie — zapisz dług techniczny w „Wyniku” logu.

## 7. Zasady projektu, których nie wolno łamać

- **Nowy kod ma testy jednostkowe** w pakiecie, w którym leży, dla głównej ścieżki i ważnych przypadków brzegowych. Pokrycie jest raportowane, ale nie ma progu, który przerywa build. Nie dopisuj testów tylko po to, żeby podbić procent.
- **Wykluczenia z raportu pokrycia są jawne, w konfiguracji każdego pakietu** (`vitest.config.ts`), z uzasadnieniem: pliki stron i komponentów React (`app/src/app/**.tsx`, pokrywa je E2E), kod shadcn/ui, pakiet `mockups` (prototyp do wycofania), wspólne zestawy testów (`core/src/testing`), repozytoria i encje (pokrywa je `test:db`). Nowe wykluczenie wymaga zgody właściciela.
- **Gdzie piszemy testy:** `core/tests/` (logika domeny), `db/tests/` (bez bazy: `*.test.ts`; z bazą: `*.integration.test.ts`), `app/tests/unit/` (trasy API, akcje, serwer), `app/tests/e2e/` (przeglądarka), `ui/tests/`, `testkit/tests/` (narzędzia testowe).
- **Silnik jest deterministyczny.** W `packages/core/src/engine/` nie używaj `Math.random`, dat, sieci ani wywołań LLM. Każda nowa reguła ma nazwę (`rule`), test w `packages/core/tests/engine.test.ts` i wpis w `docs/RECOMMENDATION_ENGINE.md`.
- **Sommelier ponad modelem.** Etykieta „Para sommeliera” / „Sommelier’s pairing” tylko dla par `approved` / `modified` (reguła R06 w briefie; najlepsza propozycja silnika to „Polecane do Twojego dania” / „Recommended for your dish”, bez pieczęci). Wyświetlany Match Score to zawsze wynik silnika, bez podbijania.
- **Bez „AI” w interfejsie gościa.** Nie używaj komunikatów typu „AI recommendation”, „Ask AI”, „Powered by AI”.
- **Bez zewnętrznych zasobów w runtime.** Fonty, ikony i biblioteki są lokalne (npm). Nie dodawaj CDN, Google Fonts ani `next/font/google`.
- **Architektura z §1.2–1.4 obowiązuje zawsze.** Obejście granicy pakietu (np. import encji w stronie, logika biznesowa w komponencie, zapytanie bez `restaurantId`) jest błędem, nawet jeśli działa.
- **Standardy z §1.6 obowiązują zawsze.** Trasa z własnym `try/catch`, ciało żądania wpuszczone do serwisu bez schematu, `console.log`, `instanceof` na błędzie domenowym albo sekret w logu jest błędem, nawet jeśli działa.
- **Dokumentacja idzie razem z kodem.** Zmiana zachowania ekranu, API, modelu danych lub silnika wymaga aktualizacji odpowiedniego pliku w `docs/` w tym samym przebiegu.

## 8. Praca równoległa, pod-agenci i powtarzalne czynności

- **Równoległe sesje** prowadź w osobnych `git worktree` na osobnych gałęziach: jedna specyfikacja = jeden worktree. Każda sesja ma własny log w `.ai/runs/`; dwie sesje nie edytują tej samej specyfikacji. Przy konflikcie w `.ai/lessons.md` zachowaj linie z obu stron.
- **Pod-agentów** używaj do eksploracji kodu, wyszukiwania w dokumentacji, przeglądu planu i weryfikacji, żeby główny kontekst pozostał czysty. Agent główny scala ich wyniki i zapisuje je w swoim logu przebiegu.
- **Czynność wykonywaną częściej niż raz dziennie albo w każdym przebiegu** zamień w skrypt `npm run …` lub komendę agenta zapisaną w repozytorium (`.claude/commands/`) i opisz ją w lekcji. Przykład: `npm run engine:matrix`.
