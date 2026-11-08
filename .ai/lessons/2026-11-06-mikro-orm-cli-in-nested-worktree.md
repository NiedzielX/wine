---
date: 2026-11-06
area: tooling
status: active
source: .ai/runs/2026-11-06-e22-f2-demo-guide-and-read-only.md
---

# W worktree pod `.claude/worktrees/` CLI MikroORM bierze pakiety z `node_modules` głównego checkoutu

## Kontekst
`npm run migration:up -w @wine-match/db` (także w globalnym setupie `npm run test:e2e`) w świeżym worktree po `npm ci` pada: `Bad @mikro-orm/migrations version 7.2.2. All official @mikro-orm/* packages need to have the exact same version as @mikro-orm/core (7.2.5)`.

## Przyczyna
Lockfile umieszcza `@mikro-orm/migrations`, `postgresql`, `seeder` i `sql` w `packages/db/node_modules`, a w korzeniu tylko `core` i `cli`. CLI szuka `migrations` od siebie w górę drzewa; w worktree zagnieżdżonym w głównym checkoucie (`wine/.claude/worktrees/<nazwa>/`) nie znajduje go w korzeniu worktree i trafia do `wine/node_modules`, gdzie leży starsza wersja (7.2.2). Pliki w repozytorium są poprawne (wszędzie 7.2.5).

## Reguła
W worktree pod `.claude/worktrees/` przed `migration:up`, `seed` i `test:e2e` dowiąż pakiety z `packages/db/node_modules/@mikro-orm/{migrations,postgresql,seeder,sql}` symlinkami do korzeniowego `node_modules/@mikro-orm/` (katalog jest poza gitem). Nie zmieniaj wersji w `package.json` ani lockfile: to nie błąd repozytorium.

## Jak sprawdzić
`ls -la node_modules/@mikro-orm` pokazuje cztery symlinki; `npm run migration:up -w @wine-match/db` kończy się „Successfully migrated up to the latest version”.
