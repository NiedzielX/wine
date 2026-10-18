# Use case’y

Lista: UC-01 – UC-14. Odwołania do ekranów według [SCREEN_MAP.md](SCREEN_MAP.md), do endpointów według [API_SPECIFICATION.md](API_SPECIFICATION.md).

| ID | Nazwa | Aktor |
|---|---|---|
| UC-01 | Dobór wina do dania | Gość |
| UC-02 | Zawężenie rekomendacji filtrami | Gość |
| UC-03 | Butelka dla całego stolika | Gość |
| UC-04 | Wybór wina i pokazanie kelnerowi | Gość |
| UC-05 | Podpowiedź dla kelnera przy stoliku | Kelner |
| UC-06 | Logowanie do panelu | Sommelier, GM |
| UC-07 | Przegląd i zatwierdzanie propozycji silnika | Sommelier |
| UC-08 | Ręczne zarządzanie pairingami dania | Sommelier |
| UC-09 | Korekta profilu smakowego dania | Sommelier |
| UC-10 | Zmiana ceny lub dostępności wina | Sommelier |
| UC-11 | Import menu | Sommelier, GM |
| UC-12 | Import karty win | Sommelier, GM |
| UC-13 | Publikacja zmian | Sommelier, GM |
| UC-14 | Onboarding restauracji i QR kod | GM, System Admin |

---

## UC-01 Dobór wina do dania

| | |
|---|---|
| **Aktor** | Gość restauracji |
| **Trigger** | Gość skanuje QR kod na stoliku lub otwiera link `winematch.app/{slug}` |
| **Preconditions** | Restauracja opublikowana; co najmniej jedno danie ze statusem `published`; co najmniej jedno aktywne wino |

**Main flow**
1. System pokazuje ekran startowy restauracji (nazwa, adres) i od razu pod nim menu podzielone na Starters / Mains / Desserts; dania z pairingiem sommeliera mają oznaczenie.
2. Gość wybiera danie.
3. System pokazuje danie (opis, cena, smak w słowach) i rząd szybkich preferencji (opcjonalnych; raz wybrane przechodzą na kolejne dania w URL), a pod nim wylicza ranking (`GET /dishes/{id}/recommendations`) i pokazuje 2–4 wina: pierwsze jako „Sommelier’s pairing” (para sommeliera) lub „Recommended for your dish” (propozycja silnika), pozostałe jako „Also good with this dish”. Każde: nazwa, producent, region, rocznik, cena kieliszka / butelki, Match Score, „Why it works”.
4. Gość wybiera wino (przechodzi do UC-04).

**Alternative flows**
- A1: Gość od razu przechodzi do karty „Several dishes on the table?” (przycisk „Find a bottle for the table”) → UC-03.
- A2: Gość otwiera filtry z ekranu rekomendacji → UC-02.
- A3: Restauracja wyłączyła „Fill empty places with engine picks” → widoczne są tylko pary zatwierdzone przez sommeliera.

**Edge cases**
- E1: Danie nie ma żadnego wina powyżej progu (62%) ani pary sommeliera → empty state „Our sommelier is still preparing pairings for this dish. Your waiter can help.”
- E2: Danie zostało ukryte po zeskanowaniu → „This dish isn’t on tonight’s menu” i powrót do menu.
- E3: Błędny slug w linku → „This menu isn’t available” z instrukcją.
- E4: Brak sieci / błąd API → error state z „Try again”; ostatnia lista z cache PWA, jeśli dostępna.
- E5: Wino sprzedało się w trakcie wieczoru (`active=false`) → znika z listy przy kolejnym zapytaniu.

**Expected result:** gość jednym dotknięciem (danie na stronie z kodu QR) widzi uporządkowaną listę win z tej restauracji z ceną i uzasadnieniem. Zapisane eventy: `guest_session_started`, `menu_viewed`, `recommendations_viewed`.

---

## UC-02 Zawężenie rekomendacji filtrami

| | |
|---|---|
| **Aktor** | Gość |
| **Trigger** | Dotknięcie ikony filtrów / „Refine” lub chipów preferencji na ekranie dania |
| **Preconditions** | Gość jest na ekranie szczegółów dania lub rekomendacji |

**Main flow**
1. System otwiera arkusz „Refine” z bieżącymi ustawieniami.
2. Gość ustawia dowolne z: Glass / Bottle / Either; kolor lub styl (wielokrotny wybór); budżet (progi zależne od kieliszka / butelki); Lighter / Fuller; Classic / Adventurous.
3. Liczba wyników na przycisku („Show 3 wines”) aktualizuje się po każdej zmianie.
4. Gość zamyka arkusz; lista jest przeliczona; aktywne filtry widać jako chipy nad listą.

