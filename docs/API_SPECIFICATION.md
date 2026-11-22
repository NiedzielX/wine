# API — specyfikacja REST (v1)

Bazowy URL: `https://api.winematch.app/v1` (w aplikacji Next.js: `/api/v1`, route handlery w `packages/app/src/app/api/v1`). JSON UTF-8, nazwy pól w camelCase. Kwoty jako liczby w walucie restauracji.

## Konwencje

| Temat | Zasada |
|---|---|
| Uwierzytelnienie panelu | sesja w cookie httpOnly `wm_session` (SameSite=Lax) + nagłówek `X-CSRF-Token`; dla integracji: `Authorization: Bearer <api_key>` (plan Group) |
| Publiczne API gościa | bez uwierzytelnienia, limit żądań 120/min na klienta (reguła `public-api`, wiersz „Limity żądań” niżej), cache CDN `s-maxage=60, stale-while-revalidate=600` |
| Wersjonowanie | ścieżka `/v1`; silnik w odpowiedzi: `engineVersion` |
| Współbieżność | zasoby edytowalne zwracają `ETag`; `PATCH` z `If-Match`, przy konflikcie `409 Conflict` |
| Idempotencja | `POST` tworzące zasoby akceptują `Idempotency-Key` |
| Paginacja | `?limit=50&cursor=…`; odpowiedź `{data: [], nextCursor}` |
| Błędy | `{"error": {"code": "validation_failed", "message": "Price must be a positive number.", "fields": {"price": "must_be_positive"}}}` |
| Kody | 200, 201, 204, 400, 401, 403, 404, 409, 413 (plik), 415 (format), 422 (walidacja), 429, 500 |
| Stan | zaimplementowane: endpointy publiczne (`GET /dishes/{id}/recommendations`, `POST /recommendations/table`, `GET /public/restaurants/{slug}/menu`) oraz API panelu (Faza 4): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /restaurants/{slug}/pairings`, `POST /pairings`, `PATCH /pairings/{id}`, `DELETE /pairings/{id}`, `POST /restaurants/{slug}/pairings/bulk-decision`, `PATCH /wines/{id}`, `POST /restaurants/{slug}/publish`, a od E12 F1 `GET /restaurants/{slug}/team` i `PATCH /restaurants/{slug}/team/{membershipId}`. Pozostałe endpointy to kontrakt docelowy |
| Treści dwujęzyczne | od 2026-10-15 (spec `2026-10-15-bilingual-content`) dania, wina, notatki sommeliera i restauracja mają tłumaczenia PL/EN, ale **`/api/v1` zwraca teksty bazowe, jak dotąd** (bez `translations`, parametr `lang` jest ignorowany); tłumaczenia w API — osobna specyfikacja |
| Import i QR (Faza 5) | `POST /imports/menu` i `POST /imports/wines` (multipart, pole `file`; 201 z podglądem wierszy, kontrolami i notatkami), `GET /imports/{id}`, `PATCH /imports/{id}/rows` (`{rows:[{rowNumber, fields?, include?}]}`), `POST /imports/{id}/confirm` (200 `{created, updated, skipped, suggestions}`, jednorazowo), `DELETE /imports/{id}` (anuluje), `GET /restaurants/{slug}/qr?format=svg\|png&size=&download=1`, publicznie `GET /import-samples/menu\|wines\|sales`; `POST /imports/sales` (pozycje rachunków z POS, CSV/XLSX, `valueMap`, `replaced` — patrz „Imports”); restauracja przez `?restaurant={slug}`; wymaga uprawnienia `import.manage` (Sommelier, GM, Owner). Błędy pliku: 422 z kodem (`unsupported_format`, `legacy_xls`, `format_mismatch`, `corrupt_file`, `scanned_pdf`, `file_too_large`, `too_many_rows`, `empty_file`, `no_rows`, `no_header` — tylko sprzedaż, `no_complete_checks`); zamknięte zadanie: 422 `job_closed`. Typ pliku wykrywany po zawartości |
| Odstępstwa Fazy 4 | restauracja w ścieżce lub w `?restaurant=` to **slug** (nie UUID); `PATCH /pairings/{id}` przyjmuje **jedną** zmianę na żądanie (`status`, `role` albo `comment`) i wymaga `If-Match` (brak → 428, niezgodna wersja → 409); `rank` i `PUT /dishes/{id}/pairings/order`, `/pairings/generate` oraz klucze API nie są jeszcze zaimplementowane; blokada po nieudanych próbach jest per konto (`maxFailedAttempts: 5`, `lockMinutes: 15`), a od E21 F3 dodatkowo działa limit prób na klienta (reguła `login`, wiersz „Limity żądań”) |
| Walidacja wejścia | ciało żądania przechodzi przez schemat (`core/validators`), obiekty **ścisłe**: nieznane pole = `422 validation_failed` z `fields: {pole: "unknown_field"}`. Kody w `fields`: `required`, `invalid`, `too_long`, `too_many`, `too_few`, `unknown_field` oraz kod reguły (np. `one_of_status_role_comment`, `at_least_two_distinct`). Niepoprawny JSON: `422 invalid_json`; ciało powyżej 2 MB: `422 payload_too_large`. Każdy błąd ma kształt `{error:{code, message, fields?}}`, a nieoczekiwany błąd serwera to ogólne `500 unexpected` bez szczegółów |
| Kod polecenia (E09) | spec `2026-10-16-recommendation-code`: **bez tras w `/api/v1`** (poza zakresem). Wydanie kodu dzieje się przy renderze G8/G11, a oznaczenie „Zamówione” / „Cofnij” (F2, od 2026-10-18) to publiczna akcja serwerowa G9 `markCode` (pola `slug`, `code`, `intent`, `sid`, `lang`); jej błąd domenowy `code_not_found` (`NotFoundError`) jest tylko w akcji i na G9 (`codeError=not_found`), API go nie zwraca |
| Metryki i log żądań (E21 F1) | `GET /api/v1/metrics` (poza kontraktem BC): format tekstowy Prometheus, **404** gdy `METRICS_TOKEN` nie jest ustawiony, **401** (`WWW-Authenticate: Bearer`) bez poprawnego `Authorization: Bearer`, `Cache-Control: no-store`; liczniki per proces z etykietami o niskiej kardynalności (wzorzec trasy, klasa statusu, wynik, nazwa reguły), nigdy slug, `sid`, id ani IP **w etykietach metryk** (trasy w etykiecie i w wierszu logu są wzorcami, np. `/api/v1/pairings/{id}`; ścieżki stron gościa w logach proxy slug zawierają). Endpoint nie korzysta z bazy i nie jest sam liczony ani logowany. Każde żądanie API (także odrzucone 401/403 i błąd otwarcia zakresu żądania) zostawia jeden wiersz logu `api request` (`method`, `route` jako wzorzec, `status`, `durationMs`), bez query, nagłówków, ciała i IP |
| Limity żądań (E21 F3) | Spec `2026-11-04-platform-quality-and-compliance` R7–R9. Okno stałe na klienta i regułę: `public-api` 120/60 s (`GET /public/restaurants/{slug}/menu`, `GET /dishes/{id}/recommendations`, `POST /recommendations/table`), `login` 20/600 s (`POST /auth/login` i formularz logowania panelu, wspólny licznik). Każde żądanie się liczy (także odrzucone przez walidację), przed odczytem ciała. Ponad limit: **429** `{"error":{"code":"rate_limited","message":"Too many requests. Try again later."}}`, nagłówek `Retry-After` (sekundy do końca okna, ≥ 1) i `Cache-Control: no-store`; odrzucona próba logowania nie dotyka konta (licznik blokady się nie zmienia). Klient = skrót HMAC adresu z `X-Forwarded-For` (tylko gdy `TRUSTED_PROXY_HOPS` ≥ 1, adres dopisany przez zaufane proxy); bez zaufanego proxy albo z brakującym lub błędnym nagłówkiem wszyscy tacy klienci dzielą jeden licznik z limitem o połowę niższym. Nagłówek `X-Wine-Match-Synthetic` limitu **nie** omija. Bez limitu: `GET /health`, `GET /metrics` i trasy panelu z sesją (`handle()`). Wartości zmienia `RATE_LIMITS` (`docs/DEPLOYMENT.md`, sekcja 4). Awaria magazynu liczników przepuszcza żądanie (`warn` w logu) |
| Health (E11 F1) | `GET /api/v1/health` (publiczny, bez sesji, `Cache-Control: no-store`, addytywny wg BC §2): **200** `{"status":"ok","checks":{"database":"ok"}}` gdy proces działa i (dla `postgres`) `select 1` odpowiada w ≤ 2 s (`"skipped"` dla `memory`); **503** `{"status":"unavailable","checks":{"database":"unreachable"}}` przy niedostępnej bazie albo gdy nie da się zbudować kontenera. Odpowiedź nie zawiera hosta, użytkownika, hasła, komunikatu sterownika, wersji, liczników ani źródła danych (`dataSource` trafia tylko do logu przy awarii; zmiana wobec pierwotnego kształtu ze specyfikacji E11, decyzja 2026-11-05). Równoczesne żądania dzielą jedno sprawdzenie, a ostatnia odpowiedź jest używana ponownie przez 2 s (powrót bazy widać najpóźniej po tym czasie; jedno zapytanie, jeden wiersz błędu i jedna próbka metryki na sprawdzenie, nie na żądanie). Po powrocie bazy zwraca 200 bez restartu procesu (nieudana budowa kontenera nie jest buforowana). Żądanie jest logowane jak każde inne (`api request`, wzorzec `/api/v1/health`) i liczone w `http_requests_total`; czas sprawdzenia trafia do `db_health_check_duration_seconds` (tylko `postgres`). Obraz kontenera (faza 2) traktuje **dowolną** odpowiedź HTTP jako „żyje”, a 200 jako „gotowy” |
| Uwierzytelnianie | sesja w ciasteczku `wm_session` (httpOnly, SameSite=Lax, Secure w produkcji, 12 h); zmiany wymagają `X-CSRF-Token` (z `GET /auth/me` lub odpowiedzi logowania), a żądania `cross-site` i z obcym `Origin` są odrzucane (403) |

Uprawnienia: **P** publiczny, **W** waiter, **S** sommelier, **M** owner/manager, **A** system admin.

---

## Auth

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/auth/login` | P | `{email, password}` → `200 {user, memberships[]}` + cookie |
| POST | `/auth/logout` | S M | `204` |
| GET | `/auth/me` | S M | bieżący użytkownik i rola w lokalu |
| POST | `/auth/password-reset` | P | `{email}` → `202` (zawsze, bez ujawniania kont) |

