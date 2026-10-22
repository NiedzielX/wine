# Model danych

Docelowa baza: PostgreSQL. Identyfikatory: UUID v7 (sortowalne w czasie). Wszystkie tabele restauracji mają `restaurant_id` (izolacja tenantów, Row Level Security). Kwoty jako `numeric(10,2)` w walucie restauracji. Znaczniki czasu `timestamptz`.

Typy domenowe: `packages/core/src/domain/types.ts`. Encje MikroORM: `packages/db/src/entities` (definiowane przez `defineEntity`), migracje: `packages/db/src/migrations`.

## Stan implementacji

| Encja | W bazie | Uwagi |
|---|---|---|
| Restaurant | tak | `wine_director` jako tekst do czasu wprowadzenia User / Membership; `settings` jako jsonb |
| Dish + DishProfile | tak | profil jako **embeddable**: kolumny `profile_*` w tabeli `dish` (relacja 1:1 zawsze ładowana razem z daniem) |
| Wine + WineProfile | tak | profil jako embeddable: kolumny `profile_*` w tabeli `wine` |
| Pairing | tak | unikalność (dish, wine), częściowy indeks unikalny „jeden Primary na danie”, `version` do blokady optymistycznej |
| SommelierDecision | tak | audyt, `actor` jako tekst do czasu wprowadzenia User; **bez klucza obcego** do pairingu (kolumna `pairing_id`), żeby historia przeżyła usunięcie pairingu; ma `restaurant_id`, `dish_id`, `wine_id` |
| PublishedVersion | tak | migawka pairingów (approved / modified / rejected) w `snapshot` (jsonb), `number` unikalny w restauracji; goście czytają najnowszą |
| GuestInteraction | tak | zapisywana od E02 F1 (spec `2026-10-15-guest-usage-events`) przez `GuestInteractionRepository` (`record`, `listBySession`, `countGuestSessions`, od E04 F1 `usageTotals` — agregaty okna KPI; od E04 F3 `pairingStats` — pokazania i wybory per (danie, wino, źródło z `props.items[].tier`) w oknie, dla A1 i E10 S4; pamięć: do 10 000 zdarzeń). `session_id` = parametr URL `sid` (bez tabeli GuestSession); `source`, `context`, `menuVersion` (= `restaurant.published_at`) w `props`; kolumna `version_id` nie istnieje. Sesja gościa = `session_id` ze zdarzeniem `guest_session_started` |
| ImportJob | tak | wiersze podglądu w kolumnie `rows` (jsonb) zamiast tabeli ImportRow |
| User (`app_user`), Membership, Session | tak | hasło jako skrót scrypt; w `session` tylko SHA-256 tokenu; licznik prób i blokada w `app_user`; `membership.role`: owner, manager, sommelier, waiter. `sommelier_decision.actor_id` wskazuje konto (zwykła kolumna) |
| ImportJob | tak | `rows` (jsonb) to sprawdzony podgląd wierszy, `notes` — jak odczytano plik, `result` — wynik zatwierdzenia; **plik nie jest przechowywany** (`storage_key` puste); status `preview_ready` → `confirmed` / `cancelled`; zatwierdzenie atomowe z blokadą wiersza. Rodzaj `sales` od 2026-10-19 (E03 F1): wiersze to pozycje rachunków (tylko kolumny `SALES_FIELDS`), `result.replaced` — zastąpione rachunki |
| SalesRecord (`sales_record`, od 2026-10-19) | tak | pozycje rachunków z POS (spec `2026-10-15-pos-sales-import-attach-rate`, F1): zapis tylko przez zatwierdzony import `sales`, całe rachunki; ponowny import tych samych rachunków (`business_date`, `check_id`) zastępuje je miękko (`replaced_at`); bez nazw pozycji i danych osobowych |
| Tłumaczenia treści (od 2026-10-15) | tak | `dish.translations`, `wine.translations`, `restaurant.translations` (jsonb, domyślnie `'{}'`), `pairing.comment_translations` (jsonb), `restaurant.content_locale` (text, domyślnie `'en'`). Kształt: `{ "pl": { "name": …, "description": … }, "en": { … } }`; pola bazowe zostają w języku `content_locale`. Migawka publikacji niesie tłumaczenia (`snapshot.content`, `snapshot.pairings[].commentTranslations`); starsze migawki bez nich czytane jako `{}`. Spec `2026-10-15-bilingual-content` |
| OpportunityDismissal (`opportunity_dismissal`, od 2026-10-16) | tak | zignorowane okazje sommeliera (spec `2026-10-16-sommelier-opportunities`, F1): jeden wiersz na (`restaurant_id`, `opportunity_key`), aktywny do `expires_at`; `dish_id` / `wine_id` **bez kluczy obcych**; `rule` z `CHECK` na pięć nazw sygnałów. Para z „Dodaj do propozycji” to zwykły wiersz `pairing` (`suggested`, bez wpisu w `sommelier_decision`) |
| RecommendationCode (`recommendation_code`, od 2026-10-18) | tak | kody polecenia (spec `2026-10-16-recommendation-code`, F1): jeden wiersz na wybór wina na G8 (sesja `sid`, wino, porcja, dania, dzień serwisu); kod unikalny w (`restaurant_id`, `service_day`); `dish_ids` jsonb **bez FK**; bez danych osobowych |
| Recommendation, GuestSession, ImportRow (osobna tabela), EngineVersion, CatalogWine | nie | wejdą razem z funkcjami, które ich potrzebują (osobne specyfikacje) |

