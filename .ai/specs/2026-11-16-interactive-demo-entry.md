---
status: in-progress
created: 2026-11-16
owner: Filip
related: [.ai/specs/2026-11-04-sales-demo-and-roi-calculator.md, .ai/specs/2026-11-15-vercel-hosting.md, docs/DEPLOYMENT.md, docs/security/threat-model.md, .ai/runs/2026-11-16-interactive-demo-entry-spec.md]
superseded_by:
author_model: not recorded
reviewed_by: not recorded (independent agent, model unknown)
---

# Łatwe wejście do interaktywnego dema (strona startowa `/start` i konta demo)

## Problem
Instancja demo na Vercelu (`ALLOW_DEMO_DATA=true`) ma działające konta demo z publicznym hasłem (`packages/core/src/demo/users.ts`), ale żeby przejść przez widoki (gość, „cały stół”, kelner, panel, kalkulator), trzeba znać adresy, e-maile i hasło. Właściciel chce **łatwo przeklikać się przez widoki demo**. Istniejący tryb `SHOWCASE_MODE=demo` jest celowo tylko do odczytu i bez logowania (R9 specyfikacji `2026-11-04-sales-demo-and-roi-calculator`), więc tego nie załatwia.

## Cel i zakres
**Najważniejsze (cel właściciela): przed-ekran `/start`**, z którego jednym kliknięciem wchodzi się w każdy widok demo i z którego w każdym widoku da się wrócić. **Drugorzędne:** karta „Konta demo” na `/admin/login`.

Obie rzeczy działają tylko w „trybie interaktywnym”: `ALLOW_DEMO_DATA=true` **oraz** `SHOWCASE_MODE` ≠ `demo` **oraz** (dla karty) w repozytorium istnieją konta demo. Bez zmian dla produkcji i dla trybu `demo`.

**Poza zakresem:** zmiana trybu `SHOWCASE_MODE=demo`; trwałość zapisów w pamięci (Q2); nowe konta i role, zmiana hasła demo; logowanie bez kliknięcia; zmiana blokady konta.

## Wymagania
- **R1 Tryb interaktywny (jedna funkcja).** `isInteractiveDemo(env)` w `packages/app/src/server/` (czysta, z `env()`): `allowDemoData && showcaseMode !== 'demo'`. Używają jej strona `/start`, karta, akcja `loginAsDemo`, `/`, layout gościa i nagłówki. `AppEnv` dostaje pole `allowDemoData: boolean` (dziś go nie ma; sprawdzone: `packages/app/src/server`, `core/src/config/env.ts`) wraz z testem w `packages/core/tests/env.test.ts`.
- **R2 Strona `/start`.** Trasa w grupie `(showcase)` (Q1), z **własnym nagłówkiem** (istniejący `ShowcaseHeader` linkuje bezwarunkowo do `/demo/tour` i `/demo/roi`, a w trybie interaktywnym kalkulator może być wyłączony). Odnośniki, każdy z `?lang=` bieżącego języka:
  - gość: `/r/{slug}` i „cały stół” `/r/{slug}/table`;
  - kelner: `/r/{slug}/staff` i „cały stół” `/r/{slug}/staff/table`;
  - panel: przyciski „Zaloguj jako …” (R5) dla kont z dostępem do panelu (Marta, Tomasz);
  - kalkulator `/demo/roi` tylko gdy `SHOWCASE_MODE=calculator` (inaczej link ukryty);
  - QR (`/admin/{slug}/qr`) **nie** jest linkiem na `/start`: wymaga sesji (bez niej przekierowanie na logowanie), więc link do QR pojawia się dopiero po zalogowaniu (jest w pasku bocznym panelu) albo jest pomijany.
  `{slug}` = `env().demoRestaurantSlug`. `/start` jest dla restauracji demo; gdy `demoRestaurantSlug` ≠ `halka` (konta i dane demo są dziś tylko dla `halka`), `/start` zwraca 404 (zapisane, nie rozstrzygane inaczej). `/start` nic nie zapisuje (reguła limitów niepotrzebna).