### Zaproszenia do zespołu (E12 F2)

Uprawnienie `team.manage` w lokalu `{slug}`; zapisy: sesja i `X-CSRF-Token`. Zaproszenie to jednorazowy link (72 h) przekazywany ręcznie: poczty nie ma (pytanie Q-O2). Menedżer zaprasza tylko `sommelier`; `owner` i `manager` tylko właściciel; roli `waiter` zaproszenie nie ma. Odpowiedź jest taka sama dla adresu z kontem i bez konta; wyjątek: osoba już w zespole lokalu (aktywna lub z odebranym dostępem) to `409 already_member`.

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| GET | `/restaurants/{slug}/invitations` | O M | `200 {invitations[]}`: `id`, `email`, `role`, `createdBy`, `createdByName`, `createdAt`, `expiresAt`, `expired`; nigdy token ani link |
| POST | `/restaurants/{slug}/invitations` | O M | ciało `{email, role}` (`strictObject`, `role` ∈ `owner`, `manager`, `sommelier`); `201` z zaproszeniem i polem `link` (`PUBLIC_BASE_URL/admin/accept?token=…`, **jedyny raz**, odpowiedź `Cache-Control: private, no-store`). Nowe zaproszenie na ten sam adres i lokal cofa poprzednie (jeśli zapraszający nie mógł go cofnąć: `403 team_hierarchy`). Błędy: `403 team_hierarchy`, `403 forbidden`, `409 already_member`, `422 validation_failed` |
| DELETE | `/restaurants/{slug}/invitations/{invitationId}` | O M | cofa nieprzyjęte zaproszenie, link przestaje działać od razu; `204`. `404` dla nieznanego, cudzego lokalu, użytego lub już cofniętego (też gdy id nie jest UUID-em); `403 team_hierarchy`, gdy menedżer cofa zaproszenie właściciela lub menedżera |

