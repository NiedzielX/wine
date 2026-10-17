---
started: 2026-10-16 17:10
ended: 2026-10-16 17:30
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-sommelier-opportunities.md
outcome: success
related: [.ai/runs/2026-10-16-e08-f1-table-engine.md, .ai/runs/2026-10-16-e07-f1a-engine-facts.md]
---

# E10 faza 1: rdzeń okazji (reguły S1–S3, `OpportunityService`, `opportunity_dismissal`, `addSuggestion`)

## Zadanie
Zaimplementować wyłącznie fazę 1 specyfikacji E10 (issue #51, epic #50): kroki 1–6 planu, AC1–AC6. Bez stron, komponentów i słowników UI (F2; równolegle E07 F1b). PR do `main`, bez merge.

## Przebieg
- Przeczytane: `AGENTS.md`, `CLAUDE.md`, `packages/core/AGENTS.md`, `packages/db/AGENTS.md`, `.ai/lessons.md` (+ `write-path-conventions`, `client-chosen-keys`), `SDLC.md`, spec E10.
- Gałąź `feat/e10-f1-opportunities-core` z `origin/main` w osobnym worktree; `npm@11.20.0 install` OK.
- Brak Dockera i lokalnego PostgreSQL: do `test:db`, `db:migration:create` i `schema:check` uruchomiony PostgreSQL 17 z paczki `embedded-postgres` w katalogu tymczasowym (poza repozytorium), podany przez `TEST_DATABASE_URL` / `DATABASE_URL`.
- Spec → `status: in-progress`.
- Krok 1 — reguły (`core/src/services/opportunities/opportunity-rules.ts`): `opportunityCandidates` (kandydaci S1–S3, jeden na klucz), `findOpportunities` (filtr zignorowań → jedna okazja na parę, porządek S1, S5, S2, S3, S4 → sortowanie), `opportunityKey`, `STRONG_MATCH = 85`, `DISMISS_DAYS = 30`. Wyniki wchodzą jako macierz (`ScoreMatrix`), reguły nie wołają silnika. Remisy po `id` w porządku znaków (bez `localeCompare` bez locale); nazwa dania `localeCompare(…, 'pl')`. `OPPORTUNITY_RULES` (pięć nazw, w kolejności priorytetu) w `domain/types.ts`.
- Krok 2 — port `OpportunityDismissalRepository` (`listActive`, `upsert`, `remove`) w `Repositories`, `MemoryOpportunityDismissalRepository` (`Map` per restauracja; klucz od klienta tylko w `Map`), 5 przypadków w `repository-contract.ts`.
- Krok 3 — encja `db/src/entities/opportunities/opportunity-dismissal.ts` (`defineEntity`, `opportunity_key` text, `rule` enum → `CHECK`, unique (`restaurant`, `key`)), mapper, `PgOpportunityDismissalRepository` (upsert jednym `insert … on conflict … do update`, odczyt z `disableIdentityMap`), migracja z generatora `Migration20261016152214_opportunity_dismissal` (dopisany tylko komentarz), cztery snapshoty (`winematch`, `_db_test`, `_test`, `_e2e`). `npm run db:migration:create -- --name` nie przekazuje nazwy → `npx mikro-orm migration:create --name=…`.
- Krok 4 — `suggestPairing` i `existingPairingError` w `pairing-rules.ts`; `SommelierService.addSuggestion` (danie `published` → wino `active` → wynik ≥ `MIN_MODEL_SCORE` → `suggestPairing` → `addSuggestions`; wynik 0 → ponowny odczyt i kod według statusu, bez pary → `VersionConflictError`). Testy w `sommelier-service.test.ts` i w `write-contract.ts` (memory + PostgreSQL: brak historii, `pendingPairingChanges` i `dirty` bez zmian; wyścig przez nieaktualny odczyt `listByDish`). `ContractRunner.rejects` dostał `toMatchObject`.
- Pierwsza wersja testu `already_rejected` używała sandacza z Barbaresco (wynik < 62) → `low_match`, bo wynik jest sprawdzany przed parą (kolejność ze spec). Test przestawiony na odrzuconą silną parę (kaczka × Barbaresco 84) i dopisany przypadek „słaba odrzucona para → `low_match`”.
- Krok 5 — `OpportunityService` (`list` z grupami, `current` w kolejności gościa, `dismissed`, `degraded: []`; `dismiss` tylko dla kandydata, inaczej `opportunity_stale`; `restore` → `opportunity_not_dismissed` jako `NotFoundError` z kodem — `NotFoundError` dostał opcjonalny `code`/komunikat), schemat `opportunityKeySchema`. Testy ze stałym zegarem (`core/tests/opportunities.test.ts`, 37), test „Halka”, budżet 100 × 500, izolacja dwóch restauracji w pamięci. Na PostgreSQL: równość z pamięcią na danych demo, dismiss/extend/restore, `CHECK` i unique w bazie, `addSuggestion`, migracja `down`/`up`.
- Krok 6 — `container.ts` (`opportunityService` scoped; `opportunityDismissalRepository` w gałęzi `postgres` i `memory`), `index.ts`; docs: `RECOMMENDATION_ENGINE.md` §13 „Okazje”, `DATA_MODEL.md` (stan, diagram, encja), `BACKWARD_COMPATIBILITY.md` §3, `packages/core/AGENTS.md` (pojęcie `opportunities`). `SCREEN_SPECIFICATION.md` / `SCREEN_MAP.md` / `USER_FLOWS.md` bez zmian — F1 nie ma ekranów (A6/A14 w F2).
- Halka (uuid, `wm-rules-1.1.0`): 6 okazji (S1 0, S2 2, S3 4) — przegląd w opisie PR.
- Bez zmian stron, komponentów i słowników UI (E07 F1b równolegle; E10 F2 osobno).
- PR #58 po otwarciu był w konflikcie z `main` (scalone E07 F1b, #57), więc CI nie ruszyło. Rebase na `origin/main`; jedyny konflikt w `.ai/lessons.md` (zachowane obie linie). Po rebase ponownie: lint, boundaries, typecheck, `npm test` (core 393, db 44, testkit 9, app 129, ui 10), build, `test:db` 68/68 — zielone.

## Weryfikacja
- `npm run lint` — 0 ostrzeżeń i błędów.
- `npm run check:boundaries` — „Package boundaries OK”.
- `npm run typecheck` — OK (pierwszy przebieg: `performance` nieznane w typach `core` → `Date.now()` w teście budżetu).
- `npm test` — core 393 (w tym 37 nowych w `opportunities.test.ts`, 6 w `sommelier-service.test.ts`, 2 w `write-contract`, 5 w `repository-contract`), db 44, testkit 5, app 98, ui 10 — wszystkie zielone; pokrycie `services/opportunities`: 100% linii.
- `npm run build` — OK.
- `npm run test:db` (`TEST_DATABASE_URL` → embedded PostgreSQL 17) — 68/68 (kontrakty na PostgreSQL + 5 nowych testów okazji, w tym migracja `down`/`up`).
- `DATABASE_URL=…/winematch npm run db:migrate` + `npm run schema:check -w @wine-match/db` — „No changes required, schema is up-to-date”.

## Wynik
F1 gotowa: AC1–AC6 pokryte testami (memory i PostgreSQL). Do zrobienia w kolejnych fazach: F2 (akcje, A6, A14, nawigacja, i18n, smoke, E2E, docs ekranów), F3 (S4), F4 (S5). Dług: brak.

## Lekcje
- `.ai/lessons/2026-10-16-postgres-without-docker.md` (nowa).
