---
started: 2026-10-15 14:00
ended: 2026-10-15 18:30
agent: Claude Code / claude-opus-5-5 (sub-agent)
spec: .ai/specs/2026-10-15-bilingual-content.md
outcome: partial
related: [.ai/specs/implemented/2026-10-15-polish-language.md]
---

# Treści dwujęzyczne PL/EN i przełącznik „Polski / English”

## Zadanie
Implementacja zatwierdzonej specyfikacji `2026-10-15-bilingual-content` (obie fazy) na gałęzi `feat/bilingual-content`, bez commitów.

## Przebieg
- Start: lektura specyfikacji, AGENTS.md, CODE_REVIEW.md, BACKWARD_COMPATIBILITY.md i lekcji (write-path-conventions, import-conventions, client-chosen-keys, server-action-layout-revalidate, nextjs-loading-streams-and-http-status).
- Pierwsze podejście przerwał limit API przed jakąkolwiek zmianą plików; wznowione w tym samym logu.
- Decyzje: tłumaczenia w JSON per encja; `localize` = tłumaczenie → pole bazowe; goście dostają tłumaczenia z migawki publikacji (`snapshot.content`, `pairings[].commentTranslations`), panel — bieżące; zmiana tłumaczenia liczy się do „niepublikowanych zmian” (`countContentChanges`) i do `changesCount` wersji. `expectedVersion` komend tłumaczeń to odcisk (FNV) kanonicznego JSON-u, bo `dish`/`wine` nie mają kolumny wersji (R9 nie pozwala jej dodać). Bez `locale` serwisy zwracają pola bazowe — `/api/v1` bez zmian (R10).
- Core: `i18n/content.ts`, `validators/catalog/translations.schema.ts`, `services/catalog/translation-rules.ts`, `translation-service.ts`, zmiany w typach, portach, repozytoriach pamięciowych, kontraktach (repository/write/import), serwisach gościa, panelu i publikacji, imporcie (kolumny `_pl`/`_en`, `translation_empty`, najdłuższy prefiks nagłówka), dane demo Halki z pełnym tłumaczeniem PL.
- Db: encje, migracja `Migration20261015140000_bilingual_content`, ręcznie uzupełnione `.snapshot-*.json` (4 pliki), mappery (czyszczenie JSON), `PgContentWriteRepository`, `publishedContent`, migawka z `content`, seeder (idempotentne uzupełnianie), fixture `menu-translations.csv` i `wines-translations.csv` (generate.py), testy parserów i integracyjne (migracja up/down, seeder, import, konflikt wersji).
- App: przełącznik „Polski / English” (gość: `LanguageSwitch`; panel: górny pasek `AdminShell`, na wąskim ekranie wiersz nagłówka), formularze A3/A5 (`TranslationsCard`), A6 (pola `comment_pl`/`comment_en`), A10 (język treści, hasło i miasto), podgląd importu z kolumnami tłumaczeń, słowniki EN/PL, akcje z `import.manage`, testy akcji.
- Smoke: AC1/AC2/AC6 + A3/A5/A6/A10; zmieniony stary check „sommelier note as written” (notatka jest teraz po polsku).
- Docs: DATA_MODEL, SCREEN_SPECIFICATION, API_SPECIFICATION (notka), BACKWARD_COMPATIBILITY §3/§6, brief (D12, Coverage 44), packages/app/AGENTS.md.

## Weryfikacja
- `npm run lint`, `npm run typecheck`, `npm run check:boundaries`, `npm test` (core 312, db 44, ui 5, app 97, testkit 10), `npm run build` — exit 0.
- `DATA_SOURCE=memory ALLOW_DEMO_DATA=true AUTH_COOKIE_SECURE=false PORT=3003 npm start` + `node scripts/smoke.mjs http://localhost:3003 halka` — „All smoke checks passed” (206 ok).
- Przeglądarka: G0 i G1 po polsku przy 390 px (scrollWidth 390 = innerWidth), A0 przy 390 px, A3 na desktopie z formularzem tłumaczeń; zapis tłumaczenia w A3 → `?saved=translations`, licznik „Publish” w layoucie wzrósł o 1.
- **Nie uruchomiono:** `npm run test:db` i `npm run schema:check -w @wine-match/db` (brak Dockera/PostgreSQL) — testy integracyjne są napisane i objęte `typecheck`; snapshoty schematu uzupełnione ręcznie, do potwierdzenia w CI. Brak sprawdzenia `DATA_SOURCE=postgres` i `test:e2e`.

## Wynik
Obie fazy zaimplementowane, bramka lokalna i smoke zielone. Do zrobienia w CI: `test:db`, `schema:check` (AC5, AC7). Jakość polskich tłumaczeń demo do przeglądu przez sommeliera (ryzyko ze specyfikacji).

## Lekcje
brak (nic niezweryfikowanego ani nowego, czego nie ma w kodzie i specyfikacji)