Przyjęcie (A17) nie ma trasy API: to formularz `/admin/accept` (akcja serwerowa, zwykły POST bez JavaScriptu). Link, którego nie można użyć (nieznany, użyty, cofnięty, wygasły, zapraszający stracił dostęp), daje jedną odpowiedź: stronę „link nieważny” z kodem 404.

### Zespół restauracji (E12 F1)

Wymagają uprawnienia `team.manage` (owner, manager) w lokalu `{slug}`; zapisy: sesja, `X-CSRF-Token`, `If-Match`. Hierarchię (Q7) egzekwuje serwis, nie macierz uprawnień.

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| GET | `/restaurants/{slug}/team` | O M | `200 {members[]}`: każdy z `membershipId`, `userId`, `name`, `email`, `role`, `status` (`active` / `deactivated`), `version`, `lastLoginAt`, `createdAt`, `deactivatedAt`, `deactivatedBy`; nigdy skrót hasła |
| PATCH | `/restaurants/{slug}/team/{membershipId}` | O M | nagłówek `If-Match: "<version>"` wymagany (428 bez niego, 400 gdy nie liczba); ciało `{role?, status?}` (co najmniej jedno; `strictObject`); `200` z osobą i nowym `ETag`. Błędy: `403 team_hierarchy` (manager zmienia właściciela lub innego managera albo nadaje `owner`/`manager`), `422 self_change` (własna rola lub dezaktywacja), `409 last_owner` (ostatni aktywny właściciel), `409 version_conflict`, `422 member_deactivated` (zmiana roli osoby bez dostępu), `404` (osoba spoza lokalu, także id niebędące UUID-em), `403` bez `team.manage` |

Dezaktywacja działa od następnego żądania osoby (sesja zostaje, ale `GET /auth/me` nie zwraca już tego lokalu, a API i panel odpowiadają 403); reaktywacja przywraca dostęp bez nowego logowania. Zaproszenia, konto, sesje, reset hasła, PIN kelnera i dziennik (A18) to kolejne fazy E12.

---