- **R3 Warunek pokazania i bezpieczeństwo.** `/start`, karta i `loginAsDemo` wymagają trybu interaktywnego (R1). Uzasadnienie poprawione: **produkcja nie zawodzi zamykająco** dla PostgreSQL: `packages/core/src/config/env.ts` (ok. l. 137-138) wymaga `ALLOW_DEMO_DATA=true` tylko dla `DATA_SOURCE=memory`, więc `ALLOW_DEMO_DATA=true` + `postgres` przechodzi walidację. Dlatego sama flaga nie wystarcza: karta pokazuje **tylko konta z `DEMO_USERS`, które faktycznie istnieją w repozytorium** (sprawdza to serwis, nie strona), a `/start` nie pokazuje przycisków „Zaloguj jako” dla kont nieistniejących. Test: postgres + flaga, brak kont demo → brak karty i przycisków.
- **R4 Ostrzeżenie.** Na karcie i na `/start` zdanie, że to dane demonstracyjne, a zmiany mogą zniknąć (zapisy w pamięci są per instancja funkcji; Q2). Na karcie także: po 5 błędnych próbach konto jest blokowane na 15 minut (`DEFAULT_AUTH_CONFIG`: `maxFailedAttempts: 5`, `lockMinutes: 15`), a limit `login` obowiązuje; ponieważ hasło jest publiczne, czytelny komunikat tłumaczy, że blokada dotyczy wszystkich odwiedzających. Blokadę zostawiamy (to demo). Na Vercelu wymagane `TRUSTED_PROXY_HOPS` (do opisania w `docs/DEPLOYMENT.md` §17, wartość z F0 specyfikacji Vercela).
- **R5 Akcja `loginAsDemo(form)`** (`(admin)/admin/auth-actions.ts`).
  - Przyjmuje wyłącznie `key` z `DEMO_USERS` (nieznany klucz = odmowa); nie przyjmuje e-maila ani hasła z formularza.
  - `DEMO_PASSWORD` czytane po stronie serwera, **nigdy nie renderowane w HTML**.
  - Wspólny `signIn(email, password, next)` wyciągnięty z `login`: limit `login`, blokada konta i dziennik bez kopiowania kodu.
  - Akcja **sama sprawdza warunek** (tryb interaktywny, istnienie konta), bo akcje serwerowe wywołuje się po identyfikatorze bez karty. W trybie `demo` odmawia (`ShowcaseReadOnlyError`) i nie czyta `DEMO_PASSWORD`; na instancji bez flagi odmawia tak samo jak błędne dane.
  - Sukces: 303 do `/admin/{slug}`. Rola `waiter` nie ma `panel.view` (`AuthService.login()` zwraca `NoPanelAccessError`), więc **karta i `/start` pokazują tylko konta z dostępem do panelu** (Marta, Tomasz); kelner dostaje link do `/r/{slug}/staff`.
  - Wpis w `scripts/check-pages.allowlist.json`: `loginAsDemo` (drzwi publiczne z uzasadnieniem: hasło demo jest publiczne, akcja sama sprawdza tryb i konto, nie przyjmuje slugu) oraz zaktualizowany tekst wpisu dla `login/page.tsx` (strona czyta teraz także konfigurację i listę kont demo).
