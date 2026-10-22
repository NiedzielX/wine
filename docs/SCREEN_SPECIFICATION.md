# Specyfikacja ekranów

Identyfikatory ekranów według [SCREEN_MAP.md](SCREEN_MAP.md). Endpointy według [API_SPECIFICATION.md](API_SPECIFICATION.md). Nazwy eventów analytics są dokładnie takie jak w kodzie mockupu (`track(...)` w `src/`).

**Stan implementacji (Faza 1 migracji):** ekrany G0–G9 działają w `packages/app` (`/r/{slug}/…`). Odstępstwa od opisu poniżej, wynikające z architektury „stan w URL, działa bez JavaScriptu”:
- Preferencje i wybór dań gościa są w parametrach URL, a nie w sesji przeglądarki; filtry (G4) to linki, a arkusz otwiera się przez `?sheet=filters` (zamknięcie: link, nie klawisz Escape).
- G7 i G8 pobierają dane przez serwisy po stronie serwera (nie przez `GET /public/wines/{id}`); G8 nie wysyła eventów analytics z przeglądarki — zapis `wine_selected` robi serwer (E02, „Zdarzenia użycia” niżej).
- Stany loading / `?demo=` istnieją tylko w mockupach; aplikacja pokazuje stany empty i error (404 dla nieznanej restauracji lub wina, komunikat dla nieopublikowanego dania).
- Licznik na G5 jest progresywnym ulepszeniem (JS); bez JS przycisk jest aktywny, a serwer zwraca „Add at least two dishes”.
- Eventy analytics: zapisywane są tylko zdarzenia z katalogu „Zdarzenia użycia” niżej (E02, po stronie serwera); pozostałe nazwy z tabel „Analytics” — jeszcze nie.

**Stan implementacji (Faza 2 migracji):** ekrany panelu A1–A7 działają w trybie odczytu w `packages/app` (`/admin/{slug}/…`; adresy z restauracją w ścieżce, bo logowanie i wybór lokalu dopiero w Fazie 4). Odstępstwa od opisu poniżej:
- **A1 Dashboard** pokazuje KPI programu winnego liczone z danych katalogu (dania opublikowane, wina, zatwierdzone pairingi, pokrycie Primary, „needs attention”) i — od E04 F1 (spec `2026-10-15-kpi-dashboard`) — sekcję „Guest usage” (wiersz „Guest usage (E04 F1)” w tabeli A1). od E04 F3 — tabelę „Pairing performance” (wiersz „Pairing performance (E04 F3)” w tabeli A1), od E04 F2 — sekcję „Sales” z wyróżnionym Wine attach rate (wiersz „Sales (E04 F2)” w tabeli A1). Wykresy i stały baseline pilota — później. Karta „Guest activity” zniknęła.
- **A2, A3, A5** są tylko do odczytu (edycja profilu dania i wina — osobna specyfikacja; import — Faza 5). Filtry to formularze `GET`.
- **Faza 3 (zapisy):** **A6 Pairings** ma pełne zarządzanie (zatwierdzanie, odrzucanie, przywracanie, rola, kolejność ↑↓, notatka do 140 znaków, własne pary, usuwanie własnych par, „Approve all”, historia decyzji, podgląd „What guests see now” z wersji opublikowanej). **A7 Review** ma Approve / Reject / Approve all (dla dania i dla całego menu). **A4 Wine list** ma przełącznik dostępności (Hide / Show) działający od razu. **A11 Publish** działa: checklista (rada, nie blokada), ustawienia dla gości (od razu), „Publish changes” (migawka). Wynik zmiany pokazuje komunikat w URL (`?saved=` / `?error=`); konflikt wersji: „This pairing was changed by someone else…”.
- **Faza 4:** **A0 Login** działa (`/admin/login?next=`): jeden komunikat dla każdej nieudanej próby, blokada konta 15 minut po 5 próbach, powrót na żądaną stronę (tylko adresy `/admin/...`), działa bez JavaScriptu. Cały panel wymaga sesji; użytkownik bez członkostwa w restauracji dostaje 403. Autor zmiany w historii to zalogowany użytkownik. Pasek boczny pokazuje użytkownika, rolę i „Sign out”. General Manager widzi pairingi i kolejkę review w trybie „View only” (bez kontrolek decyzji), może publikować i ukrywać wina.
- **Faza 5:** **A8 / A9 Import** działają (`/admin/{slug}/import/menu|wines`, `?job=` to podgląd): upload (CSV, XLSX, PDF), podgląd z kontrolą każdego wiersza (błędy blokują, ostrzeżenia nie), edycja pól, zaznaczanie, „Check again”, atomowe zatwierdzenie, ekran wyniku. Odstępstwa od opisu: dla `.xls` komunikat „zapisz jako .xlsx lub CSV”; PDF jest czytany tylko jako tekst (bez OCR); duplikaty (to samo danie / ta sama nazwa, producent i rocznik wina) są domyślnie niezaznaczonymi aktualizacjami; plik nie jest przechowywany. **A10 Setup** (lista kroków wdrożenia, dane restauracji, „Generate suggestions”): dane i slug edytuje tylko Owner / GM, Sommelier widzi je w trybie „View only”. **A12 QR**: podgląd stojaka (układ do druku bez paneli), pobranie SVG i PNG (1024 / 2048 px), link; adres z `PUBLIC_BASE_URL`.
- Eventy analityczne i import sprzedaży nadal Faza 6.
- Stan loading (skeleton) mają ekrany list; strony szczegółów nie, żeby zwracały poprawne kody HTTP. Ekrany list wymagają JavaScriptu.
- **Okazje (spec `2026-10-16-sommelier-opportunities`, E10 F2):** **A14 Opportunities** (`/admin/{slug}/opportunities`, poza `(lists)`, działa bez JS), karta „Opportunities for this dish” na **A6** i linia „Opportunities: n” na **A1**. Sygnały S1–S3 oraz S4 i S5 (tylko A14; F3, F4); „Add to suggestions”, „Ignore”, „Restore” to formularze z akcjami serwerowymi (`pairings.decide`). W UI „Okazja” / „Opportunity”, bez słowa „AI”.