**Alternative flows**
- A1: „Reset” przywraca preferencje domyślne.
- A2: Zmiana Glass ↔ Bottle zeruje budżet (inna skala cen).
- A3: Zamknięcie Escape lub kliknięciem tła — zmiany pozostają zastosowane.

**Edge cases**
- E1: Budżet poniżej najtańszego pasującego wina → silnik luzuje budżet i pokazuje 2 najbliższe wina z komunikatem „Nothing matches under 45 zł. These are the closest options.”
- E2: Kombinacja stylu i kieliszka bez wyników → empty state z „Clear filters”.
- E3: Wybrano „By the glass”, a Primary sommeliera jest tylko na butelki → Primary nie jest pokazywany, a lista opiera się na pozostałych parach (zasada: filtr gościa jest twardy).

**Expected result:** lista spełnia twarde filtry (serwowanie, styl, budżet); preferencje miękkie (body, mood) zmieniają tylko kolejność. Preferencje zostają zapamiętane w sesji. Eventy: `filters_opened`, `filter_changed`, `filters_cleared`.

---

## UC-03 Butelka dla całego stolika

| | |
|---|---|
| **Aktor** | Gość (jeden telefon dla stolika) |
| **Trigger** | karta „Several dishes on the table?” na stronie startowej (przycisk „Pair a bottle for the table” w nagłówku tylko bez karty) albo przełącznik „Whole table” w menu |
| **Preconditions** | Jak w UC-01 |

**Main flow**
1. System pokazuje menu w trybie wyboru wielokrotnego.
2. Gość zaznacza dania całego stolika (np. Beef tartare, Wild mushroom risotto, Duck breast).
3. Licznik pokazuje „3 dishes selected”; przycisk aktywny od 2 dań.
4. Opcjonalnie: kolor i budżet na butelkę.
5. Gość wybiera „Find a bottle for the table”.
6. System (`POST /recommendations/table`) pokazuje najlepszą butelkę: wynik dla każdego dania osobno, ogólny wynik (Overall match), cenę; poniżej 2 alternatywy.

**Alternative flows**
- A1: Gość wybiera alternatywną butelkę → szczegóły wina → UC-04.
- A2: Stolik ma bardzo różne dania (np. sandacz i ribeye) i najlepsza butelka nie osiąga 76% ogólnie lub któreś danie ma poniżej 64% → system dodaje sekcję „Or by the glass, dish by dish” z najlepszym kieliszkiem do każdego dania.

**Edge cases**
- E1: Zaznaczono 1 danie → przycisk nieaktywny, podpowiedź „add one more”; bezpośrednie wejście na adres wyniku → komunikat „Add at least two dishes”.
- E2: Wśród dań jest deser → deser jest odkładany z obliczeń butelki z informacją „Desserts are paired separately”.
- E3: Zaznaczono wyłącznie desery → liczone są desery.
- E4: Odrzucona przez sommeliera para dla któregoś dania → wynik tego dania ograniczony do 50, więc to wino nie wygra stolika.

**Expected result:** jedna rekomendowana butelka z przejrzystym rozbiciem na dania. Eventy: `table_dishes_selected`, `table_recommendation_viewed`.

---

## UC-04 Wybór wina i pokazanie kelnerowi

| | |
|---|---|
| **Aktor** | Gość |
| **Trigger** | Dotknięcie wina na liście rekomendacji lub wyniku dla stolika |
| **Preconditions** | Wino aktywne |

**Main flow**
1. System pokazuje szczegóły wina: nazwa, producent, region, rocznik, szczepy, styl, alkohol, nota degustacyjna, profil (body, acidity, tannin, sweetness), notatka sommeliera lub „Why it works”.
2. Gość wybiera kieliszek (z pojemnością) lub butelkę.
3. Gość wybiera „Choose this wine”.
4. System pokazuje ekran potwierdzenia: „Show this to your waiter”, numer pozycji z karty, pełna nazwa, rocznik, porcja, cena, danie.
5. Gość pokazuje telefon kelnerowi.

**Alternative flows**
- A1: „Pair another dish” → powrót do menu.
- A2: Gość wraca do listy i wybiera inne wino.

**Edge cases**
- E1: Wino tylko na butelki → opcja kieliszka nieaktywna z opisem „Not poured by the glass”.
- E2: Wino zostało wyłączone między listą a szczegółami → „This wine is no longer available” i link do innych win.
- E3: Wejście ze stolika → domyślnie zaznaczona butelka.

