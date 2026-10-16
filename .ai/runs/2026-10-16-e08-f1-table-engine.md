---
started: 2026-10-16 16:53
ended: 2026-10-16 17:05
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-whole-table-waiter-path.md
outcome: success
related: [.ai/runs/2026-10-16-e07-f1a-engine-facts.md]
---

# E08 faza 1: silnik stołu (`engineScore`, `table.fit`, `table.budget_relaxed`, `wm-rules-1.1.0`)

## Zadanie
Zaimplementować wyłącznie fazę 1 specyfikacji E08 (issue #42, epic #41): kroki 1–5 planu, AC1–AC6. Ranking i `overall` bez zmian (test złoty bez zmiany migawek), `tableFitThreshold` w `ENGINE_FACTS`, `ENGINE_VERSION = 'wm-rules-1.1.0'`, API `/api/v1` bez zmiany kształtu i bez luzowania budżetu. Bez zmian UI (równolegle E07 F1b). PR do `main`, bez merge.

## Przebieg
- Przeczytane: `AGENTS.md`, `CLAUDE.md`, `packages/core/AGENTS.md`, `.ai/lessons.md` (+ `engine-calibration-matrix`), `SDLC.md`, `BACKWARD_COMPATIBILITY.md` §7, spec E08.
- Gałąź `feat/e08-f1-table-engine` z `origin/main` w osobnym worktree; `npm@11.20.0 install` OK.
- Spec → `status: in-progress`.
- Krok 1 — `packages/core/src/engine/table.ts`: `TableDishScore.engineScore` (surowy `pairingScore`) i `rejected`; `TABLE_FIT_THRESHOLD = 70`; `tableFit(perDish, overall)` → `TableItem.fit`; `TableOptions { relaxBudget }` jako 7. parametr `recommendForTable` (istniejące wywołania bez zmian); pętla win przeniesiona do `build(ignoreBudget)` jak w `recommend.ts`; `TableResult.notice`. Warunek kompromisu wydzielony do `isCompromise` (wspólny dla `splitSuggested` i `fit.compromise`). Decyzja: luzowanie zwraca `min(limit, BUDGET_FALLBACK_COUNT)` pozycji, żeby wołający z `limit = 1` nie dostał więcej, niż prosił.
- Krok 2 — `ENGINE_FACTS.tableFitThreshold` (`facts.ts`), `ENGINE_VERSION = 'wm-rules-1.1.0'` (`scoring.ts`).
- Krok 3 — `prefs.ts`: `MAX_TABLE_DISHES = 12`, `canPairTable` (≥ 2 opublikowane poza deserami), `pickTableItem` (wybrane pierwsze, reszta w kolejności silnika; nieznane id → ta sama tablica). `RecommendationService.forTable(slug, ids, prefs, locale?, options?)` przycina opublikowane dania do 12 w podanej kolejności. Schemat API `tableRecommendationSchema` bierze limit z `MAX_TABLE_DISHES` (wartość ta sama, 12).
- Krok 4 — test trasy `POST /api/v1/recommendations/table` (`app/tests/unit/routes.test.ts`): klucze odpowiedzi, pozycji i `perDish` bez zmian, `maxPrice: 150` → `items: []` bez `notice`, `engineVersion = ENGINE_VERSION = wm-rules-1.1.0`. Trasa nie zmieniona (mapuje pola jawnie, więc nowe pola silnika nie wyciekają).
- Krok 5 — docs: `RECOMMENDATION_ENGINE.md` (nagłówek wersji, §6 luzowanie stołu tylko na ekranach, §8 wynik surowy vs rankingowy, `table.fit`, `table.budget_relaxed`, limit 12; §10 opis testów, wiersz `tableFitThreshold`, historia wersji), `BACKWARD_COMPATIBILITY.md` §7 (wersja, identyfikatory reguł stołu), przykłady `engineVersion` w `API_SPECIFICATION.md`.
- Sprawdzenie „ranking bez zmian” poza migawkami: tymczasowa kopia `origin/main:table.ts` (`table-old-probe.ts`) i test porównujący pełne listy `[wine.id, overall]` dla stołów 6 i 4 dań z AC3 — identyczne; oba pliki usunięte.
- Mutacje: `TABLE_FIT_THRESHOLD` 68 → 2 testy `table.fit` padają; usunięcie warunku `!d.rejected` → pada test odrzuconej pary. Przywrócone.
- Lekcja `engine-calibration-matrix` zaktualizowana (nowe pola obok rankingu test złoty przepuszcza; porównanie z poprzednią wersją modułu).
- Bez zmian UI, słowników i stron (E07 F1b równolegle).

## Weryfikacja
- `npm run lint` — 0 ostrzeżeń; `npm run check:boundaries` — OK; `npm run typecheck` — OK.
- `npm test` — wszystkie pakiety zielone (core 13 plików / 343 testy, app 7 / 98, pozostałe 3 / 44, 1 / 5, 2 / 10). Test złoty `engine-golden.test.ts` 4/4 **bez zmiany migawek** (migawki nie zawierają wersji silnika; `git status` nie pokazuje `__snapshots__`).
- `npm run build` — OK (granice, mockupy, Next.js z typecheckiem).
- `npm run engine:matrix` — bez zmian (`pairingScore` nietknięty; w `scoring.ts` zmieniona tylko stała `ENGINE_VERSION`).
- `npm run test:db` — **nie uruchomiony lokalnie**: brak Dockera (`docker: command not found`) i `TEST_DATABASE_URL`. Zmiana serwisu nie dotyka portów ani repozytoriów; pokrywa to job CI `database`.
- Przegląd stołów demo (Halka, `relaxBudget: true`, domyślne preferencje):

| Stół | Butelki (overall, fit) | Kieliszki | Notice |
|---|---|---|---|
| tatar + risotto + kaczka + sandacz | Leflaive 86 (4/4); Radikon 83 (4/4); Tempier 82 (4/4) | nie | — |
| śledź + przegrzebki + sandacz + seler + antrykot + jeleń | Radikon 73 (5/6, słabiej: jeleń 67, kompromis); Kumeu 72 (5/6, jeleń 68); Leflaive 72 (4/6, jeleń 59, antrykot 64) | tak | — |
| tatar + risotto + kaczka | Savigny 85 (3/3); Leflaive 84 (3/3); Radikon 83 (3/3) | nie | — |
| sandacz + antrykot | Radikon 75 (2/2, kompromis); Kumeu 74 (2/2, kompromis); Leflaive 74 (1/2, antrykot 64) | tak | — |
| burrata + boczek + pierogi | Turnau 80 (3/3); Tempier 79 (3/3); Radikon 78 (3/3) | nie | — |
| śledź + jeleń | Kumeu 69 (1/2, jeleń 68); Radikon 69 (1/2, jeleń 67); Lapierre 69 (1/2, jeleń 64) | tak | — |
| kaczka + risotto + czekolada | Savigny 86 (2/2); Leflaive 85 (2/2); Felton Road 84 (2/2) | nie | — |
| 4 dania jw., do 150 zł | Leflaive 86 (4/4, 340 zł); Radikon 83 (4/4, 320 zł) | nie | „Nothing matches under 150 zł…” |
| 4 dania jw., czerwone do 200 zł | Lapierre 82 (4/4, 230 zł); Savigny 79 (4/4, 320 zł) | nie | „Nothing matches under 200 zł…” |

  Wszystkie pary i trójki dań wytrawnych (286 stołów): pierwsza butelka pasuje do wszystkich dań w 237 (83%), częściowo w 49. Oczami sommeliera: „słabiej” trafia w dania, które faktycznie odstają (jeleń przy białych i pomarańczowych, antrykot przy Leflaive); „pasuje do obu, choć to kompromis” dla sandacza + antrykotu zgadza się z propozycją kieliszków. Anomalii nie znaleziono.

## Wynik
F1 gotowa: AC1–AC6 spełnione testami. Ranking, `overall` i odpowiedź API bez zmian; `engineVersion` = `wm-rules-1.1.0`. Do zrobienia: F2 (G11, po E07 F1b i E02 F1), F3 (G0, G6), F4 (ilość). Dług: brak.

## Lekcje
- Zaktualizowana: `.ai/lessons/2026-10-14-engine-calibration-matrix.md` (nowe pola obok rankingu test złoty przepuszcza; porównanie z poprzednią wersją modułu).
