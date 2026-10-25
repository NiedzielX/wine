---
started: 2026-10-25 15:15
ended: 2026-10-25 15:25
agent: Claude Code
spec: brak — drobna poprawka (usunięcie osieroconej kopii, dług z .ai/specs/implemented/2026-10-25-context-engineering.md)
outcome: success
related: [.ai/runs/2026-10-25-context-engineering.md, .ai/runs/2026-10-25-context-engineering-followups.md]
---

# Usunąć osieroconą kopię skilli `agent/skills`

## Zadanie
Właściciel: „zrób resztę z lekcji, żeby nic nie zostało”. Katalog `agent/skills` (347 plików, 42 skille) jest śledzony w git, różni się od `.agents/skills` (opisy zawinięte do wielu linii) i nie jest ładowany przez żadne narzędzie z repozytorium: Claude Code czyta `.claude/skills`, czyli dowiązania do `.agents/skills`. Dodany razem z `.agents/skills` w #87.

## Przebieg
- Sprawdziłem odwołania (`grep` po `agent/skills` w całym repo, `skills-lock.json`, CI, CODEOWNERS, `.claude/settings.json`): żadnych poza notatkami z lekcji 10. `skills-lock.json` zawiera tylko ścieżki źródłowe z `open-mercato/skills`.
- `git rm -r agent`. Zawartość pozostaje w historii git, więc usunięcie jest odwracalne.

## Weryfikacja
- `npm run check:context`: 0 błędów; `npm test -w @wine-match/testkit`: 126 testów zielone; `npm run secrets:scan`: bez nowych trafień.
- Skille w `.agents/skills` (42) i `.claude/skills` (dowiązania) bez zmian.

## Wynik
Usunięta osierocona kopia. Ryzyko: jeśli jakieś narzędzie poza repo czyta `agent/skills`, utraci te pliki; przywrócenie to `git revert`. Uwaga o bezpieczeństwie: skille wykonują instrukcje, więc mniej kopii to mniejsza powierzchnia przeglądu.

## Lekcje
brak
