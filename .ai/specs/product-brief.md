# Wine Match — product brief

- Date: 2026-10-25 (odświeżenie; pierwsza wersja 2026-10-15)
- Mode: existing (produkt zbudowany, bez prawdziwych użytkowników), z kontrolami trybu `own`; Owner: Filip (product owner); Pass: full, prowadzony przez agenta bez rozmowy na polecenie właściciela (D19: desk research i jawne założenia) — decyzje spoza zatwierdzonych specyfikacji mają status `proposal`
- Evidence basis: desk research z 2026-10-25 dał tylko tropy (streszczenia wyszukiwarki, strony niepobrane: `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md`), które nie liczą się jako dowód; poza tym tylko dokumenty zespołu (brief MVP zatwierdzony przez Filipa 2026-10-14; decyzje fazy 5 — import i QR — czekają na jego przegląd) oraz działający kod. Brak wywiadów, danych sprzedaży, benchmarku i pilotażowej restauracji. Najbardziej ryzykowne niesprawdzone przekonanie: że restauracje premium tracą sprzedaż wina, bo goście nie wiedzą, co wybrać (A01). Założenie A06 („brak dobrej alternatywy”) podważają tropy: wg opisów producentów i katalogów istnieją co najmniej trzy produkty dla restauracji (nie sprawdzono w źródle).
- Coverage: 60 claims — 44 sourced (interview 0, data 0, document 37, product 7, benchmark 0), 0 synthetic, 16 assumed; 6 entries on the collection plan (przeliczone 2026-10-25; poprzednia wartość 44 nie obejmowała decyzji dopisanych po 2026-10-15)
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: Filip (product owner) pod wersją z 2026-10-15, z uchyleniem wymogu dowodów dla Problems i Target group (D09); odświeżenie z 2026-10-25 nie jest jeszcze przez niego przejrzane (Q09); ready for: implementation planning of the stated scope
- Sources: `.ai/specs/research/README.md`, `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md`, `.ai/specs/research/decisions/`, `.ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md`, `.ai/specs/implemented/2026-10-14-phase4-authentication.md`, `docs/PRODUCT_CONCEPT.md`, `docs/USER_ROLES.md`, `docs/USER_FLOWS.md`, `AGENTS.md`, `packages/app/src/app/(guest)/`, `packages/app/src/app/(admin)/`, `packages/core/src/engine/recommend.ts`, `packages/core/src/import/types.ts`, `docs/SCREEN_SPECIFICATION.md` (A1, kafelki sprzedaży)

## Decision summary

Bieżąca decyzja (D09, active, 2026-10-15): **domknąć technicznie zakres MVP i przygotować produkt do pilotażu**, przyjmując założenia biznesowe z koncepcji bez testu. Odświeżenie z 2026-10-25 prowadzi agent na polecenie właściciela (D19); wszystko, co agent dodaje, ma status `proposal` albo `[ASSUMPTION]`.
Problem — goście restauracji premium wybierają wino niepewnie albo wcale, a sommelier nie dociera do każdego stolika — opisuje tylko koncepcja zespołu; nikt z branży go jeszcze nie potwierdził, a w wynikach wyszukiwarki desk researchu nie znaleziono danych o udziale wina w rachunkach ani o roli kelnera w Polsce (Problems, A01).
Z zakresu MVP (D01) zbudowane są aplikacja gościa, panel sommeliera, import, publikacja i QR; zdarzenia użycia, import sprzedaży i kafelki Wine Attach Rate w panelu dochodzą w E02–E04 (Scope).
Najbardziej może zmienić decyzję: czy restauracje widzą utraconą sprzedaż wina jako problem wart subskrypcji (A01, A02), czy goście skanują QR przy stoliku (A03) i — nowe z tropów — czy istniejące produkty dla restauracji już robią to samo (A06, C04).
Czeka na Filipa (`proposal`): miara sukcesu pilotażu (D20), kryteria restauracji pilotażowej (D21) i kryteria zatrzymania (Kill criteria). Czego nie da się ustalić bez ludzi: kontakty do rozmów (Q01), baseline Wine Attach Rate z POS (C03), zgoda restauracji (C06). Gotowość do planowania implementacji E02–E05 opiera się na uchyleniu wymogu dowodów z D09, a nie na dowodach problemu (Definition of Ready addendum). Następny krok: backlog techniczny (`.ai/specs/backlog.md`) równolegle z szukaniem rozmówców; właściciel: Filip.

