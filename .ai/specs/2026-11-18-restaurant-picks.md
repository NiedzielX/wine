---
status: draft
created: 2026-11-18
owner: Filip Niedziela
related: [.ai/specs/product-brief.md (D22, D24, D25, R02, R06, N02), .ai/specs/2026-11-04-restaurant-operations.md (E19, F2 zastępowane), .ai/specs/2026-11-04-panel-completion.md (E13 F1, F2 na main), .ai/specs/2026-11-04-learning-layer-shadow-model.md (E17), .ai/specs/2026-11-04-staff-accounts-and-roles.md (E12, tabela uprawnień), .ai/specs/implemented/2026-10-16-recommendation-code.md, .ai/specs/implemented/2026-10-15-pos-sales-import-attach-rate.md, docs/RECOMMENDATION_ENGINE.md, docs/security/threat-model.md, .ai/runs/2026-11-18-restaurant-picks-spec.md, "strategia produktu: .ai/specs/research/benchmarks/2026-11-16-product-strategy-vs-sommelierbot.md (na gałęzi docs/product-strategy-vs-competitors, jeszcze nie na main; P12, część 1)"]
superseded_by:
author_model: not recorded
reviewed_by: not recorded
---

# Wybór restauracji, faza 1: kolejność i etykieta z symulatorem „przed / po” (tryb ostrożny)

## TLDR
Restauracja ma oznaczyć do 5 własnych win jako **„Wybór restauracji”** / **„Restaurant’s pick”**. W trybie ostrożnym (jedynym w tej fazie) zmieniają się **tylko kolejność w grupie propozycji silnika i etykieta**. Match Score pokazywany gościowi jest wynikiem silnika, bez żadnej zmiany. Wybór nigdy nie staje nad „Parą sommeliera” (R06), nie dostaje pieczęci i działa tylko na wina, które i tak mają surowy wynik co najmniej 75. Zbiór wyborów trafia do **migawki publikacji** (schema 3), a gość czyta go wyłącznie z `PublishedView`. Panel ma **symulator „przed / po”**, który liczy tą samą funkcją, której używa gość, bez żadnego zapisu. `engine/` się nie zmienia (`ENGINE_VERSION` bez zmian); kolejność to cienka warstwa **po silniku** (`core/src/ranking/`).

Dalsze fazy (poza zakresem tej specyfikacji, tylko szkic): F2 liczba z pułapem +5 (osobna decyzja właściciela, opinia prawna, zmiana `AGENTS.md` §7), F3 raport marży z kasy.

## Problem
- Restauracja ma własny zapas, końcówki partii i wina o wyższej marży, a jedyną dźwignią jest rola pary w panelu sommeliera (jego głos, nie GM). D24 (2026-11-16) mówi, że restauracja może podbijać wina; cel właściciela to wyższa marża restauracji. Strategia (P12) wskazuje konkurenta (Ambrosia), który już sprzedaje „promowanie butelek”, bez opisanych granic dla gościa.
- E19 F2 („wina do sprzedania”, zatwierdzone, **niezbudowane**: w kodzie nie ma `sellPriority`) zakłada flagę „na żywo” i dodatek +5 do `rankScore` wewnątrz silnika. Nie ma więc symulatora, a gość mógłby zobaczyć wynik zmieniony bez publikacji i bez śladu w migawce. Nie da się też odtworzyć, co gość widział (R03).
- Bez uczciwych granic podbicie kupuje marżę za zaufanie: liczba nazwana „dopasowaniem”, a podniesiona z powodów handlowych, może wprowadzać w błąd. Dlatego faza 1 nie rusza liczby.
- Źródła: strategia sekcje 3.4 (P12), 3.6 (pytania 9–10), 5 („co zacząć wdrażać najszybciej po E13 F1”); brief D22–D25, R02, R06. Wnioski strategii o konkurencji to tropy ze streszczeń wyszukiwarki, nie zmierzony fakt. Hipoteza „o wyborze decyduje głównie pozycja na liście, nie liczba” jest **niezmierzona**; faza 1 ma to zmierzyć (zdarzenia z flagą `pick`).

## Cel i zakres
**W zakresie (F1):**
1. Zbiór „wyborów restauracji” (per wino, max 5, tylko wina aktywne), zapisywany tylko przez serwis z `actor`, `expectedVersion`, z audytem.
2. Wpis zbioru do migawki publikacji (schema 3). Wersje starsze: brak wyborów.
3. Warstwa kolejności po silniku (czysta funkcja, nazwane reguły, test niezmienników) w `RecommendationService.forDish` i `wineDetails`.
4. Etykieta u gościa PL/EN, bez JS, bez słowa „AI”; zdanie w G12; flaga w publicznym API i zdarzeniach użycia.
5. Panel: ekran A27, znacznik w A4/A5/A6, licznik zmian w A11, **symulator**.
6. Uprawnienie `picks.edit`, trasy API, migracja, testy, QA, dokumentacja.