Poniżej model docelowy.

## Diagram relacji

```mermaid
erDiagram
  Organization ||--o{ Restaurant : owns
  Restaurant ||--o{ Membership : has
  User ||--o{ Membership : has
  Restaurant ||--o{ Dish : serves
  Restaurant ||--o{ Wine : lists
  Dish ||--|| DishProfile : "taste profile"
  Wine ||--|| WineProfile : "wine profile"
  CatalogWine |o--o{ Wine : "same wine (optional)"
  Dish ||--o{ Pairing : ""
  Wine ||--o{ Pairing : ""
  Pairing ||--o{ SommelierDecision : "audit trail"
  User ||--o{ SommelierDecision : makes
  Restaurant ||--o{ PublishedVersion : publishes
  PublishedVersion ||--o{ Recommendation : "precomputed"
  Dish ||--o{ Recommendation : ""
  Wine ||--o{ Recommendation : ""
  Restaurant ||--o{ GuestSession : ""
  GuestSession ||--o{ GuestInteraction : ""
  Restaurant ||--o{ ImportJob : ""
  ImportJob ||--o{ ImportRow : ""
  Restaurant ||--o{ SalesRecord : "optional CSV"
  Restaurant ||--o{ OpportunityDismissal : "ignored opportunities"
  Restaurant ||--o{ RecommendationCode : "recommendation codes"
  Wine ||--o{ RecommendationCode : "chosen wine"
  EngineVersion ||--o{ Pairing : "scored by"
  EngineVersion ||--o{ Recommendation : "scored by"
```

## Encje

### Restaurant

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid FK | grupa restauracyjna (plan Group) |
| slug | text unique | `^[a-z0-9-]{2,40}$`, publiczny link i QR |
| name, tagline | text | |
| content_locale | text | `pl` / `en` (domyślnie `en`): język pól bazowych (tagline, city, nazwy i opisy dań, notatki o winach i notatki sommeliera) |
| translations | jsonb | `{pl?: {tagline, city}, en?: {…}}`; brak tłumaczenia → pole bazowe |
| address, city, country | text | |
| currency | char(3) | `PLN` |
| timezone | text | `Europe/Warsaw` |
| wine_director_user_id | uuid FK → User | nazwisko pokazywane gościom |
| settings | jsonb | `{showUnreviewed: bool, showScores: bool, glassPourMl: 150, locale: "en"}` |
| status | enum | `onboarding`, `active`, `paused`, `archived` |
| current_version_id | uuid FK → PublishedVersion | co widzą goście |
| published_at | timestamptz | |
| external_refs | jsonb | identyfikatory w POS / e-menu (przyszłe integracje) |
| created_at, updated_at | timestamptz | |

