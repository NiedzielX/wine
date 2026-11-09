---
status: approved
created: 2026-11-04
owner: Filip
related: [.ai/specs/2026-11-04-product-completion-plan.md, .ai/specs/product-brief.md, .ai/specs/implemented/2026-10-16-sommelier-opportunities.md, .ai/specs/implemented/2026-10-14-phase5-import-and-qr.md, .ai/specs/implemented/2026-10-16-recommendation-code.md, .ai/specs/implemented/2026-10-16-how-it-works-explanations.md, .ai/lessons/2026-10-14-write-path-conventions.md, docs/RECOMMENDATION_ENGINE.md, docs/DESIGN_SYSTEM.md, docs/USER_ROLES.md, docs/SCREEN_MAP.md]
author_model: "not recorded (eleven agents wrote one spec each; model not stated in .ai/runs/2026-11-04-product-completion-plan.md)"
reviewed_by: "not recorded (independent agent, model unknown)"
---

# Operacje restauracji: dostępność win, „wina do sprzedania”, branding, zestaw QR i powiadomienia (E19)

## TLDR
Restauracja ma dziś jeden przełącznik na wino (`wine.active`: widoczne albo ukryte), jedną stronę QR do wydruku i żadnej kontroli nad wyglądem aplikacji gościa. E19 dodaje pięć rzeczy, które restauracja robi codziennie albo raz przy wdrożeniu:
- **Dostępność:** `available` / `low` / `sold_out` ustawiana przez personel, widoczna dla gościa od razu. To nakładka na bieżące dane, a nie część migawki publikacji (uzasadnienie w Q1).
- **„Wina do sprzedania”:** własna decyzja restauracji o własnym zapasie. Przestawia kolejność wyłącznie wśród win, które już przeszły twardy próg zgodności z daniem, nigdy nie wprowadza wina poniżej progu, nigdy nie wyprzedza wyboru sommeliera i nie dostaje pieczęci „Para sommeliera”. Nie jest miejscem płatnym (N01): nie ma go dla importerów ani producentów.
- **Branding:** logo i jeden kolor akcentu w aplikacji gościa, w granicach design systemu; kontrast 4,5:1 sprawdza kod, nie człowiek.
- **Zestaw QR do druku:** stojak, naklejki i wizytówka w układzie gotowym do druku, na istniejących regułach `PUBLIC_BASE_URL`.
- **Dzwonek w panelu (poza zakresem wskazanym w planie, warunkowy):** zdarzenia (kolejka review, koniec importu, Primary wyprzedane, zmiany priorytetu). Plan nie wymienia powiadomień w E19; F5 buduje się dopiero po potwierdzeniu właściciela (O12). E-mail to tylko otwarte pytanie.

Pięć faz, każda osobnym PR: F1 dostępność, F2 priorytet, F3 branding, F4 zestaw QR, F5 dzwonek (warunkowa). Ekrany: A26 dostępność, A27 priorytet, A28 branding, A29 zestaw QR (numery z planu).

## Resolved assumptions (autonomous defaults)

