---
status: implemented
created: 2026-10-15
owner: Filip
related: [issue #23, issue #24, .ai/specs/product-brief.md, .ai/specs/2026-10-15-production-deployment.md, .ai/specs/2026-10-15-guest-usage-events.md]
---

# Założenie restauracji i jej pierwszego właściciela poleceniem CLI (E05-S01)

## 📝 TLDR
Maintainer nie ma dziś jak założyć prawdziwej restauracji: tworzy ją tylko `DemoSeeder` (Halka), a `npm run user:create` wymaga istniejącego sluga. Proponujemy (zachowanie przyszłe) nowe polecenie `npm run restaurant:create`, które w jednej transakcji zakłada restaurację i konto z rolą `owner`, bez danych demo. Właściciel loguje się do `/admin/{slug}` i zaczyna od Setup (import menu). Spec E05-S02 (wdrożenie) odwołuje się do tego polecenia i do bezpiecznego wywołania w kontenerze z sekcji API Contracts.

## Resolved assumptions (autonomous defaults)
| # | Pytanie | Przyjęta odpowiedź | Uzasadnienie |
|---|---|---|---|
| A1 | Nowe polecenie czy rozszerzenie `user:create`? | Nowe `npm run restaurant:create`; `user:create` bez zmian. | BC §5 chroni flagi i zachowanie `user:create`; nowe polecenie tylko dodaje. |
| A2 | Gdzie walidacja? | W `core` tylko `validateSlug()` (reguła sluga, której używa też `updateDetails`). Walidacja pól CLI w module skryptu `db`, testowanym bez bazy. Zapis w skrypcie w jednej transakcji. | Reguła sluga trafia na wydruk QR — jedno źródło prawdy; reszta to parsowanie wejścia operatora. Mniej struktury niż `planRestaurantBootstrap` (przegląd). |
| A3 | Slug z wielkimi literami: normalizować czy odrzucić? | Odrzucić (bez `toLowerCase`), błąd walidacji. | Kryterium #24; slug trafia na wydruk QR (BC §1). |
| A4 | E-mail należy do istniejącego konta? | Domyślnie odrzucić, nic nie zapisać. Z flagą `--allow-existing-account`: dodać tylko członkostwo `owner`, hasło konta bez zmian, głośny komunikat (semantyka `user:create`). | Literówka w e-mailu nie nadaje po cichu uprawnień `owner` cudzemu kontu; świadomy przypadek (ta sama osoba w drugim lokalu, konto maintainera) nie kończy się kontem-wydmuszką. |
| A5 | Wymagane pola? | Wymagane: `--name`, `--slug`, `--address`, `--city`, `--wine-director`, `--owner-email`, `--owner-name`. Waluta `PLN`, `settings` = `DEFAULT_RESTAURANT_SETTINGS`, `status: 'onboarding'`, `publishedAt: null`. | `updateDetails` wymaga adresu (inaczej pierwszy zapis formularza pada), strona gościa pokazuje `{address}, {city}` i „Wine list by {wineDirector}” — bez domyślnego publikowania nazwiska właściciela. |
| A6 | Niezastosowane migracje? | Skrypt otwiera ORM z konfiguracją CLI (`src/mikro-orm.config.ts`, z `Migrator`), sprawdza `migrator.getPending()` (nazwa API do potwierdzenia w MikroORM 7.2.2) i przy niepustej liście kończy się błędem z podpowiedzią `npm run db:migrate`; tego samego ORM używa do zapisu. Sam migracji nie uruchamia. | `getOrm()` używa `ormConfig` bez `Migrator`. Fail-closed; migracja to osobny krok wdrożenia (E05-S02). |
| A7 | Dane demo / `DATA_SOURCE`? | Zawsze `DATABASE_URL` (brak = błąd); nie woła `DemoSeeder`, nie czyta `DATA_SOURCE`, `ALLOW_DEMO_DATA` ani `PUBLIC_BASE_URL`. | D05; brak bazy nie może cicho przejść w tryb pamięci. |
| A8 | Hasło właściciela: kto je zna i jak trafia do właściciela? | `USER_PASSWORD` (≥ `MIN_PASSWORD_LENGTH` = 12), nigdy w argumentach ani na wyjściu. Na pilotaż: maintainer przekazuje hasło poza systemem jednorazowym kanałem; osobny ticket „właściciel zmienia hasło” (lub link zaproszenia) przed drugim lokalem; reguła przekazania w README. ✅ potwierdzone przez właściciela (Filip, 2026-10-15) | Risk-high auth: maintainer zna hasło do czasu zmiany, a zmiany hasła w UI nie ma. Do potwierdzenia: czy GM pilota akceptuje hasło znane maintainerowi. |
| A9 | Kody wyjścia? | `0` sukces, `1` każdy błąd — jak `user:create`. | Skrypty wdrożeniowe sprawdzają `!= 0`. |
| A10 | Zapis bez portu i bez `actor` (AGENTS §1.3)? | Wyjątek dla poleceń operatora w `packages/db/scripts/` (precedens: `create-user.ts`, `DemoSeeder`); jedno zdanie w AGENTS §1.3. ✅ potwierdzone przez właściciela (Filip, 2026-10-15) | Port + implementacja w pamięci + przypadek kontraktu dla operacji tylko-PostgreSQL to więcej powierzchni; ale zmianę prawa repozytorium zatwierdza człowiek. |
| A11 | Jak podać `USER_PASSWORD` w kontenerze? | Tylko ze środowiska wywołującego: `docker compose run --rm -e USER_PASSWORD migrate …` (sama nazwa zmiennej, wartość wczytana bez echa), nigdy `-e USER_PASSWORD=…` ani flaga. Snippet w API Contracts; runbook E05-S02 go cytuje. | Wartość nie trafia do historii powłoki ani do `ps`; `--rm` usuwa kontener z env po zakończeniu. |
| A12 | Co widzi gość świeżej restauracji i czy to zmieniamy? | Opisane w UI/UX (stan faktyczny). Ukrywanie restauracji `onboarding` przed gośćmi poza zakresem — osobne zgłoszenie. | Brak wycieku: widać tylko dane podane do publikacji; E05-S02 smoke opiera się na 200 z `/r/{slug}`. |

## 📝 Problem Statement
- Restauracja powstaje dziś wyłącznie w `DemoSeeder`, który zakłada Halkę z kontami o publicznym haśle — nie wolno go uruchamiać na produkcji (D05, lekcja `auth-conventions`).
- `create-user.ts` kończy się `No restaurant with slug …`, gdy restauracji nie ma: bez restauracji nie ma konta, bez konta nikt nie wejdzie do `/admin/{slug}/setup`.
- Skutek: pilotażu (Q08, D09 „Now” pkt 4) nie da się uruchomić.

## Cel i zakres
Jedno polecenie operatora zakładające restaurację i jej pierwszego właściciela na PostgreSQL. **Poza zakresem:** panel System Admin, polecenie usuwania, zmiana hasła / link zaproszenia (follow-up do A8), ukrywanie restauracji `onboarding` przed gośćmi (A12), wiele lokali w grupie.

## Wymagania
- **R1** `npm run restaurant:create` w jednej transakcji tworzy `restaurant` (`status: onboarding`, `publishedAt: null`), `app_user` (hash scrypt) i `membership(role: owner)`.
- **R2** Wszystkie błędy pól i `USER_PASSWORD` są zgłaszane naraz, przed połączeniem z bazą; slug bez normalizacji, według `validateSlug()` z `core`.
- **R3** Zajęty slug lub (bez `--allow-existing-account`) zajęty e-mail → kod 1, żaden wiersz nie zmieniony; to samo przy wyścigu (naruszenie unikalnego indeksu).
- **R4** Z `--allow-existing-account` istniejące konto dostaje tylko członkostwo `owner`; hasło bez zmian, `USER_PASSWORD` niewymagane.
- **R5** Brak `DATABASE_URL` lub oczekujące migracje → kod 1 z podpowiedzią, nic nie zapisane.
- **R6** stdout i stderr nigdy nie zawierają hasła ani `DATABASE_URL`.
- **R7** Nowy właściciel ma dostęp tylko do własnej restauracji (panel i API innej → 403).
- **R8** `user:create` i `RestaurantService.updateDetails` zachowują się jak dotąd.
- **R9** Dokumentacja: AGENTS §1.5 (i §1.3 po A10), README (użycie, wywołanie w kontenerze, przekazanie hasła, ręczne cofnięcie), `docs/USER_ROLES.md`, BC §5.

## 📝 Proposed Solution
`packages/db/scripts/create-restaurant.ts` (cienkie wejście) + `packages/db/scripts/restaurant-bootstrap.ts` z `run(argv, env, deps: { openOrm })`: `util.parseArgs` (`strict: true`), walidacja pól (`validateSlug` z `core`), potem `openOrm()` (konfiguracja CLI), kontrola migracji, `em.transactional()`: kontrola konfliktów (slug, e-mail), utworzenie encji. `UniqueConstraintViolationException` mapowany po nazwie ograniczenia (`restaurant_slug_unique`, `app_user_email_unique`, `membership_user_id_restaurant_id_unique`) na komunikaty z tabeli niżej; transakcja wycofana.

Odrzucone: **`user:create --create-restaurant`** (zmienia chronione CLI, BC §5); **panel System Admin** (#24 „Later”, brak roli w kodzie); **seeder „pustej restauracji”** (seedery są idempotentne i bez parametrów); **port `RestaurantWriteRepository.create`** (implementacja w pamięci i kontrakt dla operacji tylko-PostgreSQL; wrócić przy panelu System Admin).

Rynek: Discourse, Mastodon (`tootctl accounts create --role Owner`), GitLab zakładają pierwszego administratora poleceniem; hasło z env lub promptu, nigdy z argumentów. Bez interaktywnego promptu w samym poleceniu (działa bez TTY); prompt robi powłoka operatora (A11).

## 📝 Architecture
- **`core`**: `validateSlug(slug): 'invalid' | 'reserved' | null` w `core/src/services/restaurants/restaurant-service.ts` (`SLUG_PATTERN`, 2–40 znaków, `RESERVED_SLUGS`); `updateDetails` woła ją po swoim `trim().toLowerCase()` — zachowanie bez zmian.
- **`db`**: dwa pliki w `scripts/`, skrypt `restaurant:create` w `packages/db/package.json` (`tsx scripts/create-restaurant.ts`) i w głównym (`npm run restaurant:create -w @wine-match/db --`). Bez nowych encji i migracji. `console.*` dozwolone (`.oxlintrc.json`: `packages/*/scripts/**`).
- **`app`**: bez zmian; dostęp wynika z `requireAccess` / `membershipFor` / `can()`.

## 📝 Data Model
Bez zmian schematu. Zapis do `restaurant`, `app_user`, `membership`. Hasło tylko jako hash scrypt; e-mail `trim` + małe litery.

## 📝 API Contracts
```
USER_PASSWORD='…' npm run restaurant:create -- \
  --name "Bistro Nad Wisłą" --slug bistro-nad-wisla \
  --address "ul. Wiślna 1" --city Kraków --wine-director "Anna Nowak" \
  --owner-email anna@example.com --owner-name "Anna Nowak" \
  [--allow-existing-account]
```
**Wywołanie w kontenerze (A11, cytowane w runbooku E05-S02, obraz `migrator`):**
```
stty -echo; printf 'Owner password: '; read -r USER_PASSWORD; stty echo; echo
export USER_PASSWORD
docker compose run --rm -e USER_PASSWORD migrate npm run restaurant:create -- --name … --slug … …
unset USER_PASSWORD
```
`-e USER_PASSWORD` bez `=` przekazuje wartość z env wywołującego. Nigdy `-e USER_PASSWORD=…`, wartość w pliku compose ani flaga. POSIX (bez `read -s`).

| Wejście | Reguła | Błąd (stderr, kod 1) |
|---|---|---|
| `--slug` | `validateSlug` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–40, nie w `RESERVED_SLUGS`), tylko `trim` | `--slug must be 2–40 lower-case letters, digits and single hyphens.` / `--slug "<slug>" is reserved.` |
| `--name` | niepuste po `trim`, ≤ 120 | `--name is required (max 120 characters).` |
| `--address`, `--city`, `--wine-director`, `--owner-name` | niepuste po `trim` | `--city is required.` itd. |
| `--owner-email` | `^\S+@\S+\.\S+$`, `trim` + małe litery | `--owner-email must be a valid e-mail address.` |
| flagi | nieznana flaga lub wartość zaczynająca się od `-` (`parseArgs` strict) | komunikat użycia |
| `USER_PASSWORD` | ≥ 12 znaków, bez `trim`; bez `--allow-existing-account` sprawdzane przed bazą, z flagą tylko gdy konto powstaje | `Set USER_PASSWORD to a password of at least 12 characters.` |
| `DATABASE_URL` | ustawione (env lub główny `.env`) | `DATABASE_URL is not set.` |
| migracje | brak oczekujących | `Pending migrations: run npm run db:migrate first.` |
| slug zajęty | — | `A restaurant with slug "<slug>" already exists. Nothing was saved.` |
| e-mail zajęty (bez flagi) | — | `An account <email> already exists. Nothing was saved. Use --allow-existing-account to make it the owner.` |

Sukces (stdout, kod 0):
```
Created restaurant "Bistro Nad Wisłą" (slug: bistro-nad-wisla, status: onboarding).
Created account anna@example.com as owner.        | Account anna@example.com already exists; its password is unchanged. Added as owner.
Sign in at /admin/bistro-nad-wisla (on your PUBLIC_BASE_URL).
Next: the owner imports the menu on the Setup screen.
```
`main().catch` drukuje tylko `error.message`, nie obiekt (bez connection stringa w stosie).

## 📝 UI/UX
- **Pierwsze logowanie:** `/admin/{slug}` → `/admin/login?next=/admin/{slug}` → panel. Setup (`AdminService.setup`, bez zmian): „Restaurant details” zrobione, „Import your menu” następny.
- **Gość świeżej restauracji (stan faktyczny, zweryfikowany):** domenowy `Restaurant` nie ma pola `status`, a `CatalogService.publishedMenu(slug)` zwraca restaurację po samym slugu i tylko dania `published`. `/r/{slug}` odpowiada 200 od chwili utworzenia: nazwa, „{address}, {city}”, „Tonight's menu is being updated. Your waiter can suggest a wine in the meantime.”, „Wine list by {wineDirector}”, link dla obsługi; `/r/{slug}/menu` pokazuje „Tonight's menu is being updated”. Zgodne z R03 (brak wersji roboczej). Skutki dla innych specyfikacji: E02 zapisze zdarzenia gościa także dla restauracji `onboarding`; smoke `--production` z E05-S02 może sprawdzać 200 dla świeżej restauracji. Zmiana (np. 404 do publikacji) — osobne zgłoszenie (A12).

## 📝 Edge Cases & Failure Scenarios
- Slug z wielkimi literami / spacją / `admin`; długość 1 i 41 → błąd walidacji, ORM nieotwierany. Długość 2 i 40 przechodzi.
- Slug zajęty (także `halka`), dwa równoległe wywołania → unikalny indeks, drugie dostaje ten sam komunikat, brak osieroconego konta.
- E-mail istniejącego konta inną wielkością liter (`Anna@X.pl`) → konflikt. Z `--allow-existing-account` i istniejącym członkostwem w tej restauracji — niemożliwe (restauracja nowa).
- Brak `DATABASE_URL`, baza niedostępna, oczekujące migracje → kod 1, bez sekretów.
- `USER_PASSWORD` z końcowym `\n` używane dosłownie; README ostrzega przed `echo` bez `-n`.
- `restaurant` i `app_user` nie mają `deletedAt`: restauracja `archived` nadal blokuje slug.
- Skrypty `package.json` bez bashizmów (`/bin/sh` = dash).

## 📝 Risks & Impact Review
- **Auth / data scoping (risk-high, SDLC):** dowody w PR — test ścieżki odmowy (właściciel nowej restauracji → panel/API Halki: 403), drugi recenzent, `needs-qa`, bez self-QA.
- **Hasło znane maintainerowi (A8, ✅).**
- **`--allow-existing-account`:** nadaje `owner` istniejącemu kontu tylko przy jawnej fladze; ta sama zdolność co `user:create --role owner`.
- **Nowa chroniona powierzchnia:** flagi, kody wyjścia i semantyka `USER_PASSWORD` w BC §5.
- **Odwracalność:** bez polecenia usuwania. Cofnięcie pomyłki przed importem — README podaje dokładnie (jedna transakcja `psql`):
  ```sql
  BEGIN;
  DELETE FROM membership WHERE restaurant_id = (SELECT id FROM restaurant WHERE slug = '<slug>');
  DELETE FROM app_user u WHERE u.email = '<email>' AND NOT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = u.id);
  DELETE FROM restaurant WHERE slug = '<slug>';
  COMMIT;
  ```
  Sesje znikają kaskadowo z kontem; konto z innymi członkostwami zostaje. Jeśli ostatni `DELETE` pada na kluczu obcym (dania, wina, importy, zdarzenia gościa, publikacje), restauracja jest w użyciu: `ROLLBACK` i `status = 'archived'`.
- **A10 (✅):** zapis poza portem, ograniczony do skryptów operatora.
- **Kolejność PR:** ten spec przed E05-S02 (oba zmieniają BC §5 i README; E05-S02 używa `restaurant:create`).

## 📝 Decisions in play
D05 (Halka tylko demo) — respektowana. D09 — realizuje punkt 4 „Now”. Q08 (`PUBLIC_BASE_URL`) — należy do E05-S02, nie blokuje. BC §5 — `user:create` bez zmian, nowe CLI dopisane. BC §1 — bez zmian adresów QR. Zatwierdza: Filip; drugi recenzent dla auth.

## User stories
1. **Maintainer** → ma bazę produkcyjną po `db:migrate`, bez Halki → uruchamia `restaurant:create` w kontenerze `migrate` (A11) → widzi cztery linie potwierdzenia → system tworzy restaurację `onboarding` i konto `owner` w jednej transakcji.
2. **Maintainer → GM** → przekazuje GM adres `/admin/{slug}` i hasło jednorazowym kanałem poza systemem → GM loguje się i niczego w systemie nie zmienia poza danymi restauracji i menu (zmiany hasła nie ma, A8) → maintainer zapisuje w ticketcie follow-up, że hasło jest mu znane.
3. **GM / właściciel** → loguje się na `/admin/{slug}` → widzi Setup z „Import your menu” → system pokazuje tylko jego restaurację → importuje menu.
4. **Właściciel** → otwiera `/admin/halka` → 403 → system nie zwraca danych tamtej restauracji.

## Kryteria akceptacji
- [x] AC1 (R1) Given baza po `db:migrate` bez `db:seed`, When `restaurant:create` z poprawnymi flagami i `USER_PASSWORD`, Then powstaje restauracja `onboarding` i konto `owner` z hashem weryfikowalnym przez `ScryptPasswordHasher`. (`packages/db/tests/restaurant-bootstrap.integration.test.ts`)
- [x] AC2 (R1, R7) Given e2e po migracjach i seedzie, When `global-setup` uruchamia prawdziwe `restaurant:create` (`dbScript`), Then nowe konto loguje się, widzi Setup, a `/admin/halka` zwraca 403. (`packages/app/tests/e2e/`)
- [x] AC3 (R3) Given zajęty slug albo zajęty e-mail (inną wielkością liter) bez flagi, albo dwa równoległe wywołania z tym samym slugiem, Then kod 1 (jedno wywołanie równoległe sukcesem) i liczba wierszy `restaurant`, `app_user`, `membership` zmienia się najwyżej o jeden komplet. (test integracyjny)
- [x] AC4 (R4) Given istniejące konto i `--allow-existing-account` bez `USER_PASSWORD`, Then kod 0, nowe członkostwo `owner`, `password_hash` bez zmian. (test integracyjny)
- [x] AC5 (R2) Given niepoprawny slug (wielkie litery, spacja, `admin`, 1/41 znaków), brak pola, nieznana flaga albo `USER_PASSWORD` < 12 znaków bez flagi, Then kod 1 i `openOrm` nie zostaje wywołane; wiele błędów zgłoszonych naraz. (`core/tests/` dla `validateSlug`; `packages/db/tests/create-restaurant-cli.test.ts`)
- [x] AC6 (R5) Given brak `DATABASE_URL` → kod 1 (test CLI bez bazy); Given baza bez zastosowanych migracji → kod 1 z podpowiedzią i brak tabel/wierszy utworzonych przez polecenie (test integracyjny na świeżej bazie bez `migration:up`).
- [x] AC7 (R6) stdout i stderr w każdym powyższym scenariuszu nie zawierają wartości `USER_PASSWORD` ani `DATABASE_URL`. (asercja w testach CLI i integracyjnych)
- [x] AC8 (R7) Właściciel nowej restauracji wobec akcji serwerowych i API Halki → odmowa; `membershipFor` nie zwraca Halki. (`packages/app/tests/unit/`)
- [x] AC9 (R8) Istniejące testy `RestaurantService` i zachowanie `user:create` bez zmian.
- [x] AC10 (R9) AGENTS §1.5, README, `docs/USER_ROLES.md`, BC §5 opisują polecenie; README zawiera wywołanie w kontenerze, regułę przekazania hasła i SQL cofnięcia.

## 📋 Phasing
- **Faza 1 — `validateSlug()` w `core`:** bez zmiany zachowania; nie zależy od A8/A10.
- **Faza 2 — polecenie, testy, dokumentacja:** czeka na odpowiedzi A8 i A10 (oraz `approved` całego spec).

## 📋 Implementation Plan
**Faza 1**
1. `validateSlug()` w `restaurant-service.ts`, `updateDetails` jej używa. Test: istniejące testy + przypadki `validateSlug` w `core/tests/`.

**Faza 2**
2. `scripts/restaurant-bootstrap.ts` (`run`, `parseArgs`, walidacja, `openOrm` z `src/mikro-orm.config.ts`, kontrola migracji, transakcja, mapowanie unikalności, wyjście) + `scripts/create-restaurant.ts`; wpisy w obu `package.json`. Test bez bazy: `packages/db/tests/create-restaurant-cli.test.ts` (AC5, AC6 część 1, AC7; `openOrm` jako atrapa, która rzuca przy wywołaniu; wyjście przez `vi.spyOn(console, …)`).
3. `packages/db/tests/restaurant-bootstrap.integration.test.ts`: AC1, AC3, AC4, AC6 część 2, AC7.
4. AC8 w `app/tests/unit/`; AC2: `restaurant:create` w `app/tests/e2e/global-setup.ts` po `seed`, scenariusz w `admin.e2e.test.ts`.
5. Dokumentacja (AC10) i zdanie w AGENTS §1.3 (po A10). Walidacja: `npm run lint`, `check:boundaries`, `typecheck`, `npm test`, `npm run test:db`, `build`, `test:e2e`.

## Grill log
| # | Pytanie | Odpowiedź | Przyjął |
|---|---|---|---|
| 1 | Mechanizm kontroli migracji? | ORM z konfiguracją CLI (`Migrator`), `getPending()`, ten sam ORM do zapisu | agent-default |
| 2 | Istniejący e-mail? | Domyślnie odmowa; `--allow-existing-account` = tylko członkostwo `owner` | agent-default |
| 3 | Co zostaje w `core`? | Tylko `validateSlug()`; walidacja pól w module skryptu | agent-default |
| 4 | `--address` wymagane? | Tak (inwariant `updateDetails`, strona gościa) | agent-default |
| 5 | `--wine-director` domyślnie = właściciel? | Nie, wymagane (publikowane na stronie gościa) | agent-default |
| 6 | Adres logowania z `PUBLIC_BASE_URL`? | Nie, ścieżka względna; skrypt nie czyta `PUBLIC_BASE_URL` | agent-default |
| 7 | Własny parser flag? | `util.parseArgs` strict; bez osobnego modułu | agent-default |
| 8 | Wyścig na unikalności? | `UniqueConstraintViolationException` po nazwie ograniczenia → te same komunikaty | agent-default |
| 9 | `USER_PASSWORD` w kontenerze? | `docker compose run -e USER_PASSWORD` (sama nazwa), wartość wczytana bez echa | agent-default |
| 10 | Gość świeżej restauracji — zmieniać? | Opisać stan faktyczny; ukrywanie `onboarding` poza zakresem | agent-default |
| 11 | Cofnięcie pomyłki? | Dokładny SQL w README, bez polecenia usuwania | agent-default |
| 12 | E2E przez `bootstrapRestaurant` czy prawdziwe CLI? | Prawdziwe `restaurant:create` w `global-setup` | agent-default |
| 13 | Przekazanie hasła na pilotaż (A8)? | Akceptacja na pilotaż + ticket „zmiana hasła” + reguła w README | owner ✅ |
| 14 | Wyjątek w AGENTS §1.3 (A10)? | Jedno zdanie dla skryptów operatora | owner ✅ |
| 15 | Kolejność względem E05-S02? | Ten spec pierwszy | agent-default |
| 16 | Które fazy czekają na ✅? | Faza 2 na A8 i A10; Faza 1 niezależna | agent-default |
| 17 | Co trafia do BC §5? | Flagi (z `--allow-existing-account`), kody wyjścia, semantyka `USER_PASSWORD` | agent-default |
| 18 | Format wg AGENTS §3? | Dodane „Cel i zakres” i R1–R9; reszta formatu `om-spec-writing` | agent-default |

## Changelog
- 2026-10-15 — draft (om-spec-writing --autonomous)
- 2026-10-15 — cross-model review (Sonnet 5.5): 13 accepted, 0 rejected (1 partially). Accepted: mechanizm migracji (A6); istniejący e-mail — częściowo: opt-in `--allow-existing-account` zamiast domyślnego łączenia (A4); lżejsza struktura (A2, tylko `validateSlug` w `core`, jedna wstrzykiwana zależność); `--address` wymagane (A5); fakt `publishedMenu` (A12); ścieżka względna zamiast surowego `PUBLIC_BASE_URL`; dokładny SQL cofnięcia; historie (usunięte ścieżki błędów, dodane przekazanie); numeracja i narracja przeglądu usunięte; A8/A10 zostają ⚠. Cross-spec: #3 (A11), #5 (UI/UX), #7 (kolejność), #9 (R1–R9), #10, #11 (Phasing).
- 2026-10-15 — grill: 18 questions, 2 left for owner (A8, A10)
- 2026-10-15 — approved: właściciel (Filip) przyjął rekomendacje we wszystkich decyzjach ⚠; status `approved`.

## Realizacja
- Gałąź `feat/e05-s01-restaurant-create`, PR do `main` (numer w opisie zgłoszenia #24); log przebiegu: `.ai/runs/2026-10-25-e05-s01-restaurant-create.md`.
- Faza 1: `validateSlug()` w `core` (+ `core/tests/validate-slug.test.ts`). Faza 2: `packages/db/scripts/restaurant-bootstrap.ts`, `create-restaurant.ts`, skrypty `restaurant:create`; testy `create-restaurant-cli.test.ts` (AC5, AC6 cz. 1, AC7), `restaurant-bootstrap.integration.test.ts` (AC1, AC3, AC4, AC6 cz. 2, AC7), `app/tests/unit/restaurant-owner-scope.test.ts` (AC8), `app/tests/e2e/restaurant-create.e2e.test.ts` + `global-setup.ts` (AC2); dokumentacja (AC10).
- Odstępstwo od A6: kontrola migracji zaczyna się od `to_regclass('mikro_orm_migrations')`; dopiero gdy tabela istnieje, wołane jest `migrator.getPending()`. Powód: `getPending()` na bazie bez migracji zakłada tabelę `mikro_orm_migrations` (`storage.ensureTable()`), a AC6 wymaga, żeby polecenie niczego nie utworzyło. Nazwa API z A6 (`getPending`) potwierdzona w MikroORM 7.2.2.
- Odstępstwo od AC2 (forma): scenariusz e2e używa tylko `fetch` na zbudowanej aplikacji (brak `agent-browser` w środowisku wykonawczym); sprawdza logowanie, członkostwo tylko w nowej restauracji, Setup z „Import your menu” i 403 panelu oraz API Halki. Pozostałe pliki e2e (z przeglądarką) nie były uruchamiane.
- Przy wywołaniu bez `--allow-existing-account` błąd `DATABASE_URL is not set.` jest zgłaszany razem z błędami pól (jedna lista), a nieznana flaga (`parseArgs strict`) daje komunikat użycia obok błędów pozostałych pól.
- AGENTS §1.3 miało już wzmiankę o `restaurant:create` w wyjątku (2) na `main`; dopisano §1.5, `packages/db/AGENTS.md`, README, `docs/USER_ROLES.md`, BC §5.
