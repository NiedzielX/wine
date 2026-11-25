---
status: draft
created: 2026-11-25
owner: Filip Niedziela
related: [.ai/specs/2026-11-18-restaurant-picks.md (F3 stąd), .ai/specs/2026-11-18-owner-proof-report.md (A33, grupy z kodem i bez), .ai/specs/implemented/2026-10-15-pos-sales-import-attach-rate.md (E03, Q9, Q10, Q18), .ai/specs/implemented/2026-10-15-kpi-dashboard.md (E04), .ai/specs/implemented/2026-10-16-recommendation-code.md (E09), .ai/specs/2026-11-04-restaurant-operations.md (E19), .ai/specs/2026-11-16-catalog-field-editing.md (C1), .ai/specs/product-brief.md (D20, D22–D25, R06, N02–N04), .ai/specs/research/benchmarks/2026-11-16-product-strategy-vs-sommelierbot.md (P12), docs/SCREEN_MAP.md, docs/USER_ROLES.md, docs/DATA_MODEL.md, docs/API_SPECIFICATION.md, docs/security/threat-model.md, .ai/docs/engineering-standards.md (§10–§12), .ai/runs/2026-11-25-margin-dashboard-spec.md]
superseded_by:
author_model: not recorded
reviewed_by: not recorded
review_independence: none
---

# Pulpit marży restauracji (koszt zakupu, marża win i poleceń)

## TLDR
Właściciel i GM znają ceny na karcie, ale nie widzą w panelu, ile z nich zostaje po zakupie. Dodajemy **opcjonalny koszt zakupu netto za butelkę** (osobna tabela, nigdy w migawce, API gościa, zdarzeniach ani logach), widoczny i edytowalny **tylko dla owner i manager**, oraz **A35 „Pulpit marży”** (A36 „Koszty win”). Pulpit liczy marżę jednostkową i procentową każdego wina, **marżę z poleceń zamówionych z kodem**, udział poleceń kierujących do win o wysokiej marży i **widełki** marży z win w sprzedaży z POS. Silnik, kolejność i wyświetlany Match Score **nie zmieniają się** (marża nie wchodzi do rankingu); pulpit tylko pokazuje i podpowiada decyzje człowieka (wybory restauracji D24, pary sommeliera, ceny). Ograniczenie z kodu, od którego zależy cały projekt: **POS nie niesie wina ani nazwy pozycji** (E03 Q10, Q18), więc marży na konkretne wino ze sprzedaży z kasy nie policzymy; liczymy to, co da się uczciwie wyprowadzić, i mówimy wprost, czego nie. Wszystkie progi to propozycje (`[ASSUMPTION]`). Specyfikacja jest `draft`; sekcja „Decyzje dla człowieka” czeka na rozstrzygnięcie.

## Problem
- **Dla kogo:** owner i GM, którzy płacą za produkt i, zgodnie z D24, chcą wyższej marży restauracji; strategia (P12) wskazuje to jako oś przewagi nad czatami (brak narzędzi marży u konkurentów jest tropem z desk researchu, nie zmierzonym faktem).
- **Stan dziś (sprawdzone w kodzie):** `Wine` ma `glassPrice`, `bottlePrice`, `glassPour`, `bottleSize`, **nie ma kosztu**; w imporcie menu synonim `cost`/`koszt` oznacza **cenę** (`import/mapping.ts`), w imporcie win kolumny kosztu nie ma. `sales_record` ma typ pozycji, ilość i kwotę netto, **bez wina i bez nazwy pozycji** (Q10 odroczył dopasowanie, Q18 zakazał przechowywania nazw). `recommendation_code` ma `wineId`, `serving` (`glass`/`bottle`), `tier`, **nie ma flagi `pick`** (picks F3 zapowiada ją jako warunek). Wybory restauracji (A27) i symulator „przed / po” istnieją, **bez kolumny marży**.
- **Czego nie wiemy:** czy pilot poda koszty (zależy od właściciela i od tego, czy zaufa produktowi z tajemnicą handlową; miara: odsetek win z kosztem po 2 tygodniach), czy ceny na karcie są brutto (zakładamy tak, D2), jaka marża jest „wysoka” w lokalu (D6).

## Cel i zakres
Owner i GM widzą, ile marży (cena netto minus koszt) dają wina na karcie i polecenia, i dostają krótką listę rzeczy **do rozważenia**, z zachowaniem zasad produktu: sommelier ponad modelem (R06), bez „AI” w interfejsie gościa (N02), Match Score zawsze wynikiem silnika, wybory restauracji (D24) i przyszły sponsoring (D25) zawsze oznaczone.

**W zakresie:** tabela kosztów i jej bezpieczeństwo; czyste funkcje marży; serwisy w `core`; uprawnienia `margin.view` i `cost.manage`; trasy API; A35 i A36 (PL i EN, bez JavaScriptu); kolumna marży w symulatorze A27 dla `margin.view`; flaga `pick` w `recommendation_code` (prospektywna); dokumentacja, QA, test granicy, test przecieku.

**Poza zakresem:** zmiana silnika, wag, kolejności i wyświetlanego wyniku (podbicie wyniku to F2 z picks, osobna decyzja i opinia prawna); koszt w migawce, API gościa lub zdarzeniach; dopasowanie pozycji POS do win i przechowywanie nazw pozycji (zmienia E03 Q10, Q18; D5); import kolumny kosztu w tej specyfikacji tylko jako ostatni, osobno zatwierdzany krok (PR10); zapas i magazyn (N04); rabaty dostawców, bonusy, kampanie sponsorowane (D22, D25: osobna specyfikacja; tu tylko rezerwa, D11); benchmark między lokalami (D23); historia kosztu w czasie (D12); eksport marży do CSV (E20); powiadomienia; wykresy; przychód i Wine Attach Rate (E04, raport wyników).

