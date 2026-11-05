---
started: 2026-11-05 18:20
ended: 2026-11-05 18:35
agent: Claude Code / claude-sonnet-5-5
spec: brak — drobna poprawka procesu i linków
outcome: success
related: [.ai/runs/2026-11-04-e11b-recommendation-code-close.md]
---

# `merge=union` dla plików, do których dopisuje każdy PR, i poprawa linków do specyfikacji E11b

## Zadanie
Każdy PR dopisuje linię na górze `.ai/lessons.md` (i wiersz w `.ai/qa/INDEX.md`), więc kolejne PR-y w kolejce za każdym razem miały konflikt (tej doby: pięć razy). Po przeniesieniu specyfikacji E11b do `implemented/` linki w innych dokumentach prowadziły donikąd.

## Przebieg
- `.gitattributes`: `merge=union` dla `.ai/lessons.md` i `.ai/qa/INDEX.md`. Zachowanie sprawdzone w tymczasowym repozytorium (dwie gałęzie dopisują różne linie w tym samym miejscu: scalenie bez konfliktu, obie linie zostają).
- Linki `.ai/specs/2026-10-16-recommendation-code.md` → `.ai/specs/implemented/…` w specyfikacjach, planie, backlogu i briefie (13 plików). Nie ruszałem logów przebiegów (są niezmienne, `AGENTS.md` §4) ani `2026-11-04-staff-accounts-and-roles.md` (zmienia ją otwarty PR #118: poprawię po jego scaleniu).

## Weryfikacja
`npm run check:context`, `npm run check:qa`, `npm run secrets:scan`; brak zmian w kodzie.

## Wynik
`union` nie rozstrzyga konfliktów znaczeniowych (dwie wersje tej samej linii zostaną obie), ale dla plików typu „dopisz linię na górze” jest właściwe. README obszarów QA (tabela) nadal może dawać konflikt, bo wiersze są w środku tabeli.

## Lekcje
brak