**Poza zakresem:** zmiana wyświetlanej liczby, pułap, nazwa „Polecenie restauracji” (F2); koszt zakupu, marża, raport marży (F3); płatne pozycje i kampanie dostawców, rola dostawcy, jakiekolwiek pole „sponsor” (D22/D25: osobna specyfikacja po opinii prawnej); wybory per danie, daty ważności, cel „wyprzedaj zapas” (zapas to N04); „cały stół” G6 (`recommendForTable`); zmiana `engine/`, wag, progów silnika i `ENGINE_VERSION`; uczenie (E17 dostaje tylko flagę); przywracanie wersji (E13 F4) poza zapisem, że wersja niesie swój zbiór; zmiana `AGENTS.md` w tym przebiegu.

## Nakładanie z E19 i rozstrzygnięcie
**Rozstrzygnięcie: ta specyfikacja ZASTĘPUJE E19 F2, a nie rozszerza go ani od niego nie zależy.** E19 F1, F3, F4, F5 zostają bez zmian. Powody: (a) ten sam cel i ten sam zakres pola (wino oznaczone przez restaurację, limit 5, próg 75, etykieta „Wybór restauracji”), więc dwie funkcje obok siebie dawałyby dwa przełączniki na jedno wino; (b) mechanika jest inna w czterech punktach, więc rozszerzenie wymagałoby przepisania prawie całego F2 (tabela poniżej); (c) E19 F2 nie jest zbudowany, więc zastąpienie nic nie psuje.

| Punkt | E19 F2 (zatwierdzone) | Ta specyfikacja |
|---|---|---|
| Gdzie żyje zbiór | kolumna `wine.sell_priority`, „na żywo” (Q1 E19) | tabela `restaurant_pick`, **w migawce** (schema 3), zmiana dociera do gości z publikacją |
| Jak działa | dodatek +5 do `rankScore` w `recommendForDish` (zmiana `engine/`) | partycja kolejności **po silniku**, `engine/` bez zmian |
| Symulator | brak | jest, tą samą funkcją co gość |
| Uprawnienie | `wines.priority` | `picks.edit` (owner, manager); `wines.priority` nie powstaje |
| Ekran | A27 „Wina do sprzedania” | A27 „Wybory restauracji” (ten sam identyfikator, nowa treść) |

**Zachowane z E19 bez zmian:** limit 5 atomowo, tylko wina aktywne, próg `MIN_MODEL_SCORE + 13` (75), brak ścieżki od dostawcy (R9, N01 w duchu: D22 jest osobnym mechanizmem), brak wyboru w „całym stole” (Q8), kto ustawia (Q6: owner i manager, sommelier widzi), neutralna etykieta bez pieczęci (Q10).

**Co trzeba zrobić z E19 po akceptacji tej specyfikacji (przez człowieka lub osobny PR z przeglądem; E19 jest `approved`, więc tego przebiegu nie edytuję):** dopisać w E19 przy F2 „zastąpione przez 2026-11-18-restaurant-picks (R6–R11, AC8–AC13, A27, `wines.priority`)”, zaktualizować kontrakt E13 (punkt 3: `sellPriority` przestaje być daną „na żywo”; wybory są „w wersji”) i wiersz E19 w planie (`wines.priority` → `picks.edit`, A27). E19 F1 (`isOrderable`, dostępność) nie jest warunkiem: warstwa działa na wyniku silnika, a wyprzedane wino wypada wcześniej, gdy F1 wejdzie. E17 (`sell_priority`) czyta flagę `pick` zamiast `sell_priority`; E04 dostaje klucz w `props`.

## Wymagania
Stałe w jednym miejscu (`core/src/ranking/restaurant-picks.ts`): `PICKS_MAX = 5`, `PICK_MIN_SCORE = MIN_MODEL_SCORE + 13` (dziś 75; relacja zamiast literału, jak w E19), `PICKS_PROMOTED_MAX = 2`. Wartości są **propozycją bez danych**; krok 1 planu sprawdza je na Halce (O3).

**Zbiór i zapis**
- **R1** Tabela `restaurant_pick` (restauracja, wino, kto, kiedy); unikalność (restauracja, wino); tylko wino `active` tej restauracji; maks. `PICKS_MAX` (błąd `too_many_picks`, sprawdzany atomowo przez blokadę wiersza restauracji w transakcji; dwa równoległe zapisy nie dadzą 6). Wino nieaktywne nie liczy się do limitu i nie trafia do migawki; usunięcie wina usuwa wybór (kaskada).
- **R2** `RestaurantPicksService.setPick(slug, wineId, on, actor, { expectedVersion })` przez port `PicksRepository`; błędy jako `DomainError` (`too_many_picks`, `version_conflict`, `NotFoundError` dla obcego lub nieznanego wina); idempotentny (`{ changed: false }`, bez wpisu audytu). `expectedVersion` to odcisk posortowanej listy id (czysta funkcja bez `node:crypto`, wzór `profileVersion`).
- **R3** Append-only `pick_edit` (restauracja, id wina bez FK, `on`, `actor`, `actorId`, czas z `Clock`) zapisany w tej samej transakcji co zmiana. To ślad na wypadek sporu, kto i kiedy oznaczył wino.
- **R4 (uprawnienie)** Nowe `picks.edit` w tabeli `core/src/auth/permissions.ts` dla owner i manager. Sommelier i kelner: bez zapisu; sommelier ma `panel.view`, więc widzi A27 i symulator. Każda trasa i akcja sprawdza samo (`handle()`, `authorizeAction`).