## Vision

Każdy gość restauracji dostaje do swojego dania wino z karty tej restauracji, dobrane głosem jej sommeliera, a restauracja sprzedaje więcej wina bez dodatkowego personelu — to kierunek zespołu, nie wykazana korzyść. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §2

## Target group and stakeholders

- Customer (pays): restauracja premium, grupa restauracyjna, hotel z restauracją — wybór zespołu. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §3
- User (uses): sommelier / Wine Director zarządza parowaniami przed serwisem — rola wybrana, nieobserwowana. `[DOCUMENT]` docs/USER_ROLES.md
- User (uses): gość przy stoliku, z telefonem, bez konta — rola wybrana, nieobserwowana. `[DOCUMENT]` docs/USER_ROLES.md
- User (uses): kelner korzysta z publicznego widoku `/r/{slug}/staff` bez logowania; obsługuje „cały stół” (D15). `[PRODUCT]` docs/USER_ROLES.md, packages/app/src/app/(guest)
- Value propositions (D13): restauracja — więcej sprzedanego wina, z dowodem; sommelier — jego program win dociera do gościa; kelner — łatwiej polecić i sprzedać; gość — nie musi znać się na winie, żeby dobrze wybrać; AI niewidzialne, sposób działania wyjaśniony (D14). `[DOCUMENT]` rozmowa z właścicielem 2026-10-16
- Stakeholders (decides, blocks, operates): właściciel lub GM decyduje o zakupie; sommelier decyduje, co widzi gość. `[DOCUMENT]` docs/USER_ROLES.md
- Domain expert z `SDLC.md`: propozycja agenta, że to sommelier; właściciel nie potwierdził (Q06). `[ASSUMPTION]` propozycja agenta
- Decider for scope decisions: Filip (product owner)

## Problems, with evidence

- Goście nie wiedzą, które wino wybrać, i zamawiają wodę albo „domowe czerwone” zamiast ryzykować. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1, brak obserwacji → A01
- Sommelier w sobotni wieczór nie obsłuży wszystkich stolików; większość gości z nim nie rozmawia. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A01
- Wiedza kelnerów o parowaniu jest nierówna, a rekomendacja zależy od tego, kto podszedł. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A04
- Restauracja nie wie, które pary działają ani ile sprzedaży wina ucieka. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A05

Żadna z tych obserwacji nie ma źródła poza koncepcją zespołu; częstotliwość i koszt są nieznane. Desk research (2026-10-25) nie dostarczył obserwacji problemu: w wynikach nie było danych o udziale wina w rachunkach restauracji w Polsce ani o wpływie kelnera na wybór (tropy: `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md` §5).

## Product and how it stands out