Wspólne zasady:
- **Loading** w aplikacji gościa: skeleton w kształcie docelowej treści (bez spinnerów). W mockupie wymuszany parametrem `?demo=loading`.
- **Error**: komunikat mówi, co się stało i co zrobić, z przyciskiem „Try again” (`?demo=error`).
- **Empty**: zaproszenie do działania, nie nastrój (`?demo=empty`).
- **Success**: toast w dolnej części ekranu (`role=status`) z tym samym czasownikiem co przycisk („Publish changes” → „Published 12 changes”).
- Wszystkie publiczne endpointy gościa są cache’owane (CDN, `stale-while-revalidate`); rekomendacje dla par bez filtrów są wyliczane przy publikacji.
- **Język (spec `2026-10-15-polish-language`):** aplikacja gościa jest po polsku i po angielsku. Język wybiera parametr `lang=pl|en` w URL, bez niego nagłówek `Accept-Language` przeglądarki (pierwszy z `pl`/`en`), w ostateczności angielski; gość nie dostaje ciasteczek. Przełącznik języka (od 2026-10-15 „Polski / English”, niżej) jest na G0 w prawym górnym rogu nagłówka restauracji, na pozostałych ekranach gościa w top barze po prawej (na G3 obok „Refine”); aktywny język ma `aria-current`. Linki i formularze GET niosą `lang` tylko wtedy, gdy był jawnie w URL. Tłumaczone są etykiety (także kategorie: Przystawki, Dania główne, Desery), uzasadnienia silnika, słowa smaku i komunikaty; wartości w URL (`styles=red`, kotwice kategorii) zostają bez zmian; treści restauracji — patrz „Treści dwujęzyczne” niżej. Ceny przez `Intl` (`pl`: „1 234 zł” ze spacją niełamliwą). Teksty angielskie w tym dokumencie mają polskie odpowiedniki w `packages/app/src/i18n/pl.ts`. **Panel (A0–A13)** też jest po polsku i po angielsku: język z ciasteczka `wm_lang` (ustawia je przełącznik „Polski / English” w górnym pasku panelu i w prawym górnym rogu ekranu logowania — zwykły formularz z akcją serwerową, bez JS, wraca na tę samą stronę), bez ciasteczka z `Accept-Language`, w ostateczności angielski. Komunikaty po zmianie (flash), błędy logowania, uwagi importu i kroki Setup są tłumaczone po kodzie; daty `09.10.2026, 17:40` i kwoty przez `Intl`. Tytuły kart: „%s | Panel Wine Match”. Słownictwo: Pulpit, Menu, Karta win, Parowania, Do przeglądu, Publikacja, Import menu / win, Ustawienia, Kod QR, Wyloguj; role par: Podstawowe, Alternatywa, Najlepsza cena. Uzasadnienia silnika w panelu idą w języku panelu.
- **Treści dwujęzyczne i przełącznik „Polski / English” (spec `2026-10-15-bilingual-content`):** nazwy i opisy dań, notatki degustacyjne, regiony i kraje win, notatki sommeliera oraz hasło i miasto restauracji mają wersje PL i EN. Gość widzi wersję w swoim języku z **ostatniej publikacji** (brak tłumaczenia → tekst bazowy, bez znacznika); panel — bieżące tłumaczenia w języku panelu. Nazwy win i producentów się nie zmieniają. Publiczne API `/api/v1` zwraca teksty bazowe. Przełącznik ma etykiety „Polski” i „English” (każda we własnym języku, `aria-current` na aktywnym, `aria-label` z pełną nazwą); poniżej 640 px widać „PL” / „EN”. Jest **na górze** każdego ekranu: gość — top bar po prawej, na G0 prawy górny róg nagłówka restauracji; panel — górny pasek treści (desktop) albo wiersz nagłówka nad nawigacją (wąski ekran), a nie stopka nawigacji; A0 — prawy górny róg. Działa bez JS i mieści się przy 390 px. Nagłówek restauracji (G0) pokazuje adres z miastem i hasło restauracji w języku gościa.
- **Wyjaśnienia „Jak to działa” (spec `2026-10-16-how-it-works-explanations`, E07):** na ekranie z wynikiem silnika stoi **jedno** wyjaśnienie — natywne `<details>` / `<summary>` (komponent `InfoDisclosure` z `@wine-match/ui/brand`, u gościa nakładka `Explain`, w panelu `PanelExplain`): zamknięte domyślnie, w zamkniętym stanie jeden wiersz z ikoną „i” i widocznym pytaniem (np. „Why these wines?” / „Skąd te wina?”), otwiera się dotknięciem, Enter lub Spacją, działa bez JavaScriptu, treść w zwykłym przepływie strony (lista ≤ 6 punktów, ≤ 90 słów, G3 ≤ 110). Nigdy wewnątrz linku, przycisku ani `<p>`; bez `title` i bez najechania. U gościa tekst `ink-2` (≥ 4,5:1), cel dotyku ≥ 44 px; w panelu ≥ 24 px. Liczby w tekstach pochodzą z `ENGINE_FACTS` (`core/src/engine/facts.ts`), warianty z bieżących ustawień `showScores` / `showUnreviewed`. Gość nie czyta słów „AI”, „silnik”, „algorytm” — tylko „zasady łączenia wina z jedzeniem”. Atrybut `data-explain` nazywa ekran (`wines`, `filters`, `wine`, …); inne specyfikacje dopisują akapity do tego samego wyjaśnienia, zamiast dodawać drugie „i”. Faza 1b: G3, G4, G7; faza 2: G0, G1, G5, G6, G9 i strona G12 „How we pick your wine” / „Jak dobieramy wino” (link z G0 i ze stopki G3); faza 3: panel; G8 (`selected`) z akapitem o kodzie polecenia E09 w tym samym wyjaśnieniu (jedno „i”).
- **Nazwy etykiet (D13, R01):** para sommeliera (`approved` / `modified`) — „Sommelier’s pairing” / „Para sommeliera” (z pieczęcią); najlepsza propozycja silnika na G3 — „Recommended for your dish” / „Polecane do Twojego dania” (bez pieczęci); kelner (G9) — „Sommelier’s pairing · first choice” / „Para sommeliera · pierwszy wybór” i „Sommelier’s pairing” / „Para sommeliera”; panel mówi o propozycjach silnika tą samą nazwą co gość.
- **Zdarzenia użycia (spec `2026-10-15-guest-usage-events`, E02; faza 1 od 2026-10-16, fazy 2 i 3 od 2026-10-17):** zapisuje je serwer — strona gościa po udanym renderze, w `after()` (po wysłaniu odpowiedzi; błąd zapisu tylko w logu, odpowiedź bez zmian). Bez JavaScriptu, ciasteczek i pamięci przeglądarki. Każde zdarzenie niesie `restaurant_id`, `session_id`, `engine_version`, `created_at` i `props.menuVersion` (= `publishedAt` restauracji, ISO albo `null`).
  - **Sesja:** anonimowy UUID v4 (małe litery) w parametrze URL **`sid`**. Każdy link `/r/{slug}/…` i każdy formularz GET gościa i G9 niesie bieżący `sid` (link: na końcu adresu; formularz: ukryte pole `sid`) — także przełącznik języka i linki ze wspólnych komponentów (`href` z `guestContext`). Wyjątek: link „For staff” na G0 (kelner ma własną sesję). Brak lub niepoprawny `sid` = nowa sesja. `sid` nie trafia do treści, tytułów ani `aria-*`.
  - **Bez zapisu:** prefetch routera (proxy oznacza go nagłówkiem `x-wine-prefetch`, bo `headers()` ukrywa `Next-Router-Prefetch`), `Sec-Purpose`/`Purpose: prefetch|prerender`, **ruch własny z nagłówkiem `x-wine-match-synthetic: 1`** (smoke, CI, monitoring — strona renderuje się normalnie), pusty `User-Agent` i UA botów / podglądów linków (`bot`, `crawl`, `spider`, `slurp`, `preview`, `facebookexternalhit`, `whatsapp`, `telegrambot`, `slackbot`, `discordbot`, `linkedinbot`, `twitterbot`, `embedly`, `curl/`, `wget/`, `python-requests`, `go-http-client`, `uptime`, `pingdom`), strony kończące się 404, wino nieaktywne na G8 (ani `wine_selected`, ani start sesji), G9 bez jawnego `dish=` z opublikowanego menu. Miękka nawigacja z JS (`RSC: 1`) liczy się jak odsłona; odświeżenie może dać duplikat (KPI liczą unikalne).
  - **Katalog** (`GUEST_EVENT_NAMES` w `core/src/domain/types.ts`; nazwy i klucze `props` czyta E04 — dopisujemy, nie zmieniamy):

    | Ekran | Zdarzenie | `dish_id` / `wine_id` | `props` (oprócz `menuVersion`) | Od |
    |---|---|---|---|---|
    | G0 bez `sid` | `guest_session_started` | – | `source: 'qr'` | F1 |
    | inna strona gościa (G1, G3, G5–G8, G12) bez `sid` | `guest_session_started` | – | `source: 'link'` | F1 |
    | G0 z menu, G1 | `menu_viewed` | – | – | F1 |
    | G3 (bez `sheet`; arkusz filtrów nie zapisuje) | `recommendations_viewed` | dish | `wineIds` (kolejność wyświetlenia), `items: [{ wineId, tier }]` (`sommelier_primary` \| `sommelier` \| `engine`), `prefs` (tylko niedomyślne) | F1 |
    | G6 (wynik; nie ekran „Add at least two dishes”) | `table_recommendation_viewed` | – | `dishIds` (opublikowane dania z `dishes=`, najwyżej 12, w tej kolejności), `wineIds` (kolejność wyświetlenia; pusty wynik → `[]`), `budgetRelaxed` (budżet zdjęty, bo wykluczył wszystkie butelki — E08 R13), `people` (tylko gdy liczbę osób wybrano — E08 F4) | F2 |
    | G7 | `wine_viewed` | dish (tylko `context: 'dish'`), wine | `context`: `table` (`table=` z G6), `dish` (`dish=` opublikowanego dania), inaczej `direct` | F2 |
    | G8 (wino aktywne) | `wine_selected` | dish (tylko `context: 'dish'`), wine | `serving` (`glass` tylko dla wina z ceną kieliszka, inaczej `bottle` — jak na ekranie), `context` (jak G7), `dishIds` (tylko `table`: opublikowane dania z `table=`, nieznane pominięte), `people` (tylko `table` z wybraną liczbą osób — E08 F4) | F2 |
    | G9 (`dish=` jawnie, danie z opublikowanego menu) | `staff_lookup` | dish | `source: 'staff'`, `prefs` (tylko niedomyślne), `wineIds` (kolejność wyświetlenia; pusty wynik → `[]`) | F3 |
    | G12 „How we pick your wine” (spec `2026-10-16-how-it-works-explanations`, Q9) | `explainer_viewed` | – | – | E07 F2 |
    | G11 (≥ 2 opublikowane dania; nie komunikat „Tick at least two dishes”) | `staff_table_lookup` | – / butelka pokazana jako pierwsza (pusty wynik → `null`) | `source: 'staff'`, `dishIds` (opublikowane dania w kolejności karty, najwyżej 12), `wineIds` (kolejność wyświetlenia; pusty wynik → `[]`), `pickedWineId` (tylko gdy `wine=` wskazuje wino z wyniku — „Choose this one”), `prefs` (tylko niedomyślne, bez `serving`), `splitSuggested`, `budgetRelaxed`, `people` (tylko gdy wybrano — F4) | E08 F2 |

    `guest_session_started` jest w tym samym zapisie co pierwsze zdarzenie strony. G9 i G11 nigdy nie rozpoczynają sesji gościa: kelner ma własny `sid` (link „For staff” nie niesie `sid` gościa), więc jego lookupy nie wchodzą do liczby sesji gości. `source` jest tylko w `guest_session_started`, `staff_lookup` i `staff_table_lookup`. Konwersję i skuteczność par (E04, E10) liczy się z `wine_selected` z `context: 'dish'` po kolumnach `dish_id`/`wine_id`, a źródło pary z `items[].tier` ostatniego `recommendations_viewed` tej sesji dla dania. Nazwy z tabel „Analytics” niżej, których nie ma w katalogu (np. `recommendation_clicked`, `filters_opened`), wymagają JS i `POST /public/events` — planowane, nie zapisywane.

---

# Guest application (mobile-first)

## G0 Restaurant landing — `/r/{slug}`

| Pole | Opis |
|---|---|
| Cel | Przywitać gościa, wyjaśnić w jednym zdaniu, do czego służy, i zbudować zaufanie (karta ułożona przez sommeliera) |
| Użytkownik | Gość (po skanie QR) |
| Funkcje | menu (jak G1) od razu pod nagłówkiem: wybór dania → G3 (z preferencjami z URL); karta „Cały stół” nad menu → G5; link „More on how we pick wines” / „Więcej o doborze win” → G12 (z preferencjami, `lang` i `sid`) i link „For staff” → G9 — oba pod menu na telefonie, w nagłówku restauracji na desktopie (tekst `ink-2` na `paper`, pełny `on-wine` na `wine-deep`) |
| Komponenty UI | Hero w kolorze bordo z nazwą restauracji (Bodoni Moda), adres, lead; **karta „Cały stół”** (spec `2026-10-16-whole-table-waiter-path`, R8) nad nagłówkiem „Pick your dish”, gdy `canPairTable` (≥ 2 opublikowane dania poza deserami): tytuł „Several dishes on the table?” / „Kilka dań na stole?”, zdanie „We’ll find one bottle for all of them and tell you honestly where it’s weaker.” / „Dobierzemy jedną butelkę do wszystkich i powiemy uczciwie, do czego pasuje słabiej.”, przycisk główny „Find a bottle for the table” / „Dobierz butelkę do stołu” → G5 (z preferencjami, `lang` i `sid`); przycisk „Pair a bottle for the table” w hero **tylko bez karty** (np. menu z samych deserów) — jedno wejście, nie dwa; nagłówek „Pick your dish” i lista dań; karta kuratora (inicjały, Wine Director) — na telefonie pod menu, na desktopie w lewej kolumnie |
| Dane wejściowe | `slug` z URL |
| Dane wyjściowe | sesja gościa (`sid` w linkach; nowa, gdy adres jej nie ma) |
| Loading | tło hero od razu (kolor marki), nazwa i przyciski po pobraniu danych restauracji |
| Empty | restauracja bez opublikowanego menu → „Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.” |
| Error | błędny / nieaktywny slug → „This menu isn’t available” + instrukcja ponownego skanu |
| Success | n/d |
| Walidacje | slug `[a-z0-9-]{2,40}`; restauracja aktywna i opublikowana |
| Permissions | publiczny |
| API | `GET /public/restaurants/{slug}` |
| Analytics | `guest_session_started {source: qr}`, `menu_viewed` |
| Wyjaśnienie | „How do we pick your wine?” / „Jak dobieramy wino?” (`data-explain="landing"`) pod „Pick your dish” i jego leadem, nad listą dań (bez opublikowanego menu nie ma wyjaśnienia, link do G12 zostaje): do `dishLimit` win z karty restauracji do wybranego dania; wina z pieczęcią to pary sommeliera ({Wine Director}, przy pustym — „the restaurant’s sommelier”); pozostałe według zasad łączenia wina z jedzeniem (tylko przy „Fill empty places…”); producenci nie płacą za miejsce na liście |

## G1 Dish list — `/r/{slug}/menu`

| Pole | Opis |
|---|---|
| Cel | Szybki wybór dania, które gość zamawia |
| Użytkownik | Gość |
| Funkcje | przełącznik One dish / Whole table; skok do sekcji (Starters, Mains, Desserts); wybór dania → G3 (z preferencjami z URL) |
| Komponenty UI | top bar z Back; segmented control; przyklejony pasek chipów kategorii; wiersze dań (nazwa serif, cena, opis, oznaczenie „Sommelier’s pairing” z pieczęcią przy daniu z parą podstawową) |
| Dane wejściowe | menu opublikowane: dania `published`, kategorie, ceny |
| Dane wyjściowe | wybrane `dishId` |
| Loading | 5 skeletonów wierszy |
| Empty | „Tonight’s menu is being updated” |
| Error | „The menu didn’t load. Check your connection and try again.” + Try again |
| Success | n/d |
| Walidacje | pokazywane tylko dania `published` |
| Permissions | publiczny |
| API | `GET /public/restaurants/{slug}/menu` |
| Analytics | `menu_viewed` |
| Wyjaśnienie | „What does the seal next to a dish mean?” / „Co znaczy pieczęć przy daniu?” (`data-explain="menu"`) pod „Pick the dish you’re ordering”: sommelier wybrał już wino do tego dania i stoi ono pierwsze (chyba że wykluczą je filtry, np. „By the glass”); do pozostałych dań — zasady łączenia wina z jedzeniem („Fill empty places…” włączone) albo tylko wina zatwierdzone przez sommeliera, a bez nich pomoc kelnera (wyłączone) |

## G2 Dish details — `/r/{slug}/dish/{dishId}` (wycofany 2026-10-15)

Ekran połączony z G3 (spec `.ai/specs/2026-10-15-guest-short-path-and-desktop.md`): adres odpowiada **308** na `/r/{slug}/dish/{dishId}/wines` z całym query (`BACKWARD_COMPATIBILITY.md` §1). Opis dania i „taste chips” są w nagłówku G3, szybkie preferencje w rzędzie chipów na G3. Event `dish_viewed` usunięty — wejście w danie liczy `recommendations_viewed`.

## G3 Wine recommendations — `/r/{slug}/dish/{dishId}/wines`