## Restaurants

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/restaurants` | A | utworzenie restauracji |
| GET | `/restaurants/{id}` | S M | szczegóły i ustawienia |
| PATCH | `/restaurants/{id}` | M (slug), S M | nazwa, slug, adres, Wine Director |
| PATCH | `/restaurants/{id}/settings` | S M | `{showUnreviewed, showScores}` |
| GET | `/restaurants/{id}/setup-status` | S M | stan 8 kroków onboardingu |
| GET | `/restaurants/{id}/menu` | S M | wszystkie dania (z draftami) pogrupowane po kategoriach |
| GET | `/restaurants/{id}/dishes` | S M | `?q=&category=&status=` |
| GET | `/restaurants/{id}/wines` | S M W | `?q=&style=&active=` |
| GET | `/restaurants/{id}/publish/preview` | S M | checklista i liczba zmian |
| POST | `/restaurants/{id}/publish` | S M | tworzy PublishedVersion (migawka v2: pary, tłumaczenia, profile, skład karty). Opcjonalne ciało `{expectedLatest}` (numer najnowszej wersji widziany przez klienta, `0` = brak publikacji): inny numer → 409 `version_conflict`, nic nie jest zapisane; nieznane pole → 422. Puste ciało publikuje jak dotąd |
| GET | `/restaurants/{id}/versions` | S M | historia publikacji |
| POST | `/restaurants/{id}/versions/{versionId}/restore` | M | rollback |
| GET | `/restaurants/{id}/qr` | S M | `?format=svg|png&size=1024` |

```http
POST /v1/restaurants/7d1e…/publish
→ 201
{
  "versionId": "0192…",
  "number": 14,
  "changesCount": 12,
  "publishedAt": "2026-10-14T16:02:11Z"
}
```

## Public (aplikacja gościa)

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| GET | `/public/restaurants/{slug}` | P | nazwa, adres, Wine Director, ustawienia gościa, `versionId` |
| GET | `/public/restaurants/{slug}/menu` | P | opublikowane dania (bez profili) |
| GET | `/public/wines/{id}` | P | `?dishId=` — szczegóły wina z wynikiem dopasowania do dania |
| POST | `/public/events` | P | **planowane** (nie istnieje): batch eventów analytics tylko‑JS (do 50). Dziś zdarzenia zapisuje serwer przy renderze stron gościa (spec `2026-10-15-guest-usage-events`) |

```http
GET /v1/public/restaurants/halka/menu
→ 200
{
  "versionId": "0192…",
  "categories": [
    {"name": "Starters", "dishes": [
      {"id": "d_tartare", "name": "Beef tartare", "description": "Hand-cut tenderloin…", "price": 68,
       "hasSommelierPairing": true}
    ]}
  ]
}
```

---

## Dishes

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/dishes` | S M | `{restaurantId, name, description, category, price}`; profil szkicowany automatycznie |
| GET | `/dishes/{id}` | S M | danie z profilem |
| PATCH | `/dishes/{id}` | S M | pola dania |
| GET | `/dishes/{dishId}/details?restaurant={slug}` | S M | edytowalne pola `{name, description, category, price}`; odcisk pól w nagłówku `ETag` (uprawnienie `catalog.edit`; E13 C1) |
| PATCH | `/dishes/{dishId}/details?restaurant={slug}` | S M | dowolne z `name` (1–120), `description` (0–1000), `category` (`Starters` \| `Mains` \| `Desserts`), `price` (> 0, ≤ 10 000, najwyżej dwa miejsca po przecinku; liczba), co najmniej jedno pole (`strictObject`: `status`, `profile` i inne pola → 422 `unknown_field`); teksty: NFC, przycięcie, znaki sterujące i niewidoczne → `invalid_chars`. **`If-Match: "<odcisk>"` wymagany** (428 bez, 400 niepoprawny, 409 `version_conflict`); kolizja nazwy (po `normKey`, także ze szkicami i ukrytymi) → 422 `fields: {name: "duplicate"}`; błędy pól wracają wszystkie naraz. Odpowiedź: `{changed, name, description, category, price}` + `ETag`; brak zmiany po normalizacji → `changed: false`, bez wpisu audytu. Zmiana jest **od razu** widoczna dla gości i nie liczy się do niepublikowanych zmian; tłumaczenia i profil zostają, żadne pole nie zmienia Match Score. Każda zmiana zapisuje wiersz `catalog_edit` |
| GET | `/dishes/{dishId}/visibility?restaurant={slug}` | S M | `{id, status}` (`published` \| `hidden` \| `draft`); odcisk pól i statusu w nagłówku `ETag` (uprawnienie `catalog.edit`; E13 C2) |
| POST | `/dishes/{dishId}/visibility?restaurant={slug}` | S M | `{hidden: boolean}` (`strictObject`): ukrywa opublikowane danie przed gośćmi (`true`) albo pokazuje ukryte (`false`). **`If-Match: "<odcisk>"` wymagany** (428 bez, 400 niepoprawny, 409 `version_conflict` także po zmianie pól dania). Dozwolone tylko `published ↔ hidden`: danie `draft` i danie już w żądanym stanie → 422 `fields: {status: "transition"}` (szkic wychodzi przy publikacji). Działa **od razu**, bez publikacji, i nie liczy się do niepublikowanych zmian (ukryte danie zostaje w składzie karty w migawce). Pokazanie dania dopisuje w tej samej transakcji brakujące propozycje silnika. Odpowiedź: `{id, status, suggestions}` + `ETag`. Wpis `catalog_edit` z `action` `hidden` albo `shown` |
| GET | `/dishes/{dishId}/profile?restaurant={slug}` | S M | `{profile, version}`; odcisk profilu także w nagłówku `ETag` (uprawnienie `profiles.edit`; E13 F2) |
| PUT | `/dishes/{dishId}/profile?restaurant={slug}` | S M | ciało `{profile, confirm}` (`strictObject`: skale 0–5 całkowite, `protein`, `cooking`; `confirm: true` = potwierdzony, `false` = szkic); **`If-Match: "<odcisk>"` wymagany** (428 bez, 400 niepoprawny, 409 `version_conflict` gdy profil zmieniono od odczytu); odpowiedź `{changed, profile, version}` + `ETag`; brak zmiany → `changed: false`, bez wpisu audytu. **Nie przelicza `modelScore` ani propozycji** (robi to publikacja i regeneracja par); goście widzą zmianę po następnej publikacji. Każda zmiana zapisuje wiersz `profile_edit` |
| GET | `/dishes/{dishId}/profile/preview?restaurant={slug}&intensity=…&protein=…` | S M | podgląd „Jak zmieni się dopasowanie” (te same parametry co formularz GET w panelu, ten sam schemat Zod): wiersze `{otherId, otherName, before, after, delta, pairing}` dla aktywnych win, top propozycji gościa przed i po, podsumowanie (zatwierdzone pary ze zmianą wyniku, przekroczenia progu `minModelScore`). Tylko odczyt: wyniki z `pairingScore`, bez zapisu, sieci i LLM |
| DELETE | `/dishes/{id}` | S M | soft delete |
| GET | `/dishes/{id}/pairings` | S M | pary dania (wszystkie statusy) |
| PUT | `/dishes/{id}/pairings/order` | S | `{pairingIds: [...]}` → rank 1..n |
| GET | `/dishes/{id}/recommendations` | P | ranking dla gościa (poniżej) |