| # | Pytanie | Przyjęta odpowiedź | Uzasadnienie |
|---|---|---|---|
| Q1 | Dostępność wymaga ponownej publikacji czy jest nakładką? | **Nakładka bez publikacji.** Kolumna `wine.availability`, odczyt na żywo. | Goście już czytają win na żywo: `RecommendationService.forDish` woła `wineRepository.listByRestaurant(..., { activeOnly: true })`, a migawka (`publishRepository`, `listPublished*`) obejmuje pary i tłumaczenia, nie wina. `SommelierService.setWineActive` ma w komentarzu „take effect for guests immediately”, a `docs/USER_ROLES.md` wymaga „wino się skończyło” jednym kliknięciem. Publikacja z kolejką zmian byłaby w środku serwisu kontraproduktywna. Koszt: gość z otwartą stroną widzi stan sprzed odświeżenia. **Zgodność z kontraktem E13 F1:** `availability` i `sellPriority` należą do danych „na żywo” (jak `wine.active`, ceny, `RestaurantSettings`; dopisane do punktu (3) „Kontraktu dla E19” w E13), nie wchodzą do migawki, więc nie wymagają podniesienia `schema`, wpisu w `diffVersions` ani licznika niepublikowanych zmian; widoczność wina dla gościa to nadal wynik `PublishedView` (wino w migawce, `active`), a `isOrderable` i priorytet nakładają się na to ujęcie. Przywrócenie wersji (E13 F4) nie cofa dostępności, priorytetu ani brandingu. |
| Q2 | Czy `availability` zastępuje `active`? | Nie. `active` zostaje „wino jest na karcie” (ukryte = nie ma go w ogóle), `availability` to stan zapasu. Zamawialne = `active && availability !== 'sold_out'` (`isOrderable(wine)` w `core`). | Zmiana semantyki `active` złamałaby `PATCH /api/v1/wines/{id}` (BC §2) i filtr `activeOnly` w repozytorium. |
| Q3 | Czy `low` coś zmienia w rankingu? | Nie. Tylko tekstowa etykieta „Ostatnie sztuki” / "Last bottles" (G3, G7, G9). | Ranking pozostaje deterministyczny i niezależny od zapasu; etykieta nie jest sygnałem kolorem. |
| Q4 | Czy zapas liczymy z `wine.stock_qty`? | Nie. Kolumna istnieje, ale nic jej nie zapisuje i nie czyta; stan ustawia człowiek. | Auto-zapas to magazyn albo POS (N04). |
| Q5 | Kto ustawia dostępność? | Uprawnienie `wines.toggle` bez zmian (owner, manager, sommelier). Kelner nie ma panelu w MVP (E12 może to zmienić). | `core/src/auth/permissions.ts`. |
| Q6 | Kto ustawia „wina do sprzedania”? | Nowe uprawnienie `wines.priority`: owner i manager. Sommelier **widzi** wszystko, ale nie zmienia. | To decyzja biznesowa o własnym zapasie (D13: sommelier odpowiada za treść programu winnego, GM za wynik). Widoczność dla sommeliera jest wymogiem, nie prawem do zmiany. |
| Q7 | Gdzie priorytet działa w rankingu? | Tylko wśród propozycji silnika (tier 2) w `recommendForDish`: dodatek `SELL_PRIORITY_BOOST = 5` do `rankScore`, wyłącznie gdy `matchScore >= SELL_PRIORITY_MIN_SCORE = 75`. Tier 0 i 1 bez zmian. Pełna lista: sekcja „Priorytet”. | Dodatek (5) jest mniejszy niż `SOMMELIER_BOOST` (6) i działa w innym tierze, więc sommelier jest zawsze ponad priorytetem. Próg 75 to 13 punktów nad `MIN_MODEL_SCORE = 62`; **liczby do potwierdzenia `npm run engine:matrix` w F2, krok 1**. E16 (kalibracja, `wm-rules-1.3.0`) może przesunąć skalę wyników i `MIN_MODEL_SCORE`: dlatego `SELL_PRIORITY_MIN_SCORE` jest zapisany jako `MIN_MODEL_SCORE + 13`, a po scaleniu E16 F2 (albo ta faza, jeśli scala się później) powtarza `engine:matrix`; testy niezmienników (R7.2–R7.6) są relacyjne. E19 nie zmienia `pairingScore` ani `ENGINE_VERSION` (plan, ustalenie 5); zmienia wyłącznie kolejność tier 2 (`rankScore`), a E16 nie może jednocześnie zmieniać `compareItems`/`rankScore` bez uzgodnienia kolejności scalania. |
| Q8 | Priorytet w „cały stół” (G6, `recommendForTable`)? | Nie w tej specyfikacji. | Tabela ma własny model (`overall`, `TABLE_*`); priorytet wymagałby osobnej kalibracji. Otwarte pytanie O3. |
| Q9 | Limit win w priorytecie? | `SELL_PRIORITY_MAX = 5` jednocześnie (błąd `too_many_priority`). Tylko per wino, nigdy „wszystkie wina producenta”. | Priorytet wszystkiego nie przestawia niczego; grupowanie po producencie wyglądałoby jak miejsce sprzedawane importerowi. |
| Q10 | Jak gość wie, że to wybór restauracji? | Wino podniesione priorytetem ma neutralną etykietę tekstową „Wybór restauracji” / "Restaurant’s pick", bez pieczęci i bez koloru marki sommeliera; G12 „Jak wybieramy wino” dostaje zdanie o priorytecie. Pozycja dalej ma nagłówek „Polecane do Twojego dania”. | Uczciwość: gość widzi, że to nie para sommeliera. Etykieta jest na każdej pozycji z `sellPriority: true`, niezależnie od tego, czy zmieniła miejsce (prostsze i bez drugiego rankingu). Otwarte pytanie O2. |
| Q11 | Branding w migawce publikacji? | Nie. Jak `RestaurantSettings`: działa od razu, z podglądem przed zapisem. | Nie jest treścią sommeliera (R03 dotyczy pary). |
| Q12 | Jak zapisać logo? | Tabela `restaurant_brand` z `bytea` (max 256 KiB), tylko PNG, JPEG i WebP (sprawdzane po bajtach, nie po rozszerzeniu), bez SVG. | Repozytorium nie ma magazynu plików (plik importu też nie jest przechowywany); jedna VM (D10). SVG odpada (skrypty w obrazku). Dostęp do obiektów S3 wymagałby spec. |
| Q13 | Akcent: co dokładnie przesłaniamy? | Tylko tokeny `--color-wine` (akcja główna) i `--color-wine-deep` (tło nagłówka, wyliczone z akcentu). `brass`, `sage`, `ink*`, pieczęć i szklanka dopasowania nigdy. | Pieczęć sommeliera i wynik silnika mają wyglądać tak samo w każdej restauracji. |
| Q14 | PDF zestawu QR? | Strona zoptymalizowana do druku (`@page`, A4), PDF przez „Drukuj do PDF” w przeglądarce. | Generator PDF to nowa zależność (AGENTS §1.1: wymaga specyfikacji). Otwarte pytanie O4. |
| Q15 | Numer stołu na stojaku? | Tylko jako tekst na wydruku. **Adres w QR jest ten sam dla wszystkich stołów.** | `RecommendationCodeRecord` świadomie nie zapisuje numeru stolika (E09); stan gościa żyje tylko w URL, a numer w adresie byłby nową daną. |
| Q16 | Powiadomienia: zapis zdarzeń czy odczyt pochodny? | **Pochodne przy odczycie** z istniejących danych + jedna tabela `notification_seen` (ostatnie obejrzenie per użytkownik i restauracja). | Wzór z E10 Q2: bez schedulera, bez wyjątku od „zapisy tylko przez serwisy z actor” i bez ryzyka, że błąd zapisu zdarzenia psuje komendę. |
| Q17 | E-mail? | Nie budujemy. Otwarte pytanie O5. | Wymaga dostawcy poczty, zgód i RODO (E21). |

## Problem
- **Dostępność jest ukryciem.** `setWineActive` i akcja `setWineAvailability` (`app/src/app/(admin)/admin/[slug]/actions.ts`) przełączają `active`. Wino „na wyczerpaniu” nie ma stanu pośredniego, a ukryte wino znika też z G7 (strona „niedostępne”, `(guest)/r/[slug]/wine/[wineId]/page.tsx`). Wino Primary ukryte daje po cichu propozycje silnika (tier 0 wymaga aktywnego wina; to znany przypadek `primary_hidden` z E10). Komenda nie ma `actor` i nie zostawia śladu, kto i kiedy wyprzedał wino.
- **Brak wpływu restauracji na kolejność poza sommelierem.** Restauracja ma własny zapas do sprzedania (końcówka partii, wysoka marża), a jedyną dźwignią jest ręczna rola pary. Rekomendacje silnika (tier 2) nie biorą tego pod uwagę. Brakuje przy tym uczciwego sposobu: priorytet nie może być „płatnym miejscem” (N01) ani udawać pary sommeliera (R06, D13).
- **Aplikacja gościa nie ma twarzy restauracji.** `RestaurantHero` pokazuje nazwę na stałym tle `wine-deep`, `(guest)/layout.tsx` ma stały `themeColor`, a stojak QR (`(admin)/admin/[slug]/qr/page.tsx`) to nazwa, hasło i kod bez logo.
- **QR jest jeden i bez zestawu.** Strona A12 daje jeden stojak i pliki SVG/PNG. Brakuje wariantów, arkusza naklejek i ostrzeżenia, że wydruk z adresem lokalnym jest bezużyteczny (jest tylko alert, drukować dalej można).
- **Panel nic nie mówi sam z siebie.** Liczniki w nawigacji to tylko kolejka review i publikacja; skończony import widać dopiero po wejściu w A8/A9.

