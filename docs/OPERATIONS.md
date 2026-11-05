# Eksploatacja: monitoring i runbook (E21 F1)

Wine Match nie używa zewnętrznego SaaS do monitoringu (spec `2026-11-04-platform-quality-and-compliance`, Q1). Operator ma trzy źródła: `GET /api/v1/health` (po wdrożeniu E11), metryki w formacie Prometheus i logi na stdout (JSON, jedna linia na wpis, sekrety zredagowane). Dalsze fazy E21 dopiszą tu kopie i limity żądań.

## Metryki

`GET /api/v1/metrics` z `Authorization: Bearer <METRICS_TOKEN>`. Bez ustawionego `METRICS_TOKEN` endpoint odpowiada 404. Metryki są **per proces**: scraper sumuje repliki. Etykiety to wyłącznie wzorzec trasy, klasa statusu, wynik albo nazwa reguły (nigdy slug, `sid`, id ani IP).

| Metryka | Znaczenie |
|---|---|
| `http_requests_total{group,status_class}` | żądania API według wzorca trasy i klasy statusu |
| `http_request_duration_seconds` | histogram czasu żądań API |
| `guest_code_issue_total{result}` | wydanie kodu polecenia: `issued`, `timeout`, `limit`, `rate_limited`, `error` |
| `usage_event_write_failed_total` | nieudane zapisy zdarzeń użycia (strona gościa działa dalej) |
| `rate_limit_denied_total{rule}` | odmowy limitu żądań (wypełnia faza F3) |
| `db_health_check_duration_seconds` | czas sprawdzenia bazy w health (wypełnia E11) |
| `unhandled_errors_total{source}` | błędy z `onRequestError` (`render`, `route`, `action`, `proxy`) i procesu (`unhandledRejection`, `uncaughtException`) |

## Logi: wymóg dla reverse proxy

Dziennik dostępowy proxy **musi obcinać query string**: `sid=`, `diet=` i `without=` mogą ujawniać dane o zdrowiu (diety, alergeny). To wymóg, nie opcja; dotyczy też alertów z adresem URL. Format JSON, retencja 30 dni. Aplikacja sama loguje żądania API bez query (wiersz `api request`), a strony gościa i panelu tylko proxy.

## Alerty

| Alert | Próg | Działanie |
|---|---|---|
| Aplikacja nie żyje | uptime check na `GET /api/v1/health` nie przechodzi przez 2 kolejne próby (1 min) | sprawdź kontener i logi startu (`checkStartup` kończy proces kodem 1 przy błędnej konfiguracji), połączenie z bazą, ostatnie wdrożenie; w razie wdrożenia wróć do poprzedniego obrazu |
| Wskaźnik 5xx | suma `http_requests_total{status_class="5xx"}` / suma wszystkich > 2% przez 5 minut | przeszukaj logi po `api request failed` i `request error` (digest, trasa), sprawdź bazę i ostatnie wdrożenie |
| Błędy procesu | `increase(unhandled_errors_total{source=~"unhandled.*|uncaught.*"}[10m]) > 0` | proces działa dalej, ale stan jest niepewny: przeczytaj log, zrestartuj repliki po kolei |
| Zapis zdarzeń gościa | `increase(usage_event_write_failed_total[10m]) > 0` | sprawdź bazę i miejsce na dysku; KPI będą niepełne |
| Brak kopii starszej niż 26 h | wymaga F2 (kopie) | po wdrożeniu F2: sprawdź zadanie kopii, miejsce na dysku, dostęp do bazy |

## Objaw, co sprawdzić

| Objaw | Co sprawdzić |
|---|---|
| Wszystkie strony 500 | logi: `request error`, `api request failed`; konfiguracja (`.env`), baza dostępna |
| Metryki zwracają 404 | `METRICS_TOKEN` nie jest ustawiony (zamierzone) |
| Metryki zwracają 401 | zły token w scraperze; token musi mieć min. 32 znaki |
| Brak kodów polecenia na ekranie gościa | `guest_code_issue_total{result="error"}` lub `timeout` rośnie: baza; `limit`: dzienny limit sesji |
| Licznik rośnie po restarcie od zera | normalne: metryki są per proces |

## Kontakt dyżurny

Do uzupełnienia przez operatora przed pierwszym klientem: imię, telefon i kanał zgłoszeń osoby dyżurnej oraz zastępcy. Aplikacja nie przechowuje tych danych.
