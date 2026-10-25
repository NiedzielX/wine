---
started: 2026-10-25 14:40
ended: 2026-10-25 15:10
agent: Claude Code
spec: .ai/specs/implemented/2026-10-25-context-engineering.md
outcome: success
related: [.ai/runs/2026-10-25-context-engineering.md]
---

# Reszta lekcji 10: odchudzenie `packages/app/AGENTS.md`, kontrola poleceń `npm run`, sprzątanie

## Zadanie
Właściciel (Filip) po zmergowaniu #100: „zrób resztę z lekcji, żeby nic nie zostało”. Kontynuacja specyfikacji `context-engineering` (dług z jej sekcji „Ryzyka”: `packages/app/AGENTS.md`, `agent/skills`, nieaktualne instrukcje). Przenoszenie tekstu bez zmiany reguł; bez nowej specyfikacji (formatowanie i przeniesienie istniejącej treści, §3).

## Przebieg
- 14:40 #100 zmergowany na polecenie właściciela (squash a626dc8, CI zielone, `clean`).

- `packages/app/AGENTS.md` 10 141 → 7 545 B: cztery najdłuższe punkty (sesja i zdarzenia gościa, kod polecenia, język PL/EN, import i Setup) przeniesione dosłownie do `.ai/docs/app-details.md`, w pakiecie zostały jednolinijkowe skróty z odnośnikiem; wiersz `app` w routingu wskazuje nowy plik. Łańcuch Codex root + app: 32 402 → 29 880 B (ostrzeżenie zniknęło).
- Nowa kontrola w `check:context`: każde `npm run <skrypt>` w `AGENTS.md`, `CLAUDE.md`, pakietowych `AGENTS.md` i `.ai/docs` musi istnieć w `package.json` (nieaktualne instrukcje, o których mówi lekcja 10); 3 testy. Na repozytorium: 0 nieaktualnych poleceń.
- Aktywna spec `2026-10-16-recommendation-code.md` (60 KB, `in-progress`, 8 niezaznaczonych AC) jest pracą E09 w toku: nie ruszana, ostrzeżenie `check:context` zostaje do jej zamknięcia.
- `agent/skills`: sprawdzone, że nic go nie referuje poza moimi notatkami; usunięcie w osobnym PR, żeby można je było odrzucić niezależnie.

## Weryfikacja
- `npm run lint`, `typecheck`, `test` (core 579, db 70, ui 62, app 356, testkit 129), `build`: zielone (exit 0).
- `npm run check:context`: 0 błędów, 1 ostrzeżenie (spec `recommendation-code` 60 KB).
- `test:db` nie dotyczy (bez zmian w `db`, portach, serwisach).

## Wynik
Dług z lekcji 10 spłacony: pakiet `app` pod budżetem, kontrola poleceń `npm run`, osierocony katalog w osobnym PR. Zostaje po stronie właściciela: `/context all` przed i po oraz wnioski z Context Scope (czyta lokalne sesje, wymaga zgody); rozbicie specyfikacji `recommendation-code` po jej zakończeniu.

## Lekcje
- zaktualizowana: `.ai/lessons/2026-10-25-context-budget-and-routing.md`