## Cel i zakres
Dowieźć pięć funkcji z TLDR jako pięć mergeowalnych faz.

**Poza zakresem:**
- rozliczenia i plany (E15), integracja z POS i magazynem (N04), automatyczny zapas z `stock_qty`;
- priorytet dla importerów, producentów lub grup win; jakiekolwiek pole „sponsor”, „płatne”, „kampania” (N01);
- priorytet w „cały stół” (G6) i zmiana wag, progów oraz `ENGINE_VERSION` (silnik pozostaje `wm-rules-1.2.0` w obrębie tej specyfikacji; zmiany kalibracji to E16);
- planowanie dostępności w czasie (np. „do 20:00”) i historia wyprzedań (tylko ostatnia zmiana: kto, kiedy);
- niestandardowe fonty, wiele kolorów, ciemny motyw i obraz tła gościa (design system: jeden akcent);
- SVG jako logo, edytor logo, usuwanie tła;
- PDF generowany po stronie serwera, wysyłka e-mail, push, SMS, powiadomienia do gości;
- profile gości (N04), uczenie na priorytecie (D18).

## Wymagania

### Dostępność (F1)
- **R1** `Wine.availability: 'available' | 'low' | 'sold_out'` (domyślnie `available`) oraz czysta `isOrderable(wine)` w `core`. Wino niezamawialne nie przechodzi `passesHardFilters` (`core/src/engine/recommend.ts`, używane też w `engine/table.ts`; dziś funkcja sprawdza `wine.active` i zwraca `false`, więc dopisujemy tam `isOrderable`; licznik `filteredOut` w `recommendForDish` liczy tylko `wine.active`, więc wino `sold_out` **nie** może zwiększać komunikatu „n win ukrytych filtrami”), nie dostaje kodu polecenia (`RecommendationCodeService.issue` dziś kończy na `!wine.active`) i nie jest proponowane przez okazje E10.
- **R2** `SommelierService.setWineAvailability(slug, wineId, availability, actor)`: async, `DomainError`, zapis `availability_changed_at` i `availability_changed_by`; zmiana na ten sam stan jest idempotentna. Brak `expectedVersion`: wino nie ma wersji, a ustawienie enuma jest idempotentne (ostatni zapis wygrywa; Q-konflikt w „Ryzykach”).
- **R3** Gość widzi zmianę przy następnym wczytaniu strony, bez publikacji. Wino `sold_out` znika z G3 i G6 oraz z propozycji, a G7 i G8 pokazują stan „dziś niedostępne” z linkiem do innych win (ten sam wzorzec co `!wine.active`). Wino `low` zostaje z tekstową etykietą.
- **R4** Para zatwierdzona z winem `sold_out` zostaje w bazie i w migawce; wino wraca do list z chwilą powrotu na `available`. Gdy `sold_out` jest wino Primary, panel pokazuje to na A6 i A1 (rozszerzenie `primary_hidden` z E10 o wyprzedane), nie tylko gość tego nie widzi.
- **R5** Panel: kolumna dostępności na A4 i przełącznik na A5 (trzy stany jako trzy przyciski, działają bez JavaScriptu); tekst „Ukryte” i „Wyprzedane” rozróżnialne tekstem, nie kolorem. API: `PATCH /api/v1/wines/{id}/availability?restaurant={slug}` (nowa trasa, istniejące `PATCH .../wines/{id}` z `{active}` bez zmian).

### Wina do sprzedania (F2)
- **R6** `Wine.sellPriority: boolean` (+ `sell_priority_set_at`, `sell_priority_set_by`). Ustawia tylko `SommelierService`-obok serwis `PriorityService.setSellPriority(slug, wineId, on, actor)` z uprawnieniem `wines.priority`; maks. `SELL_PRIORITY_MAX = 5`, tylko wino `active`. Limit sprawdzany atomowo (blokada wiersza restauracji w transakcji i zliczenie w tej samej transakcji; dwa równoległe zapisy nie przekroczą 5). Wyłączenie wina (`active = false`) lub usunięcie go nie zwalnia licznika po cichu: wino nieaktywne nie liczy się do limitu i traci znacznik przy odczycie.
- **R7** `recommendForDish` przyjmuje zbiór win z priorytetem. Invarianty (każdy ma test):
  1. bez priorytetów wynik jest bit w bit taki jak dziś (test złoty `engine-golden` bez zmian);
  2. wino z `matchScore < MIN_MODEL_SCORE` nie trafia na listę z powodu priorytetu;
  3. dodatek dostaje wyłącznie wino z `matchScore >= SELL_PRIORITY_MIN_SCORE`;
  4. dodatek dotyczy tylko tier 2: kolejność i skład tier 0 i 1 są takie same dla każdego zbioru priorytetów;
  5. wyświetlany `matchScore` i `why` się nie zmieniają (R02); dodatek żyje tylko w `rankScore`;
  6. wynik jest deterministyczny (remisy jak dziś: wynik, cena, `wine.id`).
  Uwaga o uczciwości: dodatek może wprowadzić na listę (limit 4) wino tier 2 z `matchScore >= 75` kosztem wina tier 2 z wyższym `matchScore` i może przesunąć je przed wina, które gość preferencjami (`preferenceAdjustment` do ±5) postawił wyżej; dlatego etykieta z R8 jest obowiązkowa, a wyświetlany wynik zostaje surowy. Kolejność tierów (`compareItems` porównuje najpierw `tier`) gwarantuje, że priorytet nie wyprzedzi pary sommeliera, niezależnie od wartości dodatku.
