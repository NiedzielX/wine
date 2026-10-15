# API — specyfikacja REST (v1)

Bazowy URL: `https://api.winematch.app/v1` (w aplikacji Next.js: `/api/v1`, route handlery w `packages/app/src/app/api/v1`). JSON UTF-8, nazwy pól w camelCase. Kwoty jako liczby w walucie restauracji.

## Konwencje

| Temat | Zasada |
|---|---|
| Uwierzytelnienie panelu | sesja w cookie httpOnly `wm_session` (SameSite=Lax) + nagłówek `X-CSRF-Token`; dla integracji: `Authorization: Bearer <api_key>` (plan Group) |
| Publiczne API gościa | bez uwierzytelnienia, rate limit 120 req/min/IP, cache CDN `s-maxage=60, stale-while-revalidate=600` |
| Wersjonowanie | ścieżka `/v1`; silnik w odpowiedzi: `engineVersion` |
| Współbieżność | zasoby edytowalne zwracają `ETag`; `PATCH` z `If-Match`, przy konflikcie `409 Conflict` |
| Idempotencja | `POST` tworzące zasoby akceptują `Idempotency-Key` |
| Paginacja | `?limit=50&cursor=…`; odpowiedź `{data: [], nextCursor}` |
| Błędy | `{"error": {"code": "validation_failed", "message": "Price must be a positive number.", "fields": {"price": "must_be_positive"}}}` |
| Kody | 200, 201, 204, 400, 401, 403, 404, 409, 413 (plik), 415 (format), 422 (walidacja), 429, 500 |
| Stan | zaimplementowane: endpointy publiczne (`GET /dishes/{id}/recommendations`, `POST /recommendations/table`, `GET /public/restaurants/{slug}/menu`) oraz API panelu (Faza 4): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /restaurants/{slug}/pairings`, `POST /pairings`, `PATCH /pairings/{id}`, `DELETE /pairings/{id}`, `POST /restaurants/{slug}/pairings/bulk-decision`, `PATCH /wines/{id}`, `POST /restaurants/{slug}/publish`. Pozostałe endpointy to kontrakt docelowy |
| Treści dwujęzyczne | od 2026-10-15 (spec `2026-10-15-bilingual-content`) dania, wina, notatki sommeliera i restauracja mają tłumaczenia PL/EN, ale **`/api/v1` zwraca teksty bazowe, jak dotąd** (bez `translations`, parametr `lang` jest ignorowany); tłumaczenia w API — osobna specyfikacja |
| Import i QR (Faza 5) | `POST /imports/menu` i `POST /imports/wines` (multipart, pole `file`; 201 z podglądem wierszy, kontrolami i notatkami), `GET /imports/{id}`, `PATCH /imports/{id}/rows` (`{rows:[{rowNumber, fields?, include?}]}`), `POST /imports/{id}/confirm` (200 `{created, updated, skipped, suggestions}`, jednorazowo), `DELETE /imports/{id}` (anuluje), `GET /restaurants/{slug}/qr?format=svg\|png&size=&download=1`, publicznie `GET /import-samples/menu\|wines`; restauracja przez `?restaurant={slug}`; wymaga uprawnienia `import.manage` (Sommelier, GM, Owner). Błędy pliku: 422 z kodem (`unsupported_format`, `legacy_xls`, `format_mismatch`, `corrupt_file`, `scanned_pdf`, `file_too_large`, `too_many_rows`, `empty_file`, `no_rows`); zamknięte zadanie: 422 `job_closed`. Typ pliku wykrywany po zawartości |
| Odstępstwa Fazy 4 | restauracja w ścieżce lub w `?restaurant=` to **slug** (nie UUID); `PATCH /pairings/{id}` przyjmuje **jedną** zmianę na żądanie (`status`, `role` albo `comment`) i wymaga `If-Match` (brak → 428, niezgodna wersja → 409); `rank` i `PUT /dishes/{id}/pairings/order`, `/pairings/generate` oraz klucze API nie są jeszcze zaimplementowane; limit prób logowania jest per konto, nie per adres IP |
| Walidacja wejścia | ciało żądania przechodzi przez schemat (`core/validators`), obiekty **ścisłe**: nieznane pole = `422 validation_failed` z `fields: {pole: "unknown_field"}`. Kody w `fields`: `required`, `invalid`, `too_long`, `too_many`, `too_few`, `unknown_field` oraz kod reguły (np. `one_of_status_role_comment`, `at_least_two_distinct`). Niepoprawny JSON: `422 invalid_json`; ciało powyżej 2 MB: `422 payload_too_large`. Każdy błąd ma kształt `{error:{code, message, fields?}}`, a nieoczekiwany błąd serwera to ogólne `500 unexpected` bez szczegółów |
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
| POST | `/restaurants/{id}/publish` | S M | tworzy PublishedVersion |
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
| POST | `/public/events` | P | batch eventów analytics (do 50) |

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
| PUT | `/dishes/{id}/profile` | S | profil; ustawia `source=confirmed`, przelicza `modelScore` i propozycje |
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
  "engineVersion": "wm-rules-1.0.0",
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

`tier`: `sommelier_primary` | `sommelier` | `engine`. Klient pokazuje „Sommelier recommendation” wyłącznie dla dwóch pierwszych.

---

## Wines

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/wines` | S M | nowa pozycja karty; profil z domyślnych szczepu i stylu |
| GET | `/wines/{id}` | S M | wino z profilem |
| PATCH | `/wines/{id}` | S M | ceny, `active`, nota, serwowanie; walidacja: `glassPrice < bottlePrice` |
| PUT | `/wines/{id}/profile` | S | profil wina |
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
  "engineVersion": "wm-rules-1.0.0",
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
| POST | `/imports/sales` | S M | CSV z POS (KPI sprzedażowe) |
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

| Metoda | Ścieżka | Rola | Opis |
|---|---|---|---|
| POST | `/public/events` | P | eventy gościa |
| GET | `/restaurants/{id}/analytics/summary` | S M | KPI za okres `?from=&to=` + porównanie z poprzednim |
| GET | `/restaurants/{id}/analytics/timeseries` | S M | `?metric=sessions,selections&granularity=day` |
| GET | `/restaurants/{id}/analytics/dishes` | S M | najczęściej wyszukiwane dania |
| GET | `/restaurants/{id}/analytics/wines` | S M | `?by=recommended|selected` |
| GET | `/restaurants/{id}/analytics/pairings` | S M | skuteczność par: shown, chosen, conversion, source |
| GET | `/restaurants/{id}/analytics/export` | M | CSV |

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
