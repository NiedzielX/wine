# Specyfikacja ekranów

Identyfikatory ekranów według [SCREEN_MAP.md](SCREEN_MAP.md). Endpointy według [API_SPECIFICATION.md](API_SPECIFICATION.md). Nazwy eventów analytics są dokładnie takie jak w kodzie mockupu (`track(...)` w `src/`).

**Stan implementacji (Faza 1 migracji):** ekrany G0–G9 działają w `packages/app` (`/r/{slug}/…`). Odstępstwa od opisu poniżej, wynikające z architektury „stan w URL, działa bez JavaScriptu”:
- Preferencje i wybór dań gościa są w parametrach URL, a nie w sesji przeglądarki; filtry (G4) to linki, a arkusz otwiera się przez `?sheet=filters` (zamknięcie: link, nie klawisz Escape).
- G7 i G8 pobierają dane przez serwisy po stronie serwera (nie przez `GET /public/wines/{id}`); G8 nie wysyła eventów analytics do czasu Fazy 6.
- Stany loading / `?demo=` istnieją tylko w mockupach; aplikacja pokazuje stany empty i error (404 dla nieznanej restauracji lub wina, komunikat dla nieopublikowanego dania).
- Licznik na G5 jest progresywnym ulepszeniem (JS); bez JS przycisk jest aktywny, a serwer zwraca „Add at least two dishes”.
- Eventy analytics z tej specyfikacji nie są jeszcze zapisywane (Faza 6).

**Stan implementacji (Faza 2 migracji):** ekrany panelu A1–A7 działają w trybie odczytu w `packages/app` (`/admin/{slug}/…`; adresy z restauracją w ścieżce, bo logowanie i wybór lokalu dopiero w Fazie 4). Odstępstwa od opisu poniżej:
- **A1 Dashboard** pokazuje KPI programu winnego liczone z danych katalogu (dania opublikowane, wina, zatwierdzone pairingi, pokrycie Primary, „needs attention”). KPI użycia i sprzedaży (sesje, konwersja, attach rate, przychód) oraz wykresy są w Fazie 6; do tego czasu karta „Guest activity” pokazuje stan pusty z opisu A1.
- **A2, A3, A5** są tylko do odczytu (edycja profilu dania i wina — osobna specyfikacja; import — Faza 5). Filtry to formularze `GET`.
- **Faza 3 (zapisy):** **A6 Pairings** ma pełne zarządzanie (zatwierdzanie, odrzucanie, przywracanie, rola, kolejność ↑↓, notatka do 140 znaków, własne pary, usuwanie własnych par, „Approve all”, historia decyzji, podgląd „What guests see now” z wersji opublikowanej). **A7 Review** ma Approve / Reject / Approve all (dla dania i dla całego menu). **A4 Wine list** ma przełącznik dostępności (Hide / Show) działający od razu. **A11 Publish** działa: checklista (rada, nie blokada), ustawienia dla gości (od razu), „Publish changes” (migawka). Wynik zmiany pokazuje komunikat w URL (`?saved=` / `?error=`); konflikt wersji: „This pairing was changed by someone else…”.
- **Faza 4:** **A0 Login** działa (`/admin/login?next=`): jeden komunikat dla każdej nieudanej próby, blokada konta 15 minut po 5 próbach, powrót na żądaną stronę (tylko adresy `/admin/...`), działa bez JavaScriptu. Cały panel wymaga sesji; użytkownik bez członkostwa w restauracji dostaje 403. Autor zmiany w historii to zalogowany użytkownik. Pasek boczny pokazuje użytkownika, rolę i „Sign out”. General Manager widzi pairingi i kolejkę review w trybie „View only” (bez kontrolek decyzji), może publikować i ukrywać wina.
- **Faza 5:** **A8 / A9 Import** działają (`/admin/{slug}/import/menu|wines`, `?job=` to podgląd): upload (CSV, XLSX, PDF), podgląd z kontrolą każdego wiersza (błędy blokują, ostrzeżenia nie), edycja pól, zaznaczanie, „Check again”, atomowe zatwierdzenie, ekran wyniku. Odstępstwa od opisu: dla `.xls` komunikat „zapisz jako .xlsx lub CSV”; PDF jest czytany tylko jako tekst (bez OCR); duplikaty (to samo danie / ta sama nazwa, producent i rocznik wina) są domyślnie niezaznaczonymi aktualizacjami; plik nie jest przechowywany. **A10 Setup** (lista kroków wdrożenia, dane restauracji, „Generate suggestions”): dane i slug edytuje tylko Owner / GM, Sommelier widzi je w trybie „View only”. **A12 QR**: podgląd stojaka (układ do druku bez paneli), pobranie SVG i PNG (1024 / 2048 px), link; adres z `PUBLIC_BASE_URL`.
- Eventy analityczne i import sprzedaży nadal Faza 6.
- Stan loading (skeleton) mają ekrany list; strony szczegółów nie, żeby zwracały poprawne kody HTTP. Ekrany list wymagają JavaScriptu.

