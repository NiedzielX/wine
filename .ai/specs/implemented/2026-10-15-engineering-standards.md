---
status: implemented
created: 2026-10-15
owner: Filip
related: [.ai/docs/engineering-standards.md, .ai/docs/reference/2026-09-01-devmentor-engineering-standards.md, .ai/runs/2026-10-15-engineering-standards.md]
superseded_by:
---

# Wdrożenie standardów inżynieryjnych (adaptacja z DevMentor do Wine Match)

> Polecenie właściciela: „wdróż specyfikację standardów inżynieryjnych z `.ai/docs/engineering-standards.md`”. Przekazany plik (`2026-09-01-engineering-standards.md`) opisuje **inny produkt (DevMentor)**; w repozytorium nie było pliku pod tą ścieżką. Decyzje poniżej podjął agent; do przeglądu.

## Problem
Wine Match ma dobrze udokumentowaną architekturę, ale brakuje części standardów jakości i bezpieczeństwa z przekazanego dokumentu: bramki `lint`, wspólnego loggera z redakcją sekretów, walidowanej konfiguracji, jednej definicji walidacji wejścia API, bramki audytu zależności i zapisanej listy kontrolnej przeglądu. Przy okazji weryfikacji wyszły dwa realne problemy: parametry scrypt poniżej progu OWASP i podatności w Next.js 16.3.7.

## Cel i zakres
Wdrożyć te standardy z dokumentu, które mają zastosowanie do naszej architektury, przetłumaczone na jej nazwy i granice; dla pozostałych zapisać powód odstępstwa. **Poza zakresem:** zmiana architektury (kierunek zależności, sesje → JWT, SSR → klient), wprowadzanie `makeCrudRoute`, `CrudForm`, `DataTable`, `apiCall`, magistrali zdarzeń (brak zastosowania, patrz tabela).

## Mapowanie standardów (decyzje)
| Standard z oryginału | Decyzja dla Wine Match | Uzasadnienie |
|---|---|---|
| Podkatalogi pojęć w warstwach (`entities/<pojęcie>/`, `services/<pojęcie>/`, `validators/<pojęcie>/`) | **Wdrożyć** dla `core/services`, `db/entities`, nowe `core/validators` | główna zmiana strukturalna oryginału; kod już jest pogrupowany tematycznie (`auth/`, `import/`) |
| Kierunek `app → core → db` | **Nie.** Zostaje `app → {core, db, ui}`, `db → core`, egzekwowane przez `check-boundaries` | u nas `core` definiuje porty, a `db` je implementuje; odwrócenie zepsułoby odwrócenie zależności |
| Warstwa HTTP w `core/src/http` | **Przenieść do `app/src/server`**: `handle()` (z sesją), `handlePublic()` (bez), `parseBody()`; błędy domenowe zostają w `core/errors.ts` | `core` nie może znać HTTP ani Next.js (reguła z oryginału: „core nie importuje next/react”) |
| Koperta `{ok,data}` / `{ok:false,error}` | **Nie zmieniamy**: sukces to czysty JSON, błąd `{error:{code,message,fields?}}` | kontrakt jest w `docs/API_SPECIFICATION.md`; zmiana zerwałaby klientów bez zysku |
| Żadna trasa nie pisze własnego `try/catch` | **Wdrożyć** dla wszystkich route handlerów (w tym publicznych) | jednolite mapowanie błędów, brak wycieku stosu |
| `makeCrudRoute` | **Nie budować** | żaden nasz zasób nie jest zwykłym CRUD-em; YAGNI |
| `apiCall`, `CrudForm`, `DataTable` | **Nie budować**; reguła zostaje: pierwszy `fetch` z klienta idzie przez jeden `apiCall` | panel to komponenty serwerowe i akcje serwerowe, formularze działają bez JS (decyzja Fazy 3) |
| `feedback/{LoadingMessage,ErrorMessage,EmptyState}` | **Wdrożyć** w `ui/src/backend/feedback` i użyć w panelu | powtarzane ad hoc stany pusty / błąd / ładowanie |
| Schematy Zod w `core/validators/<pojęcie>/`, jedno źródło dla trasy i formularza | **Wdrożyć dla wejścia API** (logowanie, pairingi, wina, import, stolik); formularze serwerowe czytają `FormData` i ufają serwisom | wejście API było sprawdzane ręcznie w każdej trasie |
| Port zamiast SDK dostawcy | **Już jest** (`PasswordHasher`, `ImportFileParser`, repozytoria, `Clock`) | — |
| Zdarzenia domenowe (`core/events`) | **Nie teraz** | żadna funkcja ich nie potrzebuje; oryginał sam mówi „nie dodawaj spekulacyjnie”; zdarzenia analityczne gości to Faza 6 |
| Baza tylko w trasach `force-dynamic`; aplikacja buduje się i startuje bez bazy | **Zweryfikować** i dopisać do CI | wymóg oryginału |
| Transakcja przy „sprawdź i zapisz” | **Już jest** (`commit`, `confirm`, `publish`) | — |
| Hasła: bcrypt ≥12 lub argon2id | **scrypt zostaje**, ale parametry **podnosimy do progu OWASP** (N=2^15, r=8, **p=3**; było p=1, poniżej progu) i dodajemy przeliczanie skrótu przy logowaniu | scrypt jest na liście OWASP i nie ma zależności natywnej; stary parametr był za słaby |
| JWT HS256, sekret w `env.ts` | **Nie dotyczy**: nieprzezroczyste sesje po stronie serwera (skrót w bazie) | unieważnianie sesji natychmiast, brak sekretu do wycieku |
| Ciasteczka, CSRF | **Już jest** (httpOnly, Secure w produkcji, SameSite=Lax, `X-CSRF-Token`) | — |
| Limit prób per IP + e-mail | **Nie zmieniamy**: blokada per konto (5 prób / 15 min); ograniczenie opisane | per IP wymaga decyzji o zaufanym serwerze pośredniczącym; do właściciela |
| „Brak RBAC / multi-tenant”, własność rekordu | **Odwrotnie u nas**: role i izolacja restauracji są wymaganiem produktu; zasada „sprawdzaj konkretny rekord” zostaje | — |
| Mass assignment przez Zod | **Wdrożyć** razem z walidatorami | — |
| `pino` z redakcją | **Własny, minimalny logger** (`core/logging`) z redakcją kluczy wrażliwych; bez nowej zależności | oryginał sam: „nie dodawaj zależności za 20 linii” |
| Konfiguracja z `env.ts` (Zod) | **Wdrożyć** `core/config/env.ts` (Zod) i `server/env.ts` | rozproszone odczyty `process.env` |
| `npm audit` w bramce | **Wdrożyć** `scripts/audit-gate.mjs` z jawną, datowaną listą wyjątków | `awilix → braces` bez poprawki w ekosystemie |
| ESLint `no-restricted-imports` | **`oxlint`** (reguły jakości + ograniczenia importów) obok `check-boundaries` | `typescript-eslint` wymaga TypeScript `<6.1`, mamy 7 |
| Lista kontrolna przeglądu | **Wdrożyć**: `.github/pull_request_template.md` i sekcja w dokumencie | — |
| Poprawka „DI container” w product-scope | **Nie dotyczy**: nie mamy takiego dokumentu ani takiego wykluczenia | — |

