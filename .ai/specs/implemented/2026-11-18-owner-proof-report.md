---
status: implemented
created: 2026-11-18
owner: Filip Niedziela
related: [.ai/specs/research/benchmarks/2026-11-16-product-strategy-vs-sommelierbot.md (P3, na gałęzi docs/product-strategy-vs-competitors), .ai/specs/research/benchmarks/2026-11-16-competitive-advantages.md (S1), .ai/specs/product-brief.md (D04, D16, D18, D20, D23, A05, K03, Q02, Q11), docs/PRODUCT_CONCEPT.md (§6), .ai/specs/implemented/2026-10-15-pos-sales-import-attach-rate.md, .ai/specs/implemented/2026-10-15-kpi-dashboard.md, .ai/specs/implemented/2026-10-16-recommendation-code.md, .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md, .ai/specs/2026-11-04-subscriptions-and-billing.md, docs/SCREEN_SPECIFICATION.md, docs/SCREEN_MAP.md, docs/USER_ROLES.md, docs/security/threat-model.md, .ai/runs/2026-11-18-owner-proof-report-spec.md]
superseded_by:
author_model: not recorded
reviewed_by: "independent agent, fresh context (model not recorded)"
review_independence: different-model        # przegląd po wdrożeniu 2026-11-27; model inny niż autora zlecony przy uruchomieniu, nie potwierdzony po stronie sesji
---

# Raport dowodu dla właściciela i GM (stała baza pilota)

## TLDR
Właściciel płaci abonament za obietnicę; dziś nie ma jak sprawdzić, czy wino sprzedaje się lepiej niż przed Wine Match. Dane są (import POS, kody polecenia), ale panel pokazuje tylko ruchome okno „ostatnie 28 dni wobec poprzednich 28” (A1), bez stałej bazy z D20, bez niepewności i bez zastrzeżeń. Budujemy **A33 „Raport dowodu”**: strona dla owner i GM z Wine Attach Rate **przed** (28 dni przed uruchomieniem) i **po** (kolejne 28-dniowe okna), z przedziałem niepewności, uczciwym „za mało danych” (progi z D20), zestawieniem rachunków z kodem i bez kodu **opisanym jako korelacja** oraz widokiem do druku (A34). Wszystko liczone na żywo z istniejących `sales_record` i `recommendation_code`; jedyna nowa tabela to dopisywany dzień uruchomienia (stała baza musi być stała). Zwrot abonamentu po 60 dniach jest treścią handlową do decyzji właściciela (sekcja „Treść handlowa”); **nie budujemy rozliczeń** (E15 wyłącza rozliczenia za wynik). Wszystkie liczby w tej specyfikacji dotyczące progów to propozycje agenta (`[ASSUMPTION]`); żadna nie pochodzi z rozmowy z restauracją.

## Problem
- **Dla kogo:** owner i GM restauracji (kupujący i płacący), pośrednio my: pozycjonowanie „dowód z Twojej kasy, nie obietnica z cudzego hotelu” (strategia P3) jest dziś puste: konkurenci pokazują cudze studia („+180%”, „gwarancja 10–20%”), a my mamy narzędzie bez raportu.
- **Skąd wiemy:** `docs/SCREEN_SPECIFICATION.md` (A1: delta względem poprzednich 28 dni, „stały baseline pilota” oznaczony jako „później”), D20 (baseline 28 dni przed i okno 28 dni po, próg 30 rachunków, `proposal`), kpi-dashboard Q17 („poprzednie 28 dni”). Konsekwencja ruchomego okna: po 2 miesiącach „poprzednie 28 dni” to już dni z Wine Match, więc delta mierzy tempo, nie efekt uruchomienia.
- **Czego nie wiemy:** czy jakakolwiek restauracja odczyta raport (miara: odsetek pilotaży z odczytywalnym wynikiem), czy POS dostarczy 28 dni historii przed startem (C03, D21) i jaka zmiana liczy się jako sukces (Q11, K03).

## Cel i zakres
Dostarczyć owner i GM jedną stronę, którą można pokazać wspólnikowi: co było przed, co jest po, jak pewny jest ten wniosek i czego raport nie dowodzi.

**W zakresie:** definicje metryk i ich testy na ręcznych przykładach; serwis w `core` (czysta funkcja i serwis); tabela dnia uruchomienia; uprawnienia `proof.view` i `proof.manage`; trasy API; ekran A33 (PL i EN, bez JavaScriptu); widok do druku A34 (F2); dokumentacja, QA, e2e, test granicy dostępu.

**Poza zakresem:** rozliczenia, zwroty i faktury (E15; sekcja „Treść handlowa” to tekst do decyzji); pomiar przyczynowy okresami z rekomendacją i bez (F3, osobna specyfikacja); benchmark między lokalami i raport grupy (D23, P4, E14); marża i podbicia (P12); kampanie sponsorowane (D22, D25; strategia P3 wspomina osobne liczenie wyborów sponsorowanych: dopisze je specyfikacja tych funkcji); eksport CSV (E20 / A30); integracja z POS (N04); wykresy; powiadomienia e-mail; PDF generowany na serwerze (nowa biblioteka wymaga specyfikacji, AGENTS.md §1.1).

## Definicje metryk
Wszystkie reguły rachunku zostają te z E03 (`computeSalesKpis`, Q7, Q8): jednostką jest **rachunek** `(business_date, check_id)`, „ma jedzenie” i „ma wino” oznaczają sumę ilości danego typu > 0 (zwrot znosi sprzedaż), rachunki barowe nie wchodzą do licznika ani mianownika. Raport **nie wprowadza drugiej definicji** Wine Attach Rate; liczy ją funkcją, którą już ma A1.