Wspólne zasady:
- **Loading** w aplikacji gościa: skeleton w kształcie docelowej treści (bez spinnerów). W mockupie wymuszany parametrem `?demo=loading`.
- **Error**: komunikat mówi, co się stało i co zrobić, z przyciskiem „Try again” (`?demo=error`).
- **Empty**: zaproszenie do działania, nie nastrój (`?demo=empty`).
- **Success**: toast w dolnej części ekranu (`role=status`) z tym samym czasownikiem co przycisk („Publish changes” → „Published 12 changes”).
- Wszystkie publiczne endpointy gościa są cache’owane (CDN, `stale-while-revalidate`); rekomendacje dla par bez filtrów są wyliczane przy publikacji.
- Każdy event gościa niesie: `restaurantId`, `sessionId` (anonimowy, losowy, w sessionStorage), `menuVersion`, `engineVersion`, `ts`.

---

# Guest application (mobile-first)

## G0 Restaurant landing — `/r/{slug}`

| Pole | Opis |
|---|---|
| Cel | Przywitać gościa, wyjaśnić w jednym zdaniu, do czego służy, i zbudować zaufanie (karta ułożona przez sommeliera) |
| Użytkownik | Gość (po skanie QR) |
| Funkcje | menu (jak G1) od razu pod nagłówkiem: wybór dania → G3 (z preferencjami z URL); „Pair a bottle for the table” → G5; link „For staff” → G9 (pod menu na telefonie) |
| Komponenty UI | Hero w kolorze bordo z nazwą restauracji (Bodoni Moda), adres, lead, przycisk „Pair a bottle for the table”; nagłówek „Pick your dish” i lista dań; karta kuratora (inicjały, Wine Director) — na telefonie pod menu, na desktopie w lewej kolumnie |
| Dane wejściowe | `slug` z URL |
| Dane wyjściowe | sesja gościa (sessionId) |
| Loading | tło hero od razu (kolor marki), nazwa i przyciski po pobraniu danych restauracji |
| Empty | restauracja bez opublikowanego menu → „Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.” |
| Error | błędny / nieaktywny slug → „This menu isn’t available” + instrukcja ponownego skanu |
| Success | n/d |
| Walidacje | slug `[a-z0-9-]{2,40}`; restauracja aktywna i opublikowana |
| Permissions | publiczny |
| API | `GET /public/restaurants/{slug}` |
| Analytics | `guest_session_started {source: qr}`, `menu_viewed` |

## G1 Dish list — `/r/{slug}/menu`

| Pole | Opis |
|---|---|
| Cel | Szybki wybór dania, które gość zamawia |
| Użytkownik | Gość |
| Funkcje | przełącznik One dish / Whole table; skok do sekcji (Starters, Mains, Desserts); wybór dania → G3 (z preferencjami z URL) |
| Komponenty UI | top bar z Back; segmented control; przyklejony pasek chipów kategorii; wiersze dań (nazwa serif, cena, opis, oznaczenie „Sommelier pairing available”) |
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

## G2 Dish details — `/r/{slug}/dish/{dishId}` (wycofany 2026-10-15)

Ekran połączony z G3 (spec `.ai/specs/2026-10-15-guest-short-path-and-desktop.md`): adres odpowiada **308** na `/r/{slug}/dish/{dishId}/wines` z całym query (`BACKWARD_COMPATIBILITY.md` §1). Opis dania i „taste chips” są w nagłówku G3, szybkie preferencje w rzędzie chipów na G3. Event `dish_viewed` usunięty — wejście w danie liczy `recommendations_viewed`.

## G3 Wine recommendations — `/r/{slug}/dish/{dishId}/wines`

| Pole | Opis |
|---|---|
| Cel | Pokazać 2–4 najlepiej pasujące wina z karty restauracji, z ceną i krótkim uzasadnieniem |
| Użytkownik | Gość |
| Funkcje | nagłówek dania (nazwa, cena, opis, „taste chips”); rząd szybkich preferencji: „More…” (→ G4, z liczbą filtrów spoza rzędu), By the glass, By the bottle, Red, White, Sparkling — każdy chip to link, drugie kliknięcie wyłącza; karta „Best match” / „Sommelier recommendation”; lista „Also good with this dish”; „Refine” w top barze → G4; wybór wina → G7. Desktop (≥ 1024 px): menu z bieżącym daniem w lewej kolumnie, wina w prawej, G4 jako panel z prawej |
| Komponenty UI | nagłówek „For your {dish}”, licznik; **Match glass** (kieliszek wypełniony kolorem wina do poziomu wyniku) + procent; odznaki: Sommelier recommendation (pieczęć, mosiądz), Best value (szałwia); cena z ikoną kieliszka / butelki; „Why it works”; nota zaufania o Wine Director |
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

