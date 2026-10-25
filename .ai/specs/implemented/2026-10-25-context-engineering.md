---
status: implemented      # zatwierdzone przez właściciela (Filip) w czacie 2026-10-25: „działaj ze wszystkimi fazami” po przedstawieniu planu
created: 2026-10-25
owner: Filip
related: [.ai/runs/2026-10-25-context-engineering.md, .ai/specs/implemented/2026-10-25-agent-security-hardening.md]
superseded_by:
---

# Inżynieria kontekstu: mały `AGENTS.md` jako router i bramka rozmiaru w CI (lekcja 10)

## Problem
Każda sesja agenta ładuje na starcie `AGENTS.md` (332 linie, 29 120 B, ok. 8 tys. tokenów wg szacunku bajty/3,5) oraz `CLAUDE.md` (3 212 B), który w części powtarza `AGENTS.md` (§2, §6). Szczegóły potrzebne tylko przy części zadań (DI, import, MikroORM, frontend, polecenia, szablony) płacimy zawsze. Codex ma twardy limit 32 KB na `AGENTS.md` (reszta jest pomijana), a my mamy 3 KB zapasu; Claude Code ostrzega powyżej 40 000 znaków. Nic nie pilnuje rozmiaru: `AGENTS.md`, `.ai/lessons.md` i specyfikacje rosną z każdym przebiegiem. Nie mamy też pomiaru stanu wejściowego sesji ani kontroli, czy ścieżki wskazane w instrukcjach istnieją.

## Cel i zakres
Zmniejszyć stały koszt sesji bez utraty reguł procesu i ochrony architektury oraz dodać bramkę CI, która pilnuje tego dalej.

**Poza zakresem:** harness porównujący deklarowany i faktycznie czytany kontekst (236 przypadków, LLM-as-judge), wygenerowane „fakty o modułach”, trzy osie routingu (rozwiązania dla projektu z zewnętrznymi bibliotekami, Open Mercato), skracanie opisów skilli (42 skille: opisy 139–498 znaków, największy `SKILL.md` 290 linii; w normie), zmiana treści reguł (przenosimy i skracamy tekst, nie zmieniamy zasad), uruchamianie Context Scope (czyta sesje z `~/.claude/projects`, wymaga zgody właściciela), pomiar `/context` (wykonuje właściciel).

