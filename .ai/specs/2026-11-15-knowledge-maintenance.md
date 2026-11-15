---
status: draft
created: 2026-11-15
owner: Filip
related: [.ai/maintenance/2026-11-15-audit.md, .ai/runs/2026-11-15-knowledge-audit.md, .ai/specs/2026-11-15-weekly-maintenance-routine.md, .ai/specs/implemented/2026-10-25-context-engineering.md, .ai/docs/process-templates.md, .ai/lessons/2026-11-05-unticked-acs-audit-before-building.md, .ai/lessons/2026-11-08-project-skills-and-spec-status-hook.md]
superseded_by:
author_model: claude-sonnet-5-5
reviewed_by: not recorded (przegląd niezależnego agenta nie był możliwy w tej sesji; patrz Changelog)
---

# Utrzymanie wiedzy: katalog `.ai/maintenance/`, komenda audytu, relacje między specyfikacjami

**Draft. Nie implementować bez zmiany statusu na `approved` przez właściciela (`AGENTS.md` §3).** Źródło: lekcja 25 kursu („Utrzymanie i rozwój systemu”) i pierwszy audyt `.ai/maintenance/2026-11-15-audit.md`.

## Problem
Dokumentacja i specyfikacje starzeją się razem z kodem. Pierwszy audyt (35 specyfikacji) znalazł: 8 sprzeczności (np. `AGENTS.md:74` mówi o dwóch layoutach, kod ma trzy), 16 martwych odwołań (m.in. linki do przeniesionych specyfikacji, `.md.md` w `.ai/qa/INDEX.md:95-103`), 6 specyfikacji częściowo wdrożonych i 8 zatwierdzonych bez linii kodu. Nic w repozytorium nie pilnuje tego automatycznie: `check:context` mierzy rozmiary i istnienie ścieżek z routingu, nie zgodność treści ani położenie specyfikacji. Audyt był ręczny i jednorazowy, a `AGENTS.md` §8 każe zamieniać powtarzalną czynność w komendę. Szablon specyfikacji nie mówi też, jak nowa specyfikacja ma się do starszej o tym samym obszarze, więc agent może zrealizować starszą, już zmienioną (przykład z lekcji: skrypt zaproszeń kontra panel).

## Cel i zakres
1. Stałe miejsce na raporty audytu: `.ai/maintenance/YYYY-MM-DD-audit.md`.
2. Komenda Claude Code `/audit-knowledge` z promptem audytu (powtarzalny, tylko do odczytu).
3. Rozszerzenie szablonu specyfikacji o relacje i deltę dla zmian istniejącej funkcji.
4. Lokalne rozszerzenie skilla `om-spec-writing`, żeby skill sam stosował te reguły.
5. Dwa sprawdzenia w `scripts/check-context.mjs` (nazwy w `.ai/maintenance/`, specyfikacja `implemented` leżąca wśród aktywnych) z testami.

**Poza zakresem:** poprawianie dokumentów na podstawie audytu (osobna decyzja, patrz spec `2026-11-15-weekly-maintenance-routine.md`); indeks plików wiedzy (`knowledge-map.md`) i daty przeglądu w nagłówkach (**odrzucone**, jak w lekcji 25: kolejne dane do utrzymania, a autora i daty zna git); zmiana `AGENTS.md` (zapas budżetu 1193 B zostaje nietknięty); automatyczne wykrywanie sprzeczności treści (żaden statyczny check tego nie zrobi, robi to komenda z agentem); przenoszenie specyfikacji (robi człowiek lub osobny PR mechaniczny); sprawdzanie martwych odwołań w specyfikacjach (propozycja w „Ryzykach”).