## Nakładanie z istniejącymi specyfikacjami (rozstrzygnięcie)

| Specyfikacja | Co już jest | Co robimy tu |
|---|---|---|
| E04 / A1 (kafelki sprzedaży) | przychód z wina na rachunek i na gościa, średnia butelka i kieliszek, netto, z POS | **Nie powielamy.** Pulpit czyta `SalesKpiService` i `CheckTotals`; liczby przychodu są te same. Na A1 **nie** dodajemy marży: A1 widzi sommelier (D9) |
| Raport wyników (A33, A34) | Wine Attach Rate przed i po, zestawienie rachunków z kodem i bez (przychód, bez Δ, korelacja), progi próby, przedziały Wilsona | **Nie powielamy.** Marża rachunku z kodem i bez nie jest liczona (D5: przy stałym współczynniku byłaby przeskalowanym przychodem); A35 linkuje do A33. Wspólne: `MIN_RATE_SAMPLE`, `wilsonInterval`, reguły „za mało danych” (importowane, nie kopiowane) |
| Wybory restauracji (A27, F1) | zbiór, migawka, symulator bez marży; F3 = „raport marży” jako szkic | **Ta specyfikacja jest F3** i zastępuje szkic. Dopisanie odnośnika w picks po akceptacji (przez człowieka lub osobny PR; picks jest `in-progress`, tego przebiegu nie edytuję) |
| E19 | F1 dostępność wina (`active`/`isOrderable`), F2 zastąpione przez picks, brak „zapasu” | Statystyki karty liczą tylko wina aktywne; „wyprzedaj zapas” zostaje poza zakresem (N04) |
| E09 (kod polecenia) | `summary`, `pairStats`, R10 „zamówione” = potwierdzone ∪ dopasowane w POS | Nowa metoda odczytu `orderedByWine` (D5, R8); definicja „zamówione” bez zmian |
| C1 (edycja katalogu) | `catalog.edit` zmienia ceny, audyt `catalog_edit` bez kosztu | Koszt **nie** przechodzi przez `CatalogEditService`, nie trafia do `catalog_edit`; osobny audyt |
| Strategia P12 | cztery części: dane o marży, podbicia, symulator, raport marży | Realizujemy części 1, 3 (kolumna marży) i 4; część 2 (podbicia wyniku) poza zakresem |

## Decyzje dla człowieka
Każda ma rekomendację; po zatwierdzeniu przez człowieka wchodzi do treści jako rozstrzygnięta. Do czasu odpowiedzi implementacja nie startuje (AGENTS.md §3).