| Pojęcie | Definicja |
|---|---|
| **Dzień uruchomienia L** | pierwszy dzień biznesowy, w którym goście mogli skorzystać z Wine Match przy stolikach; wpisuje go owner lub GM (nie wyprowadzamy go z `restaurant.published_at`: to pole jest nadpisywane przy każdej publikacji karty, więc nie jest stałe). Dzień usługi w sensie E09 (`serviceDay`, `Europe/Warsaw`, odcięcie 04:00), nie późniejszy niż `serviceDay(now)` **[przegląd]** |
| **Okno bazowe B** | `[L − 28, L − 1]`, 28 dni kalendarzowych, stałe. Dane wyłącznie z importu POS |
| **Okno k** (k ≥ 1) | `[L + 28(k−1), L + 28k − 1]`; okno 1 to „okno 28 dni po” z D20. Okno jest **kompletne**, gdy jego ostatni dzień ≤ `shiftDay(serviceDay(now), −1)` **i** dane POS sięgają tego dnia (`dataRange.to` ≥ ostatni dzień okna; powód `window_not_imported`) **[przegląd]**; niekompletne pokazuje tylko liczniki z komunikatem „okno trwa”. 28 dni to równo 4 tygodnie, więc każde okno ma tyle samo piątków i sobót |
| **Dzień z danymi** | dzień biznesowy z co najmniej jednym rachunkiem z jedzeniem w oknie |
| **Wine Attach Rate okna** | `foodChecksWithWine / foodChecks` (jak `SalesKpis.attachRate`), pokazywany jako liczby „N z M rachunków” i procent |
| **Przedział niepewności okna** | przedział ufności Wilsona 95% (z = 1,96) dla proporcji `x / n` |
| **Zmiana Δ (pp)** | `(p_okna − p_bazy) × 100` |
| **Przedział zmiany** | metoda hybrydowa Newcombe'a (metoda 10; przedziały Wilsona obu proporcji): `Δ ± ` składane z odległości punktu od końców własnych przedziałów (wzór w kodzie, nazwany `newcombeDifference`) |
| **Rachunek z kodem** | rachunek (z jedzeniem), który ma w aktywnych liniach co najmniej jedną linię z `recommendation_code`. Kod trafia do POS ręcznie (D16), więc „bez kodu” znaczy „bez kodu w kasie”, nie „bez Wine Match” |

**Werdykt zmiany** (`verdict`), liczony wyłącznie gdy oba okna spełniają progi:
- `increase`: dolny koniec przedziału zmiany > 0 (wzrost odczytywalny przy 95%; zdanie na ekranie ustala R4);
- `decrease`: górny koniec < 0;
- `inconclusive`: przedział obejmuje 0; tekst: „Z tych danych nie da się powiedzieć, czy odsetek wzrósł, spadł, czy został bez zmian” (to **nie** jest „brak efektu”);
- brak werdyktu (`insufficient`), gdy próg niespełniony (niżej).

**Progi** (stałe nazwane w `core`; propozycje, Q1, Q2):
`PROOF_MIN_FOOD_CHECKS = 30` na okno (wartość D20, ta sama co `MIN_RATE_SAMPLE`, importowana, nie kopiowana) i `PROOF_MIN_TRADING_DAYS = 14` na okno.

**Powody „za mało danych”** (`reasons`, dowolna liczba naraz, każdy ma komunikat i „co zrobić”): `no_launch_day`, `no_sales_import`, `baseline_no_data`, `baseline_too_few_checks`, `baseline_too_few_days`, `window_incomplete`, `window_not_imported`, `window_too_few_checks`, `window_too_few_days`. Przy dowolnym powodzie raport **pokazuje liczniki** („N z M rachunków”, „dni z danymi: D z 28”), **nie pokazuje** Δ, przedziału ani werdyktu, a procent okna tylko gdy jego mianownik ≥ 30. Komunikat bazy podaje, jakie daty trzeba zaimportować („Wgraj eksport POS za 21.09–18.10”).

### Przykłady policzone ręcznie (źródło testów)
**H1: rachunki, definicje.** Jedno okno, sześć rachunków:

| Rachunek | Linie | Jedzenie | Wino | Kod | Uwaga |
|---|---|---|---|---|---|
| 1 | jedzenie 2, kieliszek 1 | tak | tak | – | |
| 2 | jedzenie 3 | tak | nie | – | |
| 3 | jedzenie 1, butelka +1 i −1 | tak | nie | – | zwrot znosi butelkę (Q8) |
| 4 | kieliszek 2 | nie | – | – | bar: poza licznikiem i mianownikiem |
| 5 | jedzenie 2, butelka 1 | tak | tak | W7K | |
| 6 | jedzenie 1 | tak | nie | K4P | kod bez wina: w mianowniku grupy „z kodem” |

Oczekiwane: `foodChecks = 5`, `foodChecksWithWine = 2`, Wine Attach Rate **40,0%**; „z kodem” 1 z 2 (**50,0%**), „bez kodu” 1 z 3 (**33,3%**).

**H2–H5: przedział (z = 1,96; tolerancja 0,05 pp)** — liczby przeliczone niezależnie od kodu:

| | Baza x/n | Okno x/n | Baza (Wilson) | Okno (Wilson) | Δ | Przedział Δ (Newcombe) | Werdykt |
|---|---|---|---|---|---|---|---|
| H2 | 42/120 | 65/130 | 35,0% [27,1; 43,9] | 50,0% [41,5; 58,5] | +15,0 pp | [+2,7; +26,6] | `increase` |
| H3 | 70/200 | 100/210 | 35,0% [28,7; 41,8] | 47,6% [41,0; 54,4] | +12,6 pp | [+3,1; +21,8] | `increase` |
| H4 | 40/100 | 46/100 | 40,0% [30,9; 49,8] | 46,0% [36,6; 55,7] | +6,0 pp | [−7,6; +19,3] | `inconclusive` |
| H5 | 12/40 | 18/45 | 30,0% [18,1; 45,4] | 40,0% [27,0; 54,5] | +10,0 pp | [−10,2; +28,8] | `inconclusive` |

H4 i H5 pokazują sedno: +6 i +10 pp przy takich próbach nie odróżniają się od przypadku; raport tego nie ukrywa. Dodatkowe przypadki testowe: 29 rachunków z jedzeniem w oknie (próg: `window_too_few_checks`, brak Δ), 30 dokładnie (próg spełniony), 13 dni z danymi (`…too_few_days`), 14 (ok), `x = 0` i `x = n` (Wilson nie daje wartości poza 0..1), `n = 0` (brak wartości, bez dzielenia przez zero), 28 dni w oknie 29-dniowym i granice L ± 1 w dniach zmiany czasu (marzec, październik).

