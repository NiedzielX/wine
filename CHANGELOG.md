# Changelog

Format wg [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), po polsku jak README. Wpisy pochodzą z listy scalonych PR-ów (numer w nawiasie). Wersja w `package.json` to `0.3.0` (pierwsze przygotowane wydanie; tag `v0.3.0` powstanie dopiero po publikacji wydania przez właściciela, dziś nic nie jest otagowane), a definicja wersji 1.0 jest decyzją właściciela. Co zrobić przy zmianie niezgodnej wstecz: [UPGRADE_NOTES.md](UPGRADE_NOTES.md); jak powstaje wydanie: [docs/RELEASING.md](docs/RELEASING.md). Kształt sekcji `[Unreleased]` sprawdza `npm run release:notes -- check`.

## [Unreleased]

### Raport wyników (`2026-11-18-owner-proof-report`)
- Krok 5: trasy `GET /restaurants/{slug}/proof-report?window=` (`proof.view`) i `POST /restaurants/{slug}/proof-launch` (`proof.manage`; dopisanie dnia uruchomienia, warunek wstępny w `If-Match` lub `expectedCurrent`: 428, 400, 409), test granicy dostępu T-43 z dowodem mutacyjnym, scenariusz `security-034`.
- Krok 6: ekran **A33** „Raport wyników / Results report” (`/admin/{slug}/proof?window=`, tylko Owner i GM, bez JavaScriptu): Wine Attach Rate przed i po z przedziałem zaokrąglonym na zewnątrz, „za mało danych” z powodami i „co zrobić”, tabela okien, zestawienie rachunków z kodem i bez (korelacja), kody polecenia, „Jak to liczymy” i „Czego ten raport nie mówi”, formularz dnia uruchomienia z historią; pozycja w nawigacji tylko dla `proof.view`; scenariusze QA `kpi-009…014`.
- Krok 7 (F2): ekran **A34** „Wersja do druku” (`/admin/{slug}/proof/print?window=`): te same sekcje co A33 na stronie A4 bez nawigacji i sterowania, „Ctrl/Cmd+P” zawsze widoczne, przycisk „Drukuj” tylko z JavaScriptem, data „dane do dnia” z danych POS; link z A33; scenariusz `kpi-015`.

### Wybór restauracji (faza 1, `2026-11-18-restaurant-picks`)
- PR1b: serwis `PicksService` (zbiór roboczy, `set` z `expectedVersion`, audyt `pick_edit`), uprawnienie `picks.edit` (Owner i GM; Sommelier tylko odczyt), trasy `GET /restaurants/{slug}/picks`, `PUT /wines/{id}/pick`, `GET /restaurants/{slug}/picks/simulation` i symulator „przed / po” liczony tą samą funkcją co ścieżka gościa (`rankForGuest`), tylko do odczytu. Gość jeszcze nie czyta wyborów (PR2), ekran A27 w PR3.
- PR2 (strona gościa): `RecommendationService` (`forDish`, `wineDetails`) liczy ranking wspólną `rankForGuest` na zbiorze opublikowanej wersji (`PublishedView.picks`); wybór, który się kwalifikuje, ma etykietę „Wybór restauracji” / „Restaurant’s pick” na G3, G7 i G9 (znak restauracji: zwykły tekst, bez pieczęci sommeliera; pierwsza karta będąca wyborem ma nagłówek wyboru zamiast „Polecane do Twojego dania”), G12 ma sekcję i zdanie o wyborze restauracji, stopka G3 dopisuje, czym jest etykieta. Publiczna trasa `GET /dishes/{id}/recommendations` ma nowe pole `restaurantPick` (kolejność grupy `engine` może się zmienić; `matchScore` bez zmian). Zdarzenia `recommendations_viewed.items[].pick`, `wine_viewed.props.pick`, `wine_selected.props.pick` tylko przy pozycji z etykietą. Dane demo Halka bez wyborów, `engine/` bez zmian. Limit słów G12 w teście podniesiony z 350 do 380 (nowa sekcja).
- PR3 (panel): ekran **A27** „Restaurant’s picks / Wybory restauracji” (`/admin/{slug}/picks`; lista win z przełącznikiem, symulator „przed / po” jako formularz `GET`, wszystko bez JavaScriptu; Owner i GM zmieniają, Sommelier widzi z wyłączonymi kontrolkami, sfałszowany POST dostaje `forbidden`), pozycja w nawigacji, odznaka wyboru z oznaczeniem „czeka na publikację” w A4, A5 i A6 (w A6 także karta z działaniem wyborów w danym daniu) i linia „Restaurant’s picks: +n / −n” w A11 (`PublishPreview.pendingPicksAdded` / `pendingPicksRemoved`, `PicksState.removed`). Scenariusze QA admin-035…039, test e2e `picks-panel.e2e.test.ts` (HTTP bez przeglądarki).

