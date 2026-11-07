---
started: 2026-11-07 12:20
ended: 2026-11-07 13:30
agent: Claude Code / claude-sonnet-5-5 (pod-agent, worktree)
spec: brak — przegląd bezpieczeństwa i drobne poprawki nagłówków (bez zmiany zachowania widocznego dla użytkownika)
outcome: success (model zagrożeń, trzy granice sprawdzone bez luki, nagłówki poprawione; bramka zielona poza testami przeglądarkowymi, których tu nie da się uruchomić; bez PR, push i merge)
related: [.ai/runs/2026-11-05-tenant-isolation-e2e.md, .ai/runs/2026-11-06-e12-f2-invitations.md, .ai/runs/2026-10-25-agent-security-hardening.md]
---

# Lekcja 16 (bezpieczeństwo) zastosowana do Wine Match

## Zadanie
Zadanie domowe lekcji 16: model zagrożeń (Shostack, STRIDE), trzy granice dostępu sprawdzone na działającej instancji, skaner statyczny i skryptowy DAST z tego, co jest w repo, reguła „trzech sprawdzeń”, karty dowodowe. Warunki: tylko lokalna, jednorazowa instancja z danymi syntetycznymi; bez pobierania narzędzi; bez PR, push i merge.

## Przebieg
- Gałąź `sec/lesson-16-security-review` z `39d695b` (`main`). Dokumenty: `docs/security/threat-model.md` + `.mmd`, `docs/security/dast-coverage.md`.
- Środowisko: PostgreSQL 16.15 (Homebrew, własny katalog w scratchpadzie) na `127.0.0.1:50301`; instancja ręczna (`next start`, `127.0.0.1:50311`, baza `winematch_sec`, dane demo + `restaurant:create`) do sond, a testy e2e na własnej bazie `winematch_e2e` przez `TEST_DATABASE_URL`. Własny proces zatrzymany po PID (nie `pkill`).
- Wybór trzech granic (największy skutek, największa szansa, że istniejące testy ich nie dotykają): T-01 id obiektu innego tenanta pod własnym slugiem (istniejące testy sprawdzały tylko slug), T-02 szczeble hierarchii i pola spoza schematu, T-03 zaproszenie (pola formularza, flaga `platform`, drugie użycie) wraz z pokazem tylko do odczytu (T-03b).
- Wynik: **żadnej luki w kontroli dostępu**; za to trzy luki w nagłówkach (T-14, T-15) i dwie obserwacje (T-17 500 przy zepsutym kodowaniu ścieżki, T-20 seeder przy braku `NODE_ENV` tylko ostrzega).
- Decyzje podjęte za właściciela: (1) bez HSTS w aplikacji (proxy, E11, Q1); (2) CSP tylko częściowe: `frame-ancestors`, `base-uri`, `object-src`, `form-action`, bez `script-src` (T-16, Q2); (3) `X-Frame-Options: DENY` na całej aplikacji, nie tylko `/admin`; (4) test DAST jako test e2e (żyje w CI), nie nowy skrypt w `scripts/` (CODEOWNERS); (5) nowa grupa QA `security`; (6) model zagrożeń po angielsku (kolumny z polecenia), reszta procesu po polsku.
- Poprawka z nowym testem: `packages/app/next.config.ts` (`poweredByHeader: false`, nagłówki bazowe), test `security-headers.e2e.test.ts` czerwony na starej konfiguracji (12 padnięć: `X-Powered-By` obecny, brak `X-Frame-Options` na stronach gościa i API), zielony po (15 zielonych razem z `admin.e2e`). `npm run verify:regression` nie obsługuje e2e (dokumentacja skryptu), więc dowód czerwony/zielony zrobiony ręcznie: ten sam plik testu, ten sam build, stara i nowa konfiguracja.
- Dryf zależności: `node_modules` skopiowane z głównego checkoutu (`cp -c`), bo `npm` w środowisku ma wersję 10.9.9 (monorepo wymaga ≥ 11.6) i `npm ci` nie przejdzie; zainstalowany jest Next.js 16.3.8, nie 16.4.1 z `AGENTS.md` §1.1. Wyniki dotyczą tej wersji.

## Karty dowodowe (granice dostępu)

Wspólne pola: baza `39d695b`, commit z testami `daf1e09` (gałąź `sec/lesson-16-security-review`), 2026-11-07 12:44–13:05 CET, PostgreSQL 16.15 na `127.0.0.1:50301`, zbudowana aplikacja (`next build`, `next start`), dane syntetyczne: demo `halka` (konta publiczne demo) i `bistro-e2e` z `restaurant:create` (konta testowe z `new-restaurant.ts`). Dowód: `npm run test:e2e` w `packages/app` (plik `tests/e2e/access-boundaries.e2e.test.ts`), 4 testy zielone; każdy test porównuje całe ładunki API i skrót 12 tabel przed i po.