| # | Pytanie | Rekomendacja | Alternatywa i skutek |
|---|---|---|---|
| **D1** | Skąd koszt? | **Osobna tabela `wine_cost`** (restauracja, wino, koszt butelki netto), nie kolumna `wine`, nie pole typu `Wine`. Wpis ręczny: A36 (tabela zbiorcza) i pole na A5. Import kolumny dopiero w PR10, po zatwierdzeniu | Kolumna w `wine` i pole `Wine.cost`: `buildSnapshot`, `PublishedView`, API win i `guest` czytają `Wine`, więc koszt wyciekłby przez każdy mapper; osobny port daje barierę strukturalną, nie tylko dyscyplinę |
| **D2** | Podstawa kwot i VAT | Koszt wpisujemy **netto** (z faktury); cena z karty to brutto, więc `cena netto = cena / (1 + 0,23)` (`WINE_VAT_RATE`, stała w `core`, widoczna na ekranie jako założenie). Do potwierdzenia z pilotem: czy ceny karty są brutto i czy 23% pasuje do ich win (księgowość) | Ustawienie stawki per lokal (kolumna): później, gdy pilot tego zażąda. Bez tej decyzji marża jest przeszacowana o ok. 23% ceny |
| **D3** | Koszt kieliszka | `koszt butelki × glassPour / bottleSize`, **bez strat** (rozlew, korki, niedopite butelki); ekran mówi „bez strat”. Współczynnik strat: odłożony | Współczynnik strat per lokal: dokładniejszy, ale kolejne pole bez danych z pilota |
| **D4** | Kto widzi koszt i marżę | `margin.view` i `cost.manage`: **owner i manager**; sommelier, kelner i administrator platformy: **nie** (jak `proof.view`: sommelier ma interes w wyniku, a „sommelier ponad modelem” wymaga, by nie decydował pod marżę; koszt to tajemnica przedsiębiorstwa lokalu) | Sommelier z `margin.view`: przydatne przy układaniu karty; wymaga osobnej decyzji po pilocie. Ujawnia koszt osobie, która może zmienić pracę (ryzyko wyłącznie umowne) |
| **D5** | Marża na rachunek i „udział win o wysokiej marży w sprzedaży” przy braku wina w POS | Trzy uczciwe miary zamiast jednej fałszywej: (a) **marża jednostkowa i % z karty**; (b) **marża z zamówionych poleceń** (kod niesie wino i porcję; to marża win, które goście zamówili z kodem, **nie** „dodatkowa” marża); (c) **widełki** marży z win w sprzedaży z POS (kwota netto kieliszków i butelek razy najmniejszy i największy % marży win karty z kosztem). **Nie** importujemy nazw pozycji ani nie dopasowujemy pozycji do win | Dopasowanie pozycji POS do win (nazwa, numer na karcie): marża na wino i prawdziwy udział w sprzedaży, ale zmienia E03 Q10 i Q18, dane osobowe w tekście wolnym, kruchość mapowania. Osobna specyfikacja, jeśli pilot jej zażąda |
| **D6** | Co to „wysoka marża” | Wina **≥ mediany** marży % win z kosztem **tej samej porcji** (kieliszek i butelka osobno), wymagane ≥ 3 wina z kosztem. Przy tak zdefiniowanej klasie połowa karty jest „wysoka” z konstrukcji, więc udział poleceń ≈ 50% znaczy „brak skrzywienia” | Próg ustawiany przez lokal (np. 60%): więcej pracy dla właściciela, zawyża rozbieżne definicje między lokalami |
| **D7** | Wpływ kodu polecenia i wyborów restauracji | Opis, bez Δ, bez werdyktu przyczynowego: liczby z progiem próby (≥ 30 zamówionych poleceń) i przedziałem Wilsona; wybór restauracji wybierany przez właściciela jest z definicji bardziej marżowy, więc **porównanie marży na polecenie byłoby tautologią**; mierzymy **konwersję** (zamówione / wydane) poleceń z etykietą i bez, jak w picks F1 | Test okresami „z wyborami i bez” (strategia P12/4): konfundowany sezonem i kartą; osobna specyfikacja, nie tu |
| **D8** | Czy marża wpływa na ranking | **NIE.** `engine/` bez zmian (`ENGINE_VERSION` bez zmian), kolejność z picks bez zmian, `matchScore` nie podbijany. Marża tylko w symulatorze A27 (szacunek przy niezmienionej konwersji) i w podpowiedziach „do rozważenia” | Podbicie wyniku według marży: F2 z picks, wymaga PR-B, decyzji właściciela i opinii prawnej; tu poza zakresem |
| **D9** | Ekrany | **A35** `/admin/{slug}/margin` (odczyt), **A36** `/admin/{slug}/margin/costs` (zapis); numery wolne po A34 (raport wyników). Bez kafelka na A1 i bez marży w A4 dla sommeliera | Kafelek na A1: A1 jest dostępny dla sommeliera, więc kafelek byłby przeciekiem albo wymagałby warunkowego układu |
| **D10** | Okres | Ten sam wybór okresu co A13 (`SalesPeriod`, do 366 dni, domyślnie `defaultSalesPeriod`), bez nowych okien i bez bazy sprzed uruchomienia | Okna 28 dni z raportu wyników: tam jest „przed i po”, tu opis okresu |
| **D11** | Sponsoring (D22, D25) | Specyfikacja **nie dodaje** pola „sponsor”. Gdy powstanie, pozycje sponsorowane są w pulpicie **osobną, oznaczoną linią** i nie liczą się jako „wybór restauracji”; rabat dostawcy nie zmniejsza kosztu (koszt = cena z faktury) | Wspólna kategoria z wyborami: mieszałaby oznaczenia i zaniżała koszt |
| **D12** | Historia kosztu | **Brak** w tej fazie: marża liczona po **bieżącym koszcie i bieżącej cenie** z karty; ekran mówi „po bieżących cenach i kosztach”; zmiany kosztu zostają w dzienniku `wine_cost_edit` | `effective_from` per wpis: dokładniejsze dla okresów po zmianie ceny, ale kosztuje model i UI; wrócimy, jeśli ceny zmieniają się często |
| **D13** | Reguła w dokumentach | Wiersz T-… w `threat-model.md`, akapit w `USER_ROLES.md` i `DATA_MODEL.md` (R16). Jedno zdanie w `AGENTS.md` §7 („koszt zakupu i marża tylko dla owner i manager; nigdy w migawce, API gościa, zdarzeniach, logach, silniku”) **tylko osobnym PR-em właściciela** (CODEOWNERS) | Bez wpisu w AGENTS.md reguła jest sprawdzana testami AC, ale nie jest widoczna dla każdego agenta |
| **D14** | Dane demo | Seed demo **bez kosztów** (konta demo mają publiczne hasło, a `/demo/*` jest publiczne); A35 w demo pokazuje stan pusty z opisem. Ewentualny seed z oznaczeniem „przykładowe” tylko na decyzję | Przykładowe koszty w demo: lepsza prezentacja, ale ktoś mógłby wziąć je za dane lokalu |

## Definicje metryk
Wszystkie obliczenia na liczbach niezaokrąglonych; zaokrąglenie dopiero przy wyświetleniu (PLN do 0,01, procent do 0,1). Czyste funkcje w `core/src/services/margin/margin.ts`, bez I/O i zegara.