**Migawka i widok gościa**
- **R5** `SNAPSHOT_SCHEMA = 3`: `picks?: { wineIds: string[] }` (posortowane id aktywnych win z zestawu w chwili publikacji). `readSnapshot` czyta schema 2 jak dziś, z pustym zbiorem. `buildSnapshot` przyjmuje zbiór; ścieżki publikacji w pamięci, PostgreSQL i seeder demo wołają ten sam `buildSnapshot`. Wersje są dalej niezmienne; **bez migracji danych starych wersji**.
- **R6** `PublishedView.picks: ReadonlySet<string>` z migawki, zawężony do win widocznych (`view.wines`). Restauracja nigdy nie publikowana lub wersja bez schema 3: zbiór pusty (gość nie widzi wyborów, dopóki restauracja ich nie opublikuje).
- **R7** Licznik „niepublikowane zmiany” (`PublishService.preview`) uwzględnia różnicę między zbiorem roboczym a migawkowym (`countPickChanges`, różnica symetryczna; dla wersji bez schema 3 i pustego zbioru roboczego: 0). Wpis do `diffVersions` dodaje E13 F3 albo ta faza, jeśli wejdzie później (kontrakt E13, pkt 4).

**Warstwa kolejności (`core/src/ranking/restaurant-picks.ts`, poza `engine/`)**
- **R8** `applyRestaurantPicks(result, picks, limit)` jest czystą funkcją i **nie zmienia żadnego `matchScore`, `rankScore`, `why`, `tier` ani `sommelier`**. Reguły (każda nazwana, z testem): `pick.tier2_only` (zmienia się tylko kolejność wśród pozycji `tier === 2`; skład i kolejność tier 0 i 1 identyczne dla każdego zbioru); `pick.min_score` (kwalifikuje się wino z `matchScore >= PICK_MIN_SCORE`; słabsze zostaje na swoim miejscu i bez etykiety); `pick.promote_cap` (na początek grupy tier 2 przechodzą najwyżej `PICKS_PROMOTED_MAX` kwalifikujących się wyborów, w kolejności silnika; pozostałe zostają po swoich miejscach); `pick.no_seal` (pozycja z wyboru nie ma pieczęci ani roli sommeliera); `pick.deterministic`. Po przestawieniu `markBestValue` liczy się od nowa na wynikowej liście.
- **R9** Pozycja dostaje `restaurantPick: boolean` = `tier === 2` i wino w zbiorze i `matchScore >= PICK_MIN_SCORE` (także gdy nie przeszła na początek, bo wybór jest wtedy dalej wyborem restauracji). Wino z wyboru, które jest parą sommeliera (tier 0/1), ma pieczęć i **nie** ma etykiety wyboru (pieczęć jest silniejszym znakiem; w panelu widać „bez wpływu: para sommeliera”).
- **R10** Gdy lista jest wynikiem łagodzenia budżetu (`notice !== null`), warstwa nic nie przestawia i nie oznacza (uczciwość: „najbliższe opcje” to nie ranking wyborów).
- **R11** `RecommendationService.forDish` i `wineDetails` (pole `match`, G7 spójne z G3) wołają silnik z `limit = liczba win` **tylko wtedy, gdy zbiór nie jest pusty**, potem warstwę (która przycina do `limit` i liczy `bestValue`), potem istniejący filtr `showUnreviewed`. Przy pustym zbiorze ścieżka jest bit w bit dzisiejsza. `forTable` (G6, `recommendForTable`) bez zmian.
- **R12 (nagłówek)** Najlepsza karta (`BestCard`) z pozycją `restaurantPick` na pierwszym miejscu ma nagłówek „Wybór restauracji” / „Restaurant’s pick”, **nie** „Polecane do Twojego dania” (to jest najlepsza propozycja silnika, a pierwsza pozycja nią nie jest).

**Uczciwość (twarde reguły, każda z testem)**
- **U1** Wyświetlany Match Score = wynik silnika, identyczny z tym bez wyborów (test równości po `wineId`).
- **U2** Wybór nie staje nad parą sommeliera i nie nadaje pieczęci (R06).
- **U3** Etykieta jest widoczna bez dotknięcia i bez JS; neutralna typografia, bez koloru marki sommeliera i bez ikony pieczęci.
- **U4** Uzasadnienie („dlaczego pasuje”) pochodzi z surowych czynników; wybór nie dopisuje zdań o smaku.
- **U5** Brak ścieżki od dostawcy: żadna trasa, akcja, import ani pole ustawiające wybór poza `picks.edit` uwierzytelnionego członka tej restauracji; wybór nie jest związany z planem ani płatnością.
- **U6** G12 mówi gościowi jednym zdaniem, czym jest etykieta (PL: „Restauracja może oznaczyć część win jako swój wybór i pokazać je wyżej wśród propozycji. Oznaczenie nie zmienia wyniku dopasowania, a para sommeliera zawsze zostaje na górze.”; EN odpowiednio).
- **U7** Zdarzenia: `recommendations_viewed.items[].pick`, `wine_viewed` i `wine_selected` dostają `props.pick: true` przy pozycji z etykietą (nowy klucz, nazw zdarzeń nie zmieniamy), żeby E04, E17 i F3 odróżniały wybór restauracji od wyboru silnika. E17 nie uczy się na pozycjach z flagą jako sygnale „pasuje”.
- **U8** Regulamin (poza kodem, do właściciela, O13): restauracja nie używa wyboru do ukrytej płatnej promocji dostawcy; płatna promocja ma D25 i osobną specyfikację.