## Wymagania
- **R1 (czysta funkcja)** `computeProofReport(input)` w `core` zwraca `ProofReport` bez I/O, zegara i `Math.random`. Wejście: dzień uruchomienia, numer okna, `now` (podany z zewnątrz), `CheckTotals` bazy i okna, podział na rachunki z kodem i bez, podsumowanie kodów. Te same dane dają ten sam wynik (test determinizmu).
- **R2 (jedna definicja)** Wine Attach Rate i przychód na rachunek z jedzeniem liczy `computeSalesKpis` na zbiorze rachunków; raport nie ma własnej reguły „ma wino”. Dla tych samych dat liczby raportu i A1 są równe (AC3).
- **R3 (progi i powody)** Reguły z sekcji „Definicje” (progi, powody, ukrywanie Δ). Progi są stałymi nazwanymi i jednym miejscem zmiany.
- **R4 (niepewność)** Przedział Wilsona okna i przedział Newcombe'a zmiany dla każdego okna z kompletnymi danymi; UI zaokrągla do pełnych punktów procentowych **na zewnątrz** (dolny koniec w dół, górny w górę; przy `increase` dolny koniec < 1 pp pokazujemy z jednym miejscem po przecinku, nigdy „od +0”), API zwraca pełną precyzję **[przegląd]**. Zdanie werdyktu `increase` (stałe, PL/EN, bez słów o przyczynie): „Odsetek rachunków z winem jest wyższy niż w oknie bazowym i różnica jest większa niż zwykłe wahania przy tej liczbie rachunków. Raport nie ustala, co ją spowodowało.” **[przegląd]** Wzór Newcombe'a w kodzie i w „Jak to liczymy”: `L = Δ − √((p₂−l₂)² + (u₁−p₁)²)`, `U = Δ + √((u₂−p₂)² + (p₁−l₁)²)` (p, l, u: estymata i końce Wilsona; 1 = baza, 2 = okno) **[przegląd]**. Bez przedziału nie ma zdania „wzrost o X pp”.
- **R5 (stała baza)** Baza zależy tylko od L i od aktywnych linii POS. Zmiana L jest **dopisaniem** wiersza w `proof_launch_day` z powodem (wymaganym od drugiego wpisu; wymuszane w bazie, patrz model), nigdy edycją; zapis przyjmuje `expectedCurrent` (id bieżącego wiersza lub null) i przy niezgodności zwraca `VersionConflictError` (409), bo „sprawdź, potem wstaw” bez tego ściga się z drugim zapisem **[przegląd]**; wpis dodany po zakończeniu okna 1 jest na ekranie i wydruku oznaczony „L zmieniony po zakończeniu okna 1”; raport pokazuje „Dzień uruchomienia ustawiony dd.mm.rrrr przez rolę …; zmieniony N razy” i bieżącą wartość. Powtórny import POS zastępuje rachunki (E03), więc raport pokazuje „Dane POS do dnia …, ostatni import …” i jest przeliczany z aktywnych linii (nie zamrażamy migawki w F1, Q6).
- **R6 (korelacja, nie przyczyna)** Zestawienie „rachunki z kodem” i „bez kodu” w oknie: liczby, Wine Attach Rate i przychód z wina na rachunek z jedzeniem, każda grupa osobno z progiem 30; **bez** Δ między grupami, **bez** werdyktu, ze stałym zastrzeżeniem (PL/EN, nad tabelą): „To zestawienie, nie dowód przyczyny. Stoliki, które użyły kodu, same sięgnęły po rekomendację; mogły zamówić wino i bez niej. Brak kodu w kasie nie znaczy, że stolik nie użył Wine Match. Kod wpisuje się przy zamówieniu polecanego wina, więc odsetek w grupie z kodem jest wysoki z definicji.” **[przegląd]** Okno bazowe nie ma grup (kodów wtedy nie było).
- **R7 (kody)** Sekcja „Kody polecenia w oknie”: wydane, potwierdzone przez kelnera, znalezione w sprzedaży, „zamówione” (suma bez dubli, E09 R10), kody w POS bez polecenia. Źródło: `RecommendationCodeService.summary` (kontrakt E09 stabilny), bez nowej logiki.
- **R8 (język i treść)** Bez słowa „AI” w żadnym tekście ekranu i API; bez słów „gwarantowane”, „dzięki Wine Match”, „efekt Wine Match” przy liczbach zmiany; dozwolone: „zmiana po uruchomieniu”, „z Twoich rachunków”, „zmierzone z eksportu POS”. Słownik PL i EN w `app/src/i18n`, para w tym samym PR. Stały blok „Jak to liczymy” (jeden akapit: okna, definicja, próg, przedział, ograniczenia) i blok „Czego ten raport nie mówi” (sezon, zmiana karty i cen, pogoda i wydarzenia, brak grupy kontrolnej).
- **R9 (sezonowość i wiek bazy)** Od okna 4 (ponad 3 okna po L) nad liczbami stały komunikat: „Baza jest starsza niż trzy okna. Pora roku, zmiana karty lub cen mogą tłumaczyć różnicę.” Raport nigdy nie porównuje okna z oknem sprzed 12 miesięcy (brak takich danych w pilotażu).
- **R10 (uprawnienia)** Nowe `proof.view` (odczyt A33, A34 i API) i `proof.manage` (ustawienie dnia uruchomienia), oba w `BUSINESS` w `permissions.ts` (dopisać do unii `Permission`), czyli owner i manager; sommelier i kelner bez dostępu (sommelier ma interes w wyniku i nie ustawia bazy; Q4). **[przegląd]** Uwaga: sommelier ma `import.manage` i może zastąpić rachunki bazy, więc „bez wpływu na dowód” nie jest prawdą; import zostaje poza zakresem, ale raport pokazuje „ostatni import” (R5), a rola i uzasadnienie wchodzą do Q4. Każde wejście sprawdza samo: `requireAccess` w layoucie i na stronie, `authorizeAction` w akcji, `handle()` w trasie.
- **R11 (API)** `GET /api/v1/restaurants/{slug}/proof-report?window=N` (odczyt) i `POST /api/v1/restaurants/{slug}/proof-launch` (zapis = dopisanie wpisu, 201; nie `PUT`, bo powtórzenie dopisuje kolejny wiersz; ciało `strictObject` `{ launchDay, reason?, expectedCurrent }`, schemat w `core/validators/proof/`). Błędy (istniejące klasy `ValidationError` i `VersionConflictError`, bez nowych): `invalid_window` (422; liczba całkowita 1..12, bo 28 + 12×28 = 364 ≤ 366 dni; poza zakresem lub okno przyszłe też 422) **[przegląd]**, `invalid_launch_day` (422: data z przyszłości, przed 2020-01-01, zły format), `reason_required` (422), `version_conflict` (409, nieaktualny `expectedCurrent`; zamiast `stale_launch_day`, W3). Obcy slug i brak roli zgodnie z polityką 403/404 z `threat-model.md` §4.1.
- **R12 (izolacja tenantów)** Każda metoda nowego repozytorium i nowa metoda `SalesRepository` przyjmują `restaurantId` z sluga rozwiązanego na serwerze; slug nigdy nie pochodzi z ciała. Test granicy z trzema sprawdzeniami (§10 standardów).
- **R13 (druk, F2)** A34: układ A4, `@media print`, bez nawigacji, tabela okien, przedziały, zastrzeżenia, „Jak to liczymy”; zdanie „Użyj Ctrl/Cmd+P” zawsze widoczne, przycisk „Drukuj” tylko z JS (wzór DM3 z E22). Bez zewnętrznych zasobów i fontów z sieci. Data na wydruku to „dane do dnia” (z danych), nie zegar serwera.
- **R14 (prywatność)** Raport zawiera wyłącznie agregaty restauracji: liczby rachunków, procenty, kwoty, daty. Nie zawiera `check_id`, kodów polecenia, `sid`, nazw pozycji ani tekstów z POS. Logi: tylko wzorzec trasy i status (bez parametrów i wartości). Nic nie wychodzi poza restaurację (D18, D23: dane między lokalami wymagają osobnej decyzji).
- **R15 (stany ekranu)** Brak L: `EmptyState` z formularzem dnia uruchomienia. Brak importu: `EmptyState` „Wgraj eksport POS” z linkiem do A13. Błąd odczytu: `ErrorMessage`. Ładowanie: `LoadingMessage`. Każdy powód z R3 ma własny tekst. Układ bez poziomego przewijania przy 390 i 1440 px.