- What it is: cyfrowa warstwa programu winnego restauracji — gość skanuje QR, wybiera danie i dostaje 2–4 wina z karty z oceną dopasowania i uzasadnieniem; sommelier zatwierdza parowania w panelu. `[PRODUCT]` packages/app/src/app/(guest)/r/[slug]/, packages/app/src/app/(admin)/admin/[slug]/pairings/
- What makes it different: rekomendacje tylko z karty restauracji, ostatnie słowo sommeliera, bez „AI” w interfejsie i bez kupowanych pozycji — to wybór zespołu; przewaga nad alternatywami jest niesprawdzona (A06). `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §2, §5, §8

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

Benchmark odłożony: żaden produkt nie został sprawdzony w źródle (Collection plan C04). Tropy z 2026-10-25 (z wyników wyszukiwarki, strony nieotwarte, opisy producentów i katalogów, bez wpisu do tabeli i poza Coverage): produkty dla restauracji BinWise (zapas wina, cyfrowa karta, integracje z POS), SOMM'IT (Francja, karta win aktualizowana ze sprzedaży) i CorkGuru (aplikacja gościa, karta na iPadzie, zapas); starsze Tipsi i Tastevin z parowaniem; konsumenckie aplikacje dla gości (Wine Picker, Value Vine) z subskrypcją 2,99–9,99 USD miesięcznie. Szczegóły i ograniczenia: `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md` §3.

## Goals and success criteria

- Business goal: więcej sprzedanego wina w restauracji klienta, mierzone jako Wine Attach Rate (rachunki z jedzeniem i winem / rachunki z jedzeniem — doprecyzowanie Q7 E03) przed i po wdrożeniu. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §6, D01
- User outcome: gość w trzech dotknięciach od zeskanowania kodu widzi wina pasujące do dania, z ceną i uzasadnieniem. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.4
- Primary metric, baseline today, threshold, date: Wine Attach Rate; baseline nieznany (brak danych POS); próg i termin: propozycja D20 (`proposal`, do potwierdzenia przez Filipa), wielkość wzrostu nieustalona do poznania baseline (Q02).
- What must not get worse: zaufanie gościa — rekomendacje nie są sprzedawane (N01).

## Scope

- **Now:** domknąć niezbudowaną część D01 i przygotować pilotaż (D09): (1) zdarzenia użycia gościa i kelnera zapisywane bez JavaScriptu i bez ciasteczek (R05, `packages/app/AGENTS.md`); (2) import sprzedaży z eksportu POS (CSV) i Wine Attach Rate (D04); (3) dashboard KPI w panelu; (4) wdrożenie produkcyjne i założenie restauracji bez danych demo (Q08). Badania z Collection plan biegną równolegle.
- **Later:** widok kelnera z logowaniem PIN, plany subskrypcji (D07), edycja profili smakowych dań i win w panelu, historia publikacji i przywracanie wersji, panel administratora systemu, OCR skanów PDF, przekierowanie po zmianie sluga, eksport analityki do CSV.
- **Not doing:** see Non-goals

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Pairing | para danie–wino z oceną silnika i decyzją sommeliera (suggested / approved / modified / rejected) | sommelier | panel; gość widzi tylko opublikowane |
| Match Score | wynik silnika 0–99 dla pary, zawsze surowy | silnik (`ENGINE_VERSION`) | gość, panel |
| Sommelier’s pairing / Para sommeliera | etykieta pary zatwierdzonej przez sommeliera (approved / modified); do 2026-10-16 „Sommelier recommendation” (R06, D13) | sommelier | gość, kelner, panel |
| Recommended for your dish / Polecane do Twojego dania | nagłówek najlepszej propozycji silnika (bez pieczęci) | silnik | gość, panel |
| Wine Attach Rate | rachunki z jedzeniem i winem / rachunki z jedzeniem w okresie (per rachunek, nie per gość; rachunki barowe poza wskaźnikiem; zwrot znosi sprzedaż — doprecyzowanie Q7 E03, 2026-10-15) | właściciel / GM | panel: A13 (okres, E03 F2), A1 (E04) |
| Publikacja | migawka parowań i kart, którą widzą goście | sommelier, GM | gość |

## Key flows

- Current state: nieobserwowany — nie wiemy, jak dziś goście wybierają wino ani jak sommelier i kelnerzy doradzają (C01, C02).
- Future state (zbudowane): gość — QR → restauracja → danie → wina → filtry → wybór pokazany kelnerowi. `[PRODUCT]` packages/app/src/app/(guest)/r/[slug]/ (menu, dish, wine, selected)
- Future state (zbudowane): sommelier — logowanie → menu → danie → propozycje silnika → decyzja → publikacja. `[PRODUCT]` packages/app/src/app/(admin)/admin/[slug]/ (pairings, publish)
- Future state (zbudowane poza utworzeniem restauracji, które wymaga dziś `npm run user:create` / seeda, bo panelu administratora nie ma): import menu i karty win → przegląd → propozycje → przegląd sommeliera → publikacja → QR. `[DOCUMENT]` docs/USER_FLOWS.md §4, docs/USER_ROLES.md

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Etykieta „Sommelier recommendation” tylko przy parach approved lub modified. | widoki gościa i kelnera | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.1, AGENTS.md §7 | superseded (R06) | unknown | Domain expert (sommelier) + product owner | Filip | none |
| R02 | Match Score to zawsze surowy wynik silnika; decyzja sommeliera zmienia kolejność, nie liczbę. | silnik, widoki gościa | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.2 | active | unknown | Domain expert + product owner | Filip | none |
| R03 | Gość widzi tylko opublikowaną migawkę, nigdy wersję roboczą. | widoki gościa | `[DOCUMENT]` AGENTS.md §1.3 | active | unknown | product owner | Filip | none |
| R04 | Rekomendacje tylko z aktywnych win karty tej restauracji. | silnik | `[PRODUCT]` packages/core/src/engine/recommend.ts | active | unknown | Domain expert + product owner | Filip | none |
| R05 | Gość nie zakłada konta i nie płaci. | aplikacja gościa | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §3 | active | unknown | product owner | Filip | none |
| R06 | Etykieta „Para sommeliera” / „Sommelier’s pairing” tylko przy parach approved lub modified (znaczenie R01 bez zmian, nowe brzmienie według D13). | widoki gościa i kelnera, panel | `[DOCUMENT]` .ai/specs/2026-10-16-how-it-works-explanations.md Q1 (zatwierdzone przez Filipa 2026-10-16), AGENTS.md §7 | active | unknown | Domain expert (sommelier) + product owner | Filip | R01 |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Płatnych pozycji w rekomendacjach dla importerów lub producentów | zaufanie gościa | Filip | active | unknown | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §5 „Zasada zaufania” | none |
| N02 | Pozycjonowania jako „AI Sommelier” i słowa „AI” w interfejsie gościa | głos restauracji, nie technologii | Filip | active | unknown | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.5 | none |
| N03 | Płatnych API LLM przy każdym zapytaniu | zero kosztu per zapytanie, determinizm | Filip | active | unknown | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.3 | none |
| N04 | Integracji z POS i e-menu, magazynu, prognoz, pricing intelligence, marketplace i profili gości w MVP | poza zakresem MVP | Filip | active | unknown | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-10-14 | Zakres MVP: aplikacja gościa, panel sommeliera z dashboardem KPI, import, publikacja, QR, analityka użycia i opcjonalny import sprzedaży z CSV, deterministyczny silnik | brief właściciela zatwierdzony jako zakres prac | Filip | active | unknown | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md | none |
| D02 | 2026-10-14 | Model B2B2C: płaci restauracja (subskrypcja per lokal), gość korzysta za darmo | koncepcja produktu | Filip | active | unknown | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §3, §5 | none |
| D03 | 2026-10-14 | Kelner bez logowania, przez publiczny widok `/r/{slug}/staff` | zapisane w specyfikacji fazy 4 bez uzasadnienia | Filip | active | unknown | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-14-phase4-authentication.md | none |
| D04 | 2026-10-14 | North Star: Wine Attach Rate z eksportu POS | mierzy cel biznesowy klienta | Filip | active | unknown | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §6 | none |
| D05 | 2026-10-14 | Restauracja demo Halka jako dane pokazowe | pokaz bez prawdziwego klienta | Filip | active | unknown | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md | none |
| D06 | 2026-10-14 | Interfejs po angielsku | zgodnie z briefem | Filip | superseded | unknown | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md „Realizacja” | none |
| D07 | 2026-10-14 | Plany Essential 390 zł, Professional 790 zł, Group — wycena | ceny orientacyjne „do walidacji z pierwszymi klientami” | Filip | proposal | po C05 | product owner | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §5 | none |
| D08 | 2026-10-15 | Wstrzymać nowe funkcje do czasu badań i pilotażu; Now = Collection plan | brak dowodów problemu i pomiaru; rekomendacja agenta, niepotwierdzona | pending (Filip) | superseded | — | product owner | `[ASSUMPTION]` rekomendacja agenta w tym briefie | none |
| D09 | 2026-10-15 | Domknąć technicznie zakres MVP (D01) i przygotować pilotaż na przyjętych, niesprawdzonych założeniach A01–A06 | właściciel potrzebuje backlogu technicznego; przyjmuje ryzyko założeń | Filip | active | po wynikach #3–#9 lub pilotażu | product owner | `[DOCUMENT]` .ai/specs/research/decisions/2026-10-15-d09-build-on-accepted-assumptions.md | D08 |
| D10 | 2026-10-15 | Hosting pilota: obraz OCI niezależny od dostawcy, referencyjnie jedna VM w UE z Docker Compose i PostgreSQL 16; `PUBLIC_BASE_URL` w produkcji tylko https z hostem publicznym | rekomendacja ze spec wdrożenia przyjęta przez właściciela | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/2026-10-15-production-deployment.md (Q2, Q6) | none |
| D11 | 2026-10-15 | Interfejs PL i EN; język z przeglądarki, przełącznik; supersedes D06 | pierwsze restauracje i goście są w Polsce (Q04); prośba właściciela | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-15-polish-language.md | D06 |
| D12 | 2026-10-15 | Treści restauracji PL i EN (dania, wina, notatki sommeliera, hasło, miasto); przełącznik „Polski / English” na górze; API bez zmian | po polsku gość widział „Duck breast”; prośba właściciela („wszystkie treści przetłumaczone”) | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-15-bilingual-content.md | D11 |
| D13 | 2026-10-16 | Pozycjonowanie B2B2C: płaci restauracja (więcej sprzedanego wina), championem jest sommelier (jego program win dociera do gościa), użytkownicy to gość (nie musi znać się na winie, żeby dobrze wybrać), kelner (łatwiej mu polecić i sprzedać) i sommelier; AI jest niewidzialne — gość widzi „Polecane do Twojego dania” albo „Para sommeliera”, nigdy „AI” | spójny produkt: restauracja ma ROI, sommelier zostaje autorytetem, kelnerowi łatwiej sprzedać, gość dostaje wartość w chwili wyboru | Filip | active | po pilotażu | product owner | `[DOCUMENT]` rozmowa z właścicielem 2026-10-16 | none |
| D14 | 2026-10-16 | Sposób działania jest wyjaśniony w MVP: krótkie treści „Jak to działa” i ikona „i” (rozwijana bez JavaScriptu) na każdym ekranie, który pokazuje wynik silnika — u gościa, kelnera i sommeliera; bez słowa „AI” (N02) | zaufanie do rekomendacji wymaga zrozumienia, skąd się bierze; prośba właściciela | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/2026-10-16-how-it-works-explanations.md | none |
| D15 | 2026-10-16 | Funkcja wyróżniająca: „Cały stół” — jedna butelka do kilku różnych dań, z uczciwym „pasuje do 3 z 4, do halibuta słabiej”; dochodzi ścieżka kelnera (kelner wybiera dania stołu na swoim telefonie) | przy stoliku na kilka osób QR zwykle skanuje nikt albo jedna osoba; kelner jest w tej chwili przy stole | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md | none |
| D16 | 2026-10-16 | Kod polecenia przy rekomendacji (np. „W7K”) łączy sprzedane wino z rekomendacją bez integracji z POS: kelner zaznacza kod w widoku personelu albo wpisuje go do kasy, a import sprzedaży (E03) dopasowuje go później | dowód zysku dla restauracji bez spięcia z POS, którego nie ma w MVP (N04) | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/2026-10-16-recommendation-code.md | none |
| D17 | 2026-10-16 | Okazje w panelu sommeliera („zobacz tutaj”, nie „ja wiem lepiej”): sommelier zatwierdza albo ignoruje. W MVP tylko sygnały bez POS — z karty, z silnika, ze zdarzeń użycia (E02) i kodów polecenia (D16); sygnały sprzedaży z eksportu POS dopiero po E03, integracja z POS nadal poza MVP (N04) | właściciel nie wie, czy spięcie z POS jest możliwe w MVP | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/2026-10-16-sommelier-opportunities.md | none |
| D18 | 2026-10-16 | Dane sprzedaży i użycia każdej restauracji zostają w jej zakresie; nie budujemy uczenia ani benchmarków między restauracjami. Wspólny katalog win od importerów odłożony (E06) | wcześni klienci nie mają z tego korzyści, a ich dane to ich dane; katalog wymaga pracy handlowej z importerami | Filip | active | przy 20–30 lokalach | product owner | `[DOCUMENT]` rozmowa z właścicielem 2026-10-16 | none |
| D19 | 2026-10-25 | Odświeżenie discovery prowadzi agent: desk research i jawne założenia zamiast odpowiedzi właściciela; propozycje agenta mają status `proposal` do potwierdzenia | właściciel nie ma dziś dostępu do rozmówców i poprosił o samodzielne odświeżenie | Filip | active | po pierwszej rozmowie z C01 | product owner | `[DOCUMENT]` .ai/specs/research/decisions/2026-10-25-d19-agent-led-discovery-refresh.md | none |
| D20 | 2026-10-25 | Miara sukcesu pilotażu: Wine Attach Rate z eksportu POS, baseline z 28 dni historii przed uruchomieniem i okno 28 dni po; wynik czytany tylko przy co najmniej 30 rachunkach z jedzeniem w obu oknach (próg kafelka w panelu); wielkość oczekiwanego wzrostu nieustalona do poznania baseline, +5 pp z koncepcji to założenie A05, nie cel | okno 4 tygodni przed i po wynika z koncepcji (§6), a próg próby z kafelka w panelu (A1: 28 dni, „Too few to compare” poniżej 30 rachunków); panel nie ma stałego baseline'u pilota („Wykresy i stały baseline pilota — później”), więc baseline trzeba odczytać z okna poprzedzającego albo z eksportu C03; pilotaż bez progu nie ma wyniku do odczytania | Filip | proposal | po poznaniu baseline (C03) | product owner | `[PRODUCT]` docs/SCREEN_SPECIFICATION.md (A1, kafelki sprzedaży), docs/PRODUCT_CONCEPT.md §6, `[ASSUMPTION]` propozycja agenta | none |
| D21 | 2026-10-25 | Kryteria restauracji pilotażowej (segment, nie nazwiska): restauracja premium w Polsce (D11) z sommelierem lub Wine Directorem, kartą win z cenami, POS dającym eksport CSV z datą, numerem rachunku, kategorią pozycji, ilością i kwotą netto, zgodą na eksport sprzedaży i na kody QR przy stolikach | wymagane pola importu sprzedaży (E03) i zakres produktu; bez eksportu nie ma pomiaru A05 | Filip | proposal | po C06 | product owner | `[PRODUCT]` packages/core/src/import/types.ts (`SALES_REQUIRED_FIELDS`), `[ASSUMPTION]` propozycja agenta | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Restauracje premium tracą sprzedaż wina, bo goście nie wiedzą, co wybrać, a sommelier nie dociera do stolików `[ASSUMPTION]` koncepcja zespołu | high | brak; tylko docs/PRODUCT_CONCEPT.md §1 | produkt rozwiązuje nieistniejący problem | rozmowy z sommelierami i GM o ostatnim serwisie (C01) | Filip | unknown | accepted untested (D09) |
| A02 | Restauracja zapłaci subskrypcję rzędu 390–790 zł miesięcznie `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §5 | high | brak dowodu chęci zapłaty; trop: cennik innego produktu (QR menu z zamawianiem) 169–499 zł miesięcznie za lokal, strona nieotwarta (desk research §4) | model przychodu nie działa | rozmowy z właścicielami o obecnych wydatkach i procesie zakupu (C05) | Filip | unknown | accepted untested (D09) |
| A03 | Goście skanują QR i używają aplikacji przy stoliku `[ASSUMPTION]` | high | brak | nikt nie zobaczy rekomendacji | obserwacja w pilotażu (C06) | Filip | unknown | accepted untested (D09) |
| A04 | Sommelier znajdzie czas na przegląd propozycji silnika `[ASSUMPTION]` | medium | brak | parowania zostaną niezatwierdzone | rozmowy z sommelierami (C01) | Filip | unknown | accepted untested (D09) |
| A05 | Wine Match podnosi Wine Attach Rate (rachunek w koncepcji zakłada +5 pp i +10 zł na gościa) `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §5 | high | brak; trop: anegdotyczne wzrosty (do 20% napojów, 11% wina pierwszego dnia) przy kartach win na tabletach, w streszczeniu nie podano grupy kontrolnej ani okresu pomiaru; nie wspierają ani nie obalają (desk research §1) | brak uzasadnienia ceny | baseline z POS (C03), potem pomiar w pilotażu | Filip | unknown | accepted untested (D09) |
| A06 | Brak dobrej alternatywy dla restauracji (karty cyfrowe, aplikacje parujące) `[ASSUMPTION]` | medium | trop: wg opisów producentów i katalogów co najmniej trzy produkty dla restauracji (BinWise, SOMM'IT, CorkGuru), strony nieotwarte; żaden z tropów nie opisuje rekomendacji do dania z karty restauracji; czy któryś robi to samo i czy działa w Polsce, nieznane (desk research §3) | trudniej o wyróżnik | otworzyć strony produktów i wypełnić benchmark (C04) | Filip | unknown | podważone przez tropy, niesprawdzone w źródle |

## Kill criteria

Propozycja agenta (D19), status `proposal` do decyzji Filipa. Wynik ma być obserwacją, nie deklaracją; żadna liczba poniżej nie pochodzi z danych.

- K01: jeśli w rozmowach C01 i C05 sommelierzy i GM z segmentu (D21) nie opisują utraty sprzedaży wina ani braku rekomendacji przy stoliku jako problemu, na który wydają albo chcą wydawać pieniądze — zatrzymaj albo zmień segment. `[ASSUMPTION]` propozycja agenta, testuje A01 i A02
- K02: jeśli żadna restauracja z C01 lub C05 nie zgodzi się na pilotaż z eksportem POS (C06) — nie ma jak zmierzyć A05; zmień sposób pomiaru (kody polecenia, D16) albo segment. `[ASSUMPTION]` propozycja agenta, testuje A05
- K03: jeśli w pilotażu Wine Attach Rate nie rośnie względem baseline przy próbie z D20 — A05 jest podważone; wróć do wartości dla restauracji i do wyceny (D07). Jaka zmiana liczy się jako „nie rośnie” przy jednej restauracji, rozstrzyga właściciel po poznaniu baseline (Q11). `[ASSUMPTION]` propozycja agenta, testuje A05
- K04: jeśli po oknie pilotażu zdarzenia użycia gości (E02) pokazują, że goście prawie nie skanują kodu, A03 jest niepotwierdzone dla tej restauracji; co znaczy „prawie” i w jakim okresie, rozstrzyga właściciel (Q10), bo próg 30 z D20 liczy rachunki, nie sesje. `[ASSUMPTION]` propozycja agenta, testuje A03

## Hypotheses to test

Brak — nie przeprowadzono symulacji `om-synthetic-users`.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Którzy właściciele, GM i sommelierzy są dostępni do rozmów? Desk research nie może wskazać osób; kryteria segmentu: D21 (`proposal`) | yes — blokuje C01, C05 | product owner | open |
| Q02 | Jaki próg Wine Attach Rate i w jakim czasie uznamy za sukces pilotażu? Propozycja miary i okna: D20; wielkość wzrostu zależy od baseline (C03) | yes — blokuje plan pilotażu (C06) | product owner | proposal D20, czeka na potwierdzenie |
| Q03 | Czy pilotażowa restauracja może wyeksportować dane sprzedaży z POS (pola wymagane przez import: data, numer rachunku, kategoria, ilość, kwota netto)? | yes — blokuje C03 | GM restauracji | open |
| Q04 | Czy interfejs gościa ma być też po polsku? | no | product owner | closed — D11 |
| Q05 | Czy przed pilotażem budujemy pomiar (zdarzenia użycia, import sprzedaży z CSV)? | no | product owner | closed — tak, D09 |
| Q06 | Kto jest Domain expertem (sommelier) zatwierdzającym R06 (dawniej R01), R02, R04? | no — reguły obowiązują, brak tylko właściciela zmian | product owner | open |
| Q07 | Czy Filip akceptuje decyzje fazy 5 (import i QR), oznaczone „Do przeglądu”? | no | product owner | open |
| Q08 | Gdzie działa instancja dla pilota i jaki jest `PUBLIC_BASE_URL` przed drukiem kodów QR? | no | product owner / maintainer | closed — D10 (konkretny adres ustala maintainer przy wdrożeniu) |
| Q09 | Czy uchylenie wymogu dowodów z D09 (2026-10-15) nadal obejmuje zakres Now w tej odświeżonej wersji, której Filip jeszcze nie przejrzał? | no — zakres Now idzie dalej na podstawie D09 | product owner | open |
| Q10 | Jaka obserwacja ze zdarzeń użycia (E02) i w jakim okresie uznaje, że goście nie skanują QR (K04)? | no | product owner | open |
| Q11 | Jaka zmiana Wine Attach Rate po poznaniu baseline (C03) oznacza, że A05 jest podważone przy jednej restauracji pilotażowej (K03)? | no — blokuje odczyt wyniku pilotażu | product owner | open |
| Q12 | Do kiedy mają się odbyć rozmowy C01 i C05, ilu rozmówców wystarczy, by K01 uznać za rozstrzygnięte, i co dzieje się ze zbudowaną pracą E02–E05, gdy K01 lub K02 zadziałają? Oraz: czy pilotaż bez eksportu POS (pomiar przez kody D16) jest dopuszczalny i czy segment Essential zostaje poza pilotażem (D21)? | no — nie blokuje Now, blokuje decyzję go/no-go | product owner | open |

## Definition of Ready addendum (existing + own)

Problems i Target group nadal opierają się wyłącznie na `[ASSUMPTION]`; desk research z 2026-10-25 (tropy bez otwartych źródeł) tego nie zmienia. Product owner uchylił wymóg dowodów dla zakresu Now (D09, `SDLC.md`: „A maintainer may waive an item”), więc zadania implementacyjne E02–E05 są gotowe do specyfikacji; przyjęcie ryzyka nie zmienia statusu założeń A01–A06. Dotknięte powierzchnie (`BACKWARD_COMPATIBILITY.md`): schemat bazy (nowe tabele sprzedaży, zapisy do `guest_interaction`), `/api/v1` (nowe trasy analityki i importu sprzedaży), adresy gościa (ewentualny parametr sesji w URL — tylko dodany, istniejące adresy działają dalej). Konflikt do rozstrzygnięcia w specyfikacji E02: `docs/SCREEN_SPECIFICATION.md` trzyma `sessionId` w sessionStorage, a `packages/app/AGENTS.md` wymaga działania bez JavaScriptu i bez pamięci przeglądarki.

## Collection plan

### C01 — Jak dziś wygląda dobór wina w restauracji premium i gdzie ucieka sprzedaż?

- What decision or work needs it: A01, A04; czy kontynuować (D08)
- Who can answer it: sommelierzy / Wine Directorzy i GM restauracji premium
- How: rozmowa o ostatnim serwisie: kto doradzał przy winie, ilu gości zapytało, co zamówili stoliki bez porady
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### C02 — Jak gość wybiera wino do dania, gdy nikt nie doradza?

- What decision or work needs it: A01, A03; ścieżka gościa
- Who can answer it: goście restauracji, kelnerzy
- How: rozmowa o ostatniej wizycie w restauracji: jak wybrali wino albo dlaczego nie zamówili
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### C03 — Jaki jest dziś Wine Attach Rate w potencjalnej restauracji pilotażowej?

- What decision or work needs it: A05, D04, Q02
- Who can answer it: GM restauracji pilotażowej
- How: eksport z POS za ostatnie 28 dni z polami wymaganymi przez import sprzedaży (data, numer rachunku, kategoria pozycji, ilość, kwota netto; D21), bez danych osobowych
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/data-request.md`

### C04 — Jakie rozwiązania restauracje znają lub już mają?

- What decision or work needs it: A06, wyróżnik produktu
- Who can answer it: zespół (sprawdzenie w źródle) i rozmówcy z C01
- How: otworzyć strony produktów z tropów (BinWise, SOMM'IT, CorkGuru; `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md` §3) i wypełnić szablon benchmarku z datą; sprawdzić, czy któryś robi rekomendację do dania z karty restauracji i czy działa w Polsce
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/benchmark-check.md`

### C05 — Ile i jak restauracje płacą za podobne narzędzia?

- What decision or work needs it: A02, D07
- Who can answer it: właściciele i GM
- How: rozmowa o ostatnim zakupie narzędzia dla sali lub kuchni: kto decydował, ile kosztowało, co przekonało; punkt odniesienia z tropów: cennik QR menu 169–499 zł miesięcznie za lokal (desk research §4)
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### C06 — Która restauracja przeprowadzi pilotaż i na jakich warunkach?

- What decision or work needs it: A03, A05, Q02, Q03
- Who can answer it: właściciel / GM restauracji z C01 lub C05
- How: rozmowa o pilotażu: karta win, dostęp do POS, zgoda sommeliera, okres
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/decision-record.md`
