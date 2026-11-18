---
started: 2026-11-18 17:30
ended: 2026-11-18 17:40
agent: Claude Code
spec: .ai/specs/2026-11-18-restaurant-picks.md (PR-A, krok 0)
outcome: success
related: [.ai/specs/2026-11-18-restaurant-picks.md]
---

# AGENTS.md §7: etykieta „Wybór restauracji” nie jest pieczęcią sommeliera

## Zadanie
Krok 0 specyfikacji „Wybór restauracji” (zatwierdzonej przez właściciela): doprecyzować punkt „Sommelier ponad modelem”. Nie zmienia zasady: Match Score nadal jest surowym wynikiem silnika, bo faza 1 zmienia tylko kolejność i etykietę.

## Przebieg
Jedno zdanie w `AGENTS.md` §7: etykieta „Wybór restauracji” / „Restaurant’s pick” jest znakiem restauracji, nigdy nie nosi pieczęci, zmienia tylko kolejność w grupie propozycji silnika i nigdy nie staje nad parą sommeliera. Zmiana pliku objętego `.github/CODEOWNERS`: wymaga przeglądu właściciela. PR-B (uchylenie R02 dla trybu `score`) jest osobny i dopiero przed fazą 2.

## Weryfikacja
`node scripts/check-context.mjs`: 0 błędów (`AGENTS.md` 22 686 B, poniżej progu ostrzeżenia 23 552 B).

## Wynik
Gałąź gotowa; PR do przeglądu właściciela.

## Lekcje
brak