- **R8** `RecommendationItem.sellPriority` jest `true` tylko, gdy wino zostało dopuszczone przez próg i jest w tier 2. UI gościa pokazuje wtedy etykietę „Wybór restauracji”, **nigdy** `Seal` ani tekst „Para sommeliera”. Ten sam wynik daje G9 (kelner widzi etykietę).
- **R9 (N01)** Priorytet nie ma ścieżki od strony importera ani producenta: brak roli, pola, importu i parametru API, który go ustawia; ustawia go wyłącznie uwierzytelniony członek tej restauracji z `wines.priority`. Priorytet nie jest powiązany z planem, rozliczeniami ani płatnością (E15 nie może go sprzedawać jako funkcji dla dostawców).
- **R10 (widoczność dla sommeliera)** A4 pokazuje znacznik „Do sprzedania” i listę z licznikiem (n z 5); A6 oznacza w propozycjach silnika wina z priorytetem i pokazuje, czy podniósł pozycję; zmiana priorytetu trafia do dzwonka (F5).
- **R11** Użycie: `wine_viewed`/`wine_selected` i kod polecenia dostają w `props` pole `priority: true`, gdy wybrano pozycję z etykietą (nowy klucz, nazw nie zmieniamy), żeby E04/E17 mogły odróżnić to od wyboru silnika.

### Branding (F3)
- **R12** `validateAccent(hex)` jest czystą funkcją w `core`: wymaga kontrastu co najmniej 4,5:1 akcentu na `paper` i `surface` oraz tokenu `on-wine` na akcencie; wylicza `heroHex` (akcent zmieszany z czarnym) i też go sprawdza. Wartości `paper`, `surface`, `on-wine` są stałymi w `core`, a test w `app` porównuje je z `(guest)/guest.css`, żeby się nie rozjechały. Odrzucenie zwraca liczone proporcje (komunikat „4,1:1, potrzeba 4,5:1”) i najbliższy dozwolony kolor.
- **R13** Logo: PNG/JPEG/WebP wykryte po bajtach, do 256 KiB i 1024 px dłuższego boku, tekst alternatywny to nazwa restauracji; wykrywanie typu i wymiarów to czysta funkcja `core` na `Uint8Array` (bez `node:*`, bez nowej zależności); serwowane przez publiczny `GET /r/{slug}/logo` (nowy adres gościa, zmiana addytywna, wpis w BC §1; slug `logo` nie koliduje ze stałą trasą) z `ETag`, `Content-Type` ze zweryfikowanego typu i `X-Content-Type-Options: nosniff`. `/r/{slug}/logo` korzysta z obsługi aliasu sluga z E20 (stary slug daje to samo logo przez przekierowanie lub ten sam odczyt); zawieszona restauracja (E14, `restaurant.status`) nie serwuje brandingu ani logo: trasa zwraca to samo co dla braku logo (E14 R17).
- **R14** Gość: akcent przesłania tylko `--color-wine` i `--color-wine-deep` przez zagnieżdżony layout `r/[slug]/layout.tsx` (style z bazy; `accent_hex` jest wstawiany do CSS wyłącznie po walidacji wzorcem `^#[0-9a-f]{6}$` i `validateAccent` na zapisie i ponownie przy odczycie, żeby wartość z bazy nigdy nie stała się wstrzyknięciem CSS; bez literałów hex w kodzie gościa; `themeColor` przez `generateViewport`). Pieczęć, szklanka dopasowania i wynik nie zmieniają się. Bez brandingu wygląd jest identyczny jak dziś.
- **R15** Edycja: `restaurant.edit`-podobne uprawnienie `branding.edit` (owner, manager), ekran A28 z podglądem przed zapisem; usunięcie logo i akcentu (`removeBrand`) przywraca domyślny wygląd; zapis i usunięcie przez serwis z `actor`.

### Zestaw QR do druku (F4)
- **R16** A12 dostaje szablony `tent` (stojak A4 w poziomie, składany), `sticker` (arkusz A4, siatka naklejek 45 × 45 mm) i `card` (A6), wybierane parametrem `?template=`. Układ przez `@page` i `print:` (reguły druku jak w istniejącym stojaku, który ukrywa panel klasą `print:hidden`).
- **R17** Adres w kodzie to zawsze `guestUrl(slug)` z `server/qr.ts` (`PUBLIC_BASE_URL/r/{slug}`). Przy adresie domyślnym lub lokalnym (`env().publicBaseUrlIsDefault` lub `localhost`) przycisk druku jest wyłączony, a nie tylko opatrzony alertem. Kod QR jest zawsze czarny na białym (akcent tylko na ramce i tekście, sprawdzony jak R12).
- **R18** Opcjonalna etykieta stołu („Stół 1…N”, N ≤ 40) jest tekstem poza kodem (Q15).

### Dzwonek (F5)
- **R19** `NotificationService.list(slug, principal)` zwraca zdarzenia pochodne: `review_queue` (są propozycje `suggested`), `import_finished` (zadanie `confirmed` lub `failed` w ostatnich 14 dniach), `primary_sold_out` (R4), `priority_set` (R10). Każde ma czas zdarzenia, rodzaj i parametry, a zdanie buduje aplikacja ze słownika (jak okazje, R2 z E10).
- **R20** „Nieprzeczytane” = zdarzenie nowsze niż `notification_seen.seen_at` użytkownika w tej restauracji; „Oznacz jako przeczytane” ustawia `seen_at = now`. Licznik w AdminShell liczą tanie zapytania, nie okazje.
- **R21** Widoczne dla każdego z `panel.view`; zdarzenia nie zawierają danych gości ani treści plików importu (lekcja `import-preview-reads-saved-rows`: nazwy pozycji POS poza powiadomieniami).

