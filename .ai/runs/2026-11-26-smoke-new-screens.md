---
started: 2026-11-24 16:00
ended: 2026-11-24 16:40
agent: Claude Code
spec: brak — rozszerzenie skryptu smoke o ekrany i trasy już obecne na main (bez zmiany zachowania aplikacji)
outcome: success
related: [.ai/specs/2026-11-18-restaurant-picks.md]
---

# Smoke: sprawdzenia A27, tras wyborów, A32, ukrycia dania (A3) i pola restaurantPick

## Zadanie
Dopisać do `scripts/smoke.mjs` sprawdzenia ekranów i tras, które już są na `main`, bez nowych zapisów w danych demo i bez sprawdzeń raportu wyników (A33/A34, `proof-report`, `proof-launch`: osobny PR po scaleniu).

## Przebieg
- Gałąź `feat/smoke-new-screens` z `origin/main` (03d3f55), osobny worktree.
- Napisy i role z `packages/app/src/i18n/en.ts` oraz z testów e2e (`picks-panel`, `catalog-create`, `catalog-visibility`).
- Nowa sekcja w `smoke.mjs` przed sekcją importu: wszystko korzysta z już zalogowanych sesji `marta` (Wine Director) i `tomasz` (GM).
- Dodane sprawdzenia: A27 (GM 200 z tytułem i bez trybu podglądu; Wine Director 200 z „View only” i komunikatem roli; bez sesji 307 do logowania z `next`); `GET …/picks` (GM 200, kształt i ETag, bez sesji 401); `PUT /wines/{id}/pick` bez sesji 401 i z sesją bez CSRF 403 oraz stan zbioru po odmowie; A32 `/menu/new` i `/wines/new` (200 dla obu kont z formularzem „Add dish” / „Add wine”, bez sesji 307); A3 przycisk „Hide from guests” dla obu kont; `GET …/dishes/{id}/visibility` (200, ETag, bez sesji 401), `POST` bez CSRF 403 i danie nadal w publicznym menu; `restaurantPick` typu boolean w każdej pozycji rekomendacji (id dania z publicznego API menu).
- Brak zapisów: żaden pick nie jest ustawiany, żadne danie nie jest ukrywane ani tworzone.
- Zaktualizowano wiersz `smoke` w `.ai/docs/commands.md`. Testy skryptu (`packages/testkit/tests/smoke-script.test.ts`) dotyczą trybu `--production` i nie wymagały zmian.

## Weryfikacja
- `npx -y npm@11.6.2 ci --engine-strict=false`: bez zmian w `package-lock.json`.
- `npm run lint`: czysto. `npm run typecheck`: czysto. `npm run build`: pierwszy przebieg padł na komunikacie narzędzia o podatności (`next upgrade`, nie wykonane, zgodnie z lekcją), drugi przebieg zielony.
- Aplikacja: `DATA_SOURCE=memory ALLOW_DEMO_DATA=true AUTH_COOKIE_SECURE=false ALLOW_LOCAL_BASE_URL=true next start -p 3217`; `node scripts/smoke.mjs http://localhost:3217 halka`: kod 0, „All smoke checks passed”, wszystkie nowe sprawdzenia `ok`.
- Mutacja: oczekiwany napis przycisku zmieniony na „Hide from everyone”: kod 1, `FAIL 200 A3 shows "Hide from guests"…` / `missing "Hide from everyone"`; plik przywrócony (porównanie bajtowe).
- `npm test -w @wine-match/testkit`: 686 przeszło, 1 pominięty. Serwer zatrzymany.

## Wynik
Działa w trybie `memory`. Nie sprawdzone: tryb `DATA_SOURCE=postgres` (brak bazy w tej sesji), pełny `npm test` monorepo, `test:db`.

## Lekcje
brak