| Pole | Opis |
|---|---|
| Cel | Pokazać 2–4 najlepiej pasujące wina z karty restauracji, z ceną i krótkim uzasadnieniem |
| Użytkownik | Gość |
| Funkcje | nagłówek dania (nazwa, cena, opis, „taste chips”); rząd szybkich preferencji: „More…” (→ G4, z liczbą filtrów spoza rzędu), By the glass, By the bottle, Red, White, Sparkling — każdy chip to link, drugie kliknięcie wyłącza; karta z nagłówkiem „Sommelier’s pairing” (para sommeliera, z pieczęcią) albo „Recommended for your dish” (najlepsza propozycja silnika); lista „Also good with this dish”; „Refine” w top barze → G4; wybór wina → G7. Desktop (≥ 1024 px): menu z bieżącym daniem w lewej kolumnie, wina w prawej, G4 jako panel z prawej |
| Komponenty UI | nagłówek „For your {dish}”, licznik; **Match glass** (kieliszek wypełniony kolorem wina do poziomu wyniku) + procent; odznaki: Sommelier’s pairing (pieczęć, mosiądz), Best value (szałwia); cena z ikoną kieliszka / butelki; „Why it works”; nota zaufania (stopka, `ink-2`): przy „Fill empty places with engine picks” „Every wine comes from {restaurant}’s list. Wines with the seal are recommended by {director}; the others are matched by our pairing rules.”, bez tego ustawienia „Every wine comes from {restaurant}’s list and is recommended by {director}.” (puste `wineDirector` → „the restaurant’s sommelier”), a po nocie link „More on how we pick wines” / „Więcej o doborze win” → G12 (z preferencjami, `lang` i `sid`; E07 F2). Kieliszek ma nazwę dostępną w języku strony („Dopasowanie 80 procent”), a przy wyłączonych procentach — bez liczby |
| Wyjaśnienie | „Why these wines?” / „Skąd te wina?” (`data-explain="wines"`) między szybkimi preferencjami / notką o budżecie a pierwszą kartą, także nad pustą listą: para sommeliera zawsze pierwsza; „Recommended for your dish” — zasady łączenia wina z jedzeniem, od `minModelScore`% (tylko przy „Fill empty places…”); procent 0–`maxScore` (albo kieliszek przy wyłączonych procentach) — wybór sommeliera zmienia kolejność, nie liczbę, cena jej nie podnosi; „Best value” — para sommeliera z tą rolą albo najtańsza butelka tańsza od pierwszego wina, do `bestValueWindow` pkt poniżej najlepszego; filtry twarde i miękkie oraz `budgetFallbackCount` wina spoza budżetu. Karta pierwszego wina przy 390 × 844 nie niżej niż 520 px |
| Dane wejściowe | `dishId`, `GuestPreferences` |
| Dane wyjściowe | lista `RecommendationItem` |
| Loading | skeleton karty głównej + 2 wierszy |
| Empty | z filtrami: „No wine fits all your choices. Try fewer filters…” + Clear filters; bez filtrów: „Our sommelier is still preparing pairings for this dish. Your waiter can help.” |
| Error | „Recommendations didn’t load. Your waiter can help you choose, or try again.” |
| Success | lista; przy zbyt niskim budżecie notka „Nothing matches under {X} zł. These are the closest options.” |
| Walidacje | tylko wina aktywne; bez par odrzuconych; twarde filtry (serwowanie, styl, budżet); procent ukryty, jeśli restauracja wyłączyła „Show match percentages” |
| Permissions | publiczny |
| API | `GET /dishes/{id}/recommendations?serving=&styles=&maxPrice=&weight=&mood=&limit=4` |
| Analytics | `recommendations_viewed {dishId, wineIds[], prefs}` (także jako wejście w danie — zastępuje `dish_viewed`), `recommendation_clicked {dishId, wineId}` |

## G4 Filters — bottom sheet na G3 (`?sheet=filters`)

| Pole | Opis |
|---|---|
| Cel | Zawęzić wyniki według potrzeb gościa |
| Użytkownik | Gość |
| Funkcje | Glass / Bottle / Either; styl (multi): Sparkling, White, Rosé, Orange, Red, Sweet; budżet (Any + 3 progi); Body: Lighter / Fuller; Mood: Classic / Adventurous; Reset; „Show N wines” |
| Komponenty UI | arkusz z uchwytem, tło przyciemnione, nagłówek „Refine” + zamknij; grupy chipów `aria-pressed`; przyklejona stopka |
| Dane wejściowe | `GuestPreferences` |
| Dane wyjściowe | zaktualizowane `GuestPreferences` |
| Loading | licznik na przycisku aktualizowany synchronicznie (lokalne przeliczenie) |
| Empty | przycisk „Show 0 wines” prowadzi do empty state G3 z „Clear filters” |
| Error | n/d (operacja lokalna) |
| Success | zamknięcie arkusza, lista przeliczona, chipy aktywnych filtrów nad listą |
| Walidacje | progi budżetu: kieliszek 45 / 60 / 75 zł, butelka 200 / 300 / 400 zł |
| Permissions | publiczny |
| API | jak G3 (przeliczenie po zamknięciu) |
| Analytics | `filters_opened {dishId}`, `filter_changed {dishId, …patch}`, `filters_cleared {dishId}` |
| Wyjaśnienie | „How do the filters work?” / „Jak działają filtry?” (`data-explain="filters"`) pod chipami arkusza, przed stopką: „By the glass”, kolor i budżet wykluczają wina; budowa i nastrój zmieniają kolejność; bez wina w budżecie — `budgetFallbackCount` najlepiej pasujące wina spoza budżetu z notką |

## G5 Whole table selection — `/r/{slug}/table`

| Pole | Opis |
|---|---|
| Cel | Zebrać dania całego stolika do wspólnej rekomendacji |
| Użytkownik | Gość (jeden telefon na stolik) |
| Funkcje | zaznaczanie dań; „How many people are drinking wine?” / „Ile osób pije wino?” (spec `2026-10-16-whole-table-waiter-path` F4, R16): radio `people` — „Skip” / „Pomiń” (domyślnie; bez ilości — domyślnej liczby osób nie ma, Q4), 2–8 i „8+” (10); zwijane „Colour and budget” (budżet na butelkę); „Find a bottle for the table” (aktywny od 2 dań) → G6; „Clear selection” |
| Komponenty UI | segmented control; lista z checkboxami pogrupowana kategoriami; przyklejony pasek z licznikiem (`aria-live`) |
| Dane wejściowe | menu; wybór z sesji |
| Dane wyjściowe | `dishIds[]` |
| Loading | jak G1 |
| Empty | jak G1 |
| Error | jak G1 |
| Success | licznik: „3 dishes selected” |
| Walidacje | min. 2 dania; podpowiedź „1 dish selected, add one more” |
| Permissions | publiczny |
| API | dane z G1 |
| Analytics | `table_dishes_selected {dishIds}` (produkcja: przy wysłaniu), `table_preference_set` |
| Wyjaśnienie | „How do we pick one bottle for the table?” / „Jak wybieramy butelkę dla stolika?” (`data-explain="table"`) pod leadem, nad listą dań: każde wino z karty oceniane do każdego zaznaczonego dania, dania główne ×`tableMainsWeight`; liczy się średnia i najsłabsze danie; desery osobno (chyba że stół zamawia same desery); tylko wina w wybranym kolorze i budżecie, a gdy budżet wyklucza wszystko — `budgetFallbackCount` najlepiej pasujące butelki spoza niego z notką; ilość: ok. `tableMlPerPerson` ml na osobę, jeśli wszyscy piją to samo wino (E08 F4) |

## G6 Best wine for your table — `/r/{slug}/table/result`

| Pole | Opis |
|---|---|
| Cel | Pokazać najlepszą butelkę dla wszystkich dań i uczciwie pokazać kompromis |
| Użytkownik | Gość |
| Funkcje | karta „Recommended for your table” z linią dopasowania, wynikami per danie, Overall match, ceną; 2 alternatywy (każda z linią dopasowania); sekcja „Or by the glass, dish by dish” przy dużej rozbieżności; wybór wina → G7 |
| Komponenty UI | (spec `2026-10-16-whole-table-waiter-path`, F3, R9) **linia dopasowania** `table.fit` zamiast jednozdaniowego `why` na karcie i przy alternatywach: „Works with 5 of 6 dishes, less so with: Venison loin.” / „Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.”, „Works with all 4 dishes.”, „Works with both dishes.”, wariant „…, though it’s a compromise.” / „…, choć to kompromis.”, „Not a strong match for any of the 4 dishes.”, dla jednego dania „Works with this dish.” / „Less of a match for: X.”; powyżej 3 słabszych dań trzy najsłabsze i „and n others” / „i n innych”; paski per danie z **surowym wynikiem silnika** (`engineScore`, bez premii +3 za parę sommeliera i bez limitu 50 — AGENTS §7) i pieczęcią przy parach sommeliera (nazwa w tekście `sr-only`); Overall match (serif); przy `showScores = false` bez liczb — bez procentu przy daniu i bez wiersza „Overall match” (paski i kieliszek zostają); notka o odłożonych deserach; jedno wyjaśnienie „How is the overall match worked out?” / „Jak liczymy dopasowanie ogółem?” (`data-explain="tableResult"`, nad kartą, poza linkiem; akapit E08 i punkty E07 F2 w jednym kluczu): paski = dopasowanie do każdego dania, dopasowanie ogółem = `tableMeanWeight` średniej (dania główne ×`tableMainsWeight`) + `tableMinWeight` najsłabszego dania, „pasuje” od `tableFitThreshold` (70%), odrzucona para nigdy nie pasuje, desery osobno, para sommeliera (pieczęć) dodaje `tableSommelierBonus` pkt tylko do wyniku ogółem, odrzucona liczy się najwyżej jako `tableRejectedCap`%, kieliszki do każdego dania poniżej `compromiseThreshold`% ogółem albo `weakDishThreshold`% najsłabszego dania — liczby z `ENGINE_FACTS`, bez „%” przy `showScores = false`; nagłówek karty „Recommended for your table” bez pieczęci (pieczęć tylko przy daniach z parą sommeliera, E07 R7); komunikat budżetu nad kartą, gdy budżet wykluczył wszystkie butelki; **ilość dla liczby osób** (E08 F4, R16, Q4) pod kartą, poza jej linkiem: „How many people are drinking wine?” / „Ile osób pije wino?” i linki 2–8 (bieżący z `aria-current`, 9–12 tylko w tekście); bez wyboru tylko podpowiedź „Choose how many people are drinking to see how much wine to order.” / „Wybierz, ile osób pije wino, a podamy, ile go zamówić.” i **bez ilości**; po wyborze linia „For 6 people: 3 bottles · 960 zł” / „Dla 6 osób: 3 butelki · 960 zł” (z kieliszkami: „Dla 3 osób: 1 butelka + 1 kieliszek · 384 zł”) dla butelki z karty (`table.quantity`); przy porcji kieliszkowej (`serving=glass`) ani pytania, ani ilości; linki do G7 i powrót do G5 niosą `people`; w wyjaśnieniu dodatkowy punkt „Amount: about `tableMlPerPerson` ml a person, if everyone drinks the same wine.” |
| Dane wejściowe | `dishIds[]`, preferencje, `people` (opcjonalnie, 2–12) |
| Dane wyjściowe | `TableResult` |
| Loading | skeleton karty z 3 paskami |
| Empty | mniej niż 2 dania → „Add at least two dishes” + Choose dishes; budżet wykluczył wszystkie butelki → luzowanie (`table.budget_relaxed`): „Nothing matches under 200 zł. These are the closest options.” / „Nic nie mieści się w budżecie do 200 zł. Oto najbliższe propozycje.” i 2 najbliższe butelki; brak butelki po filtrach koloru / porcji → „No bottle fits these filters” |
| Error | jak G3 |
| Success | wynik |
| Walidacje | desery poza obliczeniem butelki (chyba że stolik ma same desery) |
| Permissions | publiczny |
| API | `POST /recommendations/table` |
| Analytics | `table_recommendation_viewed {dishIds, wineIds, budgetRelaxed, people?}` (zapis serwera, E02 F2; `budgetRelaxed` — E08 F3; `people` — E08 F4, tylko gdy wybrano) |

## G7 Wine details — `/r/{slug}/wine/{wineId}?dish=|table=1`