### Wspólne
- **R22** Każdy zapis przez serwis z `actor`, błędy jako `DomainError`, schematy Zod `strictObject` w `core/src/validators/`, każda akcja i trasa sprawdza uprawnienie (`authorizeAction`, `handle()`), `revalidatePath(..., 'layout')`.
- **R23** Teksty w `src/i18n/en.ts` i `pl.ts`, bez „AI” w interfejsie gościa; PL i EN zgodne kluczami (test `i18n`/`admin-i18n`).
- **R24** Każda faza aktualizuje w swoim PR: `docs/SCREEN_MAP.md`, `docs/SCREEN_SPECIFICATION.md`, `docs/DATA_MODEL.md`, `docs/USER_ROLES.md` (macierz), `docs/API_SPECIFICATION.md`, `BACKWARD_COMPATIBILITY.md`; F2 dodatkowo `docs/RECOMMENDATION_ENGINE.md` (§5 i nowa sekcja o priorytecie).

## Kryteria akceptacji
- [ ] **AC1** (F1, R1) Wino `sold_out` nie występuje w wynikach `forDish`, `forTable` ani w `wineDetails().match`; wino `low` występuje bez zmiany kolejności. *Unit w `core/tests/`.*
- [ ] **AC2** (F1, R1) `RecommendationCodeService.issue` zwraca `null` dla wina `sold_out`, a okazje E10 nie proponują takiego wina. *Unit.*
- [ ] **AC3** (F1, R2) `setWineAvailability` zapisuje `availability_changed_by` jako autora, jest idempotentna i dla obcej restauracji lub nieznanego wina daje `NotFoundError`. *Kontrakt `core/src/testing/write-contract.ts` w pamięci i `npm run test:db`.*
- [ ] **AC4** (F1, R3, Q1) Po zmianie na `sold_out` bez publikacji G3 i G7 pokazują zmianę po odświeżeniu, a `pendingChanges` na A11 się nie zmienia. *E2E z JavaScriptem i bez.*
- [ ] **AC5** (F1, R4) Wyprzedane Primary jest oznaczone na A6 i A1; para pozostaje zatwierdzona i wraca po `available`. *Test serwisu + E2E.*
- [ ] **AC6** (F1, R5) Użytkownik bez `wines.toggle` dostaje 403 na trasie dostępności i odmowę akcji z sfałszowanego formularza. *Test trasy i akcji.*
- [ ] **AC7** (F1) Migracja `up`/`down` przechodzi, `schema:check` zgodny dla wszystkich nazw baz (cztery snapshoty). *`npm run test:db`.*
- [ ] **AC8** (F2, R7.1) Bez priorytetów wynik `recommendForDish` na danych demo Halka jest identyczny z dzisiejszym. *`engine-golden` bez zmian.*
- [ ] **AC9** (F2, R7.2–3) Wino z wynikiem 61 nie wchodzi na listę mimo priorytetu; wino 74 nie dostaje dodatku, a 75 dostaje. *Unit z granicami.*
- [ ] **AC10** (F2, R7.4) Dla losowych zbiorów priorytetów tier 0 i 1 są niezmienione (skład i kolejność), a każde `matchScore` i `why` równe wartościom bez priorytetu. *Test własności na danych Halka + mutacja (usunięcie warunku tieru musi zepsuć test).*
- [ ] **AC11** (F2, R6, R9) Szósty priorytet daje `too_many_priority` także przy dwóch równoległych zapisach (`test:db`, dwie sesje: nigdy 6 flag); sommelier i kelner dostają odmowę zapisu; nie istnieje trasa, akcja ani pole ustawiające priorytet poza `wines.priority`. *Test serwisu, akcji, trasy; grep w `check:boundaries` nie jest potrzebny, wystarcza test routingu.*
- [ ] **AC12** (F2, R8) Pozycja z `sellPriority` pokazuje „Wybór restauracji” i nie pokazuje `Seal` ani „Para sommeliera”; para zatwierdzona nadal pokazuje pieczęć. *Test SSR (`prerender`) G3 i G9.*
- [ ] **AC13** (F2, R10) A4 i A6 pokazują wina z priorytetem; sommelier widzi je bez przycisków zmiany. *Test stron + E2E.*
- [ ] **AC14** (F3, R12) `validateAccent` odrzuca `#8c8087` (poniżej 4,5:1 na `paper`) z proporcją w komunikacie i przyjmuje `#5a1a2c`; stałe tokenów w `core` są równe tym w `guest.css`. *Unit w `core` + test w `app`.*
- [ ] **AC15** (F3, R13) Plik PNG zmieniony na `.svg` albo większy niż 256 KiB jest odrzucony; plik z fałszywym rozszerzeniem rozpoznany po bajtach; odpowiedź ma `nosniff`. *Unit + test trasy.*
- [ ] **AC16** (F3, R14) Z ustawionym akcentem G0 i G3 przy 390 i 1440 px nie mają poziomego przewijania, a `npm run check:design` przechodzi bez podnoszenia baseline (`hex: 1`). Bez brandingu HTML gościa jest bez zmian. *`check:design`, test SSR, przegląd 390 i 1440 px.*
- [ ] **AC17** (F4, R16–R18) `?template=sticker` renderuje 24 naklejki z tym samym adresem `guestUrl(slug)`; adres nie zawiera numeru stołu. *Test SSR.*
- [ ] **AC18** (F4, R17) Przy `PUBLIC_BASE_URL` nieustawionym przycisk druku jest `disabled`, a alert wyjaśnia powód. *Test SSR w trybie bez env.*
- [ ] **AC19** (F5, R19–R20) Skończony import pojawia się w dzwonku, licznik spada do 0 po „Oznacz jako przeczytane”, a zdarzenia innej restauracji i innego użytkownika nie zmieniają licznika. *Unit + `test:db`.*
- [ ] **AC20** (F5, R21) W HTML dzwonka brak nazw pozycji POS i treści plików. *Test strony.*
- [ ] **AC21** (wszystkie) Dla każdej nowej strony panelu `scripts/smoke.mjs` sprawdza 200 i tytuł w trybach `memory` i `postgres`; przy 390 i 1440 px brak poziomego przewijania. *`npm run smoke` + przegląd ekranów.*
- [ ] **AC22** (wszystkie, R23) Nowe teksty PL i EN mają zgodne klucze i nie zawierają „AI”. *Test słowników.*