**Expected result:** jednoznaczna informacja dla kelnera. W MVP nie tworzymy zamówienia — kelner wpisuje je do POS. Eventy: `wine_viewed`, `wine_selected`, `selection_shown_to_waiter`.

---

## UC-05 Podpowiedź dla kelnera przy stoliku

| | |
|---|---|
| **Aktor** | Kelner |
| **Trigger** | Gość pyta „co pan poleca do kaczki?” |
| **Preconditions** | Kelner ma otwarty widok `/r/{slug}/staff` (zakładka na telefonie) |

**Main flow**
1. Kelner wybiera danie z listy.
2. System pokazuje 2–4 wina w kolejności sommeliera z numerem pozycji, odznaką („Sommelier’s pairing · first choice”, „Best value”), procentem i zdaniem do powiedzenia („Say: …”).
3. Kelner filtruje według odpowiedzi gościa (kieliszek, kolor, budżet).
4. Kelner przedstawia propozycję gościowi.

**Alternative flows:** A1: zmiana dania odświeża listę z zachowaniem filtrów.

**Edge cases:** E1: filtry bez wyników → „Nothing fits. Relax the budget or colour.”

**Expected result:** spójna rekomendacja niezależnie od doświadczenia kelnera. Event: `staff_lookup`, `staff_filter_changed`.

---

## UC-06 Logowanie do panelu

| | |
|---|---|
| **Aktor** | Sommelier, Owner / GM |
| **Trigger** | Wejście na dowolny adres `/admin/*` bez sesji |
| **Preconditions** | Konto utworzone przez GM lub System Admina |

**Main flow**
1. System przekierowuje na `/admin/login?next=…`.
2. Użytkownik podaje e-mail i hasło.
3. System weryfikuje (`POST /auth/login`), tworzy sesję, przekierowuje na adres `next` lub dashboard.

**Alternative flows:** A1: „Forgot password” (poza mockupem) — link resetu e-mailem. A2: użytkownik z dostępem do kilku lokali wybiera lokal po zalogowaniu.

**Edge cases:** E1: niepoprawny e-mail → „Enter a valid work email.” E2: hasło krótsze niż 6 znaków / błędne dane → komunikat bez ujawniania, które pole było błędne (w produkcji). E3: 5 nieudanych prób → blokada 15 min. E4: wygaśnięcie sesji podczas edycji → ponowne logowanie i powrót do tej samej strony.

**Expected result:** dostęp do panelu zgodnie z rolą. Event: `staff_login`.

---

## UC-07 Przegląd i zatwierdzanie propozycji silnika

| | |
|---|---|
| **Aktor** | Sommelier |
| **Trigger** | Baner „N engine suggestions are waiting for your review” lub licznik w nawigacji; po imporcie |
| **Preconditions** | Istnieją pairingi ze statusem `suggested` |

**Main flow**
1. Sommelier otwiera Review queue.
2. System pokazuje postęp (ile dań ma choć jeden zatwierdzony pairing) i propozycje pogrupowane według dań, z wynikiem i uzasadnieniem z reguł.
3. Sommelier zatwierdza (`Approve`) lub odrzuca (`Reject`) pojedyncze propozycje.
4. Pierwsza zatwierdzona para dania, które nie ma Primary, staje się Primary; kolejne — Alternative.
5. Liczniki i postęp aktualizują się; zmiany są oznaczone jako niepublikowane.

**Alternative flows**
- A1: „Approve all for this dish”.
- A2: „Approve all N” → po zatwierdzeniu przejście do Publish.
- A3: „Open pairings” → szczegółowa edycja (UC-08).

**Edge cases**
- E1: Kolejka pusta → „Everything is reviewed” i link do publikacji.
- E2: Wino z propozycji zostało w międzyczasie wyłączone → para pozostaje, ale nie jest pokazywana gościom; oznaczenie „Not available”.
- E3: Dwóch użytkowników zatwierdza jednocześnie → ostatni zapis wygrywa, a `PATCH` z nagłówkiem `If-Match` zwraca 409 przy konflikcie wersji (produkcja).

**Expected result:** pary przechodzą do statusu `approved` lub `rejected`, z zapisem kto i kiedy (`SommelierDecision`). Eventy: `pairing_status_changed`, `pairing_role_changed`.

---

## UC-08 Ręczne zarządzanie pairingami dania

| | |
|---|---|
| **Aktor** | Sommelier |
| **Trigger** | Wybór dania w ekranie Pairings |
| **Preconditions** | Danie istnieje |

