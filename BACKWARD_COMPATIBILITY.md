# Zgodność wsteczna — chronione kontrakty

Ten plik wymienia powierzchnie Wine Match, na których polegają ludzie, wydrukowane materiały albo inne części systemu. Zmiana każdej z nich to `risk-high` (patrz [SDLC.md](SDLC.md)). Review (`om-code-review`) sprawdza diff względem tej listy, a skille implementujące ostrzegają, gdy zmiana ją narusza.

**Zasada ogólna:** dodawanie jest bezpieczne (nowe pole w odpowiedzi, nowa trasa, nowa kolumna z wartością domyślną). Usunięcie, zmiana nazwy, zmiana typu albo znaczenia jest **zmianą łamiącą** i wymaga ścieżki opisanej przy danej powierzchni oraz notatki „💥 Breaking” w opisie PR-a.

Wszystkie pakiety są `private` (wersja 0.2.0) i nie są publikowane do npm, więc wersjonowanie pakietów nie jest dziś kontraktem. Kontraktem jest to, co widzą goście, personel, wydrukowane kody QR i dane w bazie.

## 1. Adresy gościa i kody QR — najwyższy priorytet

Kod QR na stoliku to fizyczny wydruk, którego nie da się zaktualizować.

| Element | Gdzie | Co jest zmianą łamiącą |
|---|---|---|
| Adres QR `PUBLIC_BASE_URL/r/{slug}` | [packages/app/src/server/qr.ts](packages/app/src/server/qr.ts) `guestUrl()` | zmiana ścieżki `/r/{slug}`, zmiana sluga restauracji |
| Strony gościa `/r/[slug]`, `/menu`, `/dish/[dishId]`, `/dish/[dishId]/wines`, `/wine/[wineId]`, `/selected/[wineId]`, `/table`, `/table/result`, `/staff`, `/staff/table` (G11 „Cały stolik” kelnera, od 2026-10-18, spec `2026-10-16-whole-table-waiter-path` F2; parametry `dish` / `dishes`, `wine` — wino z wyniku stołu, inne ignorowane — `styles`, `maxPrice`, `lang`, `sid`; `serving` ignorowany), `/how-it-works` (G12 „Jak dobieramy wino”, od 2026-10-18, spec `2026-10-16-how-it-works-explanations`; parametry jak na pozostałych stronach: `lang`, `sid`, preferencje) | `packages/app/src/app/(guest)/` | usunięcie lub przeniesienie trasy, zmiana formatu `dishId` / `wineId` |
| Parametry URL gościa: `serving`, `styles` (lista po przecinku w stałej kolejności), `maxPrice`, `weight`, `mood`, `dish`, `dishes`, `table`, `sheet`, `wine` (tylko G11, od 2026-10-18), `people` (od 2026-10-18, spec `2026-10-16-whole-table-waiter-path` F4: liczba osób przy stole na `/table`, `/table/result`, `/wine/{id}?table=…`, `/selected/{id}?table=…`, `/staff/table`; liczba całkowita 2–12, inna wartość lub pusta = brak wyboru i brak ilości — domyślnej liczby nie ma), `lang` (`pl` / `en`, od 2026-10-15; inna wartość jest ignorowana, link bez `lang` dostaje język przeglądarki), `sid` (od 2026-10-16, spec `2026-10-15-guest-usage-events`: anonimowa sesja gościa, UUID v4 małymi literami, na końcu każdego linku gościa i w ukrytym polu formularzy GET; brak lub niepoprawny = nowa sesja, adres bez `sid` działa jak dotąd; nazwy `sid` nie zmieniamy — wolno ją kiedyś ignorować, nie usuwać z akceptowanych), `code` (tylko G9 `/staff`, od 2026-10-18, spec `2026-10-16-recommendation-code` F2: kod polecenia w formacie z §3, dowolna wielkość liter, spacje, `-`, `#`, prefiks `kod`/`code`) z komunikatem po akcji `marked` (`confirmed` / `undone`) i `codeError` (`not_found`; inne wartości ignorowane) | [packages/core/src/guest/prefs.ts](packages/core/src/guest/prefs.ts), [packages/core/src/recommendation-code/code-format.ts](packages/core/src/recommendation-code/code-format.ts) | zmiana nazwy lub wartości; zapisane i udostępnione linki przestają działać |
| Przekierowanie `/` → `/r/{DEMO_RESTAURANT_SLUG}` | `packages/app/src/app/(guest)/` | zmiana domyślnego celu bez zmiany konfiguracji |