| Pole | Opis |
|---|---|
| Cel | Dać gościowi pewność wyboru i wybrać porcję |
| Użytkownik | Gość |
| Funkcje | wybór kieliszka / butelki; „Choose this wine” → G8 |
| Komponenty UI | nazwa, producent, Match glass **tylko z prawdziwym wynikiem dla dania** (bez dania, z G6 i dla wina, którego danie nie proponuje — poniżej progu albo odrzuconego — kieliszka nie ma); blok sommeliera (pieczęć, imię, notatka) lub „Why it works with the {dish}”; fakty (region, rocznik, szczepy, styl i alkohol); nota degustacyjna (serif italic); profil w kropkach 0–5; radio-karty porcji z ceną i pojemnością |
| Dane wejściowe | Wine; kontekst dania (opcjonalnie) |
| Dane wyjściowe | `{wineId, serving}` |
| Loading | skeleton nagłówka i faktów |
| Empty | n/d |
| Error | wino nieaktywne / nieznane → „This wine is no longer available” + See other wines |
| Success | przejście do G8 |
| Walidacje | kieliszek nieaktywny, gdy `glassPrice = null` („Not poured by the glass”); ze stolika domyślnie butelka; ze stolika `people` (E08 F4) przechodzi dalej: ukryte pole formularza do G8 i link powrotu do G6 (ilości G7 nie pokazuje) |
| Permissions | publiczny |
| API | `GET /public/wines/{id}?dishId=` (z wynikiem dopasowania) |
| Analytics | `wine_viewed {wineId, dishId, context}` (zapis serwera, E02 F2); `wine_selected` zapisuje G8 (po „Choose this wine”) |
| Wyjaśnienie | „What does this score mean?” / „Co znaczy ta ocena?” (`data-explain="wine"`) pod blokiem uzasadnienia (bez wyniku — pod faktami): z wynikiem — co znaczy procent (albo kieliszek) dla tego dania i skąd uzasadnienie; bez wyniku — dlaczego go tu nie ma; zawsze — kropki to profil 0–5 z opisu restauracji |

## G8 Selection confirmation — `/r/{slug}/selected/{wineId}`

| Pole | Opis |
|---|---|
| Cel | Ekran do pokazania kelnerowi zamiast wymawiania nazwy |
| Użytkownik | Gość, kelner |
| Funkcje | „Pair another dish” → G1; „Done” → G0; kod polecenia dla kelnera (E09 F1) |
| Komponenty UI | „Show this to your waiter.” (bez kieliszka dopasowania — to potwierdzenie wyboru, nie ocena); karta: numer z karty (List no.), producent i wino (duży serif), rocznik, porcja + cena, danie / „For the table” — ze stolika z wybraną liczbą osób (`people`) i porcją butelkową także linia ilości „For 3 people: 1 bottle + 1 glass · 384 zł” / „Dla 3 osób: 1 butelka + 1 kieliszek · 384 zł” (`RecommendationService.tableWineQuantity`, E08 F4; bez wyboru, przy kieliszku, przy daniu (`dish=`) i przy mniej niż 2 opublikowanych daniach — brak); pod kartą blok „Code for your waiter” / „Kod dla kelnera” z dużym kodem (serif, `tabular-nums`, odstępy; widoczne znaki `aria-hidden`, obok `sr-only` „W, 7, K”) i zdaniem „Show it to your waiter with the wine.” / „Pokaż go kelnerowi razem z winem.”. Bez kodu (limit sesji R13, błąd lub przekroczony czas zapisu, ruch nie-gościa) jedna linia „Code unavailable — name the wine to your waiter.” / „Kod niedostępny — poleć wino słownie.”, reszta ekranu bez zmian. Osobnego „i” przy kodzie nie ma: zdanie o kodzie jest ostatnim punktem jedynego wyjaśnienia ekranu (niżej) |
| Wyjaśnienie | `selected` — „What happens next?” / „Co dalej?” pod kartą i blokiem kodu, nad przyciskami: wybór wina to nie zamówienie i w aplikacji niczego się nie płaci; pokaż ekran kelnerowi, który przyjmie zamówienie; tylko gdy kod jest wyświetlony — zdanie o kodzie (`guest.selected.code.explain`: łączy wino z poleceniem, nie zawiera danych o gościu). Bez liczb. Wino nieaktywne (komunikat zamiast karty) — bez wyjaśnienia |
| Dane wejściowe | `wineId`, `serving`, `dishId` / `table` |
| Dane wyjściowe | rekord polecenia `recommendation_code` (spec `2026-10-16-recommendation-code`, F1): przy renderze, przed odpowiedzią, dla wina aktywnego i ruchu gościa (`shouldRecord`); kontekst `dish` (gdy `dish=` to opublikowane danie — pierwszeństwo), `table` (2–12 opublikowanych dań z `table=`), inaczej `direct`; > 12 dań → brak kodu. Odświeżenie z tym samym `sid` = ten sam kod i bez nowego wiersza; G8 bez `sid` = nowa sesja i nowy kod przy każdym renderze. Zapis czeka najwyżej `ISSUE_TIMEOUT_MS = 1500` ms; błąd → strona 200 bez kodu i `logger.warn`. Odpowiedź ma `Cache-Control: no-store` (strona dynamiczna). MVP nadal nie tworzy zamówienia |
| Loading | n/d (dane z G7) |
| Empty | n/d |
| Error | nieznane wino → komunikat + Back to menu |
| Success | ekran sam w sobie |
| Walidacje | `serving=glass` tylko dla wina z ceną kieliszka |
| Permissions | publiczny |
| API | brak (produkcja: opcjonalnie `POST /public/selections` dla analityki konwersji) |
| Analytics | `wine_selected {wineId, serving, dishId, context, dishIds, people?}` (zapis serwera, E02 F2; zastępuje `selection_shown_to_waiter`; `people` — E08 F4, tylko ze stolika z wybraną liczbą osób); wino nieaktywne — brak |

## G9 Staff lookup — `/r/{slug}/staff?dish=`

| Pole | Opis |
|---|---|
| Cel | Szybka podpowiedź dla kelnera przy stoliku |
| Użytkownik | Kelner |
| Funkcje | przełącznik „One dish / Whole table” (link do G11 z preferencjami i `lang`, E08 R7); **„Order from a code” / „Zamówienie z kodu”** (E09 F2, spec `2026-10-16-recommendation-code` R6, R7): wpisanie kodu z ekranu gościa (G8) lub z G11, podgląd polecenia, „Ordered” / „Zamówione” i „Undo” / „Cofnij”; wybór dania (select); filtry kieliszek / styl / budżet; lista 2–4 win |
| Komponenty UI | sekcja „Order from a code” pod wyjaśnieniem, nad wyborem dania: formularz GET (pole `code` z etykietą „Code from the guest’s screen” / „Kod z ekranu gościa”, max 16 znaków, ukryte `sid` i jawne `lang`, przycisk „Find” / „Znajdź”); po znalezieniu karta polecenia: producent i wino (serif), „no. {n}”, porcja i cena („1 bottle, 750 ml, 390 zł”), „Dish: …” / „For the table: a, b, c” (dania w kolejności menu) / „Chosen without a dish”, danie spoza bieżącej karty — „Dish not on the current menu” / „Danie spoza obecnej karty”, wino usunięte — „Wine no longer on the list”, „Code W7K, shown at 19:30” (czas `Europe/Warsaw`, `formatServiceTime`); jeden formularz POST: „Ordered” (przycisk główny) albo „Marked at 19:42” / „Oznaczone o 19:42” + „Undo”. Komunikat `role="status"` po przekierowaniu („Marked as ordered.” / „Mark removed.”) albo jedno zdanie „There is no code W7K today in this restaurant. Check the characters on the guest’s screen.” / „Nie ma dziś kodu W7K w tej restauracji. Sprawdź znaki z ekranu gościa.”. Wiersze win: numer i nazwa, „List no.”, odznaki („Sommelier’s pairing · first choice”, „Sommelier’s pairing”, „Best value”, „{n}% match”), „Say: …”, cena |
| Dane wejściowe | menu, preferencje; `code` (dowolna pisownia: małe litery, spacje, `-`, `#`, prefiks `kod`/`code`); po akcji `marked=confirmed|undone` albo `codeError=not_found` (inne wartości ignorowane) |
| Dane wyjściowe | akcja serwerowa `markCode` (`staff/actions.ts`, pola `slug`, `code`, `intent=confirm|undo`, `sid`, `lang`): komenda `RecommendationCodeService.confirm` / `undo` z `actor: 'staff_view'` (`confirmed_by`); „Ordered” idempotentne (`COALESCE(confirmed_at, …)` — drugie kliknięcie nie zmienia czasu), „Undo” zeruje `confirmed_at`; tylko kod bieżącego dnia serwisu tej restauracji; przekierowanie 303 na `/r/{slug}/staff?code=…&marked=…|codeError=not_found&lang=…&sid=…` (adres z zaufanych części), `revalidatePath(…, 'layout')` |
| Loading | skeleton 3 wierszy |
| Empty | „Nothing fits. Relax the budget or colour.” |
| Error | jak G3; kod nieznany, innej restauracji, z innego dnia serwisu (po 04:00) i w złym formacie — to samo zdanie i ten sam status 200, bez śladu, że kod istniał (R6, bez wyroczni); POST z takim kodem → `codeError=not_found`, stan bez zmian |
| Success | n/d; po „Ordered” karta pokazuje „Marked at …” i „Undo” |
| Walidacje | jak G3; `code` przez `normalizeCode` (zły format nie pyta bazy); formularz akcji przez `codeActionSchema` (`strictObject`; slug wzorca sluga, inaczej przekierowanie na `/`) |
| Permissions | publiczny w MVP (D03); oznaczanie kodu też publiczne (E09 Q8, zatwierdzone): sprawdzeniem jest ważność kodu w restauracji ze sluga, nie sesja; akcja odrzuca `Sec-Fetch-Site: cross-site` (bez zmiany stanu, przekierowanie bez wyniku), a Next.js — obcy `Origin`. Produkcja: PIN zespołu (osobna spec) |
| API | `GET /dishes/{id}/recommendations`; oznaczenie kodu to akcja serwerowa, nie `/api/v1` |
| Analytics | `staff_lookup {dishId, source: 'staff', prefs, wineIds}` przy jawnym `dish=` (zapis serwera, E02 F3; sesja kelnera bez `guest_session_started`); `staff_filter_changed` — planowane (JS); oznaczenie kodu nie jest zdarzeniem (stan w `recommendation_code.confirmed_at`) |
| Wyjaśnienie | „Why this order?” / „Skąd ta kolejność?” (`data-explain="staff"`) pod leadem, nad sekcją kodu i wyborem dania: kolejność jak u gościa (pierwszy wybór sommeliera, pozostałe jego pary, potem wina według zasad od `minModelScore`% — tylko przy „Fill empty places…”), najwyżej `dishLimit` win; procent to ocena dopasowania, para sommeliera nie dostaje wyższego, kelner widzi go zawsze; „Say:” to notatka sommeliera albo uzasadnienie z zasad; filtry jak u gościa; ostatni punkt (E09 F2): „Order from a code” oznacza wino gościa jako zamówione (z cofnięciem), działają tylko dzisiejsze kody |

## G11 Whole table (waiter) — `/r/{slug}/staff/table`

Spec `2026-10-16-whole-table-waiter-path` (E08 faza 2, R5–R7, R11, R13). Telefon kelnera przy stoliku na kilka osób: zaznacza dania, jeden przycisk, odpowiedź w jednym zdaniu z numerem z karty win. Publiczny jak G9 (D03), działa bez JavaScriptu.

