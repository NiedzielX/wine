---
started: 2026-11-27 10:00
ended: 2026-11-27 10:30
agent: Claude Code
spec: brak — porządkowanie specyfikacji (tylko dokumentacja `.ai/`)
outcome: success
related: [.ai/specs/implemented/2026-11-18-restaurant-picks.md, .ai/specs/implemented/2026-11-16-catalog-field-editing.md, .ai/specs/2026-11-18-owner-proof-report.md]
---

# Zamknięcie specyfikacji, których kryteria są spełnione na `main`

## Zadanie
Sprawdzić każde kryterium akceptacji trzech specyfikacji na `origin/main` i zamknąć te, które są spełnione (`status: implemented`, „Realizacja”, `git mv` do `implemented/`): wybory restauracji (faza 1), edycja pól katalogu (C1–C3), raport wyników dla właściciela (kroki 1–7). Bez zmian w `AGENTS.md`, `packages/*/AGENTS.md`, `.github/`, `scripts/`; bez push i PR.

## Przebieg
- Gałąź `docs/close-implemented-specs` z `origin/main` (6d24ec1) w izolowanym worktree; `origin/feat/results-report-s7-final` pobrane jawnymi refspecs. #201 nie jest na `main` (`git log origin/main`), więc raport wyników zostaje `in-progress`, a krok 7 opisano jako czekający na #201.
- Wybory restauracji: AC1–AC19 sprawdzone w kodzie (stałe i reguły w `ranking/restaurant-picks.ts`, blokada wiersza restauracji w `PgPicksRepository`, schema 3 i `readSnapshot`, migracja, klucz `pick` w zdarzeniach, zdanie G12 w słownikach, `restaurantPick` w `API_SPECIFICATION.md`, A27 w `scripts/smoke.mjs` z #195), w plikach testów (istnieją: `restaurant-picks`, `picks-*`, `snapshot-reader`, `published-view`, `access-boundaries-picks.e2e`, `migrations-roundtrip.integration`, scenariusze QA, wiersz T-40) i w logach PR0–PR3 (mutacje, `engine:matrix` przed/po, diff `engine/` pusty). Wszystkie spełnione; odstępstwa: brak wpisu w `packages/core/AGENTS.md` (R19, CODEOWNERS), inna numeracja QA, smoke `postgres` i testy `agent-browser` poza sesjami agentów. Status `implemented`, plik przeniesiony.
- Edycja katalogu: AC1–AC13, AC15–AC21 spełnione (testy serwisu i reguł, kontrakty, trasy `details`/`visibility`/`POST`, trzy pliki e2e, T-39 i T-41). AC14b nie robione (decyzja właściciela: „ukryte” = było widoczne i wycofane; szkic zostaje „jeszcze nieopublikowany”) i `edited_manually` w podglądzie importu (decyzja (f)) niezrobione: oba zapisane jako jawne odstępstwa, nie istotna część kryteriów, więc `implemented`. AC14b zostaje nieodhaczone z adnotacją.
- Raport wyników: AC1–AC13, AC15, AC19 spełnione na `main` (testy i logi), AC14 (test układu nieuruchomiony bez `agent-browser`), AC16 i AC17 (A34 i jej dokumentacja w #201), AC18 (`test:e2e` w CI) nieodhaczone. W3: R11 poprawiony (`stale_launch_day` -> `version_conflict`, 409; kod faktycznie używa `VersionConflictError`, `grep stale_launch_day` w kodzie pusty). Spec skrócony w kilku miejscach (rozwiązane uwagi przeglądu, wpisy Changelog), żeby po dopisaniu „Realizacja” zmieścić się w 40 960 B (40 944 B).
- Ścieżki specyfikacji w `.ai/qa/**` (`path:` we frontmatterze scenariuszy) zmienione na `implemented/`. Cudzych logów nie edytowano (w tym `2026-11-22-catalog-c2-c3.md` z `outcome: partial` i bez `ended`, o czym informuje „Realizacja”).
- Konflikt do rozwiązania przy scaleniu #201: ta gałąź i #201 oba zmieniają sekcję „Realizacja” specyfikacji raportu wyników (#201 ma jednolinijkowy wpis); należy zachować wersję z tej gałęzi i po scaleniu #201 przenieść plik.

## Weryfikacja
- `node scripts/check-context.mjs`: 0 błędów; 32 ostrzeżenia (z 35 na `origin/main`), bez nowych o rozmiarze (specyfikacja raportu wyników 40 944 B, poniżej progu; przeniesione do `implemented/` nie są sprawdzane pod kątem rozmiaru).
- `node scripts/check-qa-scenarios.mjs`: 164 scenariusze powiązane z istniejącym testem i wpisane w INDEX.
- `node scripts/secret-scan.mjs`: 22 trafienia, wszystkie na allowliście; brak innych wzorców sekretów.
- Testów kodu ponownie nie uruchamiano (zmiana wyłącznie w dokumentacji); oceny AC opierają się na kodzie, plikach testów i wynikach z logów PR-ów, co zaznaczono w „Realizacja” każdej specyfikacji.

## Wynik
Przeniesione do `implemented/`: wybory restauracji, edycja pól katalogu. Zostaje `in-progress`: raport wyników (czeka na #201: AC16, AC17; AC14 i AC18 wymagają CI z `agent-browser`).

## Lekcje
brak