| Pojęcie | Definicja |
|---|---|
| **Koszt butelki `C`** | netto, PLN, `0 < C ≤ 50 000`, dwa miejsca po przecinku; opcjonalny (brak = wino bez kosztu) |
| **Cena netto porcji `N`** | `cena z karty / (1 + v)`, `v = 0,23` (D2); porcja bez ceny (`glassPrice = null`) nie ma marży kieliszka |
| **Koszt porcji** | butelka: `C`; kieliszek: `C × glassPour / bottleSize` (D3) |
| **Marża jednostkowa `m`** | `N − koszt porcji`, PLN; ujemna znaczy „poniżej kosztu” i jest pokazana wprost |
| **Marża %** | `m / N` (udział marży w cenie netto). To **nie** narzut (`m / koszt`); narzutu nie pokazujemy, żeby nie mieszać pojęć |
| **Pokrycie kosztów** | wina aktywne z kosztem / wina aktywne (E19: nieaktywne poza); agregaty karty (średnia, mediana, udział) tylko przy pokryciu ≥ 80% `[ASSUMPTION]` i ≥ 3 winach z kosztem w danej porcji; poniżej: tylko wiersze win z kosztem i komunikat „uzupełnij koszty” |
| **Klasa „wysoka marża”** | marża % ≥ mediana marż % win z kosztem tej samej porcji (D6) |
| **Polecenie zamówione** | jak E09 R10: potwierdzone przez kelnera lub dopasowane w POS, raz na polecenie; każde ma `wineId` i `serving` |
| **Marża z poleceń (okres)** | suma `m(wino, porcja)` po zamówionych poleceniach okresu; **średnia na polecenie** = suma / `n`; polecenia win bez kosztu (lub usuniętych) nie wchodzą do sumy i są liczone osobno („N bez kosztu”). Pokazywane tylko z `n ≥ 30` (`MIN_RATE_SAMPLE`); średnia z przedziałem `±1,96·s/√n` (przybliżenie normalne, `[ASSUMPTION]`), poniżej progu same liczby |
| **Udział poleceń o wysokiej marży** | zamówione polecenia z klasą „wysoka” / zamówione z klasą; z przedziałem Wilsona; pokazywany, gdy mianownik (polecenia z klasą) ≥ 30; punkt odniesienia ≈ 50% (D6) |
| **Widełki marży z POS** | dla okresu: `Σ(kwota netto kieliszków × % )+ Σ(kwota netto butelek × %)`, gdzie `%` to najmniejszy i największy % marży win z kosztem danej porcji (min, max). Pokazywane jako zakres PLN i % przychodu z wina; wymaga progu pokrycia i ≥ 3 win z kosztem w porcji. **Zastrzeżenie na ekranie:** zakres zakłada, że sprzedaż była po cenach z karty i że każde wino ma koszt w zakresie win z kosztem; rabaty, zmiana cen i wina bez kosztu go łamią. To zakres, nie punkt |
| **Konwersja poleceń** | zamówione / wydane, z przedziałem Wilsona, z progiem 30 wydanych w grupie; grupy „z etykietą wyboru” i „bez” (po wdrożeniu flagi `pick`, PR9); bez Δ i bez werdyktu |

### Przykłady policzone ręcznie (źródło testów; `v = 0,23`, butelka 750 ml, kieliszek 125 ml)
**M1 — wino A:** butelka 120 zł, `C = 45`: `N = 97,56`, `m = 52,56` zł, **53,9%**. Kieliszek 28 zł: `N = 22,76`, koszt `45 × 125/750 = 7,50`, `m = 15,26` zł, **67,1%**.
**M2 — wino B:** butelka 300 zł, `C = 160`: `N = 243,90`, `m = 83,90` zł, **34,4%**. Po PLN wygrywa B (83,90 wobec 52,56), po % wygrywa A (53,9% wobec 34,4%): ekran pokazuje oba i nie sortuje domyślnie po jednym z nich bez nazwy kolumny.
**M3 — wino C:** butelka 160 zł, `C = 80`: `N = 130,08`, `m = 50,08`, **38,5%**; kieliszek 40 zł: `N = 32,52`, koszt `13,33`, `m = 19,19`, **59,0%**.
**M4 — klasa (butelka):** marże % A 53,9, B 34,4, C 38,5, mediana **38,5 (C)**: A i C „wysokie”, B „niskie”. Dla kieliszka (A 67,1; C 59,0) są tylko 2 wina z kosztem: **brak klasy** (próg ≥ 3).
**M5 — marża z poleceń (zestaw A, B, C z M4):** 30 zamówionych: A kieliszek ×20, A butelka ×6, B butelka ×4. Suma `20×15,26 + 6×52,56 + 4×83,90 = 956,26` zł (z wartości niezaokrąglonych), średnia **31,88** zł na polecenie (`n = 30`, więc wyświetlana z przedziałem). Klasa istnieje tylko dla butelki (M4), więc kieliszki są poza udziałem: polecenia z klasą = 10 (A ×6 „wysoka”, B ×4 „niska”), udział **6 z 10 = 60%**. Mianownik 10 < 30: funkcja zwraca 6 z 10, ekran pokazuje same liczby, bez procentu i przedziału. Test sprawdza także brak NaN przy pustym mianowniku.
**M6 — widełki:** dochodzi wino D: butelka 170 zł, `C = 70` (49,4%, w zakresie butelek), kieliszek 45 zł (`N = 36,59`, koszt `11,67`, `m = 24,92`, **68,1%**). Butelki A, B, C, D: min–max **34,4–53,9%**; kieliszki A, C, D (3 wina): **59,0–68,1%**. Okres: kwota netto butelek 10 000 zł, kieliszków 6 000 zł. Butelki **[3 440,00; 5 387,50]**, kieliszki **[3 540,00; 4 086,67]**, razem **[6 980,00; 9 474,17]** zł, czyli **43,6–59,2%** przychodu z wina (16 000 zł). Przy samych A i C (2 wina kieliszkowe) widełki kieliszków **nie są pokazane** (próg ≥ 3), a widełki całości też nie.
Dodatkowe przypadki: `C` równe cenie netto (`m = 0`); `C` powyżej ceny netto (ujemna, flaga); `glassPrice = null`; `n = 29` i `n = 30`; wszystkie polecenia bez kosztu; pusty okres; wino usunięte miękko (poza sumą).

