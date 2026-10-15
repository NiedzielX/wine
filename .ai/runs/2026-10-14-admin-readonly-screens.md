---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-14-mockups-to-app-migration-plan.md
outcome: success
related: [.ai/runs/2026-10-14-guest-app-parity.md]
---

# Migracja — Faza 2: panel, ekrany tylko do odczytu

## Zadanie
Polecenie właściciela: kontynuować migrację według planu, sprawdzić kod i oznaczenia ukończonych faz, zaimplementować pierwszą nieukończoną fazę, uruchomić sprawdzenia, zaktualizować plan.

## Przebieg
1. Przeczytano plan i lekcje. Fazy 0 i 1 oznaczone jako zakończone, kod to potwierdza (10 stron gościa, 3 endpointy API). Baza PostgreSQL w sandboxie była wyłączona — uruchomiona ponownie. Stan bazowy: typecheck OK, 49 testów OK.
2. Pierwsza nieukończona: Faza 2 (A1–A5, A7 w trybie odczytu).
3. `core`: `AdminService` (overview, menu, dishDetail, wines, wineDetail, reviewQueue) + 11 testów. Jeden test padł z mojej winy (ręcznie policzone wina na kieliszki: 13 zamiast 14) — serwis był poprawny, poprawiłem test wartością zweryfikowaną z danymi.
4. `ui`: progress, alert, skeleton, native-select z rejestru GitHub shadcn (rejestr www niedostępny), `LevelMeter`.
5. `app`: układ z nawigacją boczną, 8 stron panelu, error / not-found / loading; trasy dopasowane do `SCREEN_MAP.md`; `scripts/smoke.mjs` rozszerzony o panel.
6. Problemy i decyzje:
   - Kolizja nazw `MenuRow` / `WineRow` z modułem importu w `core` (typecheck) → zmiana nazw w serwisie panelu.
   - Smoke wykrył status 200 przy `notFound()` i `redirect()` — przyczyna: `loading.tsx` strumieniuje odpowiedź. Naprawa: `loading.tsx` w grupie tras `(lists)`; szczegóły poza nią (lekcja `nextjs-loading-streams-and-http-status`).
   - Oglądając HTML (nie tylko wygląd) znalazłem błąd w komponencie shadcn Progress: `data-state="indeterminate"`, brak `aria-valuenow` — poprawka lokalna + asercja w smoke (lekcja `verify-shadcn-copies-in-html`).
   - Test przeglądarkowy bez JS: pola filtra „niewidoczne” na listach — potwierdziłem w HTML, że to strumieniowanie (`<div hidden id="S:0">` + `$RC`). Nie ukrywam tego: zapisane jako ograniczenie, a nie jako „działa bez JS”.
   - **Zmiana zakresu:** KPI użycia i sprzedaży z dashboardu (sesje, konwersja, attach rate, przychód, wykresy) nie mają źródła danych (eventy nie są zapisywane), więc przeniesione do Fazy 6; dashboard pokazuje KPI katalogu i stan pusty „Guest activity”. Odnotowane w planie i w `SCREEN_SPECIFICATION.md`.
   - Po zmianie etykiety („Hidden”) smoke oczekiwał starej — poprawiony; dodano sprawdzenie wina ukrytego.

## Weryfikacja
- `npm run typecheck` — OK (5 pakietów); `npm test` — 60/60; `npm run test:db` — 9/9 na PostgreSQL 16; `schema:check` — zgodny.
- `npm run build` — granice pakietów OK, mockupy i Next.js zbudowane (26 tras).
- `npm run smoke`: `memory` 47/47, `postgres` 47/47 (strony gościa, panel, API; kody 404 i 307).
- Playwright: 7 ekranów panelu przy 1440 px i 390 px — brak przepełnienia; nawigacja (aktywna pozycja także na szczegółach), filtry tekstowe / kategorii / stylu, pasek postępu `aria-valuenow=60`, brak błędów konsoli poza oczekiwanym 404 przy celowym wejściu na nieistniejące danie.
- Zrzuty ekranu obejrzane (desktop i mobile): układ spójny z resztą produktu.

## Wynik
Faza 2 zakończona (kryteria F2.1–F2.4). Następna: Faza 3 (zapisy sommeliera i publikacja). Dług: brak uwierzytelniania (Faza 4) — panel jest otwarty; ekrany list wymagają JS.

## Lekcje
- `.ai/lessons/2026-10-14-nextjs-loading-streams-and-http-status.md` (awans do `packages/app/AGENTS.md`)
- `.ai/lessons/2026-10-14-verify-shadcn-copies-in-html.md`
