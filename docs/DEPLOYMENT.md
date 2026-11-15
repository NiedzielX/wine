# Wdrożenie produkcyjne (E11 F2–F3)

Runbook instalacji, aktualizacji, kopii zapasowych i **wycofania** Wine Match na jednej maszynie (VM w UE, Docker Compose, PostgreSQL 16, TLS na reverse proxy). Specyfikacja: `.ai/specs/2026-10-15-production-deployment.md` (R1, R2, R8, R9, Q2, Q3, Q6, Q10, Q11, Q12). Monitoring i alerty: `docs/OPERATIONS.md`. Model zagrożeń: `docs/security/threat-model.md`. Co robić bez agentów AI: `docs/CONTINUITY.md`.

Wszystkie polecenia są POSIX (`sh`), uruchamiane w katalogu repozytorium na hoście. Każdy krok ma oczekiwany wynik i to, co zrobić, gdy go nie ma.

> **Stan weryfikacji.** Obraz, Compose i job CI `image` zostały napisane i sprawdzone statycznie oraz w części bez Dockera (migracje, `migration:pending`, `db:seed` odmawiający, `restaurant:create`, `next start` z układem plików obrazu, `smoke --production`, `pg_dump`/`pg_restore`). Samo `docker build`, `docker compose` i job `image` **nie były jeszcze uruchomione**: pierwszy przebieg to CI. Dopóki job `image` nie przejdzie na `main`, traktuj ten runbook jako nieprzetestowany na Dockerze i zrób próbę (krok „Próba”) przed pierwszym klientem. Szczegóły: `.ai/runs/2026-11-08-e11-f2-f3-image-and-runbook.md`.

## 1. Co jest potrzebne

| Rzecz | Wymaganie |
|---|---|
| Maszyna | Linux (amd64 albo arm64), min. 2 vCPU, 2 GB RAM, dysk na bazę i kopie |
| Docker | Engine ≥ 24 z wtyczką Compose v2 (`docker compose version`) |
| Domena | publiczna nazwa z certyfikatem TLS **ustalona przed drukiem QR**: adres z QR (`PUBLIC_BASE_URL/r/{slug}`) nie da się poprawić po wydruku |
| Reverse proxy | terminuje TLS, ustawia HSTS, obcina query w logu (sekcja 6); poza tym repozytorium |
| Kod | sklonowane repozytorium na **tagu git wydania** (nie na ruchomej gałęzi) |
| Dostęp do kopii | miejsce poza tą maszyną na zrzuty `pg_dump` (sekcja 9) |

Decyzje, których repozytorium nie podejmuje za właściciela (dostawca hostingu, domena, rejestr obrazów): sekcja 15.

## 2. Instalacja od zera

1. **Maszyna i Docker.** Zainstaluj Docker Engine z oficjalnego repozytorium dystrybucji. Sprawdź: `docker version` i `docker compose version` bez błędu.
2. **Kod.** `git clone <adres repozytorium> wine-match && cd wine-match && git checkout <tag-wydania>`. Zapisz tag: będzie nazwą obrazu i punktem powrotu przy wycofaniu.
3. **Konfiguracja.** `cp .env.example .env && chmod 600 .env`, potem ustaw w `.env` (tabela w sekcji 4): `PUBLIC_BASE_URL` (https, własna domena), `POSTGRES_PASSWORD` (`openssl rand -hex 24`), `DEMO_RESTAURANT_SLUG` (slug restauracji pilotażowej), `METRICS_TOKEN` (`openssl rand -hex 32`), `RATE_LIMIT_SECRET` (`openssl rand -hex 32`, zalecane: klucz liczników limitów żądań), `WINE_MATCH_TAG` (tag z kroku 2). `.env` nigdy nie trafia do repozytorium ani do obrazu (`.dockerignore`, `.gitignore`). **Sprawdź hasło bazy** (trafia do adresu URL, więc znaki specjalne `@ : / ? # % +` psują połączenie; Compose nie umie go zakodować):
   ```sh
   pw="$(sed -n 's/^POSTGRES_PASSWORD=//p' .env | tail -1)"
   printf '%s' "$pw" | grep -Eq '^[A-Za-z0-9]{24,}$' && echo 'POSTGRES_PASSWORD ok' || echo 'POSTGRES_PASSWORD: tylko litery i cyfry, min. 24 znaki (openssl rand -hex 24)'
   unset pw
   ```
   Wynik „ok” jest wymagany przed krokiem 5 (przy pierwszym starcie bazy hasło zapisuje się w wolumenie; zmiana później wymaga `ALTER USER`). Compose czyta `.env` tylko do podstawienia zmiennych i przekazuje do kontenerów **wyłącznie wymienione z nazwy** (`docker-compose.yml`), więc `POSTGRES_PASSWORD` i inne wartości nie wpadają do środowiska aplikacji poza `DATABASE_URL`. Sprawdź, że Compose widzi konfigurację: `docker compose config --quiet` (brak wyniku = poprawnie; brak `PUBLIC_BASE_URL` lub `POSTGRES_PASSWORD` kończy się komunikatem z nazwą zmiennej).
4. **Budowa obrazów.** `docker compose build` (cele `runtime` i `migrator`; nie potrzebują zmiennych środowiska ani bazy). Na hoście arm64 buduj na arm64 (obraz bazowy jest wieloarchitekturowy). Oczekiwane: `docker image ls` pokazuje `wine-match:<tag>` i `wine-match-migrator:<tag>`.
5. **Baza.** `docker compose up -d db`. Oczekiwane: po kilkunastu sekundach `docker compose ps db` pokazuje `healthy`. Baza nie ma opublikowanego portu: jest dostępna tylko w sieci Compose.
6. **Kopia przed migracją** (przy pierwszej instalacji baza jest pusta, ale ćwicz od początku): sekcja 9, polecenie „zrzut”.
7. **Migracje** (jednorazowe zadanie, aplikacja nigdy nie migruje sama): `docker compose run --rm migrate`. Oczekiwane: kod 0 i „Successfully migrated up to the latest version”. Gdy błąd: nic nie zostało zmienione (migracje są w jednej transakcji `allOrNothing`); przeczytaj komunikat, sprawdź `DATABASE_URL` (hasło tylko z liter i cyfr) i dostępność bazy.
8. **Brak zaległych migracji:** `docker compose run --rm migrate npm run migration:pending -w @wine-match/db`. Oczekiwane: „No pending migrations”. Przełączenie ruchu na nową wersję tylko przy takim wyniku.
9. **Aplikacja:** `docker compose up -d app`. Oczekiwane: `docker compose ps app` po ok. 30 s pokazuje `healthy`; `docker compose logs app` zawiera wiersz `server starting` z `publicBaseUrl` równym Twojej domenie. Gdy kontener kończy się kodem 1: konfiguracja jest błędna i log wymienia **każdy** problem (brak `PUBLIC_BASE_URL`, `http://`, adres lokalny); popraw `.env` i `docker compose up -d app`.
10. **Reverse proxy i TLS** (sekcja 6), potem sprawdzenie z zewnątrz: `curl -fsS -H 'X-Wine-Match-Synthetic: 1' https://<domena>/api/v1/health`. Oczekiwane: `{"status":"ok",...}` i kod 200.
11. **Pierwsza restauracja** (sekcja 7), potem weryfikacja (sekcja 8).