## Wymagania
- **R1 Katalog.** `.ai/maintenance/` zawiera wyłącznie raporty `YYYY-MM-DD-slug.md` (kolejny tego samego dnia: sufiks `-2`; audyt: slug `audit`). Raport jest dziennikiem jak log przebiegu: nie edytuje się cudzych raportów, kolejny audyt to nowy plik. Katalog opisuje `.ai/docs/process-templates.md` (drzewo, szablon raportu); **`AGENTS.md` nie zmienia się**, bo jego §2 odsyła do tego drzewa.
- **R2 Szablon raportu.** Na górze liczby (specyfikacje: w całości / częściowo / niewdrożone / porzucone, w złym katalogu, sprzeczności, martwe odwołania, braki), potem tabele: (A) specyfikacja, status w nagłówku, stan faktyczny, dowód, katalog; (B) sprzeczność z **trwałym identyfikatorem** `S-NN`, dokumenty z liniami, kod, wersja prawdziwa; (C) martwe odwołania `C-NN`; (D) lekcje; (E) rekomendacje „bezpieczne, mechaniczne” i „decyzja właściciela”. Identyfikator nadaje się raz i nie używa ponownie (potrzebne do porównań tygodniowych). Struktura pierwszego raportu jest wzorcem.
- **R3 Komenda.** `.claude/commands/audit-knowledge.md` zawiera prompt audytu po polsku: zakres (`AGENTS.md`, `.ai/specs` z `implemented/` i `archive/`, `.ai/docs`, `.ai/skills`, `.claude/skills`, `docs/`, `README.md`, lekcje; decyzje leżą w specyfikacjach i `.ai/specs/research/`, nie w `docs/adr/`), statusy, sprzeczności, **zasada dowodu** (plik:linia i polecenie; bez dowodu „nie ustalono”), **audytuj, nie poprawiaj** (jedyny nowy plik to raport), użycie pod-agentów po jednej grupie specyfikacji z weryfikacją próbkami, zapis do `.ai/maintenance/`. Komenda nie ustawia statusów, nie przenosi plików, nie edytuje cudzych logów. Opis komendy trafia do `.ai/docs/process-templates.md` (nie do lekcji, bo zapas `.ai/lessons.md` to 185 B).
- **R4 Relacje w specyfikacji.** Szablon w `.ai/docs/process-templates.md` dostaje dla zmiany **istniejącej** funkcji: pod tytułem linie `Extends: <ścieżka>` (starsza obowiązuje w całości) i/lub `Supersedes: <ścieżka>[, sections: …]` (nowa zastępuje starszą w całości lub w sekcjach). To linie w treści, nie nowe klucze nagłówka (hook `spec-status-guard` czyta tylko `status`). Agent szuka powiązanych specyfikacji także w `implemented/`.
- **R5 Prior spec drift.** Sekcja z różnicami między starszą specyfikacją a kodem: ścieżka i sekcja, co mówi specyfikacja, co robi kod, plik:linia. O stanie bieżącym decyduje kod; niejasne różnice to pytania otwarte.
- **R6 Delta.** Sekcja „Delta” z wymaganiami `ADDED` / `MODIFIED` / `REMOVED`, każde ze scenariuszem `WHEN … THEN …`; przy `MODIFIED` i `REMOVED` linia `Frozen by: <test charakteryzujący>` wskazuje test, który zamraża dzisiejsze zachowanie **przed** zmianą (nowy test charakteryzujący, jeśli nie istnieje). Funkcja bez specyfikacji: opis bieżącego zachowania z kodu i testów, zmiana jest `MODIFIED`.
- **R7 Starej specyfikacji nie przepisujemy.** Jedyna dozwolona zmiana: jedna linia `Superseded by: <ścieżka nowej> (YYYY-MM-DD)` pod tytułem, **tylko przy `Supersedes`**; przy `Extends` stara nie zmienia się wcale. Nie wolno zmieniać jej `status:`. Specyfikacja zastąpiona **w całości** idzie zgodnie z `AGENTS.md` §3 reguła 6 do `archive/` z polem `superseded_by`; linia „Superseded by” służy zastąpieniu częściowemu (sekcje) albo jest tymczasowym znacznikiem do czasu przeniesienia.
- **R8 Skill.** Lokalne rozszerzenie `.ai/skills/om-spec-writing/` (`SKILL.md` z frontmatterem `name`, `description`, plus `references/prior-specs.md` i `references/delta-format.md`) według wzoru `.ai/skills/om-integration-tests/`: czyta skill bazowy (`.claude/skills/om-spec-writing/SKILL.md`), dokłada R4-R7 i nie osłabia jego reguł bezpieczeństwa. Skill bazowy (`.agents/skills/…`, `skills-lock.json` hash `a27ef6db…`) **nie jest edytowany**. Nowy lub zmieniony skill wchodzi tylko przez PR i autor przeczytał skill bazowy w całości (`AGENTS.md` §9).
- **R9 Nazwy w `.ai/maintenance/`.** `scripts/check-context.mjs` sprawdza nazwy plików w `.ai/maintenance/` tym samym wzorcem co `runs` i `lessons` (`YYYY-MM-DD-slug.md`, ASCII); błąd (exit 1) przy niezgodnej nazwie, brak katalogu nie jest błędem.
- **R10 Położenie specyfikacji.** `check-context.mjs` ostrzega (warning, nie błąd) o pliku w `.ai/specs/` (poza `backlog.md`, `product-brief.md`) z `status: implemented` w nagłówku, oraz o pliku w `implemented/` ze statusem innym niż `implemented`, i o pliku w `archive/` ze statusem innym niż `superseded`/`abandoned`. Nagłówek czytany jak w hooku: `status:` w kolumnie 0, wartość bez komentarza `# …` (np. `status: implemented     # zatwierdzone …` musi się poprawnie odczytać); nieczytelny nagłówek = ostrzeżenie „nie ustalono statusu”, nie błąd.
- **R11 Metadane zostają.** Nie dodajemy ani nie usuwamy kluczy nagłówka specyfikacji; `status` jest potrzebny hookowi `spec-status-guard` i R10.
- **R12 Budżety.** Po zmianie `npm run check:context` ma 0 błędów, a headroom `AGENTS.md`, łańcucha Codex i `.ai/lessons.md` jest nie mniejszy niż przed zmianą (1193 B / 540 B / 185 B zapasu do ostrzeżenia nie maleje).