## Projekt rozwiązania

### Stan zweryfikowany w kodzie
- `core/src/engine/recommend.ts`: `passesHardFilters`, `tierFor`, `compareItems`, `SOMMELIER_BOOST = 6`, `MIN_MODEL_SCORE = 62`; `recommendForTable` w `engine/table.ts` woła `passesHardFilters` dla każdego wina.
- `core/src/services/pairings/sommelier-service.ts` (`setWineActive`, bez `actor`), `core/src/ports/repositories.ts` (`WineWriteRepository.setActive`), `core/src/memory/memory-repositories.ts`, `db/src/repositories/index.ts` (`PgWineWriteRepository`), `db/src/entities/catalog/wine.ts` (`active`, nieużywane `stockQty`).
- `core/src/services/publishing/publish-service.ts`: `updateSettings` stosuje się od razu i „is not part of a published version” (wzór dla brandingu).
- `core/src/auth/permissions.ts`: jedna tabela uprawnień; `wines.toggle` ma owner, manager i sommelier.
- Panel: `(admin)/admin/_components/admin-shell.tsx`, `admin-nav.tsx` (liczniki review i publikacji), `badges.tsx` (`ActiveBadge`), `(lists)/wines/page.tsx` (A4), `wines/[wineId]/page.tsx` (A5), `qr/page.tsx` (A12), `print-button.tsx`; `server/qr.ts` (`guestUrl`, `qrSvg`, `qrPng`); trasa `api/v1/restaurants/[slug]/qr/route.ts`.
- Gość: `(guest)/_components/guest-ui.tsx` (`BestCard`, `WineRow`, `Badges`, `Seal`, `RecoFooter`), `restaurant-hero.tsx`, `(guest)/layout.tsx` (stały `themeColor`), `guest.css` (`@theme`, tokeny), `scripts/check-design.mjs` (kontrast tokenów, baseline `hex: 1`).
- Import: `db/src/entities/imports/import-job.ts` (`status`, `confirmedAt`, `createdAt`) jest źródłem zdarzenia „import zakończony”.

### Model danych i migracje (po jednej na fazę, zastosowanych nie edytujemy)
| Faza | Zmiana | Uwagi |
|---|---|---|
| F1 | `wine.availability text not null default 'available'` z check, `availability_changed_at timestamptz null`, `availability_changed_by text null` | Dodatkowo domena: `Wine.availability`, `isOrderable`; mapper w `db/src/mappers.ts`; dane demo Halka bez zmian (`available`). |
| F2 | `wine.sell_priority boolean not null default false`, `sell_priority_set_at`, `sell_priority_set_by` | Bez indeksu (≤ 100 win). Limit 5 pilnuje serwis, nie baza. |
| F3 | tabela `restaurant_brand (restaurant_id pk/fk, accent_hex char(7) null, logo bytea null, logo_type text null, logo_version int, updated_at, updated_by)` | Osobna tabela, żeby odczyt restauracji nie ciągnął `bytea`. Kolumny `bytea` w `defineEntity`: do sprawdzenia, jak mapuje to MikroORM 7.2 (O6). |
| F5 | `notification_seen (user_id, restaurant_id, seen_at)` z unikalnym `(user_id, restaurant_id)` | Jedyna nowa tabela dzwonka; reszta pochodna. |
Po każdej migracji: `db:migration:create`, przegląd SQL, `db:migrate`, `schema:check` dla każdej nazwy bazy (lekcja `schema-check-snapshot-per-database`), wpis w `docs/DATA_MODEL.md`, pozycja w BC §3, w kontrakcie repozytoriów przypadki dla nowych metod portu.

### Priorytet: miejsce w rankingu
`recommendForDish(dish, wines, pairings, prefs, limit, locale, options?: { sellPriority?: ReadonlySet<string> })`. W `build()`: dla `tier === 2 && score >= SELL_PRIORITY_MIN_SCORE && sellPriority.has(wine.id)` dodajemy `SELL_PRIORITY_BOOST` do `rankScore` i ustawiamy `sellPriority: true` w pozycji. Stałe obok `SOMMELIER_BOOST` z komentarzem, że `SELL_PRIORITY_BOOST < SOMMELIER_BOOST` jest niezmiennikiem (test asercyjny). Wywołujący: `RecommendationService.forDish` i `wineDetails` pobierają zbiór z `wineRepository` (wina z `sellPriority`), publiczne API `/recommendations` dostaje ten sam ranking (zapis w BC §2: kolejność tier 2 może się zmienić) **oraz dodatkowe pole `sellPriority: boolean` na pozycji** (zmiana addytywna, BC §2), żeby klient API mógł oznaczyć pozycję tak samo jak G3 i nie pokazywać podniesionego wina jako zwykłej propozycji silnika; wpis w `docs/API_SPECIFICATION.md`. `markBestValue` bez zmian. Nie zmieniamy `ENGINE_VERSION`: nic w `pairingScore` się nie zmienia, więc `engine:matrix` i okazje (`STRONG_MATCH`) pozostają ważne; `docs/RECOMMENDATION_ENGINE.md` dostaje opis w §5.

### Wersja
Wyniki są identyczne, gdy żadne wino nie ma ustawionego priorytetu: `ENGINE_VERSION` się nie zmienia (BC §7), a golden i `engine:matrix` bez priorytetu pozostają bez zmian. E17 konsumuje flagę `sell_priority` (zapisywaną przy ekspozycji od F1 E17), żeby odróżnić wina podniesione priorytetem od zwykłych propozycji silnika.