**Symulator**
- **R13** `PicksSimulationService.simulate(slug, { picks?, dishId? })` jest odczytem bez zapisu. Dla każdego widocznego dania (`PublishedView`) liczy listę „przed” (zbiór migawkowy, czyli to, co gość widzi teraz) i „po” (zbiór roboczy albo zbiór z parametru `picks`, max 5 id) **tą samą ścieżką co gość** (`recommendForDish` + `applyRestaurantPicks`, z tymi samymi preferencjami domyślnymi). Zmieniają się wyłącznie wybory; inne niepublikowane zmiany (pary, profile) są poza symulacją i ekran to mówi. Wynik per danie: pozycje z `matchScore` surowym, `restaurantPick`, przesunięcia (wszedł, wypadł, o ile miejsc) oraz powód braku wpływu per wybór (`below_min_score`, `sommelier_pair`, `over_cap`, `not_in_list`, `inactive`). Podsumowanie: liczba dań ze zmianą kolejności, wybory bez żadnego wpływu. Bez wywołań sieci i LLM (N03), bez własnej punktacji.
- **R14** Symulator działa bez JS jako formularz `GET` (zaznaczone wina w URL); z JS bez przeładowania nie jest wymagany w F1.
- **R15** Gwarancja: lista „po” w symulatorze jest równa liście gościa po publikacji tego zbioru (test: publikuj i porównaj).

**API i ekrany**
- **R16** Trasy (`handle()`, ciało przez `parseBody(req, schemat)`, schemat `strictObject` w `core/src/validators/picks/`, bez własnego `try/catch`, id przez `isUuid`, restauracja ze sluga po stronie serwera):
  - `GET /api/v1/restaurants/{slug}/picks` zbiór roboczy, `version`, limit, per wino status wpływu;
  - `PUT /api/v1/wines/{wineId}/pick?restaurant={slug}` ciało `{ on: boolean, expectedVersion?: string }`;
  - `GET /api/v1/restaurants/{slug}/picks/simulation?picks=…&dish=…` (parametry walidowane tym samym schematem Zod).
  Publiczna trasa rekomendacji dostaje pole addytywne `restaurantPick: boolean`; kolejność tier 2 może się zmienić (BC §2, wpis w `docs/API_SPECIFICATION.md`).
- **R17** Ekrany: **A27** `/admin/{slug}/picks` (lista wyborów n z 5, przełącznik, symulator; formularze bez JS) z nawigacji „Wine program”; **A4** kolumna i przełącznik, **A5** przełącznik, **A6** znacznik wyboru i informacja o wpływie, **A11** pozycja „Wybory restauracji: +n / −n” w niepublikowanych zmianach. Gość: **G3** (etykieta, nagłówek R12), **G7** (etykieta w sekcji dopasowania), **G9** (kelner widzi etykietę), **G12** (U6). G6 i G11 bez zmian. Brak `console.*`, brak nowych komponentów klienckich; stany pusty/błąd przez `EmptyState`/`ErrorMessage`.
- **R18** Teksty w `src/i18n/en.ts` i `pl.ts` (zgodne klucze, test słowników), bez „AI”; PL: „Wybór restauracji”, EN: „Restaurant’s pick”.
- **R19 (dokumentacja)** w tym samym przebiegu: `docs/DATA_MODEL.md`, `API_SPECIFICATION.md`, `SCREEN_MAP.md`, `SCREEN_SPECIFICATION.md`, `USER_ROLES.md` (macierz), `RECOMMENDATION_ENGINE.md` (nowa sekcja „Warstwa wyborów restauracji (poza silnikiem)”, bez nowych reguł `engine/`), `BACKWARD_COMPATIBILITY.md` (§2 kolejność i pole, §3 tabele i schema 3, §5 uprawnienie), `docs/security/threat-model.md` (nowy wiersz), `packages/core/AGENTS.md` (katalogi `ranking/`, `services/picks/`).

