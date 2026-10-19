# Wine Match — koncepcja produktu

## 1. Problem

W restauracjach premium wino jest jedną z najbardziej dochodowych kategorii, a jednocześnie najczęściej „gubioną” sprzedażą.

- **Gość nie wie, co wybrać.** Karta win z 40–200 pozycjami, nieznane apelacje i szczepy. Łatwiej zamówić wodę albo „domowe czerwone” niż ryzykować pomyłkę lub niezręczne pytanie przy stole.
- **Sommelier nie skaluje się.** W sobotni wieczór jeden sommelier obsługuje kilkadziesiąt stolików; większość gości nigdy z nim nie rozmawia.
- **Kelnerzy nie są sommelierami.** Rotacja zespołu jest wysoka, a wiedza o parowaniu nierówna. Rekomendacja zależy od tego, kto akurat podszedł do stolika.
- **Restauracja nie widzi danych.** Nie wiadomo, które pary „działają”, które wina są pokazywane, a które faktycznie zamawiane, ani ile sprzedaży wina ucieka.

Skutek: niski **Wine Attach Rate** (udział zamówień jedzenia, do których sprzedawane jest wino), niższa średnia wartość butelki i niewykorzystany potencjał karty win.

## 2. Value proposition

**Dla restauracji:** więcej sprzedanego wina, bez zatrudniania dodatkowych osób i bez utraty kontroli nad kartą. Wine Match przenosi wiedzę sommeliera na każdy stolik przez QR kod.

**Dla sommeliera:** jego pairingi docierają do każdego gościa, a nie tylko do tych, z którymi zdąży porozmawiać. System proponuje, sommelier decyduje. Para sommeliera zawsze ma pierwszeństwo przed modelem.

**Dla gościa:** w trzech dotknięciach dowiaduje się, które wino z tej konkretnej karty pasuje do tego, co zamawia, w jakiej cenie i dlaczego — bez rejestracji, aplikacji i specjalistycznego słownictwa.

**Dla kelnera:** ten sam silnik w widoku „lookup” daje gotowe argumenty do rozmowy z gościem („Pinot i wiśniowy sos — nasze firmowe połączenie”).

Pozycjonowanie: **nie jest to „AI Sommelier”.** To cyfrowa warstwa programu winnego restauracji. Algorytm działa w tle, a interfejs mówi głosem restauracji: „Sommelier’s pairing”, „Recommended for your dish”, „Recommended for your table”.

## 3. Model B2B2C

```
            płaci (subskrypcja)                    korzysta (za darmo)
Restauracja ─────────────────────► Wine Match ◄─────────────────────── Gość
     ▲                                  │                               ▲
     │ zarządza kartą i pairingami      │ rekomendacje z karty          │
Sommelier / Wine Director ──────────────┘ restauracji ──────────────────┘
                                         │
                                  Kelner (lookup)
```

- **B (klient płacący):** restauracja, grupa restauracyjna, hotel z restauracją.
- **B (użytkownik profesjonalny):** sommelier / Wine Director — właściciel programu winnego.
- **C (użytkownik końcowy):** gość restauracji, przez QR kod lub link, jako web app / PWA.

Gość nigdy nie płaci i nie zakłada konta. Wartość dla gościa przekłada się na przychód restauracji, a ten — na subskrypcję Wine Match.

## 4. Główni użytkownicy

| Użytkownik | Kontekst | Główna potrzeba |
|---|---|---|
| Restaurant Owner / General Manager | biuro, laptop, raz w tygodniu | Czy produkt zwiększa sprzedaż wina? |
| Sommelier / Wine Director | przed serwisem, laptop | Kontrola nad tym, co gość widzi |
| Kelner | sala, telefon, kilkanaście sekund | Szybka, pewna podpowiedź przy stoliku |
| Gość restauracji | stolik, telefon, wieczór | Dobre wino do dania bez stresu |
| System Administrator (Wine Match) | backoffice | Onboarding, wsparcie, jakość danych |

Szczegóły: [USER_ROLES.md](USER_ROLES.md).

## 5. Model biznesowy

**Subskrypcja SaaS per lokal, rozliczana miesięcznie.** Proponowane progi (do walidacji z pierwszymi klientami):

| Plan | Dla kogo | Zakres | Cena orientacyjna |
|---|---|---|---|
| Essential | bistro, wine bar, do 60 win | guest app, QR, panel, pairingi, podstawowa analityka | 390 zł / mies. |
| Professional | restauracja premium | + import danych sprzedaży, KPI przychodowe, widok kelnera, wiele kart sezonowych | 790 zł / mies. |
| Group | grupy i hotele | + wiele lokali, wspólna karta, role i uprawnienia, API | wycena |

Uzasadnienie ceny: przy 1 500 gościach miesięcznie wzrost Wine Attach Rate o 5 pp i średniej wartości wina na gościa o 10 zł daje kilkanaście tysięcy złotych dodatkowego przychodu z wina miesięcznie.