### User, Membership

| User | | Membership | |
|---|---|---|---|
| id | uuid PK | id | uuid PK |
| email | citext unique | user_id | uuid FK |
| name | text | restaurant_id | uuid FK |
| password_hash | text | role | enum `owner`, `manager`, `sommelier`, `waiter` |
| last_login_at | timestamptz | created_at | timestamptz |

System Administrator to flaga `is_staff` na User (poza Membership).

### Dish

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK | |
| name | text | |
| description | text | |
| translations | jsonb | `{pl?: {name, description}, en?: {…}}` (limity jak pól bazowych: nazwa 120, opis 1000 znaków) |
| category | text | `Starters`, `Mains`, `Desserts` (słownik per restauracja) |
| price | numeric | |
| status | enum | `draft`, `published`, `hidden` |
| sort_order | int | |
| external_ref | text | ID w POS / e-menu |
| import_job_id | uuid FK null | pochodzenie |
| deleted_at | timestamptz null | soft delete (historia analityki) |

### DishProfile (1:1 z Dish; w implementacji embeddable, kolumny `profile_*`)

| Pole | Typ | Zakres |
|---|---|---|
| dish_id | uuid PK FK | |
| intensity, fat, salt, sweetness, acidity, spice, umami, smoke, creaminess | smallint | 0–5 |
| protein | enum | `beef`, `game`, `poultry`, `pork`, `fish`, `shellfish`, `vegetable`, `mushroom`, `dairy`, `dessert` |
| cooking | enum | `raw`, `cured`, `poached`, `seared`, `roasted`, `grilled`, `braised`, `fried`, `baked`, `none` |
| source | enum | `draft` (import, reguły lub lokalny LLM), `confirmed` (personel) |
| drafted_by | text | `rules-1.0`, `local-llm:qwen2.5-7b`, … |
| confirmed_by, confirmed_at | uuid, timestamptz | |
| embedding | vector(384) null | opcjonalnie, pgvector; podobieństwo dań |

### Wine

Pozycja na karcie konkretnej restauracji (cena i dostępność są lokalne).

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK | |
| catalog_wine_id | uuid FK null | powiązanie z globalnym katalogiem (ten sam rocznik w wielu lokalach; przyszłe rekomendacje między restauracjami) |
| producer, name | text | |
| vintage | smallint null | null = NV |
| region, country | text | |
| grapes | text[] | pierwszy szczep = dominujący |
| list_number | int | numer na karcie („List no.”) |
| glass_price | numeric null | null = tylko butelka |
| glass_pour_ml | smallint | 150; 75 dla win słodkich |
| bottle_price | numeric | |
| bottle_size_ml | smallint | 750, 500, 1500 |
| active | bool | dostępne dziś (natychmiastowe, bez publikacji) |
| colour_hex | char(7) | kolor do „Match glass” |
| tasting_note | text | |
| translations | jsonb | `{pl?: {tastingNote, region, country}, en?: {…}}`; nazwy win i producentów nie są tłumaczone |
| stock_qty | int null | przyszłe: inventory |
| external_ref | text | ID w POS |

### WineProfile (1:1 z Wine; w implementacji embeddable, kolumny `profile_*`)

| Pole | Typ | Zakres |
|---|---|---|
| wine_id | uuid PK FK | |
| sweetness, acidity, tannin, body, fruitiness, oak, aromatic, freshness | smallint | 0–5 |
| alcohol | numeric(3,1) | % |
| style | enum | `sparkling`, `white`, `rose`, `orange`, `red`, `sweet` |
| adventurous | bool | poza klasycznymi oczekiwaniami (orange, PIWI, mniej znane regiony) |
| source | enum | `grape_defaults`, `catalog`, `confirmed` |
| embedding | vector(384) null | opcjonalnie |

### Pairing