## Kryteria akceptacji
Scenariusze QA: `.ai/qa/kpi/kpi-009…kpi-014` (obszar `kpi`) i `.ai/qa/security/security-034…035` (`security-033` zajęte na `feat/catalog-field-editing-c1`) **[przegląd]**; numeracja do potwierdzenia przy implementacji (`check:qa`). Testy jednostkowe w `packages/core/tests/proof-report.test.ts`.

- [x] **AC1 (R1, definicje)** H1: 5 rachunków z jedzeniem, 2 z winem, 40,0%; grupy 1/2 i 1/3. *Test jednostkowy.*
- [x] **AC2 (R4)** H2–H5 zgadzają się z tabelą (tolerancja 0,05 pp), werdykty `increase`, `increase`, `inconclusive`, `inconclusive`; dodatkowo `x=0`, `x=n`, `n=0` bez NaN i wartości poza 0..1. *Test jednostkowy.*
- [x] **AC3 (R2)** Dla okna o tych samych datach co okno A1 `foodChecks`, `foodChecksWithWine` i `attachRate` raportu są równe `SalesKpiService.getSalesKpis`. *Test kontraktowy w `core` na pamięci i test `test:db` na PostgreSQL.*
- [x] **AC4 (R3)** `window_not_imported` gdy dane POS kończą się przed ostatnim dniem okna **[przegląd]**; 29 rachunków: `window_too_few_checks`, brak Δ i werdyktu, brak procentu okna; 30: Δ liczone; 13 dni z danymi: `…too_few_days`; 14: ok; baza bez danych: `baseline_no_data` z zakresem dat do wgrania. *Testy jednostkowe plus e2e na A33.*
- [x] **AC5 (R5)** Dwa wpisy `proof_launch_day`: obowiązuje najnowszy, drugi bez `reason` odrzucony (`reason_required`), wiersze nie są edytowane ani kasowane, raport pokazuje „zmieniony 1 raz”. *Test serwisu, test `test:db`, e2e.*
- [x] **AC6 (R5, okna)** Okno jest kompletne tylko przy ostatnim dniu ≤ wczorajszy dzień usługi (`serviceDay`, test o 02:00 i 05:00) **[przegląd]**; granice w dniach zmiany czasu (2026-10-25, 2027-03-28) poprawne (28 dni kalendarzowych, nie 28×24 h). *Test jednostkowy z `now` podanym z zewnątrz.*
- [x] **AC7 (R6)** Zestawienie z kodem/bez ma zastrzeżenie w obu językach, nie zawiera Δ między grupami ani słów „przyczyna: Wine Match”; grupa poniżej 30 pokazuje „za mało danych”. *Test SSR (`prerender`) i e2e.*
- [x] **AC8 (R7)** Liczby kodów w raporcie równe `RecommendationCodeService.summary` dla okna. *Test jednostkowy.*
- [x] **AC9 (R8)** Widoczny tekst A33 (bez `<script>` z ładunkiem RSC) i odpowiedź API nie pasują do `\bAI\b|gwarantowan|dzięki Wine Match|efekt Wine Match` (testy po wszystkich stanach, w PL i EN, także zdanie werdyktu `increase`) **[przegląd]**; zawierają bloki „Jak to liczymy” i „Czego ten raport nie mówi”. *Test SSR.*
- [x] **AC10 (R10)** Owner i manager: 200; sommelier i kelner: 403 na stronie, w akcji i w API; brak sesji: przekierowanie / 401. *Test HTTP.*
- [x] **AC11 (R11, R12)** Test granicy `proof-boundary.e2e.test.ts` według §10: kontrola pozytywna dla obu restauracji (A i B czytają własny raport i zapisują własny L), odmowa odczytu i zapisu cudzego sluga, stan po próbie (całe ładunki obu raportów i skrót tabeli `proof_launch_day` md5), mutacja (usunięcie filtra `restaurant_id` w nowej metodzie powoduje czerwony test; zapis w logu). *E2E na PostgreSQL.*
- [x] **AC12 (R11)** Ciało `POST` z polem spoza schematu → 422 (`strictObject`); data z przyszłości, zły format, `window=0`, `window=13`, `window=1e9` i `window=abc` → 422 bez 500; nieaktualne `expectedCurrent` → 409 **[przegląd]**. *Test trasy.*
- [x] **AC13 (R14)** Odpowiedź API i HTML nie zawierają `check_id`, kodu polecenia ani `sid` z danych testowych (seed z rozpoznawalnymi wartościami). *E2E.*
- [ ] **AC14 (R15)** Stany: brak L, brak importu, okno w toku, błąd; 390 i 1440 px bez `scrollWidth > innerWidth`; bez błędów konsoli. *E2E agent-browser.*
- [x] **AC15 (bez JS)** Wybór okna (linki `?window=`) i zapis L (formularz POST) działają z wyłączonym JavaScriptem (lekcja `2026-10-17-e2e-without-javascript`). *E2E.*
- [ ] **AC16 (R13, F2)** A34 w emulacji druku: nawigacja i przyciski niewidoczne, tabela i zastrzeżenia widoczne, ≤ 2 strony A4; brak żądań do zasobów zewnętrznych. *E2E plus zrzut do PR.*
- [x] **AC17 (dokumentacja)** `docs/SCREEN_MAP.md` (A33, A34), `docs/SCREEN_SPECIFICATION.md`, `docs/API_SPECIFICATION.md`, `docs/DATA_MODEL.md`, `docs/USER_ROLES.md`, `docs/PRODUCT_CONCEPT.md` §6 (zdanie o raporcie i stałej bazie), `docs/security/threat-model.md` (nowy wiersz T-…) zaktualizowane w tym samym PR; `npm run check:context`, `check:qa`, `check:routes` zielone. *Polecenia.*
- [x] **AC19 (R5, współbieżność)** [przegląd] Dwa równoległe zapisy L (bramka `race()`, pętla) dają jeden wiersz „pierwszy” i jeden 409; nie powstaje drugi wiersz bez `reason`. *`concurrency.integration.test.ts`.*
- [ ] **AC18 (weryfikacja ogólna)** `npm run lint`, `typecheck`, `test`, `test:db`, `build`; `npm run test:e2e`; migracja z dowodem up/down/up. *Wyniki w logu przebiegu.*