## Kryteria akceptacji
Każde AC o zachowaniu UI lub API ma scenariusz w `.ai/qa/{AREA}/` i test e2e w `packages/app/tests/e2e/`; numery scenariuszy są orientacyjne, nadaje je implementacja (`check:qa`).
- [ ] **AC1** (R8, U1) Bez wyborów wynik `forDish` jest bit w bit dzisiejszy (test złoty `engine-golden` i test serwisu na Halce); z wyborami każde `matchScore`, `rankScore`, `why` danego wina jest równe wartości bez wyborów. *Unit w `core/tests/`.*
- [ ] **AC2** (R8, U2) Dla losowych zbiorów wyborów skład i kolejność tier 0 i 1 są niezmienione; pozycja z wyboru nigdy nie stoi przed pozycją tier 0/1 i nie ma `sommelier`. *Test własności na Halce + mutacja (usunięcie warunku tieru musi zepsuć test); scenariusz guest-019.*
- [ ] **AC3** (R8) Granice progu: wino 74 nie jest kwalifikowane i nie ma etykiety, 75 jest; trzeci kwalifikujący się wybór nie przechodzi na początek (`PICKS_PROMOTED_MAX`). *Unit z granicami; guest-020.*
- [ ] **AC4** (R9, R10) Para sommeliera będąca też wyborem ma pieczęć i nie ma etykiety; przy `notice` (budżet) nic się nie przestawia. *Unit + test SSR G3.*
- [ ] **AC5** (R1, R2) Szósty wybór daje `too_many_picks`, także przy dwóch równoległych zapisach (nigdy 6 wierszy); `setPick` jest idempotentny; obce lub nieznane wino daje `NotFoundError`; nieaktualne `expectedVersion` daje `version_conflict`; audyt zapisany w tej samej transakcji. *Kontrakt `repository-contract.ts`/`write-contract.ts` w pamięci i `npm run test:db` (dwie sesje); admin-021.*
- [ ] **AC6** (R5, R6) Migawka schema 3 zapisuje posortowane id aktywnych win; schema 2 jest czytana z pustym zbiorem; wino zdezaktywowane po publikacji nie jest widoczne jako wybór; round-trip `buildSnapshot`/`readSnapshot`. *Unit `published-view.test.ts` i testy snapshotu.*
- [ ] **AC7** (R5, R6) Zmiana zbioru bez publikacji nie zmienia ładunku gościa (całe ładunki `GET …/public/…/recommendations` dla wszystkich dań przed i po); po publikacji kolejność i etykieta się zmieniają, a `matchScore` nie. *E2E na PostgreSQL, w tym rozszerzenie `access-boundaries-guest.e2e.test.ts`; guest-018.*
- [ ] **AC8** (R7) A11 pokazuje „Wybory restauracji: +n / −n” i licznik niepublikowanych zmian rośnie i spada po publikacji. *Test serwisu + SSR; admin-024.*
- [ ] **AC9** (R13, R15) Symulator zwraca „przed” równe dzisiejszej liście gościa, a „po” równe liście gościa po publikacji tego zbioru; nie zapisuje niczego (digest tabel przed i po wywołaniu równy); podaje powód braku wpływu per wybór. *Unit + e2e; admin-023.*
- [ ] **AC10** (R4, U5) Sommelier i kelner dostają 403 na `PUT …/pick` i odmowę sfałszowanej akcji formularza; sommelier widzi A27 i symulator bez przycisków zmiany; nie istnieje trasa, akcja, import ani pole ustawiające wybór poza `picks.edit`. *Test trasy, akcji, routingu, permissions; admin-022.*
- [ ] **AC11** (granica dostępu, `engineering-standards.md` §10) Test HTTP z trzema sprawdzeniami: (1) kontrola pozytywna dla OBU kont (A→B i B→A: `PUT` własnego wina 200); (2) odmowa odczytu i zapisu (obcy slug 403, cudze id pod własnym slugiem 404 z ciałem równym nieistniejącemu, za niska rola 403, pole spoza schematu 422); (3) stan po próbie: całe ładunki `GET picks` i `recommendations` obu restauracji przed i po oraz `md5(string_agg(x::text …))` tabel `restaurant_pick` i `pick_edit`. Mutacja: usunięcie filtra `restaurantId` w repozytorium i wymuszenie roli muszą zepsuć test (zapis w logu). *`access-boundaries-picks.e2e.test.ts`; security-033; wiersz w `threat-model.md`.*
- [ ] **AC12** (R11, R12, U3, U4) G3 i G7 pokazują „Wybór restauracji” / „Restaurant’s pick” (PL/EN), bez `Seal` i bez „Para sommeliera”; pierwsza pozycja z wyboru ma nagłówek wyboru, nie „Polecane do Twojego dania”; HTML działa bez JS; brak słowa „AI”; `why` bez zmian. *Test SSR (`prerender`) + e2e; guest-018, guest-021.*
- [ ] **AC13** (U6, R18) G12 zawiera zdanie z U6 w obu językach; klucze PL i EN zgodne. *Test słowników + SSR.*
- [ ] **AC14** (U7) `recommendations_viewed`, `wine_viewed`, `wine_selected` niosą `pick: true` tylko przy pozycji z etykietą; zdarzenia gościa bez wyboru bez zmian. *Test zdarzeń; usage-010.*
- [ ] **AC15** (R16) Publiczne API ma `restaurantPick` na pozycji; trasy mają `strictObject`, `handle()`, brak `try/catch`; `npm run check:routes` zielony; opisy w `API_SPECIFICATION.md`. *Test trasy + `check:routes`.*
- [ ] **AC16** (migracja) `up`/`down`/`up` przechodzi, `schema:check` zgodny dla wszystkich nazw baz, replay późniejszych migracji; plan wycofania zapisany (§12 standardów). *`npm run test:db`.*
- [ ] **AC17** (R17) Nowe strony panelu: `scripts/smoke.mjs` sprawdza 200 i tytuł w `memory` i `postgres`; przy 390 i 1440 px brak poziomego przewijania i błędów w konsoli; `npm run check:design` bez podnoszenia baseline. *`npm run smoke` + przegląd ekranów.*
- [ ] **AC18** (granice) `npm run check:boundaries` zielony: `core` bez importów spoza dozwolonych, strony bez `@wine-match/db`, `engine/` bez zmian (diff PR nie dotyka `packages/core/src/engine/`). *`check:boundaries`, przegląd diffu.*
- [ ] **AC19** (dokumentacja) Pliki z R19 zaktualizowane; `npm run check:context` bez błędów. *Przegląd diffu + polecenie.*