### Karta 1: izolacja tenantów po id obiektu (T-01)
- **Hipoteza:** użytkownik restauracji B, wysyłając id obiektu restauracji A pod własnym slugiem, może go odczytać lub zmienić (BOLA).
- **Zakres i ryzyko:** trasy `pairings/{id}`, `wines/{id}`, `imports/{ref}` (+ confirm), `team/{membershipId}`, `invitations/{id}`; ryzyko 2×3 (skutek: cudze dane i zapisy między najemcami).
- **Środowisko i konta:** Halka: `marta` (Wine Director), `tomasz` (GM); Bistro: `sonia` (Wine Director), `anna` (właściciel). Stan: staging dwóch importów, jedno zaproszenie, sprzątane w `afterAll`.
- **Sprawdzenie:** kontrola pozytywna po obu stronach (odczyt pairingów, przełączenie wina, odczyt importów, no-op zmiany roli, lista zaproszeń: 200); 11 zapisów z cudzym id pod własnym slugiem (obie strony); odczyt cudzego id pod własnym slugiem; odczyt i zapis pod cudzym slugiem (6 + 2 wywołania); stan po.
- **Oczekiwane:** cudze id pod własnym slugiem 404, cudzy slug 403 bez żadnej wartości cudzych danych w ciele, ładunki i skrót tabel bez zmian.
- **Faktycznie:** zgodnie z oczekiwaniem, wszystkie asercje zielone. **Mutacja:** w `PgImportRepository.find` zamiast `restaurant: restaurantId` filtr `restaurant: { $ne: … }` (usunięcie zakresu), przebudowa, ponowny bieg: test **czerwony** („import cancel: expected 204 to be 404”), po cofnięciu zielony. To dowód, że test potrafi zapaść.
- **Czego nie dowodzi:** tylko trasy HTTP z listy (nie strony RSC ani akcje serwerowe panelu, które używają tych samych serwisów, ale ich nie wołano); tylko sesje z jedną restauracją na konto (konto z członkostwem w dwóch restauracjach nie było testowane); nie sprawdza kanałów bocznych (czas odpowiedzi 404 vs 403); PostgreSQL bez RLS, więc izolacja jest wyłącznie w kodzie.
- **Decyzja / właściciel:** brak luki, test zostaje w CI; konto z dwoma członkostwami dopisane jako otwarte pytanie (rozważyć przy E14). Właściciel: opiekun repo.

### Karta 2: hierarchia ról (T-02)
- **Hipoteza:** manager lub Wine Director może awansować siebie lub innych, ruszyć właściciela, albo przemycić pole spoza schematu.
- **Zakres i ryzyko:** `team/{membershipId}` PATCH, `invitations` POST, odczyty listy; ryzyko 2×3.
- **Środowisko i konta:** Bistro: `anna` (właściciel), `marek` (GM), `sonia` (Wine Director).
- **Sprawdzenie:** kontrola pozytywna (właściciel: no-op 200; GM: zaproszenie Wine Director 201 i cofnięcie 204); 12 prób odmowy (GM: owner/manager, ruszenie właściciela, awans siebie; zaproszenie owner/manager; Wine Director: awans, zmiana właściciela, zaproszenie; przemycone `restaurantId`/`userId`; `platform: true`); odczyty zespołu i zaproszeń przez Wine Directora; stan po.
- **Oczekiwane:** 403 (hierarchia), 422 (zmiana siebie, pola spoza schematu), brak 2xx; ładunki zespołu i zaproszeń oraz skrót tabel bez zmian.
- **Faktycznie:** zgodnie z oczekiwaniem po jednej poprawce testu: awans samego siebie daje 422 (`SelfChangeError`), nie 403 (mapowanie w `api-auth.ts` `fromDomainError`), asercja poprawiona na faktyczne, zamierzone zachowanie.
- **Czego nie dowodzi:** nie próbowano wyścigu dwóch zmian ról (pokrywa test integracyjny `PgTeamRepository` z blokadą wiersza, nie ten); nie sprawdzono ostatniego właściciela przez HTTP (pokrywa `team.e2e`).
- **Decyzja / właściciel:** brak luki. Opiekun repo.

### Karta 3: zaproszenie i flaga platformy (T-03)
- **Hipoteza:** osoba z linkiem może wybrać rolę lub restaurację w formularzu, użyć linku drugi raz albo skorzystać z flagi `platform`.
- **Zakres i ryzyko:** `/admin/accept` (formularz bez JS), `invitation-rules.ts`, wiersz `auth_token`; ryzyko 2×3.
- **Środowisko i konta:** właściciel Bistro wystawia zaproszenie na `pawn@bound-e2e.example`; konto powstaje w teście, sprzątane w `afterAll`.
- **Sprawdzenie:** strona linku renderuje formularz (kontrola pozytywna); formularz wysłany z prawdziwymi polami plus podrobione `role=owner`, `restaurant=halka`, `restaurantId`, `platform=true`; ponowny post; wiersze `membership` konta (rola, restauracja, status) i zespół Halki; skrót tabel przed i po drugim użyciu.
- **Oczekiwane:** jedno członkostwo: Wine Director, aktywne, w Bistro; zespół Halki bez konta; drugi post na stronę „link nieważny”, skrót tabel bez zmian, strona linku 404.
- **Faktycznie:** zgodnie z oczekiwaniem. Ścieżka platformy (`inviteOwner`) nie ma wejścia HTTP (grep), więc flaga `platform` nie jest osiągalna z sieci; pokrywają ją tylko testy `core` i `db`.
- **Czego nie dowodzi:** wyścigu dwóch postów (pokrywa `invitations.e2e` AC24), przejęcia linku przed adresatem (T-04, zaakceptowane), tego, że przyszły E14 użyje flagi poprawnie.
- **Decyzja / właściciel:** brak luki; T-04 pozostaje zaakceptowanym ryzykiem do E12 F4. Opiekun repo.

