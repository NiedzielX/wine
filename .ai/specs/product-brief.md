# Wine Match — product brief

- Date: 2026-10-15
- Mode: existing (produkt zbudowany, bez prawdziwych użytkowników), z kontrolami trybu `own`; Owner: Filip (product owner); Pass: full, prowadzony przez agenta bez rozmowy — decyzje spoza zatwierdzonych specyfikacji mają status `proposal`
- Evidence basis: tylko dokumenty zespołu (brief MVP zatwierdzony przez Filipa 2026-10-14; decyzje fazy 5 — import i QR — czekają na jego przegląd) oraz działający kod. Brak wywiadów, danych sprzedaży, benchmarku i pilotażowej restauracji. Najbardziej ryzykowne niesprawdzone przekonanie: że restauracje premium tracą sprzedaż wina, bo goście nie wiedzą, co wybrać (A01).
- Coverage: 43 claims — 32 sourced (interview 0, data 0, document 27, product 5, benchmark 0), 0 synthetic, 11 assumed; 6 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: Filip (product owner), z uchyleniem wymogu dowodów dla Problems i Target group (D09); ready for: implementation planning of the stated scope
- Sources: `.ai/specs/research/README.md`, `.ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md`, `.ai/specs/implemented/2026-10-14-phase4-authentication.md`, `docs/PRODUCT_CONCEPT.md`, `docs/USER_ROLES.md`, `docs/USER_FLOWS.md`, `AGENTS.md`, `packages/app/src/app/(guest)/`, `packages/app/src/app/(admin)/`, `packages/core/src/engine/recommend.ts`

## Decision summary