## Projekt rozwiązania
**Pliki (nowe):** `packages/core/src/ranking/restaurant-picks.ts` (stałe, `applyRestaurantPicks`, `explainPick`), `core/src/services/picks/picks-service.ts`, `picks-rules.ts` (`picksVersion`, `planPick`), `picks-simulation-service.ts`, `core/src/validators/picks/pick.schema.ts` i `simulation.schema.ts`, port `PicksRepository` (w `ports/repositories.ts`) z implementacjami `memory/memory-repositories.ts` i `db/src/repositories/index.ts`, encje `db/src/entities/catalog/restaurant-pick.ts` i `pick-edit.ts`, migracja `db:migration:create`, trasy `app/src/app/api/v1/restaurants/[slug]/picks/route.ts`, `…/picks/simulation/route.ts`, `api/v1/wines/[wineId]/pick/route.ts`, strona A27 `(admin)/admin/[slug]/picks/page.tsx`, testy w `tests/` pakietów, `packages/app/tests/e2e/picks.e2e.test.ts` i `access-boundaries-picks.e2e.test.ts`, scenariusze QA (`guest-018…021`, `admin-021…024`, `security-033`, `usage-010`).
**Pliki (zmiany):** `core/src/services/publishing/snapshot.ts` (schema 3, `picks`, `readSnapshot`, `countPickChanges`), `published-view.ts` (`picks`), `publish-service.ts` (zbiór do `buildSnapshot`, `pendingChanges`), `services/guest/recommendation-service.ts` (R11), `core/src/auth/permissions.ts` (`picks.edit`), `core/src/services/guest/usage-events.ts` (klucz `pick`), `core/src/index.ts`, `app/src/server/container.ts` (rejestracja w zakresie żądania), `(admin)/admin/_components/admin-nav.tsx`, A4/A5/A6/A11, `(guest)/_components/guest-ui.tsx` (`BestCard`, `WineRow`, `RecoFooter`, etykieta), strony G3/G7/G9/G12, `i18n/en.ts` i `pl.ts`, publiczna trasa rekomendacji, `scripts/smoke.mjs`, dane demo Halka bez wyborów (golden i demo zostają bez zmian; wybory ustawiają testy).
**Silnik:** `engine/` **nie zmienia się**; warstwa jest po silniku w `core/src/ranking/`, bo silnik ma zostać funkcją `(danie, wina, pary, preferencje) → wynik` bez wiedzy o restauracji, a okres obowiązywania rozstrzyga publikacja. Zależność od E16: warstwa używa tylko wyeksportowanych `RecommendationItem`, `markBestValue`, `MIN_MODEL_SCORE`; E16 nie koliduje z nią, o ile nie zmieni ich kształtu (do uzgodnienia przy scalaniu).
**Model danych (migracja addytywna, zastosowanych nie edytujemy):** `restaurant_pick (id uuid pk, restaurant_id fk, wine_id fk on delete cascade, set_at timestamptz, set_by text, set_by_id uuid null; unique (restaurant_id, wine_id))`; `pick_edit (id, restaurant_id fk, wine_id bez FK, on boolean, actor text, actor_id uuid null, at timestamptz; indeks (restaurant_id, at))`. Bez zmian `published_version` (migawka to jsonb), bez backfillu. `down` usuwa tabele (tylko dev/test; w produkcji wycofanie to poprzedni obraz, schemat zostaje).