## Kryteria akceptacji
- [ ] AC1 (R1) `.ai/docs/process-templates.md` zawiera drzewo z `maintenance/` i szablon raportu; `git diff origin/main -- AGENTS.md` jest pusty; plik ma ≤ 24 KiB (CTX-06 PASS w `npm run audit:process`).
- [ ] AC2 (R2) Pierwszy raport `.ai/maintenance/2026-11-15-audit.md` ma wszystkie sekcje szablonu i identyfikatory `S-NN`/`C-NN` (krok ręczny: porównanie nagłówków raportu z szablonem).
- [ ] AC3 (R3) `/audit-knowledge` uruchomione w świeżej sesji na `main` tworzy dokładnie jeden nowy plik `.ai/maintenance/<data>-audit.md` i nie zmienia żadnego innego pliku: `git status --porcelain` po przebiegu pokazuje tylko ten plik.
- [ ] AC4 (R3) Przebieg z AC3 odtwarza liczby pierwszego raportu z odchyleniem ≤ 2 pozycje w każdej kategorii na tym samym `main` (powtarzalność).
- [ ] AC5 (R4-R7) Szablon zawiera `Extends:`, `Supersedes:`, „Prior spec drift”, „Delta” z `WHEN/THEN` i `Frozen by:`; pilotaż: jedna prawdziwa zmiana istniejącej funkcji (kandydat: poprawka reguły layoutów po S-01) opisana nowym draftem według szablonu, bez edycji starej specyfikacji poza linią „Superseded by”.
- [ ] AC6 (R8) `.ai/skills/om-spec-writing/SKILL.md` istnieje, ma `description` w limicie z `check:context`, odsyła do skilla bazowego; `skills-lock.json` bez zmian; PR ma przegląd zgodnie z §9.
- [ ] AC7 (R9) Test w `packages/testkit/tests/check-context.test.ts`: plik `.ai/maintenance/2026-11-15-audit.md` przechodzi; `.ai/maintenance/Audit.md` i `…/2026-11-15-audyt-żółw.md` dają błąd; brak katalogu nie daje błędu.
- [ ] AC8 (R10) Testy: specyfikacja `status: implemented` w `.ai/specs/` daje warning z nazwą pliku; ta sama w `implemented/` nie daje; `status: implemented     # komentarz` odczytana poprawnie; `draft`/`approved`/`in-progress` w aktywnych bez ostrzeżenia; `backlog.md` i `product-brief.md` pomijane; nieczytelny nagłówek daje warning, nie błąd.
- [ ] AC9 (R10) Na obecnym `main` `npm run check:context` nie dodaje nowych ostrzeżeń R10 (żadna aktywna specyfikacja nie ma `status: implemented`: potwierdza audyt, tabela A1) i nadal kończy się 0 błędów.
- [ ] AC10 (R12) `npm run check:context`, `npm run audit:process`, `npm run lint`, `npm test`, `npm run secrets:scan` zielone; headroom bez pogorszenia (porównanie wydruków przed i po).

## Projekt rozwiązania
Kolejność, każdy krok osobny commit; jeden PR `risk-medium` (dotyka `.claude/` i `scripts/`, więc przez przegląd, `CODEOWNERS`).
1. `.ai/docs/process-templates.md`: drzewo (`maintenance/`), szablon raportu (R1-R2), rozszerzony szablon specyfikacji (R4-R7), opis komendy (R3). Szacunek +3 KB, limit 24 KiB (dziś 6441 B).
2. `.claude/commands/audit-knowledge.md` (R3).
3. `.ai/skills/om-spec-writing/SKILL.md` + dwa pliki `references/` (R8); najpierw przeczytać `.claude/skills/om-spec-writing/SKILL.md` i `references/rules.md` w całości.
4. `scripts/check-context.mjs`: w sekcji „6. File names” dopisać `['maintenance', new Set()]` do listy katalogów (R9); nowa sekcja po niej czytająca nagłówek każdej specyfikacji (R10), z funkcją czytającą `status` współdzieloną lub zbliżoną do `spec-status-guard.mjs` (nie importować hooka; nie zmieniać hooka).
5. `packages/testkit/tests/check-context.test.ts`: przypadki z AC7-AC8 na tymczasowym drzewie (`validTree()` + dodatkowe pliki), plus test repozytorium (AC9).
6. Weryfikacja AC10, wpisy w logu przebiegu. Zmiany w `docs/`: brak (nie zmienia się zachowanie produktu).

