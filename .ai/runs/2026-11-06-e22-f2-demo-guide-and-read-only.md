---
started: 2026-11-06 16:40
ended: 2026-11-06 17:40
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
outcome: success
related: [.ai/runs/2026-11-06-e22-f1-roi-calculator.md]
---

# E22 F2: tryb demo, przewodnik DM0, strona DM1, tylko odczyt

## Zadanie
Faza F2 specyfikacji E22 na bazie main z F1: tryb `demo` w `parseEnv` (R1), instancja bez kont i bez logowania (R9, Q5), wyłączone zdarzenia gości, pasek „Dane demonstracyjne”, DM0 `/demo`, DM1 `/demo/tour`, smoke, QA, dokumentacja. Poza zakresem: F3 (panel, KPI, generator), F4.

## Przebieg
Kolejność ze specyfikacji: (1) `env.ts` + testy, (2) blokada logowania, brak kont, `shouldRecord` + testy AC13, (3) pasek w `(guest)`, (4) DM1, (5) DM0. Potem teksty, test e2e (trzy nowe `it`, trzy scenariusze QA), smoke, dokumentacja, spec. Środowisko: npm 11.20.0 doinstalowany do katalogu tymczasowego (system ma npm 10), PostgreSQL 16 na porcie 50312 (własny, zatrzymany na końcu), instancje `next start` na 50311 i 50313 (zatrzymane).

## Weryfikacja
Wyniki poleceń: zob. dolna sekcja „Wynik bramki”.

## Wynik
Zob. „Realizacja” w specyfikacji (F2). Dług i obserwacje: lekcja `2026-11-06-mikro-orm-cli-in-nested-worktree` (obejście środowiskowe `migration:up` w worktree).

## Lekcje
[2026-11-06-mikro-orm-cli-in-nested-worktree](../lessons/2026-11-06-mikro-orm-cli-in-nested-worktree.md)