**Kolejność kroków (każdy krok: najpierw test, który pada):**
0. Przed kodem: specyfikacja `approved` przez człowieka; PR-A zmieniający `AGENTS.md` §7 w części doprecyzowującej (patrz niżej) zatwierdzony przez właściciela; dopisek w E19 (patrz „Nakładanie”).
1. `npm run engine:matrix` na Halce (tylko odczyt): ile dań ma ≥ 1 wino z surowym wynikiem ≥ 75 poza parą sommeliera; to potwierdza albo koryguje progi i `PICKS_PROMOTED_MAX` (O3). Wynik do logu przebiegu.
2. `ranking/restaurant-picks.ts` + testy własności z mutacją (AC1–AC4).
3. Snapshot schema 3, `readSnapshot`, `buildSnapshot`, `PublishedView.picks`, `countPickChanges`, demo/seed (AC6, AC8).
4. Port, pamięć, PostgreSQL, encje, migracja, kontrakt (AC5, AC16).
5. Serwis, walidatory, uprawnienie, rejestracja w kontenerze (AC5, AC10).
6. Trasy API i symulator w `core` (AC9, AC11, AC15).
7. Integracja `RecommendationService` + pole API + zdarzenia (AC7, AC14).
8. Guest UI, i18n, G12 (AC12, AC13).
9. Panel: A27, A4/A5/A6/A11, nawigacja (AC10, AC17).
10. E2E, test granicy z mutacją, QA, dokumentacja (AC11, AC19); weryfikacja końcowa: `npm run lint`, `typecheck`, `npm test`, `npm run build`, `npm run test:db`, `npm run test:e2e`, `npm run check:routes`, `check:boundaries`, `check:qa`, `check:context`, `secrets:scan`, `npm run smoke` w `DATA_SOURCE=memory` i `postgres`, ekrany 390 i 1440 px bez poziomego przewijania i błędów w konsoli.

**Podział na PR (rozmiar PR, standardy §11):** PR1 = kroki 2–6 (dane, serwis, API, symulator; gość jeszcze bez zmian, więc opublikowany wybór nic nie robi); PR2 = kroki 7–8 (gość); PR3 = kroki 9–10 (panel). Ryzyko: `risk-high` (migracja, widok gościa, nowe uprawnienie: BC §5 wymaga drugiej osoby w review); wymaga QA reviewera albo wyjątku właściciela.

**Wymagane zmiany `AGENTS.md` §7 (osobny PR z przeglądem właściciela; `AGENTS.md` jest pod `.github/CODEOWNERS`; w tym przebiegu nie zmieniam go).**
- **PR-A (przed F1, doprecyzowanie, nie zmiana zasady):** F1 nie łamie zdania „Wyświetlany Match Score to zawsze wynik silnika, bez podbijania” (liczba bez zmian). Dopisać do punktu „Sommelier ponad modelem”: etykieta „Wybór restauracji” / „Restaurant’s pick” jest znakiem restauracji, nie sommeliera, nigdy nie nosi pieczęci, a wybór zmienia tylko kolejność w grupie propozycji silnika i nigdy nie staje nad parą sommeliera; nagłówek „Polecane do Twojego dania” dotyczy tylko najlepszej propozycji silnika. Odwołanie do D24/D25 i tej specyfikacji.
- **PR-B (przed F2, zmiana zasady, tylko po decyzji właściciela i opinii prawnej):** D24 uchyla R02. Zdanie zastąpić regułą: „Wyświetlany Match Score to wynik silnika; wyłącznie w trybie `score` (opt-in restauracji, pułap +5, próg surowego wyniku 75) restauracja może go podnieść, a wtedy liczba nosi nazwę „Polecenie restauracji”, nie „dopasowanie”, a surowy wynik jest zapisany i widoczny w panelu.” Do tego `docs/PRODUCT_CONCEPT.md` §8 p.2, glosariusz briefu (wiersz Match Score „zawsze surowy”), `docs/RECOMMENDATION_ENGINE.md`, test `AGENTS`-owych niezmienników. Bez PR-B nie wolno scalać F2.
Sposób: gałąź z samą zmianą `AGENTS.md`, opis cytujący D24, link do specyfikacji, wymagany przegląd właściciela (CODEOWNERS), bez innych zmian w PR.

**Fazy:**
- **F1 (ta specyfikacja):** tryb ostrożny + symulator, jak wyżej. Miara sukcesu na pilotażu: odsetek sesji zakończonych wyborem **nie spada** po włączeniu wyborów; udział wyborów z etykietą wśród `wine_selected`; liczba poprawek zbioru po symulacji. Dzięki fladze `pick` w zdarzeniach da się sprawdzić hipotezę „liczy się pozycja, nie liczba”.
- **F2 (osobna specyfikacja, po decyzji właściciela):** opcjonalny tryb `score` w ustawieniach restauracji (domyślnie `order`), zapisany w migawce; dodatek do wyświetlanego wyniku z pułapem +5, tylko dla surowego wyniku ≥ 75, nazwa „Polecenie restauracji” przy włączonym trybie, zdanie w G12, słowa oceny z wyniku surowego, surowy wynik zapisany przy ekspozycji i widoczny w panelu; warstwa nadal po silniku (`displayScore` osobne od `matchScore`); wymaga PR-B i opinii prawnej; `engine:matrix` nie jest potrzebny, bo silnik zostaje bez zmian.
- **F3 (osobna specyfikacja):** raport marży: opcjonalny koszt zakupu przy winie (nigdy w migawce ani w API gościa), marża kieliszka i butelki, raport z importu sprzedaży (istnieje; kod polecenia łączy rachunek z wyborem), okresy z wyborami i bez, razem z raportem dowodu (P3). Wymaga zapisania flagi `pick` przy wydaniu kodu polecenia (kolumna) i zakończonej F1.

