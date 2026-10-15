---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-14-mockups-to-app-migration-plan.md
outcome: success
related: [.ai/runs/2026-10-14-monorepo-foundation.md]
---

# Migracja mockupów do packages/app — Faza 1: aplikacja gościa

## Zadanie
Polecenie właściciela: wdrożyć migrację do monorepo zgodnie z AGENTS.md i README.md; przeczytać specyfikacje, zapisać plan z fazami, zaimplementować pierwszą nieukończoną fazę, uruchomić sprawdzenia, zapisać postęp.

## Przebieg
1. Przeczytano `.ai/lessons.md`, specyfikację architektury (`implemented/`): Faza 0 (szkielet monorepo, core/db/ui/app) jest ukończona i zweryfikowana. Planu faz dla reszty nie było.
2. Zapisano plan `2026-10-14-mockups-to-app-migration-plan.md` (fazy 0–6, kryteria). Pierwsza nieukończona: Faza 1 — aplikacja gościa G0–G9.
3. `core`: `Wine.listNumber`, `WineRepository.findById` (pamięć, PostgreSQL, kontrakt), `guest/prefs.ts` (parsowanie i serializacja stanu gościa w URL) i `guest/taste.ts` przeniesione z widoków mockupów, `RecommendationService.wineDetails`, `CatalogService.publishedDish` i `hasPrimary`; 13 nowych testów.
4. `app`: wspólne komponenty gościa, 9 stron (G0–G9) na serwisach z DI, `POST /recommendations/table`, `GET /public/restaurants/{slug}/menu`, `scripts/smoke.mjs`.
5. Stan gościa w URL: filtry jako linki, wybór dań jako formularz GET, arkusz filtrów przez `?sheet=filters`; licznik wybranych dań jako jedyny komponent kliencki.
6. Błędy i ślepe uliczki:
   - Pierwsze uruchomienie smoke: 6 niepowodzeń. Przyczyny: PostgreSQL w sandboxie przestał działać (restart) oraz React rozdziela teksty `<!-- -->`, więc asercje na HTML nie pasowały; jedno oczekiwanie („Why”) było po prostu błędne. Poprawione w skrypcie, aplikacja bez zmian (lekcja `ssr-html-assertions-and-test-races`).
   - Test w przeglądarce nie mógł kliknąć pola na `/table`: przyklejony pasek zasłaniał pola. **Prawdziwy błąd aplikacji**, nie testu → `scroll-padding` + `pointer-events` (lekcja `sticky-bars-scroll-padding`).
   - Rozbieżny link „Back” w moich testach (z JS i bez) podejrzewałem o błąd aplikacji, ale okazał się wyścigiem w teście; potwierdziłem osobnym, deterministycznym skryptem (cały łańcuch wstecz działa i zachowuje budżet).
   - Pierwsza wersja stron eksportowała komponent ze strony (`ModeSwitch`) — Next.js tego nie dopuszcza; przeniesiony do wspólnych komponentów. Nadpisywanie stylów przez `!` zastąpione wariantami przycisku.

## Weryfikacja
- `npm run typecheck` — OK (5 pakietów); `npm test` — 49/49; `npm run test:db` — 9/9 na PostgreSQL 16 (kontrakt repozytoriów z `findById`, identyczne rekomendacje z bazy i z silnika, unikalność Primary i pary); `schema:check` — zgodny.
- `npm run build` — granice pakietów OK, mockupy i Next.js zbudowane, 17 tras.
- `npm run smoke` na `next start`: `DATA_SOURCE=memory` 28/28, `DATA_SOURCE=postgres` 28/28.
- Playwright (390 px): pełna ścieżka gościa z JavaScriptem i bez (landing → menu → danie → filtry → wino → potwierdzenie; stolik → wynik → wino → wstecz; kelner), brak przepełnienia poziomego, brak błędów konsoli; stolik z jednym daniem bez JS zwraca „Add at least two dishes”.
- Zrzuty ekranu porównane z mockupami: układ i liczby zgodne (stolik 83 / 93 / 83, razem 85%; „List no. 112”).

## Wynik
Faza 1 zakończona, wszystkie kryteria F1.1–F1.6 spełnione. Następna: Faza 2 (panel, ekrany tylko do odczytu). Niezrealizowane z mockupów celowo: stany `?demo=` i klawisz Escape w arkuszu filtrów (opisane w `docs/SCREEN_SPECIFICATION.md`). Dług: strona dania, której nie ma, zwraca 200 z komunikatem (zgodnie ze specyfikacją G2) zamiast 404 — do decyzji właściciela.

## Lekcje
- `.ai/lessons/2026-10-14-sticky-bars-scroll-padding.md` (awans do `packages/app/AGENTS.md`)
- `.ai/lessons/2026-10-14-ssr-html-assertions-and-test-races.md`