### GET /dishes/{id}/recommendations

Parametry:

| Parametr | Wartości |
|---|---|
| `restaurant` | **wymagany**: slug restauracji. Każde zapytanie jest ograniczone do jednej restauracji; brak → `422`, nieznana restauracja lub nieopublikowane danie → `404` |
| `serving` | `any` (domyślnie), `glass`, `bottle` |
| `styles` | lista: `sparkling,white,rose,orange,red,sweet` |
| `maxPrice` | liczba (dla serwowania; `any` → cena kieliszka, jeśli jest, w przeciwnym razie butelki) |
| `weight` | `any`, `lighter`, `fuller` |
| `mood` | `any`, `classic`, `adventurous` |
| `limit` | 1–6, domyślnie 4 |
| `preview` | `true` — wersja robocza (panel, wymaga S M) zamiast opublikowanej |

```http
GET /v1/dishes/d_duck/recommendations?restaurant=halka&serving=glass&limit=4
→ 200
{
  "dishId": "d_duck",
  "versionId": "0192…",
  "engineVersion": "wm-rules-1.2.0",
  "notice": null,
  "items": [
    {
      "wine": {"id": "w_savigny", "producer": "Domaine Chandon de Briailles", "name": "Savigny-lès-Beaune",
               "vintage": 2020, "region": "Burgundy", "colour": "#7D2234",
               "glassPrice": 64, "glassPourMl": 150, "bottlePrice": 320},
      "matchScore": 80,
      "tier": "sommelier_primary",
      "sommelier": {"role": "primary", "name": "Marta Wierzbicka"},
      "bestValue": false,
      "why": "Pinot and sour cherry jus — our signature match."
    },
    {
      "wine": {"id": "w_lapierre", "producer": "Marcel Lapierre", "name": "Morgon", "…": "…"},
      "matchScore": 77,
      "tier": "sommelier",
      "sommelier": {"role": "best_value", "name": "Marta Wierzbicka"},
      "bestValue": true,
      "why": "Fresh acidity cuts through the richness, and bright Gamay fruit lifts the dish."
    }
  ]
}
```

`tier`: `sommelier_primary` | `sommelier` | `engine`. Klient pokazuje etykietę „Sommelier’s pairing” / „Para sommeliera” wyłącznie dla dwóch pierwszych; najlepszą propozycję `engine` aplikacja gościa nazywa „Recommended for your dish” / „Polecane do Twojego dania”. Pola i wartości `tier` bez zmian — etykiety to tekst klienta.

---

