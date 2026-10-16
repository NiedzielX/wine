---
started: 2026-10-16 16:53
ended: 2026-10-16 17:25
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-how-it-works-explanations.md
outcome: success
related: [.ai/specs/2026-10-16-how-it-works-explanations.md, .ai/runs/2026-10-16-e07-f1a-engine-facts.md]
---

# E07 faza 1b: komponent `InfoDisclosure`, nazewnictwo etykiet i wyjaśnienia na G3/G4/G7 (issue #38, epic #36)

## Zadanie
Zrealizować wyłącznie fazę 1b specyfikacji E07 („Jak to działa”, zatwierdzona 2026-10-16, wszystkie decyzje ⚠ według rekomendacji): `InfoDisclosure` w `@wine-match/ui/brand` (AC1), nakładki `Explain` (gość) i `PanelExplain` (panel), `ScoreBadge` z `sr-only` (AC14), `Score` ze zlokalizowanym `aria-label` i bez liczby przy `showScores=false` (AC8), słowniki `guest.explain.{wines,filters,wine}` z liczbami z `ENGINE_FACTS` (AC5, AC6), nazewnictwo R7/Q1 („Para sommeliera” / „Polecane do Twojego dania”) u gościa, kelnera i w panelu, hero i stopka G3 (Q5), ekrany G3, G4, G7 (+ Q13: bez `MatchGlass` na G7 bez wyniku i na G8), smoke/E2E i dokumentacja z listy specyfikacji. Bez G12 (F2) i bez treści panelu (F3). Równolegle E08 F1 zmienia `table.ts` / `facts.ts` — tych plików ani `ENGINE_VERSION` nie ruszam. Gałąź `feat/e07-f1b-explain-component` od `origin/main` (`25a7dc3`), PR do `main`, bez merge.

## Przebieg
- Przeczytane: `AGENTS.md`, `CLAUDE.md`, `packages/{app,ui,core}/AGENTS.md`, `.ai/lessons.md` (+ `ssr-html-assertions-and-test-races`, `sticky-bars-scroll-padding`, `css-grid-min-width`), `SDLC.md`, `CODE_REVIEW.md`, spec E07 (F1b, R1–R11, AC1–AC17, Inwentaryzacja), log F1a. Środowisko: Node 22 (`/opt/homebrew/opt/node@22`), `npx -y npm@11.20.0 install`.
- Sprawdzone: komponenty serwerowe stron gościa (async) renderują się w Vitest przez `react-dom/static` `prerender` z istniejącymi atrapami `next/headers` — test SSR stron (AC2, AC3, AC8–AC10, AC13) może leżeć w `app/tests/unit` bez przeglądarki.
- `ui`: `InfoDisclosure` (`<details>`/`<summary>`, ikona „i” `aria-hidden`, wariant kompaktowy z `sr-only`, `data-explain` z `explainId`, bez `title`/`name`/JS) + test AC1; eksport w `src/index.ts`.
- `app`: `Explain` (gość: `min-h-11`, `ink-2`, ikona `wine`, treść `bg-surface` / `bg-paper` w arkuszu), `PanelExplain` (panel, nieużyty do F3), `ScoreBadge` z `sr-only`, `Score` z `matchLabel` / `glassLabel`, `RecoFooter(showUnreviewed)` w `ink-2`.
- Słowniki: `guest.explain.{wines,filters,wine}` jako funkcje `(facts, ctx)`; etykiety R7 (gość, kelner, panel), hero Q5, stopka. Pierwsza wersja G3 miała 128 słów (EN) / 117 (PL) przy limicie 110 — skrócona punkt po punkcie; „below the best match” zamienione na „top wine”, bo grep kontrolny łapie „best match”.
- Ekrany: G3 (`wines`), G4 (`filters`), G7 (`wine`, Q13: kieliszek tylko z wynikiem, z G6 bez wyniku), G8 bez kieliszka.
- Testy: `explain.test.ts` (dictionary: AC5, AC6 ze znacznikami 1001…, limity, AC8, AC9, AC10, AC16 kontrast z `guest.css`), `explain-pages.test.ts` (SSR: AC2, AC3, AC8–AC10, AC13, AC14, `PanelExplain`); E2E: `home` (G3 `count`, otwarcie), `admin` (A11 → G3 przy wyłączonych ustawieniach, przywrócenie w `afterAll`; `check`/`uncheck` z CLI `agent-browser`). Smoke: nowe i zakazane napisy na G1, G3 (EN/PL, danie bez pary), G4, G7 (z G6 bez kieliszka), G8, G9, A1, A6 (EN/PL, `sr-only` zamiast `title`), A7, A11.
- Docs (lista ze spec + grep kontrolny): `AGENTS.md` §7, `CODE_REVIEW.md`, `README.md`, `docs/API_SPECIFICATION.md`, `docs/RECOMMENDATION_ENGINE.md` §5, `docs/SCREEN_SPECIFICATION.md`, `docs/USE_CASES.md`, `docs/PRODUCT_CONCEPT.md`, `docs/USER_ROLES.md`, `core/src/auth/permissions.ts`, brief (R01 → superseded przez R06, glosariusz). `table.ts`, `facts.ts`, `ENGINE_VERSION` — bez zmian (równoległe E08 F1).

