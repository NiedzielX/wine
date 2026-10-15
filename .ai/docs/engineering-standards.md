# Wine Match — standardy inżynieryjne

Status: obowiązuje · zatwierdzone przez właściciela poleceniem z 2026-10-15 · specyfikacja wdrożenia: `.ai/specs/implemented/2026-10-15-engineering-standards.md`

## Skąd ten dokument

Źródłem jest dokument **„DevMentor — Engineering Standards & Package Structure”** (2026-09-01), napisany dla innego produktu. Oryginał leży w `.ai/docs/reference/2026-09-01-devmentor-engineering-standards.md` i **nie jest naszym standardem**. Ten plik to jego adaptacja do Wine Match: zasady, które mają u nas zastosowanie, są przetłumaczone na nasze nazwy i granice, a każde odstępstwo ma powód. Gdy ten plik i oryginał się różnią, wygrywa ten plik.

Zasada nadrzędna oryginału, którą zachowujemy: *gdy dwie zasady ciągną w różne strony, wybierz tę, która robi zmianę **mniejszą i bardziej jawną**, a nie tę, która wygląda „bardziej enterprise”.*

## 1. Co wdrożone, co nie, i dlaczego

| Standard z oryginału | W Wine Match | Egzekwowane przez |
|---|---|---|
| Podkatalog na pojęcie w warstwach | **Tak**: `core/services/<pojęcie>/`, `db/entities/<pojęcie>/`, `core/validators/<pojęcie>/` | konwencja + przegląd |
| Kierunek `app → core → db` | **Nie.** U nas `app → {core, db, ui}`, `db → core`, `ui` samodzielne | `scripts/check-boundaries.mjs`, `oxlint` (`no-restricted-imports`) |
| Warstwa HTTP w `core/src/http` | **W `app/src/server`** (`core` nie zna HTTP ani Next.js) | `oxlint`, przegląd |
| Koperta `{ok,data}` | **Nie**: sukces to czysty JSON, błąd `{error:{code,message,fields?}}` (kontrakt w `docs/API_SPECIFICATION.md`) | testy `npm run smoke` |
| Trasa bez własnego `try/catch` | **Tak**: `handle()` i `handlePublic()` w `server/api-auth.ts` | `grep` w przeglądzie; smoke (500 → ogólny komunikat) |
| `makeCrudRoute`, `CrudForm`, `DataTable`, `apiCall` | **Nie budujemy** (patrz §3) | — |
| `feedback/{EmptyState,ErrorMessage,LoadingMessage}` | **Tak**: `packages/ui/src/backend/feedback` | przegląd |
| Schematy Zod, jedno źródło | **Tak** dla wejścia API: `core/validators/<pojęcie>/<nazwa>.schema.ts`, `parseBody()` | `core/tests/validators.test.ts` |
| Port zamiast SDK dostawcy | **Tak** (już było): repozytoria, `PasswordHasher`, `ImportFileParser`, `Clock` | granice pakietów |
| Zdarzenia domenowe `core/events` | **Nie teraz** (YAGNI). Dodać razem z pierwszą funkcją, która ich potrzebuje | — |
| Build i start bez bazy | **Tak** | `npm run boot:check`, job CI „bez bazy” |
| Transakcja przy „sprawdź i zapisz” | **Tak** (`commit`, `confirm`, `publish`) | testy kontraktu na PostgreSQL |
| Hasła: bcrypt ≥12 / argon2id | **scrypt N=2^15, r=8, p=3** (równoważna siła wg OWASP) + przeliczanie starych skrótów przy logowaniu | `db/tests/scrypt.test.ts`, test integracyjny |
| JWT HS256 | **Nie dotyczy**: nieprzezroczysty token sesji, w bazie tylko jego SHA-256 | `core/tests/auth.test.ts` |
| Ciasteczka, CSRF | **Tak** (httpOnly, Secure w produkcji, SameSite=Lax, `X-CSRF-Token`) | `npm run smoke` |
| Limit prób logowania per IP + e-mail | **Per konto** (5 prób / 15 min). Per IP wymaga decyzji o zaufanym serwerze pośredniczącym — **otwarte** | testy `AuthService` |
| Własność rekordu zamiast ról | **Odwrotnie**: role i izolacja restauracji są wymaganiem produktu | `authorize()`, testy uprawnień |
| Mass assignment przez Zod | **Tak**: obiekty `strictObject`, nieznane pola → 422 `unknown_field` | `core/tests/validators.test.ts` |
| `pino` z redakcją | **Własny logger** `core/logging` (bez nowej zależności) z redakcją kluczy i wzorców w tekście | `core/tests/logging.test.ts` |
| Konfiguracja z `env.ts` (Zod) | **Tak**: `core/config/env.ts`, `app/src/server/env.ts` | `core/tests/env.test.ts`, `boot:check` |
| `npm audit` w bramce | **Tak**: `npm run audit:gate` z jawną, datowaną listą wyjątków | CI |
| ESLint | **`oxlint`** (`typescript-eslint` wymaga TypeScript `<6.1`, mamy 7) | `npm run lint`, CI |
| Lista kontrolna przeglądu | **Tak**: §6 i `.github/pull_request_template.md` | przegląd |