## 3. Obrazy i Compose: co jest czym

| Element | Rola |
|---|---|
| `Dockerfile` cel `runtime` | aplikacja (`next start`, port 3000), użytkownik `node`, `NODE_ENV=production`, `HEALTHCHECK` na `/api/v1/health` (żywotność: kontener jest „unhealthy” tylko, gdy proces nie odpowiada; awaria bazy daje 503, więc nie wygląda to na „martwy proces”; sam Docker i tak nie restartuje kontenera za „unhealthy” (`restart:` reaguje na wyjście procesu), robi to dopiero orkiestrator albo dodatek typu autoheal) |
| `Dockerfile` cel `migrator` | polecenia operatora na PostgreSQL: `db:migrate` (domyślne), `migration:pending`, `restaurant:create`, `user:create`, `user:invite`, `db:seed` (odmawia w produkcji bez `ALLOW_DEMO_DATA=true`) |
| `docker-compose.yml` `db`, `migrate`, `app` | profil **produkcyjny** (domyślny): PostgreSQL z wolumenem `pgdata`, jednorazowe `migrate`, `app` czekający na `migrate` (kod 0) i zdrową bazę. Bez danych demo |
| `docker-compose.yml` `app-demo` (profil `demo`) | opcjonalna publiczna instancja pokazowa na pamięci (sekcja 12); nie używa `.env` produkcji |

Obraz bazowy `node:22.22-bookworm-slim` jest przypięty digestem w `Dockerfile` (`ARG NODE_IMAGE`), obraz bazy `postgres:16.14-bookworm` digestem w `docker-compose.yml`. Aktualizacja bazy: nowy tag, nowy digest (`docker buildx imagetools inspect <obraz>:<tag>`), zmiana w jednym PR-ze, przebieg CI. Konfiguracja nigdy nie jest wypalana w obrazie (poza `NODE_ENV=production`); `docker-compose.yml` ustawia na stałe `AUTH_COOKIE_SECURE=true`, `ALLOW_LOCAL_BASE_URL=false`, `ALLOW_DEMO_DATA=false`, żeby skopiowany `.env.example` nie osłabił produkcji.

## 4. Zmienne środowiska

Źródło prawdy: `.env.example` (z komentarzami) i `packages/core/src/config/env.ts`. Konfiguracja jest **zamykająca**: błędna lub brakująca wartość zatrzymuje start kodem 1 z listą problemów. Wartości w `.env`, nie w obrazie, nie w argumentach polecenia, nie w repozytorium.

**Wymagane (bez nich stos się nie uruchomi)**

