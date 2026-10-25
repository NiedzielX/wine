---
status: approved         # zatwierdzone przez właściciela (Filip) w czacie 2026-10-25: „działaj ze wszystkimi fazami” po przedstawieniu planu
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
- **R1 Pomiar bazowy (faza 0).** Wartości z repo (bajty, linie, szacunek tokenów) zapisane w „Realizacji” przed i po zmianie; `npm run check:context` je drukuje. Pomiar `/context all` w świeżej sesji robi właściciel (lista zadań właściciela w logu).
- **R2 Router (fazy 1–2).** Root `AGENTS.md` zawiera: wszystkie reguły procesu (§2–§6, §7 niezmienniki, §8, §9), skróconą mapę pakietów i granic oraz tabelę „typ zadania → co przeczytać” między znacznikami `<!-- routing:start -->` i `<!-- routing:end -->`. Szczegóły §1.2 (rozwinięcie), §1.3, §1.4, §1.5, §1.6 i szablony (spec, log, lekcja) przechodzą bez zmiany treści do `.ai/docs/architecture-rules.md`, `.ai/docs/commands.md` i `.ai/docs/process-templates.md`. Żadna reguła nie znika: każda ma jedno miejsce, a root wskazuje je w routingu. Cel rozmiaru roota: ≤ 12 288 B i ≤ 200 linii.
- **R3 `CLAUDE.md`.** Zostaje `@AGENTS.md` i sekcja „Specyficzne dla Claude Code”; powtórzenia §2 i §6 wypadają. Pakietowe `CLAUDE.md` bez zmian (lekcja `claude-code-nested-claude-md`: Claude Code wczytuje zagnieżdżone `CLAUDE.md`, nie `AGENTS.md`; natywne czytanie `AGENTS.md` przez Claude Code, o którym mówi lekcja 10, nie jest u nas zweryfikowane, więc importów nie usuwamy).
- **R4 Bramka `npm run check:context` (faza 3).** Skrypt Node (`scripts/check-context.mjs`, POSIX, bez zależności) sprawdza: (a) rozmiary i linie plików agentowych według tabeli budżetów (ostrzeżenie i błąd); (b) każdą ścieżkę z backticków w bloku routingu: musi istnieć; (c) `CLAUDE.md` zaczyna się od `@AGENTS.md` (po nagłówku), pakietowe `CLAUDE.md` zawierają tylko ten import, a obok każdego `AGENTS.md` jest `CLAUDE.md`; (d) linki w `.ai/lessons.md` wskazują istniejące pliki, a każdy plik w `.ai/lessons/` jest w indeksie; (e) opis każdego `SKILL.md` ≤ 1024 znaki, treść ≤ 500 linii; (f) łańcuch dla każdego wiersza routingu (root + `CLAUDE.md` + pliki z wiersza) ≤ 32 768 B. Kod wyjścia 1 przy błędzie, 0 przy samych ostrzeżeniach. Opcja `--root <katalog>` dla testów. Krok w jobie `lint` w CI.
- **R5 Budżety (tabela).** `AGENTS.md` root: ostrzeżenie > 10 240 B, błąd > 12 288 B; linie: ostrzeżenie > 170, błąd > 200. Pakietowe `AGENTS.md`: ostrzeżenie > 6 144 B, błąd > 8 192 B. `.ai/lessons.md`: ostrzeżenie > 12 288 B, błąd > 16 384 B. `.ai/docs/*.md` (routowane): błąd > 24 576 B. Aktywna specyfikacja (`.ai/specs/*.md`, nie `implemented/`): ostrzeżenie > 40 960 B. Limit podniesiemy tylko przez zmianę tej specyfikacji.
- **R6 Higiena danych (faza 4).** `.ai/lessons.md` ma limit z R5; przy przekroczeniu lekcje przestarzałe przechodzą do sekcji „Nieaktualne”, a stałe reguły do `AGENTS.md` (istniejąca procedura §5). Wzorcowy serwis jako jedna linia routingu: `packages/core/src/services/sales/sales-kpi-service.ts` (kontrola istnienia z R4). Przy czytaniu specyfikacji: sekcje Wymagania, Kryteria akceptacji, Realizacja (reguła w `process-templates.md`).
- **R7 Subagenci (faza 5).** §8 zyskuje kryterium: subagent do researchu, przeglądu, weryfikacji i prac równoległych; nie do małych zmian w jednym pliku; brief musi zawierać cel, pliki i to, co wykluczono, bo subagent startuje z pustym oknem.
- **R8 Pomiar końcowy (faza 6).** Wynik przed/po w „Realizacji”: bajty i szacunek tokenów roota, łańcucha dla typowych zadań, `CLAUDE.md`.
- **R9 Testy.** `packages/testkit/tests/check-context.test.ts` pokrywa każdą kontrolę z R4 na katalogach tymczasowych (przypadek poprawny i błędny) oraz uruchomienie na repozytorium.
- **R10 Dokumentacja.** `AGENTS.md` (§1.5 wiersz, §7 testkit), `.ai/docs/commands.md`, lekcja w `.ai/lessons/`.