## Wines

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/wines` | S M | nowa pozycja karty; profil z domyślnych szczepu i stylu |
| GET | `/wines/{id}` | S M | wino z profilem |
| PATCH | `/wines/{id}` | S M | ceny, `active`, nota, serwowanie; walidacja: `glassPrice < bottlePrice` |
| GET | `/wines/{id}/details?restaurant={slug}` | S M | edytowalne pola `{producer, name, vintage, region, country, tastingNote, listNumber, bottlePrice, glassPrice, pouredByGlass}`; `ETag` jak dla dania (`catalog.edit`) |
| PATCH | `/wines/{id}/details?restaurant={slug}` | S M | dowolne z `producer` (1–120), `name` (1–160), `vintage` (liczba całkowita od 1900 do roku bieżącego + 1 albo dokładnie `"NV"`), `region` (0–120), `country` (0–80), `tastingNote` (0–1000), `listNumber` (1–9999 albo `null`; unikalny wśród win restauracji, sprawdzany tylko przy zmianie), `bottlePrice` (> 0, ≤ 100 000), `pouredByGlass` (boolean), `glassPrice` (> 0 i poniżej ceny butelki; tylko z `pouredByGlass`, przy `false` zapisywana jako `null`, przy `glassPrice` bez włączonego przełącznika → `not_allowed`). Reguły sprawdzane na stanie po scaleniu z zapisanym (brak `pouredByGlass` = obecny stan). `If-Match`, `ETag`, kody błędów, klucz `producent|nazwa|rocznik` unikalny (`duplicate`), widoczność dla gości i audyt jak dla dania. **Dostępność** (`active`) zostaje w `PATCH /wines/{id}` `{active}` (uprawnienie `wines.toggle`) |
| GET | `/wines/{id}/profile?restaurant={slug}` | S M | jak dla dania: `{profile, version}` + `ETag` |
| PUT | `/wines/{id}/profile?restaurant={slug}` | S M | `{profile, confirm}` (skale 0–5, `alcohol` 0–25 co 0,1, `style`, `adventurous`), `If-Match` jak dla dania; `confirm: false` ustawia `grape_defaults` (zachowuje `catalog`), `true` — `confirmed` z autorem i czasem |
| GET | `/wines/{id}/profile/preview?restaurant={slug}&body=…&style=…` | S M | jak dla dania: wiersze dla dań z karty i lista dań, w których wino wchodzi do najlepszych propozycji lub z nich wypada |
| GET | `/restaurants/{slug}/picks` | S M | „Wybór restauracji” (spec `2026-11-18-restaurant-picks`, R16): zbiór roboczy `{version, max, picks: [{wineId, producer, name, vintage, active, published, setAt, setBy}]}`, także to, co jeszcze nie jest opublikowane; `max` = 5; pozycje posortowane po `wineId`; wino nieaktywne zostaje w zbiorze i zajmuje miejsce (`active: false`); `published` = wino jest w zbiorze, który goście widzą teraz. Odcisk zbioru także w nagłówku `ETag`. Uprawnienie `panel.view` (Sommelier widzi, Owner / GM zmienia) |
| PUT | `/wines/{id}/pick?restaurant={slug}` | M | ciało `{on: boolean, expectedVersion?: string}` (`strictObject`; slug tylko z `?restaurant=`); wersja zbioru **wymagana**: nagłówek `If-Match: "<odcisk>"` albo `expectedVersion` w ciele (428 bez obu, 400 niepoprawny `If-Match`, 409 `version_conflict` gdy zbiór zmieniono od odczytu); uprawnienie `picks.edit` (Owner i GM; Sommelier 403). Odpowiedź `{changed, version, max, count}` + `ETag`; stan już taki, o jaki prosi wywołanie → `changed: false`, bez wpisu w `pick_edit`. 422 `too_many_picks` (szósty wybór; limit liczy także wina nieaktywne), 422 `wine_inactive` (oznaczenie wina wyłączonego). Cudze wino, nieznane wino i id niebędące UUID dają **tę samą** odpowiedź 404. Goście widzą zmianę dopiero po publikacji |
| GET | `/restaurants/{slug}/picks/simulation?picks=id,id&dish={dishId}` | S M | symulator „przed / po” (tylko odczyt, bez zapisu, sieci i LLM): dla każdego widocznego dania (albo jednego) listy `before` (zbiór opublikowany, to, co gość widzi teraz) i `after` (zbiór roboczy albo zbiór z `picks`, najwyżej 5 id; `picks=` puste = brak wyborów), liczone tą samą funkcją co ścieżka gościa; pozycje z surowym `matchScore`, `tier`, `sommelierPair`, `restaurantPick`; `moves` (`from`/`to`, 1-based, `null` = poza listą), `reordered`; per wybór `effect` (`moved`, `label_only`, `none`) i powód braku wpływu `reason`: `inactive`, `not_in_list`, `sommelier_pair`, `unreviewed_hidden`, `below_min_score` (surowy wynik < 75), `outside_window` (więcej niż 10 pkt pod najlepszym winem grupy), `over_cap` (już 2 inne wybory idą przed). `summary`: dania, dania ze zmianą kolejności, wybory bez wpływu. Zmieniają się tylko wybory; inne niepublikowane zmiany (pary, profile, tłumaczenia) są poza symulacją, więc równość „after” z listą gościa po publikacji dotyczy sytuacji, gdy wybory są jedyną zmianą. Obce lub nieznane id w `picks` ma tę samą odpowiedź (`name: null`, `not_in_list`); nieznane `dish` → 404; więcej niż 5 id → 422 `too_many` |
| DELETE | `/wines/{id}` | S M | soft delete |
| GET | `/wines/{id}/best-dishes` | S M | odwrotny ranking: dania najlepiej pasujące do wina |

```http
PATCH /v1/wines/w_graillot
If-Match: "v7"
{"active": false}
→ 200  ETag: "v8"
```

Zmiana `active` działa natychmiast także w wersji opublikowanej (gość nie może zobaczyć wina, którego nie ma).

---

## Pairings

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| GET | `/restaurants/{id}/pairings` | S M | `?status=suggested&dishId=` |
| POST | `/pairings` | S | ręczna para: `{dishId, wineId, role, comment}` → `status=approved|modified`, `source=sommelier` |
| PATCH | `/pairings/{id}` | S | `{status?, role?, rank?, comment?}`; zapisuje SommelierDecision |
| DELETE | `/pairings/{id}` | S | tylko pary `source=sommelier`; pary silnika można odrzucić |
| POST | `/pairings/{id}/decisions` | S | jawna decyzja `{action: "approve"|"reject"|"restore"}` |
| GET | `/pairings/{id}/decisions` | S M | historia decyzji |
| POST | `/restaurants/{id}/pairings/generate` | S M | (re)generacja propozycji; nie dotyka par zrecenzowanych |
| POST | `/restaurants/{id}/pairings/bulk-decision` | S | `{dishId?, action: "approve_all"}` |

```http
PATCH /v1/pairings/p_duck_savigny
If-Match: "v3"
{"role": "primary", "comment": "Pinot and sour cherry jus — our signature match."}
→ 200
{"id": "p_duck_savigny", "status": "modified", "role": "primary", "rank": 1, "modelScore": 80,
 "factors": [{"rule": "affinity.poultry", "delta": 8}, {"rule": "acid.cuts_fat", "delta": 5}, {"rule": "weight.gap", "delta": -5}],
 "version": 4, "dirty": true}