## Wymagania
- R1 Dokument `.ai/docs/engineering-standards.md` (wersja Wine Match) + oryginał w `.ai/docs/reference/`; sekcje w `AGENTS.md`; szablon PR.
- R2 `npm run lint` (oxlint) przechodzi, jest w `build`-owej ścieżce weryfikacji i w CI; naruszenia w istniejącym kodzie naprawione.
- R3 Logger z redakcją w `core`, użyty zamiast `console.*`; testy redakcji.
- R4 Konfiguracja walidowana (Zod) w jednym miejscu; błędna konfiguracja kończy start czytelnym komunikatem.
- R5 Walidatory Zod w `core/validators/<pojęcie>/`; wszystkie trasy API przez `handle()` / `handlePublic()` z `parseBody()`; brak lokalnego `try/catch` w trasach.
- R6 scrypt N=2^15, r=8, p=3; stare skróty działają i są przeliczane przy logowaniu; testy.
- R7 Next.js 16.3.8; `npm run audit:gate` przechodzi; wyjątki jawne i z terminem.
- R8 `ui/src/backend/feedback` użyte w panelu.
- R9 Podkatalogi pojęć w `core/services` i `db/entities` bez zmiany zachowania.
- R10 Aplikacja buduje się i startuje bez dostępnej bazy.

## Kryteria akceptacji
- [x] AC1 `lint`, `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke`, `audit:gate` zielone; `check-boundaries` zachowane.
- [x] AC2 Test: logger nie wypisuje haseł, tokenów, ciasteczek, skrótów, nagłówka `Authorization`, także zagnieżdżonych i w błędach.
- [x] AC3 Test: wejście API odrzuca nieznane i nadmiarowe pola (brak mass assignment), zwraca 422 z `fields`.
- [x] AC4 Test: stary skrót scrypt (p=1) przechodzi logowanie i zostaje zastąpiony nowym; nowe skróty mają p=3.
- [x] AC5 Build bez bazy i bez `.env` przechodzi; `next start` bez bazy odpowiada na `/api/v1/public/restaurants/halka/menu` w trybie `memory`.
- [x] AC6 Żaden plik w `packages/*/src` nie zawiera `console.*` poza loggerem i skryptami; brak `any` i pustych `catch`.