Relacja Dish ↔ Wine z decyzją sommeliera. Unikalność `(dish_id, wine_id)`.

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK | |
| dish_id, wine_id | uuid FK | |
| status | enum | `suggested`, `approved`, `modified`, `rejected` |
| role | enum null | `primary`, `alternative`, `best_value`; max 1 `primary` na danie (indeks częściowy) |
| rank | smallint null | kolejność ustalona przez sommeliera |
| comment | varchar(140) null | „Why it works” w słowach sommeliera |
| comment_translations | jsonb | `{pl?: string, en?: string}`, każde do 140 znaków; gość widzi notatkę w swoim języku, inaczej `comment` |
| model_score | smallint | 0–99, wynik silnika przy ostatnim przeliczeniu |
| factors | jsonb | czynniki reguł `[{rule, delta}]` (wyjaśnialność) |
| engine_version | text FK | |
| source | enum | `engine`, `sommelier` |
| version | int | optymistyczna blokada (`If-Match`) |
| dirty | bool | zmiana od ostatniej publikacji |
| updated_by, updated_at | | |

```sql
create unique index pairing_one_primary on pairing (dish_id)
  where role = 'primary' and status in ('approved', 'modified');
```

### SommelierDecision (audit trail, append-only)

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| pairing_id | uuid FK | |
| user_id | uuid FK | |
| action | enum | `approve`, `modify`, `reject`, `restore`, `set_role`, `reorder`, `comment`, `create`, `delete` |
| before, after | jsonb | stan pary przed / po |
| created_at | timestamptz | |

Status pary jest pochodną ostatnich decyzji; tabela umożliwia raport „co zmieniono przed weekendem” i uczenie modelu na decyzjach sommelierów.

### PublishedVersion

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| restaurant_id | uuid FK | |
| number | int | kolejny numer |
| snapshot | jsonb | menu, wina, pary, ustawienia (to, co serwuje publiczne API). W implementacji: `pairings` (z `commentTranslations`) i `content` — tłumaczenia restauracji, dań i win, które widzą goście (zmiana tłumaczenia to zmiana do publikacji) |
| changes_count | int | |
| published_by, published_at | | |

Niezmienna; rollback = ustawienie `restaurant.current_version_id` na wcześniejszą wersję.

### OpportunityDismissal (`opportunity_dismissal`)

Zignorowane okazje w panelu sommeliera (spec `2026-10-16-sommelier-opportunities`, R6). Okazje liczymy przy odczycie (bez tabeli wyników); ta tabela trzyma tylko „Ignoruj”.

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | z `IdGenerator`; ponowne „Ignoruj” zachowuje id |
| restaurant_id | uuid FK → `restaurant`, not null | zakres tenanta |
| opportunity_key | text not null | przedmiot okazji, np. `glass_match_unpaired:{dishId}`, `wine_unpaired:{wineId}`, `dish_no_primary:{dishId}:{none\|no_primary\|primary_hidden}`; **unique (`restaurant_id`, `opportunity_key`)** |
| rule | text not null | `CHECK` na `dish_no_primary`, `ordered_not_reviewed`, `glass_match_unpaired`, `wine_unpaired`, `shown_rarely_chosen` (wszystkie pięć od F1) |
| dish_id, wine_id | uuid null, **bez FK** | danie i wino z chwili zignorowania (lista „Zignorowane”); wiersz przeżywa usunięcie dania lub wina |
| dismissed_by | text not null | nazwa autora (`actor.name`) |
| dismissed_by_id | uuid null | konto autora (zwykła kolumna, jak `sommelier_decision.actor_id`) |
| dismissed_at, expires_at | timestamptz not null | `expires_at = dismissed_at + 30 dni` (`DISMISS_DAYS`); aktywna, gdy `expires_at > now` |

Zapis: `insert … on conflict (restaurant_id, opportunity_key) do update` (przedłuża termin, zmienia autora). „Przywróć” usuwa wiersz. Migracja `Migration20261016152214_opportunity_dismissal` jest addytywna; `down` usuwa tabelę bez strat dla biznesu (okazje po prostu wrócą).

### RecommendationCode (`recommendation_code`)

