# Użytkownicy systemu i ich potrzeby

## Przegląd ról i uprawnień

| Uprawnienie | Guest | Waiter | Sommelier / Wine Director | Owner / GM | System Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Przeglądanie menu i rekomendacji | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lookup pairingów dla kelnera | – | ✓ | ✓ | ✓ | ✓ |
| Logowanie do panelu | – | – (MVP) | ✓ | ✓ | ✓ |
| Dashboard i KPI | – | – | ✓ | ✓ | ✓ |
| Edycja menu i profili dań | – | – | ✓ | ✓ | ✓ |
| Edycja karty win, cen, dostępności | – | – | ✓ | ✓ | ✓ |
| Zatwierdzanie / odrzucanie pairingów | – | – | ✓ | – (podgląd) | ✓ (w imieniu, z logiem) |
| Role, kolejność i notatki pairingów | – | – | ✓ | – | ✓ |
| Import danych | – | – | ✓ | ✓ | ✓ |
| Publikacja | – | – | ✓ | ✓ | ✓ |
| Ustawienia restauracji, QR, link | – | – | – | ✓ | ✓ |
| Zarządzanie użytkownikami lokalu | – | – | – | ✓ | ✓ |
| Tworzenie restauracji, plany, wsparcie | – | – | – | – | ✓ |

**Stan implementacji (Faza 4):** uprawnienia z tej macierzy są w kodzie (`core/src/auth/permissions.ts`) i egzekwowane przez layout panelu, akcje serwerowe i API. Dochodzą uprawnienia `import.manage` (Sommelier, GM, Owner) i `restaurant.edit` (tylko GM i Owner: dane restauracji i slug). Owner i General Manager mają te same uprawnienia; „Zatwierdzanie / odrzucanie pairingów” i „Role, kolejność i notatki” ma tylko Sommelier. Rola System Administrator, zarządzanie użytkownikami w UI i ustawienia restauracji / QR (Faza 5) nie są jeszcze zaimplementowane; konta tworzy polecenie `npm run user:create`.

W MVP kelner korzysta z publicznego widoku `/r/{slug}/staff`, bez logowania (te same dane, które widzi gość). Później: tryb kelnera po zalogowaniu PIN-em, z historią podpowiedzi.

Zasada podziału: **Owner / GM odpowiada za biznes, Sommelier za treść programu winnego.** GM widzi pairingi, ale ich nie zatwierdza — dzięki temu etykieta „Sommelier recommendation” zawsze oznacza decyzję sommeliera.

---

## Restaurant Owner / General Manager

**Kim jest:** odpowiada za wynik finansowy lokalu. Podejmuje decyzję o zakupie, nie zna się na winie w szczegółach.

**Kontekst:** biuro lub laptop, przegląd raz w tygodniu, raport miesięczny dla właścicieli.

**Potrzeby:**
- zobaczyć w jednej liczbie, czy produkt działa (Wine Attach Rate przed i po),
- rozumieć przychód z wina per gość i per stolik, średnią butelkę i kieliszek,
- szybko wdrożyć produkt bez angażowania IT (CSV/PDF zamiast integracji),
- wydrukować QR kody i zmienić link,
- mieć pewność, że gość nie zobaczy wina, którego nie ma.

**Frustracje:** narzędzia, które wymagają integracji z POS przed pierwszą wartością; dashboardy pełne próżnych metryk.

**Kluczowe ekrany:** Dashboard, Setup checklist, Publish, QR code.

---

## Sommelier / Wine Director

**Kim jest:** właściciel programu winnego. Buduje kartę, negocjuje z importerami, szkoli zespół. Jego reputacja zależy od jakości rekomendacji.

**Kontekst:** laptop przed serwisem lub rano; krótkie zmiany w ciągu dnia (wino się skończyło, nowy rocznik).

**Potrzeby:**
- pełna kontrola nad tym, co widzi gość: zatwierdzić, zmienić, odrzucić, ustawić kolejność,
- oznaczyć Primary Recommendation, Alternative, Best Value,
- dopisać własne zdanie „dlaczego” zamiast tekstu generycznego,
- szybko przejrzeć propozycje systemu (kolejka review, „approve all” dla dania),
- zmienić dostępność wina (sold out) jednym kliknięciem,
- widzieć, które pairingi faktycznie sprzedają wino,
- rozumieć, dlaczego system coś zaproponował (czynniki reguł).

**Obawy:** że system „zastąpi” go albo podpisze się jego nazwiskiem pod czymś, czego nie zatwierdził.

**Odpowiedź produktu:** etykieta sommeliera tylko po zatwierdzeniu; przełącznik „Fill empty places with engine picks” pozwala całkowicie wyłączyć niezatwierdzone propozycje.

**Kluczowe ekrany:** Pairings, Review queue, Menu → Dish details, Wine list → Wine details, Import, Publish.

---

## Kelner

**Kim jest:** obsługuje stolik, często bez wykształcenia sommelierskiego; rotacja zespołu.

**Kontekst:** sala, telefon służbowy lub prywatny, 10–20 sekund na sprawdzenie.

**Potrzeby:**
- wybrać danie i od razu zobaczyć 3–4 wina w kolejności sommeliera,
- filtrować po tym, co powiedział gość (kieliszek, kolor, budżet),
- numer pozycji z karty (list no.) — żeby szybko znaleźć butelkę,
- gotowe zdanie do powiedzenia gościowi.

**Czego nie robimy:** nie przedstawiamy kelnera jako sommeliera i nie budujemy modułu szkoleniowego. Odznaki mówią „Wine Director’s first choice”, a nie „moja rekomendacja”.

**Kluczowy ekran:** Staff lookup (`/r/{slug}/staff`).

---

## Gość restauracji

**Kim jest:** każdy, od osoby, która nie pije wina na co dzień, po konesera ciekawego, co poleca dom.

**Kontekst:** stolik, telefon, oświetlenie wieczorne, rozmowa przy stole. Zero cierpliwości do rejestracji.

**Potrzeby:**
- znaleźć wino do konkretnego dania w kilku dotknięciach,
- zobaczyć cenę od razu, z rozróżnieniem kieliszek / butelka,
- ustawić budżet bez niezręczności,
- dobrać jedną butelkę dla całego stolika,
- krótkie wyjaśnienie zwykłym językiem,
- pokazać wybór kelnerowi zamiast wymawiać „Savigny-lès-Beaune”.

**Obawy:** że zostanie „naciągnięty” na droższe wino; że wybierze źle.

**Odpowiedź produktu:** filtr budżetu jako twardy limit, oznaczenie Best value, widoczna cena kieliszka, uczciwy procent dopasowania.

**Kluczowe ekrany:** Landing, Dish list, Dish details, Wine recommendations, Filters, Wine details, Confirmation, Whole table, Best wine for your table.

---

## System Administrator (zespół Wine Match)

**Kim jest:** pracownik Wine Match odpowiedzialny za onboarding, wsparcie i jakość danych.

**Potrzeby:**
- utworzyć restaurację, plan, slug, pierwsze konta,
- pomóc przy imporcie trudnej karty (PDF ze skanu),
- podejrzeć panel restauracji w trybie read-only (impersonacja z logiem audytowym),
- zarządzać globalną bazą profili win (ten sam rocznik w wielu lokalach),
- monitorować jakość silnika (rozkład wyników, odrzucenia przez sommelierów),
- wdrażać nowe wersje reguł silnika z możliwością rollbacku.

**Ekrany:** poza zakresem mockupów MVP (backoffice wewnętrzny). Endpointy: `/admin/*` w [API_SPECIFICATION.md](API_SPECIFICATION.md).
