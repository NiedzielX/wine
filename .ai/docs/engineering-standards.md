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
| Wersje przypięte dokładnie | **Tak** (`save-exact`), poza zależnościami wewnętrznymi `@wine-match/*`: te mają `"*"`, żeby npm zawsze dowiązywał workspace, nie rejestr | `npm run release:version` |
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
- [ ] Nowa trasa używa `handle()` / `handlePublic()` i `parseBody()`, nie ma własnego `try/catch`. Przy zmianie trasy `npm run check:routes` musi przejść (wrapper jako pierwsza instrukcja, literalne `route` i `write`; wyjątki tylko w `scripts/check-routes.allowlist.json` z powodem i listą metod); zob. §11.
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

## 10. Granice dostępu: reguła trzech sprawdzeń

Źródło: lekcja 16 kursu (bezpieczeństwo), `docs/security/threat-model.md`. „Odmowa” bez dowodu, że dane się nie ruszyły, i test bez kontroli pozytywnej to nie jest sprawdzenie granicy. Granica dostępu to: izolacja tenantów (slug i id obiektu), hierarchia ról, flaga i token zaproszenia, tryb tylko do odczytu pokazu, każde nowe wejście, które ktoś zamyka przed kimś.

Każda granica ma test HTTP na prawdziwej instancji (e2e na PostgreSQL, zbudowana aplikacja, prawdziwe sesje; szablon: `packages/app/tests/e2e/access-boundaries.e2e.test.ts`), a w nim:

1. **Kontrola pozytywna dla OBU kont.** To samo wywołanie, które ma zostać odmówione, działa dla właściciela danych (200), w obie strony (A→B i B→A). Bez tego 404 może znaczyć „zepsute wywołanie”, nie „granica”.
2. **Odmowa odczytu.** Obce konto czyta cudze dane: 403 (obcy slug) albo 404 (cudze id pod własnym slugiem), a ciało odpowiedzi nie zawiera żadnej wartości z cudzych danych.
3. **Odmowa zapisu.** Każda metoda zapisu (PATCH, DELETE, POST) z cudzym id lub za wysoką rolą: 403/404/422, nigdy 2xx.
4. **Stan po próbie.** Porównaj **całe ładunki** przed i po (listy i szczegóły z API obu restauracji) oraz skrót wierszy tabel, których próba mogła dotknąć (`md5(string_agg(x::text …))`), nie liczniki. Odmowa, która coś zmieniła po drodze, jest błędem.

Dodatkowo: gdy dodajesz kontrolę, **zepsuj ją na chwilę** (mutacja: usuń filtr `restaurant`, wymuś rolę) i potwierdź, że test pada; zapisz to w logu przebiegu. Pola spoza schematu w ciele żądania mają być odrzucone (`strictObject`), a nie zignorowane. Nowa trasa z id w ścieżce, nowa rola albo nowe publiczne wejście dopisuje wiersz w `docs/security/threat-model.md` w tym samym PR-ze. Błąd znaleziony tym sposobem naprawiasz od czerwonego testu (`npm run verify:regression`, `AGENTS.md` §6.1).

## 11. Rozmiar PR i przegląd (lekcja 17 kursu)

Przegląd, który powtarza się mimo lekcji, zamieniamy w sprawdzenie maszynowe (przykład: `npm run check:routes`, `.ai/lessons/2026-11-07-deterministic-check-over-review.md`); poniższe reguły dotyczą tego, co zostaje człowiekowi i recenzentowi.