**Main flow**
1. System pokazuje: zatwierdzone pary w kolejności (z rolą, statusem, wynikiem silnika, notatką), propozycje silnika, formularz dodania, odrzucone pary, podgląd „What guests see now”.
2. Sommelier może:
   - zmienić rolę (Primary / Alternative / Best value) — ustawienie Primary degraduje poprzedni Primary do Alternative,
   - przesunąć parę w górę / w dół,
   - dodać lub zmienić notatkę dla gości (do 140 znaków) — status zmienia się na `modified`,
   - odrzucić parę (`rejected`),
   - usunąć parę dodaną ręcznie,
   - dodać własną parę: wino + rola + notatka,
   - przywrócić odrzuconą parę jako propozycję.
3. Podgląd gościa aktualizuje się natychmiast.

**Alternative flows:** A1: „View as guest” otwiera aplikację gościa dla tego dania. A2: „Edit dish” → UC-09.

**Edge cases**
- E1: Dodanie bez wybrania wina → „Choose a wine to pair.”
- E2: Wino już ma parę z tym daniem → lista „Add” pokazuje tylko wina bez decyzji.
- E3: Para sommeliera ma niski wynik silnika (np. 58%) → i tak jest pokazywana (sommelier wygrywa), z uczciwym procentem.

**Expected result:** gość widzi pary w kolejności ustalonej przez sommeliera. Eventy: `pairing_added`, `pairing_deleted`, `pairing_role_changed`.

---

## UC-09 Korekta profilu smakowego dania

| | |
|---|---|
| **Aktor** | Sommelier (lub szef kuchni przez sommeliera) |
| **Trigger** | Danie ma profil „Draft, needs check” albo receptura się zmieniła |
| **Preconditions** | Danie istnieje |

**Main flow**
1. Sommelier otwiera Menu → danie.
2. Edytuje dane (nazwa, opis, kategoria, cena, status) i profil: suwaki 0–5 (intensity, fat, salt, sweetness, acidity, spice, umami, smoke, creaminess), główny składnik, metoda przygotowania.
3. Panel „Top matches with this profile” przelicza się na żywo przy każdym ruchu suwaka.
4. „Save and update suggestions”: profil ma status `confirmed`, wyniki istniejących par są przeliczone, niezatwierdzone propozycje wygenerowane od nowa; zatwierdzone pozostają nietknięte.

**Edge cases:** E1: pusta nazwa → „Name is required.” E2: cena ≤ 0 → „Price must be a positive number.” E3: zmiana statusu na `hidden` → danie znika z aplikacji gościa po publikacji.

**Expected result:** profil potwierdzony, rekomendacje odzwierciedlają realne danie. Event: `dish_profile_saved`.

---

## UC-10 Zmiana ceny lub dostępności wina

| | |
|---|---|
| **Aktor** | Sommelier |
| **Trigger** | Wino się skończyło, nowa cena, nowy rocznik, otwarcie butelki na kieliszki |
| **Preconditions** | Wino istnieje |

**Main flow**
1. Wine list → przełącznik „Active” w wierszu (szybka zmiana dostępności), albo
2. Wine details → ceny kieliszka i butelki, „Poured by the glass”, „Available tonight”, nota degustacyjna, profil wina; podgląd „Best dishes for this wine” na żywo.
3. Zapis.

**Edge cases**
- E1: Cena kieliszka ≥ cena butelki → „Glass price should be lower than the bottle price.”
- E2: Zaznaczono „Poured by the glass” bez ceny → komunikat walidacji.
- E3: Wyłączenie wina będącego Primary dla dań → dania pokazują kolejną parę; pole „no primary pick” w checkliście publikacji.

**Expected result:** dostępność zmienia się dla gości natychmiast (dostępność nie wymaga publikacji, bo gość nie może zobaczyć wina, którego nie ma). Eventy: `wine_availability_changed`, `wine_saved`.

---

## UC-11 Import menu

| | |
|---|---|
| **Aktor** | Sommelier, GM |
| **Trigger** | Nowa restauracja, nowa karta sezonowa |
| **Preconditions** | Plik PDF, XLSX lub CSV do 10 MB |

**Main flow**
1. Upload (przeciągnij i upuść lub wybór pliku); dostępny szablon CSV i plik przykładowy.
2. System tworzy `ImportJob` (`POST /imports/menu`), parsuje plik i zwraca podgląd wierszy.
3. Krok „Check and correct”: tabela z edycją nazwy, opisu, kategorii, ceny; kolumna „Drafted profile”; kolumna „Checks” z problemami (Missing price, No category); checkbox importu dla każdego wiersza.
4. „Import selected dishes”: dania zapisane jako `draft` z profilem `draft`; silnik generuje propozycje.
5. Krok „Imported”: linki do Review queue i Menu.