Kod polecenia wydany na G8 (spec `2026-10-16-recommendation-code`, F1; R1–R5, R11, R13). Jeden wiersz = jeden wybór (Q5, Q19), nie odsłona. Wydanie jest jak telemetria (AGENTS §1.3, wyjątek Q7); potwierdzenie przez kelnera (F2) i dopasowanie w POS (F3) dojdą w kolejnych fazach.

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | z `IdGenerator`; kandydat kodu jest czytany z tego samego UUID |
| restaurant_id | uuid FK → `restaurant`, not null | zakres tenanta |
| service_day | date not null | dzień serwisu `Europe/Warsaw`, kończy się o 04:00 czasu lokalnego (`serviceDay`, liczone na lokalnych składnikach, R2) |
| code | varchar(4) not null | `L D L` z alfabetu `ACDEFGHJKLMNPRTUVWXY` i cyfr `2–9`, awaryjnie `L D L D`; **unique (`restaurant_id`, `service_day`, `code`)** |
| session_id | uuid not null | anonimowy `sid` (E02) |
| source | text not null | `CHECK`: `guest` (G8) \| `staff` (ścieżka kelnera E08) |
| context | text not null | `CHECK`: `dish` (1 danie) \| `table` (2–12 dań) \| `direct` (bez dania) |
| wine_id | uuid FK → `wine`, not null | wino aktywne w chwili wydania |
| dish_ids | jsonb not null | posortowane, bez duplikatów, tylko opublikowane dania restauracji; `[]` dla `direct`; **bez FK** |
| serving | text not null | `CHECK`: `glass` \| `bottle` (kieliszek tylko dla wina z ceną kieliszka) |
| menu_version | timestamptz null | `restaurant.published_at` w chwili wydania |
| tier | text null | `CHECK`: `sommelier_primary` \| `sommelier` \| `engine`; tylko wybór gościa do jednego dania (Q18), inaczej null |
| engine_version | varchar(40) not null | `ENGINE_VERSION` |
| issued_at | timestamptz not null | `clock.now()` |
| confirmed_at | timestamptz null | „Zamówione” w G9 (F2); `coalesce` — drugie potwierdzenie nie zmienia czasu |
| confirmed_by | varchar(20) null | `actor` potwierdzenia (`staff_view`) |

Indeksy: unikalny `recommendation_code_choice_unique` (`restaurant_id`, `service_day`, `session_id`, `wine_id`, `serving`, `dish_ids`) — ten sam wybór w tym samym dniu ma jeden kod (R3), a prefiks indeksu liczy polecenia sesji (limit 30 gość / 300 kelner, R13); (`restaurant_id`, `issued_at`). Zapis: `insert … on conflict do nothing returning`, po konflikcie odczyt po kluczu wyboru (`existing`) albo `code_taken` (do 6 prób 3-znakowych i 6 prób 4-znakowych, Q4). Pamięć (`DATA_SOURCE=memory`) trzyma najwyżej 10 000 poleceń. Migracja `Migration20261018125821_recommendation_code` jest addytywna; `down` usuwa tabelę (tylko dev/test — w produkcji wycofanie to poprzedni obraz aplikacji, schemat zostaje). Retencja: brak w MVP (Q14). Kolumna `sales_record.recommendation_code` dodana w F3 (migracja `Migration20261021190119_sales_record_recommendation_code`, sekcja SalesRecord).

### Recommendation (precomputed cache)

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | |
| version_id | uuid FK → PublishedVersion | |
| dish_id | uuid FK | |
| context_key | text | znormalizowane preferencje, np. `serving=glass;styles=red;max=60` lub `default` |
| items | jsonb | `[{wineId, matchScore, rankScore, tier, role, bestValue, why}]` |
| engine_version | text | |
| created_at | timestamptz | |

Wariant `default` dla każdego dania liczony przy publikacji; pozostałe na żądanie i zapisywane (LRU / TTL do następnej publikacji). Zapytania o stolik cache’owane po posortowanej liście `dish_id` + `context_key`.

### GuestSession, GuestInteraction

