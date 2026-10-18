---
started: 2026-10-17 12:00
ended: 2026-10-18 15:20
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-recommendation-code.md
outcome: success
related: [.ai/runs/2026-10-17-e02-f2-f3-events.md]
---

# E09 F1 — kod polecenia wydawany na G8

## Zadanie
Faza 1 specyfikacji E09 (issue #47, epic #46): format kodu i dzień serwisu w `core`, port `RecommendationCodeRepository`
(pamięć + PostgreSQL + kontrakt), migracja `recommendation_code`, `RecommendationCodeService.issue`, `issueCodeForPage`
i blok „Kod dla kelnera” na G8, dokumentacja i dopisek w AGENTS §1.3 (Q7). Bez F2 (G9) i F3 (import POS, A13).

## Przebieg
- 2026-10-17: przegląd specyfikacji, lekcji i wzorców E02 F1 (`UsageEventService`) oraz E10 F1 (nowa tabela).
- Przerwa (limit API); worktree odtworzony 2026-10-18 na tej samej gałęzi od `origin/main` (6cdbe77).
- Core: `code-format.ts`, `service-day.ts`, typy, port + pamięć + kontrakt (`recommendation-code-contract.ts` wołany z `repositoryContract`), `RecommendationCodeService.issue`. Decyzja: jeden UUID na próbę = id wiersza i źródło kandydata kodu (test kolizji ze stałym prefiksem UUID działa tak samo w pamięci i w PostgreSQL); `logger` jako zależność serwisu (warn przy wyczerpaniu przestrzeni).
- Db: encja + migracja z generatora (`npx mikro-orm migration:create --name=recommendation_code`), przejrzany SQL, dopisany komentarz. Repozytorium na natywnym SQL; `service_day::text`, bo `pg` zamienia `date` na `Date` w strefie procesu.
- App: kontener, `issueCodeForPage` (`Promise.race` z `ISSUE_TIMEOUT_MS`), `CodeForWaiter`, G8, teksty PL/EN.
- E2E: pierwsza wersja szukała linku do G8 na G7 — G7 ma formularz GET; poprawione na wysłanie formularza jak bez JS.
- G8 nie ma jeszcze „i” z E07 (F2 E07 nie jest scalone): blok bez „i”, zdanie w słowniku (`guest.selected.code.explain`) — zgodnie z krokiem 5 specyfikacji.
- Docs: DATA_MODEL, SCREEN_SPECIFICATION G8, BACKWARD_COMPATIBILITY §3, AGENTS §1.3 (Q7), `packages/{core,app}/AGENTS.md`, spec `in-progress` + Realizacja F1.

## Weryfikacja
PostgreSQL: `embedded-postgres` 17 w `scratchpad/e09pg` (własny katalog), port 54341.
- `npm run lint` — 0 ostrzeżeń; `npm run check:boundaries` — OK; `npm run typecheck` — OK.
- `npm test` — core 428, db 44, ui 9, app 203, testkit 10: wszystkie zielone (nowe: `core/tests/recommendation-code.test.ts` AC1, AC2, AC4, AC13; kontrakt w pamięci; `app/tests/unit/recommendation-code.test.ts` AC5, AC6, AC13 SSR).
- `TEST_DATABASE_URL=… npm run test:db` — 80/80 (kontrakt PostgreSQL AC3, AC13 `countBySession`, równoległe wydanie, Q4, `CHECK`/unikalność, migracja down → up).
- `db:migrate` na `winematch`, `winematch_test`, `winematch_e2e`; CLI `migration:down` → `migration:up` na `winematch`; `schema:check` — „No changes required”; cztery snapshoty zaktualizowane.
- `npm run build` — OK.
- E2E (fetch, bez JS) `tests/e2e/recommendation-code.e2e.test.ts` na zbudowanej aplikacji + PostgreSQL — 3/3 (AC5, AC6, AC14 `Cache-Control: … no-store`). Testy z `agent-browser` pominięte lokalnie (brak 0.39.1).
- `npm run smoke` na `next start` — memory (3341) i postgres (3342): „All smoke checks passed”.
- QA ręczne (postgres): G8 bez JS (`curl`, HTML serwera) PL/EN — kod `N2F`, 2× odświeżenie z tym samym `sid` = `N2F`, 1 wiersz (`context: dish`, `tier: sommelier_primary`, `menu_version`), bez `Set-Cookie`; `WhatsApp/2.23` i `x-wine-match-synthetic: 1` → „Kod niedostępny…”/„Code unavailable…”, 0 wierszy. Panel przeglądarki 390×844 (EN), 375×812 (PL), 1440×900 (PL): `scrollWidth = innerWidth`, brak błędów konsoli.

## Wynik
F1 gotowe (PR do `main`, `risk-high`, `needs-qa`). Zostają F2 (G9: `lookup`/`confirm`/`undo`, akcja) i F3 (import POS, A13). Do E07 F2: wpiąć `guest.selected.code.explain` w `guest.explain.selected` tylko, gdy kod jest pokazany.

## Lekcje
brak (natywny `date` → `::text` opisany w komentarzu repozytorium)
