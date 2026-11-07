# Eksploatacja: monitoring i runbook (E21 F1)

Wine Match nie używa zewnętrznego SaaS do monitoringu (spec `2026-11-04-platform-quality-and-compliance`, Q1). Operator ma trzy źródła: `GET /api/v1/health`, metryki w formacie Prometheus i logi na stdout (JSON, jedna linia na wpis, sekrety zredagowane). Dalsze fazy E21 dopiszą tu kopie i limity żądań.

## Metryki

`GET /api/v1/metrics` z `Authorization: Bearer <METRICS_TOKEN>`. Bez ustawionego `METRICS_TOKEN` endpoint odpowiada 404. Metryki są **per proces**: scraper sumuje repliki. Etykiety to wyłącznie wzorzec trasy, klasa statusu, wynik albo nazwa reguły (nigdy slug, `sid`, id ani IP).

| Metryka | Znaczenie |
|---|---|
| `http_requests_total{group,status_class}` | żądania API według wzorca trasy i klasy statusu; liczone jest każde żądanie, także odrzucone przed logiką (403 CSRF, 401) i takie, w którym nie udało się otworzyć zakresu żądania (baza nie działa, 5xx). Scrape `/api/v1/metrics` nie jest liczony ani logowany, żeby nie zaniżał wskaźnika 5xx |
| `http_request_duration_seconds` | histogram czasu żądań API |
| `guest_code_issue_total{result}` | wydanie kodu polecenia: `issued`, `declined` (serwis zwrócił brak kodu: dzienny limit sesji, nieznane lub nieaktywne wino, za dużo dań, wyczerpana przestrzeń kodów; serwis nie rozróżnia tych przypadków), `timeout` (przekroczone 1,5 s), `error` (wyjątek, zwykle baza), `rate_limited` (wypełnia F3) |
| `usage_event_write_failed_total` | nieudane zapisy zdarzeń użycia (strona gościa działa dalej) |
| `rate_limit_denied_total{rule}` | odmowy limitu żądań (**brak emitera do czasu fazy F3**: seria jest pusta) |
| `db_health_check_duration_seconds` | czas sprawdzenia bazy przez `GET /api/v1/health` (tylko `DATA_SOURCE=postgres`; w trybie `memory` seria jest pusta). Przy niedostępnej bazie mierzy czas do odpowiedzi „unreachable” (do 2 s) |
| `unhandled_errors_total{source}` | błędy z `onRequestError` (`render`, `route`, `action`, `proxy`) i procesu (`unhandledRejection`, `uncaughtException`) |

## Logi: wymóg dla reverse proxy

Dziennik dostępowy proxy **musi obcinać query string**: `sid=`, `diet=` i `without=` mogą ujawniać dane o zdrowiu (diety, alergeny), a `/admin/accept?token=` niesie jednorazowy token zaproszenia (E12 F2; token jest w query także w adresie linku, ale strona logowania nie powtarza go w `next`). To wymóg, nie opcja; dotyczy też alertów z adresem URL. Format JSON, retencja 30 dni. Aplikacja sama loguje każde żądanie API jako jeden wiersz `api request` (metoda, wzorzec trasy, status, czas; przy nieoczekiwanym błędzie poziom `error` z zredagowanym `err` w tym samym wierszu), bez query, nagłówków i IP; strony gościa i panelu loguje tylko proxy. Endpoint metryk działa bez bazy i nie jest logowany. `GET /api/v1/health` jest logowany i liczony jak każde żądanie API (wzorzec `/api/v1/health`); przy niedostępnej bazie jego 503 wchodzi do wskaźnika 5xx, co jest zamierzone: baza nie działa. Odpowiedź health jest używana ponownie przez 2 s i równoległe żądania dzielą jedno sprawdzenie, więc publiczny adres nie obciąża bazy; uptime checker nie musi wysyłać zapytań częściej niż co 30 s.

## Alerty

| Alert | Próg | Działanie |
|---|---|---|
| Aplikacja nie żyje | uptime check na `GET /api/v1/health` nie przechodzi przez 2 kolejne próby (1 min) | sprawdź kontener i logi startu (`checkStartup` kończy proces kodem 1 przy błędnej konfiguracji), połączenie z bazą, ostatnie wdrożenie; w razie wdrożenia wróć do poprzedniego obrazu |
| Wskaźnik 5xx | suma `http_requests_total{status_class="5xx"}` / suma wszystkich > 2% przez 5 minut | przeszukaj logi po `api request failed` i `request error` (digest, trasa), sprawdź bazę i ostatnie wdrożenie |
| Błędy procesu | `increase(unhandled_errors_total{source=~"unhandled.*|uncaught.*"}[10m]) > 0` | proces działa dalej (handlery tylko logują i liczą), ale po `uncaughtException` stan procesu jest nieokreślony: przeczytaj log i zrestartuj repliki po kolei. `unhandledRejection` nie zabija już procesu (zmiana domyślnego zachowania Node, zamierzona) |
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

## Instancja demo (E22 F2)

Publiczne demo fikcyjnej restauracji Halka to **osobna instancja**, nigdy ta, na której są prawdziwe restauracje (spec `2026-11-04-sales-demo-and-roi-calculator`, Q1, Q2, R1, R9).

- **Zmienne:** `SHOWCASE_MODE=demo`, `DATA_SOURCE=memory`, `ALLOW_DEMO_DATA=true`, własny `PUBLIC_BASE_URL` (https, własna domena), `NODE_ENV=production`. `demo` na `postgres` albo bez `ALLOW_DEMO_DATA=true` kończy start kodem 1 z nazwą zmiennej. Bez `DATABASE_URL`, bez `METRICS_TOKEN` nie jest wymagany.
- **Co robi:** ładuje zestaw Halki bez kont (hasło `demo-halka-2026` nie istnieje), wyłącza logowanie (`/admin/login` pokazuje komunikat, `POST /api/v1/auth/login` odpowiada 403 `showcase_read_only`), nie zapisuje zdarzeń gości, pokazuje pasek „Dane demonstracyjne” na stronach gościa. Strony gościa nadal wydają kody poleceń do pamięci procesu i kelner może je potwierdzić (limit `MAX_MEMORY_RECOMMENDATION_CODES`, znikają z restartem): to jedyny zapis; sesje i zdarzenia użycia gości są wyłączone. Cała instancja (także `/r/*`) ma `<meta robots noindex>`.
- `DEMO_RESTAURANT_SLUG` w trybie `demo` musi być `halka` albo nieustawione (inaczej start kończy się kodem 1).
- Na tej instancji uruchamiaj tylko `smoke --showcase`: pełny smoke loguje się kontem demo i ma tu paść z założenia.
- **Restart** czyści pamięć; instancja nie ma stanu do odtwarzania.
- **Sprawdzenie:** `npm run smoke -- --showcase https://<domena-dema>` (tylko GET). Odsłony: jedna linia logu `showcase_view` z samą nazwą strony (`hub`, `tour`, `roi`, `roi_summary`).
- Obraz i Compose dla instancji demo: do czasu E11 F2–F3 uruchamiaj `next start` z powyższymi zmiennymi za reverse proxy z https.
