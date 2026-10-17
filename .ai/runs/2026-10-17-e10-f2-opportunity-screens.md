---
started: 2026-10-17 11:00
ended: 2026-10-17 11:25
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-sommelier-opportunities.md
outcome: success
related: [.ai/runs/2026-10-16-e10-f1-opportunities-core.md, .ai/runs/2026-10-16-e07-f3-panel-explanations.md]
---

# E10 F2: ekrany okazji (A6 karta, A14 skrzynka, linia na A1)

## Zadanie
Faza 2 specyfikacji `2026-10-16-sommelier-opportunities` (issue #52, epic #50): kroki 7–10 planu — teksty PL/EN, trzy akcje serwerowe, komponent `opportunity-list.tsx`, karta na A6, strona A14 poza `(lists)`, pozycja w nawigacji, linia „Okazje: n” na A1 (Q19), smoke, E2E, docs. Bez innych faz. Gałąź `feat/e10-f2-opportunity-screens` z `origin/main`, PR do `main`, bez merge.

## Przebieg
- Przeczytane: `AGENTS.md`, `CLAUDE.md`, `packages/app/AGENTS.md`, `.ai/lessons.md` (+ `postgres-without-docker`, `ssr-page-tests-with-prerender`), `SDLC.md`, `CODE_REVIEW.md`, spec (F2 i powiązane R/AC), kod F1 (`OpportunityService`, `findOpportunities`, `addSuggestion`) i E07 (`PanelExplain`, testy `explain-panel`).

- Teksty (`en.ts`, `pl.ts`): `admin.opportunities.*` (zdania S1–S5, w tym S4/S5 na F3/F4), `admin.explain.opportunities.points(days)`, `nav`/`meta.opportunities`, `dashboard.opportunities`, flash i 6 kodów błędów. `opportunity_dismissed` dostaje liczbę dni z `DISMISS_DAYS` w `messages.ts` (bez literału 30).
- Akcje w `[slug]/actions.ts` przez `act(form, 'pairings.decide', …)` (sesja, uprawnienie, `revalidatePath(..., 'layout')`, `safeBack`, flash).
- `_components/opportunity-list.tsx` (serwerowy, zdanie z `evidence`, formularze bez JS, bez przycisków dla ról bez `pairings.decide`); karta na A6 nad „Approved for guests” tylko przy okazjach, z własnym `PanelExplain id="opportunities"`; A14 `[slug]/opportunities/page.tsx` (poza `(lists)`, `force-dynamic`, `degraded` → `logger.warn` + uwaga, `EmptyState`, `<details>` „Ignored (n)” z „Restore”); `AdminNav` „Opportunities” po „Review queue” bez licznika; linia „Opportunities: n” na A1 (Q19, `scope: 'dish'`).
- Ślepa uliczka (E2E bez JS): `network route '**/*.js' --abort` po zalogowaniu nie działał (skrypty z cache), a `:has-text` nie jest obsługiwany → trasa przed pierwszą stroną, kliki przez `eval`. Lekcja niżej.
- Decyzje (doprecyzowania w spec, „Realizacja”): słownictwo PL panelu („parowanie”, „podstawowe”), flash po „Dodaj” bez „poniżej”, S1 w A14 bez zdublowanego linku w wierszu, linia A1 tylko przy n > 0.
- Docs: `SCREEN_SPECIFICATION.md` (A1, A6, nowa sekcja A14), `SCREEN_MAP.md` (A14, uprawnienia, nawigacja), `USER_FLOWS.md` (flow 3), `RECOMMENDATION_ENGINE.md` §13 (ekrany). Schemat bazy bez zmian (F2 nie dotyka `db`).

## Weryfikacja
- `npm run lint` — 0 ostrzeżeń; `npm run check:boundaries` — OK; `npm run typecheck` — OK; `npm test` — core 393, db 44, ui 9, app 173, testkit 10 (wszystkie zielone); `npm run build` — OK (`ƒ /admin/[slug]/opportunities`).
- Nowe testy: `actions.test.ts` (GM → `forbidden` dla 3 akcji bez zapisu; Ignore/Restore/Add → `saved=`, `revalidatePath('/admin/halka','layout')`, obcy `back` → `/admin/halka`; `opportunity_stale`, `validation_failed`, `opportunity_not_dismissed`, `already_suggested`; „Add” bez zmiany `unpublishedChanges`, para `suggested`/`engine`/`dirty: false`), `admin-i18n.test.ts` (klucze PL = EN, brak `/\bAI\b|sztuczn/i`, dni z `DISMISS_DAYS`, plurals), `opportunity-pages.test.ts` (prerender: A14 6 okazji w 4 grupach i kolejności, jedno „i”, PL, GM bez formularzy, pusty stan + „Ignored (6)”, `degraded` → uwaga + `logger.warn`; A6 risotto `['opportunities','pairings','suggestions']`, karta nad „Approved”; A6 kaczka bez karty; A1 „Opportunities: 6” / „Okazje: 6”).
- Smoke (`npm run smoke`): `DATA_SOURCE=memory` (next start :3117) — 217/217 ok; `DATA_SOURCE=postgres` (embedded PostgreSQL 17, świeża baza `migration:up` + `seed`, :3118) — 217/217 ok, w tym 7 nowych sprawdzeń A14/A6/A1/GM.
- E2E lokalnie (`npm run test:e2e` przez `vitest.e2e.config.ts`, `TEST_DATABASE_URL` → embedded PostgreSQL, agent-browser 0.39.1 + systemowy Chrome): 3 pliki, 17/17 (admin, home, nowy opportunities: bez JS — `window.next.router` brak; S1 na A6 i A14 po odrzuceniu Primary, Ignore → „Ignored (n)” → Restore; „Add” na A6 → wiersz w „Engine suggestions”, licznik Publish bez zmian, A7 z JS widzi propozycję, Approve; „Add” z A14 zostaje na A14; GM bez przycisków).
- Ekrany (agent-browser, emulacja widoku, Chrome): A1, A6 (risotto), A14 przy 1440 i 390 px — `scrollWidth == innerWidth` (1440/1440, 390/390), brak poziomego przewijania; A6 `data-explain` = opportunities, pairings, suggestions; A1 = dashboard; A14 = opportunities. A14 bez JS przy 390 px: Ignore → `?saved=opportunity_dismissed` (6 → 5 wierszy), Restore → `?saved=opportunity_restored` (z powrotem 6). Zrzuty: katalog roboczy `scratchpad/shots/` (poza repo).
- `npm run test:db` — nie uruchamiany: F2 nie zmienia `db`, portów ani serwisów `core` (CI uruchomi).

## Wynik
F2 gotowa: AC7–AC10 spełnione (AC8 E2E bez JS, AC10 smoke w obu trybach i 390/1440). Spec zostaje `in-progress` (F3, F4). Nic nie zostało do zrobienia w zakresie F2.

## Lekcje
- `.ai/lessons/2026-10-17-e2e-without-javascript.md` (nowa).