### Edycja pól dania i wina (E13, spec `2026-11-16-catalog-field-editing`, faza C1)
- A3 i A5 mają formularze „Details / Dane dania” i „Listing / Pozycja na karcie”: nazwa, opis, kategoria i cena dania; producent, nazwa, rocznik, region, kraj, nota, numer na karcie, ceny i „Na kieliszki” wina. Działają bez JavaScriptu (`useActionState`), zachowują wpisane wartości i pokazują komunikat przy każdym polu; ceny czyta ścisły `parseFormPrice` („58,500” to błąd, nie 58 500).
- Zmiany są od razu widoczne dla gości i nie zmieniają Match Score; tłumaczenia z publikacji zostają, a formularz wskazuje nieaktualne. Zapis chroni odcisk pól (`expectedVersion` / `If-Match`), nazwy dań, klucze win i numery na karcie są unikalne (także szkice i ukryte pozycje), sprawdzane pod blokadą doradczą restauracji, którą bierze też zatwierdzenie importu.
- Nowe uprawnienie `catalog.edit` (owner, manager, sommelier), tabela audytu `catalog_edit` (migracja `Migration20261117132943_catalog_edit`), trasy `GET`/`PATCH /dishes/{dishId}/details` i `/wines/{id}/details`.
- Zmiana nazwy dania (lub producenta, nazwy, rocznika wina) z parami sommeliera: ostrzeżenie z liczbą par, potwierdzenie, wpis „Zmieniono nazwę, sprawdź pary” w „Do przeglądu” i znacznik „Sprawdź po zmianie nazwy”.
- Zatwierdzenie importu katalogu odrzuca (409 `catalog_conflict`) nowe danie lub wino, którego klucz zajęto w międzyczasie.