- **R6 Dane kont bez hashy.** `demoAccounts()` w `packages/app/src/server/` zwraca `{ key, name, role, email }` (bez `passwordHash`) tylko dla kont istniejących w repozytorium i z dostępem do panelu. Do komponentów i HTML nie trafia nic więcej. Test: HTML `/start` i `/admin/login` nie zawiera `scrypt$` ani wartości `DEMO_PASSWORD` w żadnej konfiguracji.
- **R7 Nagłówki i język.**
  - `next.config.ts`: `Cache-Control: private, no-store` i `X-Robots-Tag: noindex, nofollow` także dla `/start` (dziś tylko `/demo/:path*`).
  - `noindex` w metadanych dla **całej instancji interaktywnej** (dziś `robots` tylko przy `showcaseMode==='demo'` w `(guest)/layout.tsx` i `admin/login/page.tsx`; `(showcase)/layout.tsx` już ma `noindex`).
  - `proxy.ts`: `matcher` dostaje `/start` (dziś `['/admin/:path*', '/r/:path*', '/demo/:path*']`, więc `/start` miałby zawsze `en`). To **odstępstwo od R12 specyfikacji `2026-11-04-sales-demo-and-roi-calculator`** („reszta bez zmian”), odnotowane tu i w Realizacji. Testy: `?lang=pl`, `Accept-Language`, domyślnie `en`.
- **R8 Droga powrotna do `/start`.**
  - Widoki gościa w trybie interaktywnym: pasek „Dane demonstracyjne / Wróć do startu” (wariant `DemoRibbon` z nowym kluczem słownika; link niesie tylko `lang`, jak dziś w trybie `demo`).
  - Panel: mały link „Start dema” w nagłówku panelu (tylko tryb interaktywny).
  - `/` (`(guest)/page.tsx`, dziś przekierowanie do `/r/{slug}`) w trybie interaktywnym kieruje do `/start`; poza nim bez zmian. Rekomendacja przyjęta przez właściciela w czacie 2026-11-16. E2E `home.e2e.test.ts` nie dotyczy (instancja e2e bez flagi).