## Projekt rozwiązania

### Model danych: czy potrzebna migracja
**Obliczanie na żywo** z istniejących tabel (`sales_record`, `recommendation_code`, `restaurant`); nic z wyniku nie jest zapisywane (brak migawek raportu, więc brak rozjazdu z A1 i z importem, który zastępuje rachunki). Jedyna migracja: tabela dnia uruchomienia, bo baza ma być stała, a żadne istniejące pole tego nie daje (`restaurant.published_at` jest nadpisywane; `restaurant.settings` to jsonb zapisywany w całości przez `updateSettings` razem z formularzem publikacji, co groziłoby nadpisaniem i dostępem sommeliera, który ma `settings.change`).

`proof_launch_day` (append-only): `id` uuid, `restaurant_id` FK, `seq` int (1, 2, … per lokal; unikalny `(restaurant_id, seq)`; `CHECK (seq = 1 OR reason IS NOT NULL)` oraz `CHECK (char_length(reason) <= 200)` **[przegląd]**), `launch_day` date, `reason` text null (≤ 200 znaków; wymagany od drugiego wpisu), `set_by_role` text (rola, nie dane osobowe), `set_by_membership_id` uuid null (do audytu), `set_at` timestamptz. Indeks `(restaurant_id, set_at desc)`. Bez `UPDATE` i `DELETE` w repozytorium. Aktualny dzień = najnowszy wiersz. Encja przez `defineEntity`, migracja `npm run db:migration:create`, dowód up/down/up (`standards` §12; `down` kasuje tylko tę tabelę, w produkcji wymaga osobnej decyzji jak E03 Q19), `npm run schema:check`.

Nowa metoda portu (kontrakt + pamięć + PostgreSQL, każda z `restaurantId`): `SalesRepository.checkTotalsMarked(restaurantId, period): Promise<MarkedCheckTotals[]>` = `CheckTotals` plus `hasCode: boolean` (rachunek ma aktywną linię z `recommendation_code`). Serwis woła ją **raz** dla `[B.from, koniec ostatniego okna]` i dzieli wynik w pamięci (nie N zapytań na N okien) **[przegląd]**. Wybrano nową metodę zamiast pola w `CheckTotals`, bo `aggregateChecks` świadomie nie czyta kodu (kontrakt E04 zostaje bez zmian). Nowy port `ProofLaunchRepository` (`current`, `history`, `append`) z przypadkami w `repositoryContract`.

### Pliki
- `packages/core/src/services/proof/proof-report.ts`: czyste `proofWindows(launchDay, index, now)`, `wilsonInterval`, `newcombeDifference`, `computeProofReport`, stałe progów. Wzór stylu: `sales-kpis.ts`.
- `packages/core/src/services/proof/proof-report-service.ts`: `ProofReportService` (deps: `clock` (źródło `now`), `restaurantRepository`, `salesRepository`, `recommendationCodeRepository`, `proofLaunchRepository`; wzór: `sales-kpi-service.ts`); `getReport(slug, window)`, `setLaunchDay(slug, input, actor)`, błędy jako `ValidationError` / `VersionConflictError` (obie już na liście `server/domain-errors.ts`, nowych klas nie wprowadzamy; `core/src/errors.ts:19,59`).
- `packages/core/src/validators/proof/launch-day.schema.ts` (`strictObject`), `window.schema.ts`.
- `packages/core/src/auth/permissions.ts`: `proof.view`, `proof.manage` w `BUSINESS`; test macierzy.
- `packages/core/src/ports/sales.ts`, nowy `ports/proof.ts`, `memory/*`, `packages/db/src/repositories/*` i encja; eksport w `core/src/index.ts`; rejestracja w `app/src/server/container.ts`.
- `packages/app/src/app/api/v1/restaurants/[slug]/proof-report/route.ts` i `proof-launch/route.ts` (`handle()`, literalny `route`, `parseBody`; skill `wine-match-new-api-route`; `npm run check:routes`).
- `packages/app/src/app/(admin)/admin/[slug]/proof/page.tsx` (A33), `proof/print/page.tsx` (A34, F2), `proof-actions.ts` (`authorizeAction(slug, 'proof.manage')`), wpis w nawigacji panelu tylko dla `proof.view`; słowniki `i18n/en.ts` i `pl.ts`.
- Testy: `core/tests/proof-report.test.ts`, kontrakt repozytoriów, `db/tests` (migracja, `test:db`), `app/tests/e2e/proof-report.e2e.test.ts`, `app/tests/e2e/proof-boundary.e2e.test.ts`; scenariusze QA; `scripts/smoke.mjs` bez zmian (strona za logowaniem).

### Ekran A33 `/admin/{slug}/proof?window=N`
Układ od góry: (1) nagłówek i okno („Okno 2: 15.12.2026 – 11.01.2027”, linki „poprzednie / następne” jako `?window=`); (2) karta wyniku: dwa duże liczniki „Przed: 35% (42 z 120 rachunków)” i „Po: 50% (65 z 130)”, pod nimi zmiana „+15 punktów procentowych, przedział od +3 do +27”, werdykt jednym zdaniem; **albo** komunikat „za mało danych” z powodami i „co zrobić”; (3) tabela okien (baza, okna 1…k) z N, procentem, przedziałem, dniami z danymi; (4) „Rachunki z kodem i bez” z zastrzeżeniem; (5) „Kody polecenia”; (6) „Jak to liczymy” i „Czego ten raport nie mówi”; (7) formularz dnia uruchomienia (`proof.manage`) z historią wpisów. Kolejność kart ma uwagę kupującego na liczbie i jej niepewności, nie na ozdobach. Komponenty `@wine-match/ui`, desktop-first, 390 px bez poziomego przewijania.

