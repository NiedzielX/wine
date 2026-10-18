---
started: 2026-10-18 19:56
ended: 2026-10-18 20:40
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-recommendation-code.md
outcome: success
related: [.ai/runs/2026-10-17-e09-f1-recommendation-code.md, .ai/runs/2026-10-18-e08-f2-waiter-table.md, .ai/runs/2026-10-18-e07-f2-guest-explanations.md]
---

# E09 F2 — kelner oznacza kod polecenia jako „Zamówione” na G9

## Zadanie
Faza 2 specyfikacji E09 (kroki 6–7 planu; R6, R7, AC7, AC8, AC15 i przypadki brzegowe G9), issue #48 (epic #46). Serwis `lookup`/`confirm`/`undo` w `core` (komenda z `actor: 'staff_view'`, `DomainError` `code_not_found`, bez `code_expired`), schemat `code-action.schema.ts`, sekcja „Zamówienie z kodu” na G9 (`/r/{slug}/staff?code=`), publiczna akcja serwerowa `markCode` (odrzuca `Sec-Fetch-Site: cross-site`, przekierowanie z `marked`/`codeError`, `revalidatePath(…, 'layout')`), zdanie o oznaczaniu w „i” G9 (`guest.explain.staff`). Bez fazy 3 (POS, A13) i bez panelu (E10 F4 robi inny agent).

## Przebieg
- Gałąź `feat/e09-f2-waiter-marks-code` z `origin/main` (e3eb192), `npm install` (npm 11.20.0, Node 22).
- Przeczytane: spec E09, AGENTS.md, `packages/*/AGENTS.md`, lekcje (`server-action-layout-revalidate`, `e2e-without-javascript`, `postgres-without-docker`, `auth-conventions`, `ssr-page-tests-with-prerender`), log E08 F2; kod G9, G8, `CodeForWaiter`, `issueCodeForPage`, `action-runner.ts`, `api-auth.ts` (`isCrossSite`), port i kontrakt `RecommendationCodeRepository` (F1 ma już `findByCode` i `setConfirmed` z `COALESCE`).

- core: `RecommendationCodeService.lookup` / `confirm` / `undo` (+ `CodeLookup`, `CodeActor`, `CODE_NOT_FOUND`), `validators/recommendations/code-action.schema.ts` (slug przez `SLUG_PATTERN`). Port i repozytoria bez zmian, bez migracji.
- app: `staff/actions.ts` (`markCode`, publiczna, Q8), `staff/code-section.tsx`, sekcja na G9 (`page.tsx` + `codeCard`), teksty PL/EN, punkt o kodzie w `guest.explain.staff`.
- Ślepa uliczka: pierwsze zdanie o kodzie w „i” G9 przekroczyło limit 90 słów E07 (`how-it-works.test.ts`: EN 108, PL 91) — skrócone do jednego krótkiego punktu.
- Decyzje: POST cross-site → przekierowanie 303 bez wyniku i `logger.warn` (akcja nie ma 403); formularz niezgodny ze schematem → `codeError=not_found` (poprawny slug) albo `/`; akcja czyta z `FormData` tylko pięć nazwanych pól (pola `$ACTION_*` Next.js nie wchodzą do `strictObject`).
- Testy: core (4 serwisu + 1 schematu), app unit `staff-code.test.ts` (8), E2E `staff-code.e2e.test.ts` (4 żądania bez JS + 1 przeglądarka bez skryptów), smoke (3 GET). Docs: SCREEN_SPECIFICATION G9, API_SPECIFICATION, BC §1/§8, USER_FLOWS §5, USER_ROLES, `packages/app/AGENTS.md`; spec: AC7, AC8, AC15 odhaczone, notka F2 w „Realizacja” (status zostaje `in-progress` — F3).

## Weryfikacja
- `npm run lint` 0, `npm run check:boundaries` 0, `npm run typecheck` 0, `npm test` 0 (core 434, app 277, pozostałe zielone), `npm run build` 0.
- `npm run test:db` na `embedded-postgres` (własny katalog `scratchpad/e09f2pg`, port 54383): 80/80.
- Smoke: `next start` postgres (3483) i memory (3484) + `npm run smoke`: „All smoke checks passed” w obu (nowe: „G9 code form”, „G9 unknown code”, „G9 malformed code in Polish”).
- E2E (`vitest.e2e.config.ts`, agent-browser 0.39.1 + systemowy Chrome + embedded-postgres): 8 plików, 44 testy zielone, w tym `staff-code.e2e.test.ts` 5/5.
- Sonda na zbudowanej aplikacji (fetch jak przeglądarka bez JS): G8 → kod → G9 `?code=` (małe litery) → POST „Ordered” 303 `marked=confirmed`, bez `Set-Cookie`, `Cache-Control: no-store`; `Sec-Fetch-Site: cross-site` → 303 bez `marked`, stan bez zmian; `Origin: https://evil.example` → 500 (Next.js), stan bez zmian; memory: to samo 303.
- Panel przeglądarki (postgres): 390 px PL — karta „Marcel Lapierre Morgon, nr 111, 1 butelka, 750 ml, 230 zł, Wybrane bez dania, Kod G7T, pokazany o 20:13, Oznaczone o 20:13, Cofnij”; „Cofnij” z JS → „Cofnięto oznaczenie.” i znów „Zamówione”; `scrollWidth` 390 = 390, konsola bez błędów. 1440 px EN, `X9X` → „There is no code X9X today in this restaurant. …”, `scrollWidth` 1440.
- Po rebase na `origin/main` (7d9bd5d, E10 F4 dodał `pairStats` do tego samego serwisu i testu — konflikt rozwiązany, obie części zostają): gate ponownie zielony (core 453, app 278), `test:db` 80/80, E2E 8 plików / 45 testów.
- CI PR #71: job `unit` czerwony — test F1 „the memory store keeps at most 10 000 recommendations” przekroczył domyślny limit 5 s (5,36 s z pokryciem na runnerze; ten sam czerwony `unit` na `main` po E10 F4). Poprawka: jawny limit 30 s dla tego testu (10 005 wstawień), bez zmiany logiki.
- Bez self-QA (risk-high): QA zostaje dla QA reviewera (`needs-qa`).

## Wynik
F2 gotowe: R6, R7, AC7, AC8, AC15. Zostaje F3 (POS, A13). Dług: brak limitu żądań dla publicznej akcji (świadomie poza zakresem, Q8 — osobny ticket).

## Lekcje
brak (nowych zachowań narzędzi nie odkryto; istniejące lekcje wystarczyły)
