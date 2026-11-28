---
status: draft
created: 2026-11-25
owner: Filip Niedziela
related: [.ai/specs/research/2026-11-25-margin-dashboard-decisions.md (alternatywy D1–D17), .ai/specs/2026-11-18-restaurant-picks.md (F3 stąd), .ai/specs/2026-11-18-owner-proof-report.md (A33, grupy z kodem i bez), .ai/specs/implemented/2026-10-15-pos-sales-import-attach-rate.md (E03, Q9, Q10, Q18), .ai/specs/implemented/2026-10-15-kpi-dashboard.md (E04), .ai/specs/implemented/2026-10-16-recommendation-code.md (E09), .ai/specs/2026-11-04-restaurant-operations.md (E19), .ai/specs/2026-11-16-catalog-field-editing.md (C1), .ai/specs/2026-11-04-product-completion-plan.md, .ai/specs/product-brief.md (D20, D22–D25, R06, N02–N04), .ai/specs/research/benchmarks/2026-11-16-product-strategy-vs-sommelierbot.md (P12), docs/SCREEN_MAP.md, docs/USER_ROLES.md, docs/DATA_MODEL.md, docs/API_SPECIFICATION.md, docs/security/threat-model.md, .ai/docs/engineering-standards.md (§10–§12), .ai/runs/2026-11-25-margin-dashboard-spec.md]
superseded_by:
author_model: not recorded
reviewed_by: "independent agent, fresh context, different model (model not recorded)"
review_independence: different-model
---

# Pulpit marży restauracji (koszt zakupu, marża win i poleceń)

## TLDR
Właściciel i GM znają ceny na karcie, ale nie widzą w panelu, ile z nich zostaje po zakupie. Dodajemy **opcjonalny koszt zakupu netto za butelkę** (osobna tabela, nigdy w migawce, API gościa, zdarzeniach ani logach), widoczny i edytowalny **tylko dla owner i manager**, oraz **A35 „Pulpit marży”** (A36 „Koszty win”). Pulpit liczy marżę jednostkową i procentową win, **marżę win wskazanych w zamówionych poleceniach**, udział takich poleceń o wysokiej marży i **zakres przy założeniach** marży z win w sprzedaży z POS. Marża **nie wchodzi do silnika ani do rankingu automatycznie** i nie zmienia wyświetlanego Match Score; może jednak wpłynąć na kolejność **decyzją właściciela**, gdy ten na podstawie podpowiedzi ustawi wybór restauracji (D24, A27). Ograniczenie z kodu, od którego zależy projekt: **POS nie niesie wina ani nazwy pozycji** (E03 Q10, Q18), a kod polecenia dowodzi powiązania z rachunkiem, nie z winem ani porcją (E09 Q12); liczymy więc tylko to, co da się uczciwie wyprowadzić, i mówimy wprost, czego nie. Przed implementacją trzeba poprawić istniejący import, który dziś mógłby zamienić nagłówek „Cena zakupu” w cenę widoczną dla gości (PR0). Progi to propozycje (`[ASSUMPTION]`). Specyfikacja jest `draft`.

## Problem
- **Dla kogo:** owner i GM, którzy płacą za produkt i, zgodnie z D24, chcą wyższej marży; strategia (P12) wskazuje to jako oś przewagi nad czatami (brak narzędzi marży u konkurentów to trop z desk researchu, nie zmierzony fakt).
- **Stan dziś (sprawdzone w kodzie):** `Wine` ma ceny, `glassPour`, `bottleSize`, **nie ma kosztu**. `sales_record` ma typ pozycji, ilość i kwotę netto, **bez wina i nazwy pozycji**. `recommendation_code` ma `wineId` i `serving`, ale `serving` to `glass` tylko gdy gość sam włączył filtr kieliszka (inaczej `bottle`), a „zamówione z POS” znaczy „na rachunku jest jakaś linia wina”, ilość pominięta. A27 ma symulator bez marży.
- **Pułapka importu:** w imporcie win nagłówek „Cena zakupu” pasuje przez regułę prefiksu `cena ` do ceny butelki (`import/mapping.ts`), a w imporcie menu `cost` i `koszt` są synonimami **ceny**; ceny wina to dane bieżące widoczne dla gości bez publikacji.
- **Czego nie wiemy:** czy pilot poda koszty (miara: odsetek win z kosztem po 2 tygodniach), czy ceny karty są brutto (zakładamy tak, D2), jaka marża jest „wysoka” w lokalu (D6).

## Cel i zakres
Owner i GM widzą, ile marży (cena netto minus koszt) dają wina na karcie i wina wskazywane w poleceniach, i dostają krótką listę rzeczy **do rozważenia**, z zachowaniem zasad produktu: sommelier ponad modelem (R06), bez „AI” w interfejsie gościa (N02), Match Score wynikiem silnika, wybory restauracji (D24) i przyszły sponsoring (D25) zawsze oznaczone.

**W zakresie:** poprawka importu (PR0); tabela kosztów i jej bezpieczeństwo; czyste funkcje marży; serwisy w `core`; uprawnienia `margin.view` i `cost.manage`; trasy API; A35 i A36 (PL i EN, bez JavaScriptu); marża w symulatorze A27 dla `margin.view`; dokumentacja, QA, test granicy i przecieku, reguła `check:boundaries`.

**Poza zakresem:** zmiana silnika, wag, kolejności i wyświetlanego wyniku (F2 z picks); koszt w migawce, API gościa lub zdarzeniach; dopasowanie pozycji POS do win (D5); import kolumny kosztu (PR13, osobna zgoda); jawna porcja przy kodzie (PR14, osobna zgoda); flaga `pick` w kodzie i pomiar etykiety (odłożone, D7); zapas (N04); rabaty dostawców i sponsoring (D11); benchmark między lokalami (D23); historia kosztu (D12); eksport marży do CSV (E20); przychód i Wine Attach Rate (E04, raport wyników).

