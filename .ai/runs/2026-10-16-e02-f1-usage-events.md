---
started: 2026-10-16 17:28
ended: 2026-10-17 11:15
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-15-guest-usage-events.md
outcome: success
related: [issue #12, epic #11, .ai/lessons/2026-10-17-nextjs-headers-hide-router-prefetch.md]
---

# E02 faza 1: sesja gościa w URL (`sid`), port i repozytoria zdarzeń, zapis odsłon G0–G3

## Zadanie
Zaimplementować wyłącznie fazę 1 specyfikacji E02 (issue #12): `sid` w każdym linku i formularzu gościa i G9,
`GuestInteractionRepository` (pamięć + PostgreSQL + kontrakt), `UsageEventService`, `trackUsage` w `after()`,
filtr `shouldRecord` (prefetch, nagłówek `x-wine-match-synthetic: 1`, boty), zdarzenia G0, G1, G3, nagłówek w smoke,
docs (R9). Gałąź `feat/e02-f1-usage-events` z `origin/main`, PR bez merge.

## Przebieg
- Przeczytane: AGENTS/CLAUDE, AGENTS pakietów, lekcje (`ssr-page-tests-with-prerender`, `ssr-html-assertions…`), spec E02 + supersede ze spec short-path (A7: bez `dish_viewed`, `menu_viewed` także na G0; G2 = 308).
- Na `main` wszystkie linki gościa szły już przez `href` z `guestContext` (po pracy nad językiem), więc `sid` dopisany w jednym miejscu (`hrefWith` stan `sid`, `langHref` z bieżącym `sid`) — nowe strony dostaną go automatycznie. `howHref` jeszcze nie istnieje. „For staff” na G0 przez `hrefWith` bez sesji.
- **Odkrycie:** `headers()` w Next.js 16 ukrywa `Next-Router-Prefetch`/`RSC` (`HIDDEN_REQUEST_HEADERS` w `request-store.js`), więc filtr prefetchu w stronie nie zadziałałby. Proxy ustawia `x-wine-prefetch: 1` (stała w osobnym `server/prefetch.ts`, żeby proxy nie ładował kodu serwerowego). Lekcja `2026-10-17-nextjs-headers-hide-router-prefetch`.
- `after()` działa też po `notFound()` (docs Next) → `trackUsage` jako ostatnia instrukcja przed `return`.
- Decyzja: G5–G8 w F1 zapisują tylko start nowej sesji (`link`, R4); G8 nie dla wina nieaktywnego (R6); zdarzenia F2/F3 nie zaimplementowane. G9: `source: 'staff'`, `sid` w linkach i formularzu, bez zapisu.
- `GUEST_EVENT_NAMES` w `domain/types.ts` (typ domenowy nie importuje serwisu). Atrapa `after` w `tests/unit/setup.ts` z `afterTasks`.
- Testy: `core/tests/usage-events.test.ts`, przypadki w `repositoryContract` (memory + PG), `app/tests/unit/usage-events.test.ts` (shouldRecord, AC3, proxy, SSR wszystkich stron G0–G9 — AC4/AC5, odsłony AC1/AC6a/AC6b), `app/tests/e2e/usage-events.e2e.test.ts` (PG + agent-browser, pomocnik `queryDatabase` w testkit, `databaseUrl` w `provide('e2e')`). Smoke: nagłówek syntetyczny na każdym `fetch`, dwie asercje z dokładnym `href` dostały `sid`, nowe sprawdzenia `sid`.
- Przerwa (limit API) 2026-10-16 → kontynuacja 2026-10-17. Rebase na `origin/main` z E10 F1 (#58): konflikty addytywne (porty, pamięć, kontrakt, mappery, repozytoria Pg, kontener, lessons) — zachowane obie strony.
- `test:db` lokalnie przez `embedded-postgres` poza repo (lekcja `postgres-without-docker` z #58).

## Weryfikacja
- `npm run lint` — 0 ostrzeżeń; `npm run check:boundaries` — OK; `npm run typecheck` — OK.
- `npm test` — core 403/403 (15 plików), db 44, ui 9, app 143/143 (10 plików), testkit 10 — zielone (po rebase).
- `npm run build` — OK.
- `npm run test:db` (embedded PostgreSQL 17, `TEST_DATABASE_URL`) — 70/70, w tym nowe przypadki kontraktu na `PgGuestInteractionRepository`; snapshoty migracji bez zmian (brak migracji).
- Smoke `DATA_SOURCE=memory` (`ALLOW_DEMO_DATA=true`) — 217 ok, 0 FAIL. Smoke `DATA_SOURCE=postgres` — 217 ok, 0 FAIL; `guest_interaction` przed: 0, po: 0 (AC6b).
- Ścieżka bez JS na zbudowanej aplikacji + PG (zwykłe GET z UA Safari iOS): `guest_session_started {source: qr, menuVersion}`, `menu_viewed` ×2, `recommendations_viewed` (dish, `wineIds`, `items` z `tier`, `prefs`, `engine_version wm-rules-1.1.0`), jeden `session_id`; brak `Set-Cookie`; G2 308 zachowuje `sid`. Prefetch (`Next-Router-Prefetch`), nagłówek syntetyczny, UA WhatsApp, 404 → 0 wierszy.
- Z JS (panel przeglądarki, Chrome 152, PG): ~100 żądań prefetch RSC na G0/G3, kliknięcie „Duck breast” → sesja ma dokładnie 3 zdarzenia (start, `menu_viewed`, `recommendations_viewed`) — AC6.
- UI: G0 przy 375/390 px, G3 przy 390 i 1440 px: bez poziomego przewijania, bez błędów konsoli, wszystkie linki `/r/` z jednym `sid` (poza 2× „For staff”), `document.cookie` pusty. Wygląd bez zmian.
- E2E (`npm run test:e2e`) — lokalnie brak `agent-browser`; pokrywa CI.

## Wynik
Faza 1 gotowa: sesja w URL na wszystkich stronach gościa i G9, zapis odsłon G0/G1/G3 i startu sesji, filtry ruchu, port + repozytoria + kontrakt, docs. Spec `in-progress` (fazy 2 i 3 do zrobienia: #13, #14). Dług: brak.

## Lekcje
- `.ai/lessons/2026-10-17-nextjs-headers-hide-router-prefetch.md`