**Ścieżka:** stary adres musi dalej działać jako przekierowanie 308 na nowy, bezterminowo (wydruki żyją latami). Przykład: `/r/{slug}/dish/{dishId}` (dawny ekran dania G2) od 2026-10-15 przekierowuje 308 na `/r/{slug}/dish/{dishId}/wines` z całym query (`next.config.ts` → `redirects()`). Zmiana sluga restauracji wymaga przekierowania ze starego sluga albo świadomej decyzji właściciela restauracji o ponownym druku kodów, zapisanej w PR-ze.

## 2. REST API `/api/v1`

Pełna specyfikacja: [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md). Wersja jest w ścieżce (`/api/v1`).

| Element | Co jest zmianą łamiącą |
|---|---|
| Trasy publiczne: `GET /dishes/{dishId}/recommendations`, `GET /public/restaurants/{slug}/menu`, `POST /recommendations/table`, `GET /import-samples/{menu\|wines}` | usunięcie trasy, parametru zapytania, pola odpowiedzi; zmiana typu pola; zawężenie dozwolonych wartości (np. `limit` 1..6) |
| Trasy z sesją: `/auth/*`, `/restaurants/{slug}/pairings`, `/bulk-decision`, `/publish`, `/qr`, `/pairings/{id}`, `/wines/{id}`, `/imports/*` | jak wyżej, plus zmiana wymaganego uprawnienia |
| Kształt błędu `{ error: { code, message, fields? } }` i kody (`unknown_field`, `invalid_json`, `payload_too_large`, kody importu…) | zmiana kształtu, usunięcie lub zmiana znaczenia kodu |
| Mapowanie błędów na statusy HTTP (`fromDomainError` w [packages/app/src/server/api-auth.ts](packages/app/src/server/api-auth.ts)) | zmiana statusu dla istniejącego błędu |
| Nagłówki: `X-CSRF-Token`, `If-Match` / `ETag` (428 / 400 / 409), `Cache-Control` tras publicznych | usunięcie lub zmiana semantyki |
| `tier`: `sommelier_primary` \| `sommelier` \| `engine` | usunięcie lub zmiana nazwy wartości |

**Ścieżka:** dodawaj pola i trasy w `v1`. Zmianę łamiącą wprowadź jako nową trasę albo `/api/v2`, utrzymując `v1` przez co najmniej jedno wydanie z wpisem „deprecated” w `docs/API_SPECIFICATION.md`. Specyfikacja (`.ai/specs/`) jest wymagana zawsze.

## 3. Schemat bazy danych i migracje

PostgreSQL + MikroORM, migracje w `packages/db/src/migrations/` (`Migration<YYYYMMDDhhmmss>_<nazwa>.ts`, każda z `up` i `down`).

| Element | Co jest zmianą łamiącą |
|---|---|
| Zastosowane migracje | **każda edycja**: migracje są tylko dopisywane (AGENTS.md §1.3) |
| Tabele `restaurant`, `dish`, `wine`, `pairing`, `sommelier_decision`, `published_version`, `guest_interaction`, `import_job`, `app_user`, `membership`, `session`, `opportunity_dismissal`, `recommendation_code` | usunięcie lub zmiana nazwy tabeli albo kolumny, zmiana typu, dodanie `NOT NULL` bez wartości domyślnej |
| `sommelier_decision` | edycja lub usuwanie wierszy: to dziennik tylko do dopisywania |
| `session` przechowuje tylko skrót tokenu | zapis tokenu jawnym tekstem |
| Identyfikatory UUID, daty `timestamptz`, miękkie usuwanie `deletedAt` | zmiana typu klucza lub rezygnacja z miękkiego usuwania |