ID: **[przegląd]** A32 jest zajęte przez zatwierdzoną `2026-11-16-catalog-field-editing.md` (Q11, „nowa pozycja”; użyte też w `docs/SCREEN_SPECIFICATION.md` na gałęzi `feat/catalog-field-editing-c1`), dlatego raport to **A33**, druk **A34** (A19–A31 zajęte; E22 używa DM*); dopisać A33/A34 do tabeli planu przy przydziale. Dopisać do `SCREEN_MAP.md` pod A1 (`A33 Raport dowodu ... /admin/{slug}/proof?window=`, `└─ A34 Wersja do druku ... /admin/{slug}/proof/print?window=`) i do tabeli ról (owner/GM ✓, pozostali –).

### Kolejność kroków (każdy osobnym PR, ≤ ok. 150 linii poza wyjątkami)
1. `proof-report.ts` + testy AC1, AC2, AC4, AC6 (czysta funkcja, `risk-low`).
2. Port `checkTotalsMarked` (kontrakt, pamięć, PostgreSQL) + test AC3.
3. Tabela `proof_launch_day`, port, migracja z dowodem up/down/up (`risk-high`: migracja), AC5.
4. `ProofReportService`, uprawnienia (AC8, AC10 część rdzeniowa).
5. Trasy API, schematy, `check:routes`, test granicy (AC11, AC12, AC13), wiersz w threat-model.
6. A33, słowniki, scenariusze QA i e2e (AC7, AC9, AC14, AC15), docs (AC17).
7. F2: A34 (AC16).

## Treść handlowa (do decyzji właściciela, bez implementacji)
Poniższe to **hipoteza** z P3 strategii; nic w tej specyfikacji jej nie wdraża. E15 wprost wyłącza rozliczenia za wynik, więc zwrot to decyzja handlowa poza systemem płatności albo zmiana E15.

**Propozycja oferty (plan Pro):** „Jeśli po 60 dniach przy wystarczającej próbie Wine Attach Rate nie wzrósł, zwracamy abonament za te dwa miesiące.” Raport dostarcza jedyny uczciwy sędzia: liczby z kasy restauracji i przedział niepewności.

**Jak raport mógłby to rozstrzygać (do wyboru):** „60 dni” to dwa kompletne okna (56 dni) plus czas na import. *Wystarczająca próba* = progi R3 spełnione w bazie i w oknie 2. *Brak wzrostu* w wariancie A: Δ okna 2 ≤ 0 pp (estymata punktowa); B: Δ < +X pp (X ustala właściciel po poznaniu bazy, Q11); C: górny koniec przedziału < 0 (najostrzejszy dla klienta, najtańszy dla nas, uczciwy statystycznie, ale rzadko spełniony przy małych próbach). **Rekomendacja agenta: A**, z warunkiem „wystarczająca próba”; w razie niewystarczającej próby oferta nie wygasa, tylko czeka na kolejne okno.

**Ryzyka oferty:** (1) klient może zmienić kartę, ceny lub sezon i obwinić produkt albo odwrotnie; raport tego nie odróżni; (2) klient wpływa na dowód (dzień uruchomienia, przerwanie importu): stąd dopisywany L z powodem, żądanie ciągłości importu (dni bez danych w oknie nie dopuszczają „wystarczającej próby”) i brak edycji; (3) mała restauracja nigdy nie osiągnie 30 rachunków w oknie, więc oferta jej nie obejmie albo wymaga dłuższego okna; (4) zobowiązanie finansowe wymaga zapisu w regulaminie i opinii prawnej o sformułowaniu; (5) **[przegląd]** wariant A karze szum: przy realnym +5 pp i 30 rachunkach w oknie P(Δ̂ ≤ 0) ≈ 35% (przy 130 rachunkach ≈ 21%), więc zwrot należałby się często mimo działającego produktu; wariant A wymaga progu próby wyższego niż R3 albo uwzględnienia przedziału; (6) A05 nadal niesprawdzone: jeśli wzrost jest mniejszy niż zakładany, oferta zadziała jako zwrot, nie jako reklama. Raport nie wyświetla słów „gwarancja” ani „zwrot” (R8): to treść umowy, nie ekranu.

## Nakładanie z kalkulatorem ROI (E22) i dashboardem KPI
| Obszar | Wspólne | Różnice i decyzja |
|---|---|---|
| **Kalkulator ROI** (`/demo/roi`, DM2/DM3, `core/showcase/roi.ts`) | pojęcie Wine Attach Rate, układ do druku A4 bez JS (wzór DM3), zasada „każda liczba ma pochodzenie” | kalkulator jest **prospektywny i publiczny**: założenia zespołu (a0 = 30%, +5 pp), nigdy „zmierzone”; raport jest **retrospektywny i w panelu**: dane z kasy. Test E22 zakazuje słów „zmierzon…” na `/demo`; ten zakaz zostaje, a raport ich używa wyłącznie w grupie tras `(admin)`. Raport nie importuje `showcase/*` i nie pokazuje wyniku kalkulatora; F-później (poza zakresem): link „Przelicz zwrot z Twoją bazą” przekazujący zmierzone `a0` do `/demo/roi?attachRate=` |
| **KPI A1** (`AnalyticsService.salesSummary`, `SalesKpiService`, `kpiWindow`, `MIN_RATE_SAMPLE`) | ta sama definicja i funkcja `computeSalesKpis`, próg 30, 28 dni | A1 porównuje ruchome 28 dni z poprzednimi 28 (Q17) bez niepewności; raport ma stałą bazę z D20 i przedział. A1 **nie zmienia się** w F1; dodamy tylko link „Zobacz raport dowodu” przy kafelku Wine Attach Rate dla `proof.view` (opcja, jeden wiersz). AC3 pilnuje równości liczb. D20 wskazywał brak „stałego baseline pilota” na A1: ta specyfikacja to dostarcza, więc po akceptacji wpis „Later” w `docs/SCREEN_SPECIFICATION.md` zastąpić odnośnikiem do A33 |
| **A13 import** | źródło danych i jego ograniczenia (zastępowanie rachunków) | raport pokazuje „dane do dnia”, daty brakującej bazy i link do A13 |
| **Kody E09** | `RecommendationCodeService.summary`, `unmatchedPosCodes` | tylko odczyt |

## Fazy
- **F1: raport w panelu** (A33, serwis, tabela L, API, uprawnienia, QA, e2e, docs). Wartość samodzielna: właściciel widzi wynik.
- **F2: wersja do druku** (A34), z opcjonalnym linkiem z A1.
- **F3: okresy pomiaru przyczynowego** (naprzemienne okresy z rekomendacją i bez, jak w P3) jako **osobna specyfikacja**; wymaga decyzji, czy restauracja zgodzi się wyłączać rekomendacje na tygodnie i jak to ukryć przed gościem; nie budować przed wynikami F1 z pierwszego pilotażu.