## Nakładanie z istniejącymi specyfikacjami

| Specyfikacja | Co już jest | Co robimy tu |
|---|---|---|
| E04 / A1 | przychód z wina na rachunek i gościa, średnia butelka i kieliszek, netto | **Nie powielamy**: czytamy `SalesKpiService` i `CheckTotals`. Na A1 marży nie ma (widzi ją sommelier) |
| Raport wyników (A33, A34) | Wine Attach Rate przed i po, rachunki z kodem i bez (przychód, bez Δ), progi, przedziały Wilsona | **Nie powielamy**; marża rachunku z kodem i bez nie jest liczona (przy stałym współczynniku byłaby przeskalowanym przychodem); A35 linkuje do A33. Wspólne: `MIN_RATE_SAMPLE`, `wilsonInterval` (importowane) |
| Wybory restauracji (A27) | zbiór, migawka, symulator bez marży; F3 = „raport marży” szkic | **Ta specyfikacja jest F3**; odnośnik w picks po akceptacji (picks jest `in-progress`, nie edytuję) |
| E19 | dostępność wina (`active`), F2 zastąpione | Pokrycie liczy wina aktywne; „zapas” poza zakresem (N04) |
| E09 | `summary`, `pairStats`, „zamówione” = potwierdzone ∪ POS | Nowy odczyt `orderedByWine`; definicja bez zmian |
| C1 | `catalog.edit` zmienia ceny; audyt `catalog_edit` | Koszt nie przechodzi przez `CatalogEditService` ani `catalog_edit` |
| E03 / import | mapowanie nagłówków | PR0 blokuje koszt jako cenę |
| Plan produktu (tabela identyfikatorów ekranów) | A33, A34 raport; A32 katalog | Dopisać A35, A36 (R16) |

## Decyzje dla człowieka
Rekomendacje; alternatywy i skutki: `.ai/specs/research/2026-11-25-margin-dashboard-decisions.md`. Implementacja nie startuje przed odpowiedzią (AGENTS.md §3).

1. **D1 Źródło kosztu.** Osobna tabela `wine_cost` (nie kolumna `wine`, nie `Wine.cost`); wpis ręczny A36 i A5; import kolumny dopiero PR13.
2. **D2 Kwoty i VAT.** Koszt netto z faktury; cena z karty brutto, `netto = cena / (1 + 0,23)` (`WINE_VAT_RATE`, widoczna na ekranie). Księgowość pilota potwierdza stawkę; lokal zwolniony z VAT to ustawienie per lokal (później).
3. **D3 Koszt kieliszka.** `koszt butelki × glassPour / bottleSize`, bez strat, z napisem „bez strat”.
4. **D4 Role.** `margin.view` i `cost.manage` tylko owner i manager; sommelier, kelner i administrator platformy nie. Opcja: owner włącza sommelierowi sam wpis kosztów (adopcja); sommelier i tak wpływa na liczby przez `catalog.edit` i `import.manage`.
5. **D5 Marża na rachunek i „udział win o wysokiej marży”.** Trzy miary zamiast jednej fałszywej: (a) marża z karty; (b) **marża wina wskazanego w poleceniu** (D15); (c) **zakres przy założeniach** marży z POS. Nie dopasowujemy pozycji POS do win.
6. **D6 „Wysoka marża”.** Marża % ≥ mediana win z kosztem tej samej porcji (kieliszek i butelka osobno; przy parzystej liczbie win średnia dwóch środkowych; minimum 3 wina). Punktem odniesienia jest **rzeczywisty udział win „wysokich” w tej porcji**, nie 50%.
7. **D7 Wpływ kodu i wyborów.** Opis bez Δ i werdyktu przyczynowego. Konwersji z etykietą i bez **nie** liczymy (kod powstaje po wyborze wina, więc nie mierzy wpływu etykiety); pomiar etykiety to zdarzenia użycia z `pick`, odłożony. Pulpit pokazuje marżę bieżących wyborów (z karty) i marżę w symulatorze.
8. **D8 Ranking.** Marża nie wchodzi do silnika (`ENGINE_VERSION` bez zmian). Pośrednio, przez `pick_candidate`, może zmienić kolejność wyłącznie decyzją właściciela (D24, A27); `matchScore` nigdy nie rośnie (F2 poza zakresem).
9. **D9 Ekrany.** A35 `/admin/{slug}/margin`, A36 `/admin/{slug}/margin/costs`; bez kafelka na A1.
10. **D10 Okres.** Jak A13 (`SalesPeriod`, do 366 dni).
11. **D11 Sponsoring.** Brak pola „sponsor”; gdy powstanie: osobna oznaczona linia, rabat dostawcy nie obniża kosztu.
12. **D12 Historia kosztu.** Brak; marża po bieżących cenach i kosztach, zmiany w `wine_cost_edit`.
13. **D13 Dokumenty.** Wiersz w threat-model, akapity w `USER_ROLES`, `DATA_MODEL`; zdanie w `AGENTS.md` §7 tylko osobnym PR-em właściciela.
14. **D14 Demo.** Seed demo bez kosztów; zapis A36 wyłączony w trybie demo (publiczne hasła).
15. **D15 Metryka z poleceń (B1).** Droga (c) teraz: „marża wina wskazanego w poleceniu (porcja z wyboru gościa, domyślnie butelka; ilość nieznana)”, z zastrzeżeniem w „Czego ten pulpit nie mówi”. Droga (a) (zapis, czy porcja była jawna; polecenia z porcją domyślną jako „porcja nieznana” z marżą butelki i kieliszka obok siebie) tylko jako opcjonalny PR14 po osobnej zgodzie. Droga (b) (uznać POS za dowód wina) odrzucona: POS łączy kod z rachunkiem.
16. **D16 Import.** Nagłówki zawierające `zakup`, `koszt`, `cost`, `purchase`, `hurt` nigdy nie trafiają do ceny (wina i menu); zmiana zachowania `cost`/`koszt` w menu (BC); podgląd ostrzega.
17. **D17 N04.** Podpowiedzi nie dotyczą cen („sprawdź kartę”); wyjątek od N04 tylko jako osobna zmiana briefu.