## Ryzyka i otwarte pytania
- Aktualizacja Next.js 16.3.7 → 16.3.8 może zmienić zachowanie: pełna weryfikacja po niej.
- Przenoszenie plików jest mechaniczne, ale szerokie: tylko ścieżki względne wewnątrz pakietów; publiczne API pakietów (`index.ts`) bez zmian.
- Per-IP limiter logowania: decyzja właściciela (topologia serwera pośredniczącego).

## Realizacja
- Log: `.ai/runs/2026-10-15-engineering-standards.md`; dokument: `.ai/docs/engineering-standards.md`; lekcje: `adopting-a-foreign-standard`, `client-chosen-keys`, `config-fails-closed-and-boot-without-env`.
- **Dokumentacja:** adaptacja standardów z tabelą mapowania każdej reguły; oryginał zachowany w `.ai/docs/reference/`; sekcja §1.6 i §7 w `AGENTS.md`, wpisy w `AGENTS.md` pakietów, README, `docs/API_SPECIFICATION.md`, `.github/pull_request_template.md`.
- **Jakość:** `oxlint` (`npm run lint`, 131 reguł, ograniczenia importów między pakietami) w CI; 11 naruszeń naprawionych (4 × `console`, 4 × `any`, `prefer-const`, komponent tworzony w renderze, `console.debug` w mockupach).
- **Logowanie i konfiguracja:** `core/logging` (redakcja kluczy i wzorców w tekście, w tym skrót scrypt, JWT, `Bearer`, ciasteczko, adres bazy z hasłem), `core/config/env.ts` (Zod, zawodzi zamykająco), `app/server/{logger,env,startup}.ts`, `instrumentation.ts` (kończy proces kodem 1 przy błędnej konfiguracji).
- **Walidacja wejścia:** schematy Zod `strictObject` w `core/validators/<pojęcie>/`, `parseBody()` / `readUpload()`, `handlePublic()` obok `handle()`, jedno `guarded()`; wszystkie trasy API bez własnego `try/catch`.
- **Bezpieczeństwo:** scrypt p=1 → p=3 (OWASP) z przeliczaniem skrótów przy logowaniu; Next.js 16.3.7 → 16.3.8 (sześć podatności o wysokiej wadze); `npm run audit:gate` z jawną, datowaną listą wyjątków (`awilix → braces`, nieosiągalne i bez poprawki w ekosystemie).
- **Struktura:** podkatalogi pojęć w `core/services` i `db/entities` (16 plików, importy przeliczone skryptem; bez zmiany zachowania ani schematu).
- **Wspólne stany UI:** `EmptyState`, `ErrorMessage`, `LoadingMessage` w `ui/src/backend/feedback`, użyte w panelu.
- **Odstępstwa od oryginału:** patrz tabela w specyfikacji i w `.ai/docs/engineering-standards.md` §1 (m.in. kierunek zależności, koperta odpowiedzi, JWT, `makeCrudRoute`/`CrudForm`/`DataTable`/`apiCall`, zdarzenia, tabele w liczbie pojedynczej).
- **Błędy znalezione weryfikacją:** (1) parametry scrypt poniżej progu OWASP; (2) podatności w Next.js 16.3.7; (3) literówka w `DATA_SOURCE` cicho wybierała dane demo (także w produkcji); (4) słownik z kluczami od klienta gubił `constructor` i `__proto__` (walidacja i logger); (5) pole `rows[].fields` w imporcie przyjmowało dowolne klucze i zapisywało je w bazie; (6) własna regresja: build bez środowiska wywalał się na stronie `/` (`force-dynamic`); (7) kod błędu `too_few` dla liczby poniżej minimum; (8) logger zamazywał flagi logiczne po samej nazwie klucza; (9) szkielet ładowania był drugim landmarkiem `main`; (10) skrypt `boot:check` zależał od lokalnego `.env`; (11) trasa stołu popsuta na chwilę przez śmieciowy zalążek w pliku (wykryte i naprawione natychmiast).
- **Weryfikacja:** `lint` (0 błędów); `typecheck`; 282 testy jednostkowe w `core` i 28 w `db`; 47 integracyjnych na PostgreSQL; `schema:check`; `audit:gate`; `build` (także w czystym środowisku, bez bazy i bez `.env`); `boot:check` 10/10 (z `.env` i bez); `smoke` 155/155 w `memory` i `postgres`; w przeglądarce na PostgreSQL: pełny przepływ logowania, uprawnień i sfałszowanych formularzy oraz importu, QR i Setup po aktualizacji Next.js.
- **Otwarte (do właściciela):** limit prób logowania per IP + e-mail (decyzja o serwerze pośredniczącym); wyjątek audytu `awilix → braces` wygasa 2027-01-15.