| Pole | Opis |
|---|---|
| Cel | Jedna butelka dla całego stolika, ze zdaniem do powiedzenia gościom („pasuje do n z m, słabiej do …”) |
| Użytkownik | Kelner (zakładka `/staff/table` w telefonie; G0 nie wybiera trybu za niego — link „For staff” prowadzi na G9) |
| Funkcje | przełącznik „One dish / Whole table” / „Jedno danie / Cały stolik” (linki do G9 i G11, `aria-current`, preferencje i `lang` zachowane; ten sam `ModeSwitch` co G1/G5); formularz GET na G11: kafle dań (`TableDishPicker`, wspólny z G5 — tu wariant `tiles`: siatka 2 kolumn `minmax(0,1fr)`, kafel = cały `<label>` z checkboxem `dish`, ≥ 48 px, sama nazwa, stan przez `has-[input:checked]`), wiersz kotwic sekcji karty (linki `#table-cat-…`, przyklejony pod paskiem, sekcje `scroll-mt-32`), desery na końcu z dopiskiem „paired separately” / „liczone osobno”, „Budget per bottle” (radio: dowolny + 200/300/400 zł), „Colour” w zwiniętym `<details>`, przyklejony przycisk „Show the bottle” / „Pokaż butelkę” z licznikiem `SelectionCount` (JS); pole „Find a dish” / „Szukaj dania” tylko z JS (filtruje kafle po nazwie bez znaków diakrytycznych, zaznaczenie zostaje, bez JS go nie ma); „How many people are drinking wine?” / „Ile osób pije wino?” pod kaflami (E08 F4: radio `people` jak na G5 — „Skip” domyślnie, 2–8, „8+”). Zaznaczenie 4 dań i „Show the bottle” = 5 dotknięć do wyniku (bez przewijania karty) |
| Wynik (≥ 2 opublikowane dania, nad formularzem) | (0) komunikat „We worked out the first 12 dishes.” / „Policzyliśmy pierwsze 12 dań.” przy ponad 12 daniach (kolejność karty) i komunikat budżetu, gdy budżet wykluczył wszystkie butelki (`relaxBudget`); (1) „This bottle: No. 109 Radikon Slatnik.” / „Ta butelka: nr 109 Radikon Slatnik.” (bez „No.”, gdy wino nie ma numeru), cena butelki, obok kod polecenia (E09, wariant kompaktowy); (2) linia dopasowania (`TableFitLine`, R12) pogrubiona — zdanie dla stolika, bez „Say: …”; (3) dania z paskiem i procentem surowego wyniku silnika (`engineScore`), pieczęć tylko przy parze sommeliera; (3a) ilość (E08 F4): po wyborze liczby osób linia „For 6 people: 3 bottles · 960 zł” dla butelki z (1), bez wyboru podpowiedź i **bez ilości** (Q4); pod nią „How many people are drinking wine?” / „Ile osób pije wino?” — linki 2–8 (`prefetch={false}`, bo strona wydaje kod), zachowują stół i `wine`; (4) do 2 alternatyw w jednym wierszu: numer, nazwa, „{fits} of {of}” / „{fits} z {of}”, cena, link „Choose this one” / „Wybierz tę” (`prefetch={false}`) na G11 z tym samym stołem i `wine={id}` — wybrana staje się butelką z (1)–(3), pozostałe zostają alternatywami w kolejności silnika (`pickTableItem`); `wine` spoza wyniku jest ignorowany; (5) „Or by the glass, dish by dish” przy `splitSuggested` silnika (tekst, bez linków na ekrany gościa); (6) desery liczone osobno. Pod spodem „Change the table” (formularz z zachowanym wyborem) i „New table” (czyści) |
| Dane wejściowe | `dish` (powtarzany) / `dishes`, `wine`, `people` (F4), `styles`, `maxPrice`, `lang`, `sid`; `weight`, `mood` przechodzą dalej; `serving` jest ignorowany (zawsze butelka) |
| Dane wyjściowe | kod polecenia (E09): jeden na wynik, dla butelki z (1), `source: 'staff'`, kontekst `table`, przy renderze; alternatywa dostaje kod dopiero po „Choose this one”; limit `MAX_STAFF_CODES_PER_SESSION_DAY` (300); bez kodu (limit, błąd, ruch własny) — „No code for this one — order as usual.” / „Bez kodu — zamów jak zwykle.” |
| Loading | brak (render serwera) |
| Empty | menu bez dań — „No dishes on the menu” (jak G9); kolor bez butelki — „Nothing fits” / „Nic nie pasuje” w miejscu wyniku |
| Error | jedno danie albo identyfikatory spoza opublikowanego menu (`table_needs_two_dishes` przez `isDomainError`) — „Tick at least two dishes.” / „Zaznacz co najmniej dwa dania.” nad formularzem, bez zdarzenia; nieznana restauracja — 404 |
| Success | n/d |
| Walidacje | jak G5/G6 (`parseDishIds`, najwyżej 12 dań w obliczeniu) |
| Permissions | publiczny w MVP (D03), jak G9 |
| API | `RecommendationService.forTable(…, { relaxBudget: true })`; `/api/v1` bez zmian |
| Analytics | `staff_table_lookup` (katalog wyżej): przy ≥ 2 opublikowanych daniach, także przy pustym wyniku; kolejne „Choose this one” to kolejne zdarzenie z `pickedWineId`; sesja kelnera bez `guest_session_started` |
| Wyjaśnienie | „How is the table bottle chosen?” / „Jak wybieramy butelkę do stolika?” (`data-explain="staffTable"`), jedno na ekranie, pod wynikiem i nad formularzem: ocena per danie, wynik stołu = średnia (`tableMeanWeight`, dania główne ×`tableMainsWeight`) i najsłabsze danie (`tableMinWeight`); „pasuje” = co najmniej `tableFitThreshold`%, odrzucona para nigdy; desery osobno; pieczęć i +`tableSommelierBonus` pkt do wyniku stołu (nie do procentu przy daniu), odrzucona najwyżej `tableRejectedCap`%; kieliszki poniżej `compromiseThreshold`/`weakDishThreshold`; ilość ok. `tableMlPerPerson` ml na osobę, jeśli wszyscy piją to samo wino, najwyżej `tableMaxExtraGlasses` kieliszki zamiast kolejnej butelki, dopiero po wyborze liczby osób (F4). Liczby z `ENGINE_FACTS`, bez „AI” i bez obietnicy pierwszeństwa w kolejności |
| Układ | 390 px: jedna kolumna, kafle w 2 kolumnach, bez poziomego przewijania; ≥ 1024 px: kolumna do 720 px, przycisk pod formularzem (nie przyklejony) |

## G12 How we pick your wine — `/r/{slug}/how-it-works`

Spec `2026-10-16-how-it-works-explanations` (faza 2, R9). Dłuższa, spokojna wersja wyjaśnień — strona, którą można wysłać sceptycznemu gościowi albo właścicielowi; wyjaśnienia na ekranach są samowystarczalne i do niej nie odsyłają.

| Pole | Opis |
|---|---|
| Cel | Wyjaśnić prostym językiem, skąd biorą się wina na liście, i zbudować zaufanie (sommelier ma ostatnie słowo, nikt nie płaci za miejsce) |
| Użytkownik | Gość (także osoba, której gość przesłał link) |
| Funkcje | „Back” w top barze i przycisk „Back to the menu” / „Wróć do menu” → G0 (z preferencjami, `lang` i `sid`); przełącznik języka |
| Komponenty UI | top bar (nazwa restauracji); `h1` „How we pick your wine” / „Jak dobieramy wino”, lead z nazwą restauracji; sekcje `h2` (`data-section`): „Only from {restaurant}’s list” (`dishLimit`), „The sommelier has the last word” (para sommeliera zawsze pierwsza na liście dania; odrzucone wino nie pojawia się przy daniu, przy stole tylko mocno obniża wynik), „Pairing rules” / „Zasady łączenia wina z jedzeniem” (tylko przy „Fill empty places…”: od `minModelScore`% albo „tylko dobrze pasujące” bez procentów; sześć najważniejszych zasad listą; te same dane — ten sam wynik), „What the percentage means” (0–`maxScore`%) albo „What the glass means” przy `showScores = false`, „The whole table” (średnia z daniami głównymi ×`tableMainsWeight` i najsłabsze danie, cała karta, desery osobno, kieliszki przy kompromisie), „Your choices” (filtry twarde i miękkie, budżet), „Fair to you” (cena nie podnosi oceny, producenci nie płacą, bez konta); ≤ 350 słów w każdym wariancie; bez słów „AI”, „engine”, „algorithm” |
| Dane wejściowe | `slug`; restauracja z opublikowanej migawki (`catalogService.publishedMenu`); ustawienia `showScores` / `showUnreviewed` bieżące (jak G3); liczby z `ENGINE_FACTS`; pusty Wine Director → „the restaurant’s sommelier” / „sommelier restauracji” |
| Dane wyjściowe | brak |
| Loading | n/d (strona serwerowa) |
| Empty | restauracja bez opublikowanych dań — strona działa (bez przykładów z menu) |
| Error | nieznany slug → 404 „This menu isn’t available” |
| Success | n/d |
| Walidacje | jak G0 |
| Permissions | publiczny |
| API | brak (dane przez serwis po stronie serwera) |
| Analytics | `explainer_viewed` (zapis serwera, E07 Q9); bez `sid` — także `guest_session_started {source: link}` |
| Wyjaśnienie | brak „i” — strona sama jest wyjaśnieniem; działa bez JavaScriptu |

---

# Restaurant / Sommelier dashboard (desktop-first)

## A0 Login — `/admin/login?next=`

| Pole | Opis |
|---|---|
| Cel | Bezpieczne wejście do panelu |
| Użytkownik | Sommelier, GM |
| Funkcje | e-mail, hasło; (mockup: wybór konta demo); „Sign in”; przekierowanie na `next` |
| Komponenty UI | podział 50/50: panel marki w bordo z hasłem produktu, formularz |
| Dane wejściowe | email, password |
| Dane wyjściowe | sesja (cookie httpOnly), rola |
| Loading | przycisk w stanie „Signing in…” (produkcja) |
| Empty | n/d |
| Error | „Enter a valid work email.”, „Password must be at least 6 characters.”, produkcja: „Email or password is incorrect.”; blokada po 5 próbach |
| Success | przekierowanie |
| Walidacje | format e-mail; hasło min. 6 (produkcja: polityka haseł + opcjonalne 2FA) |
| Permissions | publiczny |
| API | `POST /auth/login`, `POST /auth/logout` |
| Analytics | `staff_login {role}`, `staff_logout` |

## A1 Dashboard — `/admin`