## 2. Nazewnictwo

| Element | Konwencja | Przykład |
|---|---|---|
| Pakiet | `packages/<nazwa>`, zakres `@wine-match/<nazwa>` | `@wine-match/core` |
| Folder pojęcia | krótki, małymi literami, ta sama nazwa w każdej warstwie, która go potrzebuje | `catalog`, `pairings`, `publishing`, `restaurants`, `auth`, `imports`, `guests` |
| Encja | `defineEntity`, plik `<nazwa>.ts` w folderze pojęcia; **tabela w liczbie pojedynczej**, snake_case (zostaje: dotyczy migracji) | `Dish` → `entities/catalog/dish.ts`, tabela `dish` |
| Serwis | klasa z sufiksem `Service`, plik `<nazwa>-service.ts` w folderze pojęcia | `SommelierService` → `services/pairings/sommelier-service.ts` |
| Port | interfejs w `core/src/ports/`; nazwa mówi o roli: `*Repository`, `PasswordHasher`, `Clock`, `ImportFileParser` | — |
| Adapter portu | w pakiecie, który ma technologię: `db` (Pg…, scrypt, parsery plików), `core/memory` (pamięć) | `PgImportRepository` |
| Klucz kontenera DI | camelCase, jedna jawna linia w `server/container.ts` (brak `loadModules`) | `sommelierService` |
| Schemat Zod | zmienna `<nazwa>Schema`, plik `<nazwa>.schema.ts` w `core/src/validators/<pojęcie>/` | `pairingUpdateSchema` |
| Błąd domenowy | klasa z sufiksem `Error` w `core/src/errors.ts`; **`this.name` jako literał** | `NotFoundError` |
| Trasa API | `app/src/app/api/v1/<zasób>/route.ts`, przez `handle()` lub `handlePublic()` | — |
| Strona | `page.tsx`, domyślny eksport `<Segment>Page` | `SetupPage` |
| Komponent | surowy shadcn w `ui/src/components/` (z `npx shadcn add`, lokalne poprawki opisane w `packages/ui/AGENTS.md`); generyczny wzorzec panelu w `ui/src/backend/<kategoria>/`; komponent jednej strony obok jej `page.tsx` do czasu drugiego użycia | `EmptyState` |

Zdarzenia (`concept.entity.action`) opisuje oryginał; nie mamy ich, więc nie ma u nas konwencji.

## 3. Warstwa API i UI: nie pisz drugi raz tego samego

**Serwer — `packages/app/src/server/`** (HTTP zostaje w `app`; `core` nie zna HTTP):