## Wymagania
- **R1 Pomiar bazowy (faza 0).** Wartości z repo (bajty, linie, szacunek tokenów) zapisane w „Realizacji” przed i po zmianie; `npm run check:context` je drukuje. Szacunek (bajty/3,5) jest informacyjny i nie ma progu; pomiar `/context all` w świeżej sesji robi właściciel (zadanie właściciela, poza kryteriami agenta).
- **R2 Router (fazy 1–2).** Root `AGENTS.md` zawiera: wszystkie reguły procesu (§2–§6, §7, §8, §9), skrót §1.2–§1.6 i tabelę „zadanie → czytaj” między znacznikami `<!-- routing:start -->` i `<!-- routing:end -->`. **Numeracja sekcji nie zmienia się** (odwołania `AGENTS.md §N` są w pakietach, lekcjach, specyfikacjach i kodzie). Pełne wersje skróconych §1.2–§1.4 i §1.6 przechodzą bez zmiany treści do `.ai/docs/architecture-rules.md`, §1.5 do `.ai/docs/commands.md`, szablony (spec, log, lekcja) do `.ai/docs/process-templates.md`; każdy skrócony akapit wskazuje swoją pełną wersję. W rootcie zostają jednolinijkowe niezmienniki (granice, izolacja tenantów, zakres żądania, zapisy z wyjątkami, uprawnienia, `domainError()`, migracje, trasa API, `logger`/`env()`, frontend, fonty, POSIX).
- **R3 `CLAUDE.md`.** Zostaje `@AGENTS.md` i sekcja „Specyficzne dla Claude Code”; powtórzenia §2 i §6 wypadają. Pakietowe `CLAUDE.md` bez zmian (lekcja `claude-code-nested-claude-md`; natywne czytanie `AGENTS.md` przez Claude Code, o którym mówi lekcja 10, nie jest u nas zweryfikowane, więc importów nie usuwamy).
- **R4 Bramka `npm run check:context` (faza 3).** `scripts/check-context.mjs` (Node, bez zależności; `--root <katalog>` dla testów) sprawdza: (a) budżety rozmiaru (bajty przez `Buffer.byteLength`, końce linii CRLF/LF jak LF) wg R5; (b) w bloku routingu, w kolumnie „Czytaj”, każda ścieżka z backticków istnieje (ścieżka od roota; pomijane: polecenia `npm`/`node`, wzorce z `*`, `<…>`, `…`, `.env*`; obcinane `#kotwica` i `:linia`; końcowy `/` oznacza katalog; dokładnie jedna para znaczników i co najmniej jedna ścieżka); (c) `CLAUDE.md` zaczyna się od `@AGENTS.md` (po nagłówku), pakietowe `CLAUDE.md` zawierają tylko ten import, a obok każdego `packages/*/AGENTS.md` jest `CLAUDE.md`; (d) linie `- [data]` w `.ai/lessons.md` wskazują istniejące pliki (ścieżki względne od `.ai/`), żaden plik nie jest wpisany dwa razy, a każdy plik w `.ai/lessons/` jest w indeksie; (e) każdy `SKILL.md` w `.agents/skills` (i w niedowiązanych katalogach `.claude/skills`; dowiązania są pomijane) ma frontmatter z `description` ≤ 1024 znaki (znaki, nie bajty; opis wieloliniowy czytany także bez `>`/`|`) i ≤ 500 linii całego pliku; (f) nazwy plików w `.ai/lessons`, `.ai/runs`, `.ai/specs`, `.ai/specs/implemented`, `.ai/specs/archive` mają postać `YYYY-MM-DD-slug.md` (poza `product-brief.md` i `backlog.md`); (g) każde `§N[.M]` w linii wspominającej `AGENTS` w `CLAUDE.md`, pakietowych `AGENTS.md`, `.ai/docs` i `.ai/lessons` wskazuje istniejący nagłówek roota. Kod wyjścia 1 przy błędzie, 0 przy samych ostrzeżeniach. Krok w jobie `lint` w CI (`ci.yml`, komentarz z listą jobów zaktualizowany).
- **R5 Budżety.** Root `AGENTS.md`: ostrzeżenie > 23 552 B lub > 250 linii, błąd > 27 648 B lub > 280 linii (faktyczny rozmiar po podziale ok. 22 KB; pierwotne 12 288 B/200 linii okazały się nieosiągalne bez zmiany reguł: same reguły procesu to ok. 14 KB). Pakietowe `AGENTS.md`: ostrzeżenie > 8 192 B, błąd > 12 288 B. **Łańcuch Codex** (root + `AGENTS.md` pakietu): ostrzeżenie > 30 720 B, błąd > 32 768 B (twardy limit Codexa). Root + `CLAUDE.md`: ostrzeżenie > 40 000 B (próg ostrzeżenia Claude Code). `.ai/lessons.md`: ostrzeżenie > 12 288 B, błąd > 16 384 B. `.ai/docs/*.md`: błąd > 24 576 B. Aktywna specyfikacja (`.ai/specs/*.md`, bez `product-brief.md`, `backlog.md` i `implemented/`): ostrzeżenie > 40 960 B. Rozmiar wiersza routingu jest tylko raportowany (pliki z routingu są czytane na żądanie; `docs/`, `.ai/specs/`, `.ai/lessons/` nie liczą się). Limit zmieniamy tylko przez zmianę tej specyfikacji.
- **R6 Higiena danych (faza 4).** `.ai/lessons.md` ma limit z R5; przy przekroczeniu lekcje przestarzałe przechodzą do sekcji „Nieaktualne”, a stałe reguły do `AGENTS.md` (istniejąca procedura §5). Wzorcowy serwis jako wiersz routingu: `packages/core/src/services/sales/sales-kpi-service.ts` (istnienie pilnuje R4b). Specyfikację czyta się od sekcji Wymagania, Kryteria akceptacji i Realizacja (reguła w wierszu routingu).
- **R7 Subagenci (faza 5).** §8 zyskuje kryterium: pod-agent do researchu, przeglądu, weryfikacji i prac równoległych; nie do małej zmiany w jednym pliku; brief zawiera cel, pliki i to, co wykluczono. To jedyna zmiana normatywna treści reguł w tej specyfikacji.
- **R8 Pomiar końcowy (faza 6).** Tabela przed/po w „Realizacji”: bajty, linie i szacunek tokenów roota, `CLAUDE.md`, łańcuchów Codex.
- **R9 Testy.** `packages/testkit/tests/check-context.test.ts`: każda kontrola z R4 (przypadek poprawny i błędny), kod 0 przy samych ostrzeżeniach, uruchomienie na repozytorium oraz test, że wybrane reguły-kotwice (MUSISZ/NIE WOLNO i niezmienniki) występują w rootcie lub w `.ai/docs` (ochrona przed cichą utratą reguły przy kolejnym skracaniu).
- **R10 Dokumentacja i własność.** `.ai/docs/commands.md` (wiersz `check:context`), `AGENTS.md` §7 (zakres testkit), `.github/CODEOWNERS` (`/.ai/docs/`), lekcja w `.ai/lessons/`.