## Ryzyka i otwarte pytania

### Ryzyka
- **Małe próbki.** Restauracja z 10 rachunkami z winem w tygodniu nie dojdzie do progu w oknie. Raport mówi „za mało danych” i podaje, ile brakuje; to zamierzone, ale ryzykuje pusty pierwszy raport (miara: odsetek pilotaży z odczytywalnym wynikiem).
- **Wielokrotne porównania.** Okna 1…k to wielokrotne spojrzenia na te same dane; przedziały 95% przy każdym oknie osobno nie są poprawione na wielokrotność. Opis „Jak to liczymy” to mówi; werdykt nie jest testem hipotezy i nie służy do automatycznych decyzji. **[przegląd]** Wilson zakłada niezależne rachunki, a rachunki tego samego dnia są skorelowane (weekend, pogoda), więc rzeczywista niepewność jest większa niż pokazana; blok „Jak to liczymy” mówi to wprost, a przedział nazywa „co najmniej tak szeroki”.
- **Sezonowość i zmiany poza produktem** (karta, ceny, wydarzenia, pogoda): R9 i blok „Czego ten raport nie mówi”; nie próbujemy ich korygować.
- **Dane POS.** Brak eksportu w lokalu lub brak historii 28 dni przed startem = brak bazy (`baseline_no_data`); pomiar tylko kodami (D16, Q12) nie daje Wine Attach Rate przed/po, więc raport go nie obsługuje. Eksport ręczny to najsłabsze ogniwo (strategia 3.6, N04).
- **Źle wpisany dzień uruchomienia** przesuwa bazę. Środki: wpisy dopisywane z powodem, widoczna historia, brak edycji; podpowiedź dnia z pierwszego wydanego kodu (Q3).
- **Kod niewpisany do kasy** zaniża grupę „z kodem”; zestawienie jest korelacją z selekcją (stoliki chętne na wino częściej mają kod). Zastrzeżenie R6 jest stałe, nie do wyłączenia.
- **Przedwczesny wniosek właściciela** (np. „+15 pp, więc wszystko działa”). Mitigacja: przedział obok liczby, „inconclusive” wprost, brak słów o przyczynie.
- **RODO i tajemnica przedsiębiorstwa.** Raport to agregaty jednego lokalu, bez danych osobowych (nie ma gościa, nazwiska, nazw pozycji, `check_id`). Wydruk i zrzut ekranu opuszczają system, ale zawierają tylko dane właściciela. Benchmark i uczenie między lokalami wymagają osobnej podstawy i umowy (D23), nie wchodzą tu.
- **Rozmiar zmiany:** migracja (`risk-high`: dwa niezależne przeglądy), nowe uprawnienie i trasy; kroki 1–7 trzymają PR-y małe.

### Pytania otwarte (z rekomendacją; decyzja: Filip)
1. [OK 2026-11-18] **Progi: 28 + 28 dni, 30 rachunków (D20), 14 dni z danymi na okno?** Rekomendacja: tak, z `PROOF_MIN_TRADING_DAYS = 14`; po pierwszym pilotażu skorygować na podstawie danych (30 rachunków daje przedział ok. ±17 pp dla jednego okna, a dla zmiany ok. ±25 pp: przy 30 + 30 rachunków `increase` pojawia się dopiero od ok. +27 pp **[przegląd]**, patrz H5; to cena prostoty, a próg wyższy opóźni wynik małych lokali).
2. [OK 2026-11-18] **Czy pokazywać procent okna poniżej 30 rachunków?** Rekomendacja: nie, tylko „N z M”.
3. [OK 2026-11-18] **Skąd dzień uruchomienia?** Rekomendacja: wpisuje owner/GM, formularz podpowiada dzień pierwszego wydanego kodu (wymaga jednej metody `firstServiceDay` w porcie kodów) lub pierwszej publikacji; nie wyprowadzać go automatycznie.
4. [OK 2026-11-18] **Kto widzi raport?** Rekomendacja: owner i GM (`proof.view`); sommelier nie (ma interes w wyniku i widzi kafelki sprzedaży na A1). Do potwierdzenia, bo `docs/USER_ROLES.md` dziś daje A1 sommelierowi.
5. [OK 2026-11-18] **„Miesiąc” czy okno 28 dni?** Rekomendacja: okno 28 dni (równe tygodnie); w tekście „4 tygodnie”, a daty zawsze podane.
6. [OK 2026-11-18] **Zamrażać migawkę raportu po zamknięciu okna?** Rekomendacja: nie w F1 (rachunki z importu mogą być zastępowane; pokazujemy „dane do dnia …”); jeśli właściciel chce „raport podpisany na dzień”, to F2+ z tabelą migawek i osobną migracją.
7. [OK 2026-11-18] **Czy dopuszczamy zmianę L po fakcie?** Rekomendacja: tak, ale tylko dopisaniem z powodem i widoczną historią (R5).
8. [OK 2026-11-18] **Zwrot abonamentu po 60 dniach: czy oferujemy, w którym planie i według którego wariantu (A, B, C)?** Rekomendacja: wariant A, tylko plan Pro, po opinii prawnej i zmianie regulaminu; do czasu pierwszego pilotażu nie obiecywać publicznie (A05 niesprawdzone).
9. [OK 2026-11-18] **Nazwa w EN:** „Proof report” (spójne ze strategią) czy neutralniej „Results report”, bo „proof” może brzmieć jak gwarancja? Rekomendacja: „Results report”; w PL „Raport dowodu” zostaje (słowo „dowód” jest z pozycjonowania).
10. [OK 2026-11-18] **Co jest „sukcesem” pilota (Q02, Q11, K03)?** Poza tą specyfikacją, ale raport go nie rozstrzyga: pokazuje liczby i niepewność. Rekomendacja: ustalić po poznaniu bazy, nie z góry +5 pp.

## Przegląd niezależny (2026-11-18)
Świeży kontekst, bez udziału autora. H2–H5 przeliczone skryptem (Wilson z = 1,96; Newcombe, metoda 10): zgodne z tabelą w granicach 0,05 pp (np. H2 [+2,73; +26,62], H5 [−10,16; +28,81]); H1 zgodne (5, 2, 40,0%; 50,0%; 33,3%). Poprawki w treści oznaczone **[przegląd]**; `status` bez zmian. Razem 19 ustaleń.