- `api-auth.ts`: `handle()` (z sesją, CSRF i uprawnieniem) oraz `handlePublic()` (bez sesji). Oba przechodzą przez jedno `guarded()`, **jedyne miejsce zamieniające błąd w odpowiedź**: błąd domenowy → status HTTP i `{error:{code,message,fields?}}`; wszystko inne → log (z redakcją) i ogólne 500, nigdy ślad stosu. **Żadna trasa nie pisze własnego `try/catch`.**
- `parseBody(req, schema)` i `readUpload()`: **jedyna droga, którą ciało żądania trafia do serwisu.** Zawsze przez schemat Zod, więc serwis dostaje jawnie otypowaną wartość.
- `domain-errors.ts`: błędy domenowe rozpoznajemy przez `domainError(e)` po stałej nazwie i kodzie, **nigdy `instanceof`** (Next.js bundluje `core` osobno dla tras; lekcja `nextjs-duplicate-module-instanceof`).
- `auth.ts`: `requireAccess` (strony), `authorizeAction` (akcje), uprawnienia w `core/auth/permissions.ts`. Sprawdzanie sesji i uprawnienia robi **każde wejście osobno**.
- `logger.ts`: jedyny moduł, który drukuje. Reszta loguje przez `logger`.
- `env.ts`: zwalidowana konfiguracja, czytana leniwie.

**Klient — nie budujemy `apiCall`, `CrudForm`, `DataTable`, `makeCrudRoute`.** Panel to komponenty serwerowe i akcje serwerowe z formularzami, które działają bez JavaScriptu (decyzja Fazy 3), a żaden nasz zasób nie jest zwykłym CRUD-em. Reguła z oryginału zostaje: **pierwszy `fetch` z klienta idzie przez jedną funkcję `apiCall`**, a nie rozsiany po komponentach — wtedy ją dodajemy. Stany pusty / błąd / ładowanie: tylko `EmptyState`, `ErrorMessage`, `LoadingMessage` z `@wine-match/ui`.

## 4. Architektura

- Kierunek zależności i jego egzekwowanie: `AGENTS.md` §1.2. `oxlint` dodaje te same ograniczenia importów jako drugą linię obrony.
- Folder pojęcia powstaje **dopiero z pierwszym plikiem**. Nie scaffolduj pustych.
- Zewnętrzna integracja = port w `core` + adapter w pakiecie z technologią (jak `PasswordHasher` i `ImportFileParser`).
- Dostęp do bazy i konfiguracji tylko w trasach `force-dynamic` i w kontenerze. **Aplikacja buduje się i startuje bez bazy i bez zmiennych środowiskowych** (`npm run boot:check`).
- Przy konfiguracji decydującej o tym, kto co zobaczy, **zawodzimy zamykająco**: literówka w `DATA_SOURCE` nie wybiera cicho danych demo; produkcja wymaga jawnego źródła danych, a demo w produkcji wymaga `ALLOW_DEMO_DATA=true`.
- „Sprawdź i zapisz” na współdzielonym zasobie idzie w jednej transakcji (`commit`, `confirm`, `publish`) i ma ograniczenie unikalności w bazie, nie tylko sprawdzenie w aplikacji.

## 5. Zasady, które u nas faktycznie coś robią

- **SRP:** encja = schemat; serwis = reguły jednego pojęcia; trasa = walidacja → autoryzacja → serwis → odpowiedź. Serwis nie buduje odpowiedzi HTTP, trasa nie zawiera reguł.
- **DRY:** walidacja raz w `validators/`; obsługa błędów raz w `guarded()`; komunikaty błędu raz w `flash.tsx`. Kopiujesz `try/catch` albo blok walidacji? Zatrzymaj się i wydziel.
- **Rozdział warstw:** persystencja w `db`, reguły w `core`, HTTP i renderowanie w `app`, prezentacja w `ui`.
- **Zależność od portu, nie od dostawcy.** `AuthService` zna `PasswordHasher`, nie `node:crypto`.
- **Jawne ponad niejawne.** Każda zależność to jedna linia w `container.ts`.
- **YAGNI.** Brak zdarzeń, `makeCrudRoute`, `CrudForm`, kolejki, pluginów, dopóki żadna funkcja ich nie potrzebuje.
- **Kompozycja ponad dziedziczenie.** Małe funkcje i serwisy; brak klas bazowych.
- **Zawodź zamykająco.** Błąd w sprawdzeniu uprawnień oznacza odmowę, nigdy dopuszczenie (`authorize()` rzuca, `guarded()` odpowiada 403).
- **Idempotencja tam, gdzie możliwe ponowienie:** zatwierdzenie importu działa raz (blokada wiersza `FOR UPDATE`), publikacja i decyzje mają wersje.