### Ekrany i trasy
| ID | Ekran | Adres | Faza |
|---|---|---|---|
| A4, A5 | kolumna dostępności, znacznik „Do sprzedania”, przełączniki | istniejące | F1, F2 |
| A6, A1 | znacznik priorytetu w propozycjach; Primary wyprzedane | istniejące | F1, F2 |
| A26 | Dostępność win (kolumna na A4, przełącznik na A5, oznaczenie Primary wyprzedanego na A6 i A1) | istniejące strony, bez nowej trasy | F1 |
| A27 | „Wina do sprzedania” (znacznik i licznik n z 5 na A4, oznaczenie w propozycjach A6, zmiana tylko z `wines.priority`) | istniejące strony, bez nowej trasy | F2 |
| A28 | Branding (logo, akcent, podgląd G0) | `/admin/{slug}/branding` | F3 |
| A29 | Zestaw QR do druku, rozszerza A12 (`?template=`, `?tables=`) | istniejący `/admin/{slug}/qr` | F4 |
| (stan A1) | Powiadomienia: pełna lista, „Oznacz jako przeczytane”; **plan nie przydziela E19 osobnego numeru ani tej funkcji w zakresie E19**, więc to stan Dashboardu (A1) pod `/admin/{slug}/notifications`, nie nowy ekran; F5 wymaga potwierdzenia właściciela (O12) | `/admin/{slug}/notifications` | F5 |
| G0, G3, G7, G9, G12 | etykiety „Ostatnie sztuki”, „Wybór restauracji”, branding, tekst G12 | istniejące | F1–F3 |
Dzwonek to link z licznikiem tekstowym i `sr-only` w AdminShell (bez rozwijanej listy, więc działa bez JavaScriptu). Identyfikatory A26–A29 pochodzą z tabeli przydziału w planie (sekcja „Identyfikatory ekranów”); A15–A25 należą do innych epików.

### Uprawnienia (`core/src/auth/permissions.ts`)
Nowe: `wines.priority` i `branding.edit` (owner, manager); bez zmian `wines.toggle`, `panel.view`. Macierz w `docs/USER_ROLES.md` i testy `permissions` dostają nowe wiersze (w tym test ścieżki odmowy dla sommeliera i kelnera, BC §5: zmiana uprawnień wymaga specyfikacji, aktualizacji `USER_ROLES.md` i drugiej osoby w review). Nazwy `wines.priority` i `branding.edit` zgodne z planem; tabelę prowadzi E12, więc wpisy dopisujemy do niej, nie tworzymy własnej; kolejność scalania z E12 do ustalenia.

### Fazy (każda osobny PR)
- **F1. Dostępność** (risk: **high**: migracja schematu i zmiana widoku gościa; SDLC `risk-high` dla migracji, wymaga QA reviewera albo wyjątku właściciela). Zakres: R1–R5, AC1–AC7, AC21–AC22. Kolejność: domena + `isOrderable` + migracja + port/pamięć/PG + kontrakt → serwis i trasa → akcja i A4/A5/A6/A1 → gość (G3, G7, G8, G9, `RecommendationCodeService`) → docs. Weryfikacja: `npm run lint`, `typecheck`, `npm test`, `npm run test:db`, `npm run build`, `npm run test:e2e`, UI przy 390 i 1440 px (A4, A5, G3, G7).
- **F2. „Wina do sprzedania”** (risk: high; migracja schematu, zmiana rankingu, wrażliwość N01, wymaga QA reviewera lub wyjątku właściciela). Zakres: R6–R11, AC8–AC13, AC21–AC22. Kolejność: krok 1 `npm run engine:matrix` na Halce, żeby potwierdzić `SELL_PRIORITY_MIN_SCORE` i `BOOST` → migracja → `recommendForDish` + testy własności (z mutacją) → `PriorityService` i uprawnienie → A4/A6 → etykieta gościa i G12 → docs. Weryfikacja: jak F1 + `engine-golden` + test własności + UI G3/G9 przy 390 i 1440 px + `check:design`.
- **F3. Branding** (risk: **high**: migracja schematu, treść wgrywana przez użytkownika serwowana publicznie). Zakres: R12–R15, AC14–AC16, AC21–AC22. Kolejność: `validateAccent` + stałe i test zgodności z `guest.css` → migracja i repozytorium → trasa logo → A28 z podglądem → zagnieżdżony layout gościa i `RestaurantHero` → `check:design` rozszerzony o walidację przykładowych akcentów (bez podnoszenia baseline) → docs. Weryfikacja: jak F1 + `check:design` + a11y/kontrast + UI G0, G3, A28 przy 390 i 1440 px.
- **F4. Zestaw QR** (risk: low, bez migracji). Zakres: R16–R18, AC17–AC18, AC21–AC22. Kolejność: szablony i `@page` → `?template=`, `?tables=` → wyłączenie druku przy adresie lokalnym → logo i akcent na stojaku (po F3, miękka zależność) → docs. Weryfikacja: lint, typecheck, unit/SSR, build, `smoke`, podgląd wydruku (A4, A6) w przeglądarce i UI przy 390 i 1440 px.
- **F5. Dzwonek** (risk: **high**: migracja schematu; warunkowa, patrz O12). Zakres: R19–R21, AC19–AC22. Kolejność: reguły pochodne (czysta funkcja) → migracja `notification_seen` → serwis → AdminShell (licznik) i stan A1 „powiadomienia” → docs. Weryfikacja: jak F1, plus pomiar kosztu licznika w layoucie na Halce (O7).

Kolejność pracy: F1 przed F2 (priorytet używa `isOrderable`), F3 niezależna, F4 po F3 dla logo, F5 na końcu (potrzebuje zdarzeń z F1 i F2). Wszystkie fazy po E13, bo A4/A5/A11 i model publikacji są tam zmieniane; do tego czasu F1 i F3 (core i migracje) mogą powstawać, a UI A4/A5 czeka na scalenie E13.