```

Reguły serwera: ustawienie `role=primary` degraduje poprzedni Primary do `alternative`; ustawienie roli na parze `suggested` zatwierdza ją; dodanie komentarza do pary `approved` zmienia status na `modified`.

---

## Recommendations

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| GET | `/dishes/{id}/recommendations` | P | patrz wyżej |
| POST | `/recommendations/table` | P | butelka dla stolika |
| POST | `/engine/preview` | S | wynik dla roboczego profilu (podgląd na żywo w A3/A5) |

### POST /recommendations/table

```http
POST /v1/recommendations/table
{
  "restaurantSlug": "halka",
  "dishIds": ["d_tartare", "d_risotto", "d_duck"],
  "preferences": {"serving": "bottle", "styles": [], "maxPrice": null, "weight": "any", "mood": "any"},
  "limit": 3
}
→ 200
{
  "engineVersion": "wm-rules-1.2.0",
  "items": [
    {"wine": {"id": "w_savigny", "…": "…"}, "overall": 85, "price": 320, "serving": "bottle",
     "perDish": [
       {"dishId": "d_tartare", "score": 83, "sommelierPick": false},
       {"dishId": "d_risotto", "score": 93, "sommelierPick": true},
       {"dishId": "d_duck", "score": 83, "sommelierPick": true}
     ],
     "why": "Works across every dish on the table."}
  ],
  "setAside": [],
  "splitSuggested": false,
  "split": []
}
```

Walidacja: 2–12 dań z tej samej restauracji, inaczej `422 {code: "table_needs_two_dishes"}`.

---

## Imports

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/imports/menu` | S M | `multipart/form-data` (`file`, `restaurantId`) → `202 {importId, status: "parsing"}` |
| POST | `/imports/wines` | S M | jw. |
| POST | `/imports/sales` | S M | CSV / XLSX z POS (od 2026-10-19, spec `2026-10-15-pos-sales-import-attach-rate`): pozycje rachunków; jak menu/wina `201` z podglądem. PDF → `422 unsupported_format`; brak wymaganej kolumny → `422 no_header` z `fields` (np. `{netAmount: "required"}`). `PATCH /imports/{id}/rows` i `POST /imports/{id}/confirm` przyjmują dodatkowo `valueMap: [{field: "itemType", from, to}]` (`to`: `food`, `wine_glass`, `wine_bottle`, `other`; ≤ 200), klucze pól sprzedaży: `businessDate`, `checkId`, `covers`, `itemType`, `itemName`, `recommendationCode` (opcjonalne, tylko znormalizowany kod polecenia; tekst komentarza nigdy nie trafia do odpowiedzi, spec `2026-10-16-recommendation-code` R8), `quantity`, `netAmount`. `confirm` sprzedaży zwraca `{created, updated: 0, skipped, suggestions: 0, replaced}` (`created`/`skipped` — linie, `replaced` — zastąpione rachunki); brak pełnego rachunku → `422 no_complete_checks` |
| GET | `/imports/{id}` | S M | status i wiersze podglądu `{status, rows: [{rowNumber, parsed, issues, include}]}` |
| PATCH | `/imports/{id}/rows` | S M | poprawki: `[{rowNumber, parsed: {price: 72}, include: true}]` |
| POST | `/imports/{id}/confirm` | S M | zapis; zwraca liczbę utworzonych i zaktualizowanych encji |
| DELETE | `/imports/{id}` | S M | anulowanie |