## 6. Bezpieczeństwo i walidacja: minimum

| Wymaganie | Jak spełnione w Wine Match |
|---|---|
| Skrót hasła | scrypt (N=2^15, r=8, p=3), sól 16 B, porównanie `timingSafeEqual`; parametry w skrócie, `needsRehash` podnosi stare konta przy logowaniu |
| Sesja | losowy token 32 B w ciasteczku `httpOnly`, w bazie SHA-256; 12 h; nowy token przy każdym logowaniu |
| Ciasteczka | `httpOnly`, `Secure` w produkcji (`AUTH_COOKIE_SECURE`), `SameSite=Lax`; nigdy token w `localStorage` |
| CSRF | akcje serwerowe: kontrola Origin; API: `X-CSRF-Token` + odrzucenie `cross-site` i obcego `Origin` |
| Limit prób | blokada konta po 5 nieudanych próbach na 15 min, jedna odpowiedź dla złego hasła / nieznanego konta / blokady, wyrównany czas. **Ograniczenie:** blokada per konto pozwala komuś zablokować cudze konto na 15 min; per IP + e-mail wymaga decyzji o serwerze pośredniczącym |
| Autoryzacja | rola i członkostwo w restauracji, sprawdzane po stronie serwera przy **każdych** drzwiach; zapytania zawsze z `restaurantId` |
| Mass assignment | `strictObject` w schematach; nieznane pole = 422; usługi dostają tylko wynik `parseBody()` |
| Wstrzykiwanie | wyłącznie API MikroORM; jedyne surowe SQL-e są parametryzowane (`registerFailedLogin`, `countPending`) |
| Sekrety i logi | wszystko przez `env.ts`; `.env` poza repozytorium; logger redaguje klucze (`password`, `token`, `cookie`, `authorization`, `hash`, …) i **wzorce w tekście** (skrót scrypt, JWT, `Bearer`, `wm_session=`, adres bazy z hasłem) |
| Komunikaty | ogólne przy logowaniu; klient nigdy nie dostaje śladu stosu ani szczegółów połączenia |
| Identyfikatory | UUID |
| Zależności | `npm run audit:gate` (wysokie i krytyczne blokują; wyjątki jawne, z powodem i terminem w `scripts/audit-gate.mjs`) |
| Pliki od użytkownika | typ po zawartości, limity rozmiaru i wierszy, ochrona przed zip bomb, brak parsera XML z encjami, plik nie jest przechowywany |
| Nagłówki | `X-Content-Type-Options`, `Referrer-Policy`; `no-store` i `X-Frame-Options: DENY` dla panelu |

**Klucze wybierane przez klienta nigdy nie trafiają do zwykłego obiektu jako słownika** (`obj[klucz] = …`): `constructor` już tam jest, a `__proto__` jest po cichu ignorowane. Używamy `Map` albo `Object.fromEntries` (lekcja `client-chosen-keys`).

## 7. Jakość kodu (egzekwowana przez `npm run lint`)

Reguły `oxlint` w `.oxlintrc.json`: brak `any` (`typescript/no-explicit-any`), brak pustych `catch` (`no-empty`), brak `console.*` poza loggerem i skryptami (`no-console`), `eqeqeq`, `prefer-const`, `no-var`, `no-debugger`, `no-throw-literal`, nieużywane zmienne, `react/jsx-key`, komponenty nie powstają w trakcie renderowania, oraz **ograniczenia importów między pakietami**. Dodatkowo, bez narzędzia: samodokumentujący się kod (komentarz tylko dla niejasnego *dlaczego*), wczesne `return` zamiast zagnieżdżonych `if`, nazwane stałe zamiast magicznych liczb (z powodem tam, gdzie wartość nie jest oczywista), brak martwego i zakomentowanego kodu, diff w całości prowadzący do celu zmiany.