## Kryteria akceptacji
- [x] AC1 (R1, R8) „Realizacja” zawiera tabelę przed/po (bajty, linie, tokeny wg szacunku).
- [x] AC2a (R2) Root `AGENTS.md` mieści się w budżecie R5 bez ostrzeżenia rozmiaru i numeracja sekcji jest zachowana (`check:context` zielony, krok g).
- [x] AC2b (R2) Żadna reguła nie zniknęła: jednorazowe porównanie z `AGENTS.md` sprzed zmiany (`git show dbbc10d:AGENTS.md`): każda niepusta linia oryginału (240) występuje dosłownie w rootcie lub w `.ai/docs` poza dwiema świadomie zmienionymi (wynik w logu); trwale chroni to test kotwic (R9).
- [x] AC3 (R2, R4b) Wszystkie ścieżki z bloku routingu istnieją (`npm run check:context` zielony).
- [x] AC4 (R3, R4c) `CLAUDE.md` bez powtórzeń §2/§6; test sprawdza regułę importu.
- [x] AC5 (R4, R5, R9) `npm test -w @wine-match/testkit` przechodzi i zawiera przypadki negatywne dla: budżetu roota (bajty, linie), pakietu, łańcucha Codex, dokumentu routowanego, brakującej ścieżki routingu, brakującego/zdublowanego bloku routingu, `CLAUDE.md` (import, pakiet, brak pliku), odwołania `§`, linku lekcji (brak, dubel, sierota), nazwy pliku, skilla (opis > 1024, ciało > 500, brak frontmatter/description/SKILL.md) i kod 0 przy samych ostrzeżeniach.
- [x] AC6a (R4) Lokalnie `node scripts/check-context.mjs` zwraca 0 na repozytorium; `ci.yml` ma krok w jobie `lint`.
- [x] AC6b (R4) Job `lint` zielony w PR #100 (wszystkie 8 jobów zielone).
- [x] AC7 (R6) Wiersz routingu ze wzorcowym serwisem; ścieżka istnieje.
- [x] AC8 (R7) §8 zawiera kryterium pod-agentów.
- [x] AC9 (R10) Lekcja i wpis w indeksie; `npm run lint`, `typecheck`, `test`, `build` zielone (dowody w logu).
- Poza kryteriami agenta: **zadanie właściciela** `/context all` w świeżej sesji przed i po (po zmergowaniu); jego brak nie blokuje zamknięcia specyfikacji.

## Projekt rozwiązania
1. Pomiar bazowy (tabela w „Realizacji”).
2. `.ai/docs/architecture-rules.md` ← §1.2 (pełne), §1.3, §1.4, §1.6 bez zmian treści; `.ai/docs/commands.md` ← §1.5 oraz dwa punkty testowe z §7 (wykluczenia z pokrycia, miejsce testów; w rootcie zostaje jedna linia z odnośnikiem); `.ai/docs/process-templates.md` ← szablony.
3. Root `AGENTS.md`: tabela routingu, skróty §1.2–§1.6 z odnośnikami, §2–§9 bez zmian merytorycznych poza R7.
4. `CLAUDE.md`: usunięcie powtórzeń. Pakietowe `AGENTS.md` (core, db, app, ui): dopisany odnośnik do `architecture-rules.md` (ich odwołania `§1.2–1.3`, `§7` zostają prawdziwe dzięki zachowanej numeracji).
5. `scripts/check-context.mjs`, skrypt npm `check:context`, krok CI, test w testkit, CODEOWNERS.
6. Pomiar końcowy, lekcja.

