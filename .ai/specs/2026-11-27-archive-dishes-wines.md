---
status: draft
created: 2026-11-27
owner: Filip Niedziela
related: [.ai/specs/implemented/2026-11-16-catalog-field-editing.md (Q6: usuwanie poza zakresem), docs/DATA_MODEL.md (sekcja „Usuwanie danych: co jest dziś”), docs/API_SPECIFICATION.md (DELETE /dishes/{id}, DELETE /wines/{id}), .ai/specs/2026-11-04-platform-quality-and-compliance.md (E21 F4, retencja), .ai/specs/2026-11-04-panel-completion.md (E13 F4, przywracanie wersji), docs/security/threat-model.md, .ai/runs/2026-11-27-archive-spec-draft.md]
superseded_by:
author_model: not recorded
reviewed_by: "independent agent, fresh context (model not recorded)"
review_independence: different-model        # model inny niż autora zlecony przy uruchomieniu, nie potwierdzony po stronie sesji
---

# Archiwizacja dań i win w panelu („usuń” bez utraty historii)

## Problem
Panel pozwala dodawać i edytować dania i wina (A3, A5, A32), ale nie pozwala ich usunąć. Pomyłkowo dodana pozycja, wycofane z karty wino albo danie sezonowe zostają w listach panelu na zawsze. Dziś jedyne zamienniki to ukrycie dania (`hidden`) i wyłączenie wina (`active = false`): pozycja nadal zajmuje listy, nazwę (duplikat po nazwie jest odrzucany w każdym statusie) i licznik „do przeglądu”. `DELETE /dishes/{id}` i `DELETE /wines/{id}` są w `API_SPECIFICATION.md` jako kontrakt docelowy, bez trasy. Spec edycji katalogu wyłączył usuwanie świadomie (Q6), bo twarde usunięcie dotyka par, migawki, przywracania wersji, KPI i kodów polecenia.

## Cel i zakres
Owner i GM **archiwizują** i **przywracają** danie lub wino. Archiwizacja to miękkie usunięcie: pozycja znika z list panelu (domyślnie), z silnika, z publikacji i z menu gościa, a jej pary, historia decyzji, wpisy `catalog_edit`, sprzedaż i kody polecenia **zostają nietknięte**. Nie ma twardego usuwania w aplikacji.

**Poza zakresem:** twarde usuwanie i retencja danych (E21 F4); masowa archiwizacja; archiwizacja restauracji (E14); zmiana reguły dopasowania importu poza opisaną w R7; przywracanie wersji publikacji (E13 F4); eksport danych.