## Definicje metryk
Obliczenia na liczbach niezaokrąglonych; zaokrąglenie przy wyświetleniu (PLN 0,01; procent 0,1). Czyste funkcje w `core/src/services/margin/margin.ts`.

| Pojęcie | Definicja |
|---|---|
| **Koszt butelki `C`** | netto, PLN, `0 < C ≤ 50 000`, do 2 miejsc; opcjonalny |
| **Cena netto porcji `N`** | cena z karty / `1,23`; porcja bez ceny nie ma marży |
| **Koszt porcji** | butelka `C`; kieliszek `C × glassPour / bottleSize` |
| **Marża `m`** | `N − koszt porcji`; ujemna = „poniżej kosztu”, pokazana wprost |
| **Marża %** | `m / N` (udział w cenie netto), **nie** narzut |
| **Pokrycie** | wina aktywne z kosztem / wina aktywne; agregaty karty tylko przy pokryciu ≥ 80% (liczone winami, nie przychodem) `[ASSUMPTION]` i ≥ 3 winach z kosztem w porcji; poniżej: tylko wiersze win z kosztem |
| **Klasa „wysoka”** | marża % ≥ mediana (D6); udział „wysokich” w porcji to punkt odniesienia |
| **Polecenie zamówione** | jak E09 R10 (potwierdzone ∪ dopasowane w POS), raz na polecenie |
| **Marża wina wskazanego w poleceniu** | `m(wino, porcja kodu)` dla zamówionych poleceń okresu; porcja to wybór gościa (domyślnie butelka); **nie jest to marża sprzedaży**: nie wiemy, które wino i ile sztuk zamówiono (POS łączy kod z rachunkiem, nie z winem). `n` = zamówione polecenia z kosztem (wina nieaktywne z kosztem wchodzą, wina bez kosztu i usunięte nie; liczone osobno). Średnia na polecenie z odchyleniem próbkowym `s` (n−1) i przedziałem `±1,96·s/√n` (przybliżenie normalne) tylko przy `n ≥ 30`; pokrycie pokazane obok |
| **Udział poleceń o wysokiej marży** | polecenia z klasą „wysoka” / polecenia z klasą; przedział Wilsona; pokazywany przy mianowniku ≥ 30; obok udział win „wysokich” w karcie |
| **Zakres przy założeniach (POS)** | `Σ kwota netto kieliszków × %` + `Σ kwota netto butelek × %`, `%` = min i max marży % win z kosztem danej porcji. To **nie przedział ufności**: zakłada sprzedaż po cenach karty i koszt każdego wina w zakresie win z kosztem; rabaty, zmiana cen i wina bez kosztu go łamią. Wymaga progu pokrycia i ≥ 3 win z kosztem w porcji |

### Przykłady policzone ręcznie (źródło testów; VAT 23%, butelka 750 ml, kieliszek 125 ml)
**M1 — wino A:** butelka 120 zł, `C = 45`: `N = 97,56`, `m = 52,56`, **53,9%**. Kieliszek 28 zł: `N = 22,76`, koszt 7,50, `m = 15,26`, **67,1%**.
**M2 — wino B:** butelka 300 zł, `C = 160`: `N = 243,90`, `m = 83,90`, **34,4%**. Po zł wygrywa B, po % A: ekran pokazuje oba, bez domyślnego sortowania po jednym.
**M3 — wino C:** butelka 160 zł, `C = 80`: `N = 130,08`, `m = 50,08`, **38,5%**; kieliszek 40 zł: `N = 32,52`, koszt 13,33, `m = 19,19`, **59,0%**.
**M4 — klasa (A, B, C):** butelka: 53,9; 34,4; 38,5, mediana **38,5 (C)**: A i C „wysokie”, B „niskie”, udział win wysokich **2 z 3 = 66,7%**. Kieliszek: 2 wina, **brak klasy**. Dodanie wina D (butelka 170 zł, `C = 70`, 49,4%): 4 wina, mediana to średnia środkowych `(38,5 + 49,4)/2 = 43,9`: **C staje się niskie**, wysokie A i D (50%); test sprawdza regułę parzystą.
**M5 — marża wina wskazanego w poleceniu (A, B, C):** 30 zamówionych poleceń: A kieliszek ×20 (jawnie `glass`), A butelka ×6, B butelka ×4. Suma marż jednostkowych **956,26** zł, średnia **31,88**, `s = 25,54`, `±9,14`, przedział **[22,74; 41,01]** (`n = 30`, więc wyświetlane). Polecenie bez jawnego kieliszka ma `serving = bottle` i liczy marżę **butelki** (test dla domyślnej porcji). Klasa tylko dla butelki: polecenia z klasą = 10 (A ×6 „wysoka”, B ×4), udział **6 z 10 = 60%** wobec 66,7% win wysokich; mianownik 10 < 30, więc ekran pokazuje same liczby. Brak NaN przy pustym mianowniku.
**M6 — zakres przy założeniach:** dochodzi D (kieliszek 45 zł: `N = 36,59`, koszt 11,67, `m = 24,92`, **68,1%**). Butelki A–D: 34,4–53,9%; kieliszki A, C, D: 59,0–68,1%. Kwota netto butelek 10 000 zł, kieliszków 6 000 zł: butelki **[3 440,00; 5 387,50]**, kieliszki **[3 540,00; 4 086,67]**, razem **[6 980,00; 9 474,17]** zł (43,6–59,2% przychodu z wina 16 000 zł). Przy samych A i C zakres kieliszków i całości **nie jest pokazany**.
**M7 — podpowiedzi (R10):** `K = MARGIN_HINT_MIN_ISSUED = 10` wydanych poleceń, ≥ 5 win z `K`. Wina (wydane/zamówione): W1 12/3, W2 20/12, W3 15/9, W4 11/2, W5 10/5; konwersje 25%, 60%, 60%, 18,2%, 50%, mediana **50%**. Klasy: W1, W4, W5 „wysokie”, W2, W3 „niskie”. Oczekiwane: `high_margin_rarely_ordered` dla W1 i W4 (konwersja < mediany); `low_margin_often_ordered` dla W2 i W3 (> mediany); W5 bez podpowiedzi (= mediana).
Dodatkowe przypadki: `m = 0`; `C` powyżej ceny netto; `glassPrice = null`; `n = 29` i `30`; wszystkie polecenia bez kosztu; pusty okres; wino usunięte miękko; wino nieaktywne z kosztem (w sumie, poza pokryciem).