**Kolumny addytywne z 2026-10-15** (spec `2026-10-15-bilingual-content`, migracja `Migration20261015140000_bilingual_content`): `dish.translations`, `wine.translations`, `restaurant.translations` (jsonb not null default `'{}'`), `pairing.comment_translations` (jsonb not null default `'{}'`), `restaurant.content_locale` (text not null default `'en'`). Kształt JSON (`{pl?: {…}, en?: {…}}`) i nazwy pól w nim są kontraktem jak kolumny. Migawka `published_version.snapshot` ma odtąd opcjonalne `content` i `pairings[].commentTranslations`; migawka bez nich jest czytana jako „bez tłumaczeń”.

**Tabela addytywna z 2026-10-16** (spec `2026-10-16-sommelier-opportunities`, F1, migracja `Migration20261016152214_opportunity_dismissal`): `opportunity_dismissal` (zignorowane okazje sommeliera); istniejące tabele bez zmian. Kontraktem są nazwy kolumn, unikalność (`restaurant_id`, `opportunity_key`), format klucza (`opportunityKeySchema`) i pięć nazw w `CHECK` na `rule` — dodanie nazwy to nowa migracja, usunięcie lub zmiana nazwy jest łamiące. `down` usuwa tabelę: zignorowania nie są danymi biznesowymi, po wycofaniu okazje wracają.

**Tabela addytywna z 2026-10-18** (spec `2026-10-16-recommendation-code`, F1, migracja `Migration20261018125821_recommendation_code`): `recommendation_code` (kody polecenia z G8); istniejące tabele bez zmian. Kontraktem są nazwy kolumn, unikalność (`restaurant_id`, `service_day`, `code`) i wyboru (`restaurant_id`, `service_day`, `session_id`, `wine_id`, `serving`, `dish_ids`), wartości w `CHECK` (`source`, `context`, `serving`, `tier`) oraz **format kodu** (`L D L` / `L D L D`, alfabet bez B, I, O, Q, S, Z, cyfry 2–9) i granica dnia serwisu (04:00 `Europe/Warsaw`) — kody trafiają do komentarzy w kasie i eksportów POS, więc ich zmiana jest łamiąca. `down` usuwa tabelę tylko w dev i test; w produkcji z danymi wycofanie to poprzedni obraz aplikacji, schemat zostaje (jak E03 Q19).

**Ścieżka:** expand → migrate → contract w osobnych PR-ach: najpierw dodaj nową kolumnę lub tabelę i pisz do obu, potem przenieś dane migracją, dopiero w kolejnym PR-ze usuń stare. PR z migracją zawiera test `up` i `down` (`npm run test:db`) i plan wycofania w opisie. `npm run schema:check -w @wine-match/db` musi pokazywać zgodność. Zmiana modelu aktualizuje [docs/DATA_MODEL.md](docs/DATA_MODEL.md).

## 4. Konfiguracja i zmienne środowiskowe

Źródła: [.env.example](.env.example), [packages/core/src/config/env.ts](packages/core/src/config/env.ts).

| Element | Co jest zmianą łamiącą |
|---|---|
| `DATA_SOURCE`, `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_DEBUG`, `AUTH_COOKIE_SECURE`, `PUBLIC_BASE_URL`, `LOG_LEVEL`, `ALLOW_DEMO_DATA`, `DEMO_RESTAURANT_SLUG`, `USER_PASSWORD` | zmiana nazwy, usunięcie, zmiana domyślnej wartości |
| Zamykające domyślne zachowanie: jawne `DATA_SOURCE` w produkcji, demo w produkcji tylko z `ALLOW_DEMO_DATA=true`, `Secure` ciasteczka w produkcji | **każde poluzowanie** to także zmiana bezpieczeństwa (`security`) |

**Ścieżka:** nowa nazwa zmiennej przez co najmniej jedno wydanie czyta też starą i loguje ostrzeżenie. Aktualizuj `.env.example` i README w tym samym PR-ze.