| Zmienna | Wartość w produkcji | Uwagi |
|---|---|---|
| `PUBLIC_BASE_URL` | `https://<domena>` | publiczny adres https; start kończy się kodem 1 dla `http://`, adresu IP, nazwy jednoczłonowej (`localhost`, `app`) i końcówek `.local`, `.localhost`, `.internal`, `.lan`, `.home.arpa` (i `.invalid`, `.localdomain`, `.intranet`, `.corp`); wydrukowanego QR nie da się poprawić |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` | tylko litery i cyfry (trafia do adresu URL); sekret, tylko w `.env` (`chmod 600`) |
| `DATA_SOURCE` | `postgres` (ustawia Compose) | brak lub literówka zatrzymuje start (inaczej dane demo z publicznym hasłem) |
| `DATABASE_URL` | budowany przez Compose z `POSTGRES_*` | sekret; logi go redagują |
| `NODE_ENV` | `production` (w obrazie) | |

**Niebezpieczne (nie ustawiaj w produkcji; Compose wymusza bezpieczną wartość)**

| Zmienna | Skutek ustawienia | Zasada |
|---|---|---|
| `ALLOW_DEMO_DATA=true` | pozwala na dane demo i konta z **publicznym** hasłem, odblokowuje `db:seed` | tylko instancja próbna i demo |
| `ALLOW_LOCAL_BASE_URL=true` | wyłącza kontrolę adresu QR (start tylko z ostrzeżeniem) | tylko lokalny start, CI, testy |
| `AUTH_COOKIE_SECURE=false` | ciasteczko sesji bez flagi `Secure` | tylko lokalnie po http; nigdy na publicznym serwerze (nie zwalnia z reguły adresu) |
| `DATA_SOURCE=memory` | dane demo w pamięci procesu | tylko demo, z `ALLOW_DEMO_DATA=true` |
| `SHOWCASE_MODE` (`calculator`, `demo`) | publiczne strony sprzedażowe `/demo` | `demo` tylko na osobnej instancji (sekcja 12); inna wartość zatrzymuje start |

**Opcjonalne**

| Zmienna | Domyślnie | Uwagi |
|---|---|---|
| `DEMO_RESTAURANT_SLUG` | `halka` | dokąd prowadzi adres `/`; ustaw na slug pilota, inaczej `/` kończy się 404 (`smoke --production` to wykrywa) |
| `METRICS_TOKEN` | brak (endpoint metryk odpowiada 404) | min. 32 znaki, `openssl rand -hex 32`; nie używaj ponownie innego sekretu |
| `TRUSTED_PROXY_HOPS` | `0` w aplikacji; **`1` w `docker-compose.yml`** (aplikacja słucha tylko na `127.0.0.1`, przed nią jest proxy z sekcji 6) | ile zaufanych reverse proxy dopisuje adres do `X-Forwarded-For` (0–10). Ustaw dokładnie tyle, ile proxy stoi przed aplikacją (CDN przed nginx = 2). **Wdrożenie bez Compose MUSI je ustawić.** Dwa błędy konfiguracji i ich skutki: (1) **za duża wartość albo port aplikacji osiągalny bez proxy**: klient, który wysyła losowy `X-Forwarded-For` przy każdym żądaniu, dostaje za każdym razem nowy licznik, więc limity nie działają, a tabela liczników rośnie do sufitu `RATE_LIMIT_MAX_CLIENTS` (potem tryb awaryjny, niżej); `1` jest bezpieczne **tylko**, gdy proxy jest jedynym, kto pisze ten nagłówek (nginx `$proxy_add_x_forwarded_for` albo Caddy) i portu aplikacji nie da się osiągnąć z zewnątrz; (2) **`0` za proxy**: nagłówek nie jest czytany, więc **wszyscy klienci dzielą jeden licznik z limitem o połowę niższym**: jeden anonimowy klient może na całe okno zablokować logowanie, kody i publiczne API **wszystkim** (globalna dźwignia DoS); start w produkcji to ostrzega. Sprawdzenie po wdrożeniu: sekcja 8, wiersz „Limity żądań” |
| `RATE_LIMIT_SECRET` | losowy na proces (start w produkcji ostrzega) | min. 32 znaki, `openssl rand -hex 32`; klucz skrótu HMAC klienta (adres IP nigdy nie trafia do bazy ani logów, klucz zmienia się co dobę UTC). Bez niego liczniki zaczynają od zera po restarcie, a **każda instancja liczy osobno: efektywny limit = limit × liczba instancji** (dwie repliki = dwa razy więcej prób logowania). Ustaw go przed drugą instancją. Nie używaj ponownie innego sekretu |
| `RATE_LIMITS` | domyślne z `packages/core/src/ratelimit/rules.ts` | nadpisanie limitów: `reguła=limit/oknoSekund` po przecinku, np. `login=10/600,public-api=240/60`; reguły: `public-api` (120/60), `login` (20/600), `code-issue` (60/600), `code-lookup` (60/600), `code-mark` (30/600), `pin-login` (60/600, jeszcze bez użycia). Literówka zatrzymuje start. Kalibracja po tygodniu pilota na `rate_limit_denied_total{rule}` (`docs/OPERATIONS.md`) |
| `RATE_LIMIT_MAX_CLIENTS` | `10000` | sufit liczby różnych klientów z własnym licznikiem na regułę i okno (1–9 999 999). Po jego przekroczeniu **każdy nowy** klient tej reguły liczy się do jednego wspólnego licznika z tym samym limitem (tryb awaryjny: ochrona tabeli przed zalewem adresów, np. wielu sieci IPv6 /64; znani klienci zachowują swoje liczniki). Log `rate limit client ceiling reached` najwyżej raz na minutę. Tabela trzyma najwyżej ok. `(sufit + 2) × reguły × 2 okna` wierszy |
| (zegar) | NTP na każdej maszynie z instancją | kilka instancji na jednej bazie: okno liczy się z zegara instancji, a sprzątanie usuwa wiersze okien, które według jej zegara już się skończyły. Instancja, która spieszy się o mniej więcej okno, usunie liczniki, którymi inna jeszcze liczy (limity łagodniejsze, nigdy ostrzejsze): **trzymaj zegary zsynchronizowane (NTP, `timedatectl status`)** |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_DEBUG` | 2, 10, `false` | pula połączeń na instancję |
| `POSTGRES_USER`, `POSTGRES_DB` | `winematch` | |
| `APP_PORT` | `3000` | port na `127.0.0.1` hosta, dla reverse proxy |
| `WINE_MATCH_TAG` | `local` | tag obrazów; używaj tagu git wydania (wycofanie, sekcja 10) |
| `DEMO_PUBLIC_BASE_URL`, `DEMO_PORT` | brak, `3001` | tylko profil `demo` |

## 5. Migracje

- **Osobny krok** (`migrate`) przed startem nowej wersji; aplikacja nigdy nie migruje (zła migracja w starcie dałaby pętlę restartów). `docker compose up -d app` uruchamia `migrate` jako zależność i startuje `app` tylko przy kodzie 0, ale **zalecana kolejność ręczna** to kroki 6–9 z sekcji 2 (kopia, `migrate`, `migration:pending`, `app`).
- Migracje są transakcyjne i `allOrNothing`: przy błędzie schemat zostaje bez zmian, stara wersja działa dalej.
- Obraz `migrator` zapisuje `.snapshot-<baza>.json` obok migracji (CLI MikroORM), dlatego katalog `packages/` w tym obrazie należy do użytkownika `node`; to normalne i nie trafia do repozytorium.
- **`migration:down` jest zabronione na produkcji** (sekcja 10, powód tam). Wolno je ćwiczyć wyłącznie na instancji próbnej.
- Wydanie z migracją typu *contract* (usuwa lub zmienia kolumnę, BACKWARD_COMPATIBILITY §3) unieważnia powrót do poprzedniego obrazu; takie wydanie zapowiada to w notach i wymaga zrzutu przed migracją.

## 6. Reverse proxy (TLS, HSTS, logi)

Proxy działa na hoście i przekazuje ruch na `127.0.0.1:${APP_PORT:-3000}`. Wymagania **nie są opcjonalne** (`docs/OPERATIONS.md`, `docs/security/threat-model.md`, TB2 i decyzja **D1**: HSTS i TLS należą do proxy, nie do aplikacji):