## G5 Whole table selection — `/r/{slug}/table`

| Pole | Opis |
|---|---|
| Cel | Zebrać dania całego stolika do wspólnej rekomendacji |
| Użytkownik | Gość (jeden telefon na stolik) |
| Funkcje | zaznaczanie dań; zwijane „Colour and budget” (budżet na butelkę); „Find a bottle for the table” (aktywny od 2 dań) → G6; „Clear selection” |
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

## G6 Best wine for your table — `/r/{slug}/table/result`

| Pole | Opis |
|---|---|
| Cel | Pokazać najlepszą butelkę dla wszystkich dań i uczciwie pokazać kompromis |
| Użytkownik | Gość |
| Funkcje | karta „Recommended for your table” z wynikami per danie, Overall match, ceną; 2 alternatywy; sekcja „Or by the glass, dish by dish” przy dużej rozbieżności; wybór wina → G7 |
| Komponenty UI | paski wyniku per danie (z pieczęcią przy parach sommeliera); Overall match (serif); notka o odłożonych deserach |
| Dane wejściowe | `dishIds[]`, preferencje |
| Dane wyjściowe | `TableResult` |
| Loading | skeleton karty z 3 paskami |
| Empty | mniej niż 2 dania → „Add at least two dishes” + Choose dishes; brak butelki w filtrach → „No bottle fits these filters” |
| Error | jak G3 |
| Success | wynik |
| Walidacje | desery poza obliczeniem butelki (chyba że stolik ma same desery) |
| Permissions | publiczny |
| API | `POST /recommendations/table` |
| Analytics | `table_recommendation_viewed {dishIds}` |

## G7 Wine details — `/r/{slug}/wine/{wineId}?dish=|table=1`

| Pole | Opis |
|---|---|
| Cel | Dać gościowi pewność wyboru i wybrać porcję |
| Użytkownik | Gość |
| Funkcje | wybór kieliszka / butelki; „Choose this wine” → G8 |
| Komponenty UI | nazwa, producent, Match glass; blok sommeliera (pieczęć, imię, notatka) lub „Why it works with the {dish}”; fakty (region, rocznik, szczepy, styl i alkohol); nota degustacyjna (serif italic); profil w kropkach 0–5; radio-karty porcji z ceną i pojemnością |
| Dane wejściowe | Wine; kontekst dania (opcjonalnie) |
| Dane wyjściowe | `{wineId, serving}` |
| Loading | skeleton nagłówka i faktów |
| Empty | n/d |
| Error | wino nieaktywne / nieznane → „This wine is no longer available” + See other wines |
| Success | przejście do G8 |
| Walidacje | kieliszek nieaktywny, gdy `glassPrice = null` („Not poured by the glass”); ze stolika domyślnie butelka |
| Permissions | publiczny |
| API | `GET /public/wines/{id}?dishId=` (z wynikiem dopasowania) |
| Analytics | `wine_viewed {wineId, dishId, context}`, `wine_selected {wineId, serving, dishId, context}` |

## G8 Selection confirmation — `/r/{slug}/selected/{wineId}`

| Pole | Opis |
|---|---|
| Cel | Ekran do pokazania kelnerowi zamiast wymawiania nazwy |
| Użytkownik | Gość, kelner |
| Funkcje | „Pair another dish” → G1; „Done” → G0 |
| Komponenty UI | pełny kieliszek; „Show this to your waiter.”; karta: numer z karty (List no.), producent i wino (duży serif), rocznik, porcja + cena, danie / „For the table” |
| Dane wejściowe | `wineId`, `serving`, `dishId` / `table` |
| Dane wyjściowe | brak (MVP nie tworzy zamówienia) |
| Loading | n/d (dane z G7) |
| Empty | n/d |
| Error | nieznane wino → komunikat + Back to menu |
| Success | ekran sam w sobie |
| Walidacje | `serving=glass` tylko dla wina z ceną kieliszka |
| Permissions | publiczny |
| API | brak (produkcja: opcjonalnie `POST /public/selections` dla analityki konwersji) |
| Analytics | `selection_shown_to_waiter {wineId, serving}` |

## G9 Staff lookup — `/r/{slug}/staff?dish=`

