---
started: 2026-10-18 10:00
ended: 2026-10-18 16:30
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-whole-table-waiter-path.md
outcome: success
related: [.ai/runs/2026-10-16-e08-f1-table-engine.md, .ai/runs/2026-10-17-e08-f3-guest-whole-table.md, .ai/runs/2026-10-17-e09-f1-recommendation-code.md, .ai/runs/2026-10-17-e02-f2-f3-events.md]
---

# E08 F2 — ekran kelnera dla całego stołu (G11 `/r/{slug}/staff/table`)

## Zadanie
Faza 2 specyfikacji E08 (kroki 6–10 planu, R5–R7, R11–R13, AC7–AC12), issue #43 (epic #41): nowy publiczny ekran kelnera G11 bez JS — kafle dań (wspólny `TableDishPicker` z G5), wiersz kotwic kategorii, wyszukiwanie dań z JS, budżet na butelkę, kolor w `<details>`, komunikat przy ucięciu do 12 dań; wynik nad formularzem („Ta butelka: nr … ”, linia dopasowania, wyniki per danie z `engineScore`, do 2 alternatyw z „Wybierz tę” `prefetch={false}`, kieliszki, desery), kod polecenia E09 (`source: 'staff'`, jeden kod na wynik), zdarzenie `staff_table_lookup`, przełącznik „Jedno danie / Cały stół” na G9 i G11, własne wyjaśnienie `guest.explain.staffTable`. Bez G8 (równolegle inny agent), bez F4.

## Przebieg
- Gałąź `feat/e08-f2-waiter-table` z `origin/main` (0f93477), `npm install` (npm 11.20.0, Node 22).
- Przeczytane: spec E08, AGENTS.md, packages/app/AGENTS.md, lekcje (`ssr-page-tests-with-prerender`, `e2e-without-javascript`, `nextjs-headers-hide-router-prefetch`, `postgres-without-docker`, `sticky-bars-scroll-padding`, `css-grid-min-width`), SDLC.md; kod G5/G6/G9/G8, `guest-ui.tsx`, `issueCodeForPage`, `UsageEventService`.
- core: `staff_table_lookup` w `GUEST_EVENT_NAMES` i w unii `UsageEvent` (`wineId?`, `pickedWineId?`, `prefs`, `splitSuggested`, `budgetRelaxed`); `UsageEventService.record` zapisuje `wine_id` tylko, gdy jest podany.
- app: `TableDishPicker` (warianty `rows` — G5 bez zmiany wyglądu — i `tiles` — G11), `StyleChoice`, `BudgetChoice` w `guest-ui.tsx`; G5 przepięty na nie. `DishSearch` (klient, tylko z JS), `CodeForWaiter` z `labels`/`compact`, `inMenuOrder` w `server/guest-page.ts`. Strona G11 `r/[slug]/staff/table/page.tsx`; `ModeSwitch` na G9. i18n EN/PL.
- Ślepa uliczka: `setState` w `useEffect` dla „tylko z JS” — oxlint `set-state-in-effect`; zamiana na `useSyncExternalStore` (lekcja).
- Decyzje: PL „Cały stolik” (spójnie z istniejącym przełącznikiem); propozycja kieliszków bez linków (linki na G7 przeniosłyby `sid` kelnera na ekrany gościa); wyszukiwanie dań ignoruje znaki diakrytyczne i „ł”.
- Testy: `app/tests/unit/staff-table.test.ts` (18), `i18n.test.ts` (AC10), `usage-events.test.ts` (G11 w liście stron z `sid`), `core/tests/usage-events.test.ts`, E2E `app/tests/e2e/staff-table.e2e.test.ts` (5), `scripts/smoke.mjs` (10 sprawdzeń G11/G9).
- Docs: `SCREEN_SPECIFICATION.md` (G11, katalog, G9), `SCREEN_MAP.md`, `USER_FLOWS.md` §5, `USER_ROLES.md`, `BACKWARD_COMPATIBILITY.md` §1; spec: AC7–AC12 odhaczone, notka F2 w „Realizacja” (status zostaje `in-progress` — F4 przed nami).

## Weryfikacja
- `npm run lint` 0, `npm run check:boundaries` OK, `npm run typecheck` 0, `npm test` 0 (core 429, app 261, pozostałe pakiety zielone), `npm run build` 0 (trasa `ƒ /r/[slug]/staff/table`).
- `npm run test:db` na `embedded-postgres` (własny katalog `scratchpad/e08f2pg`, port 54352): wszystkie zielone.
- Smoke: `next start` memory (3471) i postgres (3472) + `npm run smoke`: „All smoke checks passed” w obu.
- E2E (`npm run test:e2e` lokalnie: agent-browser 0.39.1 poza repo + systemowy Chrome + embedded-postgres): 7 plików, 39 testów zielonych, w tym `staff-table.e2e.test.ts` (bez JS: 4 kafle + „Show the bottle” → wynik; kafle ≥ 48 px; `scrollWidth ≤ innerWidth` przy 390 i 1440 px; AC12 i kody na PostgreSQL; z JS po 2 s na prefetch — 1 kod).
- QA w panelu przeglądarki (postgres, 390 × 844): 4 dania stołu (tatar, risotto, sandacz, kaczka) widoczne bez przewijania; 4 dotknięcia kafli + „Show the bottle” = 5 dotknięć → „This bottle: No. 107 Domaine Leflaive Mâcon-Verzé.”, „Works with all 4 dishes.”, kod `X2R`, 2 alternatywy; w bazie 1 `staff_table_lookup` i 1 kod (`staff`, `table`) — prefetch alternatyw nie wydał kodu. „Choose this one” (Radikon) → butelka nr 109, nowy kod, Leflaive i Tempier jako alternatywy. `scrollWidth` 390 = 390; kafle 48–74 px. PL: „Szukaj dania” filtruje („sledz” → „Śledź bałtycki”, pusta sekcja ukryta). 1440 × 900, PL, 6 dań z AC3: „Ta butelka: nr 109 Radikon Slatnik.”, „Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.”, `scrollWidth` 1440; konsola bez błędów.

## Wynik
F2 gotowe: AC7–AC12 spełnione. Do zrobienia: F4 (ilość dla liczby osób). Dług: stan „Nic nie pasuje” na G11 nie ma przypadku w danych demo (bez testu SSR).

## Lekcje
- `.ai/lessons/2026-10-18-script-only-ui-use-sync-external-store.md`