## 5. Uprawnienia, role i sesje

| Element | Gdzie | Co jest zmianą łamiącą |
|---|---|---|
| Role `owner`, `manager`, `sommelier`, `waiter` | [packages/core/src/auth/types.ts](packages/core/src/auth/types.ts) | usunięcie lub zmiana nazwy roli (wiersze `membership` w bazie) |
| Uprawnienia `panel.view`, `pairings.decide`, `wines.toggle`, `publish`, `settings.change`, `import.manage`, `restaurant.edit` i ich przypisanie do ról | [packages/core/src/auth/permissions.ts](packages/core/src/auth/permissions.ts) | odebranie lub nadanie uprawnienia istniejącej roli |
| Ciasteczko `wm_session` (httpOnly, SameSite=Lax, 12 h) | [packages/app/src/server/auth.ts](packages/app/src/server/auth.ts) | zmiana nazwy (wylogowuje wszystkich), osłabienie atrybutów |
| Ciasteczko `wm_lang` (`pl` / `en`, język panelu; httpOnly, SameSite=Lax, `Secure` w produkcji, `Path=/admin`, 1 rok; od 2026-10-15) — czytane tylko dla `/admin/*`, nigdy na stronach gościa | [packages/app/src/server/lang-cookie.ts](packages/app/src/server/lang-cookie.ts), `src/proxy.ts` | zmiana nazwy lub wartości (użytkownicy wracają do języka przeglądarki), czytanie go na trasach gościa |
| CLI `npm run user:create -- --email --name --role --restaurant`, hasło z `USER_PASSWORD` (min. 12 znaków) | `packages/db/scripts/create-user.ts` | zmiana flag lub zachowania dla istniejącego konta |

**Ścieżka:** zmiana ról lub uprawnień wymaga specyfikacji, aktualizacji [docs/USER_ROLES.md](docs/USER_ROLES.md), testu ścieżki odmowy i drugiej osoby w review.

## 6. Format importu

Źródła: [packages/core/src/import/types.ts](packages/core/src/import/types.ts), [packages/core/src/import/mapping.ts](packages/core/src/import/mapping.ts).

| Element | Co jest zmianą łamiącą |
|---|---|
| Pola menu `category, name, description, price` i win `producer, name, vintage, region, country, grape, style, glassPrice, bottlePrice` | usunięcie pola, zmiana znaczenia |
| Synonimy nagłówków PL/EN (`SYNONYMS`) i kolejność bez nagłówka (`DEFAULT_ORDER`) | usunięcie synonimu albo zmiana kolejności: pliki restauracji, które działały, przestają się wczytywać |
| Obsługiwane formaty: CSV (UTF-8, Windows-1250, BOM), XLSX, PDF tekstowy | wycofanie formatu lub kodowania |
| Kolumny tłumaczeń (od 2026-10-15): menu `name_pl`, `name_en`, `description_pl`, `description_en`; wina `tasting_note_pl`, `tasting_note_en`, `region_pl`, `region_en`, `country_pl`, `country_en`, z synonimami nagłówków (słowo pola + `pl`/`polski`/`polish`/`po polsku` albo `en`/`english`/`angielski`/`po angielsku`, np. „Nazwa (PL)”, „opis EN”). Kolumna obecna i pusta = bez zmiany (ostrzeżenie `translation_empty`); kolumny nie ma = tłumaczenia bez zmian | usunięcie nazwy lub synonimu; zmiana znaczenia pustej komórki (np. kasowanie tłumaczenia) |
| `IMPORT_LIMITS` (10 MB, 2000 wierszy) | obniżenie limitu |
| Przykładowe pliki `/api/v1/import-samples/{menu\|wines}` | zmiana nagłówka bez zmiany parsera |

**Ścieżka:** nowe synonimy i formaty dodawaj swobodnie. Każda zmiana parsera przechodzi testy na prawdziwych plikach z `packages/db/tests/fixtures/`; plik, który wcześniej się wczytywał, musi wczytywać się nadal.