| Pole | Opis |
|---|---|
| Cel | Szybka podpowiedź dla kelnera przy stoliku |
| Użytkownik | Kelner |
| Funkcje | wybór dania (select); filtry kieliszek / styl / budżet; lista 2–4 win |
| Komponenty UI | wiersze: numer i nazwa, „List no.”, odznaki („Wine Director’s first choice”, „Wine Director’s pick”, „Best value”, „{n}% match”), „Say: …”, cena |
| Dane wejściowe | menu, preferencje |
| Dane wyjściowe | brak |
| Loading | skeleton 3 wierszy |
| Empty | „Nothing fits. Relax the budget or colour.” |
| Error | jak G3 |
| Success | n/d |
| Walidacje | jak G3 |
| Permissions | publiczny w MVP; produkcja: PIN zespołu |
| API | `GET /dishes/{id}/recommendations` |
| Analytics | `staff_lookup {dishId}`, `staff_filter_changed` |

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
| Dane wejściowe | okres (domyślnie 28 dni), eventy, dane sprzedaży |
| Dane wyjściowe | brak |
| Loading | skeleton kafelków KPI |
| Empty | „No guests have used Wine Match yet” + Get the QR code |
| Error | panel z „Analytics are temporarily unavailable. Pairings and guest app work normally.” |
| Success | n/d |
| Walidacje | KPI sprzedażowe ukryte, jeśli brak importu sprzedaży („Upload a POS export to see attach rate”) |
| Permissions | Sommelier, GM |
| API | `GET /restaurants/{id}/analytics/summary?from=&to=`, `/analytics/timeseries`, `/analytics/pairings` |
| Analytics | `dashboard_viewed` (produkcja) |

## A2 Menu — `/admin/menu?q=&cat=`

| Pole | Opis |
|---|---|
| Cel | Przegląd dań, ich statusu i pokrycia pairingami |
| Użytkownik | Sommelier, GM |
| Funkcje | wyszukiwanie (debounce 350 ms), filtr kategorii, wiersz → A3, „Import menu” → A8 |
| Komponenty UI | tabela: nazwa + opis, kategoria, cena, status (Published / Draft / Hidden), profil (Confirmed / Draft, needs check), pairingi (reviewed / to review) |
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
| Funkcje | edycja pól; suwaki profilu 0–5; główny składnik; metoda; podgląd „Top matches with this profile” na żywo; „Save and update suggestions”; „Manage pairings” → A6; „View as guest” |
| Komponenty UI | panel Details (formularz 2-kolumnowy), panel podglądu (top 5 win z % i uzasadnieniem), panel Taste profile (siatka suwaków z wartością) |
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
| Funkcje | lista dań z licznikami; **Approved for guests**: rola (Primary / Alternative / Best value), góra / dół, notatka dla gości, Reject, Delete (dla par ręcznych); **Engine suggestions**: Approve / Reject / Approve all; **Add your own pairing**: wino (z wynikiem silnika), rola, notatka; **Rejected**: Restore; **What guests see now** |
| Komponenty UI | układ 2-kolumnowy: lista dań (sticky) + panele; wiersz pary: pozycja (serif), wino, ceny, odznaki statusu i roli, wynik silnika, „Unpublished change”, notatka (italic) |
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

## A7 Pairing review — `/admin/review`

| Pole | Opis |
|---|---|
| Cel | Szybko przejrzeć wszystkie propozycje silnika |
| Użytkownik | Sommelier |
| Funkcje | Approve / Reject per propozycja; Approve all for this dish; Approve all N (→ A11); Open pairings → A6 |
| Komponenty UI | pasek postępu (dania z ≥ 1 zatwierdzoną parą); grupy per danie z informacją „no primary pick yet”; wiersz: wino, uzasadnienie z reguł, wynik |
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
| Funkcje | krok 1: upload (drag & drop / wybór), „Use sample file”, „Download CSV template”; krok 2: edycja komórek, odznaczanie wierszy, kolumna Drafted profile, kolumna Checks, Start over, Import selected dishes; krok 3: linki do Review i Menu |
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
| Dane wejściowe | kolumny: producer, wine, vintage, region, grape, style, glass price, bottle price |
| Dane wyjściowe | Wine[] (`active`), WineProfile[] (domyślne szczepu i stylu), nowe Pairing[] dla wszystkich dań |
| Walidacje | producent i cena butelki wymagane; brak szczepu → ostrzeżenie (nie blokuje); rocznik 4 cyfry lub NV |
| API | `POST /imports/wines`, pozostałe jak A8 |

## A10 Setup checklist — `/admin/setup`

| Pole | Opis |
|---|---|
| Cel | Prowadzić nową restaurację od założenia do QR na stołach |
| Użytkownik | GM, Sommelier, System Admin |
| Funkcje | formularz Restaurant details (nazwa, publiczny link, adres, Wine Director); 8 kroków ze statusem i przyciskiem; „Regenerate suggestions”; „Reset demo data” (tylko mockup) |
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