## Ryzyka i otwarte pytania
**Ryzyka.**
- **Prawne (do opinii prawnej, nie jest to porada prawna):** liczba przedstawiona jako obiektywna ocena, a podniesiona z powodów handlowych, może zostać uznana za wprowadzającą w błąd (ogólny zakaz praktyk wprowadzających w błąd; dyrektywa 2005/29/WE). **Dlatego F1 zmienia tylko kolejność i etykietę, a liczba zostaje surowa.** Restauracja polecająca własne wino pod jawną etykietą nie jest płatnym pozycjonowaniem, ale granica z płatną promocją dostawcy jest rozmyta, więc U5 i U8. Opinia prawna jest wymagana przed F2 i przed kampaniami dostawców; F1 jej nie wymaga (rekomendacja), lecz powinna powstać równolegle.
- **Zaufanie sommeliera:** widzi, że GM zmienia kolejność „jego” listy. Łagodzą: pieczęć i tier poza zasięgiem, symulator widoczny dla niego, zmiany w A11 przed publikacją, ślad `pick_edit`.
- **Zaufanie gościa:** etykieta może być odebrana jako reklama. Łagodzą: jawna, bez JS, zdanie w G12, próg 75, limit 2 awansów na listę; miara: konwersja sesji nie spada.
- **Efekt niezmierzony:** hipoteza o pozycji vs liczbie to hipoteza; jeśli kolejność nie daje efektu, F2 nie ma uzasadnienia marżowego.
- **Zbiór nie dociera do gościa bez publikacji** (rozbieżność z E19, gdzie flaga była „na żywo”): ekran musi mówić „czeka na publikację”; kto publikuje (`publish`: także sommelier) widzi zmianę w A11.
- **Koszt obliczeń:** przy niepustym zbiorze silnik liczy pełną listę win (≤ 100 pozycji na danie); pusty zbiór nie zmienia ścieżki.
- **Spójność G3 i G7:** `wineDetails.match` używa tej samej warstwy; test równości etykiety w obu miejscach.
- **Kolizja z E16/E17/E19:** patrz „Nakładanie” i „Silnik”; kolejność scalania z E16 do ustalenia.
- **`showUnreviewed = false`** ukrywa pozycje tier 2, więc także wybory; A27 pokazuje to ostrzeżeniem.

**Pytania otwarte (z rekomendacją).**
- **O1** Czy F1 wymaga opinii prawnej przed startem? *Rekomendacja: nie (liczba surowa, etykieta jawna); opinia przed F2 i przed D22/D25, zlecić teraz.*
- **O2** Czy zatwierdzasz E19 F2 jako **zastąpione** tą specyfikacją (nie rozszerzone)? *Rekomendacja: tak; powody w „Nakładanie”.*
- **O3** Progi: próg surowego wyniku 75, limit 5 wyborów, najwyżej 2 awanse na listę. *Rekomendacja: przyjąć jako punkt wyjścia i potwierdzić krokiem 1 (`engine:matrix`); to hipotezy bez danych.*
- **O4** Pierwsza pozycja z wyboru ma nagłówek „Wybór restauracji” zamiast „Polecane do Twojego dania”. *Rekomendacja: tak (uczciwość; to nie najlepsza propozycja silnika).*
- **O5** Wino z wyboru będące parą sommeliera: pieczęć bez etykiety. *Rekomendacja: tak.*
- **O6** Kto zmienia zbiór? *Rekomendacja: owner i manager; sommelier widzi i publikuje, bez osobnego prawa weta w F1.*
- **O7** Wybór w „cały stół” (G6) i G11. *Rekomendacja: nie w F1; osobna kalibracja `TABLE_*`.*
- **O8** Domyślnie tryb ostrożny; czy F2 (liczba, pułap +5, nazwa „Polecenie restauracji”, próg 75) w ogóle ma powstać i kiedy? *Rekomendacja: zdecydować po pomiarze z pilotażu F1; do tego czasu nie budować.*
- **O9** Daty ważności i wybory per danie. *Rekomendacja: nie w F1; okres obowiązywania daje publikacja (w tym zaplanowana, E13 F5).*
- **O10** Wpis w regulaminie: zakaz używania wyboru do ukrytej płatnej promocji (U8). *Rekomendacja: dodać przed pierwszym klientem, razem z zapisem o danych zagregowanych (D23).*
- **O11** Czy E17 ma wyłączać pozycje z flagą `pick` z sygnału „pasuje”? *Rekomendacja: tak (pętla zwrotna); zmiana założeń E17 przez właściciela.*

## Changelog
- 2026-11-18 — Autor/recenzent: not recorded / not recorded (draft napisany przez agenta; przegląd niezależny zleci agent nadrzędny, wynik zostanie dopisany tutaj; źródło: `.ai/runs/2026-11-18-restaurant-picks-spec.md`).

## Realizacja
(Uzupełnia agent po implementacji: commity, log przebiegu, odstępstwa od projektu.)