| Pole | Opis |
|---|---|
| Cel | Odpowiedzieć na pytanie „czy Wine Match zwiększa sprzedaż wina?” i wskazać, co wymaga uwagi |
| Użytkownik | GM, Sommelier |
| Funkcje | baner kolejki review → A7; link Guest view; wiersze tabeli „Pairing performance” → A6 |
| Komponenty UI | 2 rzędy KPI (Wine attach rate wyróżniony; revenue per guest, avg bottle, avg glass; sessions, recommendations shown, conversion, revenue per table) z deltami; wykres liniowy sesji i wyborów; paski: najczęściej wyszukiwane dania, rekomendowane wina, wybierane wina; tabela skuteczności par (Sommelier / Engine, shown, chosen, conversion) |
| Wyjaśnienie | „What do these tiles count?” / „Co liczą te kafelki?” (`data-explain="dashboard"`) bezpośrednio nad kafelkami „Wine program”: dania prowadzone przez sommeliera, zatwierdzone pary (u gościa „Sommelier’s pairing”), propozycje silnika w kolejce — gość widzi je od `minModelScore`% jako „Recommended for your dish” przy „Fill empty places…”; ukryte wino nie trafia do gości |
| Dane wejściowe | okres (domyślnie 28 dni), eventy, dane sprzedaży |
| Dane wyjściowe | brak |
| Loading | skeleton kafelków KPI |
| Empty | „No guests have used Wine Match yet” + Get the QR code (Guest usage); „Upload a POS export to see attach rate” + Import sales (Sales, E04 F2) |
| Error | panel z „Analytics are temporarily unavailable. Pairings and guest app work normally.” |
| Success | n/d |
| Walidacje | KPI sprzedażowe ukryte, jeśli brak importu sprzedaży („Upload a POS export to see attach rate”) |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/analytics/summary?from=&to=`, `/analytics/timeseries`, `/analytics/pairings` |
| Analytics | `dashboard_viewed` (produkcja) |
| Guest usage (E04 F1) | Sekcja nad kafelkami „Wine program”, nagłówek `h2` „Guest usage” / „Korzystanie gości” i okno „Last 28 days · 17 Sep – 14 Oct 2026”. **Okno (R1):** 28 pełnych dni kalendarzowych do wczoraj w `Europe/Warsaw` (dzisiejszy niepełny dzień poza oknem), porównanie z 28 dniami bezpośrednio wcześniej; granice jako `[from, to)` w UTC od lokalnej północy, poprawne przy zmianie czasu. **Kafelki** (`grid sm:grid-cols-2 xl:grid-cols-4`): Guest sessions (R2: `session_id` z `guest_session_started` w oknie; zdarzenia sesji bez startu w oknie — kelner, ręcznie skopiowany `sid`, start przed oknem — nie wchodzą do żadnego KPI gości), Dish recommendations viewed (unikalne (sesja, danie) `recommendations_viewed`), Recommendation → selection (R3: sesje z widokiem i `wine_selected` z `context: 'dish'` / sesje z widokiem; ścieżka stolika poza; „N of M sessions · dish recommendations only”; mianownik 0 → „No data”), Waiter lookups (`staff_lookup` + `staff_table_lookup`, unikalne (sesja, danie lub zestaw dań stołu), osobno od gości). **Delta (R5, R6):** liczniki w % (zaokrąglone do całości), stawki w p.p. (0,1); „▲/▼ … vs previous 28 days” (strzałka `aria-hidden`, odczytywane „Up”/„Down”, bez kolorów znaczeniowych), „No change” (zaokrąglone do 0), „No comparison” (poprzednie 0 lub brak wartości), „Too few to compare” (mianownik stawki < 30 w którymkolwiek oknie). Liczby w języku panelu (`en-GB` / `pl-PL`). **Empty** (brak sesji gości w obu oknach): „No guests have used Wine Match yet” + „Get the QR code”, „Open the guest app”. **Error** (tylko ta sekcja): „Analytics are temporarily unavailable.” w `h2` (`ErrorMessage compact`), reszta A1 działa; przyczyna w logu (`analytics section failed`). Wyjaśnienie: drugie „i” A1 — „What do these figures count?” / „Co liczą te liczby?” (`data-explain="usage"`) w sekcji, tylko gdy są kafelki (jedno „i” na kartę/sekcję; E07 przekazało je E04). Dane: `AnalyticsService.usageSummary` (`core`), port `GuestInteractionRepository.usageTotals`. Bez `dashboard_viewed` |
| Sales (E04 F2) | Pierwsza sekcja pod banerem review, nad „Guest usage”: nagłówek `h2` „Sales” / „Sprzedaż” i okno jak w „Guest usage” (te same 28 pełnych dni do wczoraj w `Europe/Warsaw`, porównanie z 28 dniami wcześniej, Q3). Dane: sprzedaż z POS (E03, aktywne linie `sales_record`, dni biznesowe okna) — `AnalyticsService.salesSummary` woła `SalesKpiService.getSalesKpis` raz na okno i `dataRange`. **Kafelki** (`grid sm:grid-cols-2 xl:grid-cols-3`): **Wine attach rate** wyróżniony (`lead`; przy 1440 px dwa rzędy wysokości, przy `sm` cała szerokość) — rachunki z jedzeniem i winem / rachunki z jedzeniem (per rachunek, E03 Q7), „N of M checks with food” / „N z M rachunków z jedzeniem” (R7), delta w p.p.; „Too few to compare” przy < 30 rachunkach z jedzeniem w którymkolwiek oknie; brak rachunków z jedzeniem → „No data”. Obok: Wine revenue per guest, Wine revenue per table, Average bottle, Average glass (netto, `formatPrice`), delta w %, `null` → „No data”, brak danych w poprzednim oknie → „No comparison”. **R4:** żaden wskaźnik nie dzieli sesji gości (E02) ani kodów „ordered” (E09) przez rachunki (E03). **Okno zaimportowane częściowo** (ostatni dzień danych < koniec okna): kafelki + „Sales data through 9 Oct 2026”. **Empty** (brak sprzedaży w bieżącym oknie, także gdy jest tylko w poprzednim): `EmptyState` „Upload a POS export to see attach rate” + „Import sales” → A13 (tylko z `import.manage`; bez — „Someone with import access can upload it.”) i „Latest sales data: 2 Sep 2026.”, gdy cokolwiek zaimportowano. **Error** (tylko ta sekcja): „Analytics are temporarily unavailable.” w `h2`, przyczyna w logu (`section: 'sales'`). Wyjaśnienie: „How are sales counted?” / „Jak liczymy sprzedaż?” (`data-explain="sales-kpis"`), tylko przy kafelkach |
| Pairing performance (E04 F3) | Osobna sekcja pełnej szerokości pod kartą „Needs your attention”, nagłówek `h2` „Pairing performance” / „Skuteczność par” i okno jak w „Guest usage” (tylko bieżące 28 dni, bez delty). **Wiersz** = (danie, wino, źródło): **źródło (R8)** z `props.items[].tier` ostatniego w oknie `recommendations_viewed` sesji dla dania, którego `items` zawiera wino (`sommelier_primary`/`sommelier` → Sommelier, `engine` → Engine), nie z dzisiejszego statusu pary — para odrzucona dziś, ale pokazana w oknie jako Sommelier, ma wiersz Sommelier; para pokazana jako Engine i potem jako Sommelier ma dwa wiersze (każda sesja w jednym). **Shown** = sesje gości (R2) z takim widokiem; **Chosen** = spośród nich sesje z `wine_selected` (`context: 'dish'`) dla tego samego dania i wina (bez wymogu kolejności); **Conversion** = Chosen / Shown (`46.0%`); ścieżka stolika i kelner poza; zdarzenia bez tablicy `items` pominięte. Do wierszy z wyświetleniami dochodzą pary `approved`/`modified` opublikowanej migawki bez żadnego wiersza (danie, wino), tylko dla dania `published` i aktywnego wina — Shown 0, Chosen 0, Conversion „No views” / „Bez wyświetleń” (nie 0%). **Match** = `pairingScore(dish, wine).score` (wynik silnika bez preferencji gościa, `ScoreBadge`). **Kolumny:** Dish (link do A6 `/admin/{slug}/pairings/{dishId}`), Wine (nazwa, rocznik, producent), Source (`Badge`), Match, Shown, Chosen, Conversion; tabela przewija się w swoim kontenerze (390 px bez poziomego przewijania strony). **Kolejność:** Shown ↓, Chosen ↓, nazwa dania, źródło (Sommelier pierwsze), nazwa wina. **Limit (Q11):** 10 wierszy i „Show all N pairings” → `?pairs=all` (wszystkie, „Show top 10” wraca); inna wartość `pairs` = 10. Wiersze z daniem lub winem usuniętym z katalogu pominięte, pod tabelą „N pairings hidden: the dish or wine was removed.”. **Empty** (0 wierszy): „No pairings to measure yet” + „Review suggestions” → A7. **Error** (tylko ta sekcja): „Analytics are temporarily unavailable.” w `h2`, przyczyna w logu (`section: 'pairings'`). Wyjaśnienie: trzecie „i” A1 — „What does this table count?” / „Co liczy ta tabela?” (`data-explain="performance"`), tylko przy tabeli. Dane: `AnalyticsService.pairingPerformance` (`core`), port `GuestInteractionRepository.pairingStats` (z tego samego odczytu korzysta E10 S4) |
| Okazje (E10 F2) | w karcie „Needs your attention” jedna linia „Opportunities: n” / „Okazje: n” z linkiem „Open opportunities” → A14, gdy n > 0 (S1–S3 całej karty, bez zapytań po zdarzeniach gości); bez licznika w nawigacji i bez drugiego „i”. „Nothing to review” pokazuje się tylko przy n = 0 |

## A2 Menu — `/admin/menu?q=&cat=`

| Pole | Opis |
|---|---|
| Cel | Przegląd dań, ich statusu i pokrycia pairingami |
| Użytkownik | Sommelier, GM |
| Funkcje | wyszukiwanie (debounce 350 ms), filtr kategorii, wiersz → A3, „Import menu” → A8 |
| Komponenty UI | tabela: nazwa + opis, kategoria, cena, status (Published / Draft / Hidden), profil (Confirmed / Draft, needs check), pairingi (reviewed / to review) |
| Wyjaśnienie | „How does a taste profile affect pairings?” / „Jak profil smaku wpływa na pary?” (`data-explain="menu"`) pod nagłówkiem strony (poza `<p>` opisu), nad filtrami: profil smaku (skale 0–5, główny składnik, technika) to jedyne dane dania dla silnika; profil „Draft” pochodzi z importu i wymaga sprawdzenia |
| Dane wejściowe | dishes, pairings |
| Dane wyjściowe | nawigacja |
| Loading | skeleton 8 wierszy |
| Empty | „No dishes found” + Import menu; przy filtrze: „Try another search or category.” |
| Error | „The menu didn’t load. Try again.” |
| Success | n/d |
| Walidacje | n/d |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/dishes?q=&category=` |
| Analytics | brak (produkcja: `admin_search`) |

## A3 Dish details — `/admin/menu/{dishId}`

| Pole | Opis |
|---|---|
| Cel | Edycja dania i potwierdzenie jego profilu smakowego |
| Użytkownik | Sommelier |
| Funkcje | edycja pól; suwaki profilu 0–5; główny składnik; metoda; podgląd „Top matches with this profile” na żywo; „Save and update suggestions”; „Manage pairings” → A6; „View as guest”; **„Translations / Tłumaczenia”** (od 2026-10-15): kolumny Polski i English z polami Name i Description (placeholder = tekst bazowy, puste pole = tekst bazowy), „Save translations”, flash „Translations saved. Guests see them after you publish.”; konflikt wersji (ktoś zmienił tłumaczenia) → komunikat `version_conflict`; za długi tekst → „Check the translations…”. Zapis: akcja serwerowa → `TranslationService.setDishTranslations` (uprawnienie `import.manage`), zmiana liczy się do „Publish”. Role bez `import.manage` widzą pola tylko do odczytu |
| Komponenty UI | panel Details (formularz 2-kolumnowy), panel podglądu (top 5 win z % i uzasadnieniem), panel Taste profile (siatka suwaków z wartością) |
| Wyjaśnienie | „How does the engine score a pairing?” / „Jak silnik liczy ocenę?” (`data-explain="score"`, wspólne z A5) w nagłówku karty „Top matches”: start od `baseScore`, reguły sommelierskie, skala 0–`maxScore`, te same profile dają tę samą ocenę, gość widzi propozycję silnika od `minModelScore`%, zatwierdzenie zmienia miejsce, nie ocenę |
| Dane wejściowe | Dish, DishProfile, wines |
| Dane wyjściowe | zaktualizowany Dish i DishProfile (`source: confirmed`); przeliczone pairingi |
| Loading | skeleton formularza |
| Empty | n/d |
| Error | nieznane danie → „This dish does not exist” + Back to menu; błąd zapisu → komunikat nad przyciskiem, dane w formularzu zachowane |
| Success | toast „Dish saved. Suggestions updated.” |
| Walidacje | nazwa wymagana; cena > 0 |
| Permissions | Sommelier, GM (GM bez profilu — produkcja) |
| API | `GET /dishes/{id}`, `PATCH /dishes/{id}`, `PUT /dishes/{id}/profile`, `POST /engine/preview` (lokalnie w przeglądarce w mockupie) |
| Analytics | `dish_profile_saved {dishId}` |

## A4 Wine list — `/admin/wines?q=&style=`

