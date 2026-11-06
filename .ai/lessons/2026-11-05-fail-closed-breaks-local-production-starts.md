---
date: 2026-11-05
updated:
area: tooling
status: active
source: .ai/runs/2026-11-04-e11-f1-production-readiness.md
promoted:
---

# Zaostrzenie reguły „produkcja zawodzi zamykająco” psuje wszystko, co lokalnie startuje `NODE_ENV=production`

## Kontekst
E11 R4: produkcja bez publicznego `https://` w `PUBLIC_BASE_URL` nie startuje (kod 1), wyjątek tylko `ALLOW_LOCAL_BASE_URL=true`.

## Co odkryto
Zbudowaną aplikację w trybie produkcyjnym uruchamiają nie tylko operatorzy: `packages/app/tests/e2e/global-setup.ts`, `scripts/boot-check.mjs` (przypadki demo i „baza leży”), `.ai/scripts/test-env-up.sh`, testy startu (`gaps.test.ts`), a lokalnie `npm run build && npm start` z `.env`, w którym leży `PUBLIC_BASE_URL=http://localhost:3000`. Każde z nich po zaostrzeniu przestaje startować. CI nie uruchamia produkcji gdzie indziej (`ci.yml` woła `boot:check` i e2e).

## Reguła
Wprowadzając regułę, która zatrzymuje start w produkcji, najpierw `grep -rn "NODE_ENV: 'production'\|NODE_ENV=production\|next start\|npm start"` po repozytorium (skrypty, testy, `.ai/scripts`) i w tym samym PR-ze dopisz jawny wyjątek (`ALLOW_LOCAL_BASE_URL=true`) wszędzie, gdzie produkcja jest lokalna; opisz zmianę łamiącą w README i BC §4. Test startu uruchamia `checkStartup()` na świeżym grafie modułów (`vi.resetModules` + podmiana `process.exit`), a nie sam `parseEnv`, bo dopiero to dowodzi, że proces się zatrzyma.

## Jak sprawdzić
`npm run boot:check` (przypadki z `PUBLIC_BASE_URL`) i `packages/app/tests/unit/gaps.test.ts`, blok „start-up checks”.