## 8. Lista kontrolna przeglądu

**Struktura i konwencje**
- [ ] Folder pojęcia zgodny z §2; encja i serwis występują parami.
- [ ] Żaden import nie łamie kierunku zależności ani nie sięga do wnętrza innego pojęcia (tylko do jego publicznego serwisu).
- [ ] Nowa trasa używa `handle()` / `handlePublic()` i `parseBody()`, nie ma własnego `try/catch`.
- [ ] Wejście ma schemat w `core/validators/<pojęcie>/` i test odrzucenia nieznanych pól.
- [ ] `npm run lint`, `typecheck`, `test`, `build` przechodzą; przy zmianach bazy też `test:db`.

**Bezpieczeństwo** (blokujące, jeśli niespełnione)
- [ ] Autoryzacja po stronie serwera na każdej trasie, która nie jest publiczna („przycisk jest ukryty” to nie ochrona).
- [ ] Sprawdzana jest **konkretna restauracja i rekord**, nie tylko „jest zalogowany”.
- [ ] Sprawdź-i-zapisz na współdzielonym zasobie ma transakcję i/lub ograniczenie unikalności.
- [ ] Żaden sekret, token, hasło ani skrót nie trafia do logu, odpowiedzi błędu ani do klienta.
- [ ] Nic nieufnego nie trafia do zapytania, polecenia ani ścieżki pliku bez parametryzacji.
- [ ] Zapis przechodzi przez schemat Zod; nigdy `em.create(...req.body)`.
- [ ] Flagi ciasteczka zachowane, gdy dotykasz kodu sesji.
- [ ] Błąd wewnątrz decyzji bezpieczeństwa kończy się odmową.
- [ ] Poprawka błędu bezpieczeństwa ma test regresji, który pada bez poprawki.
- [ ] Zmiana dotykająca logowania ma kontrolę brute force.

**Poprawność i testy**
- [ ] Ścieżki współbieżne (publikacja, zatwierdzenie importu, edycja pairingu) mają test integracyjny z dwiema sesjami.
- [ ] Zmiana zachowania ma test, który pada na starym kodzie; poprawka błędu ma test z reprodukcją.
- [ ] Zmiana kodu, który działa inaczej w buildzie produkcyjnym (nazwy klas, bundle, nagłówki), jest sprawdzona na `npm run build` + `npm run smoke`, a nie tylko w testach jednostkowych.

## 9. Jak dodać nowe pojęcie

1. Encja: `packages/db/src/entities/<pojęcie>/<nazwa>.ts`, wpis w `entities/index.ts`, migracja (`npm run db:migration:create`, SQL przejrzany).
2. Port w `core/src/ports/` (jeśli potrzebny) i jego implementacje: `db` (PostgreSQL) i `core/memory` (pamięć), wspólny kontrakt w `core/src/testing/`.
3. Serwis: `packages/core/src/services/<pojęcie>/<nazwa>-service.ts`, jedna jawna linia w `container.ts` i pole w `Cradle`.
4. Wejście API: schemat w `core/src/validators/<pojęcie>/<nazwa>.schema.ts` (`strictObject`), eksport w `validators/index.ts`.
5. Trasa: `app/src/app/api/v1/<zasób>/route.ts` jako `handle()` / `handlePublic()` + `parseBody()` + jedna lub kilka metod serwisu. Strona/akcja: `requireAccess` / `authorizeAction`.
6. Stany pusty / błąd / ładowanie: komponenty z `@wine-match/ui`.
7. Testy (reguły, kontrakt na obu magazynach, trasa), wpis do `scripts/smoke.mjs`, dokumentacja w `docs/`.
8. Nie twórz `modules/<pojęcie>/`, plików `setup.ts` ani automatycznego wykrywania.