**Alternative flows:** A1: „Start over” odrzuca podgląd. A2: PDF ze skanu → OCR po stronie serwera, a w razie niskiej pewności wiersze oznaczone do sprawdzenia.

**Edge cases**
- E1: Plik o innym rozszerzeniu → „“x.docx” isn’t a CSV, Excel or PDF file.”
- E2: Plik bez wierszy danych → „The file has no data rows…”
- E3: Zaznaczony wiersz bez ceny → „Row 5: add a name and a price, or untick it.”
- E4: Nic nie zaznaczono → „Select at least one row to import.”
- E5: Separator `;` (polski Excel) → wykrywany automatycznie.
- E6: Duplikat nazwy dania → oznaczenie „Already on the menu — will update” (produkcja).

**Expected result:** nowe dania jako drafty z propozycjami pairingów, nic nie trafia do gości przed publikacją. Eventy: `import_file_parsed`, `import_confirmed`.

---

## UC-12 Import karty win

Jak UC-11, z różnicami:
- kolumny: producer, wine, vintage, region, grape, style, glass price, bottle price;
- profil wina z domyślnych wartości szczepu i stylu (np. Nebbiolo → tannin 5, acidity 5);
- walidacja: brak producenta lub ceny butelki blokuje import wiersza; brak szczepu → ostrzeżenie „No grape, profile uses style defaults”;
- po imporcie wina są aktywne, a silnik dolicza propozycje dla wszystkich dań z nowymi winami.

**Expected result:** karta win aktualna, nowe propozycje w kolejce review.

---

## UC-13 Publikacja zmian

| | |
|---|---|
| **Aktor** | Sommelier, GM |
| **Trigger** | Licznik „Publish” w nawigacji > 0 |
| **Preconditions** | Zalogowany użytkownik z uprawnieniem publikacji |

**Main flow**
1. System pokazuje checklistę „Before you publish” (rekomendowana, nie blokuje): dania bez Primary, niezreviewowane propozycje, profile w drafcie, nowe dania, które zostaną opublikowane.
2. Ustawienia gościa: „Fill empty places with engine picks”, „Show match percentages to guests”.
3. „Publish changes” (`POST /restaurants/{id}/publish`): tworzy niezmienną wersję (`PublishedVersion`), dania `draft` → `published`, licznik zmian = 0.
4. Toast „Published 12 changes. Guests see them now.”

**Edge cases:** E1: brak zmian → przycisk nieaktywny, tekst „Guests see the latest version”. E2: błąd publikacji → poprzednia wersja pozostaje aktywna, komunikat i ponowienie. E3: potrzeba wycofania → „Restore previous version” (produkcja, wersje są przechowywane).

**Expected result:** gość widzi nową wersję bez zmiany QR kodu. Event: `restaurant_published`.

---

## UC-14 Onboarding restauracji i QR kod

| | |
|---|---|
| **Aktor** | GM (z pomocą System Admina) |
| **Trigger** | Podpisanie umowy |
| **Preconditions** | Konto restauracji utworzone przez System Admina |

**Main flow** (ekran Setup checklist prowadzi przez kroki)
1. Restaurant details: nazwa, publiczny link (slug), adres, Wine Director.
2. Upload menu (UC-11).
3. Upload wine list (UC-12).
4. Check data: potwierdzenie profili dań.
5. Generate pairings: silnik generuje propozycje (`POST /restaurants/{id}/pairings/generate`).
6. Sommelier review (UC-07).
7. Publish (UC-13).
8. Place QR codes: ekran QR — podgląd stojaka na stół, kopiowanie linku, pobranie SVG (druk) i PNG, druk stojaka.

**Edge cases**
- E1: Slug zajęty → „This link is taken” (produkcja). Niepoprawny format → „Public link: 2–40 lowercase letters, numbers or dashes.”
- E2: Zmiana slugu po wydrukowaniu QR → ostrzeżenie w podpowiedzi; produkcyjnie stary slug przekierowuje 301 przez 12 miesięcy.
- E3: Restauracja chce zacząć od razu bez review → może opublikować; gość zobaczy „Recommended for your dish” zamiast „Sommelier’s pairing”.

**Expected result:** restauracja jest dostępna pod publicznym linkiem, a QR kody są gotowe do druku. Eventy: `pairings_regenerated`, `qr_downloaded`.