| Ustawienie | Wartość | Dlaczego |
|---|---|---|
| TLS | certyfikat dla domeny z `PUBLIC_BASE_URL`, tylko TLS 1.2+, przekierowanie 80 → 443 | ciasteczko sesji jest `Secure` |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains` (zacznij od `max-age=300`, podnieś po potwierdzeniu, że wszystkie podstrony działają po https; `preload` tylko świadomie) | D1: aplikacja go nie ustawia |
| Log dostępu **bez query string** | loguj ścieżkę (`$uri`), nie pełne żądanie (`$request`); format JSON, retencja 30 dni | `sid=`, `diet=`, `without=` ujawniają dane o zdrowiu, `/admin/accept?token=` niesie jednorazowy token zaproszenia |
| Limit rozmiaru ciała | min. **12 MB** na `/admin/` (akcje serwerowe: plik 10 MB plus pola, aplikacja ma limit 11 MB) | mniejszy limit psuje import menu |
| Metody | przepuszczaj tylko `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`; **blokuj `TRACE`** (i `TRACK`, `CONNECT`) | TRACE odbija nagłówki, w tym ciasteczka |
| Nagłówki | `Host`, `X-Forwarded-For` **dopisany przez proxy** (nginx: `$proxy_add_x_forwarded_for`; Caddy domyślnie zastępuje nagłówek adresem klienta), `X-Forwarded-Proto: https`, `X-Forwarded-Host` | strony rozpoznają adres z nagłówków; limity żądań liczą klienta po ostatnim adresie z `X-Forwarded-For` (`TRUSTED_PROXY_HOPS=1`, ustawione w Compose) |
| Cache | nie buforuj `/admin/*`, `/api/*`, `/demo/*` | aplikacja wysyła `no-store`, proxy nie powinien go nadpisywać |
| Metryki | nie wystawiaj `/api/v1/metrics` publicznie, jeśli scraper jest lokalny (token jest jedyną ochroną) | |
| Limit żądań per IP | **dwie warstwy** (spec E21 Q5). Uwaga: cała restauracja za jednym NAT-em (Wi-Fi sali) to dla obu warstw jeden adres: kalibruj na `rate_limit_denied_total{rule}` (`docs/OPERATIONS.md`). Aplikacja (od E21 F3) liczy reguły znające semantykę: logowanie, publiczne API, wydanie, wyszukanie i oznaczenie kodu polecenia, wspólnie dla wszystkich instancji przez PostgreSQL (`TRUSTED_PROXY_HOPS`, `RATE_LIMIT_SECRET`, `RATE_LIMITS` w sekcji 4). Proxy trzyma tylko **ogólny** limit na IP przeciw zalewowi (przykład niżej: 20 req/s, burst 40), bez osobnych reguł dla `/api/v1/auth/` i `/api/v1/public/`. Proxy musi być jedynym źródłem `X-Forwarded-For`: aplikacja słucha tylko na `127.0.0.1` | decyzja D4 |

Przykład dla nginx (nie uruchomiony w tym repozytorium: sprawdź `nginx -t` na hoście; dopasuj domenę i ścieżki certyfikatów):

```nginx
limit_req_zone $binary_remote_addr zone=wm_per_ip:10m rate=20r/s;   # w bloku http
limit_req_status 429;   # domyślnie nginx odpowiada 503, co wygląda na awarię aplikacji

log_format wm escape=json '{"time":"$time_iso8601","method":"$request_method","path":"$uri","status":$status,"bytes":$body_bytes_sent,"rt":$request_time}';

server {
  listen 80;
  server_name wine.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  http2 on;
  server_name wine.example.com;
  ssl_certificate     /etc/letsencrypt/live/wine.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/wine.example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  access_log /var/log/nginx/wine-match.access.log wm;   # ścieżka bez query string
  add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;   # po sprawdzeniu: 31536000
  client_max_body_size 12m;

  if ($request_method !~ ^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$) { return 405; }   # blokuje TRACE
  limit_req zone=wm_per_ip burst=40 nodelay;   # ogólny limit na IP (strefa `limit_req_zone` wyżej, w bloku http); reguły per trasa liczy aplikacja.
                                               # Restauracja za jednym NAT-em ładuje strony z wieloma zasobami: przy 429 na /_next/ podnieś burst (np. 100)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
    proxy_read_timeout 60s;
  }
}
```

Dla Caddy odpowiednikiem jest domyślne TLS, `header Strict-Transport-Security …`, `request_body { max_size 12MB }` i filtr logu usuwający `request>uri` query; zweryfikuj konfigurację na hoście.

**Sprawdzenie proxy** (z zewnątrz, po konfiguracji): `curl -sI https://<domena>/ | grep -i strict-transport-security` (jest), `curl -s -X TRACE -o /dev/null -w '%{http_code}\n' https://<domena>/` (405 lub 4xx, nie 200), `curl -sI http://<domena>/` (301 na https), po żądaniu `…/r/<slug>?diet=test` w logu dostępu nie ma `diet=`.

## 7. Pierwsza restauracja

Bez danych demo, jedna transakcja zakłada restaurację (`status: onboarding`) i konto właściciela (`owner`). Slug trafia na wydrukowane QR i nie jest normalizowany: tylko małe litery, cyfry i pojedyncze myślniki, 2–40 znaków. Pełny opis i cofnięcie pomyłki: README, sekcja „Nowa restauracja i jej właściciel”.

Hasło **nigdy w argumentach ani w historii powłoki**: wczytaj bez echa i przekaż samą nazwą zmiennej (`-e USER_PASSWORD` bez wartości dziedziczy zmienną; do listy procesów trafia tylko nazwa):

```sh
stty -echo; printf 'Hasło właściciela (min. 12 znaków): '; read -r USER_PASSWORD; stty echo; echo
export USER_PASSWORD
docker compose run --rm -e USER_PASSWORD migrate npm run restaurant:create -- \
  --name "Bistro Nad Wisłą" --slug bistro-nad-wisla --address "ul. Wiślna 1" --city Kraków \
  --wine-director "Anna Nowak" --owner-email anna@example.com --owner-name "Anna Nowak"
unset USER_PASSWORD
```

Oczekiwane: „Created restaurant … Created account … as owner”. Gdy błąd (zajęty slug, e-mail, zbyt krótkie hasło): kod 1 i nic nie zostało zapisane.

- **Dalsi członkowie zespołu:** właściciel zaprasza w panelu (A15). Polecenia `user:invite` i `db:seed` mają strażnika środowiska i na produkcji odmawiają (bez `ALLOW_DEMO_DATA=true`): to narzędzia instancji próbnej. `user:create` zakłada konto z rolą i nie jest zalecane na produkcji (panel i zaproszenia są kanałem docelowym).
- **Przekazanie hasła właścicielowi:** jednorazowym kanałem poza systemem, razem z adresem `https://<domena>/admin/<slug>` (README). Przed drugim lokalem potrzebna jest zmiana hasła przez właściciela.
- **Przed pierwszym prawdziwym najemcą** wykonaj listę z `docs/OPERATIONS.md` („Przed włączeniem pierwszego prawdziwego najemcy”): limit żądań per IP, TLS i HSTS, query w logu, kopia z przećwiczonym odtworzeniem.

## 8. Weryfikacja po wdrożeniu

Wszystkie żądania ruchu własnego niosą `X-Wine-Match-Synthetic: 1` (nie zawyżają analityki pilota).

| Krok | Polecenie | Oczekiwane | Gdy brak |
|---|---|---|---|
| Zdrowie | `curl -fsS -H 'X-Wine-Match-Synthetic: 1' https://<domena>/api/v1/health` | 200, `"status":"ok"` | 503: baza nieosiągalna (`docker compose ps db`, logi); brak odpowiedzi: proxy lub kontener |
| Smoke produkcyjny | `npm run smoke -- --production https://<domena> <slug>` (Node ≥ 22 na dowolnej maszynie z repozytorium, nie wymaga instalacji zależności; po stronie serwera `DEMO_RESTAURANT_SLUG` musi być równe `<slug>`) | „All production smoke checks passed”; wyłącznie GET, bez logowania | brak „/ ends on the restaurant page”: `DEMO_RESTAURANT_SLUG` w `.env` ≠ slug; 401/200 inne: czytaj nazwę nieudanego sprawdzenia |
| Adres QR | zaloguj się jako właściciel, otwórz `/admin/<slug>/qr` | strona pokazuje `https://<domena>/r/<slug>` | inny adres: `PUBLIC_BASE_URL` w `.env` i `docker compose up -d app`; **nie drukuj** do czasu poprawki |
| Nagłówki | `curl -sI https://<domena>/ \| grep -i 'strict-transport\|x-frame\|x-content-type'` | HSTS z proxy, `X-Frame-Options: DENY`, `nosniff` | brak HSTS: proxy (sekcja 6) |
| Metryki | `curl -s -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:3000/api/v1/metrics \| head` | wiersze `http_requests_total` | 404: brak `METRICS_TOKEN` (zamierzone); 401: zły token |
| Limity żądań | z maszyny **spoza** hosta: `curl -s -m 3 -o /dev/null -w '%{http_code}\n' http://<adres-hosta>:3000/api/v1/health` (port aplikacji nieosiągalny: błąd połączenia, nie 200); potem `for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'content-type: application/json' -H "X-Forwarded-For: 10.$((i % 250)).0.1" -d '{}' https://<domena>/api/v1/auth/login; done; echo` | pierwsze 20 odpowiedzi 422, potem 429 (losowy `X-Forwarded-For` nie daje nowego licznika: liczy się adres dopisany przez proxy) | same 422: `TRUSTED_PROXY_HOPS` za duże albo proxy przepuszcza nagłówek klienta; port osiągalny: firewall hosta (sekcja 6). Uwaga: to zużywa limit logowania Twojego adresu na 10 minut |
| Kontener | `docker compose ps` | `app` `healthy`, `migrate` zakończony (Exited 0), `db` `healthy` | `docker compose logs app` |

Pełny smoke (`npm run smoke -- <url> halka`) loguje się kontem demo i zmienia dane: **wyłącznie instancja próbna**, nigdy produkcja.

## 9. Kopie zapasowe i odtworzenie

Zrzut zawiera dane osobowe (konta, skróty sesji, zdarzenia): przechowuj go zaszyfrowany i poza tą maszyną, dostęp tylko dla właściciela. Polityka retencji i miejsce przechowywania (dostawca, zaszyfrowany bucket, drugi host) to decyzja właściciela (sekcja 15). Automatyczne kopie i alert „brak kopii starszej niż 26 h” to E21 F2; do tego czasu kopie są ręczne lub z crona hosta.

**Zrzut** (format własny `pg_dump`, `-Fc`, odtwarzalny selektywnie; zmienne bierze z kontenera `db`):

```sh
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/wine-match-$(date +%Y%m%d-%H%M%S).dump"
ls -l backups | tail -1
```

Oczekiwane: niepusty plik (kilkadziesiąt KB już na pustej bazie). Sprawdź czytelność: `docker compose exec -T db pg_restore -l < backups/<plik>.dump | head` pokazuje spis obiektów. Zrzut **przed każdą migracją** i przed każdym wycofaniem. Cron hosta (przykład, codziennie 02:30; dopisz kopiowanie poza maszynę i usuwanie starych):

```sh
30 2 * * * cd /opt/wine-match && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > backups/wine-match-$(date +\%Y\%m\%d).dump
```

**Odtworzenie na produkcji** (po awarii bazy lub błędnej migracji; zatrzymuje ruch, **kasuje bieżące dane** i zastępuje je zrzutem, więc decyduje właściciel, sekcja 10):

```sh
docker compose stop app
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < backups/<plik>.dump
docker compose run --rm migrate npm run migration:pending -w @wine-match/db    # co zostało do zastosowania względem tego zrzutu
```

Dalej: uruchom wersję aplikacji **zgodną ze schematem zrzutu** (sekcja 10), zastosuj brakujące migracje tylko jeśli ta wersja ich wymaga, `docker compose up -d app`, weryfikacja z sekcji 8.

**Próba odtworzenia (zrób przed pierwszym klientem, potem co kwartał i po każdej zmianie wersji PostgreSQL)** na osobnej bazie obok produkcji, bez zatrzymywania ruchu:

```sh
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" winematch_drill'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d winematch_drill --no-owner --exit-on-error' < backups/<plik>.dump
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d winematch_drill -tAc "select count(*) from restaurant"'
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d winematch_drill -tAc "select count(*) from app_user"'
# schemat zgodny z kodem? (to samo DATABASE_URL, tylko z nazwą bazy próbnej; hasło zostaje w kontenerze)
docker compose run --rm migrate sh -c 'DATABASE_URL="$(printf %s "$DATABASE_URL" | sed "s#/[^/]*\$#/winematch_drill#")" npm run migration:pending -w @wine-match/db'
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" winematch_drill'
```

Oczekiwane: odtworzenie bez błędu, liczby zgodne z produkcją z chwili zrzutu, „No pending migrations” dla zrzutu z bieżącej wersji. Zapisz datę próby i wynik w dzienniku właściciela. Pełna próba end-to-end na czystej VM (instalacja z sekcji 2, dane próbne, smoke): sekcja 13.

## 10. ROLLBACK (wycofanie)

### 10.1 Zasady

1. **Poprawka w przód jest domyślnym wyborem**, o ile da się ją wdrożyć w czasie, który właściciel uzna za dopuszczalny: nowy tag z poprawką, ten sam przebieg (kopia, migracja, weryfikacja). Wycofanie to wyjątek.
2. **Nie ruszaj schematu.** Poprzedni obraz aplikacji działa na nowszym schemacie, dopóki wydanie nie zawierało migracji *contract* (usunięcie lub zmiana kolumny, tabeli, typu): migracje *expand* (nowa kolumna lub tabela) są addytywne i stara wersja ich nie widzi.
3. **`migration:down` jest ZABRONIONE na produkcji.** Powód: `down` może usuwać dane bez śladu (np. E03 usuwa tabelę `sales_record`, E12 F1 kolumny `membership.status`/`version`; spec Q11), jest trudny do przećwiczenia na prawdziwych danych, a nie ma w nim odtworzenia usuniętych wierszy. Dane przywraca się wyłącznie ze zrzutu. `down` wolno uruchamiać tylko na instancji próbnej (sekcja 13).
4. **Przed każdym wycofaniem zrzut bieżącej bazy** (sekcja 9): wycofanie nie może pogorszyć sytuacji.
5. Kolejne wydania zachowują poprzedni obraz: nie usuwaj starych obrazów (`docker image ls`, `docker image prune` bez `-a`), a tagów git nie przesuwaj.

### 10.2 Drzewo decyzyjne

```
Po wdrożeniu nowej wersji weryfikacja (sekcja 8) nie przechodzi albo objawy z OPERATIONS.md
│
├─ Czy błąd jest drobny, znany i poprawka jest gotowa?            → TAK: poprawka w przód (nowy tag, sekcja 11)
│
├─ Czy `migrate` nowej wersji zakończył się błędem?
│     → TAK: schemat bez zmian (transakcja). Zostaw poprzedni obraz `app` działający,
│            nie startuj nowego. Napraw migrację w przód.                 [wycofanie nie jest potrzebne]
│
├─ Czy `migrate` zastosował migracje, a wydanie NIE miało migracji contract
│  (sprawdź noty wydania i listę migracji z `git diff <stary-tag> <nowy-tag> --stat -- packages/db/src/migrations`)?
│     → TAK: WYCOFANIE OBRAZU (10.3, ścieżka A). Schemat zostaje.
│
├─ Czy wydanie miało migrację contract albo dane są uszkodzone / błędnie zmienione?
│     → TAK: ODTWORZENIE ZE ZRZUTU (10.3, ścieżka B). Tracisz dane zapisane po zrzucie.
│
└─ Nie wiadomo: zrób zrzut, przełącz proxy na stronę serwisową (opcjonalnie), a decyzję podejmij wg powyższego.
```

### 10.3 Kroki

**Ścieżka A: poprzedni obraz, schemat bez zmian**

```sh
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/before-rollback-$(date +%Y%m%d-%H%M%S).dump"
# w .env ustaw WINE_MATCH_TAG na poprzedni tag (np. v0.2.0), potem:
docker image inspect "wine-match:${WINE_MATCH_TAG}" > /dev/null    # obraz musi już istnieć na hoście
docker compose up -d --no-deps app
```

`--no-deps` pomija `migrate`: poprzedni obraz nie migruje i nie dotyka schematu. Obraz `migrator` ze starego tagu **nie** uruchamiaj (mógłby próbować stosować własną, starszą listę migracji; zbędne ryzyko).

**Uwaga: katalog roboczy zostaje na NOWYM tagu.** Po wycofaniu `WINE_MATCH_TAG` wskazuje stary tag, a repozytorium na hoście nadal jest na nowym. Dlatego **nie uruchamiaj** `docker compose build`, `up --build` ani `run --build`, dopóki oba się nie zgadzają: zbudowałyby nowy kod pod nazwą starego tagu (po cichu „stary” obraz byłby nowy). Gdy starego obrazu nie ma na hoście (został usunięty), zbuduj go z **osobnego, czystego checkoutu starego tagu**:

```sh
git worktree add ../wine-match-<stary-tag> <stary-tag>      # osobny katalog, bieżący checkout nietknięty
cp .env ../wine-match-<stary-tag>/.env && cd ../wine-match-<stary-tag>
WINE_MATCH_TAG=<stary-tag> docker compose build app
cd - && git worktree remove ../wine-match-<stary-tag> --force   # nie zostawiaj .env w osobnym katalogu
```

Potem wróć do `docker compose up -d --no-deps app` z `WINE_MATCH_TAG=<stary-tag>`. Po ustabilizowaniu wydania ustaw checkout i `WINE_MATCH_TAG` na ten sam tag (poprawka w przód, sekcja 11), żeby następne `build` było poprawne.

**Ścieżka B: odtworzenie `pg_dump` sprzed migracji**

1. `docker compose stop app` (koniec ruchu; proxy może pokazać stronę serwisową).
2. Zrzut bieżącej bazy (jak wyżej, „before-rollback”), by móc później odzyskać dane zapisane po zrzucie wydania.
3. Odtworzenie zrzutu sprzed wydania (sekcja 9, „Odtworzenie na produkcji”).
4. W `.env` ustaw `WINE_MATCH_TAG` na tag **zgodny z tym schematem** (poprzednie wydanie); `docker compose up -d --no-deps app`.
5. Dane zapisane między zrzutem a wycofaniem są w zrzucie „before-rollback”: odzyskaj je ręcznie (zapytania do tego pliku odtworzonego w bazie próbnej) i ustal z właścicielem restauracji, co zostało utracone.

**Adnotacje wydań (spec E11, „Adnotacje do runbooku”)**

- **Po E12 F1 (`membership.status`):** stary kod ignoruje `membership.status`, więc po cofnięciu obrazu do kodu sprzed F1 (gdy migracja F1 zostaje zastosowana) zdezaktywowani użytkownicy **odzyskują dostęp**. Poprzedni obraz wolno przywrócić tylko razem z ręczną dezaktywacją tych użytkowników: przed cofnięciem (po zrzucie) usuń członkostwa zdezaktywowanych (stary kod rozpoznaje tylko ich istnienie):
  ```sql
  BEGIN;
  DELETE FROM session WHERE user_id IN (SELECT user_id FROM membership WHERE status = 'deactivated');
  DELETE FROM membership WHERE status = 'deactivated';
  COMMIT;
  ```
  (dostęp wraca wyłącznie przez nowe zaproszenie po przywróceniu nowego kodu; wykonaj w `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`). Dezaktywacja działa w czasie żądania (sesja zostaje w bazie), a reaktywacja z założenia ożywia stare sesje osoby; jeśli ma wymagać nowego logowania, usuń jej sesje.
- **Po E14 F1 (`restaurant.status`):** stary kod ignoruje `restaurant.status`, więc zawieszone restauracje znów działają: ta sama zasada, przed cofnięciem zdecyduj z właścicielem, które restauracje mają pozostać niedostępne (np. usuń ich członkostwa albo zostaw aplikację wyłączoną dla nich na proxy).
- **Przed migracją E14 F1:** polecenie `restaurants:check-reserved` (gdy E14 F1 je doda) sprawdza, czy żaden istniejący slug nie koliduje ze slugami zarezerwowanymi (`platform`, `org`, `accept`, `reset`, `account`); uruchom je przed migracją.

### 10.4 Weryfikacja po wycofaniu

1. `docker compose ps`: `app` `healthy`; `docker compose logs --tail 50 app` bez `error` i bez wiersza kończącego proces.
2. Zdrowie: `curl -fsS -H 'X-Wine-Match-Synthetic: 1' https://<domena>/api/v1/health` → 200.
3. `npm run smoke -- --production https://<domena> <slug>` → „All production smoke checks passed” (wyłącznie GET).
4. Ręcznie: logowanie właściciela, strona `/r/<slug>` pokazuje menu, adres w `/admin/<slug>/qr` bez zmian.
5. Po ścieżce A (opcjonalnie): sprawdź schemat obrazem **nowego** tagu, jawnie nadpisując tag tylko dla tego jednego polecenia (inaczej `migrate` użyje `wine-match-migrator:${WINE_MATCH_TAG}`, czyli starego obrazu): `WINE_MATCH_TAG=<nowy-tag> docker compose run --rm --no-deps migrate npm run migration:pending -w @wine-match/db` pokazuje „No pending migrations” (schemat jest kompletny, nic się nie cofnęło); obraz musi już istnieć (to ten sam, który wdrożono; polecenie niczego nie buduje). Po ścieżce B domyślne polecenie (stary tag) pokazuje „No pending migrations”; to samo z nowym tagiem pokazałoby migracje wydania, które wycofano (zrzut jest sprzed nich): nie stosuj ich bez decyzji właściciela.
6. Obserwuj `http_requests_total{status_class="5xx"}` i logi przez co najmniej godzinę.
7. Zapisz zdarzenie: czas, wersja przed i po, powód, ścieżka (A lub B), czy dane zostały utracone; poprawkę w przód zaplanuj jako zwykły PR.

### 10.5 Kto decyduje

- **Właściciel (Filip) decyduje o ścieżce B** (odtworzenie zrzutu, utrata danych) i o każdym wycofaniu, które cofa decyzję produktową (np. dostęp użytkowników po E12 F1). Bez jego odpowiedzi ścieżka B nie jest wykonywana.
- **Operator na dyżurze** (kontakt: `docs/OPERATIONS.md`, „Kontakt dyżurny”) może samodzielnie wykonać **ścieżkę A**, jeśli aplikacja nie działa, a wydanie nie miało migracji contract, i **musi zgłosić to właścicielowi** natychmiast po przywróceniu usługi.
- Agent AI nie wycofuje produkcji: może przygotować polecenia i sprawdzenia, wykonuje człowiek.

## 11. Aktualizacja do nowej wersji

1. `git fetch --tags && git checkout <nowy-tag>`; przeczytaj noty wydania (GitHub Release, `UPGRADE_NOTES.md` dla tej wersji; jak powstają: `docs/RELEASING.md`) i listę migracji (`git diff <stary-tag> <nowy-tag> --stat -- packages/db/src/migrations`); migracja *contract* oznacza, że powrót do starego obrazu nie będzie możliwy (sekcja 10).
2. W `.env` ustaw `WINE_MATCH_TAG=<nowy-tag>`; `docker compose build`.
3. Zrzut (sekcja 9).
4. `docker compose run --rm migrate` → oczekiwane kod 0. Przy błędzie: schemat bez zmian, stara wersja działa, napraw w przód.
5. `docker compose run --rm migrate npm run migration:pending -w @wine-match/db` → „No pending migrations”.
6. `docker compose up -d --no-deps app`.
7. Weryfikacja (sekcja 8). Przy niepowodzeniu: drzewo decyzyjne z sekcji 10.2.

## 12. Instancja demo (opcjonalnie)

Publiczne demo fikcyjnej restauracji Halka to **osobna instancja**, nigdy ta sama co prawdziwe restauracje (`docs/OPERATIONS.md`, „Instancja demo”). Na osobnym hoście albo osobnym projekcie Compose, z własną domeną:

```sh
# na hoście demo, w katalogu repozytorium, plik .env (bez sekretów; Compose wymaga tych zmiennych do wczytania pliku, choć demo używa tylko pierwszej):
#   DEMO_PUBLIC_BASE_URL=https://demo.example.com
#   PUBLIC_BASE_URL=https://demo.example.com
#   POSTGRES_PASSWORD=nieuzywane-przez-demo
docker compose --profile demo up -d app-demo
npm run smoke -- --showcase https://demo.example.com
```

Startuj **tylko** usługę `app-demo` (jak wyżej, z jej nazwą), nigdy cały stos: `db` i `migrate` nie mają tam nic do roboty. `app-demo` nie czyta `.env` produkcji (brak `DATABASE_URL`, `METRICS_TOKEN`), działa na `SHOWCASE_MODE=demo`, `DATA_SOURCE=memory`, `ALLOW_DEMO_DATA=true`, jest tylko do odczytu, nie zapisuje zdarzeń gości i ma `noindex`. Restart czyści pamięć. Na tej instancji uruchamiaj wyłącznie `smoke --showcase`.

## 13. Próba (instancja próbna) i `migration:down`

Przed pierwszym klientem i przed każdą większą zmianą procesu: czysta VM lub osobny projekt Compose (`docker compose -p wine-trial …`), osobna baza.

1. Instalacja z sekcji 2 (kroki 1–9) na adresie próbnym z prawdziwym https (adres lokalny wymagałby `ALLOW_LOCAL_BASE_URL=true`, którego Compose nie przyjmuje: próba ma sprawdzać właśnie konfigurację produkcyjną).
2. Dane demo: `docker compose run --rm -e ALLOW_DEMO_DATA=true migrate npm run db:seed` (odmawia na bazie z prawdziwą restauracją).
3. Pełny smoke: `npm run smoke -- https://<adres-próbny> halka` (zmienia dane: tylko tu).
4. Przećwicz: zrzut i odtworzenie (sekcja 9), wycofanie obrazu (ścieżka A), a **tylko tu** `docker compose run --rm migrate npm run migration:down -w @wine-match/db` i ponowne `migrate`.
5. Usuń instancję i bazę próbną: `docker compose -p wine-trial down -v`.

Dowody próby (czas, wersja, wyniki kroków) zapisz w dzienniku przebiegu `.ai/runs/` albo w dzienniku właściciela.

## 14. CI: job `image`

Job `image` w `.github/workflows/ci.yml` buduje oba cele i sprawdza: lint `Dockerfile` (hadolint), AC6 (brak `.env`, użytkownik ≠ root, brak wypalonej konfiguracji, healthcheck), AC2 (kod 1 bez `DATA_SOURCE`, na `memory` bez `ALLOW_DEMO_DATA`, bez lub z `http://` `PUBLIC_BASE_URL`), AC8 (`db:seed` w obrazie `migrator` odmawia i nic nie zapisuje, także z `ALLOW_DEMO_DATA=true` na bazie z restauracją), AC7 (baza A: `migrate` → `migration:pending` pusty → `restaurant:create` → aplikacja z `https://wine.example.test` **bez** `ALLOW_LOCAL_BASE_URL` → `smoke --production`), AC1 i AC3 (baza B: `db:seed` z `ALLOW_DEMO_DATA=true` → pełny smoke → strona QR pokazuje `https://wine.example.test/r/halka`, API QR zwraca SVG). Hasła do bazy i właściciela są losowe w każdym przebiegu, bez sekretów repozytorium. Odstępstwa od specyfikacji: PostgreSQL to kontener startowany krokiem (hasło generowane w czasie przebiegu), nie `services:` (sieć Docker + hasło z kroku); „serwer odnotował wyłącznie GET z nagłówkiem” sprawdza sam `smoke --production` (odmawia innej metody przed wysłaniem), nie log serwera.

**Job `image` NIE jest wymaganym sprawdzeniem i nie wolno go takim robić bez akcji właściciela.** Jest nowy i nie przeszedł jeszcze na runnerze GitHub. Gdy będzie zielony na `main` przez kilka przebiegów, właściciel dodaje `image` do wymaganych checków w ochronie gałęzi (Settings → Branches → reguła `main` → Require status checks → `image`). Do tego czasu czerwony `image` nie blokuje merge, ale należy go naprawić. Wymaga też przeglądu `.github/` przez właściciela (CODEOWNERS).

## 15. Decyzje właściciela, które nie należą do repozytorium

| Decyzja | Stan | Wpływ |
|---|---|---|
| Dostawca hostingu (Q08) | cel referencyjny: jedna VM w UE (Hetzner/OVH), Compose; wybór dostawcy i zamówienie po stronie właściciela | tylko sekcje 1 i 9 (kopie dostawcy), nie kod |
| Domena i DNS | do ustalenia **przed drukiem QR** | `PUBLIC_BASE_URL` jest nieodwracalne po wydruku |
| Rejestr obrazów | poza zakresem (Q8): obraz budowany na hoście z tagu git; push do GHCR to osobne zgłoszenie | wycofanie wymaga starego obrazu na hoście (sekcja 10.1, pkt 5) |
| Miejsce i retencja kopii | do ustalenia (poza maszyną, zaszyfrowane) | sekcja 9; E21 F2 doda automatyzację |
| Reverse proxy (nginx, Caddy lub zarządzany) | do wyboru | sekcja 6; wymagania są obowiązkowe |
| Czy `image` jest wymaganym checkiem | po zielonych przebiegach na `main` | sekcja 14 |
| Kontakt dyżurny | do uzupełnienia w `docs/OPERATIONS.md` | sekcja 10.5 |

## 16. Typowe problemy

| Objaw | Co sprawdzić |
|---|---|
| `docker compose config` kończy się „set PUBLIC_BASE_URL…” albo „set POSTGRES_PASSWORD…” | brakująca zmienna w `.env` (to zamierzone, nazwa jest w komunikacie) |
| `app` kończy się kodem 1 zaraz po starcie | `docker compose logs app`: lista problemów konfiguracji (adres, `DATA_SOURCE`, `ALLOW_DEMO_DATA`) |
| `migrate` zawiesza się lub kończy błędem połączenia | `docker compose ps db` (`healthy`?), hasło z liter i cyfr, `POSTGRES_USER`/`POSTGRES_DB` zgodne z tymi z pierwszego startu bazy (wolumen zachowuje pierwsze wartości) |
| `/` kończy się 404 | `DEMO_RESTAURANT_SLUG` w `.env` nie jest slugiem istniejącej restauracji |
| Nie da się zalogować po https | proxy nie ustawia `X-Forwarded-Proto`/`Host`; ciasteczko `Secure` wymaga https |
| Import menu zwraca błąd 413 | limit ciała w proxy poniżej 12 MB |
| `app` jest `unhealthy` | proces nie odpowiada: `docker compose logs app`, pamięć (`docker stats`) |
| `health` 503 | baza nieosiągalna; po jej powrocie odpowiedź wraca do 200 bez restartu aplikacji |
