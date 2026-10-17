---
started: 2026-10-16 17:29
ended: 2026-10-17 10:30
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-how-it-works-explanations.md
outcome: success
related: [.ai/specs/2026-10-16-how-it-works-explanations.md, .ai/runs/2026-10-16-e07-f1b-explain-component.md, .ai/runs/2026-10-16-e08-f1-table-engine.md]
---

# E07 faza 3: wyjaśnienia „Jak to działa” w panelu (A1–A7, A11; issue #40, epic #36)

## Zadanie
Zrealizować wyłącznie fazę 3 specyfikacji E07 (zatwierdzona 2026-10-16, wszystkie ⚠ według rekomendacji; Q6 — rozbicie oceny — odłożone): `PanelExplain` z treściami `admin.explain.*` na A1, A2, A3, A4, A5, A6 (dwa: „Approved for guests” i kompaktowy w „Engine suggestions”), A7, A11 (A3/A5 wspólny `score`), poprawiony `admin.publish.showUnreviewedText` (Q4), liczby tylko z `ENGINE_FACTS`, teksty o stole zgodne z silnikiem po E08 F1 (`wm-rules-1.1.0`). Testy, smoke, `SCREEN_SPECIFICATION.md` (wiersze „Wyjaśnienie” A1–A7, A11). Bez stron gościa (równolegle E02 F1). Gałąź `feat/e07-f3-panel-explanations` od `origin/main` (`2a1a0f8`), PR do `main`, bez merge.

## Przebieg
- Odczyt: spec (F3, Inwentaryzacja panelu, R2–R6), `AGENTS.md`, `packages/app/AGENTS.md`, `SDLC.md`, lekcje (`ssr-page-tests-with-prerender`, `nextjs-loading-streams-and-http-status`). Sprawdzenie kodu pod teksty: `forDish` stosuje `showUnreviewed`, `forTable` nie; G6 — wynik ogólny przez `Score` (respektuje `showScores`), paski przy daniach zawsze z `%`; G9 zawsze z procentem; wina aktywne czytane na żywo (ukrycie działa bez publikacji); `markBestValue` (rola `best_value`, okno `BEST_VALUE_WINDOW`); E08 F1: `TableDishScore.score` z premią / limitem tylko do rankingu.
- Słowniki: `admin.explain.*` w `en.ts` / `pl.ts`, `admin.publish.showUnreviewedText` (Q4).
- Ekrany: A1, A2, A4 (pod nagłówkiem, poza `<p>`), A3 / A5 (`CardHeader`), A6 (dwa; kompaktowy przy tytule — tytuł `float-left`, treść `clear-both`, żeby otwarty tekst miał pełną szerokość nagłówka zamiast wąskiej kolumny obok tytułu, bez pozycjonowania absolutnego), A7 (pod paskiem postępu), A11 (`CardHeader` „Guest settings”). `PanelExplain`: `clear-both` w treści.
- Testy: nowy `tests/unit/explain-panel.test.ts`; `placementProblems` / `explainIds` przeniesione do `tests/unit/html.ts` (wspólne z `explain-pages.test.ts`). E2E A6, smoke panelu, `SCREEN_SPECIFICATION.md`.
- 2026-10-17: przerwa (limit API), wznowienie; rebase na `origin/main` (`f66c28f`, E10 F1) bez konfliktów.
- Ślepa uliczka przy pomiarach: ramka `iframe` do pomiaru przy 390 px zablokowana przez `X-Frame-Options: DENY` (oczekiwane); pomiary w panelu przeglądarki z emulacją rozmiaru. Ekrany list (`(lists)`, strumieniowanie) w ukrytym panelu kończą podmianę treści dopiero po zrzucie ekranu — pomiar zawsze po zrzucie.

## Weryfikacja
- `npm run lint` — 0; `npm run check:boundaries` — OK; `npm run typecheck` — 0; `npm test` — core 393, db 44, ui 9, app 156 (w tym `explain-panel` 27, `explain-pages` 12, `explain` 19, `admin-i18n` 11), testkit 10 — wszystko zielone; `npm run build` — 0.
- Smoke: `next start` z `DATA_SOURCE=memory`, `npm run smoke -- http://localhost:3417 halka` — „All smoke checks passed” (w tym nowe sprawdzenia A1–A7, A11, PL A6 / A11). Postgres i E2E — w CI (lokalnie brak `agent-browser`).
- Panel przeglądarki, zalogowany kontem demo z README (lokalna aplikacja), wszystkie wyjaśnienia otwarte: 1440 × 900 — A1, A2, A3, A4, A5, A6, A7, A11 `scrollWidth` = 1440 (zamknięte i otwarte); `summary` 24 px wysokości (≥ 24 × 24, kompaktowy 24 × 24); treść A6 `suggestions` 474 px = szerokość nagłówka karty. 390 × 844 — A1, A2, A3, A4, A5, A6, A11 `scrollWidth` = 390; A7 482 — przyczyna: istniejące nagłówki grup dań (`div.flex.shrink-0` z „No primary pick yet” + przyciski), nie wyjaśnienie (treść wyjaśnienia 308 px); poza zakresem F3. Konsola bez błędów aplikacji.
- Klawiatura (A6, kompaktowy): fokus na `summary`, Enter → otwarte, Spacja → zamknięte. Bez JS: natywny `<details>`, test SSR potwierdza brak skryptu potrzebnego do otwarcia; czytniki ekranu — do QA ręcznego.

## Wynik
F3 zrealizowane; spec zostaje `in-progress` (zostaje F2). Dług / follow-up: poziome przewijanie A7 przy 390 px (nagłówki grup dań) — istniejące, warte osobnej poprawki.

## Lekcje
brak (zachowanie panelu przeglądarki przy strumieniowaniu to cecha narzędzia, nie projektu — opisane w logu)