Bieżąca decyzja (D09, active, 2026-10-15): **domknąć technicznie zakres MVP i przygotować produkt do pilotażu**, przyjmując założenia biznesowe z koncepcji bez testu. Badania (#3–#9) biegną równolegle.
Problem — goście restauracji premium wybierają wino niepewnie albo wcale, a sommelier nie dociera do każdego stolika — opisuje tylko koncepcja zespołu; nikt z branży go jeszcze nie potwierdził (Problems, A01).
Z zakresu MVP zatwierdzonego przez Filipa (D01) zbudowane są aplikacja gościa, panel sommeliera, import, publikacja i QR. Niezbudowane: analityka użycia, import sprzedaży i dashboard KPI — panel pokazuje „Nothing has been recorded yet”, więc North Star (Wine Attach Rate) jest dziś niemierzalny, a pilotaż nie ma czym zmierzyć wyniku (Q05).
Najbardziej może zmienić decyzję to, czy restauracje widzą utraconą sprzedaż wina jako problem wart subskrypcji (A01, A02) i czy goście w ogóle skanują QR przy stoliku (A03).
Następny krok: backlog techniczny (E02–E05 w `.ai/specs/backlog.md`): pomiar użycia, import sprzedaży i Wine Attach Rate, dashboard KPI, wdrożenie i zakładanie restauracji. Właściciel: Filip.

## Vision

Każdy gość restauracji dostaje do swojego dania wino z karty tej restauracji, dobrane głosem jej sommeliera, a restauracja sprzedaje więcej wina bez dodatkowego personelu — to kierunek zespołu, nie wykazana korzyść. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §2

## Target group and stakeholders

- Customer (pays): restauracja premium, grupa restauracyjna, hotel z restauracją — wybór zespołu. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §3
- User (uses): sommelier / Wine Director zarządza parowaniami przed serwisem — rola wybrana, nieobserwowana. `[DOCUMENT]` docs/USER_ROLES.md
- User (uses): gość przy stoliku, z telefonem, bez konta — rola wybrana, nieobserwowana. `[DOCUMENT]` docs/USER_ROLES.md
- User (uses): kelner korzysta z publicznego widoku `/r/{slug}/staff` bez logowania. `[PRODUCT]` docs/USER_ROLES.md, packages/app/src/app/(guest)
- Stakeholders (decides, blocks, operates): właściciel lub GM decyduje o zakupie; sommelier decyduje, co widzi gość; propozycja agenta: sommelier jako Domain expert z `SDLC.md` (Q06). `[DOCUMENT]` docs/USER_ROLES.md
- Decider for scope decisions: Filip (product owner)

## Problems, with evidence

- Goście nie wiedzą, które wino wybrać, i zamawiają wodę albo „domowe czerwone” zamiast ryzykować. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1, brak obserwacji → A01
- Sommelier w sobotni wieczór nie obsłuży wszystkich stolików; większość gości z nim nie rozmawia. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A01
- Wiedza kelnerów o parowaniu jest nierówna, a rekomendacja zależy od tego, kto podszedł. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A04
- Restauracja nie wie, które pary działają ani ile sprzedaży wina ucieka. `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §1 → A05

Żadna z tych obserwacji nie ma źródła poza koncepcją zespołu; częstotliwość i koszt są nieznane.

## Product and how it stands out

- What it is: cyfrowa warstwa programu winnego restauracji — gość skanuje QR, wybiera danie i dostaje 2–4 wina z karty z oceną dopasowania i uzasadnieniem; sommelier zatwierdza parowania w panelu. `[PRODUCT]` packages/app/src/app/(guest)/r/[slug]/, packages/app/src/app/(admin)/admin/[slug]/pairings/
- What makes it different: rekomendacje tylko z karty restauracji, ostatnie słowo sommeliera, bez „AI” w interfejsie i bez kupowanych pozycji — to wybór zespołu; przewaga nad alternatywami jest niesprawdzona (A06). `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §2, §5, §8

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

Benchmark odłożony: żaden produkt nie został sprawdzony w źródle (Collection plan C04).

## Goals and success criteria

- Business goal: więcej sprzedanego wina w restauracji klienta, mierzone jako Wine Attach Rate (zamówienia z winem / zamówienia z jedzeniem) przed i po wdrożeniu. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §6, D01
- User outcome: gość w trzech dotknięciach od zeskanowania kodu widzi wina pasujące do dania, z ceną i uzasadnieniem. `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.4
- Primary metric, baseline today, threshold, date: Wine Attach Rate; baseline nieznany (brak danych POS); próg i termin niewybrane (Q02).
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
| Sommelier recommendation | etykieta pary zatwierdzonej przez sommeliera | sommelier | gość |
| Wine Attach Rate | zamówienia z co najmniej jednym winem / zamówienia z jedzeniem w okresie | właściciel / GM | panel (Later) |
| Publikacja | migawka parowań i kart, którą widzą goście | sommelier, GM | gość |

## Key flows

- Current state: nieobserwowany — nie wiemy, jak dziś goście wybierają wino ani jak sommelier i kelnerzy doradzają (C01, C02).
- Future state (zbudowane): gość — QR → restauracja → danie → wina → filtry → wybór pokazany kelnerowi. `[PRODUCT]` packages/app/src/app/(guest)/r/[slug]/ (menu, dish, wine, selected)
- Future state (zbudowane): sommelier — logowanie → menu → danie → propozycje silnika → decyzja → publikacja. `[PRODUCT]` packages/app/src/app/(admin)/admin/[slug]/ (pairings, publish)
- Future state (zbudowane poza utworzeniem restauracji, które wymaga dziś `npm run user:create` / seeda, bo panelu administratora nie ma): import menu i karty win → przegląd → propozycje → przegląd sommeliera → publikacja → QR. `[DOCUMENT]` docs/USER_FLOWS.md §4, docs/USER_ROLES.md

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Etykieta „Sommelier recommendation” tylko przy parach approved lub modified. | widoki gościa i kelnera | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.1, AGENTS.md §7 | active | unknown | Domain expert (sommelier) + product owner | Filip | none |
| R02 | Match Score to zawsze surowy wynik silnika; decyzja sommeliera zmienia kolejność, nie liczbę. | silnik, widoki gościa | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §8 p.2 | active | unknown | Domain expert + product owner | Filip | none |
| R03 | Gość widzi tylko opublikowaną migawkę, nigdy wersję roboczą. | widoki gościa | `[DOCUMENT]` AGENTS.md §1.3 | active | unknown | product owner | Filip | none |
| R04 | Rekomendacje tylko z aktywnych win karty tej restauracji. | silnik | `[PRODUCT]` packages/core/src/engine/recommend.ts | active | unknown | Domain expert + product owner | Filip | none |
| R05 | Gość nie zakłada konta i nie płaci. | aplikacja gościa | `[DOCUMENT]` docs/PRODUCT_CONCEPT.md §3 | active | unknown | product owner | Filip | none |

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
| D11 | 2026-10-15 | Interfejs PL i EN; język z przeglądarki, przełącznik; supersedes D06 | pierwsze restauracje i goście są w Polsce (Q04); prośba właściciela | Filip | active | po pilotażu | product owner | `[DOCUMENT]` .ai/specs/2026-10-15-polish-language.md | D06 |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | Restauracje premium tracą sprzedaż wina, bo goście nie wiedzą, co wybrać, a sommelier nie dociera do stolików `[ASSUMPTION]` koncepcja zespołu | high | brak; tylko docs/PRODUCT_CONCEPT.md §1 | produkt rozwiązuje nieistniejący problem | rozmowy z sommelierami i GM o ostatnim serwisie (C01) | Filip | unknown | accepted untested (D09) |
| A02 | Restauracja zapłaci subskrypcję rzędu 390–790 zł miesięcznie `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §5 | high | brak | model przychodu nie działa | rozmowy z właścicielami o obecnych wydatkach i procesie zakupu (C05) | Filip | unknown | accepted untested (D09) |
| A03 | Goście skanują QR i używają aplikacji przy stoliku `[ASSUMPTION]` | high | brak | nikt nie zobaczy rekomendacji | obserwacja w pilotażu (C06) | Filip | unknown | accepted untested (D09) |
| A04 | Sommelier znajdzie czas na przegląd propozycji silnika `[ASSUMPTION]` | medium | brak | parowania zostaną niezatwierdzone | rozmowy z sommelierami (C01) | Filip | unknown | accepted untested (D09) |
| A05 | Wine Match podnosi Wine Attach Rate (rachunek w koncepcji zakłada +5 pp i +10 zł na gościa) `[ASSUMPTION]` docs/PRODUCT_CONCEPT.md §5 | high | brak | brak uzasadnienia ceny | baseline z POS (C03), potem pomiar w pilotażu | Filip | unknown | accepted untested (D09) |
| A06 | Brak dobrej alternatywy dla restauracji (karty cyfrowe, aplikacje parujące) `[ASSUMPTION]` | medium | brak benchmarku | trudniej o wyróżnik | benchmark (C04) | Filip | unknown | accepted untested (D09) |

## Kill criteria

Nieustalone. Do decyzji Filipa przed pilotażem: jaki wynik rozmów (C01, C05) zatrzymuje projekt albo zmienia segment. Wynik ma być obserwacją (np. restauracje nie widzą problemu, żadna nie chce pilotażu), nie deklaracją.

## Hypotheses to test

Brak — nie przeprowadzono symulacji `om-synthetic-users`.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Którzy właściciele, GM i sommelierzy są dostępni do rozmów? | yes — blokuje C01, C05 | product owner | open |
| Q02 | Jaki próg Wine Attach Rate i w jakim czasie uznamy za sukces pilotażu? | yes — blokuje plan pilotażu (C06) | product owner | open |
| Q03 | Czy pilotażowa restauracja może wyeksportować dane sprzedaży z POS? | yes — blokuje C03 | GM restauracji | open |
| Q04 | Czy interfejs gościa ma być też po polsku? | no | product owner | closed — D11 |
| Q05 | Czy przed pilotażem budujemy pomiar (zdarzenia użycia, import sprzedaży z CSV)? | no | product owner | closed — tak, D09 |
| Q06 | Kto jest Domain expertem (sommelier) zatwierdzającym R01, R02, R04? | no — reguły obowiązują, brak tylko właściciela zmian | product owner | open |
| Q07 | Czy Filip akceptuje decyzje fazy 5 (import i QR), oznaczone „Do przeglądu”? | no | product owner | open |
| Q08 | Gdzie działa instancja dla pilota i jaki jest `PUBLIC_BASE_URL` przed drukiem kodów QR? | no | product owner / maintainer | closed — D10 (konkretny adres ustala maintainer przy wdrożeniu) |

## Definition of Ready addendum (existing + own)

Problems i Target group nadal opierają się wyłącznie na `[ASSUMPTION]`. Product owner uchylił wymóg dowodów dla zakresu Now (D09, `SDLC.md`: „A maintainer may waive an item”), więc zadania implementacyjne E02–E05 są gotowe do specyfikacji; przyjęcie ryzyka nie zmienia statusu założeń A01–A06. Dotknięte powierzchnie (`BACKWARD_COMPATIBILITY.md`): schemat bazy (nowe tabele sprzedaży, zapisy do `guest_interaction`), `/api/v1` (nowe trasy analityki i importu sprzedaży), adresy gościa (ewentualny parametr sesji w URL — tylko dodany, istniejące adresy działają dalej). Konflikt do rozstrzygnięcia w specyfikacji E02: `docs/SCREEN_SPECIFICATION.md` trzyma `sessionId` w sessionStorage, a `packages/app/AGENTS.md` wymaga działania bez JavaScriptu i bez pamięci przeglądarki.

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
- How: eksport zamówień z POS za ostatnie 4 tygodnie (zamówienia z jedzeniem i z winem), bez danych osobowych
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/data-request.md`

### C04 — Jakie rozwiązania restauracje znają lub już mają?

- What decision or work needs it: A06, wyróżnik produktu
- Who can answer it: zespół (sprawdzenie w źródle) i rozmówcy z C01
- How: benchmark cyfrowych kart win i aplikacji do parowania, sprawdzony w źródle z datą
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/benchmark-check.md`

### C05 — Ile i jak restauracje płacą za podobne narzędzia?

- What decision or work needs it: A02, D07
- Who can answer it: właściciele i GM
- How: rozmowa o ostatnim zakupie narzędzia dla sali lub kuchni: kto decydował, ile kosztowało, co przekonało
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/interview-note.md`

### C06 — Która restauracja przeprowadzi pilotaż i na jakich warunkach?

- What decision or work needs it: A03, A05, Q02, Q03
- Who can answer it: właściciel / GM restauracji z C01 lub C05
- How: rozmowa o pilotażu: karta win, dostęp do POS, zgoda sommeliera, okres
- Owner and by when: Filip; unknown
- Template: `.ai/specs/research/templates/decision-record.md`