- **R9 i18n i N02.** Klucze karty pod `t.admin.login`; klucze `/start` i paska pod `t.showcase.*` (gałąź objęta testem N02 w `tests/unit/showcase.test.ts`). Test HTML `/start` w PL i EN: brak `/\bAI\b|sztuczn/i`. „Zaloguj jako” używa reguły limitów `login`.
- **R10 Dokumentacja i bramki.**
  - `docs/DEPLOYMENT.md`: §17 „Vercel: instancja demo” (po scaleniu #154) i §12 „Instancja demo” (obecna numeracja: demo §12, próbna §13); `docs/SCREEN_SPECIFICATION.md`: A0 Login (ok. l. 288) zaktualizowany, `/start` jako nowy ekran z nowym kodem; `CHANGELOG.md`.
  - `check:qa`: scenariusz dla każdego nowego `it` w `*.e2e.test.ts` (obszary np. `admin-015`, `guest-016` w `.ai/qa/INDEX.md`; ostatnie istniejące to `admin-014`, `guest-015`).
  - `check:pages`: wpisy z R5.
  - `docs/security/threat-model.md`: nowy wiersz (kolejny wolny numer; dziś ostatni T-36) o publicznym haśle i kontach demo na instancji interaktywnej z mitygacjami R1/R3/R5/R6, oraz odniesienie z T-08 (konta demo na prawdziwej instalacji), T-21 (showcase) i T-36 (pozostałe drzwi panelu).
  - Drzwi `loginAsDemo` w `access-boundaries*.e2e` (instancja z flagą, patrz Projekt).

## Kryteria akceptacji
- [ ] **AC1 (R2, R5)** Na instancji interaktywnej `/admin/login` pokazuje kartę z **dwoma** kontami z dostępem do panelu (Marta: Wine Director, Tomasz: General Manager; kelner bez karty i bez przycisku, a `/start` linkuje kelnera do `/r/halka/staff`); „Zaloguj jako” Tomasz zwraca 303 do `/admin/halka` z sesją `tomasz@halka.pl`; błędne hasło w zwykłym formularzu nadal odmawia i liczy próby (blokada po 5/15 min).
- [ ] **AC2 (R2, R8)** Na instancji interaktywnej na danych demo `/start` (200, PL i EN) zawiera linki, a odpowiedzi wynoszą: `/r/halka` 200; `/r/halka/table` 200; `/r/halka/staff` 200; `/r/halka/staff/table` 200; `/demo/roi` 200 przy `SHOWCASE_MODE=calculator` (przy innym link nieobecny, a adres 404); „Zaloguj jako” 303 do `/admin/halka`; `/admin/halka/qr` bez sesji przekierowuje na logowanie (link do QR nie ma na `/start`); `/` przekierowuje na `/start`; ribbon i link w panelu prowadzą do `/start`. Uzgodnione z `vercel-hosting` R7/R8 (flaga „bez QR” na demo i podglądach): jeśli flaga jest wdrożona, QR jest też niedostępny po zalogowaniu i jest pomijany, test dopasowany.
- [ ] **AC3 (R3, R5, R6)** W żadnej konfiguracji HTML (`/start`, `/admin/login`, widoki gościa) nie zawiera wartości `DEMO_PASSWORD` ani `scrypt$`. Test jednostkowy/SSR dla konfiguracji: produkcja bez flagi (brak karty, `/start` 404), memory + flaga, **postgres + flaga bez kont demo (brak karty)**, `SHOWCASE_MODE=demo` (brak karty, `/start` 404), `calculator`. Akcja `loginAsDemo` na instancji bez flagi odmawia; w trybie `demo` odmawia (`ShowcaseReadOnlyError`) i nie czyta `DEMO_PASSWORD`; nieznany `key` odmawia.
- [ ] **AC4 (R4)** Zdanie o danych demonstracyjnych i komunikat o blokadzie są na karcie i na `/start` w PL i EN.
- [ ] **AC5 (R7)** `/start` zwraca `Cache-Control: private, no-store` i `X-Robots-Tag: noindex, nofollow`; strony instancji interaktywnej mają `noindex`; `/start?lang=pl` i `Accept-Language: pl` dają polski, bez parametru angielski (test `proxy`).
- [ ] **AC6 (R9)** Test N02 obejmuje klucze `/start`; HTML `/start` PL/EN bez `/\bAI\b|sztuczn/i`.
- [ ] **AC7 (przypadki brzegowe)** Zachowanie sprawdzone w każdym przypadku: (a) demo na postgres po `db:seed` (konta istnieją, **opublikowane menu istnieje**: `DemoSeeder.ts` zapisuje wersję 1; potwierdzić testem, że `/r/halka` i `/r/halka/table` dają 200, a gdy menu nie jest opublikowane, `/start` nie udaje, że linki działają) i demo w pamięci; (b) kalkulator wyłączony: link ukryty; (c) locale: `?lang` i `Accept-Language`; (d) `demoRestaurantSlug` ≠ `halka`: 404.
- [ ] **AC8 (R10)** Dokumenty (R10), scenariusze QA, `check:pages`, wiersz modelu zagrożeń, drzwi `loginAsDemo` w `access-boundaries*.e2e`; `lint`, `typecheck`, `test`, `build`, `check:context`, `check:qa`, `check:pages`, `secrets:scan`, CI zielone.

## Projekt rozwiązania
Kolejność: (1) `core`: `allowDemoData` w `AppEnv` + test; serwis zwracający istniejące konta demo (port już istnieje; bez nowych metod, jeśli wystarczy `findUserByEmail`, inaczej nowa metoda portu, kontrakt, pamięć i PostgreSQL wg AGENTS.md §1.3). (2) `app/src/server/`: `isInteractiveDemo()`, `demoAccounts()`. (3) `auth-actions.ts`: `signIn()` wyciągnięty z `login`, `loginAsDemo`. (4) Strona `(showcase)/start/page.tsx` z własnym nagłówkiem, karta w `admin/login/page.tsx`, ribbon w `(guest)/layout.tsx`, link w nagłówku panelu, przekierowanie w `(guest)/page.tsx`, słowniki `en.ts`/`pl.ts`. (5) `proxy.ts` matcher, `next.config.ts` nagłówki, `noindex` metadane. (6) Testy: `core/tests/env.test.ts`; `app/tests/unit/` (konfiguracje z AC3, akcja, `proxy`, N02, brak `scrypt$`); e2e na **osobnej instancji** z flagą (wzór: `showcase.e2e.test.ts` startuje dodatkowe instancje, główna instancja e2e ma `SHOWCASE_MODE=calculator` i nie ma flagi), z nowymi scenariuszami QA. (7) Dokumenty i bramki (R10).

Pliki: `packages/core/src/config/env.ts`, `packages/app/src/proxy.ts`, `packages/app/next.config.ts`, `packages/app/src/app/(showcase)/start/`, `(guest)/layout.tsx`, `(guest)/page.tsx`, `(guest)/_components/demo-ribbon.tsx`, `(admin)/admin/login/page.tsx`, `(admin)/admin/auth-actions.ts`, nagłówek panelu, `packages/app/src/i18n/{en,pl}.ts`, `scripts/check-pages.allowlist.json`, `docs/`, `.ai/qa/`.

## Ryzyka i otwarte pytania
Wszystkie rekomendacje poniżej: **rekomendacja przyjęta przez właściciela w czacie 2026-11-16** (formalna akceptacja specyfikacji, `approved`, nadal po stronie człowieka).
- **Q1 Gdzie strona startowa.** `/start` w grupie `(showcase)` z własnym nagłówkiem (R2). **Przyjęte.**
- **Q2 Trwałość i trzy bazy (spójność z `.ai/specs/2026-11-15-vercel-hosting.md`).** W pamięci każda instancja funkcji ma własny stan, więc zapisy w panelu znikają i rozjeżdżają się. Pełne demo „do klikania” działa na osobnej bazie demo: **trzy bazy**: produkcyjna, testowa dla Preview (R8 Vercela: hasła niepubliczne, bez `ALLOW_DEMO_DATA`) i demo (`db:migrate`, `db:seed` z `ALLOW_DEMO_DATA=true`, nigdy produkcyjna). Karta i `/start` działają w obu trybach (pamięć i postgres). **Przyjęte.**
- **Q3 Publiczny czy chroniony; trzy projekty Vercela.** Konta demo mają publiczne hasło. Rekomendacja: **trzeci projekt Vercela „interaktywne demo” (chroniony)** obok produkcji i publicznego demo tylko do odczytu (`SHOWCASE_MODE=demo`). To rozszerza `vercel-hosting`, którego R1 mówi o dwóch projektach (`wine-match`, `wine-match-demo`), R9 o jednym demo w pamięci tylko do odczytu, a §F1 o dwóch projektach: ta specyfikacja wymaga tam dopisku (**osobna zmiana tamtej specyfikacji po decyzji, tutaj jej nie edytujemy**). Ochrona wdrożeń zależy od wyniku F0 (zakres Deployment Protection w wybranym planie, `docs/DEPLOYMENT.md` §17). **Przyjęte.**
- **Q4 `/` w trybie interaktywnym** kieruje do `/start` (R8). **Przyjęte.**
- **Ryzyko (poprawione):** nie „produkcja nie wystartuje z flagą”, lecz: na PostgreSQL `ALLOW_DEMO_DATA=true` przechodzi walidację. Łagodzenie: R3 (flaga + tryb + istnienie kont w repozytorium), R5 (akcja sama sprawdza warunek), AC3 (w tym postgres + flaga bez kont); konta demo na prawdziwej instalacji pozostają ryzykiem T-08, dlatego `loginAsDemo` nie loguje, jeśli konto nie istnieje.
- **Ryzyko:** publiczne hasło + blokada konta (5 prób/15 min) pozwala anonimowi zablokować konto demo wszystkim; zostawione świadomie (R4), bez `TRUSTED_PROXY_HOPS` limity liczą jednego klienta na wszystkich (`docs/DEPLOYMENT.md` §4).
- **Otwarte (do implementacji):** czy `findUserByEmail` wystarcza do „konto istnieje” bez nowej metody portu (jeśli nie, kontrakt repozytoriów); czy flaga „bez QR” z `vercel-hosting` R7 będzie wdrożona przed tą funkcją.

## Przegląd niezależny (AGENTS.md §3)
Wykonany przez niezależnego agenta (model niezapisany). Każdą tezę sprawdzono w kodzie przed wpisaniem; rekomendacje przyjął właściciel w czacie 2026-11-16.

| # | Teza przeglądu | Sprawdzenie | Skutek |
|---|---|---|---|
| 1 | R3 „produkcja zawodzi zamykająco” nieprawdziwe dla PostgreSQL | prawda: `core/src/config/env.ts` l. 137-138 wymaga flagi tylko dla `memory` | R1, R3, Ryzyko, AC3 |
| 2 | Kelner nie loguje się do panelu | prawda: `auth-service.ts` l. 49-50 (`panel.view`, `NoPanelAccessError`) | R2, R5, AC1 |
| 3 | `proxy.ts` matcher bez `/start` | prawda: `['/admin/:path*', '/r/:path*', '/demo/:path*']` | R7, AC5 (odstępstwo od R12 spec. sprzedażowej) |
| 4 | Brak drogi powrotnej do `/start` | prawda: `DemoRibbon` tylko dla `showcaseMode==='demo'`, `/` kieruje do `/r/{slug}` | R8 |
| 5 | Akcja po id bez karty; potrzebny wspólny `signIn` | prawda: `login` w `auth-actions.ts` ma limit i blokadę w jednym ciele; `check-pages.allowlist.json` ma wpis `login` | R5 |
| 6 | `passwordHash` w `DEMO_USERS`, brak `allowDemoData` w `AppEnv` | prawda (hash w `users.ts`; brak pola w `env.ts`) | R1, R6; „bez zmian w core” usunięte |
| 7 | `ShowcaseHeader` linkuje bezwarunkowo; nagłówki tylko dla `/demo` | prawda: `showcase-header.tsx`, `next.config.ts` l. 47; `noindex` w `(guest)/layout.tsx` i `login/page.tsx` tylko dla `demo` | R2, R7 |
| 8 | QR wymaga sesji | prawda: `(admin)/admin/[slug]/qr/page.tsx` | R2, AC2 |
| 9 | Numeracja dokumentów | prawda: `DEPLOYMENT.md` §17 Vercel, §12 demo, §13 próbna; A0 w `SCREEN_SPECIFICATION.md` l. 288 | R10 |
| 10 | Bramki `check:qa`/`check:pages`, model zagrożeń | prawda: `.ai/qa/INDEX.md` (ostatnie `admin-014`, `guest-015`), allowlista, `threat-model.md` T-08/T-21/T-36 | R10 |

Sprawdzone: nieprawda: brak odrzuconych tez.

## Zmiany po przeglądzie właściciela 2026-11-16
Właściciel obejrzał wdrożone demo; poniższe decyzje są wiążące i zmieniają zatwierdzone wymagania (status specyfikacji bez zmian). Realizacja: gałąź `fix/demo-entry-feedback`, log `.ai/runs/2026-11-16-demo-entry-feedback.md`.

1. **Przyciski „Zaloguj jako …” wyglądały na nieklikalne** (dotyczy R2/R5, karta i `/start`). Przyczyna: na karcie wariant `outline` (cienka ramka, bez wypełnienia), a `Button` z `@wine-match/ui` nie ustawiał kursora (Tailwind 4 daje `cursor: default` przyciskom). Teraz: wariant domyślny (pełne tło `primary`, kontrast 10,9:1 jasny i 8,5:1 ciemny motyw wg tokenów), rozmiar `lg`, `min-h-11`, stany hover i focus z systemu designu, a `cursor-pointer` jest w bazie `Button` (lokalna poprawka w `packages/ui/AGENTS.md`).
2. **R8 dla `/` zmienione.** `/` znów jest widokiem gościa `/r/{slug}` na każdej instancji; przekierowanie do `/start` w trybie interaktywnym usunięte (Q4 odwołane). W zamian pasek w widoku gościa (`DemoRibbon`, wariant `start`) ma wyraźny przycisk „Demo: wybierz widok” / „Demo: choose a view” do `/start?lang=`: pełne tło `surface` z tekstem `ink` (17,3:1) na pasku `ink`, `min-h-10`, pasek w przepływie strony (nie sticky, więc nie zasłania treści) i zawija się przy 390 px.
3. **R3/R5/R6/AC3 zmienione: login i hasło kont demo są na UI.** Na `/start` i na karcie `/admin/login` pod każdym przyciskiem stoją e-mail i hasło demo jako tekst do skopiowania (`select-all`). Powód: ktoś, kto chce wejść zwykłym formularzem albo z innego urządzenia, musi znać dane; hasło demo jest publiczne z założenia (`docs/DEPLOYMENT.md` §12/§17). Granice, które zostają: tylko tryb interaktywny (`isInteractiveDemo`), tylko Marta i Tomasz, tylko konta istniejące w repozytorium (`demoAccounts`), hasło z `DEMO_PASSWORD` w `core`, formularz „Zaloguj jako” nadal niesie wyłącznie klucz i język, **nigdy** `scrypt$`/hash w HTML, **nigdy** hasło poza trybem interaktywnym (produkcja bez flagi, `SHOWCASE_MODE=demo`, postgres z flagą bez kont demo), **nigdy** hasło w logach. Nowe brzmienie AC3: hasło jest w HTML `/start` i `/admin/login` wyłącznie w trybie interaktywnym; brak go w produkcji bez flagi, w trybie `demo`, na postgres bez kont demo i w widokach gościa; `scrypt$` nie występuje w żadnej konfiguracji. `loginAsDemo` bez zmian. Dokumenty: `docs/DEPLOYMENT.md` §12/§17, `docs/SCREEN_SPECIFICATION.md` (A0, DM6), `docs/security/threat-model.md` (T-37).

## Realizacja
(Stan: `in-progress`; zamknięcie po scaleniu, zgodnie z poleceniem.) Log: `.ai/runs/2026-11-16-interactive-demo-entry-impl.md`. Commity na gałęzi `docs/interactive-demo-entry-rev` (core, app, testy, e2e z dokumentacją).

Odstępstwa i decyzje:
- **R12 specyfikacji `2026-11-04-sales-demo-and-roi-calculator`:** `/start` dodany do `matcher` w `proxy.ts` (inaczej strona zawsze byłaby po angielsku); test `server.test.ts` zaktualizowany.
- **Otwarte pytanie „czy `findUserByEmail` wystarcza”:** wystarczył istniejący port, więc bez zmiany portu i kontraktu; dodana metoda serwisu `AuthService.panelAccountsAmong(emails)` (istnienie konta i `panel.view`), bo zapytanie o istnienie ma robić serwis, nie strona.
- **Język po „Zaloguj jako”:** formularz niesie ukryte pole `lang`; akcja zapisuje ciasteczko `wm_lang` (tylko `pl`/`en`), żeby panel otworzył się w języku wybranym na `/start`. Poza specyfikacją, drobne; cel: spójność języka.
- **Karta na `/admin/login` i `/start`:** nowy kod ekranu **DM6** (`docs/SCREEN_SPECIFICATION.md`, `docs/SCREEN_MAP.md`); modelu zagrożeń dotyczy wiersz **T-37**.
- **Flaga „bez QR” z `vercel-hosting` R7:** nie wdrożona w tym repozytorium, więc test AC2 nie zakłada jej obecności (QR i tak nie jest linkowany z `/start`).
- **Link w nagłówku panelu:** dwa warianty tego samego linku (pasek górny od `lg`, kolumna boczna poniżej `lg`), bo pasek górny jest ukryty na wąskich ekranach.
- **Niezweryfikowane:** widok 390 px i 1440 px w przeglądarce (brak `agent-browser` i dostępu do pobrania Chrome w środowisku agenta); `home.e2e.test.ts` (wymaga przeglądarki; i tak nie dotyczy instancji bez flagi).