## Wymagania
- **R1 (czyste funkcje)** `unitMargin`, `marginClass`, `orderedMargin`, `marginRange` w `core` bez I/O; progi to stałe nazwane (`MARGIN_MIN_COVERAGE = 0.8`, `MARGIN_MIN_WINES_PER_SERVING = 3`, `MARGIN_MIN_ORDERED = MIN_RATE_SAMPLE`, `WINE_VAT_RATE = 0.23`).
- **R2 (osobny magazyn kosztu)** Tabela `wine_cost` i dziennik `wine_cost_edit`; `Wine`, `PublishedView`, `buildSnapshot`, `WineRepository` i mappery gościa **nie mają** pola kosztu. Koszt czyta tylko `WineCostRepository` wołane z `MarginService` i `MarginReportService`.
- **R3 (zapis)** `MarginService.setCost(slug, wineId, cost | null, actor, { expectedVersion })` jako komenda: `actor`, odcisk listy kosztów lub wiersza jako `expectedVersion`, błędy `DomainError` (`ValidationError` dla zakresu `C`, `NotFoundError` dla obcego lub usuniętego wina, `VersionConflictError`), idempotentny (bez zmiany bez wpisu dziennika); `null` usuwa koszt (wpis w dzienniku).
- **R4 (uprawnienia)** Nowe `margin.view` i `cost.manage` w `permissions.ts`, tylko owner i manager (D4); każde wejście sprawdza samo (`requireAccess`, `authorizeAction`, `handle()`), serwis sprawdza rolę jeszcze raz.
- **R5 (brak przecieku)** Koszt, marża i klasa nie występują w: migawce, `PublishedView`, publicznym API i stronach gościa, zdarzeniach użycia, `catalog_edit`, `import_job.rows`, logach (`logger`), komunikatach błędów dla ról bez `margin.view`, odpowiedziach `GET /wines`, `/dishes`, eksporcie CSV. Pole kosztu w żadnej odpowiedzi dla roli bez `cost.manage`.
- **R6 (silnik bez zmian)** `engine/`, `ENGINE_VERSION`, `rank-for-guest`, picks i `matchScore` nie czytają kosztu; zmiana dowolnego kosztu nie zmienia ani jednego bajta migawki ani wyniku `recommendForDish` (test z wartościami kanarkowymi).
- **R7 (definicje)** Metryki dokładnie jak w „Definicje metryk”; przychód z POS z `SalesKpiService` / `CheckTotals` (jedna definicja, jak R2 raportu wyników), polecenia z `RecommendationCodeService`; przedział Wilsona z `proof-report.ts`, próg `MIN_RATE_SAMPLE` importowany.
- **R8 (odczyt poleceń)** Nowa metoda `RecommendationCodeRepository.orderedByWine(restaurantId, period)` → wiersze `(wineId, serving, issued, ordered)` z definicją „zamówione” z E09 R10 (jedno polecenie raz); kontrakt, pamięć i PostgreSQL; `restaurantId` w każdym zapytaniu.
- **R9 (flaga `pick`, PR9)** Kolumna `recommendation_code.pick boolean not null default false`, ustawiana przy wydaniu z tego samego źródła co flaga `pick` w zdarzeniach użycia; **prospektywna**: starsze wiersze mają `false`, ekran podaje „od dnia …” (najwcześniejsza data wiersza z flagą). Zmiana kontraktu `issue` bez wpływu na wygląd G8 i na kody.
- **R10 (podpowiedzi „do rozważenia”)** Do 5 wierszy, nazwane reguły: `high_margin_rarely_ordered` (wino ≥ mediany, mało zamówień), `low_margin_often_ordered` (wino poniżej mediany, często zamawiane: „sprawdź cenę lub koszt”), `no_cost` (wino aktywne bez kosztu), `pick_candidate` (kandydat na wybór restauracji **tylko** gdy symulator A27 daje `moved` lub `label_only` w co najmniej jednym daniu i zbiór ma wolne miejsce). Podpowiedź to link do istniejącej decyzji (A27, A6, A5), **nic nie zapisuje** i nie zmienia statusu pary; nazwa nie zawiera „Para sommeliera”, „AI”, „gwarantowane”, „zarobisz”.
- **R11 (symulator)** Kolumna „szacowana marża na polecenie” w symulatorze A27 **tylko** dla `margin.view` (serwer nie wysyła wartości innym rolom; nie CSS); szacunek zakłada niezmienioną konwersję i jest tak opisany; porcja jak w pozycji silnika, a gdy lista jej nie niesie, marża butelki i kieliszka osobno; wina bez kosztu: „brak kosztu”.
- **R12 (język i treść)** Bez „AI” w tekstach ekranu i API; bez „zyskasz”, „dodatkowa marża”, „dzięki Wine Match”, „gwarantowane”; dozwolone: „marża z win zamówionych z kodem”, „po bieżących cenach i kosztach”, „widełki”. Stałe bloki „Jak to liczymy” (VAT, brak strat, bieżące ceny) i „Czego ten pulpit nie mówi” (marża na rachunek wyliczona z POS jest zakresem; kod nie dowodzi przyczyny; brak grupy kontrolnej; wybory wskazuje właściciel). Słowniki PL i EN w tym samym PR.
- **R13 (stany i dostępność)** Brak kosztów: `EmptyState` z linkiem do A36; brak sprzedaży: marża z poleceń i z karty działają, widełki nie; błąd: `ErrorMessage`; ładowanie: `LoadingMessage`. 390 i 1440 px bez poziomego przewijania; działa bez JavaScriptu (okres jako `GET`, koszty jako formularz `POST`).
- **R14 (izolacja tenantów)** Każda metoda nowych repozytoriów przyjmuje `restaurantId` z sluga rozwiązanego na serwerze; slug i `restaurantId` nigdy z ciała. `Cache-Control: private, no-store` na A35, A36 i trasach.
- **R15 (API)** `GET /api/v1/restaurants/{slug}/margin-report?from=&to=` i `PUT /api/v1/restaurants/{slug}/wines/{wineId}/cost` (`strictObject` `{ cost: number | null, expectedVersion }`, schemat w `core/validators/margin/`; `PUT`, bo powtórzenie daje ten sam stan); `invalid_cost` 422, `invalid_period` 422, `version_conflict` 409; `handle()`, literalny `route`, `check:routes`; obcy slug jak brakujący (§10, T-34). Bez `DELETE` (usunięcie kosztu to `cost: null`).
- **R16 (dokumentacja)** `SCREEN_MAP.md` (A35, A36, tabela ról), `SCREEN_SPECIFICATION.md`, `API_SPECIFICATION.md`, `DATA_MODEL.md`, `USER_ROLES.md`, `threat-model.md` (nowy wiersz), `PRODUCT_CONCEPT.md` (zdanie o pulpicie); zmiana `AGENTS.md` tylko osobnym PR-em właściciela (D13).