| Pole | Opis |
|---|---|
| Cel | Przegląd karty win i szybka zmiana dostępności |
| Użytkownik | Sommelier |
| Funkcje | wyszukiwanie (producent, wino, region, szczep); filtr stylu; przełącznik Active w wierszu; wiersz → A5; „Import wine list” → A9 |
| Komponenty UI | tabela: producent + wino, rocznik, region + kraj, szczep, styl, serwowanie (Glass and bottle / Bottle only), cena kieliszka, cena butelki, Active |
| Wyjaśnienie | „What does hiding a wine do?” / „Co znaczy ukrycie wina?” (`data-explain="wines"`) pod nagłówkiem strony, nad filtrami: ukryte wino od razu znika z rekomendacji (także z par sommeliera), bez publikacji; „Show” przywraca je od razu |
| Dane wejściowe | wines |
| Dane wyjściowe | `active` |
| Loading | skeleton wierszy |
| Empty | „No wines found” + Import wine list |
| Error | przełącznik wraca do poprzedniego stanu + toast „Couldn’t update availability. Try again.” (produkcja) |
| Success | toast „{producer} hidden from guests.” / „is back on the list.” |
| Walidacje | n/d |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/wines`, `PATCH /wines/{id}` (`{active}`) |
| Analytics | `wine_availability_changed {wineId, active}` |

## A5 Wine details — `/admin/wines/{wineId}`

| Pole | Opis |
|---|---|
| Cel | Edycja wina, cen, serwowania i profilu |
| Użytkownik | Sommelier |
| Funkcje | producent, nazwa, ceny, „Poured by the glass”, „Available tonight”, nota; suwaki profilu; podgląd „Best dishes for this wine” na żywo; Save wine |
| Komponenty UI | jak A3 |
| Wyjaśnienie | jak A3 (`data-explain="score"`) w nagłówku karty „Best dishes” |
| Dane wejściowe | Wine, WineProfile |
| Dane wyjściowe | zaktualizowany Wine; przeliczone wyniki par z tym winem |
| Loading | skeleton formularza |
| Empty | n/d |
| Error | nieznane wino → „This wine does not exist” |
| Success | toast „Wine saved.” |
| Walidacje | producent i nazwa wymagane; cena butelki > 0; przy „Poured by the glass” cena kieliszka > 0 i < cena butelki |
| Permissions | Sommelier, GM |
| API | `GET /wines/{id}`, `PATCH /wines/{id}`, `PUT /wines/{id}/profile` |
| Analytics | `wine_saved {wineId}` |

## A6 Pairing management — `/admin/pairings/{dishId}`

| Pole | Opis |
|---|---|
| Cel | Pełna kontrola sommeliera nad parami danego dania |
| Użytkownik | Sommelier |
| Funkcje | lista dań z licznikami; **Approved for guests**: rola (Primary / Alternative / Best value), góra / dół, notatka dla gości (pole bazowe w języku treści oraz pola „Note in Polski” / „Note in English” — `comment_pl`, `comment_en`, każde ≤ 140 znaków; wiersz pokazuje notatkę w języku panelu), Reject, Delete (dla par ręcznych); **Engine suggestions**: Approve / Reject / Approve all; **Add your own pairing**: wino (z wynikiem silnika), rola, notatka; **Rejected**: Restore; **What guests see now** |
| Komponenty UI | układ 2-kolumnowy: lista dań (sticky) + panele; wiersz pary: pozycja (serif), wino, ceny, odznaki statusu i roli, wynik silnika, „Unpublished change”, notatka (italic) |
| Wyjaśnienie | dwa, po jednym na kartę: „How do guests see your pairings?” / „Jak gość widzi Twoje pary?” (`data-explain="pairings"`) w nagłówku „Approved for guests” — kolejność u gościa, najwyżej `dishLimit` win, procent = ocena silnika, notatka zastępuje uzasadnienie, odrzucona para nie pojawia się przy daniu (przy „Whole table” tylko obniża wynik dania do `tableRejectedCap` w rankingu butelek), filtry gościa mogą ukryć parę podstawową, „Best value” (`bestValueWindow`); kompaktowe „i” (`data-explain="suggestions"`, nazwa `sr-only`) przy tytule „Engine suggestions” — jak gość widzi nieprzejrzane propozycje i co robi Approve / Reject |
| Dane wejściowe | Dish, pairings, wines |
| Dane wyjściowe | Pairing (status, role, rank, comment), SommelierDecision |
| Loading | skeleton paneli |
| Empty | brak dań → Import menu; brak zatwierdzonych → „No approved pairings yet. Approve an engine suggestion below, or add your own pairing.”; brak propozycji → „All suggestions reviewed” |
| Error | konflikt wersji → „This pairing was changed by {name} a moment ago. Reload to see the latest.” (produkcja) |
| Success | toasty: „Pairing approved.”, „Pairing rejected. It won’t be recommended with this dish.”, „Role updated.”, „Note saved.”, „Pairing added.”, „Pairing deleted.” |
| Walidacje | dokładnie jeden Primary na danie (ustawienie nowego degraduje poprzedni); notatka ≤ 140 znaków; wino wymagane przy dodawaniu; nie można dodać wina, które ma już decyzję |
| Permissions | decyzje: Sommelier; GM podgląd |
| API | `GET /dishes/{id}/pairings`, `POST /pairings`, `PATCH /pairings/{id}`, `DELETE /pairings/{id}`, `POST /pairings/{id}/decisions`, `PUT /dishes/{id}/pairings/order`, `GET /dishes/{id}/recommendations?preview=true` |
| Analytics | `pairing_status_changed`, `pairing_role_changed`, `pairing_added`, `pairing_deleted` |
| Okazje (E10 F2) | karta „Opportunities for this dish” / „Okazje dla tego dania” **nad** „Approved for guests”, tylko gdy danie ma okazje S1–S3 (gdy nie ma — karty nie ma). Nagłówek: link „All opportunities” → A14, opis, własne „i” „What are opportunities?” (`data-explain="opportunities"`, ten sam tekst co A14; jedno „i” na kartę). Wiersz: odznaka „Opportunity”, jedno zdanie z liczbami, „Add to suggestions” (S2, S3) i „Ignore”; S1 tylko „Ignore”. Po „Add” wino trafia do „Engine suggestions” na tej samej stronie (flash „Added to suggestions — approve it in “Engine suggestions”…”), bez wpisu historii i bez „Unpublished change”. GM widzi kartę bez przycisków. Bez S4/S5 (tylko A14). Każdy wiersz „Approved for guests” ma kotwicę `id="pairing-{pairingId}"` — cel linku „Open pairings” z okazji S4 w A14 (E10 F3) |

## A7 Pairing review — `/admin/review`

| Pole | Opis |
|---|---|
| Cel | Szybko przejrzeć wszystkie propozycje silnika |
| Użytkownik | Sommelier |
| Funkcje | Approve / Reject per propozycja; Approve all for this dish; Approve all N (→ A11); Open pairings → A6 |
| Komponenty UI | pasek postępu (dania z ≥ 1 zatwierdzoną parą); grupy per danie z informacją „no primary pick yet”; wiersz: wino, uzasadnienie z reguł, wynik |
| Wyjaśnienie | „What does approving do?” / „Co daje zatwierdzenie?” (`data-explain="review"`) pod paskiem postępu: zatwierdzona para po publikacji ma etykietę „Sommelier’s pairing” i stoi przed propozycjami silnika; odrzucona nie jest polecana do dania (przy „Whole table” obniża wynik do `tableRejectedCap`); nieprzejrzane — od `minModelScore`% jako „Recommended for your dish” przy „Fill empty places…” |
| Dane wejściowe | pairings `suggested` |
| Dane wyjściowe | decyzje |
| Loading | skeleton grup |
| Empty | „Everything is reviewed” + Go to publish |
| Error | jak A6 |
| Success | toasty z liczbą zatwierdzonych |
| Walidacje | pierwsza zatwierdzona para dania bez Primary staje się Primary |
| Permissions | Sommelier |
| API | `GET /restaurants/{id}/pairings?status=suggested`, `POST /restaurants/{id}/pairings/bulk-decision` |
| Analytics | `pairing_status_changed`, `pairing_role_changed` |

## A8 Import menu — `/admin/import/menu?step=`

| Pole | Opis |
|---|---|
| Cel | Wczytać menu z pliku bez ręcznego przepisywania |
| Użytkownik | Sommelier, GM |
| Funkcje | krok 1: upload (drag & drop / wybór), „Use sample file”, „Download CSV template”, podpowiedź o kolumnach tłumaczeń (`_pl` / `_en`); krok 2: edycja komórek (kolumny tłumaczeń z pliku są pokazane obok bazowych; pusta komórka tłumaczenia → ostrzeżenie „Empty translation: the current one is kept.”), odznaczanie wierszy, kolumna Drafted profile, kolumna Checks, Start over, Import selected dishes; krok 3: linki do Review i Menu |
| Komponenty UI | stepper 3 kroków; strefa upuszczania; tabela edytowalna; baner podsumowania |
| Dane wejściowe | plik CSV / XLSX / PDF ≤ 10 MB |
| Dane wyjściowe | ImportJob, Dish[] (`draft`), DishProfile[] (`draft`), Pairing[] (`suggested`) |
| Loading | po uploadzie: „Reading {file}…” z paskiem postępu parsowania (produkcja; PDF/OCR asynchronicznie z odpytywaniem statusu) |
| Empty | plik bez wierszy → komunikat walidacji |
| Error | zły format, za duży plik, brak wierszy, wiersz bez nazwy / ceny („Row 5: add a name and a price, or untick it.”), brak zaznaczonych wierszy |
| Success | krok 3 „{n} dishes imported” |
| Walidacje | rozszerzenia csv/xlsx/xls/pdf; ≤ 10 MB; nazwa i cena > 0 dla importowanych wierszy; separator `,` lub `;` |
| Permissions | Sommelier, GM |
| API | `POST /imports/menu` (multipart), `GET /imports/{id}`, `PATCH /imports/{id}/rows`, `POST /imports/{id}/confirm`, `DELETE /imports/{id}` |
| Analytics | `import_file_parsed {kind, rows, format}`, `import_confirmed {kind, count}` |

## A9 Import wine list — `/admin/import/wines?step=`

Jak A8, z różnicami:

| Pole | Opis |
|---|---|
| Dane wejściowe | kolumny: producer, wine, vintage, region, grape, style, glass price, bottle price; opcjonalnie `tasting_note_pl/_en`, `region_pl/_en`, `country_pl/_en` |
| Dane wyjściowe | Wine[] (`active`), WineProfile[] (domyślne szczepu i stylu), nowe Pairing[] dla wszystkich dań |
| Walidacje | producent i cena butelki wymagane; brak szczepu → ostrzeżenie (nie blokuje); rocznik 4 cyfry lub NV |
| API | `POST /imports/wines`, pozostałe jak A8 |

## A13 Import sales — `/admin/{slug}/import/sales?job=`

Spec `2026-10-15-pos-sales-import-attach-rate` (E03), fazy 1 i 2. Nawigacja: „Import sales” / „Import sprzedaży” pod „Import wines”. Uprawnienie `import.manage` (Owner, GM, Sommelier); bez niego „View only” bez formularzy. Działa bez JavaScriptu (strona poza `(lists)/`, `force-dynamic`), 390 px i 1440 px bez poziomego przewijania.

| Pole | Opis |
|---|---|
| Cel | GM wgrywa eksport pozycji rachunków z POS i sprawdza go, zanim cokolwiek zostanie zapisane |
| Wyjaśnienie | jedno `PanelExplain` „How is the file counted?” / „Jak liczony jest plik?” pod nagłówkiem (`admin.explain.sales`; to nie silnik, więc bez `ENGINE_FACTS` — jedyna liczba to limit wierszy z `IMPORT_LIMITS`) |
| Upload | CSV albo XLSX (bez PDF), do 10 MB i 2000 wierszy; podpowiedź „Export item lines from your POS… Use the business day column, not a time stamp. Split large files by whole days. Guest names and card data are not needed — such columns are ignored.”; link do `/api/v1/import-samples/sales` |
| Dane wejściowe | kolumny (nagłówki PL/EN, tylko dokładnie): data (dzień biznesowy), numer rachunku, typ/kategoria, ilość, kwota netto — wymagane; goście, pozycja — opcjonalne. Brak wymaganej → komunikat „Could not find the columns: net amount.” |
| Podgląd | karta „What this file will save”: zakres dat, liczba pełnych rachunków, linie per typ, rachunki niepełne (pominięte), „N checks already saved for these dates will be replaced”, Wine Attach Rate pliku („75,0%”, „3 of 4 checks with food had wine”); sekcja „Unrecognised categories” — jedna wartość = jeden select z 4 typami (`typemap_<i>_from/_to`, `valueMap`); tabela: Date, Check, Guests, Type (select; nierozpoznana wartość zostaje wybrana jako „… (choose a type)”), Item, Qty, Net (zł); notatki (niewykorzystane kolumny, brak gości, kolejność dzień/miesiąc, powtarzające się numery) |
| Walidacje | brak daty/rachunku/typu/ilości/kwoty → błąd; data z godziną → „Use the business day column, not a time stamp.”; data > jutro → błąd; `13/04` i `04/13` w jednym pliku → błędy dat; ilość 0, \|kwota\| > 100 000 → błąd; nierozpoznana kategoria → błąd `unmapped_category`; „Wino” → butelka + ostrzeżenie; zwrot → ostrzeżenie; linia rachunku z błędem lub odznaczona → pozostałe linie „Check incomplete…” (bez zmiany zaznaczenia) |
| Wynik | „Saved N lines, replaced M checks, skipped K”; karta z liczbami, „See Wine Attach Rate” (link do `#wine-attach-rate`) i „Import another file” |
| Dane wyjściowe | `sales_record` (tylko pełne rachunki; ten sam rachunek z nowszego pliku zastępuje stary) |
| Kod polecenia (E09 F3) | kolumna „Kod polecenia” / „Recommendation code” w podglądzie, gdy plik ma kolumnę „Uwagi” lub kod w pozycji; w karcie podglądu zdanie „N rachunków ma kod polecenia. M kodów nie pasuje do poleceń z tego dnia.” (`data-codes-note`); karta „Wino z polecenia” / „Wine from a recommendation” (`id="wine-from-recommendation"`) pod kartą Wine Attach Rate w tym samym okresie: „Zamówione: X z Y poleceń (kelner A, kasa B)” (każde polecenie raz), „Kody w kasie bez polecenia: N”; brak danych → `EmptyState`, zły okres → `ErrorMessage`. Sprawdzone bez JS na 390 px i 1440 px |
| API | `POST /imports/sales`, `PATCH /imports/{id}/rows` i `POST /imports/{id}/confirm` z opcjonalnym `valueMap`, `GET /import-samples/sales` |
| Karta „Wine Attach Rate” (faza 2) | pod krokiem uploadu (nie w podglądzie ani wyniku — podgląd ma własny wskaźnik pliku), `id="wine-attach-rate"`. Opis i „Imported sales: {od} – {do}.” (`SalesKpiService.dataRange`) albo „No sales imported yet.”. Formularz `GET` z polami `from` / `to` (`type=date`, dni biznesowe, obie granice włącznie) i „Show”; domyślnie 28 dni (`KPI_DAYS`) kończące się na ostatnim dniu z danymi, bez danych — ostatnie 28 pełnych dni w Warszawie (okno A1). Wynik `SalesKpiService.getSalesKpis`: „40.0%” / „40,0%” (1 miejsce po przecinku) + „4 of 10 checks with food had wine”, pod nim 4 KPI netto: przychód z wina na gościa (z liczbą gości), na stolik (z liczbą rachunków z jedzeniem), średnia butelka, średni kieliszek; brak wartości → „—” (`aria-label` „No data”). Brak linii w okresie → `EmptyState` „No data / No sales data for this period.”; same rachunki barowe → `EmptyState` „No checks with food in this period…” + KPI wina; zły okres (`invalid_period`: koniec przed początkiem, > 366 dni, nie data) → `ErrorMessage` „This period cannot be shown”, wpisane daty zostają w formularzu. Bez własnego „i” (definicję wskaźnika podaje wyjaśnienie ekranu). Bez JS; 390 px i 1440 px bez poziomego przewijania |

