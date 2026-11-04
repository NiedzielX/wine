---
status: draft
created: 2026-11-04
owner: Filip
related: [.ai/specs/product-brief.md, .ai/specs/backlog.md, .ai/specs/2026-10-15-production-deployment.md, .ai/specs/2026-10-16-recommendation-code.md, docs/RECOMMENDATION_ENGINE.md]
---

# Plan domknięcia produktu Wine Match do wersji pełnej (E11–E22)

## Problem
Zakres MVP (D01, D09, D13–D18) jest zbudowany: aplikacja gościa, panel sommeliera, import, publikacja, QR, cały stół i ścieżka kelnera, kody rekomendacji, zdarzenia użycia, import sprzedaży, dashboard KPI i okazje. Brakuje tego, co odróżnia prototyp od pełnego produktu: wdrożenie, konta i role, uzupełnienia panelu, rozliczenia, rozwinięty silnik, funkcje gościa i operacje restauracji, jakość platformy oraz materiały do pokazania restauracjom. Plan porządkuje tę pracę.

## Decyzja D19 (właściciel, 2026-11-04)
Nie weryfikujemy założeń A01–A06 przed budową. Założenia są własnymi założeniami zespołu, które po zbudowaniu produktu przedstawiamy restauracjom. Cel: pełnoprawny produkt, gotowy do pokazania. Badania E01 (#3–#9) mogą biec równolegle, ale niczego nie blokują. Niezmienne pozostają N01 (bez płatnych pozycji) i N03 (bez płatnego LLM per zapytanie) oraz zasady zaufania gościa.

## Cel i zakres
Dowieźć kompletny produkt w czterech falach, każdy epik z własną specyfikacją w statusie `draft`.
**Poza zakresem tego planu:** integracje z POS i e-menu (N04) oraz profile gości między restauracjami. Wchodzą tylko po jawnej decyzji właściciela (sekcja „Decyzje do podjęcia”).

## Stan dziś (zbudowane)
| Obszar | Zbudowane |
|---|---|
| Gość | G0–G12: wybór dania, cały stół, ścieżka kelnera, kod rekomendacji, PL/EN, desktop |
| Panel | import, publikacja, QR, kolejka review, KPI, okazje, analityka użycia |
| Dane | import menu i karty, import sprzedaży i Wine Attach Rate, zdarzenia użycia |
| Silnik | `wm-rules-1.2.0`, reguły + afinicje, stolik, okazje |
| Proces | CI (lint, unit, a11y, design, build, e2e, database), Storybook |

## Epiki

| Id | Epik | Specyfikacja | Fazy | Zależy od | Fala | Ryzyko (najwyższe z faz, SDLC) |
|---|---|---|---|---|---|---|
| E11 | Wdrożenie produkcyjne (istniejąca, `approved`) | `2026-10-15-production-deployment.md` | wg specyfikacji | — | 0 | high |
| E11b | Domknięcie kodów rekomendacji (AC1–AC6, AC13–AC15) | `2026-10-16-recommendation-code.md` | wg specyfikacji | — | 0 | medium |
| E12 | Konta personelu, PIN kelnera i role | `2026-11-04-staff-accounts-and-roles.md` | 6 (F1–F6) | — (F5 respektuje tryb `demo` z E22; limity po IP z E21 F3 miękko) | 1 | high (wszystkie fazy) |
| E14 | Panel administratora systemu, organizacje i wiele lokali | `2026-11-04-platform-admin-and-multi-venue.md` | 5 (F1–F5) | E12 (F3 po E12 F2: `InvitationService.inviteOwner`; AC26 po E12 F1) | 1 | high (wszystkie fazy) |
| E21 | Jakość platformy i zgodność (monitoring, kopie, limity, dostępność, wydajność, RODO) | `2026-11-04-platform-quality-and-compliance.md` | 7 (F1–F7) | E11 (F2 po E11 F1) | 1 | high (F3, F4) |
| E13 | Dokończenie panelu (edycja profili, historia publikacji, publikacje zaplanowane, zestawy sezonowe) | `2026-11-04-panel-completion.md` | 6 (F1–F6) | tabela uprawnień z E12 (kolejność scalania `profiles.edit`); zawieszenie z E14 (miękko) | 2 | high (F1, F2, F4, F5, F6) |
| E16 | Silnik v1.x: kalibracja reguł i optymalizacja stolika | `2026-11-04-engine-v1x-calibration-and-table-optimization.md` | 6 (F1–F6) | — | 2 | high (F2–F5) |
| E18 | Doświadczenie gościa (menu degustacyjne, odwrócone parowanie, diety, opinia) | `2026-11-04-guest-experience-completion.md` | 7 (F1–F7) | **E13 F1** (kontrakt `PublishedView`), E16 (częściowo), E11b (F7) | 2 | high (F1, F5, F7) |
| E19 | Operacje restauracji (dostępność, wina do sprzedania, branding, zestaw QR; F5 „dzwonek” poza zakresem planu, O12) | `2026-11-04-restaurant-operations.md` | 5 (F1–F5, F5 warunkowa) | E13 (model publikacji; core F1 i F3 mogą wcześniej) | 2 | high (F1, F2, F3, F5) |
| E20 | Dane i import (OCR, eksport CSV, alias sluga, wiele kodów #89, czyszczenie `itemName` #90) | `2026-11-04-data-and-import-completion.md` | 6 (F1–F6) | E11b (F2); E11 (F5: pomiary na docelowej VM); E12 (`analytics.export`, kolejność scalania) | 2 | high (F1, F2, F3, F4) |
| E15 | Subskrypcje i rozliczenia | `2026-11-04-subscriptions-and-billing.md` | 7 (F1–F7) | E12, E14 (F1 po E14 F1, F2 po E14 F4, F6 po E14 F2) | 3 | high (wszystkie fazy) |
| E17 | Warstwa uczenia (zbiór danych, model cieniowy, ocena offline) | `2026-11-04-learning-layer-shadow-model.md` | 4 (F1–F4; F1 ∥ F2) | E16 (F1), E11b (F3: etykieta „zamówione”), E19 (flaga `sell_priority` w schemacie od F1), E21 (retencja ekspozycji, miękko) | 3 | high (F3, F4) |
| E22 | Demo sprzedażowe i kalkulator zwrotu | `2026-11-04-sales-demo-and-roi-calculator.md` | 4 (F1–F4) | F1: —; F2: E11, E12 F5 (widok kelnera w trybie `demo`); F3: E04 (zbudowane); F4: E15, E19 | 3 | high (F2) |

Łącznie 63 fazy w epikach E12–E22 (E12 6, E13 6, E14 5, E15 7, E16 6, E17 4, E18 7, E19 5, E20 6, E21 7, E22 4); każda to osobny PR. Etykiety ryzyka według `SDLC.md` (migracja schematu, uwierzytelnianie, pieniądze, zakres danych i wspólne kontrakty to `risk-high`).

Numery E12–E22 są kolejne, E11 to istniejąca specyfikacja wdrożenia. E11b nie ma nowej specyfikacji: to domknięcie istniejącej. Issue #89 i #90 należą do E20.

## Ustalenia międzyepikowe (obowiązują wszystkie specyfikacje E12–E22)

### Identyfikatory ekranów
Istniejące: G0–G12 (gość), A1–A14 (panel). Każdy epik używa tylko swojego zakresu; recenzja i implementacja dopisują ekrany do `docs/SCREEN_MAP.md`.

| Epik | Zakres |
|---|---|
| E12 | G13 (logowanie PIN kelnera), A15 (zespół i zaproszenia), A16 (konto i sesje), A17 (przyjęcie zaproszenia, publiczny), A18 (dziennik uwierzytelniania) |
| E13 | A19 (edytor profili), A20 (historia publikacji i różnice), A21 (publikacje zaplanowane i wersje sezonowe) |
| E14 | P1–P6 (panel administratora systemu), A22 (przegląd organizacji i przełącznik lokali), G15 (strona zawieszonej restauracji) |
| E15 | A23 (rozliczenia restauracji), SA-B1 i SA-B2 (rozliczenia w panelu administratora); G15 (strona zawieszonej restauracji) tworzy E14 F1, E15 dodaje tylko drugi powód |
| E18 | G16–G19 (gość: lista win i odwrócone parowanie, menu degustacyjne, opinia; to stany lub sekcje widoku gościa, niekoniecznie osobne ekrany), A24–A25 (panel: tagi diet, menu degustacyjne); zależność: E13 F1; G15 należy do E14 F1 |
| E19 | A26 (dostępność), A27 (priorytet), A28 (branding), A29 (zestaw QR, rozszerza A12); dzwonek powiadomień (E19) to stan ekranu A1, bez własnego identyfikatora |
| E20 | A30 (eksport analityki) |
| E21 | G14 (informacja o prywatności), A31 (retencja i eksport danych, jeśli potrzebny ekran) |
| E22 | DM0–DM5 (publiczne demo; prefiks `DM`, bo P1–P6 to E14, a `D0–D5` myliłoby się z decyzjami D01–D19) |

### Uprawnienia
Jedna tabela w `packages/core/src/auth/permissions.ts`, której właścicielem jest E12. Nazwy: `team.manage`, `audit.view` (E12); `profiles.edit` (E13); `wines.priority`, `branding.edit` (E19; według specyfikacji E19 także uprawnienie dostępności win — nazwa do uzgodnienia z E12); `staff.lookup` (E12, wstęp do widoku kelnera w trybie PIN; spoza pierwotnej listy planu); `billing.view` (E15, razem z `billing.manage`); `analytics.export` (E20); `billing.manage` (E15); `platform.*` (E14) oraz `platform.billing.*` (E15, rozszerzenie `platform.*` dla SA-B1/SA-B2). Inne epiki dopisują wpisy do tej tabeli, nie tworzą własnej.

### Ustalenia
1. **Model publikacji:** bazą jest E13 F1 (snapshot v2 i jeden `PublishedView` dla wszystkich ścieżek odczytu gościa). E18 i E19 stosują jego kontrakt: dla każdego nowego pola wybierają „w wersji” albo „na żywo”.
2. **Zawieszenie restauracji:** `restaurant.status` istnieje w bazie, ale nie w typie domenowym. Egzekwuje je E14 F1, E15 używa tego samego mechanizmu.
3. **Kolejność migracji tabel `restaurant` i `organization`:** E14 przed E15.
4. **Retencja danych:** politykę definiuje E21. Pozostałe epiki odwołują się do niej dla `guest_interaction`, `recommendation_code`, opinii, ekspozycji (E17) i dziennika audytu.
5. **Wersja silnika:** `ENGINE_VERSION` podnosi tylko E16 (do 1.3.0; w F2, a wydanie produkcyjne dopiero po F6 albo jako jeden tydzień scalania F2–F4). E17 nie zmienia silnika (cechy modelu bazują na nazwach reguł i `ENGINE_VERSION`, więc zbiór danych powstaje od `1.3.0`). E18 dodaje warstwy `reverse.*`, `flight.*` bez zmiany `pairingScore`. E19 dodaje opcję `sellPriority` w `recommendForDish` (tier 2, `rankScore` bez wpływu na `matchScore`; bez ustawionego priorytetu wyniki identyczne), więc bez zmiany wersji; E17 loguje flagę `sell_priority`. Wszystkie wersje E16 wymagają aktualizacji wszystkich wystąpień starej wersji (lista w E16 R4).
6. **D18 (brak uczenia między restauracjami)** pozostaje. Wiersz v2 w `docs/RECOMMENDATION_ENGINE.md` §12 (podobieństwo do par z innych restauracji) zostaje poprawiony w ramach E17 F3 (AC21), razem z nowym §14.
7. **Wyjątki od AGENTS.md i zależności wymagające Twojej zgody przed implementacją:** porty bez `restaurantId` (E14), tabela limitera bez dzierżawcy (E21), porty retencji tabel globalnych bez `restaurantId` (E21: `audit_log`, `billing_event`, `subscription_change`, `rate_limit_bucket`, `auth_token`), webhook płatności: surowe ciało, wyszukiwanie po id dostawcy, brak `expectedVersion` (E15), ciasteczko `wm_staff` (E12), publiczna akcja `submitFeedback` (E18), trzeci layout `(showcase)` (E22), backfill istniejącej niezmiennej wersji publikacji (E13 F1), zapis ekspozycji bez `actor` jak telemetria (E17), nowe zależności npm: `stripe` (E15), biblioteka OCR (E20 F6, po spiku F5). Każdy punkt ma osobny wiersz w „Decyzjach do podjęcia”.
8. **Identyfikatory ekranów** są jednoznaczne tylko przy powyższej tabeli; specyfikacje po przeglądach ją respektują (E22: `DM0–DM5`; E18: G16–G19, A24–A25; E19: A26–A29; E13: A19–A21).
9. **Demo i konta:** instancja demo (E22) nie ładuje kont demo z publicznym hasłem i nie wystawia PIN-u demo (E12); E12 F5 musi przepuszczać widok kelnera w trybie `demo`.

## Fale

**Fala 0 (fundament pod pokazanie produktu):** E11 (wdrożenie), E11b (domknięcie kodów i długu prywatności).

**Fala 1 (podstawa produktu):** E12 (konta, role, PIN), E14 (administrator systemu, organizacje), E21 (jakość i zgodność). Bez tego produkt nie nadaje się do prawdziwego klienta.

**Fala 2 (głębia produktu):** E13 (panel), E16 (silnik), E18 (gość), E19 (operacje), E20 (dane). Te epiki można równolegle, bo dotykają różnych obszarów, z wyjątkami: E19 i E18 wymagają E13 F1 (model publikacji, `PublishedView`); E20 F2 wymaga E11b; scalanie faz zmieniających wyniki silnika (E16 F2–F4) i migawki golden idzie po kolei. E18 F3/F6 uruchamiają ponownie `engine:matrix` po scaleniu E16.

**Fala 3 (komercjalizacja i uczenie):** E15 (rozliczenia), E17 (warstwa uczenia; po E16 i E19, bo schemat cech zna reguły z E16 i flagę priorytetu z E19), E22 (demo i kalkulator; F1 kalkulator nie zależy od niczego i może wejść wcześniej, F4 czeka na E15 i E19).

Kolejność scalania wewnątrz fali: najpierw `core` i migracje, potem UI. Każdy epik dzieli się na fazy F1…Fn opisane w jego specyfikacji, a faza to osobny PR (reguła z E07–E10).

## Model rekomendacji (mapowanie na roadmapę silnika)
| Etap | Epik | Zakres |
|---|---|---|
| v1.x | E16 | kalibracja reguł z `engine:matrix` i arkusz akceptacji sommeliera, 16 reguł dla dań roślinnych, ostrych, kwaśnych/fermentowanych, deserów i serów, region jako cecha (`region.classic`, tylko +2), optymalizator stolika dla planu z 1–2 winami (maks. ważona zgodność, podłoga, budżet, ml na osobę; lista 3 butelek bez zmian), wersja `wm-rules-1.3.0` |
| v1.x+ | E17 | log ekspozycji z cechami, regresja logistyczna per restauracja (MAP wokół stałego, zgadniętego priora; bez uczenia między restauracjami, D18) jako model cieniowy niewidoczny dla gościa, ocena offline na chronologicznym zbiorze testowym (log-loss, ECE, NDCG@3, powtórka IPW przy założonym modelu pozycyjnym); rollout i A/B poza specyfikacją, decyzja właściciela |
| v2+ | poza planem | embeddingi i `pgvector`, LightGBM, personalizacja gości (wymaga decyzji o profilach gości, N04) |

Warstwa sommeliera pozostaje ponad modelem na każdym etapie. Silnik pozostaje deterministyczny w obrębie wersji.

## Definicja „produkt gotowy do pokazania restauracji”
- [ ] Instancja produkcyjna działa pod własną domeną, ma health check, kopie zapasowe i monitoring (E11, E21).
- [ ] Restauracja zakłada konto, ma role (właściciel, GM, sommelier, kelner z PIN-em) i może zapraszać ludzi (E12).
- [ ] Menu i karta winna importują się z PDF, XLSX i CSV, w tym ze skanów (E20), a profile można edytować w panelu (E13).
- [ ] Publikacje mają historię i przywracanie; można planować sezonowe wersje karty (E13).
- [ ] Gość dostaje pełną ścieżkę: dania, cały stół, menu degustacyjne, odwrócone parowanie, diety, kod dla kelnera, opinia (E18).
- [ ] Restauracja steruje dostępnością win, priorytetem „wina do sprzedania”, brandingiem i drukiem QR (E19).
- [ ] Silnik ma skalibrowane reguły i optymalizację stolika (E16).
- [ ] Rozliczenia i plany subskrypcji działają (E15).
- [ ] Dostępne jest demo bez kont i bez prawdziwych danych oraz kalkulator zwrotu, w którym każda liczba jest oznaczona jako założenie (E22).
- [ ] Wszystkie checki CI zielone, dostępność WCAG 2.1 AA, bez regresji kontrastu (E21).

## Decyzje do podjęcia przez właściciela
| Id | Decyzja | Domyślna rekomendacja |
|---|---|---|
| Q1 | Czy zdjąć N04 (integracje POS i e-menu)? | Nie w tej iteracji; dodać jako osobny epik po fali 3. |
| Q2 | Dostawca płatności | Stripe (ma testowy tryb, gotowe plany i faktury); decyzja przy specyfikacji E15. |
| Q3 | Hosting | Jedna VM w UE zgodnie ze specyfikacją E11; zmiana tylko przez nowy spec. |
| Q4 | Ceny planów | Hipotetyczne 390–790 zł miesięcznie z briefu (A02) jako punkt wyjścia; ostateczne ustala właściciel. |
| Q5 | Języki poza PL/EN | Nie w tym planie; dodać epik po decyzji. |
| Q6 | Czy dopuszczamy priorytet „wina do sprzedania” ustawiany przez restaurację? | Tak, z twardym progiem zgodności i bez wpływu importerów (N01). |
| Q7 | Wyjątki od `AGENTS.md` (sekcja „Ustalenia”, pkt 7): porty bez `restaurantId` (E14 O1), limiter bez dzierżawcy (E21), webhook (E15 Q15), `wm_staff` (E12 Q-O1), `submitFeedback` (E18 Q15), layout `(showcase)` (E22 Q14), backfill niezmiennej wersji (E13 F1), zapis ekspozycji jak telemetria (E17) | Zgoda osobno na każdy, przed fazą, która go używa; bez zgody odpada odpowiednia faza (E12 F5, E15 F3, E18 F7). |
| Q8 | E12: wysyłka e-maili (Q-O2, powiązane z E19 O5) i autor akcji kelnera w kodzie polecenia (Q-O4) | Bez mailera w tym planie (linki przekazywane ręcznie); `staff_view` zostaje, osoba tylko w dzienniku. |
| Q9 | E13: (a) „przywróć” wczytuje też wersję do edycji, (b) tylko jedna wersja zaplanowana, (c) stała strefa `Europe/Warsaw`, (d) masowe „potwierdź profile”, (e) ceny i `wine.active` poza migawką („na żywo”) | (a) nie, (b) tak, (c) tak, (d) nie, (e) na żywo, z możliwością zmiany później. |
| Q10 | E15: netto czy brutto (Q-a), faktura VAT i KSeF z księgową (Q-b), zachowanie stron gościa przy błędzie odczytu subskrypcji (fail-open: dostępne) wbrew regule „zawodzi zamykająco”, zależność `stripe` | Netto + 23% VAT; faktury Stripe do czasu decyzji księgowej; fail-open dla gościa; `stripe` po przypięciu wersji ≥ 14 dni. |
| Q11 | E16: sommelier jako recenzent kalibracji (Q12; bez niego recenzuje Filip), plan stołu z 2 winami nigdy droższy niż pozycja 1 (Q16), `TABLE_PLAN_MIN_GAIN = 3` (zgadnięta), wydanie `wm-rules-1.3.0` do produkcji dopiero po F6 (Q10) | Sommelier podpisuje arkusz, a bez niego Filip z adnotacją; plan nie droższy; próg do kalibracji w F5; wydanie po F6. |
| Q12 | E17: czy znosimy D18 dla wag zbiorczych (np. w obrębie organizacji E14), czy `y_ord` ma zastąpić `y_sel`, losowa eksploracja ruchu do rzetelnej oceny (R-2), kto czyta raport i decyduje o rolloucie (sommelier ponad modelem), retencja ekspozycji dłuższa niż 395 dni dla uczenia (E21) | D18 bez zmian; `y_sel`; bez eksploracji; decyzja o rolloucie wyłącznie właściciela; retencja ekspozycji ustalana z E21. Progi i prior są zgadnięte, nie wyniki pomiaru. |
| Q13 | E18: przegląd prawny zastrzeżenia o alergenach, wpływ priorytetu E19 na sekwencję menu degustacyjnego i odwrócone parowanie | Bez twierdzeń medycznych; priorytet nie przebija progu `MIN_MODEL_SCORE` ani pieczęci sommeliera. |
| Q14 | E19: etykieta „Wybór restauracji” przy winie z priorytetem (O2), priorytet w „cały stół” (O3), F5 „dzwonek” poza zakresem planu (O12), logo z metadanymi EXIF (O13), `bytea` w MikroORM (O6) | Etykieta tak; stół bez priorytetu; F5 odłożona; odrzucanie JPEG z EXIF GPS albo ostrzeżenie; zapas: base64 w `text`. |
| Q15 | E20: nowa zależność OCR po spiku F5 (rozmiary, licencje, pamięć na VM E11), przekierowanie sluga bezterminowe (zgodnie z BC §1), zakres E11b a #89/#90 | OCR tylko po spiku i `audit:gate`; bezterminowo; #89/#90 realizuje E20, E11b domyka AC1–AC6 i AC13–AC15. |
| Q16 | E21: przegląd prawnika (czy `sid` w URL jest daną osobową, 13 miesięcy retencji, podstawa „uzasadniony interes”, ustawa o dostępności), uptime check operatora, CSP odłożone | Prawnik przed pierwszym klientem; check bezpłatny; CSP osobną specyfikacją. |
| Q17 | E22: interpretacja „+10 zł” (na gościa zamawiającego wino czy na każdego gościa; wersja literalna z `PRODUCT_CONCEPT` §5 daje inne liczby), wartości robocze kalkulatora (odsetek zamawiających 30%, 150 zł, marża 60% — bez źródła), autor treści „Jak to działa dla restauracji”, czy demo pokazuje syntetyczny wzrost odsetka wina, przybliżenie gość/rachunek | Wariant ostrożniejszy; wartości robocze oznaczone jako założenia; treść recenzuje Filip; wzrost z banerem (bezpieczniej: bez); pole „gości na rachunek” nie wchodzi. |
| Q18 | E14: czy właściciel organizacji widzi audyt swoich lokali (O3); wpis „porty platformy bez `restaurantId`” w `AGENTS.md` §1.3 (O1, plik pod CODEOWNERS) | Bez zmian (audyt tylko staff); wpis tak, z testem izolacji. |
| Q19 | E11 jest `approved` i należy do człowieka, więc plan go nie zmienia. Runbook wdrożenia E11 musi dostać (a) ostrzeżenie o wycofaniu po E12 F1 (stary kod ignoruje `membership.status`), (b) ostrzeżenie o wycofaniu po E14 F1 (stary kod ignoruje `restaurant.status`), (c) sprawdzenie zarezerwowanych slugów `restaurants:check-reserved` przed migracją E14 F1 | Wymaganie niesione przez E12 F1 i E14 F1 (faza nie przechodzi bez adnotacji w runbooku); właściciel decyduje o poprawce E11 (nowa wersja specyfikacji albo adnotacja w PR). |

## Proces
1. Każda specyfikacja z tego planu jest `draft`. Przed prośbą o akceptację przechodzi niezależny przegląd (AGENTS.md §3).
2. Akceptuje właściciel: ustawia `approved`. Dopiero wtedy powstają issue (przez `om-backlog`) i implementacja autonomicznymi runami.
3. Epiki, które mają fazy `risk-high` (E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21, E22; bez E11b), wymagają dla tych faz QA reviewera albo wyjątku właściciela na PR, zgodnie z `SDLC.md`; kolumna „Ryzyko” w tabeli epików podaje, które fazy.
4. Po zatwierdzeniu i odpaleniu epiku aktualizujemy `backlog.md`.
5. **Definicja gotowości specyfikacji do akceptacji:** (a) przegląd niezależny wpisany („Przegląd niezależny 2026-11-04”); (b) każde wymaganie ma kryterium akceptacji z opisem weryfikacji; (c) fazy mają etykiety ryzyka według `SDLC.md` i są niezależnie scalane; (d) liczby zgadnięte są oznaczone jako zgadnięte; (e) decyzje właściciela są w tabeli powyżej; (f) identyfikatory ekranów i uprawnień zgodne z sekcją „Ustalenia międzyepikowe”.

## Ryzyka i otwarte pytania
- **Zakres:** trzynaście pozycji (E11, E11b, E12–E22), 63 fazy w E12–E22. Kolejność fal pozwala zatrzymać się po każdej z nich z działającym produktem.
- **Płatności i dane osobowe** (E15, E21) wymagają szczególnej ostrożności; obie specyfikacje są `risk-high`.
- **Silnik:** zmiana wag i reguł zmienia `ENGINE_VERSION` i wymaga ponownej kalibracji progów okazji (`STRONG_MATCH`); E16 wprowadza procedurę wyprowadzenia progu. E19 zmienia kolejność (nie wynik) przy ustawionym priorytecie, a E17 uczy się dopiero od `1.3.0`, więc E16 przed E17.
- **Liczby zgadnięte** (delty reguł E16, prior i progi bramek E17, wartości robocze kalkulatora E22) są w specyfikacjach oznaczone jako zgadnięte i nie mają być prezentowane jako wyniki.
- **Brak weryfikacji założeń** to świadoma decyzja D19; kalkulator zwrotu (E22) musi jasno oznaczać liczby jako założenia, nie wyniki pomiarów.

## Realizacja
(Uzupełnia agent po przyjęciu planu i utworzeniu specyfikacji.)