## Wymagania
- **R1 (czyste funkcje)** `unitMargin`, `marginClass`, `orderedMargin`, `marginRange`, `hints` w `core`; stałe nazwane: `MARGIN_MIN_COVERAGE = 0.8`, `MARGIN_MIN_WINES_PER_SERVING = 3`, `MARGIN_MIN_ORDERED = MIN_RATE_SAMPLE`, `MARGIN_HINT_MIN_ISSUED = 10`, `MARGIN_HINT_MAX_PICK_SIMS = 3`, `WINE_VAT_RATE = 0.23`.
- **R2 (osobny magazyn)** Tabela `wine_cost` (złożone FK `(restaurant_id, wine_id)`) i dziennik `wine_cost_edit`; `Wine`, `PublishedView`, `buildSnapshot`, `WineRepository` i mappery nie mają pola kosztu. Koszt czytają tylko `MarginService` i `MarginReportService`. Reguła `check:boundaries`: `WineCostRepository` i `services/margin` importują wyłącznie marża i trasy marży, nigdy `engine/`, `ranking/`, `publishing/`, serwisy gościa ani `PicksSimulationService`.
- **R3 (zapis i wersja)** Jedno źródło wersji: `costsVersion` = odcisk posortowanej listy `(wineId, koszt)` wszystkich nieusuniętych win lokalu (czysta funkcja bez `node:crypto`, wzór `picksVersion`); brak wiersza = wino bez kosztu i wchodzi do odcisku jako brak. Komendy z `actor`: `setCost(slug, wineId, cost | null, actor, { expectedVersion })` i `setCosts(slug, changes[], actor, { expectedVersion })` (zbiorcza, atomowa: konflikt lub błąd jednego wiersza odrzuca całość). Kolejność: uprawnienie, wersja (nieaktualna = 409 także przy tej samej wartości), walidacja, idempotencja (ta sama wartość z aktualną wersją: `{ changed: false }`, bez wpisu dziennika). Błędy `ValidationError`, `NotFoundError`, `VersionConflictError`. `costHistory(slug, wineId)` czyta dziennik. Kontrakt repozytoriów (pamięć i PostgreSQL), `restaurantId` w każdej metodzie.
- **R4 (uprawnienia)** `margin.view`, `cost.manage` w `permissions.ts` tylko dla owner i manager (D4); każde wejście sprawdza samo, serwisy sprawdzają rolę ponownie; `getReport(slug, period, actor)` jak `ProofReportService`.
- **R5 (brak przecieku)** Koszt i każda wartość pochodna (marża w zł i %, koszt kieliszka, klasa, „poniżej kosztu”, liczniki podpowiedzi) nie występują dla ról bez `margin.view` w: migawce, `PublishedView`, API i stronach gościa, zdarzeniach, `catalog_edit`, `import_job.rows`, logach (`logger`, błąd bazy z wierszem naruszonego `CHECK`, `DB_DEBUG`), komunikatach błędów, `GET /wines`, `/dishes`, eksporcie CSV. **Kanały boczne** też: ostrzeżenie „poniżej kosztu” na A5, sortowanie po marży na A4 i A27, linia „Ostatnia zmiana” na A5 (czyta audyt katalogu: `wine_cost_edit` tam nie trafia). Przyszli konsumenci nie czytają kosztu: E14, E17 (uczenie), benchmarki D23, raport dla dostawcy P10, kampanie D22. Usunięcie lokalu (E21) kasuje `wine_cost` i `wine_cost_edit` (jedyny wyjątek od „tylko dopisywanie”, opisać w E21).
- **R6 (silnik bez zmian)** `engine/`, `ENGINE_VERSION`, `rankForGuest`, picks i `matchScore` nie czytają kosztu.
- **R7 (definicje)** Jak w „Definicje metryk”; przychód z `SalesKpiService`, polecenia z `RecommendationCodeService`.
- **R8 (odczyt poleceń)** `RecommendationCodeRepository.orderedByWine(restaurantId, period)` → `(wineId, serving, issued, ordered)`, „zamówione” jak E09 R10, jedno polecenie raz; kontrakt, pamięć, PostgreSQL.
- **R9 (reguły importu, PR0)** W importach win i menu nagłówek zawierający `zakup`, `koszt`, `cost`, `purchase` lub `hurt` nigdy nie mapuje się na cenę; podgląd ostrzega („kolumna kosztu nie została zaimportowana”) bez wartości; BC opisany.
- **R10 (podpowiedzi „do rozważenia”)** Co najwyżej 5 wierszy, nazwane reguły (próg `K` i mediana konwersji: M7): `high_margin_rarely_ordered`, `low_margin_often_ordered` (tekst „sprawdź kartę”, bez słowa o cenie, D17), `no_cost`, `pick_candidate` (co najwyżej `MARGIN_HINT_MAX_PICK_SIMS` kandydatów, każdy to pełna symulacja; tylko gdy symulator daje `moved` lub `label_only` w co najmniej jednym daniu i zbiór ma wolne miejsce). Zastrzeżenie na ekranie: liczba wydanych poleceń zależy od ekspozycji wina w silniku, nie tylko od gustu gości. Podpowiedź to link (A27, A5; A6 tylko jako podgląd, bo owner nie decyduje par), **nic nie zapisuje**, nie sugeruje zmiany pary sommeliera; nazwy bez „Para sommeliera”, „AI”, „zyskasz”.
- **R11 (marża w symulatorze)** `PicksSimulationService` **nie zmienia się** i nie dostaje repozytorium kosztu. `MarginReportService` (lub strona A27 po `can('margin.view')`) dokłada do wyniku symulacji kolumnę „marża wina na pozycji”: pozycja = **każde** wino na liście „po”, porcja = porcja silnika dla tej pozycji, a gdy lista jej nie niesie, marża butelki i kieliszka osobno; przykład: wino A na pozycji 1 pokazuje 52,56 zł (butelka) i 15,26 zł (kieliszek). Szacunek nie zakłada zmiany konwersji ani sprzedaży i tak jest opisany. Dla ról bez `margin.view` odpowiedź nie ma klucza.
- **R12 (język)** Bez „AI”; bez „zyskasz”, „dodatkowa marża”, „dzięki Wine Match”, „gwarantowane”; dozwolone „marża wina wskazanego w poleceniu”, „po bieżących cenach i kosztach”, „zakres przy założeniach”. Stałe bloki „Jak to liczymy” (VAT, brak strat, bieżące ceny) i „Czego ten pulpit nie mówi”: marża z POS to zakres; kod wskazuje wino i porcję z wyboru gościa, a POS potwierdza tylko rachunek; kod nie dowodzi przyczyny; brak grupy kontrolnej; sezon i karta; wybory wskazuje właściciel. PL i EN w jednym PR.
- **R13 (stany)** Brak kosztów: `EmptyState` z linkiem do A36; brak sprzedaży: karta i polecenia działają, zakres nie; błąd, ładowanie: komponenty `@wine-match/ui`. 390 i 1440 px bez poziomego przewijania; bez JavaScriptu (okres `GET`, koszty `POST`). W trybie demo zapis A36 wyłączony.
- **R14 (tenant i nagłówki)** Slug ze ścieżki lub `?restaurant=`, nigdy z ciała; `restaurantId` w każdej metodzie; id wina spoza lokalu, nieznane, usunięte i nie-UUID dają ten sam 404. `Cache-Control: private, no-store` ustawiam na A35, A36 i trasach marży sam (`next.config.ts` robi to tylko dla `/admin/*` i `/api/v1/auth/*`).
- **R15 (API, konwencja T-39/T-40)** `GET`/`PUT /api/v1/wines/{id}/cost?restaurant={slug}` (odpowiedź z `ETag` = `costsVersion`; `PUT` z `If-Match`, brak = 428, nieaktualny = 409), `PUT /api/v1/restaurants/{slug}/wine-costs` (zbiorczo, `If-Match`), `GET /api/v1/restaurants/{slug}/margin-report?from=&to=`. Ciało `strictObject` `{ cost: string | null }` (tekst dziesiętny `^\d{1,5}([.,]\d{1,2})?$`, bez liczby JSON); formularz usuwa spacje i twarde spacje (separator tysięcy) przed walidacją. Błędy: `invalid_cost`, `invalid_period` 422, `version_conflict` 409, 428. `handle()`, literalny `route`, `check:routes`.
- **R16 (dokumentacja)** `SCREEN_MAP.md` (A35, A36, role), `SCREEN_SPECIFICATION.md`, `API_SPECIFICATION.md`, `DATA_MODEL.md`, `USER_ROLES.md`, `threat-model.md` (wiersze), `PRODUCT_CONCEPT.md`, tabela identyfikatorów w `2026-11-04-product-completion-plan.md` (A35, A36; pytanie, czy funkcja jest ograniczona do planu wyższego, P12/E15), `security-notes.md` (log naruszenia `CHECK`, `DB_DEBUG`: hipoteza do sprawdzenia testem); `AGENTS.md` tylko osobnym PR-em (D13).