## Wymagania
- **R1 (stan)** Dania i wina mają pole `archived_at` (nullable `timestamptz`), niezależne od `dish.status` i `wine.active`. Pozycja jest zarchiwizowana, gdy `archived_at IS NOT NULL`. Czas z `Clock`. Migracja z `down`.
- **R2 (warunki wstępne)** Danie wolno zarchiwizować tylko w statusie `hidden` lub `draft` (opublikowane najpierw ukryj: dwa kroki, żeby nie archiwizować przez pomyłkę dania, które goście widzą). Wino wolno zarchiwizować tylko, gdy `active = false`. Inaczej `ValidationError` `fields: { status: 'transition' }` (danie) lub `{ active: 'must_be_inactive' }` (wino), kod 422.
- **R3 (komenda)** `CatalogEditService.archiveDish`, `archiveWine`, `restoreDish`, `restoreWine`: `actor`, `expectedVersion` (odcisk jak w C1/C2), `DomainError`, zapis w jednej transakcji z wierszem `catalog_edit` (`action`: `archived` | `restored`, `before`/`after` z `{ archivedAt }`). Archiwizacja zarchiwizowanej lub przywrócenie niezarchiwizowanej pozycji to 422 `transition`, nie cichy sukces.
- **R4 (uprawnienie)** Nowe uprawnienie `catalog.archive`: **Owner i GM**, nie Sommelier (zmiana nieodwracalna dla pracy innych). Jedna tabela `permissions.ts`, test odmowy dla pozostałych ról, wiersz w `docs/USER_ROLES.md`.
- **R5 (silnik i publikacja)** Zarchiwizowana pozycja jest pomijana przez silnik, `PublishService` (nie wchodzi do nowej migawki), listę par panelu, okazje (`opportunity_*`) i licznik „do przeglądu”. Pary i historia **nie są kasowane**; para do zarchiwizowanej pozycji jest nieaktywna, a po przywróceniu wraca w poprzednim stanie. Goście czytają migawkę, więc zmiana widzialna dla gościa następuje przy następnej publikacji (jak edycja profilu); archiwizacja dania jest `hidden` najpierw, więc dla dania efekt jest już natychmiastowy.
- **R6 (listy panelu)** A3 i A5 domyślnie nie pokazują zarchiwizowanych; filtr „Pokaż zarchiwizowane” (parametr URL, działa bez JavaScriptu) pokazuje je z odznaką i przyciskiem „Przywróć”. Stany pusty i błąd: komponenty z `@wine-match/ui`.
- **R7 (import)** Import **nie ożywia** zarchiwizowanej pozycji: wiersz z nazwą zarchiwizowanego dania lub wina trafia do podglądu jako ostrzeżenie „archived, restore it first” i nie jest dopisywany ani nadpisywany. Nazwa zarchiwizowanej pozycji pozostaje zajęta (duplikat przy ręcznym dodaniu: 422 `name: duplicate`, jak dziś).
- **R8 (API)** `DELETE /dishes/{id}?restaurant={slug}` i `DELETE /wines/{id}?restaurant={slug}` archiwizują (204; `If-Match` wymagany, 428 bez niego, 409 przy konflikcie wersji); `POST /dishes/{id}/restore` i `POST /wines/{id}/restore` przywracają. Trasy przez `handle()` z `permission: 'catalog.archive'`, własne `try/catch` zabronione. Obcy slug 403, obce id pod własnym slugiem 404 o ciele identycznym jak nieistniejące. `API_SPECIFICATION.md`: `DELETE` opisany jako archiwizacja (nie usunięcie).
- **R9 (KPI, sprzedaż, kody)** Rekordy sprzedaży i kody polecenia odwołujące się do zarchiwizowanej pozycji są nietknięte i nadal liczone w historycznych raportach (Wine Attach Rate, raport wyników); pozycja nie jest brana do nowych rekomendacji. Odczyt nie może zawieść na brakującym daniu lub winie.
- **R11 (jedno miejsce filtrowania)** `DishRepository.listByRestaurant` i `WineRepository.listByRestaurant` domyślnie **wykluczają** zarchiwizowane; kto potrzebuje wszystkich, woła jawnie `includeArchived: true`. Jawnie z `includeArchived` korzystają: kontrola duplikatu nazwy w `CatalogEditService` (nazwa zarchiwizowanej pozycji zostaje zajęta, R7), widok „Pokaż zarchiwizowane” (R6) i odczyt kodu polecenia do archiwalnego wina. `suggestionsFor` (nowe danie i wino) używa listy domyślnej, więc nowe pozycje nie dostają par do zarchiwizowanych. PR2b spisuje wszystkie ok. 46 wywołań w `core/src` z decyzją „domyślnie” lub `includeArchived`.
- **R12 (blokady na zarchiwizowanej pozycji)** Każda operacja na zarchiwizowanym daniu lub winie poza `restore` kończy się 422 `fields: { archived: 'archived' }`: `setDishHidden` (pokazanie), `setWineActive`/`wines.toggle`, `updateDish`, `updateWine`, `pairings.decide`, `POST`/`PATCH` par, edycja profilu i tłumaczeń, wybory restauracji (`picks.edit`).
- **R13 (wybory restauracji)** Wybór wskazujący zarchiwizowane wino jest przy archiwizacji **zdejmowany** w tej samej transakcji (wiersz `pick_edit` z `actor`); po przywróceniu nie wraca automatycznie. Archiwizacja pokazuje właścicielowi, ile wyborów zdejmie.
- **R14 (odcisk i blokada)** Odcisk dla `expectedVersion` archiwizacji i przywrócenia obejmuje stan (`status`/`active` i `archivedAt`), jak `dishVisibilityVersion`, nie tylko pola. Repozytorium sprawdza R2 ponownie pod blokadą wiersza. Przywrócenie nie zmienia `status` dania ani `active` wina: danie wraca jako `hidden`/`draft`, wino jako nieaktywne (właściciel włącza je osobno).
- **R10 (audyt)** `catalog_edit` rozszerzone o akcje `archived` i `restored` (enum + migracja); A3 i A5 pokazują „Ostatnia zmiana” także dla archiwizacji; nazwisko tylko dla ról z `audit.view`.

