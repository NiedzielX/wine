---
started: 2026-11-06 10:00
ended: 2026-11-06 13:10
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
outcome: success
related: []
---

# E22 F1: kalkulator zwrotu (roi.ts, SHOWCASE_MODE off/calculator, layout (showcase), DM2 i DM3)

## Zadanie
Faza F1 specyfikacji E22: czysty rachunek `core/src/showcase/roi.ts`, zmienna `SHOWCASE_MODE` (`off`/`calculator`), grupa tras `(showcase)`, ekrany DM2 (`/demo/roi`) i DM3 (`/demo/roi/summary`), i18n PL/EN, noindex, licznik `showcase_view`, smoke, dokumentacja. Poza zakresem: F2–F4 (tryb `demo`, przewodnik, panel i KPI, katalog planów).

## Przebieg
Kolejność ze specyfikacji: (1) roi.ts + testy, (2) env + testy, (3) layout, DM2, i18n, (4) DM3 i druk, (5) smoke i dokumentacja. Spec ustawiony na `in-progress` (F2–F4 otwarte).

## Weryfikacja
Node 22, `npm ci` z npm 11.20.0, PostgreSQL 16 na porcie 50312 (własny serwer, zatrzymany na końcu).
- `npm run lint` 0; `npm run typecheck` 0; `npm test` (core 702, db 73, ui 62, app 439, testkit 158 testów) zielone.
- `npm run build` 0 (w tym `check:boundaries`, `check:design`); `npm run boot:check` zielone; `npm run check:context` 0 błędów (10 ostrzeżeń, w tym rozmiar specyfikacji E22 po „Realizacji”); `npm run check:qa` 78 scenariuszy; `npm run secrets:scan` 0.
- `next start` (memory, `SHOWCASE_MODE=calculator`): `npm run smoke -- http://127.0.0.1:3472 halka` All smoke checks passed; `npm run smoke -- --showcase …` All showcase smoke checks passed.
- E2E (zwykłe HTTP, wbudowana aplikacja na PostgreSQL z `SHOWCASE_MODE=calculator`): `showcase.e2e.test.ts`, `health.e2e.test.ts`, `observability.e2e.test.ts` 11/11. Pozostałych e2e (agent-browser) nie uruchamiano: brak narzędzia.
- Panel przeglądarki: `/demo/roi?lang=pl` przy 1440 px (dwie kolumny, brak poziomego przewijania, brak cookie i localStorage, brak zasobów spoza domeny), `/demo/roi` z wartościami skrajnymi przy 390 px (scrollWidth = 390, brak NaN), `/demo/roi/summary` przy 390 px (brak poziomego przewijania, brak błędów w konsoli, przycisk „Drukuj” widoczny z JS). Reguła `@media print{.print\:hidden{display:none}}` i `@page` A4 są w CSS odpowiedzi. Nie sprawdzono emulacji druku ani liczby stron.

## Wynik
F1 gotowe poza punktami opisanymi w „Realizacji” specyfikacji (AC1 i AC2 w części F2, AC8 bez emulacji druku, AC15 bez listy żądań przeglądarki). Gałąź `feat/e22-f1-roi-calculator` wypchnięta, PR otwiera sesja nadrzędna.

## Lekcje
[2026-11-06-calculator-numbers-from-urls](../lessons/2026-11-06-calculator-numbers-from-urls.md)
