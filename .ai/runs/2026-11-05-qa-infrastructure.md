---
started: 2026-11-05 13:00
ended: 2026-11-05 15:00
agent: Claude Code / claude-sonnet-5-5
spec: brak — infrastruktura QA z lekcji 12 (nie zmienia funkcji produktu)
outcome: success
related: [.ai/runs/2026-11-05-staff-code-test-flake.md]
---

# Infrastruktura QA: scenariusze Markdown, override skilla, test-env

## Zadanie
Lekcja 12 (testy integracyjne): właściciel polecił uzupełnić luki: brak `.ai/qa` ze scenariuszami, brak lokalnego override'u `om-integration-tests`, brak skryptów `test-env up/down`, niestabilny test (osobny PR #106) oraz powiązanie AC ze scenariuszami.

## Przebieg
- Lokalny override `.ai/skills/om-integration-tests/SKILL.md` i `references/best-practices.md` (15 zasad z lekcji plus dodatki projektu).
- Agenci: skrypty `.ai/scripts/test-env-up.sh` i `test-env-down.sh` według kontraktu `om-prepare-test-env`; 60 scenariuszy w `.ai/qa/{AREA}/` dla wszystkich `it` testów e2e, `README.md`, `INDEX.md` i `scripts/check-qa-scenarios.mjs`.
- Reguła scenariuszy w szablonie specyfikacji, `AGENTS.md` §6.1 i planie epików (PR #105); `check:qa` w jobie `lint`; `.gitattributes` dla skryptów `.sh`.

## Weryfikacja
- `npm run check:qa`: 60 scenariuszy, wszystkie powiązane z istniejącym `it` i wpisane w INDEX.
- Checker sprawdzony na kopii: zepsucie każdego warunku daje oczekiwany błąd.
- Skrypty `test-env`: `sh -n` oraz pełny przebieg (cold 22 s, warm 1 s, down bez śladów, down dwa razy) na lokalnym PostgreSQL 16 jako `TEST_DATABASE_URL`. Ścieżka Docker nie była uruchamiana.
- `npm run lint`, `npm run typecheck`, `npm run check:context`: bez błędów (jedno stare ostrzeżenie o rozmiarze specyfikacji kodów).

## Wynik
Infrastruktura gotowa. Do poprawy zostały testy oznaczone w scenariuszach jako słabe (guest-003, guest-009, staff-007, staff-009, staff-011) oraz testy zależne od poprzednich w tym samym pliku. Nie przeglądano scenariuszy dla przyszłych faz E12–E22; powstaną z ich implementacją.

## Lekcje
brak