## Kryteria akceptacji
- [ ] **AC1 (R1)** Migracja dodaje `archived_at` do `dish` i `wine`; `npm run schema:check -w @wine-match/db` zgodne dla czterech snapshotów; `migrations-roundtrip` up/down/up zielony. *Test, polecenie.*
- [ ] **AC2 (R2)** Danie `published` nie da się zarchiwizować (422 `status: transition`); `hidden` i `draft` tak. Wino `active = true` nie (422), `active = false` tak. *Unit reguł plus kontrakt.*
- [ ] **AC3 (R3, R14)** Archiwizacja zapisuje dokładnie jeden wiersz `catalog_edit` (`archived`, `actor`, `actor_id`, czas z `Clock`) w tej samej transakcji; podwójna archiwizacja i przywrócenie niezarchiwizowanej pozycji dają 422 `transition` bez nowego wiersza; stary `expectedVersion` (także po zmianie `status`/`active` w międzyczasie) daje 409. Wyścig dwóch archiwizacji: jedna wygrywa (200/204), druga 409 `version_conflict`. *Kontrakt repozytorium i `concurrency.integration.test.ts`.*
- [ ] **AC4 (R4)** Owner i GM mają `catalog.archive`; Sommelier, Kelner i obca restauracja nie. *Test tabeli uprawnień, e2e granicy.*
- [ ] **AC5 (R5, R11, R13)** Po archiwizacji dania i wina: brak w liście par panelu, w nowej migawce publikacji, w `rankForGuest` i w symulatorze wyborów, w okazjach i licznikach; nowe danie nie dostaje par do zarchiwizowanego wina; wybór restauracji wskazujący archiwalne wino zdjęty z wierszem `pick_edit`; para i wiersze `sommelier_decision` nadal istnieją; po przywróceniu para wraca w poprzednim stanie (`approved` zostaje `approved`), danie ma `hidden`/`draft` jak przed, wino `active = false`, a zdjęty wybór nie wraca. *Test serwisu i kontrakt; porównanie tabel przed i po; test „widma”: lista wszystkich widoków panelu bez zarchiwizowanej pozycji.*
- [ ] **AC5b (R12)** Na zarchiwizowanym daniu i winie: `setDishHidden(false)`, włączenie wina, `updateDish`, `updateWine`, decyzja pary, zmiana profilu i wybór restauracji dają 422 `archived` i nic nie zmieniają (porównanie tabel). *Unit reguł i test tras.*
- [ ] **AC6 (R6)** A3 i A5: domyślnie bez zarchiwizowanych; `?archived=1` pokazuje je z przyciskiem „Przywróć”; 390 i 1440 px bez poziomego przewijania i bez błędów w konsoli. *E2E (`agent-browser`), scenariusz QA `.ai/qa/admin/`.*
- [ ] **AC7 (R7)** Import pliku z nazwą zarchiwizowanego dania i wina: wiersz ostrzeżony, nic nie nadpisane, zarchiwizowana pozycja bez zmian; ręczne dodanie tej samej nazwy: 422 `name: duplicate`. *Test importu i e2e.*
- [ ] **AC8 (R8)** Trasy `DELETE` i `POST …/restore`: `DELETE` 204 i `POST …/restore` 200 dla Ownera Halki na pozycji Halki; oba wymagają `If-Match` (428 bez niego); 409 przy starej wersji; 401 bez sesji; 403 bez `X-CSRF-Token` lub dla Sommeliera; obcy slug 403; obce id 404 identyczne jak nieistniejące. `npm run check:routes` zielony. *Test tras, `docs/API_SPECIFICATION.md`.*
- [ ] **AC9 (granica dostępu, `engineering-standards` §10)** Trzy sprawdzenia: (1) kontrola pozytywna Ownera Halki i Ownera Bistro, (2) odmowa odczytu i zapisu między restauracjami i dla Sommeliera, (3) stan po próbie (całe ładunki `GET` dań i win obu restauracji oraz skróty tabel `dish`, `wine`, `catalog_edit` bez zmian); mutacja: usunięcie filtra `restaurant_id` w repozytorium zapisu lub osłabienie `catalog.archive` daje czerwony test (zapis w logu). *E2E, wiersz w `docs/security/threat-model.md`.*
- [ ] **AC10 (R9)** Raport wyników i Wine Attach Rate za okres sprzed archiwizacji dają te same liczby przed i po archiwizacji pozycji; odczyt kodu polecenia do zarchiwizowanego dania nie zwraca 500. *Test serwisu KPI i raportu.*
- [ ] **AC11 (dokumentacja i weryfikacja)** `docs/DATA_MODEL.md` (sekcja „Usuwanie danych”: archiwizacja zamiast usunięcia), `API_SPECIFICATION.md`, `USER_ROLES.md`, `SCREEN_SPECIFICATION.md`, `threat-model.md`, scenariusze QA zaktualizowane; `npm run lint`, `typecheck`, `test`, `test:db`, `build`, `check:context`, `check:qa`, `check:routes` zielone. *Polecenia, wyniki w logu przebiegu.*

