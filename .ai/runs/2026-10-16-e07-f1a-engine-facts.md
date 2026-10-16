---
started: 2026-10-16 16:35
ended: 2026-10-16 16:55
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-how-it-works-explanations.md
outcome: success
related: [.ai/specs/2026-10-16-how-it-works-explanations.md]
---

# E07 faza 1a: test golden silnika i `ENGINE_FACTS` w `core` (issue #37, epic #36)

## Zadanie
Zrealizować wyłącznie fazę 1a specyfikacji E07 („Jak to działa”): test golden wyników silnika na migawce z `main` (R8, Q16), nazwane stałe zamiast literałów w `recommend.ts`, `scoring.ts`, `table.ts`, nowy `engine/facts.ts` z zamrożonym `ENGINE_FACTS` i typem `EngineFacts`, eksport w `src/index.ts`, dokumentacja silnika (§4–§8). Zero zmiany wyników, `ENGINE_VERSION` bez zmian. Gałąź `feat/e07-f1a-engine-facts` od `origin/main`, PR do `main`, bez merge.

## Przebieg
- Przeczytane: `AGENTS.md`, `CLAUDE.md`, `packages/core/AGENTS.md`, `.ai/lessons.md` (+ `engine-calibration-matrix`, `posix-shell-in-scripts`, `npm-11-for-vitest-5`), `SDLC.md`, `BACKWARD_COMPATIBILITY.md` §7–§8, spec E07 (F1a, R5, R8, Q12, Q16, AC6/AC7). Środowisko: Node 22.23.3, `npx -y npm@11.20.0 install`.
- `npm run engine:matrix` na `main` (`35ec64d`) zapisany przed zmianami jako punkt odniesienia.
- **Commit 1 — test złoty** (`packages/core/tests/engine-golden.test.ts`, migawki `tests/__snapshots__/engine-golden.{dish,table-pairs,table-trios,rejected}.txt`, `toMatchFileSnapshot`), wygenerowany na niezmienionym kodzie silnika z `main`. Zestawy preferencji (18): domyślne, glass, bottle, każdy z 6 stylów, `maxPrice` 0 / 60 / 200, glass + 60, lighter, fuller, classic, adventurous. Dania: 15 × 18 + polski wariant (`why`, komunikat budżetu) dla każdego dania; pary: 105 × 18 w pełnym zapisie (~196 KB); trójki: 455 × 18 — pełny zapis miał 1,08 MB, więc jedna linia na trójkę ze skrótem FNV-1a 64-bit (bez `node:crypto` i `TextEncoder`, których `core` nie ma w typach) nad tymi samymi liniami co pary (~22 KB).
- **Sprawdzenie mutacyjne** (skrypt w scratchpadzie: podmiana stałej → test złoty → przywrócenie): `BEST_VALUE_WINDOW` 9, `BUDGET_FALLBACK_COUNT` 3, `TABLE_SOMMELIER_BONUS` 4, `TABLE_MAINS_WEIGHT` 1,6, `TABLE_LIMIT` 4, `SOMMELIER_BOOST` 7 — wszystkie wykryte; **`TABLE_REJECTED_CAP` 51 — niewykryte**: jedyna odrzucona para demo (sandacz × Produttori) ma wynik poniżej 50, więc limit nie działa na danych demo. Dopisany scenariusz „rejected”: sommelier odrzuca dodatkowo trzy najlepsze wina silnika dla każdego dania; dania (domyślne preferencje) i pary dań z pełną listą butelek (`limit = wines.length`), bo wino z limitem 50 nigdy nie wchodzi do pierwszej trójki. Migawkę scenariusza wygenerowano znów na kodzie z `main` (refaktor odłożony jako patch, przywrócony `git checkout`, commit 1 poprawiony `--amend`, patch nałożony ponownie). Po tym wszystkie 7 mutacji pada.
- **Commit 2 — refaktor:** `scoring.ts`: `MAX_SCORE = 99` w `clamp`; `recommend.ts`: `BUDGET_FALLBACK_COUNT = 2`, `BEST_VALUE_WINDOW = 8`; `table.ts`: `TABLE_LIMIT = 3` (domyślny `limit`), `TABLE_MAINS_WEIGHT = 1.5`, `TABLE_SOMMELIER_BONUS = 3` (z `MAX_SCORE`), `TABLE_REJECTED_CAP = 50`. Nowy `engine/facts.ts`: `ENGINE_FACTS = Object.freeze({...})` z 15 polami ze specyfikacji, typ `EngineFacts` = `{ readonly [K]: number }` (nie `typeof`, bo stałe mają typy literałów 72, 99… i AC6 nie mógłby podać kopii ze znacznikami). Eksport w `src/index.ts`. `engine.test.ts`: nowe `describe('ENGINE_FACTS')` — `Object.isFrozen` + zapis rzuca `TypeError`, równość z importowanymi stałymi, eksport z `src/index.ts`, limity listy i górna granica skali z `ENGINE_FACTS`; istniejące testy bez zmian. `rank ?? 99` w `compareItems` to wartownik rangi, nie skala — zostawiony.
- Docs: `docs/RECOMMENDATION_ENGINE.md` §4–§8 (nazwy stałych przy liczbach), §10 (test złoty, nowa podsekcja „Stałe silnika i `ENGINE_FACTS`” z tabelą). Spec: `status: in-progress`, notka F1a w „Realizacja”. `BACKWARD_COMPATIBILITY.md` bez zmian (nowe eksporty to dodanie, §8).

## Weryfikacja
- `npm run lint` — 0; `npm run check:boundaries` — 0; `npm run typecheck` — 0.
- `npm test` — 0: core 13 plików / 320 testów (w tym `engine-golden` 4/4 na migawce z `main`, `engine.test.ts` 31 z 4 nowymi), pozostałe pakiety 44 + 5 + 97 + 10, wszystkie zielone.
- `npm run build` — 0.
- `npm run engine:matrix` — `diff` z wynikiem z `main` pusty.
- `ENGINE_VERSION` = `wm-rules-1.0.0`, bez zmian.
- Sprawdzenie mutacyjne testu złotego: 7/7 zmian stałych wykrytych (po dopisaniu scenariusza „rejected”).

## Wynik
Faza 1a zrealizowana (PR do `main` z gałęzi `feat/e07-f1a-engine-facts`, bez merge; CI i komentarz self-QA w PR); brak zmian UI, API i danych. Pozostaje F1b (komponent, nazewnictwo, G3/G4/G7 i AC6 na słownikach), F2, F3 — poza tym przebiegiem. Spec zostaje `in-progress`.

## Lekcje
Zaktualizowana (bez nowej): `.ai/lessons/2026-10-14-engine-calibration-matrix.md` — test złoty dla warstwy rankingu i sprawdzanie migawki mutacją (dane demo mogą nie dotykać stałej).