## Ryzyka i otwarte pytania
- **O1 (E13, publikacja) — rozstrzygnięte w przeglądzie.** Specyfikacja E13 istnieje (`2026-11-04-panel-completion.md`). Decyzje „na żywo” / „w wersji”: dostępność, priorytet i branding **na żywo**; to dopisujemy do kontraktu E13. Sezonowe zestawy karty (E13 F6) i priorytet: priorytet jest per wino, nie per zestaw (domyślnie bez zmian). Zawieszenie restauracji (E14/E15, `restaurant.status`): branding i logo nie obowiązują na stronie zawieszonej (G15 używa domyślnego motywu).
- **O2 (uczciwość etykiety).** Domyślnie „Wybór restauracji” na pozycji z priorytetem. Alternatywa: bez etykiety, tylko zdanie w G12. Rekomendacja: etykieta, bo gość widzi, że to nie para sommeliera.
- **O3 (cały stół).** Priorytet nie obejmuje G6. Jeśli właściciel chce, potrzebna osobna kalibracja `TABLE_*`.
- **O4 (PDF).** Tylko druk z przeglądarki. Prawdziwy PDF wymaga biblioteki (nowa zależność, osobna specyfikacja).
- **O5 (e-mail).** Dostawca poczty, zgody, treść i częstotliwość (digest dzienny?) oraz RODO (E21). Nie budujemy w E19.
- **O6 (`bytea` w MikroORM).** Nie sprawdzałem w kodzie, jak `defineEntity` w MikroORM 7.2.2 mapuje `bytea` na `Buffer` ani jak `schema:check` porównuje taką kolumnę; do rozpoznania na początku F3. Zapasowo: logo jako `text` w base64 z limitem 256 KiB.
- **O7 (koszt licznika).** Licznik dzwonka liczony w layoucie na każdej stronie. Wzorzec E10 Q3 unikał tego dla okazji; tu zapytania są tanie, ale `primary_sold_out` wymaga połączenia win z parami. Zmierzyć na Halce; w razie potrzeby cache na żądanie.
- **O8 (konflikt zapisów dostępności).** Dwie osoby mogą ustawić różne stany naraz; ostatni zapis wygrywa i zostaje ślad (`availability_changed_by`). Czy dodać `expectedVersion` na winie? Wymagałoby kolumny wersji; domyślnie nie.
- **O9 (ślad zmian priorytetu).** Powiadomienie `priority_set` zna tylko ostatnie ustawienie; zdjęcie priorytetu nie jest w dzwonku. Pełna historia to osobna tabela audytu; domyślnie bez niej.
- **O10 (G8 i stan wina po wejściu).** Sprawdziłem, że G8 odrzuca wino `!active`; nie sprawdziłem, czy po przejściu z G7 do G8 gość widzi komunikat dla wina wyprzedanego między krokami. Do potwierdzenia w F1 (AC4).
- **O11 (kolizje kodu).** Numery ekranów rozstrzygnięte przeglądem (A26–A29, plan). `recommend.ts` i `engine:matrix` zmienia też E16; zmiany F2 są małe i oddzielone stałymi, ale kolejność scalania z E16 trzeba ustalić.
- **O12 (zakres F5).** Powiadomienia nie są w opisie E19 w planie (dostępność, wina do sprzedania, branding, zestaw QR) i nie mają przydzielonego numeru ekranu. Rekomendacja: wyciąć F5 do osobnej decyzji; F1–F4 są kompletne bez niej. `notification_seen` trzyma `user_id`: kaskadowe usunięcie z kontem, a retencję innych danych ustala E21 (plan, ustalenie 4).
- **O13 (metadane logo).** Wgrane logo bywa JPEG z EXIF (np. GPS) i jest publiczne pod `/r/{slug}/logo`; bez biblioteki do ponownego kodowania nie usuniemy metadanych. Opcja: odrzucać JPEG z segmentem EXIF GPS albo ostrzec w formularzu; do decyzji (nowa zależność wymaga specyfikacji).
- **Ryzyko zaufania:** priorytet jest uczciwy tylko, jeśli próg, limit i etykieta zostają. Testy własności (AC10) i brak ścieżki dla dostawców (AC11) są tu bramką, nie dodatkiem.
- **Ryzyko Tailwind:** nadpisanie `--color-wine` przez styl na elemencie zakłada, że `@theme` w `guest.css` generuje zmienne CSS, a nie wartości wpisane na stałe w utility. To założenie, nie zweryfikowany fakt; sprawdzić w pierwszym kroku F3.

**Przegląd niezależny 2026-11-04** (agent bez udziału w pisaniu):
- Zmieniono: ekrany A15/A16 na A26–A29 z planu (A15–A18 to E12); F5 oznaczona jako poza zakresem planu (brak numeru ekranu), pozostaje jako stan A1 do decyzji właściciela (O12).
- Publikacja: O1 było nieaktualne (E13 ma specyfikację); jawnie „na żywo” dla dostępności, priorytetu i brandingu; dopisano do kontraktu E13.
- Silnik: stała progu `MIN_MODEL_SCORE + 13` zamiast literału 75, dopisana relacja do E16 (kolejność scalania `recommend.ts`), `filteredOut` nie liczy wyprzedanych; uczciwość: priorytet może wprowadzić wino na listę i wyprzedzić preferencje gościa, więc etykieta obowiązkowa także w API (`sellPriority`, pole addytywne).
- Zaufanie: pieczęć i „Para sommeliera” nadal wykluczone przy priorytecie (tier w `compareItems`), próg 62 nieprzekraczalny; limit 5 atomowy (wyścig).
- Ryzyko: F1, F3, F5 podniesione do `risk-high` (migracje schematu); walidacja akcentu przed wstrzyknięciem do CSS; logo czystą funkcją w `core`; EXIF otwarte (O13).
- Otwarte: zgoda właściciela na F5; wartości `SELL_PRIORITY_*` po `engine:matrix` i E16; `bytea` w MikroORM (O6).

- **Decyzje właściciela (2026-11-04):** pytania do właściciela z tej specyfikacji rozstrzygnięto przez delegację; zob. plan `2026-11-04-product-completion-plan.md`, sekcja „Decyzje podjęte”. Przyjęto domyślne rekomendacje; faza wymagająca zewnętrznej decyzji (prawnik, księgowa, spike) czeka na nią.

## Changelog
- 2026-11-04 — Autor/recenzent: not recorded / not recorded (independent agent, model unknown) (w specyfikacji jest „Przegląd niezależny 2026-11-04” bez nazwy modelu).

## Realizacja
(Uzupełnia agent po implementacji: commity, log przebiegu, odstępstwa od projektu.)