Mapowanie AC → dowód: AC1 `git diff`, `audit:process`; AC2 ręcznie; AC3-AC4 uruchomienie komendy (dwa razy); AC5 pilotażowy draft; AC6 `check:context`, `git diff skills-lock.json`; AC7-AC9 `npm test -w @wine-match/testkit`; AC10 polecenia z listy.

## Ryzyka i otwarte pytania
- **Q1 Edycja skilla bazowego czy lokalne rozszerzenie?** Zlecenie mówi o „aktualizacji skilla `om-spec-writing` (referencje)”. Skill bazowy jest przypięty skrótem w `skills-lock.json` i leży w `.agents/skills/`; jego zmiana zmienia skrót i nadpisuje się przy aktualizacji kolekcji. Rekomendacja: lokalne rozszerzenie w `.ai/skills/` jak `om-integration-tests` (zgodne z lekcją o skillach projektu). Do potwierdzenia, także czy `check:context` obejmuje `.ai/skills/` (nie ustalono; do sprawdzenia w kroku 3).
- **Q2 Czy `.ai/skills/om-spec-writing/` zostanie wczytany?** Rozszerzenie działa tylko, jeśli agent je znajdzie: dodać odsyłacz w wierszu routingu „nowa specyfikacja” dotknąłby `AGENTS.md`; rekomendacja: odsyłacz w `.ai/docs/process-templates.md` (już routowany). Weryfikacja: AC5 (pilotaż pokazuje, czy agent użył relacji).
- **Q3 Konflikt linii „Superseded by” z `AGENTS.md` §3 reguła 6.** Rozstrzygnięte w R7 (częściowe vs całkowite zastąpienie); do akceptacji.
- **Q4 Ostrzeżenia o położeniu, nie błędy.** Specyfikacja z `implemented` w aktywnych bywa przejściowa (PR zamykający). Błąd zablokowałby CI. Rekomendacja: ostrzeżenie.
- **Q5 Czy dodać check martwych odwołań w specyfikacjach** (tabela C audytu: linki do przeniesionych plików)? Poza zakresem, bo specyfikacje planują pliki, które jeszcze nie istnieją; wymagałoby wyjątku. Rekomendacja: osobna propozycja po tygodniowej rutynie.
- **Ryzyko: komenda w `.claude/` to konfiguracja agenta** (`AGENTS.md` §9): zmiana tylko przez PR; komenda ma prawo zapisu wyłącznie do jednego pliku raportu (sprawdza AC3). Trzy nogi (§9): komenda czyta repozytorium lokalnie, bez sieci i bez zapisu poza plikiem; brak wyjścia na zewnątrz.
- **Ryzyko: audyt kosztuje** (pierwszy audyt DevMentora: 7 agentów). Dla pełnego audytu to akceptowalne jako jednorazowe; cotygodniowy wariant zawęża zakres (spec B).
- **Ryzyko: fałszywe alarmy audytu** (np. „niewdrożona” przy kodzie pod innym symbolem). Mitigacja: reguła dowodu, „nie ustalono”, próbki weryfikowane przez agenta głównego, tabela „wersja prawdziwa” z uzasadnieniem.

## Changelog
- 2026-11-15 — Autor: claude-sonnet-5-5 (źródło: `.ai/runs/2026-11-15-knowledge-audit.md`).
- 2026-11-15 — Przegląd: niezależnego agenta nie dało się uruchomić w tej sesji (brak narzędzia pod-agenta), więc wykonano przegląd własny w osobnym przebiegu, poniżej. Zalecony przegląd niezależny przed `approved` (`AGENTS.md` §3).

### Wnioski z przeglądu (własnego)
- Doprecyzowano R10 (komentarz po wartości `status`, nieczytelny nagłówek = warning) po zauważeniu, że `implemented/2026-10-25-*.md` mają `status: implemented     # zatwierdzone…`.
- Dodano R12 (budżety nie mogą się pogorszyć) i AC9 (brak nowych ostrzeżeń na obecnym `main`).
- AC4 (powtarzalność audytu) jest probabilistyczne dla LLM: dlatego tolerancja ≤ 2 pozycje, nie równość.
- Q1-Q2: ryzyko, że rozszerzenie skilla nie zostanie wczytane; wymaga potwierdzenia pilotażem.

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
