# CLAUDE.md

@AGENTS.md

Pełne zasady są w `AGENTS.md` (zaimportowany wyżej) i mają pierwszeństwo: struktura `.ai/` i konwencja nazw (§2), kolejność pracy (§6), weryfikacja (§6.1). Poniżej tylko to, co dotyczy Claude Code.

## Specyficzne dla Claude Code

- Każde zadanie wymagające specyfikacji zaczynaj w trybie planowania (Shift+Tab); gotowy plan zapisz jako specyfikację w `.ai/specs/`, a nie tylko w rozmowie. Gdy implementacja zbacza z planu (`AGENTS.md` §3, reguła 4), wróć do trybu planowania.
- Przegląd specyfikacji, eksplorację i weryfikację deleguj pod-agentom (Task), zgodnie z `AGENTS.md` §8. Dziedziczą te zasady; log prowadzi wyłącznie agent główny.
- Komendy dla powtarzalnych czynności zapisuj w `.claude/commands/` i commituj (`AGENTS.md` §8).
- Każdy pakiet w `packages/` ma `CLAUDE.md`, który importuje jego `AGENTS.md` — Claude Code wczytuje go automatycznie przy pracy w tym katalogu. Zasady architektury: `AGENTS.md` §1.
- Nie zapisuj ustaleń projektu wyłącznie w pamięci Claude (`#` / memory) — trwałe ustalenia projektu trafiają do `.ai/lessons/`, żeby widziały je też inne agenty i ludzie.
- Nazwy plików w `.ai/` i rozmiary plików agentowych sprawdza `npm run check:context`; uruchom go przed zakończeniem pracy, która je zmienia.