## Kryteria akceptacji
Scenariusze QA w `.ai/qa/kpi/` i `.ai/qa/security/`; numeracja: kolejne wolne (kpi-009…014 zarezerwowane przez raport wyników), potwierdzenie `check:qa`. Testy jednostkowe: `packages/core/tests/margin.test.ts`.

- [ ] **AC1 (R1, M1–M3)** Marże i % win A, B, C zgodne z przykładami (0,01 zł, 0,05 pp); `m = 0` i ujemna. *Jednostkowy.*
- [ ] **AC2 (R1, M4)** Klasa dla 3 win (A, C wysokie) i dla 4 (mediana 43,9, C niskie); udział win wysokich 66,7% i 50%; kieliszek przy 2 winach bez klasy. *Jednostkowy.*
- [ ] **AC3 (R1, R7, M5)** Suma 956,26, średnia 31,88, `s = 25,54`, `±9,14`, [22,74; 41,01]; udział 6 z 10 bez procentu; polecenie z domyślną porcją liczy butelkę; wina bez kosztu poza sumą i policzone osobno; `n = 29` bez średniej; brak NaN. *Jednostkowy.*
- [ ] **AC4 (R1, M6)** Zakres [6 980,00; 9 474,17] (43,6–59,2%); brak zakresu kieliszków przy 2 winach i przy pokryciu < 80%. *Jednostkowy.*
- [ ] **AC5a (R2, R5, API)** Kanarek kosztu `C = 7777,77` i wartości pochodne (marża w zł i %, koszt kieliszka, klasa), we wszystkich zapisach (`7777.77`, `7 777,77` z twardą spacją, `7777,77`, grosze `777777`, liczba w JSON), nie występują w migawce, `PublishedView`, odpowiedziach gościa i publicznych, zdarzeniach, `catalog_edit`, `import_job.rows`, logach (także przy naruszeniu `CHECK` i z `DB_DEBUG=true`), odpowiedziach API sommeliera i kelnera; występują tylko dla owner i manager. *E2E na PostgreSQL.*
- [ ] **AC5b (R5, strony)** To samo w HTML A4, A5, A27 dla sommeliera (bez ostrzeżenia „poniżej kosztu”, bez sortowania po marży, „Ostatnia zmiana” bez kosztu) i w HTML A35, A36 dla owner i manager. *E2E.*
- [ ] **AC6 (R6)** Po zmianie wszystkich kosztów: migawka, `rankForGuest`, `RecommendationService.forDish` i listy symulatora bajt w bajt jak przed; `engine:matrix` bez różnic; `ENGINE_VERSION` bez zmian; w deps `PicksSimulationService` nie ma kosztu. *Test w `core` i `engine:matrix`.*
- [ ] **AC7 (R3, R15)** `setCost`/`setCosts`: `C` poza `0 < C ≤ 50 000`, z 3 miejscami, liczba JSON → `invalid_cost` (422), ze spacją tysięcy poprawne w formularzu; bez `If-Match` 428; nieaktualna wersja 409 także przy tej samej wartości; aktualna wersja i ta sama wartość: bez wpisu dziennika; `null` usuwa z wpisem; zbiorcza: jeden zły wiersz odrzuca całość. *Serwis, `test:db`, trasa.*
- [ ] **AC8a (R4, API)** Owner i manager 200; sommelier i kelner 403 w API (koszt, zbiorczy zapis, raport); brak sesji 401. *HTTP.*
- [ ] **AC8b (R4, strony)** To samo na A35, A36, w akcjach i w sfałszowanym POST akcji kosztu od sommeliera (`forbidden`, wzór picks admin-038). *HTTP.*
- [ ] **AC9 (R14, §10)** `margin-boundary.e2e.test.ts`: kontrola pozytywna dla obu lokali, odmowa odczytu i zapisu cudzego sluga i cudzego `wineId` (status i ciało jak brakujący; nie-UUID ten sam 404), stan po próbie (całe ładunki i skrót md5 `wine_cost`, `wine_cost_edit`), mutacja (usunięcie filtra `restaurant_id` w `orderedByWine` lub `WineCostRepository` = czerwony test; zapis w logu). *E2E.*
- [ ] **AC10 (R15)** Pole spoza schematu → 422; zły `from`/`to`, okres > 366 dni → 422, `wineId` nie-UUID → 404, bez 500. *Trasa.*
- [ ] **AC11 (R8)** Suma `ordered` z `orderedByWine` równa `summary.ordered`; zgodność z `pairStats` dla kontekstu `dish`; kod na wielu liniach raz. *Kontrakt repozytoriów.*
- [ ] **AC12 (R7)** Przychód z wina w okresie na A35 równy `SalesKpiService.getSalesKpis`. *Kontrakt.*
- [ ] **AC13 (R10, M7)** Reguły dają wiersze z M7 (W1, W4; W2, W3; brak W5); `pick_candidate` nie pojawia się przy `none` ani pełnym zbiorze i nie przekracza 3 symulacji; podpowiedzi nic nie zapisują; najwyżej 5. *Jednostkowy i e2e.*
- [ ] **AC14 (R11)** Kolumna marży w symulatorze tylko dla `margin.view` (klucz, nie `null`); wartości z przykładu (52,56 i 15,26); sommelier dostaje te same listy bez pola. *Trasa i SSR.*
- [ ] **AC15 (R12)** Tekst A35, A36 i API (PL, EN, wszystkie stany) nie pasuje do `\bAI\b|zyskasz|dodatkowa marża|dzięki Wine Match|gwarantowan|Para sommeliera`; zawiera oba bloki, VAT i „bez strat”. *SSR.*
- [ ] **AC16 (R13)** Stany: brak kosztów, brak sprzedaży, pokrycie < 80%, błąd, demo (zapis wyłączony); 390 i 1440 px bez `scrollWidth > innerWidth`; bez błędów konsoli; okres i koszty bez JavaScriptu. *E2E.*
- [ ] **AC17 (R9, PR0)** Import wina i menu z nagłówkami `Cena zakupu`, `Cena zakupu netto`, `Koszt`, `Cost`, `Purchase price`, `Hurt`: żadna kolumna nie trafia do ceny (nawet jako pierwsza), podgląd ostrzega bez wartości. *Czerwony test przed poprawką (`verify:regression`), potem zielony.*
- [ ] **AC18 (PR13, opcjonalnie)** Kolumna kosztu w imporcie: rola bez `cost.manage` ją ignoruje, koszt nie trafia do `import_job.rows` ani podglądu. *Import.*
- [ ] **AC19 (R16)** Dokumentacja zaktualizowana; `check:context`, `check:qa`, `check:routes`, `check:pages`, `check:boundaries` zielone. *Polecenia.*
- [ ] **AC20 (ogólne)** `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; migracja z dowodem up/down/up i planem wycofania; wyścig dwóch zapisów **różnych** wartości tego samego wina (`race()`): jeden 200, jeden 409. *Log przebiegu.*
- [ ] **AC21 (R3)** `costHistory` zwraca wpisy dziennika (przed, po, rola, czas), tylko dla `margin.view`; brak wpisu przy idempotentnym zapisie. *Serwis, trasa.*

## Projekt rozwiązania

### Model danych
- `wine_cost`: `restaurant_id`, `wine_id`, złożone FK, `bottle_cost numeric(10,2)` z `CHECK (bottle_cost > 0 AND bottle_cost <= 50000)`, `set_at`, `set_by_membership_id`; klucz `(restaurant_id, wine_id)`; zapytania pomijają wina usunięte miękko (filtr `restaurant` i `deletedAt` jak w `PgPicksRepository.set`). Brak kolumny w `wine`; brak `version int` (wersja to `costsVersion`).
- `wine_cost_edit` (tylko dopisywanie): restauracja, `wine_id` bez FK, `before`, `after`, rola, `actor_id`, czas z `Clock`; w tej samej transakcji co zmiana. Odczyt tylko `margin.view`.
- Migracja osobnym PR-em (`risk-high`, dane wrażliwe); `down` kasuje koszty, więc plan wycofania: naprawiamy do przodu albo eksport przed `down`.

### Pliki
`core/src/services/margin/` (`margin.ts`, `margin-service.ts`, `margin-report-service.ts`, `costs-version.ts`), `core/src/validators/margin/`, `permissions.ts`, porty, `memory/*`, `db/src/entities/margin/*`, `db/src/repositories/*`, `app/src/server/container.ts`, `scripts/check-boundaries.mjs` (R2), trasy `api/v1/wines/[id]/cost`, `api/v1/restaurants/[slug]/{wine-costs,margin-report}` (skill `wine-match-new-api-route`), `(admin)/admin/[slug]/margin/{page.tsx,costs/page.tsx}`, `margin-actions.ts` (`authorizeAction(slug, 'cost.manage')`), pole kosztu na A5, nawigacja tylko dla `margin.view`, słowniki PL i EN, poprawka `core/src/import/mapping.ts` (PR0). Testy: `margin.test.ts`, kontrakty, `db/tests` (migracja, `concurrency.integration.test.ts`), `margin.e2e.test.ts`, `margin-boundary.e2e.test.ts`, `margin-leak.e2e.test.ts`, `import-cost-header.test.ts`; `check:pages` (strona woła `requireAccess` przed odczytem, nie w `Promise.all`).

### Ekrany
**A35** (po A27, owner i GM): okres jak A13 i pokrycie („38 z 52 win ma koszt”, link do A36); „Marża win z karty”; „Marża wina wskazanego w poleceniu” (liczby, średnia z przedziałem przy `n ≥ 30`, udział z punktem odniesienia); „Zakres przy założeniach (POS)”; „Do rozważenia”; marża bieżących wyborów restauracji (z karty); bloki „Jak to liczymy” i „Czego ten pulpit nie mówi”; link do A33. **A36**: tabela win (cena butelki i kieliszka z karty, pole kosztu `inputmode="decimal"`), jeden `POST` na całą tabelę z `costsVersion`, flash błędów po kodzie; wina nieaktywne oznaczone; w demo zapis wyłączony. **A5, A27:** pole kosztu i kolumna marży tylko dla uprawnionych; sommelier widzi te ekrany jak dziś.

### Plan PR-ów (każdy ≤ ok. 150 linii poza wyjątkami z §11; model danych osobno)
0. **PR0** Import: nagłówki kosztu nigdy w cenę (czerwony test AC17, ostrzeżenie w podglądzie, BC, wiersz threat-model); wcześniej niż reszta, `risk-high`.
1. `margin.ts` + AC1–AC4, AC13 część czysta.
2. Uprawnienia + test macierzy + `USER_ROLES.md`.
3. Migracja i encje `wine_cost`, `wine_cost_edit` (dowód up/down/up).
4. `WineCostRepository` + `costsVersion` + kontrakt.
5. `MarginService` (`setCost`, `setCosts`, `costHistory`) + AC7, AC20 wyścig, AC21.
6. `orderedByWine` + AC11.
7. `MarginReportService` (karta, polecenia, zakres, podpowiedzi, kolumna symulatora) + AC3, AC12, AC13, AC14 część serwisowa.
8. Trasy kosztu i zbiorcza + schematy + `check:routes` + AC5a, AC8a, AC9, AC10 dla kosztu + wiersz threat-model + reguła `check:boundaries` (`risk-high`).
9. Trasa `margin-report` + AC8a, AC10 dla raportu.
10. A36, akcja, pole na A5, test sfałszowanego POST + AC5b część, AC8b, AC7 część formularza.
11. A35 część 1 (karta, polecenia, zakres) + słowniki + AC15, AC16 część.
12. A35 część 2 (podpowiedzi, symulator A27, wybory) + docs (AC14, AC16, AC19).
13. Opcjonalnie: import kolumny kosztu (AC18, osobna zgoda).
14. Opcjonalnie: jawna porcja przy kodzie (D15 (a), osobna zgoda).

## Ryzyka i otwarte pytania
**Ryzyka.**
- **Wyciek kosztu** (tajemnica przedsiębiorstwa lokalu): osobny magazyn, brak pola w `Wine`, kanarek AC5, kanały boczne w R5, reguła `check:boundaries`, wiersze threat-model. Rezydualne: pracownik operatora z dostępem do bazy i kopie zapasowe (zapis w `security-notes.md` i w umowie; opinia prawna co do klauzuli poufności, to nie jest porada prawna).
- **Fałszywa precyzja:** metryka z poleceń dotyczy wina wskazanego, nie sprzedanego; zakres z POS to założenia, nie przedział ufności; sezon, karta i ceny mieszają się z efektem. Łagodzą: progi, przedziały, brak Δ i werdyktów, bloki zastrzeżeń.
- **Koszt jako cena:** istniejący import (D16, PR0). Bez PR0 koszt wpisany w pliku mógłby być pokazany gościom.
- **Marża jako przymus:** podpowiedź `pick_candidate` może prowadzić do wyboru restauracji pod marżę; to decyzja właściciela (D24), oznaczona etykietą, bez zmiany liczby; sommelier nie widzi marży, para sommeliera nie powstaje pod nią.
- **Cena poniżej kosztu:** sommelier z `catalog.edit` może po cichu zepsuć marżę; pulpit pokazuje to wprost, bez blokady ceny.
- **VAT i cena brutto** (D2), **ceny i koszt bieżące** (D12), **niepełne koszty** (progi pokrycia), **ekspozycja silnika** (R10) to założenia nazwane na ekranie.

**Pytania otwarte.** Czy pilot zechce wpisać koszty i w jakiej formie (C01; od tego zależy PR13); czy eksport POS kiedykolwiek poda numer pozycji lub wina (E03 C03); czy funkcja ma być tylko w planie wyższym (P12/E15); czy dziennik kosztów widzą owner i manager (rekomendacja: tak, jak `audit.view`).

## Przegląd niezależny
Przegląd wykonał agent w świeżym kontekście, innego modelu niż autor (model nie zapisany), na commicie z pierwszą wersją. Werdykt: gotowe po poprawkach. Wszystkie poniższe poprawiono w treści, chyba że napisano „odłożone”.

| Waga | Znalezisko | Rozstrzygnięcie |
|---|---|---|
| BLOKUJĄCE B1 | „Marża z poleceń” liczyła wino i porcję, których kod nie potwierdza (`serving` domyślnie butelka, POS wiąże kod z rachunkiem, ilość nieznana) | Metryka przemianowana na „marżę wina wskazanego w poleceniu”, zastrzeżenie w „Czego ten pulpit nie mówi”, test z domyślną porcją (M5, AC3), D15: (c) teraz, (a) jako opcjonalny PR14, (b) odrzucona |
| WAŻNE W1 | Kolejność PR (usługa po trasie), AC w złych PR-ach, PR ponad 150 linii, brak testu sfałszowanego POST | Plan PR przepisany (PR0–PR14), AC5 i AC8 podzielone na API i strony, trasa raportu osobno, test POST w PR10 |
| W2 | Brak kontraktu zapisu zbiorczego i wersji; odstępstwo od konwencji `If-Match` | `costsVersion` jako jedyne źródło, `setCosts`, `ETag`, `If-Match`, 428, semantyka braku wiersza, trasy w konwencji T-39 (R3, R15) |
| W3 | R11 niedookreślone i sprzeczne z R2 | Przykład liczbowy, złączenie w `MarginReportService`, symulator bez zmian, test deps (R11, AC6, AC14) |
| W4 | Reguły podpowiedzi bez progów | Stałe `K` i mediana konwersji, M7, zastrzeżenie o ekspozycji, AC13 |
| W5 | Błędny punkt odniesienia 50% i brak reguły parzystej mediany | Punkt odniesienia = rzeczywisty udział win wysokich, reguła parzysta, M4 i M5, AC2 |
| W6 | Konwersja z etykietą i bez nie mierzy wpływu etykiety; fałszywe odwołanie do picks F1 | Konwersję i flagę `pick` usunięto z zakresu (D7), pomiar etykiety ze zdarzeń odłożony |
| W7 | Kanarek tylko dla `C`; kanały boczne | Kanarek dla wartości pochodnych i zapisów (AC5a), kanały boczne w R5 i AC5b |
| W8 | Import zamienia koszt w cenę | PR0 z czerwonym testem (R9, D16, AC17), BC |
| W9 | Brak odniesienia do N04 | D17: podpowiedzi nie dotyczą cen |
| W10 | Słabe uzasadnienie D4 | Opcja wpisu kosztów przez sommeliera, uwaga o wpływie przez `catalog.edit` i `import.manage` |
| DROBNE 1–17 | `s` i przedział, walidacja `C` jako tekst, kolejność wersji i idempotencji, FK i 404, logi naruszenia `CHECK`, aktor w `getReport`, reguła `check:boundaries`, AC6 szerszy, uczciwy TLDR i D8, limit kandydatów, wina nieaktywne z kosztem, przyszli konsumenci i E21, demo, VAT i lokal zwolniony, tabela planu produktu, AC `costHistory`, „zakres przy założeniach”, nagłówki `no-store` | Wprowadzone w treści (M5, R2–R5, R8, R10, R13–R16, AC2, AC6, AC7, AC21); odłożone: ustawienie VAT per lokal (D2) i historia kosztu (D12), z powodem w załączniku decyzji |

## Changelog
- 2026-11-25 — Autor: model nie zapisany (log przebiegu `.ai/runs/2026-11-25-margin-dashboard-spec.md`). Pierwsza wersja `draft`.
- 2026-11-25 — Recenzent: inny model niż autor, model nie zapisany (źródło: ta specyfikacja, sekcja „Przegląd niezależny”; log przebiegu). Poprawki po przeglądzie.

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
