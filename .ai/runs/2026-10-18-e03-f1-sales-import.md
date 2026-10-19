---
started: 2026-10-18 21:10
ended: 2026-10-19 09:25
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-15-pos-sales-import-attach-rate.md
outcome: success
related: [issue #15, #16, #17, .ai/specs/2026-10-16-recommendation-code.md]
---

# E03 faza 1: tabela `sales_record`, import sprzedaży z podglądem (A13)

## Zadanie
Zaimplementować wyłącznie fazę 1 specyfikacji E03 (#17, #16): encja i migracja `sales_record`, port `SalesRepository`
(pamięć + PostgreSQL + kontrakt), `computeSalesKpis` (używane przez podgląd), rodzaj importu `sales` w istniejącym potoku
(mapowanie, walidacja, przypisanie kategorii `valueMap`, plan z miękkim zastąpieniem rachunków), trasa API, próbka CSV,
ekran A13 bez karty okresu. Bez fazy 2 (`SalesKpiService`, karta Wine Attach Rate). Nie blokować E09 F3 (kolumna kodu).

## Przebieg
- Przeczytane: AGENTS/CLAUDE, `packages/*/AGENTS.md`, lekcje (import-conventions, postgres-without-docker, e2e-without-javascript, client-chosen-keys, write-path-conventions), spec E03, E09 Faza 3 i znalezisko High #1, E07 (konwencja `PanelExplain`), `docs/SCREEN_MAP.md` (A13 wolne). Gałąź `feat/e03-f1-sales-import` z `origin/main`.
- `core`: typy i czyste reguły sprzedaży (`services/sales`), port `SalesRepository`, `ImportPlan` jako unia, rodzaj importu `sales` (mapowanie tylko dokładne, `no_header` z `fields`, normalizatory dat/ilości/kwot/typów, `validate-sales.ts` z regułami pliku liczonymi na nowo przy każdym sprawdzeniu, `valueMap`, `completeChecks`), `ImportService` (`salesPreview`, `confirmSales`), walidatory, próbka CSV, pamięć, kontrakty.
- Decyzja projektowa dla E09 F3: `mapTable('sales')` kopiuje do rekordu wyłącznie pola z `SALES_FIELDS` przez mapę `SALES_CELL` (punkt, w którym F3 doda wyciąganie kodu z komentarza) — kolumna komentarza nie trafia dziś do `import_job.rows` (nie jest polem), a później trafi tylko wyciągnięty kod.
- `db`: encja + migracja wygenerowana `mikro-orm migration:create` (przejrzany SQL, dopisany tylko komentarz), `PgSalesRepository`, `PgImportRepository.confirm` (unia, advisory lock), fixture z `generate.py` (openpyxl 3.1.5 w venv w scratchpadzie; uruchomiona tylko nowa sekcja, żeby nie zmieniać istniejących plików).
- `app`: trasy, akcje (`typemap_*`), ekran A13 (karta podsumowania, nierozpoznane kategorie, select typu zachowujący nierozpoznaną wartość — inaczej formularz bez zmian zamieniłby ją na pierwszą opcję), PL/EN, nawigacja, smoke.
- Ślepa uliczka: scratchpad (wspólny) został w trakcie wyczyszczony przez inny przebieg — serwer PostgreSQL zniknął (`ECONNREFUSED`); odtworzony w `scratchpad/e03f1/pg` (port 54393). Proxy bez JS: Server Actions odrzucały żądania (`x-forwarded-host` ≠ `origin`) — proxy ustawia `x-forwarded-host`. Obie obserwacje dopisane do istniejących lekcji.
- Przerwa (limit API) między walidatorami a dalszą pracą; kontynuacja bez zmiany zakresu.

## Weryfikacja
- `npm run lint` — czysto; `npm run check:boundaries` — OK; `npm run typecheck` — OK.
- `npm test` — core 502, db 48, ui 9, app 303, testkit 10 — wszystkie zielone.
- `npm run test:db` (embedded-postgres, `TEST_DATABASE_URL=…:54393`) — 95/95 (w tym `sales-contract`, sprzedaż w `import-contract`, prawdziwy CSV/XLSX przez serwis, AC12 dwa równoległe zatwierdzenia, AC17 surowy SQL, `CHECK`-i, migracja down/up).
- `db:migrate` na `winematch`, `winematch_test`, `winematch_e2e` (4 snapshoty zaktualizowane), `npm run schema:check -w @wine-match/db` → „No changes required, schema is up-to-date”.
- `npm run build` — OK (`/admin/[slug]/import/sales` dynamiczna).
- Smoke: `next start` postgres (3393) i memory (3394) + `npm run smoke` → „All smoke checks passed” w obu (nowe: A13 upload step, próbka sprzedaży, 307/401 bez sesji, 422 upload bez pliku).
- QA ręczne (przeglądarka panelu Claude, proxy usuwające `<script>`, `window.next` brak, 0 skryptów): logowanie GM → A13 upload (plik przez `DataTransfer` + natywny klik) → podgląd (karta: 3 rachunki, 50,0%, „2 checks are incomplete”, „Unrecognised categories: Wina białe · 2 lines”) → wybór typu + „Check again” (5 rachunków, 75,0%, sekcja znika) → „Import 8 lines” → „Saved 8 lines, replaced 0 checks, skipped 1.” Przy 1440 px i 390 px `scrollWidth` = szerokość okna.

- Po rebase na `origin/main` (E04 F1, konflikty w importach `repositories/index.ts`, `repository-contract.ts`, `packages/core/AGENTS.md` — zachowane obie strony): lint, check:boundaries, typecheck — OK; `npm test` core 515, db 48, ui 10, app 317, testkit 10; `test:db` 96/96; `build` OK; `schema:check` zgodny; smoke postgres i memory — „All smoke checks passed”.

## Wynik
Faza 1 zrobiona; spec `in-progress` (faza 2: `SalesKpiService`, karta okresu, docs definicji). PR z etykietą `needs-qa`, bez self-QA sign-offu.

## Lekcje
Zaktualizowane: `.ai/lessons/2026-10-16-postgres-without-docker.md` (wyczyszczony scratchpad), `.ai/lessons/2026-10-17-e2e-without-javascript.md` (proxy bez JS i Server Actions).