### Blokujące (naprawione w treści)
1. **A32 zajęte** przez zatwierdzoną `2026-11-16-catalog-field-editing.md` (Q11) i `docs/SCREEN_SPECIFICATION.md` na `feat/catalog-field-editing-c1`. Raport = A33, druk = A34. `security-033` też zajęte na tej gałęzi: użyć 034–035 (`check:qa` odrzuca duplikaty).
2. **Kompletność okna tylko z zegara.** Wczoraj bez importu (eksport ręczny, N04) dawało „kompletne” okno z 20 dniami danych i werdykt; dochodzi `window_not_imported` (`dataRange.to`). Dzień liczony `serviceDay` (cięcie 04:00, `recommendation-code/service-day.ts:8`), nie `localDate`, zgodnie z kodami E09.
3. **Zapis L.** `PUT` dopisujący wiersz nie jest idempotentny, a „powód od drugiego wpisu” to sprawdź-potem-wstaw bez blokady (standardy §12.4). Teraz `POST`, `expectedCurrent`, 409, `seq` z `CHECK` w bazie, AC19.

### Ważne
4. **Moc.** Przy 30 + 30 rachunkach `increase` dopiero od ok. +27 pp (przedział zmiany ok. ±25 pp, nie ±17); Q1 poprawione.
5. **Wariant A zwrotu** zwraca pieniądze w ok. 35% przypadków przy realnym +5 pp i n = 30; dopisane ryzyko (5).
6. **Grupa „z kodem”** ma odsetek z definicji bliski 100% (kod przy zamówieniu wina, D16); zastrzeżenie R6 uzupełnione.
7. **Wielokrotne spojrzenia i niezależność.** Wilson ignoruje korelację w obrębie dnia; przedział jest „co najmniej tak szeroki”. Brak domyślnego okna: ustalić „najnowsze kompletne”. Zakaz L w przyszłości zmusza do wpisu po zobaczeniu danych: rekomendacja, by dopuścić L do +14 dni jako „zaplanowany”. Oznaczenie „L zmieniony po oknie 1” dodane.
8. **Sommelier ma `import.manage`** i może zastąpić rachunki bazy; uzasadnienie R10 było nieścisłe (poprawione, Q4 do uzupełnienia).
9. **N zapytań na N okien** i `salesPeriodSchema` ≤ 366 dni: jedno zapytanie, okna 1..12.
10. **AC9** z podciągiem „AI” trafiałby w ładunek RSC; test na widocznym tekście, `\bAI\b`; zdanie werdyktu `increase` ustalone w R4.
11. **Zaokrąglenie przedziału** do pełnych pp mogło dać „od +0” przy `increase`; zaokrąglanie na zewnątrz.
12. **Nazwa:** PL „Raport dowodu” przy „inconclusive” obiecuje więcej niż dane; rekomendacja „Raport wyników” (PL) i „Results report” (EN), `proof` tylko w ścieżce i uprawnieniach (Q9 nierozstrzygnięte).

### Drobne
13. Nowe klasy błędów zbędne (`ValidationError`, `VersionConflictError` już są). 14. Serwis ma `clock` w deps. 15. Wzór Newcombe'a jawnie. 16. Kroki 3 i 6 dzielić (migracja od portów; A33 / QA+e2e / docs). 17. Append-only tylko konwencją: test, że port nie ma `update`/`delete`; wiersz w threat-model. 18. `hasCode` tylko dla `quantity > 0`. 19. Zmiana czasu: testować 2026-10-25 i 2027-03-28; okno ma zawsze 28 dat.

### Gotowość
Zatwierdzona przez właściciela 2026-11-18. Decyzje: Q1 progi bez zmian, raport pokazuje „najmniejszą zmianę możliwą do wykazania” (moc ok. 27 pp); Q4 sommelier bez dostępu; Q9 nazwa PL „Raport wyników”, EN „Results report”; zwrot abonamentu: bez wariantu A.

## Changelog
- 2026-11-18 — Autor/recenzent: not recorded / not recorded (szkic).
- 2026-11-18 — Przegląd niezależny (świeży kontekst): poprawki [przegląd]; ekrany A33/A34.
- 2026-11-18 — Właściciel przyjął rekomendacje do pytań 1–10 (z zastrzeżeniami: moc, rola sommeliera, nazwa PL, zwrot); draft.
- 2026-11-18 — Zatwierdzona (status approved) z decyzjami Q1, Q4, Q9 i wariantu zwrotu jak w „Gotowość”.

## Realizacja
Kroki 1–7 na `main`: #184, #188, #191, #196, #197, #198, #201 (A34). Logi: `.ai/runs/2026-11-19-results-report-core.md`, `2026-11-22-results-report-s2-s4.md`, `2026-11-25-results-report-s3-review-fixes.md`, `2026-11-24-results-report-s5-s7.md`.

W3: nieaktualny dzień uruchomienia daje `version_conflict` (409), nie `stale_launch_day`; R11 poprawione.

AC (kod, testy, logi): AC1–AC13, AC15–AC19 spełnione (AC16–AC17: A34 i dokumentacja w #201, `e2e` w CI zielone na #201). Odstępstwo: AC14 (układ A33) sprawdzony ręcznie Playwrightem przy 390 i 1440 px, a test `proof-report-layout.e2e.test.ts` wymaga `agent-browser` i nie jest uruchamiany w tej sesji; druk A34 sprawdzony ręcznie (emulacja druku), nie zautomatyzowany.

Uwagi z przeglądu po wdrożeniu (2026-11-27, model inny niż autora zlecony przy uruchomieniu, nie potwierdzony; bez uwag blokujących):
- Pola AC14, AC16 i AC18 zostają nieodhaczone celowo: AC14 (układ A33) i AC16 (druk A34) sprawdzono ręcznie, bez uruchomienia testu e2e z `agent-browser`; dla AC18 nie ma zapisanego dowodu up/down/up osobno dla migracji `proof_launch_day` (ogólny test `migrations-roundtrip` działa w CI, ale nie zweryfikowano, że obejmuje tę migrację). AC17 odhaczone (dokumentacja w #201).
- Kontrakt `POST …/proof-launch` w kodzie jest szerszy niż R11: dochodzą `If-Match`, 428 `precondition_required`, 400 `invalid_if_match`, 422 `reason_too_long`, a `expectedCurrent` jest opcjonalne; źródłem prawdy jest `docs/API_SPECIFICATION.md`.
- Brak dowodu mutacji dla `checkTotalsMarked` (czyta sprzedaż); dowód z AC11 dotyczy `PgProofLaunchRepository.read`.
- Append-only trzyma konwencja i test kształtu portu; baza nie ma triggera ani `REVOKE`. Indeks `(restaurant_id, set_at)` nie jest malejący, zapytania sortują po `seq`. Scenariusz `security-035` nie istnieje, jest `security-034`.