## Weryfikacja
- `npm run lint` 0, `npm run check:boundaries` 0, `npm run typecheck` 0, `npm test` 0 (core 320, db 44, ui 9, app 128, testkit 10), `npm run build` 0.
- Smoke: `next start` w `DATA_SOURCE=memory` (port 3417) → `npm run smoke -- http://localhost:3417 halka`: „All smoke checks passed” (210 kontroli). `postgres` lokalnie niedostępny (brak Dockera i serwera PG) — smoke na PostgreSQL i E2E sprawdza CI.
- Grep kontrolny ze spec: trafienia wyłącznie w listach zakazanych napisów (asercje negatywne w `smoke.mjs`, `explain.test.ts`, `explain-pages.test.ts`).
- Przeglądarka (panel przeglądarki Claude, `next start` memory): 390 × 844 — G3 PL kaczka: `summary` 44 px wysokości (jedna linia), karta pierwszego wina na 330 px (AC15 ≤ 520); klawiatura: fokus na `summary` (`:focus-visible` = true), Enter otwiera, Spacja zamyka (AC3, z JS); brak błędów w konsoli. `scrollWidth == clientWidth` przy 390 i 1440 px z otwartymi wszystkimi `<details>` na: G3 (kaczka, najdłuższa nazwa dania „Burrata & roasted pumpkin”), G3 + arkusz G4, G7 (z daniem / bez dania / z G6), G8 (AC4 dla F1b). Liczba `svg[role=img]`: G7 z daniem 1, bez dania 0, z G6 0, G8 0.
- Bez JS: HTML serwera bez żadnego `<script>` wyrenderowany w Chrome headless (G3 i G4 1440 px, zamknięte / otwarte przez atrybut `open`) — układ identyczny; `<details>` jest natywny. Zachowanie klawiatury bez JS (Chrome/Safari) i czytniki ekranu (VoiceOver iOS, TalkBack) — do ręcznego QA (AC3, R2), nie wykonane w tym przebiegu.
- CI PR #57: pierwszy przebieg — `e2e` czerwony: selektor `aria-label^="Match "` łapał też nazwę kieliszka bez liczby („Match shown by how full the glass is”), a przerwany test zostawił przeglądarkę na G3, więc kolejne testy panelu padły. Poprawka: selektor `aria-label$=" percent"`, przywrócenie ustawień w `finally`. Drugi przebieg (run 38922573004): lint, unit, build, database, e2e — wszystkie zielone.
- Kontrast (test): `ink-2` na `paper` 6,7:1, na `surface` > 4,5:1; `wine` ≥ 3:1; `ink-3` 3,7:1 — nieużyty w `Explain` i `RecoFooter`.

## Wynik
F1b zrealizowana; PR do `main` z gałęzi `feat/e07-f1b-explain-component` (bez merge). Spec zostaje `in-progress` (F2, F3). Do zrobienia poza F1b: G12 i link w stopce (F2), wyjaśnienia G0/G1/G5/G6/G8/G9 i zdjęcie pieczęci z nagłówka G6 (F2), treści panelu i `showUnreviewedText` (F3). Ręcznie przy QA: czytniki ekranu, klawiatura bez JS w Safari.

## Lekcje
- `.ai/lessons/2026-10-16-ssr-page-tests-with-prerender.md` (nowa).
