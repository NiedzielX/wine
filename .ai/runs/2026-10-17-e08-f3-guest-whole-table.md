---
started: 2026-10-17 11:10
ended: 2026-10-17 11:45
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-whole-table-waiter-path.md
outcome: success
related: [.ai/runs/2026-10-16-e08-f1-table-engine.md, .ai/specs/2026-10-16-how-it-works-explanations.md]
---

# E08 faza 3 — „Cały stół” u gościa: karta na G0, uczciwy wynik na G6

## Zadanie
Faza 3 specyfikacji E08 (issue #44, epic #41), krok 11–12 planu: karta „Cały stół” na G0 (`canPairTable`, przycisk w nagłówku tylko bez karty — R8, AC13); G6 z surowym procentem per danie (`engineScore`), linią dopasowania „n z m” zamiast `why` (karta i alternatywy), `notice` luzowania budżetu (`relaxBudget: true`), bez liczb przy `showScores = false` (R9, AC14, AC15); akapit E08 w jedynym „i” G6 (`guest.explain.tableResult`, R11). Bez innych faz. Gałąź `feat/e08-f3-guest-whole-table` od `origin/main` (1a40e9a).

## Przebieg
- 11:10 Przeczytane: spec E08 (całość), E07 (G6, Q4, Q15, R2/R3/R6), AGENTS/CLAUDE/app AGENTS, lekcje (`ssr-page-tests-with-prerender`, `sticky-bars-scroll-padding`, `css-grid-min-width`, `ssr-html-assertions-and-test-races`). Na `main`: E08 F1 (silnik), E07 F1a/F1b/F3, E02 F1. G0 i G6 nie mają jeszcze `Explain` (E07 F2) — dodaję tylko akapit E08 do nowego klucza `guest.explain.tableResult` (summary z E07).
- F2 (G11) nie jest scalona, więc `TableFitLine`, `DishScores` i `guest.tableFit.*` powstają tutaj (spec przypisuje je F2 krok 6–7); F2 użyje ich na G11.
- `budgetRelaxed` w `table_recommendation_viewed` czeka na E02 F2 (zdarzenie jeszcze nie istnieje na `main`; robi je inny agent) — nie dodaję.
- 11:15 i18n (`guest.landing.tableCard*`, `guest.tableFit.line(TableFitText)` — dobór szablonu R12 w słowniku, `guest.explain.tableResult.points(facts, { showScores })`), komponenty `TableFitLine` / `DishScores` (pieczęć z `sr-only` zamiast `title`), G6 (`relaxBudget`, `notice`, linia dopasowania, `engineScore`, bez liczb przy `showScores=false`, `Explain` nad kartą poza linkiem), G0 (karta, przycisk w hero tylko bez karty).
- Test SSR: najpierw `d_*` z danych demo — w kontenerze testowym id dań są inne (UUID), więc id po nazwie z `publishedMenu`. Asercja „brak liczb” trafiała w `style="width:83%"` i `%2C` w linkach — sprawdzam tekst bez tagów (dopisane do lekcji).
- Tekst A11 (`admin.explain.publish`) mówił, że „Cały stół” zawsze pokazuje procenty — po F3 nieprawda (E07 Q4: „zdanie do usunięcia, gdy E08 to naprawi”); poprawiony w PL/EN i w `SCREEN_SPECIFICATION.md`.
- Smoke: nagłówkowy „Pair a bottle for the table” zastąpiony kartą; nowe sprawdzenia G6 (6 dań PL/EN, budżet 200/150 zł, `data-explain="tableResult"`). E2E `home`: karta G0 i budżet G6.
- Docs: `SCREEN_SPECIFICATION.md` (G0, G6, A11), `USER_FLOWS.md` §2 (nowy przykład z surowymi wynikami: tatar 83, risotto 90, kaczka 80 → Savigny 85), `USE_CASES.md` (wejście UC-03). Spec: AC13–AC15 [x], notka F3 w „Realizacja”.

- 12:10 Konflikt z `main` po E02 F2+F3 (#63, zdarzenie `table_recommendation_viewed` na G6): rebase, rozwiązany import (`ENGINE_FACTS` + `MAX_TABLE_DISHES`), obie zmiany zachowane. Dodane `budgetRelaxed` (R13: `result.notice !== null`) w typie zdarzenia (`core/services/guest/usage-events.ts`), na G6, w `SCREEN_SPECIFICATION.md` (katalog i G6) i w testach (`usage-events.test.ts`: `false` dla zwykłego stołu, `true` i 2 butelki przy `maxPrice=150`).

## Weryfikacja
- `npm run lint` (0 ostrzeżeń), `npm run check:boundaries` OK, `npm run typecheck` OK, `npm test`: core 403, db 44, testkit 9, app 183 (w tym nowy `table-guest.test.ts`, 13 testów), ui 10 — wszystkie zielone. `npm run build` OK.
- `next start` `DATA_SOURCE=memory ALLOW_DEMO_DATA=true` + `npm run smoke -- http://localhost:3187 halka`: 221 × ok, „All smoke checks passed”.
- QA w panelu przeglądarki przez proxy usuwający `<script>` (`document.scripts.length = 0`, czyli bez JS):
  - G0 390 × 844 EN: karta „Several dishes on the table?” na 283 px, przycisk 308 × 44 px, „Pick your dish” na 496 px, brak przycisku w hero, `scrollWidth = 390`. PL: „Kilka dań na stole?”, przycisk 44 px, `scrollWidth = 390`. 1440 × 900 PL i EN: karta przed „Wybierz danie” / „Pick your dish”, brak przycisku w hero, `scrollWidth = 1440`.
  - G6 6 dań (AC3) 390 PL: „Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.” (Radikon Slatnik 73%), alternatywy „5 z 6” i „4 z 6”, jedno `[data-explain]`, `scrollWidth = 390` z otwartym wyjaśnieniem; 1440 EN: „Works with 5 of 6 dishes, less so with: Venison loin.”, wiersze 75/81/82/88/72/67% (surowe), `scrollWidth = 1440`; 390 EN `scrollWidth = 390`.
  - G6 budżet 390: `styles=red&maxPrice=200` EN — „Nothing matches under 200 zł. These are the closest options.”, 2 butelki (Morgon, Savigny-lès-Beaune), brak „No bottle fits”; `maxPrice=150` PL — „Nic nie mieści się w budżecie do 150 zł. Oto najbliższe propozycje.”, 2 butelki (Mâcon-Verzé, Slatnik); `scrollWidth = 390`.
  - Konsola (G0 z JS): brak błędów.
  - `showScores = false`: test SSR (PL i EN: brak „N%” w tekście `<main>`, brak „Overall match”, paski zostają); w przeglądarce nie przełączane (wymaga zalogowania do panelu).
- Spostrzeżenie: nazwa dania z przecinkiem („Dry-aged ribeye, 300 g”) w liście „słabiej do: …” czyta się dwuznacznie — zgodne z R12 (przecinek), do rozważenia przy F2.

## Wynik
F3 zrealizowana: G0 z kartą „Cały stół”, G6 z uczciwym wynikiem (surowy procent, „n z m”, luzowanie budżetu, `showScores`), akapit E08 w jedynym „i” G6. Do zrobienia poza F3: F2 (G11 — użyje `TableFitLine`, `DishScores`, `guest.tableFit`), F4 (ilość), zdjęcie pieczęci z nagłówka G6 i punkty E07 w `guest.explain.tableResult` (E07 F2).

## Lekcje
- Zaktualizowana: `.ai/lessons/2026-10-14-ssr-html-assertions-and-test-races.md` (asercje „brak liczb” na tekście, QA bez JS przez proxy).