## Projekt rozwiązania
Kolejność kroków (PR-y po ok. 150 linii, standardy §11; ryzyko: `risk-high` — migracja, nowe uprawnienie, nowa trasa z id w ścieżce; druga osoba w review przed scaleniem):
1. **PR1 (dane):** encje `dish`/`wine` (`defineEntity`), migracja `archived_at` i rozszerzenie enum `catalog_edit.action`, port i obie implementacje (pamięć, PostgreSQL), przypadki w `repositoryContract`. Sprawdza AC1.
2. **PR2a (komendy):** reguły (`catalog-edit-rules.ts`), odcisk ze stanem (R14), cztery komendy w `CatalogEditService`, blokady R12, zdejmowanie wyborów (R13), uprawnienie `catalog.archive` (`permissions.ts`). Sprawdza AC2–AC4, AC5b.
2b. **PR2b (filtry):** parametr `includeArchived` w obu portach (domyślnie wyklucza), przejście wszystkich ok. 46 wywołań `listByRestaurant` w `core/src` z zapisem decyzji w logu, `PublishService`, okazje, liczniki, `suggestionsFor`; test „widma”. Sprawdza AC5, AC10.
3. **PR3 (API i import):** cztery trasy (`wine-match-new-api-route`), ostrzeżenie w imporcie (R7), test granicy (`wine-match-access-boundary-test`), wiersz threat-model. Sprawdza AC7–AC9.
4. **PR4 (panel):** filtr, odznaka, przyciski i akcje serwerowe (`authorizeAction`), słowniki PL/EN, scenariusze QA, `docs/`. Sprawdza AC6, AC11.

Silnik (`packages/core/src/engine/`) się nie zmienia (filtrowanie pozycji jest przed nim, w warstwie serwisu), więc `ENGINE_VERSION` zostaje.

## Ryzyka i otwarte pytania
- **Q1** Czy Sommelier ma móc archiwizować? Propozycja: nie (R4); decyzja właściciela.
- **Q2** Para z `approved` do zarchiwizowanego wina: zostaje nieaktywna (R5). Alternatywa: blokować archiwizację wina, które ma pary `approved`/`modified`. Propozycja: nie blokować, ale pokazać liczbę par w potwierdzeniu.
- **Q3** Stare migawki i przywracanie wersji (E13 F4): zarchiwizowane danie jest w starszej migawce. Czy przywrócenie wersji ma je ożywiać? Propozycja: nie, poza zakresem tej specyfikacji; zapisać w E13 F4.
- **Q4** `DELETE` jako archiwizacja może zaskoczyć klienta API oczekującego twardego usunięcia (R8). Propozycja: nazwa w dokumentacji „archive”, odpowiedź 204 i nagłówek `X-Wine-Match-Archived: true`; alternatywa `POST …/archive` (wtedy `API_SPECIFICATION.md` traci `DELETE`). Decyzja właściciela.
- **Q5 (rozstrzygnięte przeglądem)** `sales_record` nie odwołuje się do dania ani wina (ma `itemType` i tekstowy `recommendation_code`); połączenie idzie przez kod polecenia: `wine_id` to klucz obcy, `dish_ids` to jsonb bez klucza obcego. Miękka archiwizacja nie psuje odczytu; wyszukanie kodu czyta wino także nieaktywne, a `issue` odrzuca nieaktywne, więc zarchiwizowane wino nie dostanie nowego kodu. Twarde usunięcie zablokowałby klucz obcy.
- **Q6** Retencja i prawo do usunięcia (E21 F4) pozostają osobną decyzją; archiwizacja nie jest usunięciem w rozumieniu RODO. Dania i wina nie zawierają danych osobowych, `catalog_edit` zawiera nazwę aktora.
- **Ryzyko:** pominięcie zarchiwizowanych w jednym z zapytań (lista par, okazje, licznik) zostawi „widmo” w panelu; AC5 wymaga porównania tabel i wszystkich widoków, nie jednego.

## Przegląd niezależny (2026-11-27)
Przegląd tylko do odczytu, model inny niż autora zlecony przy uruchomieniu (nie potwierdzony po stronie sesji). Werdykt: „do poprawy”. Trzy uwagi blokujące (miejsce filtrowania, blokady na innych drogach do zarchiwizowanej pozycji, odcisk bez stanu) oraz uwagi istotne (wybory restauracji, `If-Match` przy przywróceniu, kod przegranego wyścigu, stan po przywróceniu, rozmiar PR-ów) zostały wpisane jako R11–R14, AC3, AC5, AC5b, AC8 i podział PR2a/PR2b. Odpowiedź na Q5 powyżej. Nie przeglądano jeszcze poprawionej wersji; przed zatwierdzeniem warto powtórzyć przegląd.

## Realizacja
(Uzupełnia agent po implementacji.)