Limity: 10 MB; typy `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, `application/pdf`. Inne → `415`. PDF parsowany asynchronicznie (tekst; dla skanów OCR); opcjonalnie lokalny LLM do strukturyzacji wierszy — wyłącznie w tym kroku.

```http
POST /v1/imports/menu/0193…/confirm
→ 200 {"created": 5, "updated": 0, "skipped": 0, "suggestionsGenerated": 20}
```

---

## Analytics

**Stan (spec `2026-10-15-kpi-dashboard`, E04):** trasy `GET …/analytics/*` niżej są **planowane** — nie istnieją. KPI liczy panel po stronie serwera przez `AnalyticsService` z `core` (od E04 F1: użycie gości na A1; od E04 F2: KPI sprzedaży na A1 — `salesSummary` przez `SalesKpiService`; od E04 F3: skuteczność par na A1 — odpowiednik planowanego `/analytics/pairings`); kształt odpowiedzi tras ustali osobna specyfikacja (bez obietnicy zgodności z `UsageSummary`).

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/public/events` | P | eventy gościa — **planowane** (zdarzenia tylko‑JS, np. `recommendation_clicked`); zdarzenia lejka zapisują strony gościa po stronie serwera, z sesją w parametrze URL `sid` (`docs/SCREEN_SPECIFICATION.md`, „Zdarzenia użycia”) |
| GET | `/restaurants/{id}/analytics/summary` | S M | KPI za okres `?from=&to=` + porównanie z poprzednim |
| GET | `/restaurants/{id}/analytics/timeseries` | S M | `?metric=sessions,selections&granularity=day` |
| GET | `/restaurants/{id}/analytics/dishes` | S M | najczęściej wyszukiwane dania |
| GET | `/restaurants/{id}/analytics/wines` | S M | `?by=recommended|selected` |
| GET | `/restaurants/{id}/analytics/pairings` | S M | skuteczność par: shown, chosen, conversion, source |
| GET | `/restaurants/{id}/analytics/export` | M | CSV |

Przykład docelowy (planowane, nie zaimplementowane):

```http
POST /v1/public/events
{"sessionId": "6a0c…", "restaurantSlug": "halka", "versionId": "0192…",
 "events": [{"name": "recommendations_viewed", "ts": "2026-10-14T19:41:02Z",
             "props": {"dishId": "d_duck", "wineIds": ["w_savigny", "w_lapierre"], "prefs": {"serving": "glass"}}}]}
→ 202
```

```http
GET /v1/restaurants/7d1e…/analytics/summary?from=2026-09-16&to=2026-10-13
→ 200
{
  "attachRate": {"value": 0.46, "baseline": 0.34, "source": "sales_import"},
  "wineRevenuePerGuest": {"value": 118, "previous": 99},
  "wineRevenuePerTable": {"value": 296, "previous": 251},
  "averageBottle": {"value": 312, "previous": 286},
  "averageGlass": {"value": 54, "previous": 51},
  "sessions": {"value": 1284, "previous": 1102},
  "recommendationViews": {"value": 3410, "previous": 2875},
  "recommendationToSelection": {"value": 0.38, "previous": 0.33}
}
```

Gdy brak importu sprzedaży, pola sprzedażowe mają `"value": null, "source": null`.

Trasa jest planowana; dziś panel liczy te wartości w serwisach (`SalesKpiService.getSalesKpis(slug, {from, to})` i `dataRange(slug)`, spec `2026-10-15-pos-sales-import-attach-rate` F2 — kontrakt dla E04). `attachRate` = rachunki z jedzeniem i winem / rachunki z jedzeniem (per rachunek, `PRODUCT_CONCEPT.md` §6); okres: dni biznesowe `YYYY-MM-DD`, obie granice włącznie, `to − from ≤ 365`, inaczej `422 invalid_period` (`ValidationError`, `fields.from|to`: `invalid`, `before_from`, `too_long`).

---

## Integracje (poza MVP — kontrakt zarezerwowany)

| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/integrations/pos/{provider}/webhook` | sprzedaż, dostępność, ceny z POS |
| PUT | `/restaurants/{id}/wines/availability` | masowa dostępność / stany |
| GET | `/embed/{slug}/dishes/{externalRef}/recommendations` | rekomendacje dla zewnętrznego e-menu po ID dania w systemie partnera |

## Administracja (System Admin)

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/admin/restaurants` | lista, status, plan |
| POST | `/admin/restaurants/{id}/impersonate` | sesja read-only z logiem audytowym |
| GET | `/admin/engine/versions` | wersje silnika |
| POST | `/admin/engine/versions/{id}/rollout` | `{restaurantIds?, percentage?}` |
| GET | `/admin/engine/quality` | rozkład wyników, odsetek odrzuceń przez sommelierów per reguła |