### Poprawki
- Płynniejsze przejścia w menu: strona rezerwuje miejsce na pasek przewijania (`scrollbar-gutter: stable` w motywie panelu i gościa), więc układ nie przeskakuje o szerokość paska przy zmianie trasy (klasyczne paski przewijania, Windows i Linux). Pozostałe przyczyny skakania opisuje specyfikacja `2026-11-16-menu-transition-smoothness` (PR #158).

### Operacje
- Workflow `Demo database` (ręczny, tylko `main`, środowisko `demo-database`): migracje i opcjonalnie dane demo na bazie instancji demo z runnera GitHub, bez lokalnego komputera; adres bazy z sekretu środowiska, nigdy w logu. Opis: `docs/DEPLOYMENT.md` §17.1.

### Interaktywne demo (E22)
- Strona startowa `/start` (DM6) na instancji z `ALLOW_DEMO_DATA=true` i `SHOWCASE_MODE` innym niż `demo`: jedno kliknięcie do widoków gościa, „całego stołu”, kelnera i kalkulatora oraz „Zaloguj jako Marta / Tomasz” (akcja `loginAsDemo`, hasło demo nigdy nie trafia do HTML). Karta „Konta demo” na `/admin/login`, tylko dla kont, które istnieją w repozytorium i mają dostęp do panelu. Pasek powrotu na stronach gościa, link „Start dema” w panelu. Nowe: `AppEnv.allowDemoData`, `AuthService.panelAccountsAmong`, `/start` w `matcher` proxy (odstępstwo od R12 specyfikacji sprzedażowej), nagłówki `no-store` i `noindex`, `noindex` na całej instancji interaktywnej, wiersz T-37 w modelu zagrożeń. Spec `2026-11-16-interactive-demo-entry`.
- Zmiany po przeglądzie właściciela (2026-11-16): „Zaloguj jako …” to pełne, klikalne przyciski (`cursor-pointer` w `Button` z `@wine-match/ui`); `/` znów jest widokiem gościa `/r/{slug}`, a pasek w widoku gościa ma przycisk „Demo: wybierz widok” do `/start`; przy kontach Marty i Tomasza na `/start` i na karcie `/admin/login` stoją e-mail i publiczne hasło demo (tylko tryb interaktywny; skrót `scrypt$` nigdy). Zmiana R3/R5/R6/AC3 i R8 specyfikacji, T-37.

## [0.3.0] - 2026-11-16

### Wdrożenie produkcyjne (E11, E11b)
- E11 F1: gotowość pod produkcję: `PUBLIC_BASE_URL` zawodzący zamykająco, `GET /api/v1/health`, strażnik seedera, `smoke --production` (#120). Zmiana łamiąca: w produkcji brak `PUBLIC_BASE_URL` zatrzymuje serwer.
- E11b: domknięcie specyfikacji kodu polecenia (AC1–AC6, AC13–AC15) (#116).
- E11 F2–F3: obraz kontenera (`Dockerfile`, cele `runtime` i `migrator`), `docker-compose.yml`, job CI `image` (jeszcze niewymagany check), `docs/DEPLOYMENT.md` z wycofaniem i `docs/CONTINUITY.md` (#136).
- Zależności: Next 16.4.1 i undici 7.30.1 (#104), zod 4.6.6 (#97).

### Konta i role (E12)
- F1: status członkostwa, dziennik uwierzytelniania, serwis zespołu, ekran A15 (#118).
- F2: zaproszenia (`auth_token`), lista w A15, przyjęcie A17, zarezerwowane slugi (#123); `npm run user:invite` (#125).

### Jakość platformy (E21)
- F1: endpoint metryk, jedna linia logu na żądanie, redakcja sekretów (#117).
- F3: limity żądań na klienta: 429 z `Retry-After` dla publicznego API i logowania, limity wydania, wyszukania i oznaczenia kodu polecenia (G8, G9, G11), tabela `rate_limit_bucket` (migracja addytywna), opcjonalne `TRUSTED_PROXY_HOPS`, `RATE_LIMIT_SECRET`, `RATE_LIMITS`, `RATE_LIMIT_MAX_CLIENTS` (sufit klientów na okno, tryb awaryjny ze wspólnym licznikiem; Compose ustawia `TRUSTED_PROXY_HOPS=1`); żadna zmienna nie staje się wymagana. Wymaga ustawienia `TRUSTED_PROXY_HOPS` poza Compose (UPGRADE_NOTES.md) (#148).

### Demo sprzedażowe (E22)
- F1: kalkulator zwrotu, `SHOWCASE_MODE=calculator` (#122).
- F2: przewodnik demo, `SHOWCASE_MODE=demo` tylko do odczytu (#126).

### Bezpieczeństwo, proces i testy
- Model zagrożeń, testy granic dostępu, nagłówki bezpieczeństwa (#127); `check:routes` (#128); protokół review i paczka review (#129); izolacja tenantów i role na PostgreSQL (#112); hook agenta działa przy spacji w ścieżce (#115).
- Reguły pracy równoległej (#108), skrypt dowodu naprawy, CodeQL, Dependabot (#110), scenariusze QA i środowisko testowe (#107), `merge=union` dla indeksów (#119), stan prac i nocny review (#121), plan domknięcia produktu i specyfikacje E12–E22 (#105).
- Testy granic dostępu, część 1 (macierz T-25..T-32), poprawka wycieku danych na liście dań (kontrola dostępu przed odczytem, dane innego tenanta i anonimowo), ochrona `isUuid` w wyszukiwaniach (#133); część 2–3 (gość a niepublikowane, przypisanie masowe, polityka 403/404) i `check:pages` (#146).
- Test migracji up/down/up i testy współbieżności na PostgreSQL; poprawka wyścigu limitu kodów polecenia na sesję (#134).
- Utwardzenie łańcucha dostaw: akcje CI przypięte SHA, `ignore-scripts=true`, skan sekretów po całej historii, reguły `ask` dla agenta (#135).
- Hook `spec-status-guard` (status `approved` tylko przez człowieka) i trzy skille projektu `wine-match-*` (#132).
- Protokół QA z niezależnym weryfikatorem, szablon błędu, baza wiedzy QA, polecenia operatora drukują cel bazy (#130); niezależność recenzji wielu modeli, schematy recenzenta i `npm run review:validate` (#140).
- Odświeżenie README, backlogu E11–E22, notatek bezpieczeństwa, ról i opisu usuwania danych (#131); krótkie README, `SECURITY.md` (zgłaszanie podatności) i szczegóły w `docs/DEVELOPMENT.md` (#151).
- Odchudzenie `AGENTS.md` i indeksu lekcji pod budżety kontekstu (#142); ostrzeżenie o rozjeździe tabeli §1.1 z `package.json` i `check:context -- --fix-versions` (#145).
- `@wine-match/testkit` jako workspace z zakresem `"*"`, wymuszane w `release:version` (#144); proces wydania: `docs/RELEASING.md`, `UPGRADE_NOTES.md`, `release:version`, `release:notes` (#143).
- Playbook wykonawcy i `npm run audit:process` (#147); reguły wdrożenia i utrzymania oraz kierunek hostingu (#150); szkic specyfikacji hostingu na Vercel (#149); audyt wiedzy 2026-11-15 i dwa szkice specyfikacji utrzymania wiedzy (#153).
- Test odporności każdej trasy `api/v1` na złe wejście; klucze wybrane przez klienta są przycinane do 80 znaków w treści odpowiedzi 422 (#152).
- Zależności i CI: grupy minor-and-patch (#124, #138), `@testcontainers/postgresql` 12.2.1 (#139), akcje `setup-node` (#111), `upload-artifact` (#137) i `checkout` (#141).
- Poprawki: identyfikator spoza UUID to „nieznany”, nie 500 (#109); flaky test kodu kelnera (#106).
- Proces wydania: `docs/RELEASING.md`, `UPGRADE_NOTES.md`, §9 w `BACKWARD_COMPATIBILITY.md`, `npm run release:version` i `npm run release:notes`, szkic workflow `release.yml` (tylko ręcznie, bez publikacji pakietów i wdrożenia).

### Analityka, sprzedaż, okazje (E02–E04, E10)
- E02: sesja gościa w URL (`sid`) i zdarzenia odsłon (#61), wybór wina i podgląd kelnera (#63).
- E03: import sprzedaży z POS (#73), Wine Attach Rate (#75); poprawka ograniczenia `covers` (#91).
- E04: KPI użycia (#72), KPI sprzedaży (#87), skuteczność pairingów (#74).
- E10: rdzeń okazji (#58), ekrany okazji (#62), sygnał S4 (#76), sygnał S5 (#69).

### Doświadczenie gościa i kelnera (E07–E09)
- E07: test złoty i `ENGINE_FACTS` (#55), `InfoDisclosure` i etykiety (#57), wyjaśnienia na ekranach gościa i G12 (#66), „Co dalej?” na G8 (#67), wyjaśnienia w panelu (#59).
- E08: silnik stołu `wm-rules-1.1.0` (#56), ekran kelnera G11 (#68), „Cały stół” u gościa (#64), ilość wina `wm-rules-1.2.0` (#70).
- E09: kod polecenia na G8 (#65), kelner oznacza „Zamówione” (#71), dopasowanie kodów w imporcie POS (#88).

### Gość, język, projekt wizualny
- Jedno dotknięcie od QR do win, preferencje, układ desktopowy (#30); pełna szerokość od 768 px (#33); stan pusty G5 (#82); zawijanie nagłówka A7 przy 390 px (#96).
- Wersja polska aplikacji gościa (#31) i panelu (#32); treść restauracji PL i EN (#34).
- System projektowy gościa, tokeny, kontrast, job `design` (#77–#81, #83, #85); Storybook i testy dostępności (#84), job `a11y` (#86).

### Dane i bezpieczeństwo agenta
- Nazwy pozycji POS nie są przechowywane w zadaniu importu (#92).
- E05-S01: `npm run restaurant:create` (#98).
- Utwardzenie warsztatu agenta (#94, #99), `check:context` i AGENTS.md jako router (#100, #101), usunięcie osieroconych skilli (#102).

### Proces i dokumentacja specyfikacji
- Konfiguracja pipeline agentów i warstwa produktowa (#1, #2), brief i backlog badań (#10), backlog techniczny (#27), specyfikacje E02–E05 i ich zatwierdzenie (#28, #29), pozycjonowanie D13–D18 i specyfikacje E07–E10 (#35), odświeżenie discovery (#103), lekcje (#93).

## [0.2.0]

Wersja `0.2.0` jest w `package.json` od pierwszego commitu repozytorium („Import full Wine Match monorepo”, 2026-10-15), który wprowadził cały monorepo naraz. Historia przed tym commitem nie jest w repozytorium, więc **nie da się ustalić**, co ta wersja oznaczała; nie ma tagów ani wcześniejszego wpisu. Z dokumentacji wynika tylko, że w tamtym stanie istniały silnik, mockupy, aplikacja gościa, panel z zapisami, logowanie oraz import i QR (fazy 1–5 planu migracji z mockupów).