| GuestSession | | GuestInteraction | |
|---|---|---|---|
| id | uuid PK (losowy UUID v4 w parametrze URL `sid`, bez ciasteczek i pamięci przeglądarki, bez danych osobowych) | id | bigint PK |
| restaurant_id | uuid FK | session_id | uuid FK |
| started_at | timestamptz | restaurant_id | uuid FK |
| source | enum `qr`, `link`, `staff` | name | text — nazwa eventu (lista w SCREEN_SPECIFICATION) |
| user_agent_class | text (`ios`, `android`, `desktop`) | dish_id, wine_id | uuid null |
| table_label | text null (opcjonalnie w QR: `?t=12`) | props | jsonb (`prefs`, `wineIds`, `serving`, `context`) |
| | | version_id, engine_version | |
| | | created_at | timestamptz |

Partycjonowanie miesięczne. Brak cookies śledzących i danych osobowych gościa. **Stan (E02 F1):** tabeli GuestSession nie ma — sesja to `sid` z URL, a jej źródło (`qr` / `link`) jest w `props.source` zdarzenia `guest_session_started`; kelner (`staff`) nie ma sesji gościa. Bez IP, UA, numeru stolika i tekstu od gościa.

### ImportJob, ImportRow

| ImportJob | | ImportRow | |
|---|---|---|---|
| id | uuid PK | id | uuid PK |
| restaurant_id | uuid FK | import_job_id | uuid FK |
| kind | enum `menu`, `wines`, `sales` | row_number | int |
| file_name, file_type, file_size | | raw | jsonb (oryginalne komórki) |
| storage_key | text (obiekt w S3) | parsed | jsonb (pola po mapowaniu i poprawkach) |
| status | enum `uploaded`, `parsing`, `preview_ready`, `confirmed`, `failed`, `cancelled` | issues | text[] |
| column_mapping | jsonb | include | bool |
| parser | text (`csv`, `xlsx`, `pdf-text`, `pdf-ocr`, `local-llm`) | result_entity_id | uuid null |
| error | text null | | |
| created_by, created_at, confirmed_at | | | |

### SalesRecord (`sales_record`, import CSV / XLSX z POS, później API POS)

Spec `2026-10-15-pos-sales-import-attach-rate` (E03), faza 1, migracja `Migration20261019064652_sales_record`. Jedna linia = jedna pozycja rachunku z eksportu POS.

**Kod polecenia (E09 F3, spec `2026-10-16-recommendation-code`, migracja `Migration20261021190119_sales_record_recommendation_code`):** kolumna `recommendation_code varchar(4) null` (znormalizowany kod albo null; komentarz z POS nigdy nie trafia do bazy, R8) i częściowy indeks `sales_record_recommendation_code_idx` (`restaurant_id`, `business_date`, `recommendation_code`) `where recommendation_code is not null`. Dopasowanie w POS (R9) nie jest zapisywane: liczy się przy odczycie — kod polecenia dnia (`business_date` = `service_day`) na dowolnej linii aktywnego rachunku, którego suma ilości `wine_glass` + `wine_bottle` > 0. `down` tej migracji usuwa kolumnę razem z kodami z importów: tylko dev/test; w produkcji wycofanie = poprzedni obraz aplikacji.

| Pole | Typ | Uwagi |
|---|---|---|
| id | uuid PK | `IdGenerator` |
| restaurant_id | uuid FK → `restaurant`, not null | zakres tenanta w każdym zapytaniu |
| import_job_id | uuid FK → `import_job`, not null | z którego importu pochodzi linia (audyt, wycofanie) |
| business_date | date, not null | dzień biznesowy z POS, bez konwersji stref (Q17) |
| check_id | varchar(64), not null | numer rachunku/paragonu unikalny w dniu biznesowym — **nie** numer stolika (Q17) |
| covers | smallint null, `CHECK (covers BETWEEN 0 AND 999)` | goście rachunku, powtarzani w liniach; liczy się `max` |
| item_type | text, `CHECK` `food`, `wine_glass`, `wine_bottle`, `other` | |
| quantity | numeric(10,3) → `number`, not null, `CHECK (quantity <> 0)` | ujemna = zwrot / storno |
| net_amount | numeric(12,2) → `number`, not null | netto linii, PLN (Q9) |
| replaced_at | timestamptz null | ustawione, gdy nowszy import zastąpił rachunek; odczyty biorą tylko `replaced_at IS NULL` |
| replaced_by_job_id | uuid FK → `import_job` null | który import zastąpił |
| created_at | timestamptz | |