## Ryzyka i otwarte pytania
- **Pominięcie obowiązkowych kroków procesu po podziale.** Łagodzenie: cały proces i niezmienniki zostają w rootcie, numeracja bez zmian, pliki routowane wskazane z roota i z pakietów.
- **Agent może nie otworzyć pliku z routingu.** Łagodzenie: niezmienniki w rootcie, test kotwic (R9).
- **Wynik po przeglądzie niezależnym (2026-10-25):** pierwotne liczby R2/R5 (root ≤ 12 288 B i ≤ 200 linii) były nieosiągalne: zmierzone sekcje reguł procesu to ok. 14 KB. Skorygowane na realny cel ok. 22 KB (−24% bajtów); to odstępstwo od planu przedstawionego właścicielowi (cel „ok. 150 linii”) i jest zgłoszone w odpowiedzi.
- **Dług: `packages/app/AGENTS.md` (10 KB).** Root + app = 32 352 B, margines do limitu Codexa ok. 400 B; ostrzeżenie `check:context` pilnuje. Do odchudzenia w osobnym zadaniu (fragmenty o gościu i panelu do `docs/` albo `.ai/docs/`). Przed tą zmianą suma wynosiła ok. 39 KB, więc Codex odrzucał część reguł w tym pakiecie.
- **Dług: `agent/skills`.** Śledzony w git katalog z 42 skillami różni się od `.agents/skills` (m.in. opisy zawinięte do wielu linii) i nie jest ładowany przez Claude Code (`.claude/skills` to dowiązania do `.agents/skills`). Nie ruszamy go tutaj; do wyjaśnienia (osierocona kopia, dodana razem z `.agents/skills` w #87).
- **Szacunek tokenów (bajty/3,5) jest przybliżeniem** i nie zastępuje `/context`.
- **Spec `2026-10-16-recommendation-code.md` (60 KB, aktywna) daje ostrzeżenie `check:context`**; jej odchudzenie jest poza zakresem.

## Realizacja
Gałąź `chore/context-engineering`, log `.ai/runs/2026-10-25-context-engineering.md`, lekcja `.ai/lessons/2026-10-25-context-budget-and-routing.md`. Wszystkie fazy 0–6 wykonane; odstępstwa od pierwotnego projektu: korekta budżetów po przeglądzie (patrz „Ryzyka”), numeracja §1.x zachowana zamiast zmieniona, dwa punkty testowe z §7 przeniesione do `.ai/docs/commands.md`.

| Pomiar (bajty / linie / tokeny wg szacunku bajty/3,5) | Przed | Po |
|---|---|---|
| `AGENTS.md` (root) | 29 120 B / 332 / ~8 320 | 22 211 B / 238 / ~6 346 |
| `CLAUDE.md` | 3 212 B / 37 / ~918 | 1 308 B / 14 / ~374 |
| root + `CLAUDE.md` (stały koszt sesji Claude Code) | 32 332 B / ~9 238 | 23 519 B / ~6 720 |
| Codex: root + `packages/app/AGENTS.md` | 39 195 B (ponad limit 32 768 B, część odrzucana) | 32 352 B (pod limitem, ostrzeżenie) |
| Codex: root + `packages/core/AGENTS.md` | 31 803 B | 24 960 B |
| Codex: root + `packages/db/AGENTS.md` | 32 126 B | 25 283 B |
| Codex: root + `packages/ui/AGENTS.md` | 30 633 B | 23 790 B |

Stały koszt sesji Claude Code spadł o ok. 27% (szacunek). Pomiar `/context all` przed i po zostaje zadaniem właściciela.

Weryfikacja i dowody (w tym porównanie 240 linii oryginału, 238 dosłownie w rootcie lub `.ai/docs`): w logu przebiegu.