1. **Rozmiar PR.** Trzymaj diff mały i dziel duże zmiany na kolejne PR-y: jakość automatycznego review spada gwałtownie powyżej ok. 150 zmienionych linii. Wyjątki są dozwolone i opisane w PR (jedno zdanie: która klasa): (a) pliki generowane (lockfile, migracje ze skryptu, snapshoty); (b) dokumentacja; (c) fixtury testowe i dane demo; (d) **nowy, samodzielny skrypt narzędziowy razem z testami i dokumentacją, jeden na PR** (np. `scripts/check-routes.mjs` + `check-routes.test.ts` + wiersz w `commands.md` + lekcja): liczy się wtedy kod poza tym zestawem, a recenzent czyta skrypt przez jego testy. Zmiana zachowania aplikacji nie korzysta z wyjątku (d).
2. **Opis PR to niezweryfikowane twierdzenia.** Recenzent (człowiek lub agent) sprawdza je z diffem i nie przyjmuje „to bezpieczne / secure / bez wpływu na X” jako dowodu. Dowodem jest kod, test, który pada bez zmiany, albo wynik polecenia z logu; opis wskazuje, co sprawdzić, nie zastępuje sprawdzenia.
3. **Ryzyko wysokie, dwa niezależne przeglądy.** „Ryzyko wysokie” znaczy to, co w [SDLC.md](../../SDLC.md) (etykieta `risk-high` albo diff dotykający uwierzytelniania i sesji, zakresu danych, pieniędzy, migracji schematu, wspólnych kontraktów, szerokich zmian przekrojowych); tutaj nie definiujemy tego drugi raz. Ścieżki `scripts/`, `.github/`, `.claude/`, sekrety i silnik rekomendacji są tylko wskazówką dla paczki przeglądu (review pack, gdy będzie na `main`), nie podnoszą etykiety; chcąc, by liczyły się jako `risk-high`, zmień SDLC.md w osobnym PR. Dla takiego PR uruchom co najmniej dwa niezależne review w świeżym kontekście (dwie sesje albo pod-agenci, bez wniosków autora i bez wglądu w swoje wyniki); każdy wynik wpisz jako komentarz do PR, nazwany „Review 1” i „Review 2” (jak w `AGENTS.md` §6.1 dla poprawek), a rozbieżności rozstrzygnij w diffie, nie głosowaniem.

## 12. Migracja: dowód up/down/up i plan wycofania

Nowa migracja idzie do PR-a razem z dowodem `up`/`down`/`up` i planem wycofania w opisie PR-a (SDLC.md: migracja schematu to `risk-high`).

1. **Dowód.** `packages/db/tests/migrations-roundtrip.integration.test.ts` (część `npm run test:db`, w CI w jobie `database`) stosuje wszystkie migracje, robi zrzut schematu (kolumny, indeksy, ograniczenia, enumy, sekwencje, wyzwalacze, funkcje), cofa każdą migrację od najnowszej do najstarszej, porównuje schemat z zrzutem po samej bazowej, stosuje ponownie i porównuje z pierwszym pełnym zrzutem. Robi to na pustej bazie i na bazie z danymi demo. Nowa migracja bez `down()` zawiesza test.
2. **Jedyny wyjątek to migracja bazowa** `Migration20261014121402_initial` (jej `down` skasowałby cały schemat; zastosowanych migracji nie edytujemy, `AGENTS.md` §1.3). Test ma ją na jawnej liście `NON_REVERSIBLE` z powodem; nowy wpis na tej liście wymaga zgody właściciela.
3. **Plan wycofania w opisie PR-a**: (a) czy `down` jest bezstratny, a jeśli kasuje dane, które dane; (b) czy poprzednia wersja aplikacji działa na schemacie po `down` i czy nowa na schemacie przed `up` (kolejność wdrożenia); (c) polecenie wycofania (`npm run migration:down -w @wine-match/db`, jedna migracja na wywołanie, albo „nie wycofujemy, naprawiamy do przodu” z powodem); (d) co sprawdzić po wycofaniu.
4. **Współbieżność.** Ścieżka zapisu na współdzielonym zasobie (zaproszenie, rola, import, decyzja o parze, kod polecenia, limit) ma test z prawdziwą równoległością w `packages/db/tests/concurrency.integration.test.ts`: kilka żądań startuje przez jedną bramkę (`race()` w `tests/support/pg.ts`, bez `sleep`), powtarzane w pętli, asercje na stanie bazy po wyścigu. Wyścig, który test wykrył, naprawiasz od czerwonego testu (`npm run verify:regression`).