### Karta 4: pokaz (demo) tylko do odczytu (T-03b / T-21)
- **Hipoteza:** metody zapisu na `/demo/*` lub zapis API bez sesji coś zmieniają albo ustawiają ciasteczko.
- **Zakres i ryzyko:** `/demo/roi`, `POST /api/v1/restaurants/halka/publish` bez sesji; ryzyko 1×1 (kalkulator nie czyta danych).
- **Środowisko:** `SHOWCASE_MODE=calculator`, bez konta.
- **Sprawdzenie:** GET strony 200 (kontrola pozytywna); POST, PUT, PATCH, DELETE; zapis API bez sesji; skrót 12 tabel przed i po.
- **Oczekiwane:** brak 5xx, brak `Set-Cookie`, API 401 `unauthenticated`, skrót bez zmian.
- **Faktycznie:** zgodnie z oczekiwaniem; uwaga: Next.js odpowiada na zapis do strony samą stroną (200), co zaakceptowano, bo nic nie jest zapisywane.
- **Czego nie dowodzi:** późniejszych faz pokazu (restauracja demo, F2 do F4, nie zbudowane); pojedyncze konto bez roli „demo” jeszcze nie istnieje.
- **Decyzja / właściciel:** brak luki. Opiekun repo.

## Weryfikacja
PostgreSQL 16.15 na `127.0.0.1:50301`, `TEST_DATABASE_URL`, Node 22.23.3, npm 10.9.9 (wymagane ≥ 11.6: `npm ci` niemożliwe, `node_modules` sklonowane z głównego checkoutu, Next.js 16.3.8).
- `npm run lint`: 0. `npm run typecheck`: bez błędów. `npm test`: core 741, db 84, ui 62, app 476, testkit 165 zielone.
- `npm run build`: OK. `npm run boot:check`: wszystkie kontrole OK. `npm run test:db`: 191 zielonych.
- `npm run test:e2e`: 53 testy zielone, w tym 4 `access-boundaries`, 5 `security-headers`, `team`, `invitations`, `tenant-isolation`, `showcase`, `health`, `observability`. **14 bloków padło i 39 testów pominięto wyłącznie dlatego, że `agent-browser` nie jest zainstalowany** (jedyny błąd w logu: `spawn agent-browser ENOENT`); te bloki (admin, home, KPI, opportunities, staff-*, usage, how-it-works, table-quantity) nie były uruchomione, a więc nowe nagłówki nie były sprawdzone w prawdziwej przeglądarce (CI to zrobi).
- `npm run smoke -- http://127.0.0.1:50311 halka` na instancji próbnej: wszystkie kontrole OK. `npm run check:context`: 0 błędów (11 ostrzeżeń o rozmiarze, istniejące). `npm run check:qa`: 92 scenariusze, powiązane. `npm run secrets:scan`: 21 trafień, wszystkie na allowliście. `npm run audit:gate`: high 0, critical 0.
- Nie uruchomione: CodeQL (tylko w GitHub), `verify:regression` (nie obsługuje e2e), `engine:matrix` (silnik bez zmian), przeglądarka przy 390/1440 px (brak `agent-browser`).

## Wynik
Co działa: trzy granice dostępu i pokaz wytrzymują atak z konta innego tenanta i niższej roli, z dowodem stanu po (ładunki i skrót tabel) i z mutacją, która czerwieni test. Nagłówki: bez `X-Powered-By`, `X-Frame-Options: DENY` i CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`) wszędzie, `Permissions-Policy`.
Dług i otwarte: T-16 CSP ze `script-src` (nonce), HSTS na proxy (E11), limity per IP (E21 F3), 500 przy zepsutym kodowaniu ścieżki (T-17), seeder przy braku `NODE_ENV` tylko ostrzega (T-20), konto z dwoma członkostwami bez testu (karta 1), sprawdzenie nowego CSP w przeglądarce i CodeQL w CI.
Pliki zmienione w obszarze CODEOWNERS (do przeglądu opiekuna): `AGENTS.md` (routing + jedna reguła w §6.1), `.ai/docs/engineering-standards.md` §10, `security-notes.md` §10.

## Lekcje
[2026-11-07-access-boundary-three-checks](../lessons/2026-11-07-access-boundary-three-checks.md)