Indeks `(restaurant_id, business_date, check_id)`. **Nie ma** `item_name`, `dish_id`, `wine_id` (Q10, Q18): nazwa pozycji jest widoczna tylko w podglądzie importu (`import_job.rows`), kolumny spoza listy pól importu (gość, kelner, płatność, komentarz) nie trafiają nigdzie. Kolumna `recommendation_code` dojdzie addytywnie w E09 F3.

**Zapis** (`PgImportRepository.confirm`, jedna transakcja): blokada wiersza zadania (`FOR UPDATE`; podwójne kliknięcie → `job_closed`), `pg_advisory_xact_lock(hashtext('sales_record:' || restaurant_id))` (dwa importy tych samych rachunków po kolei), `UPDATE … SET replaced_at, replaced_by_job_id` dla aktywnych linii tych samych (`business_date`, `check_id`), wstawienie nowych linii, zamknięcie zadania. Zapisywane są tylko pełne rachunki: rachunek z linią odznaczoną albo z błędem nie jest zapisany i niczego nie zastępuje.

**Odczyt** (`SalesRepository`): `checkTotals` sumuje aktywne linie per rachunek (`GROUP BY business_date, check_id`, `SUM … FILTER`), `dataRange`, `countChecks`; reguły wskaźnika w `core` (`computeSalesKpis`). Wine Attach Rate = rachunki z jedzeniem i winem / rachunki z jedzeniem (Q7, per rachunek; rachunek „ma” typ, gdy suma ilości tego typu > 0).

**Wycofanie (runbook, Q19).** Migracji `sales_record` **nie cofamy (`migration:down`) w produkcji, gdy tabela ma dane** — `down` usuwa linie, których restauracja może już nie mieć w plikach. Wycofanie wdrożenia = poprzedni obraz aplikacji; schemat zostaje (tabela addytywna, poprzedni kod jej nie dotyka). Przed migracją `pg_dump`. Wycofanie **jednego importu** (bez UI, ręcznie, po sprawdzeniu `import_job.id` i restauracji):

```sql
begin;
-- 1. usuń linie wycofywanego importu
delete from sales_record where restaurant_id = :restaurant and import_job_id = :job;
-- 2. przywróć linie, które ten import zastąpił
update sales_record set replaced_at = null, replaced_by_job_id = null
 where restaurant_id = :restaurant and replaced_by_job_id = :job;
commit;
```

Wycofuj od najnowszego importu danej restauracji (jeśli późniejszy import zastąpił linie tego importu, najpierw wycofaj tamten).

### EngineVersion

| Pole | Typ |
|---|---|
| id | text PK (np. `wm-rules-1.0.0`) |
| kind | enum `rules`, `learned` |
| config | jsonb (wagi, progi) |
| released_at | timestamptz |

## Przyszłość bez przebudowy

| Funkcja | Jak model to umożliwia |
|---|---|
| Integracja POS / e-menu | `external_ref` na Restaurant, Dish, Wine; SalesRecord z `check_id` |
| Inventory, dostępność w czasie rzeczywistym | `Wine.stock_qty`, `active`; webhook POS aktualizuje bez publikacji |
| Forecasting, pricing intelligence | SalesRecord + GuestInteraction (popyt pokazany vs. zrealizowany) |
| Optymalizacja portfela | CatalogWine + skuteczność par w wielu lokalach |
| Marketplace importerów | CatalogWine z dostawcą; osobna tabela ofert, nigdy w Pairing ani Recommendation |
| Profile smaku gości, rekomendacje między restauracjami | GuestSession → opcjonalne konto gościa; CatalogWine łączy te same wina w różnych lokalach |
| Model uczony (LightGBM) | SommelierDecision (etykiety) + GuestInteraction (konwersje) + `factors` jako cechy |