## 7. Silnik rekomendacji

Źródło: [packages/core/src/engine/scoring.ts](packages/core/src/engine/scoring.ts), dokumentacja: [docs/RECOMMENDATION_ENGINE.md](docs/RECOMMENDATION_ENGINE.md).

| Element | Co jest zmianą łamiącą |
|---|---|
| `ENGINE_VERSION` (`wm-rules-1.2.0`; historia w `docs/RECOMMENDATION_ENGINE.md` §10), zwracane jako `engineVersion` przez API | zmiana wyników bez podniesienia wersji |
| Identyfikatory reguł stolika (`table.fit`, `table.budget_relaxed`, `table.people_default`, `table.quantity`) — nazwy dokumentacyjne (stolik nie emituje `Factor`), nazwy bloków `describe` w testach silnika | zmiana nazwy lub znaczenia bez specyfikacji |
| Identyfikatory reguł w `Factor.rule` (`weight.match`, `acid.cuts_fat`, `affinity.<protein>`…) | zmiana nazwy lub usunięcie: używane w testach i analityce |
| Skala Match Score 0–99, `BASE_SCORE` = 72 | zmiana skali |
| Determinizm (bez `Math.random`, dat, sieci, LLM) | każde odstępstwo |

**Ścieżka:** zmiana reguł, wag lub progów wymaga specyfikacji, podniesienia `ENGINE_VERSION` (minor: nowe reguły; major: zmiana skali lub usunięcie reguły), testu w `packages/core/tests/engine.test.ts`, wpisu w dokumentacji silnika i wyniku `npm run engine:matrix` w opisie PR-a.

## 8. Granice pakietów i API wewnętrzne

| Element | Co jest zmianą łamiącą |
|---|---|
| Eksporty `@wine-match/core` (`src/index.ts`), `@wine-match/db` (`.`, `./auth`, `./import`), `@wine-match/ui` (`.`, `./styles.css`, `./components/*`, `./brand/*`, `./lib/*`), `@wine-match/testkit` | usunięcie lub zmiana sygnatury eksportu |
| Porty w `core/src/ports` i `repositoryContract` | zmiana metody bez aktualizacji obu implementacji i kontraktu |
| Akcje serwera panelu i nazwy pól formularzy (`slug`, `back`, `pairingId`, `version`, `role`, `comment`, `direction`, `dishId`, `wineId`, `active`, `row_<n>_<pole>`…) | zmiana nazwy pola bez zmiany formularza w tym samym PR-ze |
| Publiczna akcja G9 `markCode` (`(guest)/r/[slug]/staff/actions.ts`, od 2026-10-18, spec `2026-10-16-recommendation-code` F2) i pola jej formularza `slug`, `code`, `intent` (`confirm` / `undo`), `sid`, `lang` (`codeActionSchema`); wartość `confirmed_by = 'staff_view'` | zmiana nazwy pola lub wartości `intent` bez zmiany formularza G9 w tym samym PR-ze; strona otwarta przed wdrożeniem wysyła stare pola (formularz z poprzednią wersją akcji Next.js i tak odrzuca po zmianie id akcji — kelner odświeża stronę) |

**Ścieżka:** to kontrakty wewnątrz monorepo, więc wolno je zmienić w jednym PR-ze, jeśli wszystkie miejsca użycia zmieniają się razem, a `npm run typecheck`, `npm run check:boundaries` i testy przechodzą. Zmiana kierunku zależności między pakietami wymaga specyfikacji (AGENTS.md §1.2).

## Poza kontraktem

- Pakiet `mockups` (prototyp do wycofania), w tym jego klucz `localStorage` `winematch.demo.v2`.
- Konta i dane demo (`DemoSeeder`, `DATA_SOURCE=memory`): mogą się zmieniać, ale seeder ma pozostać idempotentny.
- Wygląd stron (układ, kolory, teksty) — chroni go QA i review UX, nie ten plik. Chronione są adresy i parametry z sekcji 1.