**Dodatkowe źródła przychodu (później, poza MVP):** wdrożenie i digitalizacja karty; moduł importerski (marketplace) z jawnie oznaczonymi propozycjami win do karty, nigdy nie wpływający na rekomendacje dla gościa; analityka portfela win (pricing intelligence, forecasting).

**Zasada zaufania:** rekomendacje dla gościa nie są sprzedawane. Żaden importer ani producent nie może kupić pozycji w rankingu.

## 6. KPI

### KPI główne (North Star)

**Wine Attach Rate** = rachunki z jedzeniem i winem / rachunki z jedzeniem, w danym okresie (wynik ≤ 100%). Jednostką jest **rachunek** (stolik), nie gość. Rachunek „ma jedzenie” / „ma wino”, gdy suma ilości pozycji jedzenia / wina (kieliszek lub butelka) w rachunku jest większa od zera — zwrot butelki znosi jej sprzedaż. Rachunki barowe (samo wino, bez jedzenia) nie wchodzą ani do licznika, ani do mianownika; liczą się tylko do przychodu z wina. Mierzone z eksportu POS (CSV/XLSX w MVP, API później), z dni biznesowych z POS. Porównanie: 4 tygodnie przed wdrożeniem i po wdrożeniu, oraz stoliki, które użyły Wine Match, wobec tych, które nie użyły.

Doprecyzowanie z 2026-10-15 (decyzja właściciela, spec `2026-10-15-pos-sales-import-attach-rate`, Q7): wcześniejsze brzmienie „zamówienia z co najmniej jedną pozycją wina / zamówienia z jedzeniem” nie ograniczało licznika do rachunków z jedzeniem. Ponieważ wskaźnik jest per rachunek, a nie per gość, założenie „+5 pp” (§5) nie przekłada się 1:1 na liczbę gości. W panelu: karta „Wine Attach Rate” na A13 (wybrany okres), dashboard A1 (E04).

### KPI sprzedażowe (wymagają danych sprzedaży)

| KPI | Definicja |
|---|---|
| Wine revenue per guest | przychód z wina / liczba gości (covers) |
| Wine revenue per table | przychód z wina / liczba rachunków stolikowych |
| Average bottle value | przychód z butelek / liczba butelek |
| Average glass value | przychód z kieliszków / liczba kieliszków |

### KPI produktowe (z eventów Wine Match)

| KPI | Definicja |
|---|---|
| Liczba użyć Wine Match | sesje (`guest_session_started`) |
| Liczba rekomendacji | wyświetlenia list rekomendacji (`recommendations_viewed`) |
| Recommendation → wine selection conversion | sesje z `wine_selected` / sesje z `recommendations_viewed` |
| Najczęściej rekomendowane wina | count wine_id w `recommendations_viewed` |
| Najczęściej wybierane wina | count wine_id w `wine_selected` |
| Skuteczność pairingu | `wine_selected` / wyświetlenia dla pary dish–wine |
| Pokrycie sommelierskie | dania z zatwierdzonym Primary / wszystkie dania |

Wszystkie KPI są widoczne w dashboardzie panelu (ekran *Dashboard*). W mockupie pochodzą z danych demonstracyjnych.

## 7. Zakres MVP

**W MVP:**
- import menu i karty win (PDF, Excel, CSV) z podglądem i poprawkami przed zapisem,
- profile smakowe dań i win (draft z importu, potwierdzane przez personel),
- deterministyczny silnik dopasowań, bez płatnych API LLM w czasie użycia,
- workflow sommeliera: Suggested → Approved / Modified / Rejected, role Primary / Alternative / Best value, kolejność, notatka,
- aplikacja gościa: danie → wina, filtry, cały stolik, potwierdzenie dla kelnera,
- widok kelnera (lookup) na tym samym silniku,
- publikacja, QR kod, link publiczny,
- analityka użycia i opcjonalny import danych sprzedaży z CSV.

**Poza MVP, ale architektura na to pozwala:** integracja z POS i e-menu przez API, stany magazynowe i dostępność w czasie rzeczywistym, prognoza popytu, pricing intelligence, optymalizacja portfela win, marketplace importerów, profile smakowe gości i rekomendacje między restauracjami.

## 8. Zasady projektowe

1. **Sommelier jest autorytetem.** Model nigdy nie wyświetla się jako ważniejszy od człowieka. Etykieta „Sommelier’s pairing” / „Para sommeliera” pojawia się tylko przy parach zatwierdzonych przez sommeliera (nazwa według D13, reguła R06).
2. **Uczciwy wynik.** Match Score pokazuje surowy wynik silnika. Zatwierdzenie sommeliera zmienia kolejność, a nie liczbę.
3. **Zero kosztu per zapytanie.** Rekomendacje liczy własny, deterministyczny silnik. LLM — jeśli w ogóle — tylko lokalnie i tylko przy imporcie danych.
4. **Jedno dotknięcie.** Od zeskanowania kodu do listy win: QR → danie. Preferencje są opcjonalne i zostają na kolejne dania. Bez rejestracji i onboardingu.
5. **Głos restauracji, nie technologii.** Bez „AI recommendation”, „Ask AI”, „Powered by AI”.