## Kryteria akceptacji
- [ ] AC1 (R1, R8) „Realizacja” zawiera tabelę przed/po (bajty, linie, tokeny wg szacunku bajty/3,5).
- [ ] AC2 (R2) Root `AGENTS.md` ≤ 12 288 B i ≤ 200 linii; `diff` treści: każdy akapit reguły z §1.2–§1.6 i szablonów występuje w jednym z trzech nowych plików lub w rootcie (sprawdzone przeglądem diffu, wynik w logu).
- [ ] AC3 (R2, R4b) Wszystkie ścieżki z bloku routingu istnieją (`npm run check:context` zielony).
- [ ] AC4 (R3, R4c) `CLAUDE.md` bez powtórzeń §2/§6; test sprawdza regułę importu.
- [ ] AC5 (R4, R5, R9) `npm test -w @wine-match/testkit` przechodzi; test mutacyjny: przekroczenie budżetu, brakująca ścieżka i zepsuty link lekcji dają kod 1.
- [ ] AC6 (R4) Job w CI uruchamia `npm run check:context` w jobie `lint` i przechodzi.
- [ ] AC7 (R6) Wiersz routingu ze wzorcowym serwisem; ścieżka istnieje.
- [ ] AC8 (R7) §8 zawiera kryterium subagentów.
- [ ] AC9 (R10) Lekcja i wpis w indeksie; `npm run lint`, `typecheck`, `test`, `build` zielone.
- [ ] AC10 (R1) W logu lista zadań właściciela: `/context all` przed i po (po zmergowaniu).

## Projekt rozwiązania
1. Pomiar bazowy (wartości w tabeli „Realizacja”).
2. `.ai/docs/architecture-rules.md` ← §1.2 (rozwinięcie granic), §1.3, §1.4, §1.6 bez zmian treści; `.ai/docs/commands.md` ← §1.5; `.ai/docs/process-templates.md` ← szablony spec/log/lekcja z §3–§5.
3. Root `AGENTS.md`: skrócone §1 (projekt, stos jako tabela, mapa pakietów, granice jako 5 punktów, niezmienniki „zawsze” jako jednolinijkowce z odnośnikiem), §2–§6 z odnośnikami do szablonów, §7–§9 bez zmian merytorycznych, tabela routingu, kryterium subagentów w §8.
4. `CLAUDE.md`: usunięcie powtórzeń.
5. `scripts/check-context.mjs`, skrypt npm `check:context`, krok CI, test w testkit.
6. Pomiar końcowy, lekcja, wiersz §1.5 (w `commands.md`) i §7.

## Ryzyka i otwarte pytania
- **Pominięcie obowiązkowych kroków procesu po podziale.** Łagodzenie: cały proces (§2–§6, §7, §9) zostaje w rootcie; przenosimy tylko szczegóły architektury, polecenia i szablony.
- **Link do pliku routowanego bez wczytania.** Agent może nie otworzyć pliku z routingu. Łagodzenie: w rootcie zostają jednolinijkowe niezmienniki (granice pakietów, izolacja tenantów, `handle()`/`parseBody`, `logger`, `env()`), a pakietowe `AGENTS.md` wskazują `.ai/docs/architecture-rules.md`.
- **Szacunek tokenów (bajty/3,5) jest przybliżeniem** i nie zastępuje `/context`; wartość bazowa z `/context` czeka na właściciela.
- **Open:** tak, czy limit 170/200 linii roota jest właściwy; zweryfikujemy po faktycznym podziale i ewentualnie skorygujemy tą specyfikacją.

## Realizacja
(Uzupełnia agent po implementacji.)