## Kryteria akceptacji
Scenariusze QA w `.ai/qa/kpi/` (pulpit) i `.ai/qa/security/` (granica i przeciek); numeracja: kolejne wolne numery, kpi-009…014 zarezerwowane przez raport wyników, potwierdzenie `check:qa` przy implementacji. Testy jednostkowe w `packages/core/tests/margin.test.ts`.

- [ ] **AC1 (R1, M1–M3)** Marża jednostkowa i % win A, B, C zgadzają się z przykładami (tolerancja 0,01 zł i 0,05 pp); marża ujemna i `m = 0` poprawne. *Test jednostkowy.*
- [ ] **AC2 (R1, M4)** Klasa „wysoka” dla butelki: A i C wysokie, B niskie; kieliszek przy 2 winach bez klasy. *Test jednostkowy.*
- [ ] **AC3 (R1, R7, M5)** Marża z poleceń: suma 956,26, średnia 31,88, udział 6 z 10 (bez procentu, mianownik < 30); polecenia bez kosztu poza sumą i policzone osobno; `n = 29` bez średniej i przedziału, `n = 30` z nimi; brak NaN przy pustym zbiorze. *Test jednostkowy.*
- [ ] **AC4 (R1, M6)** Widełki: [6 980,00; 9 474,17] zł (43,6–59,2%) dla M6; brak widełek kieliszków przy 2 winach i przy pokryciu < 80%; min ≤ max. *Test jednostkowy.*
- [ ] **AC5 (R2, R5)** Test przecieku: wartość kanarkowa kosztu (np. 7 777,77) nie występuje w migawce publikacji, `PublishedView`, odpowiedziach gościa i publicznego API, zdarzeniach, `catalog_edit`, `import_job.rows`, logach testowego uruchomienia ani w HTML i API dla sommeliera; występuje tylko dla owner i manager na A35, A36 i w API. *E2E na PostgreSQL plus test statyczny, że `Wine` i mappery nie mają pola kosztu.*
- [ ] **AC6 (R6)** Po zmianie wszystkich kosztów: migawka nowej publikacji i `recommendForDish` dla wszystkich dań demo bajt w bajt takie same jak przed; `engine:matrix` bez różnic; `ENGINE_VERSION` bez zmian. *Test w `core` i `engine:matrix`.*
- [ ] **AC7 (R3)** `setCost`: koszt poza `0 < C ≤ 50 000`, z trzema miejscami po przecinku lub tekstowy → `invalid_cost` (422); obce lub usunięte wino → 404; nieaktualny `expectedVersion` → 409; powtórka tej samej wartości bez nowego wpisu dziennika; `null` usuwa i zapisuje wpis. *Test serwisu, `test:db`, trasa.*
- [ ] **AC8 (R4)** Owner i manager: 200 na A35, A36 i w API; sommelier i kelner: 403 na stronie, w akcji i w API; brak sesji: przekierowanie lub 401; sfałszowany POST akcji kosztu od sommeliera → `forbidden`. *Test HTTP.*
- [ ] **AC9 (R14, R15, granica §10)** `margin-boundary.e2e.test.ts`: kontrola pozytywna dla obu lokali (A czyta i zapisuje własne koszty, B swoje), odmowa odczytu i zapisu cudzego sluga i cudzego `wineId` pod własnym slugiem (status i ciało jak brakujący), stan po próbie (całe ładunki obu raportów i skrót md5 tabel `wine_cost` i `wine_cost_edit`), mutacja (usunięcie filtra `restaurant_id` w `orderedByWine` lub `WineCostRepository` daje czerwony test; zapis w logu przebiegu). *E2E na PostgreSQL.*
- [ ] **AC10 (R15)** Ciało `PUT` z polem spoza schematu → 422; `from` po `to`, okres > 366 dni, zły format → `invalid_period` bez 500. *Test trasy.*
- [ ] **AC11 (R8)** `orderedByWine` zgadza się z `RecommendationCodeService.summary` (suma `ordered` równa „zamówione” okresu) i z `pairStats` dla kontekstu `dish`; polecenie z kodem na wielu liniach liczy się raz. *Kontrakt repozytoriów (pamięć i PostgreSQL).*
- [ ] **AC12 (R7)** Przychód z wina w okresie na A35 równy `SalesKpiService.getSalesKpis` dla tych samych dat. *Test kontraktowy.*
- [ ] **AC13 (R10)** Reguły podpowiedzi na ręcznym zestawie: każda daje oczekiwany wiersz lub jego brak; `pick_candidate` nie pojawia się, gdy symulator daje `none` albo zbiór jest pełny (5); podpowiedzi nic nie zapisują (stan bazy przed i po bez zmian); najwyżej 5. *Test jednostkowy i e2e.*
- [ ] **AC14 (R11)** Symulator: kolumna marży w odpowiedzi tylko dla `margin.view`; sommelier dostaje te same listy „przed / po” bez żadnego pola marży (ładunek bez klucza, nie z `null`). *Test trasy i SSR.*
- [ ] **AC15 (R12)** Widoczny tekst A35 i A36 (bez ładunku RSC) i odpowiedź API we wszystkich stanach, PL i EN, nie pasują do `\bAI\b|zyskasz|dodatkowa marża|dzięki Wine Match|gwarantowan|Para sommeliera`; zawierają bloki „Jak to liczymy” i „Czego ten pulpit nie mówi” oraz stałą informację o VAT i braku strat. *Test SSR.*
- [ ] **AC16 (R13)** Stany: brak kosztów, brak sprzedaży, pokrycie < 80%, błąd; 390 i 1440 px bez `scrollWidth > innerWidth`; bez błędów konsoli; okres i zapis kosztów bez JavaScriptu. *E2E agent-browser.*
- [ ] **AC17 (R9, PR9)** Wydanie kodu dla wina z etykietą wyboru zapisuje `pick = true`, bez zmiany G8 i unikalności kodów; starsze wiersze `false`; konwersja grup z progiem 30. *Test serwisu, `test:db`.*
- [ ] **AC18 (R5)** Import wina z kolumną kosztu (PR10, jeśli zatwierdzony): rola bez `cost.manage` ignoruje kolumnę (komunikat bez wartości), a koszt nie trafia do `import_job.rows` ani podglądu. *Test importu.*
- [ ] **AC19 (R16)** Dokumentacja z R16 zaktualizowana; `npm run check:context`, `check:qa`, `check:routes`, `check:pages` zielone. *Polecenia.*
- [ ] **AC20 (weryfikacja ogólna)** `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; migracje z dowodem up/down/up i planem wycofania; wyścig dwóch zapisów kosztu tego samego wina (bramka `race()`): jeden zapis, jeden 409. *Wyniki w logu przebiegu.*

## Projekt rozwiązania

### Model danych
- `wine_cost`: `restaurant_id` FK, `wine_id` FK, `bottle_cost numeric(10,2)` z `CHECK (bottle_cost > 0 AND bottle_cost <= 50000)`, `set_at timestamptz`, `set_by_membership_id uuid null`, `version int`; klucz `(restaurant_id, wine_id)`; wino usuwane miękko (`deleted_at` na `wine`): zapytania pomijają koszty usuniętych win. Nie ma kolumny w tabeli `wine`.
- `wine_cost_edit` (append-only): restauracja, `wine_id` bez FK, `before` i `after` (numeric null), `actor` (rola), `actor_id`, czas z `Clock`; zapisany w tej samej transakcji co zmiana. Bez `UPDATE` i `DELETE` w repozytorium. Dostęp odczytu tylko `margin.view`.
- Porty (kontrakt, pamięć, PostgreSQL, każda metoda z `restaurantId`): `WineCostRepository` (`list`, `set` z `expectedVersion`, `history`), `RecommendationCodeRepository.orderedByWine`. Migracje: osobny PR dla `wine_cost` i `wine_cost_edit` (`risk-high`: dane wrażliwe i schemat; dowód up/down/up; `down` kasuje tylko te tabele i **kasuje koszty**, więc plan wycofania: „naprawiamy do przodu” albo eksport przed `down`), osobny PR dla `recommendation_code.pick`.

### Pliki
- `core/src/services/margin/margin.ts` (czyste, wzór `sales-kpis.ts`), `margin-service.ts` (`MarginService`: `setCost`, `listCosts`, `costHistory`), `margin-report-service.ts` (`MarginReportService.getReport(slug, period)`: karta, polecenia, widełki, podpowiedzi; deps: `restaurantRepository`, `wineRepository`, `wineCostRepository`, `recommendationCodeRepository`, `salesRepository`, `picksSimulationService`).
- `core/src/validators/margin/` (`cost.schema.ts`, `period` reużyty z `sales-period.schema.ts`); `core/src/auth/permissions.ts` (`margin.view`, `cost.manage` w `BUSINESS`; test macierzy); `core/src/ports/*`, `memory/*`, `db/src/entities/margin/*`, `db/src/repositories/*`; rejestracja w `app/src/server/container.ts`; nowe klasy błędów nie są potrzebne (istniejące `ValidationError`, `NotFoundError`, `VersionConflictError`).
- `app/src/app/api/v1/restaurants/[slug]/margin-report/route.ts`, `.../wines/[wineId]/cost/route.ts` (skill `wine-match-new-api-route`, `npm run check:routes`).
- `app/src/app/(admin)/admin/[slug]/margin/page.tsx` (A35), `margin/costs/page.tsx` (A36), `margin-actions.ts` (`authorizeAction(slug, 'cost.manage')`), pole kosztu na A5 tylko przy `cost.manage` (render po stronie serwera), nawigacja tylko dla `margin.view`, kolumna marży w symulatorze A27, słowniki PL i EN.
- Testy: `core/tests/margin.test.ts`, kontrakty repozytoriów, `db/tests` (migracja, `concurrency.integration.test.ts`), `app/tests/e2e/margin.e2e.test.ts`, `margin-boundary.e2e.test.ts`, `margin-leak.e2e.test.ts`; scenariusze QA; `check:pages` (strona sama woła `requireAccess` przed odczytem, nie w `Promise.all`).

### Ekrany
**A35** (`margin?from=&to=`; w `SCREEN_MAP.md` pod „Wine program” po A27, owner i GM): (1) okres (jak A13) i pokrycie kosztów („38 z 52 win ma koszt”, link do A36); (2) karta „Marża win z karty”: tabela win z kosztem (marża zł i %, klasa, kolumny z nazwą, bez domyślnego sortowania po jednej), stała informacja „po bieżących cenach i kosztach, VAT 23%, bez strat”; (3) „Marża z poleceń zamówionych z kodem”: liczby, średnia z przedziałem przy `n ≥ 30`, udział o wysokiej marży, konwersja z etykietą i bez; (4) „Widełki marży z win w sprzedaży (POS)” z zastrzeżeniem; (5) „Do rozważenia” (R10); (6) „Jak to liczymy” i „Czego ten pulpit nie mówi”; link do A33 dla porównania rachunków z kodem i bez. Kolejność daje najpierw dane najpewniejsze (karta), potem opisowe, na końcu zakres.
**A36** (`margin/costs`): tabela win (jedna linia na wino: nazwa, cena butelki i kieliszka z karty, pole kosztu butelki netto), jeden formularz `POST` na całą tabelę (zapisuje tylko zmienione wiersze, odcisk jako `expectedVersion`; konflikt w jednym wierszu odrzuca cały zapis atomowo), flash błędów po kodzie; pole `inputmode="decimal"`, przecinek polski dozwolony; bez JavaScriptu. Wino nieaktywne oznaczone, koszt można wpisać.
**A5, A27:** pole kosztu (A5) i kolumna marży (A27) tylko dla uprawnionych; sommelier widzi te ekrany dokładnie jak dziś.

### Plan PR-ów (każdy ≤ ok. 150 linii poza wyjątkami z §11 standardów; model danych osobno)
1. `margin.ts` + testy AC1–AC4 (`risk-low`).
2. Uprawnienia `margin.view`, `cost.manage` + test macierzy + akapit `USER_ROLES.md`.
3. Migracja i encje `wine_cost`, `wine_cost_edit` + dowód up/down/up (`risk-high`).
4. `WineCostRepository` (kontrakt, pamięć, PostgreSQL) + `MarginService.setCost` + AC7, wyścig AC20.
5. `orderedByWine` (kontrakt, pamięć, PostgreSQL) + AC11.
6. Trasy API, schematy, `check:routes`, test granicy i przecieku (AC5, AC8, AC9, AC10), wiersz w `threat-model.md` (`risk-high`).
7. `MarginReportService` (karta, polecenia, widełki, podpowiedzi) + AC3, AC12, AC13.
8. A36 i pole na A5, słowniki, QA, e2e (AC15, AC16 część).
9. A35, symulator A27, docs (AC14, AC16, AC19).
10. Migracja `recommendation_code.pick` i konwersja (AC17), osobno po PR9.
11. Opcjonalnie, po osobnej decyzji: import kolumny kosztu (AC18).

## Ryzyka i otwarte pytania
**Ryzyka.**
- **Wyciek kosztu** (tajemnica przedsiębiorstwa lokalu; wprost sprzeczny z zaufaniem do produktu): osobny magazyn, brak pola w `Wine`, test kanarkowy przeciekowy (AC5), kolumna marży w A27 tylko po stronie serwera, wiersz w threat-model. Rezydualne: pracownik operatora z dostępem do bazy; kopie zapasowe zawierają koszty (zapis w `security-notes.md` i w umowie z lokalem; opinia prawna co do klauzuli poufności, to nie jest porada prawna).
- **Fałszywa precyzja**: marża na rachunek z POS jest zakresem, marża z poleceń dotyczy zamówionych z kodem (nie wszystkich); sezon, karta i ceny mieszają się z efektem. Łagodzą: widełki, progi próby, przedziały, brak Δ i werdyktów, bloki zastrzeżeń (jak w raporcie wyników).
- **Niepełne dane**: pilot może wpisać koszty tylko części win; progi pokrycia ukrywają agregaty zamiast je zawyżać lub zaniżać.
- **Marża jako przymus**: właściciel mógłby chcieć podbić wynik pod marżę. D8: nie w tej specyfikacji; podbicie wyniku to F2 z picks z opinią prawną; sommelier nie widzi marży, więc para sommeliera nie powstaje pod nią.
- **VAT i cena brutto** to założenie (D2); błąd założenia przesuwa wszystkie marże, więc ekran je pokazuje, a pilot je potwierdza.
- **Cena poniżej kosztu**: sommelier z `catalog.edit` zmienia ceny, a marża jest liczona na bieżąco, więc może po cichu zejść poniżej zera; pulpit pokazuje to wprost, bez blokady zapisu ceny (decyzja o blokadzie: poza zakresem).
- **Ceny na żywo, koszt bieżący** (D12): marża dla okresu sprzed zmiany ceny jest przybliżona.

**Pytania otwarte.**
- Czy pilot zechce wpisać koszty i czy ma je pod ręką w formie, którą da się wprowadzić ręcznie (wynik rozmów C01; od tego zależy, czy PR11 potrzebny).
- Czy eksport POS pilota kiedykolwiek będzie niósł numer pozycji lub wina (E03 C03): wtedy D5 można wrócić.
- Czy owner i manager mają mieć dziennik kosztów widoczny dla obu (rekomendacja: tak, jak `audit.view`).

## Przegląd niezależny
**Przegląd niezależny NIE został wykonany** (`review_independence: none`). Przebieg miał uruchomić świeżego pod-agenta, ale w tej sesji nie było narzędzia do uruchamiania pod-agentów (dostępne były tylko narzędzia plikowe, powłoka i sesje zdalne bez dostępu do niezapisanej gałęzi lokalnej), a wypychanie gałęzi było zabronione. Autor zrobił jedynie **przegląd własny** (nie liczy się jako niezależny): sprawdzono spójność przykładów M1–M6 z kodem liczącym (`node`), zgodność z §7 AGENTS.md (silnik, R06, N02, Match Score), numer ekranu (A33 i A34 zajęte przez raport wyników), rozmiar pliku i `check:context`. Poprawki z przeglądu własnego: porcja w symulatorze, atomowość zapisu A36, ryzyko ceny poniżej kosztu, spójność progu 30 z mianownikiem udziału (M5).
**Do zrobienia przed `approved`:** przegląd świeżym agentem lub człowiekiem (przypadki brzegowe, konflikty z §7, ukryte założenia o danych, ryzyko prawne i prywatności), wpis wniosków tutaj (blokujące naprawione w treści, ważne i drobne wymienione) i zmiana `review_independence` na uczciwy poziom.

## Changelog
- 2026-11-25 — Autor: model nie zapisany (log przebiegu `.ai/runs/2026-11-25-margin-dashboard-spec.md`). Pierwsza wersja `draft`.

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
