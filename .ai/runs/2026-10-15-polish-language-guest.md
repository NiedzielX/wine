---
started: 2026-10-15 18:10
ended: 2026-10-15 18:45
agent: Claude Code / claude-opus-5-5 (sub-agent)
spec: .ai/specs/2026-10-15-polish-language.md
outcome: success
related: [.ai/specs/implemented/2026-10-15-guest-short-path-and-desktop.md]
---

# Polska wersja językowa — faza 1 (aplikacja gościa)

## Zadanie
Faza 1 zatwierdzonej specyfikacji: R1–R3, R5–R13 dla aplikacji gościa i wspólnych elementów `core`; infrastruktura słowników, którą panel (faza 2) wykorzysta. Gałąź `feat/i18n-guest`, bez commitów.

## Przebieg
- Core: `i18n/locale.ts` (`Locale`, `LOCALES`, `DEFAULT_LOCALE`, `Localized`, `isLocale`, `pickLocale`). W `scoring.ts` każdy `why` to para `{ en, pl }` przy regule (`add()`, `AFFINITIES`); `Factor.whyPl`; `explain`/`styleWord` z `locale`. `recommendForDish` (+ `budgetNotice`), `recommendForTable`/`tableWhy`, `tasteWords`, `styleLabel` (+ `STYLE_LABELS` bez zmian), `prefsSummary`, `upToPrice` — `locale = 'en'` domyślnie. `RecommendationService.forDish/wineDetails/forTable` przyjmują `locale`; trasy API go nie podają.
- App: `src/i18n/en.ts` (źródło kluczy, `common.*`, `guest.*`) i `pl.ts` (`satisfies Dictionary`); `server/i18n.ts` (`getLocale`, `getDictionary`, `getI18n`, `formatPrice` z NBSP w PL). Proxy: matcher `/admin`, `/r`; `x-wine-lang` (`?lang` → `wm_lang` tylko `/admin` → `Accept-Language`); `x-pathname` tylko `/admin` (na `/r` usuwany).
- Gość: `guestContext` → `locale`, `lang`, `t`, `href` (bound `hrefWith(path, prefs, extra, state)` — `lang` na końcu, tylko jawny), `langHrefs`. `LanguageSwitch` (G0 w nagłówku restauracji, pozostałe w top barze przed „Refine”). Wszystkie strony (G0–G9), `not-found`, metadane (`generateMetadata`), aria-labels, ceny przez `formatPrice`, ukryte `lang` w formularzach G5/G7 (i G9). `SelectionCount` dostaje gotowe teksty (listy po liczbie, żeby zachować polską odmianę).
- Ślepa uliczka: `Vary: Accept-Language` z proxy i z `next.config` `headers()` — Next.js 16 nadpisuje `Vary` stron (lekcja). Usunięte, odstępstwo w specyfikacji.
- Docs: SCREEN_SPECIFICATION (Wspólne zasady), BC §1 (`lang`), RECOMMENDATION_ENGINE (pary EN/PL), brief (D11, D06 superseded, Q04 closed, Coverage +1), `packages/app/AGENTS.md`.

## Weryfikacja
- `npm run lint` 0, `npm run typecheck` 0, `npm run check:boundaries` 0, `npm test` 0 (core 292, app 83 i pozostałe), `npm run build` 0.
- `next start` (memory, port 3003) + `node scripts/smoke.mjs http://localhost:3003 halka` → „All smoke checks passed” (170 ok, w tym nowe sprawdzenia PL, `?lang=en` przy polskiej przeglądarce i API po angielsku).
- Przeglądarka: G0, G3, G4, G5, G9 po polsku przy 390 px — `scrollWidth == innerWidth`, cele przełącznika 44×44 px; G0 przy 1440 px bez poziomego przewijania.
- Wyniki silnika bez zmian (testy: wynik i czynniki niezależne od języka), więc `engine:matrix` bez zmian.

## Wynik
Faza 1 gotowa. Do zrobienia: faza 2 (panel, R4, `wm_lang`, flash/import po kodzie, `format.ts`, BC §5), E2E strony startowej PL, przegląd słownictwa przez sommeliera (A7), `Vary` (R12) niemożliwe w Next 16.3 — strony są `no-store`.

## Lekcje
- `.ai/lessons/2026-10-15-nextjs-vary-header-overwritten.md`
