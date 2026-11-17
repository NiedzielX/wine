---
started: 2026-11-17 09:00
ended: 2026-11-17 09:10
agent: Claude Code
spec: brak — dokument szablonowy, bez zmian w kodzie
outcome: success
related: [AGENTS.md]
---

# Uniwersalna instrukcja pracy agenta do użycia w innych projektach

## Zadanie
Właściciel chce przekazać nowemu agentowi w innym projekcie plik z samym procesem pracy, bez stosu, architektury i poleceń Wine Match (agent w nowym projekcie odmawia przenoszenia cudzego stosu).

## Przebieg
Plik `docs/templates/AGENTS.generic.md`: proces (specyfikacje, logi, lekcje, weryfikacja dowodem, autonomia i decyzje zastrzeżone dla człowieka, pod-agenci, git i PR, bezpieczeństwo agenta), rozpoznanie projektu w pierwszej sesji, tabela „Projekt” do uzupełnienia, pytania startowe do właściciela i start prompt. Nie zawiera nazw ani zasad Wine Match.

## Weryfikacja
`node scripts/check-context.mjs`, `node scripts/secret-scan.mjs`; wyszukanie nazw projektu w pliku (brak trafień).

## Wynik
Plik w repozytorium; nie jest wczytywany automatycznie przez agentów Wine Match (leży w `docs/templates/`).

## Lekcje
brak