## A10 Setup checklist — `/admin/setup`

| Pole | Opis |
|---|---|
| Cel | Prowadzić nową restaurację od założenia do QR na stołach |
| Użytkownik | GM, Sommelier, System Admin |
| Funkcje | formularz Restaurant details (nazwa, publiczny link, adres, Wine Director); karta **„Content language and translations”** (od 2026-10-15): język tekstów bazowych (`contentLocale`: Polski / English, z ostrzeżeniem, że zmiana niczego nie tłumaczy) oraz hasło i miasto po polsku i angielsku, „Save” → flash „Content language and translations saved…” (uprawnienie `import.manage`); 8 kroków ze statusem i przyciskiem; „Regenerate suggestions”; „Reset demo data” (tylko mockup) |
| Komponenty UI | panel formularza; checklista (ikona statusu, tytuł, szczegół, akcja) |
| Dane wejściowe | Restaurant, liczniki danych |
| Dane wyjściowe | Restaurant; nowe propozycje |
| Loading | skeleton checklisty |
| Empty | nowa restauracja: wszystkie kroki „Start” |
| Error | „Public link: 2–40 lowercase letters, numbers or dashes.”; produkcja: „This link is taken.” |
| Success | „Details saved.”, „{n} suggestions ready for review.” |
| Walidacje | nazwa wymagana; slug `^[a-z0-9-]{2,40}$`, unikalny |
| Permissions | GM (slug), Sommelier (pozostałe) |
| API | `PATCH /restaurants/{id}`, `POST /restaurants/{id}/pairings/generate`, `GET /restaurants/{id}/setup-status` |
| Analytics | `pairings_regenerated {suggestions}` |

## A11 Publish — `/admin/publish`

| Pole | Opis |
|---|---|
| Cel | Świadomie opublikować zmiany dla gości |
| Użytkownik | Sommelier, GM |
| Funkcje | checklista „Before you publish” z przyciskami Fix / Review / Check; ustawienia gościa (Fill empty places with engine picks, Show match percentages); Preview guest app; Publish changes |
| Komponenty UI | checklista z ikonami ok / uwaga; przełączniki; pasek publikacji z liczbą zmian |
| Wyjaśnienie | „What do these settings change?” / „Co zmieniają te ustawienia?” (`data-explain="publish"`) w nagłówku karty „Guest settings”: „Fill empty places…” (od `minModelScore`%; wyłączone — przy winach do dania tylko pary sommeliera), butelka dla „Whole table” zawsze z całej aktywnej karty, „Show match percentages” (kieliszek bez liczby; na „Whole table” paski bez liczb — od E08 F3; ekran kelnera zawsze z procentem), działają od razu. Opis przełącznika „Fill empty places…” mówi, że stół nadal bierze całą kartę (Q4) |
| Dane wejściowe | liczniki zmian, stan danych |
| Dane wyjściowe | PublishedVersion; ustawienia |
| Loading | przycisk „Publishing…” (produkcja) |
| Empty | brak zmian → „Guests see the latest version”, przycisk nieaktywny |
| Error | „Publishing failed. Guests still see the previous version. Try again.” |
| Success | „Published {n} changes. Guests see them now.” |
| Walidacje | checklista informacyjna, nie blokuje |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/publish/preview`, `POST /restaurants/{id}/publish`, `PATCH /restaurants/{id}/settings` |
| Analytics | `restaurant_published {changes}`, `guest_setting_changed` |

## A12 QR generation — `/admin/qr`

| Pole | Opis |
|---|---|
| Cel | Przygotować materiały na stoły |
| Użytkownik | GM, Sommelier |
| Funkcje | podgląd stojaka (nazwa, zdanie, QR, adres); Copy link; Download SVG (druk); Download PNG (1024 px); Print table tent (tylko stojak); Open guest app |
| Komponenty UI | karta stojaka; panel linków |
| Dane wejściowe | slug |
| Dane wyjściowe | pliki SVG / PNG |
| Loading | skeleton kwadratu QR |
| Empty | restauracja nieopublikowana → ostrzeżenie „Publish first so guests don’t see an empty menu.” (produkcja) |
| Error | „The QR code could not be generated. Reload the page.” |
| Success | „Link copied.” |
| Walidacje | QR koduje stały adres `https://winematch.app/{slug}`; poziom korekcji błędów M |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/qr?format=svg|png` (produkcja; w mockupie generowane lokalnie biblioteką `qrcode`) |
| Analytics | `qr_downloaded {format}` |

## A14 Opportunities — `/admin/opportunities`

Spec `2026-10-16-sommelier-opportunities` (E10, D17), fazy 2, 3 (S4) i 4 (S5). Sygnały i progi: [RECOMMENDATION_ENGINE.md](RECOMMENDATION_ENGINE.md) §13.

| Pole | Opis |
|---|---|
| Cel | Pokazać sommelierowi, gdzie w karcie i parach warto zajrzeć („zobacz tutaj”, nie „ja wiem lepiej”) |
| Użytkownik | Sommelier (decyzje); GM, Owner (podgląd) |
| Funkcje | grupy per danie (kolejność: Przystawki, Dania główne, Desery, potem nazwa): nazwa dania, „Open pairings” → A6, „Current pairings:” (wino + rola w kolejności gościa; „none”, gdy brak), potem okazje; wiersz: odznaka „Opportunity”, jedno zdanie z liczbami, „Add to suggestions” (S2, S3; S5 bez pary), „Approve” (S5 z parą `suggested`), „Open pairings” (S4: link do wiersza pary Primary na A6, `#pairing-{id}`; widoczny też dla GM / Owner) i „Ignore”; `<details>` „Ignored (n)”: rodzaj okazji, danie i wino, autor, data powrotu, „Restore” |
| Zdania (EN / PL) | S1: „This dish has no approved pairing yet.” / „To danie nie ma jeszcze zatwierdzonego parowania.”; „…approved pairings, but none of them is the Primary.” / „…żadne nie jest podstawowe.”; „This dish’s Primary wine ({wine}) is hidden…” / „Wino podstawowe tego dania ({wine}) jest ukryte…”; S2: „{wine} matches this dish at {score}%, is served by the glass ({price}), and none of this dish’s pairings is available by the glass.”; S3: „{wine} is on your list but has no approved pairing. It matches “{dish}” best ({score}%).”; S4: „When guests saw {wine} with this dish ({shown} times in the last 28 days), they chose it {chosen} time(s) ({rate}%); they chose the other wines for this dish {otherRate}% of the time.” / „Gdy goście widzieli {wine} przy tym daniu ({shown} razy w ostatnich 28 dniach), wybrali je {chosen} raz(y) ({rate}%); pozostałe wina do tego dania wybierali w {otherRate}% przypadków.” (procenty zaokrąglone do całości); S5: „{wine} was ordered with a recommendation code for this dish {orders} times in the last 28 days, and this pairing isn’t approved.” / „{wine} zamówiono z kodem polecenia do tego dania {orders} razy w ostatnich 28 dniach, a to parowanie nie jest zatwierdzone.” |
| Wyjaśnienie | „What are opportunities?” / „Czym są okazje?” (`data-explain="opportunities"`) pod nagłówkiem strony; liczba dni z `DISMISS_DAYS` |
| Dane wejściowe | `OpportunityService.list(slug, { scope: 'all' }, locale)`; S4 z `GuestInteractionRepository.pairingStats` (okno KPI E04: 28 pełnych dni kalendarzowych do wczoraj, tylko para Primary, wiersze `sommelier`); S5 z `RecommendationCodeRepository.pairStats` (28 pełnych dni serwisu, wiersze `context: 'dish'`) |
| Dane wyjściowe | para `suggested` (`SommelierService.addSuggestion`), zatwierdzona para (S5: `SommelierService.approve` z `expectedVersion`), wiersz `opportunity_dismissal` (Ignore / Restore) |
| Loading | brak (strona poza `(lists)`, bez `loading.tsx`, działa bez JavaScriptu) |
| Empty | `EmptyState` „Nothing to check.” / „Nic do sprawdzenia.” |
| Error | `degraded` niepuste (F3/F4: zdarzenia gości, zamówienia z kodem) → uwaga „Some opportunities are temporarily unavailable.” i `logger.warn`; pozostałe okazje widoczne. Nieznana restauracja → 404, brak członkostwa → 403 |
| Success | flash: „Added to suggestions — approve it in “Engine suggestions”…”, „Pairing approved.” (S5), „Opportunity ignored. It comes back after 30 days at the earliest…”, „Opportunity restored.”; błędy: `already_suggested`, `already_rejected`, `dish_not_published`, `low_match`, `wine_not_available`, `opportunity_stale`, `opportunity_not_dismissed`, `version_conflict` (S5 „Approve” na nieaktualnej wersji pary) |
| Walidacje | klucz okazji ze schematu `opportunityKeySchema`; „Ignore” tylko dla bieżącego kandydata (inaczej `opportunity_stale`); „Add” wymaga dania `published`, aktywnego wina i wyniku ≥ `MIN_MODEL_SCORE` |
| Permissions | widzi każdy z dostępem do panelu (`requireAccess`); akcje `authorizeAction(slug, 'pairings.decide')` (tylko Sommelier); GM / Owner bez przycisków, z „View only” |
| API | brak tras HTTP: akcje serwerowe `addOpportunitySuggestion`, `dismissOpportunity`, `restoreOpportunity`, istniejąca `approvePairing` (S5; `pairingId`, `version`) (`?saved=` / `?error=`, `revalidatePath(..., 'layout')`, `safeBack`) |
| Układ | 390 i 1440 px bez poziomego przewijania (`min-w-0` w wierszach) |
